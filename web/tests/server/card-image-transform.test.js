// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const sharp = require('sharp');
const crc = require('pngjs/lib/crc');
const { transformCardImage } = require('../../server/card-image-transform');
const small = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([255, 0, 0, 255]) });
const body = PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16, 255) });
function chunk(type, data) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length); bytes.write(type, 4); data.copy(bytes, 8);
  bytes.writeInt32BE(crc.crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4);
  return bytes;
}
function duplicate(interlaced = false) {
  const bytes = Buffer.concat([small.subarray(0, 33), body.subarray(8)]);
  if (interlaced) {
    bytes[53] = 1;
    bytes.writeInt32BE(crc.crc32(bytes.subarray(37, 54)), 54);
  }
  return bytes;
}
describe('PNG admission before bounded decoding', () => {
  it('reproduces pngjs accepting a second IHDR that overrides dimensions', () => {
    const decoded = PNG.sync.read(duplicate());
    expect([decoded.width, decoded.height]).toEqual([2, 2]);
  });
  it.each([
    ['duplicate dimensions', () => duplicate()],
    ['duplicate interlace', () => duplicate(true)],
    ['long IHDR', () => Buffer.concat([small.subarray(0, 8), chunk('IHDR', Buffer.concat([small.subarray(16, 29), Buffer.from([0])])), small.subarray(33)])],
    ['short IHDR', () => Buffer.concat([small.subarray(0, 8), chunk('IHDR', small.subarray(16, 28)), small.subarray(33)])],
    ['out-of-bounds chunk length', () => { const bytes = Buffer.from(small); bytes.writeUInt32BE(0xffffffff, 33); return bytes; }],
    ['truncated chunk', () => small.subarray(0, small.length - 1)],
    ['missing IEND', () => small.subarray(0, small.length - 12)],
    ['trailing chunks after IEND', () => Buffer.concat([small, chunk('IEND', Buffer.alloc(0))])],
    ['oversized palette metadata', () => Buffer.concat([small.subarray(0, 33), chunk('PLTE', Buffer.alloc(771)), small.subarray(33)])],
    ['invalid chunk type bytes', () => Buffer.concat([small.subarray(0, 33), chunk('\u00e1BCD', Buffer.alloc(0)), small.subarray(33)])]
  ])('rejects %s and returns the exact original', async (name, create) => {
    const bytes = create();
    const result = await transformCardImage({ bytes, mime: 'image/png' });
    expect(result.mime).toBe('image/png');
    expect(result.bytes.equals(bytes)).toBe(true);
  });
  it('keeps valid PNGs eligible without returning more bytes', async () => {
    const result = await transformCardImage({ bytes: body, mime: 'image/png' });
    expect(result.bytes.length).toBeLessThanOrEqual(body.length);
    expect((await sharp(result.bytes).metadata()).width).toBe(2);
  });
  it('accepts valid ancillary metadata and consecutive IDAT chunks', async () => {
    const length = body.readUInt32BE(33), compressed = body.subarray(41, 41 + length);
    const bytes = Buffer.concat([
      body.subarray(0, 33), chunk('tEXt', Buffer.from('Author\0Fixture')),
      chunk('IDAT', compressed.subarray(0, 4)), chunk('IDAT', compressed.subarray(4)), body.subarray(45 + length)
    ]);
    const result = await transformCardImage({ bytes, mime: 'image/png' });
    const metadata = await sharp(result.bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([2, 2]);
  });
  it.each(['png', 'jpeg', 'webp'])('creates a smaller 384px WebP card from real %s', async format => {
    const pixels = Buffer.alloc(800 * 400 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = i % 255; pixels[i + 1] = Math.floor(i / 3200) % 255; pixels[i + 2] = (i * 3) % 255; pixels[i + 3] = 180;
    }
    const bytes = await sharp(pixels, { raw: { width: 800, height: 400, channels: 4 } })[format]().toBuffer();
    const result = await transformCardImage({ bytes, mime: `image/${format}` });
    expect(result.mime).toBe('image/webp'); expect(result.bytes.length).toBeLessThan(bytes.length);
    const metadata = await sharp(result.bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([384, 192]);
    expect(metadata.hasAlpha).toBe(format !== 'jpeg');
  });
});
