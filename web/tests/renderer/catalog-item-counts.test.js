import { describe, expect, it } from 'vitest';
import { buildCatalogItemCounts } from '../../src/renderer/features/catalog/catalog-item-counts';

const node = (id, parentId = null) => ({ id, parentId, name: id });
const counts = (...args) => Object.fromEntries(buildCatalogItemCounts(...args));

describe('catalog item counts', () => {
  it('counts category cards at their own category and all ancestors, including direct root assignments', () => {
    const categories = [node('clothes'), node('shirts', 'clothes'), node('shoes', 'clothes'), node('devices')];
    const items = [{ id: 'a', categoryId: 'shirts' }, { id: 'b', categoryId: 'shoes' }, { id: 'c', categoryId: 'clothes' }];
    expect(counts(categories, items, 'category')).toEqual({ clothes: 3, shirts: 1, shoes: 1, devices: 0 });
  });

  it('counts each card once regardless of its variant or legacy quantity', () => {
    const items = [
      { id: 'a', categoryId: 'shirts', quantity: '99', variants: [{ quantity: 20 }, { quantity: 30 }] },
      { id: 'b', categoryId: 'shirts', quantity: '4' }
    ];
    expect(counts([node('shirts')], items)).toEqual({ shirts: 2 });
  });

  it('includes all three location levels without double-counting a card in shared ancestors', () => {
    const locations = [
      node('home'), node('office'), node('cabinet-a', 'home'), node('cabinet-b', 'home'),
      node('shelf-a', 'cabinet-a'), node('shelf-b', 'cabinet-a'), node('shelf-c', 'cabinet-b')
    ];
    const items = [{ id: 'a', locationIds: ['shelf-a', 'shelf-b', 'shelf-c', 'office', 'shelf-a'] }];
    expect(counts(locations, items, 'location')).toEqual({
      home: 1, office: 1, 'cabinet-a': 1, 'cabinet-b': 1, 'shelf-a': 1, 'shelf-b': 1, 'shelf-c': 1
    });
  });

  it('supports legacy locations while treating an explicit locationIds array as authoritative', () => {
    const locations = [node('home'), node('cabinet', 'home'), node('shelf', 'cabinet')];
    const items = [
      { id: 'legacy', locationId: 'shelf' },
      { id: 'removed', locationIds: [], locationId: 'shelf' },
      { id: 'modern', locationIds: ['cabinet', 'shelf'], locationId: 'elsewhere' }
    ];
    expect(counts(locations, items, 'location')).toEqual({ home: 2, cabinet: 2, shelf: 2 });
  });

  it('returns zero for empty or unrelated nodes and ignores assignments to absent nodes', () => {
    expect(counts()).toEqual({});
    expect(counts([node('empty')], [])).toEqual({ empty: 0 });
    expect(counts([node('empty')], [{ categoryId: 'missing' }, {}])).toEqual({ empty: 0 });
  });

  it('counts only supplied cards, so changing the visible projection updates totals', () => {
    const categories = [node('clothes'), node('shirts', 'clothes')];
    const ordinary = { id: 'ordinary', categoryId: 'shirts' };
    const hidden = { id: 'hidden', categoryId: 'shirts', isPrivate: true };
    expect(counts(categories, [ordinary])).toEqual({ clothes: 1, shirts: 1 });
    expect(counts(categories, [ordinary, hidden])).toEqual({ clothes: 2, shirts: 2 });
    expect(counts(categories, [ordinary])).toEqual({ clothes: 1, shirts: 1 });
  });

  it('stops at unknown parents and cycles without mutating the catalog', () => {
    const entries = [node('orphan', 'missing'), node('a', 'b'), node('b', 'a'), node('untouched')];
    const before = structuredClone(entries);
    expect(counts(entries, [{ categoryId: 'orphan' }, { categoryId: 'a' }])).toEqual({ orphan: 1, a: 1, b: 1, untouched: 0 });
    expect(entries).toEqual(before);
  });
});
