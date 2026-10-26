'use strict';
const sharp = require('sharp');

const IMAGE_OPTIMIZATION_VERSION = 'webp-v1-1920-q82';
const MAX_IMAGE_PIXELS = 40 * 1000 * 1000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_FRAMES = 100;
const MIME_FORMATS = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' };
// Limit native allocation retention and work per image. Upload jobs also have
// a bounded admission queue; card jobs run in their existing two-worker pool.
sharp.cache(false);
sharp.concurrency(1);
const invalid = (message = 'Image data is invalid or exceeds the supported image limits') => Object.assign(new Error(message), { code: 'BAD_REQUEST', status: 400 });

function sniff(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 13 && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  if (bytes.length >= 26 && bytes.toString('ascii', 0, 2) === 'BM') return 'bmp';
  return null;
}

// Check the complete PNG chunk stream before handing it to the decoder. This
// disallows duplicate headers, oversized chunks and data after the terminator.
function validatePng(bytes, maxPixels) {
  let offset = 8, chunks = 0, header = false, data = false, dataEnded = false;
  while (offset < bytes.length && ++chunks <= 4096) {
    if (bytes.length - offset < 12) throw invalid();
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (length > 0x7fffffff || end > bytes.length) throw invalid();
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type) || (!header && type !== 'IHDR')) throw invalid();
    if (type === 'IHDR') {
      if (header || offset !== 8 || length !== 13) throw invalid();
      const width = bytes.readUInt32BE(offset + 8), height = bytes.readUInt32BE(offset + 12);
      if (!width || !height || width * height > maxPixels) throw invalid();
      header = true;
    } else if (type === 'acTL') throw invalid('Animated PNG images are not supported');
    else if (type === 'PLTE' && (!length || length > 768 || length % 3 || data)) throw invalid();
    else if (type === 'IDAT') { if (dataEnded) throw invalid(); data = true; }
    else if (type === 'IEND') { if (!data || length !== 0 || end !== bytes.length) throw invalid(); return; }
    if (data && type !== 'IDAT') dataEnded = true;
    offset = end;
  }
  throw invalid();
}

// libvips does not provide a BMP loader. Decode the bounded, common Windows
// BI_RGB / BI_BITFIELDS variants here, including indexed palettes and top-down
// rows. Unsupported encodings fail explicitly instead of keeping unoptimized
// bytes or silently discarding content.
function decodeBmp(bytes, maxPixels) {
  const dibSize = bytes.readUInt32LE(14), core = dibSize === 12;
  if ((!core && dibSize < 40) || dibSize > bytes.length - 14) throw invalid('Unsupported BMP encoding');
  const pixelOffset = bytes.readUInt32LE(10), headerEnd = 14 + dibSize;
  const width = core ? bytes.readUInt16LE(18) : bytes.readInt32LE(18);
  const signedHeight = core ? bytes.readUInt16LE(20) : bytes.readInt32LE(22), height = Math.abs(signedHeight);
  const planes = bytes.readUInt16LE(core ? 22 : 26), depth = bytes.readUInt16LE(core ? 24 : 28);
  const compression = core ? 0 : bytes.readUInt32LE(30);
  if (width <= 0 || !height || width * height > maxPixels || planes !== 1 || ![1, 4, 8, 16, 24, 32].includes(depth) || ![0, 3, 6].includes(compression) || (compression && ![16, 32].includes(depth))) throw invalid('Unsupported BMP encoding or image dimensions');
  const stride = Math.ceil(width * depth / 32) * 4;
  if (pixelOffset < headerEnd || pixelOffset + stride * height > bytes.length) throw invalid();
  let palette, masks, tableOffset = headerEnd;
  if (compression) {
    const count = compression === 6 ? 4 : 3, maskOffset = dibSize >= 52 ? 54 : headerEnd;
    if (maskOffset + count * 4 > pixelOffset) throw invalid();
    masks = Array.from({ length: count }, (_, i) => bytes.readUInt32LE(maskOffset + i * 4));
    if (dibSize >= 56 && count === 3) masks.push(bytes.readUInt32LE(66));
    if (dibSize === 40) tableOffset += count * 4;
  } else if (depth === 16) masks = [0x7c00, 0x03e0, 0x001f];
  if (masks) {
    let used = 0;
    masks = masks.map((mask, index) => {
      if (!mask && index === 3) return null;
      if (!mask || ((used & mask) >>> 0) !== 0 || (depth === 16 && mask > 0xffff)) throw invalid();
      used = (used | mask) >>> 0;
      let shift = 0; while (((mask >>> shift) & 1) === 0) shift++;
      const max = mask >>> shift;
      if ((max & (max + 1)) !== 0) throw invalid();
      return { mask, shift, max };
    });
  }
  if (depth <= 8) {
    const count = core ? 1 << depth : bytes.readUInt32LE(46) || 1 << depth, entrySize = core ? 3 : 4;
    if (count > 1 << depth || tableOffset + count * entrySize > pixelOffset) throw invalid();
    palette = Array.from({ length: count }, (_, i) => {
      const offset = tableOffset + i * entrySize; return [bytes[offset + 2], bytes[offset + 1], bytes[offset], 255];
    });
  }
  let useAlpha = false;
  if (depth === 32 && !compression) {
    for (let y = 0; y < height && !useAlpha; y++) for (let x = 0; x < width; x++) if (bytes[pixelOffset + y * stride + x * 4 + 3]) { useAlpha = true; break; }
  }
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = pixelOffset + (signedHeight < 0 ? y : height - 1 - y) * stride, target = (y * width + x) * 4;
    if (palette) {
      const value = bytes[row + Math.floor(x * depth / 8)], index = (value >>> (8 - depth - (x * depth % 8))) & ((1 << depth) - 1);
      if (!palette[index]) throw invalid();
      data.set(palette[index], target);
    } else if (masks) {
      const value = depth === 16 ? bytes.readUInt16LE(row + x * 2) : bytes.readUInt32LE(row + x * 4);
      for (let c = 0; c < 4; c++) { const mask = masks[c]; data[target + c] = mask ? Math.round(((value & mask.mask) >>> mask.shift) * 255 / mask.max) : 255; }
    } else {
      const source = row + x * (depth / 8);
      data[target] = bytes[source + 2]; data[target + 1] = bytes[source + 1]; data[target + 2] = bytes[source]; data[target + 3] = useAlpha ? bytes[source + 3] : 255;
    }
  }
  return { data, raw: { width, height, channels: 4 } };
}

