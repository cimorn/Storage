// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { PNG } = require('pngjs');
const crc = require('pngjs/lib/crc');
const compress = input => require('../../server/image-transform').compressImage(input);

function pixels(width = 320, height = 200) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = x % 256; data[i + 1] = y % 256; data[i + 2] = (x * y) % 256; data[i + 3] = x % 2 ? 255 : 90;
  }
  return { width, height, data };
}
function bmp(width = 8, height = 4, topDown = false) {
  const stride = Math.ceil(width * 3 / 4) * 4, bytes = Buffer.alloc(54 + stride * height);
  bytes.write('BM'); bytes.writeUInt32LE(bytes.length, 2); bytes.writeUInt32LE(54, 10); bytes.writeUInt32LE(40, 14);
  bytes.writeInt32LE(width, 18); bytes.writeInt32LE(topDown ? -height : height, 22);
  bytes.writeUInt16LE(1, 26); bytes.writeUInt16LE(24, 28); bytes.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = 54 + y * stride + x * 3;
    bytes[offset] = 0; bytes[offset + 1] = 0; bytes[offset + 2] = 255;
  }
  return bytes;
}
function oriented(bytes, orientation) {
  const exif = Buffer.from('45786966000049492a0008000000010012010300010000000100000000000000', 'hex');
  exif.writeUInt16LE(orientation, 24);
  const header = Buffer.alloc(4); header.writeUInt16BE(0xffe1); header.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([bytes.subarray(0, 2), header, exif, bytes.subarray(2)]);
}

