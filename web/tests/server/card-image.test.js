// @vitest-environment node
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const sharp = require('sharp');
const { createInventoryService } = require('../../server/inventory-service');
const { createMemoryRepository } = require('../../server/repository');
const { createMemoryObjectStore } = require('../../server/oss-store');
const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); vi.restoreAllMocks(); });
function pixels(width = 800, height = 400, alpha = false) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = x % 256; data[i + 1] = y % 256; data[i + 2] = (x * y) % 256; data[i + 3] = alpha ? 0 : 255;
  }
  return { width, height, data };
}
function oriented(bytes, orientation) {
  const exif = Buffer.from('45786966000049492a0008000000010012010300010000000100000000000000', 'hex');
  exif.writeUInt16LE(orientation, 24);
  const header = Buffer.alloc(4); header.writeUInt16BE(0xffe1); header.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([bytes.subarray(0, 2), header, exif, bytes.subarray(2)]);
}
async function fixture(bytes, mime = 'image/jpeg', options = {}) {
  const objects = createMemoryObjectStore(), repository = createMemoryRepository();
  const service = createInventoryService({ objects, repository, encryptionKey: randomBytes(32), ...options });
  cleanup.push(() => service.close?.());
  await service.importProject({ meta: {}, categories: [], locations: [], items: [{ id: 'photo', name: '照片', tags: [], imagePath: 'old' }] }, { includePrivate: true, images: { old: { bytes, mime } } });
  const project = await service.getProject({ includePrivate: true });
  const id = project.items[0].imagePath, stored = await service.readImage(id);
  return { service, objects, repository, id, project, stored };
}
describe('gallery card image variants', () => {
  it.each(['expired-staging', 'pending-cleanup'].flatMap(recovery => ['card', 'original'].map(variant => ({ recovery, variant }))))('keeps image GET side effect free with %j and leaves cleanup to retryPending', async ({ recovery, variant }) => {
    const bytes = jpeg.encode(pixels(20, 10), 95).data;
    const { service, id, repository, objects, stored } = await fixture(bytes);
    await service.uploadImage({ bytes, mime: 'image/jpeg' });
    const orphanKey = objects.keys().find(key => key.includes('/.staging/'));
    expect(orphanKey).toBeTruthy();
    const later = Date.now() + 25 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    if (recovery === 'pending-cleanup') {
      const failedDelete = vi.spyOn(objects, 'delete').mockRejectedValueOnce(new Error('cleanup temporarily unavailable'));
      expect(await service.retryPending()).toMatchObject({ cleanupPending: true });
      failedDelete.mockRestore();
    }
    const before = await repository.read();
    const beforeObjects = await Promise.all(objects.keys().map(async key => [key, await objects.get(key)]));
    const writes = vi.spyOn(repository, 'compareAndSwap');
    const mutations = ['put', 'copy', 'delete'].map(method => vi.spyOn(objects, method));
    const options = variant === 'card' ? { variant: 'card' } : {};
    await service.readImage(id, options);
    await service.readImage(id, options);
    expect(writes).not.toHaveBeenCalled();
    for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
    expect(await repository.read()).toEqual(before);
    expect(await Promise.all(objects.keys().map(async key => [key, await objects.get(key)]))).toEqual(beforeObjects);
    await service.retryPending();
    expect(objects.keys()).not.toContain(orphanKey);
    expect((await repository.read()).revision).toBeGreaterThan(before.revision);
    expect(await service.readImage(id)).toEqual(stored);
  });
  it('resizes stored WebP in a worker after JPEG orientation and preserves stored and backup bytes', async () => {
    const original = oriented(jpeg.encode(pixels(), 95).data, 6);
    const { service, id, project, stored } = await fixture(original);
    const card = await service.readImage(id, { variant: 'card' });
    const decoded = await sharp(card.bytes).metadata();
    expect([decoded.width, decoded.height]).toEqual([192, 384]);
    expect(card.mime).toBe('image/webp'); expect(card.bytes.length).toBeLessThan(stored.bytes.length);
    expect(await service.readImage(id)).toEqual(stored);
    expect((await service.backup()).images[id].bytes).toEqual(stored.bytes);
    expect((await service.getProject({ includePrivate: true })).revision).toBe(project.revision);
  }, 15000);
  it('preserves PNG transparency without enlarging or returning more bytes', async () => {
    const original = PNG.sync.write(pixels(500, 400, true));
    const { service, id, stored } = await fixture(original, 'image/png');
    const card = await service.readImage(id, { variant: 'card' });
    const decoded = await sharp(card.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([decoded.info.width, decoded.info.height]).toEqual([384, 307]);
    expect(decoded.data[3]).toBe(0);
    expect(card.bytes.length).toBeLessThan(stored.bytes.length);
    const small = jpeg.encode(pixels(20, 10), 95).data;
    const other = await fixture(small);
    const result = await other.service.readImage(other.id, { variant: 'card' });
    expect((await sharp(result.bytes).metadata()).width).toBe(20); expect(result.bytes.length).toBeLessThanOrEqual(other.stored.bytes.length);
  });
  it.each(['malformed', 'oversized', 'unsupported'])('rejects %s uploads before making a card', async (kind) => {
    const bytes = kind === 'unsupported' ? Buffer.from('GIF89a123456789') : kind === 'malformed' ? Buffer.from([255,216,255,0,255,217]) : PNG.sync.write(pixels(1, 1));
    if (kind === 'oversized') bytes.writeUInt32BE(100000, 16);
    const mime = kind === 'unsupported' ? 'image/gif' : kind === 'malformed' ? 'image/jpeg' : 'image/png';
    await expect(fixture(bytes, mime)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });
  it('deduplicates and expires variants independently of the original cache', async () => {
    let time = 0;
    const transform = vi.fn(async () => ({ bytes: Buffer.from('preview'), mime: 'image/jpeg' }));
    const { service, id } = await fixture(jpeg.encode(pixels(), 95).data, 'image/jpeg', { cardImageOptions: { transform, cache: { now: () => time, ttlMs: 100, maxEntries: 1, maxBytes: 1024 } } });
    expect((await Promise.all([service.readImage(id, { variant: 'card' }), service.readImage(id, { variant: 'card' })])).map(x => x.bytes.toString())).toEqual(['preview','preview']);
    await service.readImage(id, { variant: 'card' }); expect(transform).toHaveBeenCalledTimes(1);
    time = 101; await service.readImage(id, { variant: 'card' }); expect(transform).toHaveBeenCalledTimes(2);
  });
  it.each([{ maxBytes: 1 }, { maxEntries: 1 }])('bounds the separate variant cache with %j', async (cache) => {
    const bytes = jpeg.encode(pixels(), 95).data;
    const transform = vi.fn(async () => ({ bytes: Buffer.from('preview'), mime: 'image/jpeg' }));
    const { service, id, project } = await fixture(bytes, 'image/jpeg', { cardImageOptions: { transform, cache } });
    const uploaded = await service.uploadImage({ bytes, mime: 'image/jpeg' });
    project.items.push({ id: 'second', name: '二', imagePath: uploaded.imageId, tags: [] });
    await service.saveProject(project, { includePrivate: true });
    await service.readImage(id, { variant: 'card' });
    await service.readImage(uploaded.imageId, { variant: 'card' });
    await service.readImage(id, { variant: 'card' });
    expect(transform).toHaveBeenCalledTimes(3);
  });
  it.each(['delete', 'private', 'move'])('rechecks visibility and immutable generation after delayed card transform during %s', async (change) => {
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const pending = new Promise(resolve => { started = resolve; });
    const transform = vi.fn(async () => { started(); await gate; return { bytes: Buffer.from('preview'), mime: 'image/jpeg' }; });
    const { service, id, project } = await fixture(jpeg.encode(pixels(), 95).data, 'image/jpeg', { cardImageOptions: { transform } });
    const reading = service.readImage(id, { variant: 'card' }).catch(error => error);
    await pending;
    if (change === 'delete') project.items = [];
    if (change === 'private') project.items[0].isPrivate = true;
    if (change === 'move') { project.categories = [{ id: 'new', name: '新分类', level: 1, parentId: null }]; project.items[0].categoryId = 'new'; }
    await service.saveProject(project, { includePrivate: true }); release();
    expect(await reading).toMatchObject({ code: 'NOT_FOUND' });
    if (change === 'private') await expect(service.readImage(id, { variant: 'card' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
