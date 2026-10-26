import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { sanitizeProject } from '../../src/renderer/lib/project-data';
import { createProjectStore } from '../../src/renderer/store/project-store';
import { applyItemGalleryFilters, buildItemCardView, sortItemGalleryItems } from '../../src/renderer/features/items/item-gallery-selectors';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';

const rows = () => [
  { color: '白色', size: 'S', isPackaged: true },
  { color: '红色', size: 'M', isPackaged: false }
];
function fixture() {
  return {
    categories: [{ id: 'clothes', name: '服装', parentId: null, level: 1 }],
    locations: [{ id: 'home', name: '家里', parentId: null, level: 1 }],
    items: [{ id: 'shirt', name: 'T恤', categoryId: 'clothes', locationId: 'home',
      notes: '原有规格说明', specification: '印花 镂空', quantity: '99', isPackaged: false,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', variants: rows() }]
  };
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('structured item variants in the renderer', () => {
  it('retains independent rows on load and derives count and packaging without discarding legacy text or style', () => {
    const source = fixture();
    const item = sanitizeProject(source).items[0];
    expect(item).toMatchObject({ variants: rows(), quantity: '2', isPackaged: true,
      notes: '原有规格说明', specification: '印花 镂空' });
    item.variants[0].color = '蓝色';
    expect(source.items[0].variants[0].color).toBe('白色');
  });

  it('counts duplicate color/size rows as separate physical items', () => {
    const p = fixture(); p.items[0].variants = [rows()[0], rows()[0]];
    expect(sanitizeProject(p).items[0].quantity).toBe('2');
  });

  it('keeps a row-only edit as a recent update even when count and aggregate packaging stay the same', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T12:00:00.000Z'));
    const store = createProjectStore(); const p = fixture();
    p.items.push({ id: 'other', name: '其他', createdAt: '2026-02-01T00:00:00.000Z' });
    store.getState().setProject(p);
    const old = store.getState().currentProject.items[0];
    store.getState().saveItem('shirt', { ...old, variants: [old.variants[0], { ...old.variants[1], size: 'L' }] });
    const current = store.getState().currentProject;
    expect(current.items[0]).toMatchObject({ quantity: '2', isPackaged: true, updatedAt: '2026-10-26T12:00:00.000Z' });
    expect(sortItemGalleryItems(current.items)[0].id).toBe('shirt');
    vi.setSystemTime(new Date('2026-10-27T12:00:00.000Z'));
    store.getState().saveItem('shirt', structuredClone(current.items[0]));
    expect(store.getState().currentProject.items[0].updatedAt).toBe('2026-10-26T12:00:00.000Z');
  });

  it('bulk packaging changes every row while preserving color, size and other items', () => {
    const store = createProjectStore(); const p = fixture();
    p.items.push({ id: 'untouched', name: '其他', variants: rows() });
    store.getState().setProject(p);
    store.getState().bulkUpdateItems(['shirt'], { isPackaged: false });
    const items = store.getState().currentProject.items;
    expect(items[0]).toMatchObject({ quantity: '2', isPackaged: false, variants: rows().map(row => ({ ...row, isPackaged: false })) });
    expect(items[1].variants).toEqual(rows());
    store.getState().bulkUpdateItems(['shirt'], { isPackaged: true });
    expect(store.getState().currentProject.items[0].variants.every(row => row.isPackaged)).toBe(true);
  });

  it('searches individual color/size and applies packaging filters to any packaged row', () => {
    const p = fixture();
    p.items.push({ ...p.items[0], id: 'loose', isPackaged: true, variants: rows().map(row => ({ ...row, isPackaged: false })) });
    expect(applyItemGalleryFilters(p.items, p.categories, p.locations, { packaging: 'packaged' }, '红色').map(item => item.id)).toEqual(['shirt']);
    expect(applyItemGalleryFilters(p.items, p.categories, p.locations, { packaging: 'unpackaged' }, 'M').map(item => item.id)).toEqual(['loose']);
  });

  it('does not search replaced recognized specifications but keeps unclear original text searchable', () => {
    const p = fixture();
    p.items[0].notes = '蓝白 44码';
    expect(applyItemGalleryFilters(p.items, p.categories, p.locations, {}, '蓝白')).toEqual([]);
    p.items[0].notes = '原有规格说明';
    expect(applyItemGalleryFilters(p.items, p.categories, p.locations, {}, '原有规格说明')).toHaveLength(1);
  });

  it('shows the derived count and a package icon only while at least one row is packaged', () => {
    const item = fixture().items[0];
    const card = buildItemCardView(item);
    expect(card.note).toContain('白色'); expect(card.note).toContain('红色');
    expect(card.metaLine).toBe('印花·镂空 · 2');
    const view = render(<ItemGalleryCard item={card} />);
    expect(screen.getByRole('img', { name: '有包装' })).toBeInTheDocument();
    view.rerender(<ItemGalleryCard item={buildItemCardView({ ...item, variants: rows().map(row => ({ ...row, isPackaged: false })) })} />);
    expect(screen.queryByRole('img', { name: '有包装' })).not.toBeInTheDocument();
  });
});
