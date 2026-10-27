// @vitest-environment node
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const variants = require('../../shared/item-variants.mjs');
const { validateProject } = require('../../server/project-validation');
const { applyItemTimestamps } = require('../../server/item-timestamps');
const { createInventoryService } = require('../../server/inventory-service');
const { createMemoryRepository } = require('../../server/repository');
const { createMemoryObjectStore } = require('../../server/oss-store');
const { PNG } = require('pngjs');
const A = 'img_11111111-1111-4111-8111-111111111111';
const B = 'img_22222222-2222-4222-8222-222222222222';
const row = (overrides = {}) => ({ color: '白色', size: 'S', isPackaged: false, ...overrides });
const item = (overrides = {}) => ({ id: 'shirt', name: 'T恤', imagePath: A, imagePaths: [A, B], variants: [row({ quantity: 3, imageId: A }), row({ color: '红色', quantity: '', imageId: B })], ...overrides });
const project = entry => ({ meta: {}, categories: [], locations: [], items: [entry] });
const services = [];
function service() { const value = createInventoryService({ repository: createMemoryRepository(), objects: createMemoryObjectStore(), encryptionKey: randomBytes(32) }); services.push(value); return value; }
afterEach(async () => { await Promise.all(services.splice(0).map(value => value.close())); });

describe('per-variant quantities and exclusive photo bindings', () => {
  it('sums per-row quantities and treats a blank or omitted quantity as one', () => {
    const entry = item();
    expect(variants.getItemQuantity(entry)).toBe('4');
    expect(variants.getItemVariants(entry)).toMatchObject([{ quantity: 3, imageId: A }, { quantity: 1, imageId: B }]);
    expect(variants.getItemQuantity({ variants: [row(), row({ quantity: '  ' })] })).toBe('2');
    expect(variants.withVariantSummary(entry).quantity).toBe('4');
  });
  it.each([0, -1, 1.5, '1.5', '2件', NaN, Infinity, true, null, 1000001])('rejects an invalid per-row quantity %j', quantity => {
    expect(() => variants.normalizeVariantRows([row({ quantity })])).toThrow();
  });
  it('does not allow the same image to belong to two specifications', () => {
    expect(() => variants.normalizeVariantRows([row({ imageId: A }), row({ size: 'M', imageId: A })])).toThrow();
  });
  it('automatically pairs a historical single image and single specification', () => {
    expect(variants.getItemVariants({ imagePath: A, variants: [row()] })[0].imageId).toBe(A);
    expect(variants.getItemVariants({ imagePath: A, variants: [row({ imageId: '' })] })[0].imageId).toBe('');
    expect(variants.getItemVariants({ imagePaths: [A, B], variants: [row()] })[0].imageId).toBeUndefined();
  });
  it('also pairs an older single-image item before it has structured variants', () => {
    expect(variants.getItemVariants({ imagePath: A, notes: '白色 S', quantity: '1' })[0].imageId).toBe(A);
  });
  it('initializes old equal-length photo/specification lists by the user-approved order', () => {
    const historical = item({ variants: [row(), row({ color: '红色' })] });
    expect(variants.getItemVariants(historical).map(value => value.imageId)).toEqual([A, B]);
    const linked = { ...historical, variants: [row({ quantity: 1, imageId: A }), row({ color: '红色', quantity: 1, imageId: B })] };
    historical.updatedAt = '2020-01-01';
    expect(applyItemTimestamps(project(historical), project(linked)).items[0].updatedAt).toBe('2020-01-01');
    expect(variants.getItemVariants({ ...historical, variants: [row({ imageId: '' }), row()] }).map(value => value.imageId)).toEqual(['', undefined]);
  });
  it('validates bindings against the photos of that exact item', () => {
    expect(validateProject(project(item())).items[0]).toMatchObject({ quantity: '4', variants: [{ quantity: 3, imageId: A }, { quantity: 1, imageId: B }] });
    expect(() => validateProject(project(item({ imagePaths: [A] })))).toThrow();
    expect(() => validateProject(project(item({ variants: [row({ imageId: {} })] })))).toThrow();
  });
  it('timestamps a quantity or photo-association edit, while default materialization preserves recency', () => {
    const old = item({ updatedAt: '2020-01-01' }), before = project(old), now = new Date('2026-10-26');
    for (const patch of [{ quantity: 4 }, { imageId: '' }]) {
      const next = project({ ...old, variants: [{ ...old.variants[0], ...patch }, old.variants[1]] });
      expect(applyItemTimestamps(before, next, now).items[0].updatedAt).toBe(now.toISOString());
    }
    const historical = item({ imagePaths: [A], variants: [row()], updatedAt: '2020-01-01' });
    expect(applyItemTimestamps(project(historical), project({ ...historical, variants: [row({ quantity: 1, imageId: A })] }), now).items[0].updatedAt).toBe('2020-01-01');
  });
  it('remaps every binding on import/restore and preserves quantities on an unchanged old-client save', async () => {
    const bytes = PNG.sync.write({ width: 4, height: 4, data: Buffer.alloc(64, 255) });
    const app = service();
    await app.importProject(project(item({ imagePath: 'a', imagePaths: ['a', 'b'], variants: [row({ quantity: 3, imageId: 'a' }), row({ color: '红色', imageId: 'b' })] })), { includePrivate: true, images: { a: { bytes, mime: 'image/png' }, b: { bytes, mime: 'image/png' } } });
    let current = await app.getProject({ includePrivate: true });
    expect(current.items[0].variants.map(value => value.imageId)).toEqual(current.items[0].imagePaths);
    const incompatible = structuredClone(current);
    incompatible.items[0].variants = incompatible.items[0].variants.map(({ quantity, imageId, ...rest }) => rest);
    incompatible.items[0].variants[0].color = '旧客户端改动';
    await expect(app.saveProject(incompatible, { includePrivate: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await app.getProject({ includePrivate: true })).revision).toBe(current.revision);
    expect(current.items[0].quantity).toBe('4');
    current.items[0].variants = current.items[0].variants.map(({ quantity, imageId, ...rest }) => rest);
    await app.saveProject(current, { includePrivate: true });
    current = await app.getProject({ includePrivate: true });
    expect(current.items[0].quantity).toBe('4');
    expect(current.items[0].variants.map(value => value.imageId)).toEqual(current.items[0].imagePaths);
    const backup = await app.backup(), restored = service();
    await restored.importProject(backup.project, { includePrivate: true, images: backup.images });
    const copy = (await restored.getProject({ includePrivate: true })).items[0];
    expect(copy.quantity).toBe('4');
    expect(copy.imagePaths).not.toEqual(current.items[0].imagePaths);
    expect(copy.variants.map(value => value.imageId)).toEqual(copy.imagePaths);
  });
  it('rejects a metadata-blind reorder of identical colors and sizes with different packaging', async () => {
    const bytes = PNG.sync.write({ width: 4, height: 4, data: Buffer.alloc(64, 255) });
    const app = service();
    await app.importProject(project(item({ imagePath: 'a', imagePaths: ['a', 'b'], variants: [row({ quantity: 2, imageId: 'a' }), row({ quantity: 9, imageId: 'b', isPackaged: true })] })), { includePrivate: true, images: { a: { bytes, mime: 'image/png' }, b: { bytes, mime: 'image/png' } } });
    const current = await app.getProject({ includePrivate: true }), old = structuredClone(current);
    old.items[0].variants = old.items[0].variants.map(({ quantity, imageId, ...rest }) => rest).reverse();
    await expect(app.saveProject(old, { includePrivate: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await app.getProject({ includePrivate: true })).toEqual(current);
  });
});