async function createWebpImage(input, { longEdge = 1920, quality = 82, maxPixels = MAX_IMAGE_PIXELS } = {}) {
  try {
    if (!(input?.bytes instanceof Uint8Array) || !MIME_FORMATS[input.mime] || !input.bytes.length || input.bytes.length > MAX_IMAGE_BYTES) throw invalid();
    const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);
    const format = sniff(bytes);
    if (!format || format !== MIME_FORMATS[input.mime]) throw invalid();
    if (format === 'png') validatePng(bytes, maxPixels);
    const options = { failOn: 'warning', limitInputPixels: maxPixels, limitInputChannels: 4, sequentialRead: true, animated: true };
    const bitmap = format === 'bmp' ? decodeBmp(bytes, maxPixels) : null;
    const image = bitmap ? sharp(bitmap.data, { ...options, raw: bitmap.raw }) : sharp(bytes, options);
    const metadata = await image.metadata();
    const frames = metadata.pages || 1, frameHeight = metadata.pageHeight || metadata.height;
    if (!metadata.width || !frameHeight || frames > MAX_FRAMES || metadata.width * frameHeight * frames > maxPixels || (!bitmap && metadata.format !== format)) throw invalid();
    const result = await image.autoOrient().resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
      .timeout({ seconds: 15 }).webp({ quality, alphaQuality: 90, effort: 4 }).toBuffer();
    return { bytes: result, mime: 'image/webp' };
  } catch (error) {
    if (error?.code === 'BAD_REQUEST') throw error;
    throw invalid();
  }
}

let active = 0;
const queue = [];
async function compressImage(input) {
  if (active >= 2) {
    if (queue.length >= 8) throw Object.assign(new Error('Image processor is busy; retry shortly'), { code: 'IMAGE_BUSY', status: 503 });
    await new Promise(resolve => queue.push(resolve));
  } else active++;
  try { return await createWebpImage(input); }
  finally { const next = queue.shift(); if (next) next(); else active--; }
}

module.exports = { compressImage, createWebpImage, IMAGE_OPTIMIZATION_VERSION, MAX_IMAGE_PIXELS };
