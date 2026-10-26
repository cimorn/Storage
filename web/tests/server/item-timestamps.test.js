// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { applyItemTimestamps as applyRendererItemTimestamps } from '../../src/renderer/lib/item-timestamps';
const require = createRequire(import.meta.url);
const { applyItemTimestamps: applyServerItemTimestamps } = require('../../server/item-timestamps');

const BEFORE = '2026-10-20T08:00:00.000Z';
const NOW = '2026-10-22T12:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';
function fixture() {
  return { meta: {}, categories: [{ id: 'cat', name: 'Tools' }], locations: [], items: [
    { id: 'one', name: 'One', categoryId: 'cat', tags: ['A', 'B'], createdAt: BEFORE, updatedAt: BEFORE },
    { id: 'legacy', name: 'Legacy', categoryId: 'cat', tags: [] }
  ] };
}
describe.each([
  ['server', applyServerItemTimestamps],
  ['renderer', applyRendererItemTimestamps]
])('%s item timestamp semantics', (_name, applyItemTimestamps) => {
  function update(previous, change) {
    const next = structuredClone(previous); change(next);
    return applyItemTimestamps(previous, next, new Date(NOW));
  }
  it('assigns server time to new items, including copied rows, ignoring submitted dates', () => {
    const previous = fixture();
    const result = update(previous, next => next.items.push({ ...next.items[0], id: 'copy', createdAt: FUTURE, updatedAt: FUTURE }));
    expect(result.items[2]).toMatchObject({ id: 'copy', createdAt: NOW, updatedAt: NOW });
    expect(result.items[0]).toEqual(previous.items[0]);
    expect(previous.items).toHaveLength(2);
  });

  it('restores omitted or tampered dates on a no-op save and item reorder', () => {
    const previous = fixture();
    const result = update(previous, next => {
      delete next.items[0].createdAt; next.items[0].updatedAt = FUTURE;
      Object.assign(next.items[1], { createdAt: FUTURE, updatedAt: FUTURE });
      next.items.reverse();
    });
    expect(result.items.find(item => item.id === 'one')).toEqual(previous.items[0]);
    expect(result.items.find(item => item.id === 'legacy')).toEqual(previous.items[1]);
  });

  it('changes only updatedAt for an edited historical item without inventing its creation date', () => {
    const previous = fixture();
    const result = update(previous, next => {
      next.items[0].name = 'Renamed'; next.items[0].createdAt = FUTURE;
      next.items[1].name = 'Updated legacy'; next.items[1].createdAt = FUTURE;
    });
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
    expect(result.items[1].updatedAt).toBe(NOW);
    expect(result.items[1]).not.toHaveProperty('createdAt');
  });

  it.each([
    ['name', 'New name'], ['brand', 'Brand'], ['quantity', '2'], ['specification', 'Model'], ['notes', '红色 M'],
    ['barcode', '123'], ['code', '456'], ['categoryId', 'different'], ['locationId', 'room'],
    ['locationIds', ['room', 'office']], ['imagePath', 'img_new'], ['isPackaged', true], ['isPrivate', true], ['tags', ['A', 'C']]
  ])('records changes to %s without changing another item', (field, value) => {
    const previous = fixture();
    const result = update(previous, next => { next.items[0][field] = value; });
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
    expect(result.items[1]).toEqual(previous.items[1]);
  });

  it.each([
    { quantity: '1', notes: '红色 M', count: 1, color: '红色', size: 'M', isPackaged: false },
    { quantity: '1个', notes: '已经不需要的旧款式文字', count: 1, color: '', size: '', isPackaged: false },
    { quantity: '2 pcs', notes: '蓝色 L', count: 2, color: '蓝色', size: 'L', isPackaged: true },
    { quantity: '3件', notes: '自定义原规格：旧版描述', count: 3, color: '', size: '', isPackaged: true },
    { quantity: '', notes: 'M', count: 1, color: '', size: 'M', isPackaged: false },
    { quantity: '1000个', notes: '红色', count: 1000, color: '红色', size: '', isPackaged: false }
  ])('preserves recency when converting legacy count $quantity and discarding obsolete notes', legacy => {
    const previous = fixture();
    Object.assign(previous.items[0], { quantity: legacy.quantity, notes: legacy.notes, isPackaged: legacy.isPackaged });
    const result = update(previous, next => Object.assign(next.items[0], {
      quantity: String(legacy.count), notes: '',
      variants: Array.from({ length: legacy.count }, () => ({ color: legacy.color, size: legacy.size, isPackaged: legacy.isPackaged }))
    }));
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: BEFORE, notes: '' });
    expect(result.items[1]).toEqual(previous.items[1]);
    expect(previous.items[0].notes).toBe(legacy.notes);
  });

  it('preserves absent historical dates when clearing unrecognized notes through safe rows', () => {
    const previous = fixture(); Object.assign(previous.items[1], { quantity: '1个', notes: '未识别的原规格' });
    const result = update(previous, next => Object.assign(next.items[1], { notes: '', quantity: '1', variants: [{ color: '', size: '', isPackaged: false }] }));
    expect(result.items[1]).not.toHaveProperty('createdAt');
    expect(result.items[1]).not.toHaveProperty('updatedAt');
  });

  it('treats equivalent quantity units and deleted unrecognized legacy text as formatting', () => {
    const previous = fixture(); Object.assign(previous.items[0], { quantity: '2双', notes: '过时的原规格', isPackaged: true });
    const result = update(previous, next => Object.assign(next.items[0], { quantity: '2 pairs', notes: '' }));
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: BEFORE });
  });

  it.each(['0', '1001', '1.5', '若干', '9007199254740992'])('does not equate unsafe legacy count %s with an invented structured row', quantity => {
    const previous = fixture(); Object.assign(previous.items[0], { quantity, notes: '旧规格' });
    const result = update(previous, next => Object.assign(next.items[0], { quantity: '1', notes: '', variants: [{ color: '', size: '', isPackaged: false }] }));
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
    expect(update(previous, next => { next.items[0].notes = ''; }).items[0].updatedAt).toBe(NOW);
  });

  it.each([
    { color: '蓝色', size: 'M', isPackaged: false },
    { color: '红色', size: 'L', isPackaged: false },
    { color: '红色', size: 'M', isPackaged: true }
  ])('records a real structured detail change during migration: %j', row => {
    const previous = fixture(); Object.assign(previous.items[0], { quantity: '1个', notes: '红色 M' });
    const result = update(previous, next => Object.assign(next.items[0], { quantity: '1', notes: '', variants: [row] }));
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
  });

  it('compares every structured row while deriving its summary and ignoring discarded notes', () => {
    const previous = fixture();
    Object.assign(previous.items[0], { quantity: '2', notes: '存档旧文字', isPackaged: true, variants: [
      { color: '红色', size: 'M', isPackaged: true }, { color: '蓝色', size: 'L', isPackaged: false }
    ] });
    const cleaned = update(previous, next => Object.assign(next.items[0], { quantity: 'obsolete summary', isPackaged: false, notes: '' }));
    expect(cleaned.items[0].updatedAt).toBe(BEFORE);
    const changed = update(previous, next => {
      next.items[0].notes = ''; next.items[0].variants[0].isPackaged = false; next.items[0].variants[1].isPackaged = true;
    });
    expect(changed.items[0].updatedAt).toBe(NOW);
    expect(update(previous, next => { next.items[0].variants.reverse(); }).items[0].updatedAt).toBe(NOW);
  });

  it('still timestamps a normal edit made together with format cleanup', () => {
    const previous = fixture(); Object.assign(previous.items[0], { quantity: '1个', notes: '旧规格文字' });
    const result = update(previous, next => Object.assign(next.items[0], { name: 'Actual rename', quantity: '1', notes: '', variants: [{ color: '', size: '', isPackaged: false }] }));
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
  });

  it('ignores derived catalog paths, catalog order, tag order and absent false flags', () => {
    const previous = fixture(); previous.items[0].locationId = 'room';
    const result = update(previous, next => {
      next.categories[0].name = 'Renamed catalog';
      next.categories[0].sortOrder = 8;
      Object.assign(next.items[0], { categoryPath: 'Renamed catalog', locationPath: 'Renamed room', locationIds: ['room'], locationPaths: ['Renamed room'], isPrivate: false, isPackaged: false, tags: ['B', 'A'] });
      next.items[1].name = 'Public edit';
    });
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: BEFORE });
    expect(result.items[1].updatedAt).toBe(NOW);
  });
});