describe('stored image WebP compression', () => {
  it.each(['png', 'jpeg', 'webp'])('decodes real %s, emits WebP and preserves dimensions and alpha', async format => {
    const fixture = pixels();
    const bytes = await sharp(fixture.data, { raw: { width: fixture.width, height: fixture.height, channels: 4 } })[format]().toBuffer();
    const result = await compress({ bytes, mime: `image/${format}` });
    expect(result.mime).toBe('image/webp');
    expect(result.bytes.subarray(8, 12).toString()).toBe('WEBP');
    const metadata = await sharp(result.bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([320, 200]);
    expect(metadata.hasAlpha).toBe(format !== 'jpeg');
    if (format === 'png') expect(result.bytes.length).toBeLessThan(bytes.length / 2);
  });
  it.each([false, true])('supports bounded 24-bit BMP, topDown=%s', async topDown => {
    const result = await compress({ bytes: bmp(8, 4, topDown), mime: 'image/bmp' });
    const { data, info } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([8, 4]);
    expect(data[0]).toBeGreaterThan(240); expect(data[1]).toBeLessThan(10); expect(data[2]).toBeLessThan(10);
  });
  it.each([1, 4, 8, 16, 32])('decodes a real %s-bit BMP palette or bitfield safely', async depth => {
    const indexed = depth <= 8, paletteSize = indexed ? (1 << depth) * 4 : 0, masksSize = depth === 16 ? 12 : 0;
    const offset = 54 + paletteSize + masksSize, stride = Math.ceil(4 * depth / 32) * 4, bytes = Buffer.alloc(offset + stride * 2);
    bytes.write('BM'); bytes.writeUInt32LE(bytes.length, 2); bytes.writeUInt32LE(offset, 10); bytes.writeUInt32LE(40, 14);
    bytes.writeInt32LE(4, 18); bytes.writeInt32LE(2, 22); bytes.writeUInt16LE(1, 26); bytes.writeUInt16LE(depth, 28);
    if (indexed) bytes[60] = 255;
    if (depth === 16) { bytes.writeUInt32LE(3, 30); bytes.writeUInt32LE(0xf800, 54); bytes.writeUInt32LE(0x07e0, 58); bytes.writeUInt32LE(0x001f, 62); }
    for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) {
      const row = offset + y * stride;
      if (indexed) bytes[row + Math.floor(x * depth / 8)] |= 1 << (8 - depth - (x * depth % 8));
      else if (depth === 16) bytes.writeUInt16LE(0xf800, row + x * 2);
      else { bytes[row + x * 4 + 2] = 255; bytes[row + x * 4 + 3] = 128; }
    }
    const result = await compress({ bytes, mime: 'image/bmp' });
    const decoded = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([decoded.info.width, decoded.info.height]).toEqual([4, 2]);
    expect(decoded.data[0]).toBeGreaterThan(240); expect(decoded.data[1]).toBeLessThan(10); expect(decoded.data[2]).toBeLessThan(10);
    expect(decoded.data[3]).toBe(depth === 32 ? 128 : 255);
  });
  it('orients EXIF before fitting inside 1920, strips metadata and never enlarges', async () => {
    const bytes = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const result = await compress({ bytes: oriented(bytes, 6), mime: 'image/jpeg' });
    const metadata = await sharp(result.bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([960, 1920]);
    expect(metadata.exif).toBeUndefined(); expect(metadata.orientation).toBeUndefined(); expect(metadata.icc).toBeUndefined();
    const small = await compress({ bytes: bmp(), mime: 'image/bmp' });
    expect((await sharp(small.bytes).metadata()).width).toBe(8);
    expect(require('../../server/image-transform').IMAGE_OPTIMIZATION_VERSION).toBe('webp-v1-1920-q82');
  });
  it('preserves GIF and WebP animation frames, timing and loop count', async () => {
    const data = Buffer.alloc(8 * 16 * 4);
    for (let i = 0; i < data.length; i += 4) { data[i + (i < data.length / 2 ? 0 : 2)] = 255; data[i + 3] = 255; }
    const gif = await sharp(data, { raw: { width: 8, height: 16, channels: 4, pageHeight: 8 } }).gif({ delay: [80, 120], loop: 2 }).toBuffer();
    for (const input of [{ bytes: gif, mime: 'image/gif' }, await compress({ bytes: gif, mime: 'image/gif' })]) {
      const result = await compress(input), metadata = await sharp(result.bytes, { animated: true }).metadata();
      expect(metadata.pages).toBe(2); expect(metadata.pageHeight).toBe(8);
      expect(metadata.delay).toEqual([80, 120]); expect(metadata.loop).toBe(2);
    }
  });
  it.each([
    { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), mime: 'image/svg+xml' },
    { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), mime: 'image/png' },
    { bytes: Buffer.from('not a jpeg'), mime: 'image/jpeg' },
    { bytes: Buffer.from('GIF89a123456789'), mime: 'image/gif' },
    { bytes: Buffer.alloc(20 * 1024 * 1024 + 1), mime: 'image/png' }
  ])('rejects invalid or unsupported bytes without pretending they are optimized', async input => {
    await expect(compress(input)).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
  });
  it('rejects dimension bombs before decoding pixel data', async () => {
    const bytes = PNG.sync.write(pixels(1, 1));
    bytes.writeUInt32BE(100000, 16); bytes.writeUInt32BE(100000, 20);
    bytes.writeInt32BE(crc.crc32(bytes.subarray(12, 29)), 29);
    await expect(compress({ bytes, mime: 'image/png' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const bitmap = bmp(); bitmap.writeInt32LE(100000, 18); bitmap.writeInt32LE(100000, 22);
    await expect(compress({ bytes: bitmap, mime: 'image/bmp' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('rejects animated PNG explicitly instead of flattening its animation', async () => {
    const still = PNG.sync.write(pixels(2, 2)), animation = Buffer.alloc(20);
    animation.writeUInt32BE(8); animation.write('acTL', 4); animation.writeUInt32BE(2, 8);
    animation.writeInt32BE(crc.crc32(animation.subarray(4, 16)), 16);
    const bytes = Buffer.concat([still.subarray(0, 33), animation, still.subarray(33)]);
    await expect(compress({ bytes, mime: 'image/png' })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringMatching(/animated PNG/i) });
  });
  it('rejects excessive frame counts instead of flattening animation', async () => {
    const data = Buffer.alloc(4 * 101 * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = (i / 16) % 256; data[i + 3] = 255; }
    const bytes = await sharp(data, { raw: { width: 4, height: 101, channels: 4, pageHeight: 1 } }).gif({ keepDuplicateFrames: true, delay: 80 }).toBuffer();
    await expect(compress({ bytes, mime: 'image/gif' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('bounds concurrent image work and queued uploads, then recovers all slots', async () => {
    const bytes = PNG.sync.write(pixels(500, 400));
    const results = await Promise.allSettled(Array.from({ length: 14 }, () => compress({ bytes, mime: 'image/png' })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(10);
    const rejected = results.filter(result => result.status === 'rejected');
    expect(rejected).toHaveLength(4);
    for (const result of rejected) expect(result.reason).toMatchObject({ code: 'IMAGE_BUSY', status: 503 });
    expect((await compress({ bytes, mime: 'image/png' })).mime).toBe('image/webp');
  });
});
