// @vitest-environment node
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { validateProject } = require('../../server/project-validation');
const { createInventoryService } = require('../../server/inventory-service');
const { createMemoryRepository } = require('../../server/repository');
const { createMemoryObjectStore } = require('../../server/oss-store');
const { applyItemTimestamps } = require('../../server/item-timestamps');

const BEFORE = '2026-10-20T08:00:00.000Z';
const NOW = '2026-10-22T12:00:00.000Z';
const rows = () => [{ color: '白色', size: 'S', isPackaged: false }, { color: '蓝白', size: '44码', isPackaged: true }];
const fixture = (variants = rows()) => ({ meta: {}, categories: [], locations: [], items: [
  { id: 'ordinary', name: '物品', notes: '原始规格文字', specification: '原有款式', variants, quantity: '999', isPackaged: false, tags: [], imagePath: '', createdAt: BEFORE, updatedAt: BEFORE },
  { id: 'private', name: '隐私物品', variants: rows(), isPrivate: true, tags: [], imagePath: '' }
] });
const services = [];
async function setup(project = fixture()) {
  const options = { repository: createMemoryRepository(), objects: createMemoryObjectStore(), encryptionKey: randomBytes(32) };
  const service = createInventoryService(options); services.push(service);
  await service.importProject(project, { includePrivate: true });
  return { service, options };
}
afterEach(async () => { vi.useRealTimers(); await Promise.all(services.splice(0).map(service => service.close())); });

describe('structured item variants on the server', () => {
  it('keeps ordered rows, trims detail text and derives count and packaging from rows', () => {
    const input = fixture(); input.items[0].variants[0].color = ' 白色 ';
    const result = validateProject(input).items[0];
    expect(result).toMatchObject({ variants: rows(), quantity: '2', isPackaged: true, notes: '', specification: '原有款式' });
    expect(input.items[0].variants[0].color).toBe(' 白色 ');
  });

  it.each([
    null, {}, 'white', [], Array.from({ length: 1001 }, () => ({ color: '', size: '', isPackaged: false })),
    [null], [[]], [new Date()], [{ color: '白色', size: 'S' }],
    [{ color: 1, size: 'S', isPackaged: false }], [{ color: '', size: null, isPackaged: false }],
    [{ color: '', size: '', isPackaged: 'true' }], [{ color: 'x'.repeat(129), size: '', isPackaged: false }],
    [{ color: '', size: 'x'.repeat(129), isPackaged: false }], [{ color: '\u0000', size: '', isPackaged: false }]
  ])('rejects an invalid explicit row list %#', variants => {
    expect(() => validateProject(fixture(variants))).toThrow();
  });

  it('retains absent structured rows and legacy quantity text without forced migration', () => {
    const project = fixture(); delete project.items[0].variants;
    Object.assign(project.items[0], { notes: '无法识别的旧规格', quantity: '1001件', isPackaged: true });
    const item = validateProject(project).items[0];
    expect(item).not.toHaveProperty('variants');
    expect(item).toMatchObject({ notes: '无法识别的旧规格', quantity: '1001件', isPackaged: true });
  });

  it('normalizes interior row whitespace consistently with the browser helper', () => {
    const input = fixture([{ color: ' light  blue ', size: ' one\tsize ', isPackaged: false }]);
    expect(validateProject(input).items[0].variants).toEqual([{ color: 'light blue', size: 'one size', isPackaged: false }]);
  });

  it('round trips mixed packaging through save, reload, backup and import without exposing private rows', async () => {
    const { service, options } = await setup();
    const opened = await service.getProject();
    expect(opened.items.map(item => item.id)).toEqual(['ordinary']);
    Object.assign(opened.items[0], { quantity: '900', isPackaged: false });
    const saved = await service.saveProject(opened);
    expect(saved.items[0]).toMatchObject({ variants: rows(), quantity: '2', isPackaged: true });
    const reloadedService = createInventoryService(options); services.push(reloadedService);
    const reloaded = await reloadedService.getProject({ includePrivate: true });
    expect(reloaded.items).toHaveLength(2);
    expect(reloaded.items[0]).toMatchObject({ variants: rows(), quantity: '2', isPackaged: true });
    const backup = await service.backup();
    const imported = createInventoryService({ repository: createMemoryRepository(), objects: createMemoryObjectStore(), encryptionKey: randomBytes(32) }); services.push(imported);
    await imported.importProject(backup.project, { includePrivate: true });
    expect((await imported.getProject({ includePrivate: true })).items).toEqual(backup.project.items);
    expect((await imported.getProject()).items.map(item => item.id)).toEqual(['ordinary']);
  });

  it.each([false, true])('preserves omitted rows from older tabs and ignores contradictory scalar summaries (private access %s)', async includePrivate => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(NOW));
    const { service } = await setup();
    const opened = await service.getProject({ includePrivate });
    delete opened.items[0].variants;
    Object.assign(opened.items[0], { quantity: '1', isPackaged: false });
    const saved = await service.saveProject(opened, { includePrivate });
    expect(saved.items[0]).toMatchObject({ variants: rows(), quantity: '2', isPackaged: true, updatedAt: BEFORE });
    expect((await service.getProject({ includePrivate: true })).items[1].variants).toEqual(rows());
  });

  it('stamps changes to row detail or individual packaging even when summary values stay the same', () => {
    const previous = fixture();
    for (const change of [
      next => { next.items[0].variants[0].size = 'M'; },
      next => { next.items[0].variants[0].isPackaged = true; },
      next => { next.items[0].variants.reverse(); }
    ]) {
      const next = structuredClone(previous); change(next);
      expect(applyItemTimestamps(previous, next, new Date(NOW)).items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
    }
    const unchanged = structuredClone(previous);
    expect(applyItemTimestamps(previous, unchanged, new Date(NOW)).items[0].updatedAt).toBe(BEFORE);
  });

  it('ships shared helper source to both container build and server runtime', () => {
    const docker = readFileSync(new URL('../../../Dockerfile', import.meta.url), 'utf8');
    const ignores = readFileSync(new URL('../../../.dockerignore', import.meta.url), 'utf8');
    expect(docker).toMatch(/COPY web\/shared \.\/web\/shared/);
    expect(docker).toMatch(/COPY --chown=1000:10 web\/shared \.\/shared/);
    expect(ignores).toContain('!web/shared/**');
  });
});
