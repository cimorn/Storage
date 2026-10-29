import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ItemsGalleryPage from '../../src/renderer/features/items/ItemsGalleryPage';
import { createEmptyItemDraft } from '../../src/renderer/features/items/item-gallery-selectors';

const categories = [{ id: 'first', name: '办公', level: 1 }, { id: 'clothes', name: '服装', level: 1 }];
const locations = [{ id: 'desk', name: '书桌', level: 1 }, { id: 'closet', name: '衣柜', level: 1 }];
const previous = {
  id: 'previous', name: '上一件', brand: '品牌', specification: '印花 镂空', categoryId: 'clothes',
  locationIds: ['closet', 'desk'], isPrivate: true, barcode: 'CODE', tags: ['YF-001'],
  imagePaths: ['photo-one', 'photo-two'], createdAt: '2026-10-28T00:00:00Z',
  variants: [{ color: '蓝色', size: 'XL', quantity: 3, isPackaged: true, imageId: 'photo-one' },
    { color: '白色', size: 'M', quantity: 1, isPackaged: false, imageId: 'photo-two' }]
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('new item defaults from saved items', () => {
  it('reuses selections and specification rows without identity, photos, tags or privacy flags', () => {
    const snapshot = structuredClone(previous);
    const draft = createEmptyItemDraft(categories, locations, previous);
    expect(draft).toMatchObject({ name: '', barcode: '', tags: [], imagePath: '', isPrivate: false,
      brand: '品牌', specification: '印花 镂空', categoryId: 'clothes', locationIds: ['closet', 'desk'],
      variants: [{ color: '蓝色', size: 'XL', quantity: 3, isPackaged: true, imageId: '' },
        { color: '白色', size: 'M', quantity: 1, isPackaged: false, imageId: '' }] });
    expect(draft).not.toHaveProperty('id');
    expect(draft).not.toHaveProperty('createdAt');
    draft.variants[0].color = '红色';
    draft.locationIds.pop();
    expect(previous).toEqual(snapshot);
  });

  it('does not reintroduce unavailable private categories or locations', () => {
    const draft = createEmptyItemDraft(categories, locations, { ...previous, categoryId: 'hidden-category', locationIds: ['hidden-place', 'desk'] });
    expect(draft.categoryId).toBeNull();
    expect(draft.locationIds).toEqual(['desk']);
    expect(draft.isPrivate).toBe(false);
  });

  it('opens a fresh item using the most recently added record instead of the last edited record', async () => {
    const old = { ...previous, id: 'old', name: '旧物品', categoryId: 'first', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-10-29T23:00:00Z' };
    const newest = { ...previous, id: 'newest', name: '新物品', isPrivate: false };
    const onCreateItem = vi.fn().mockResolvedValue(undefined);
    render(<ItemsGalleryPage allItems={[newest, old]} items={[old]} categories={categories} locations={locations}
      onCreateItem={onCreateItem} canManagePrivacy />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新增物品', exact: true }));
    expect(screen.getByLabelText('名称')).toHaveValue('');
    expect(screen.getByLabelText('主分类')).toHaveValue('clothes');
    expect(screen.getByLabelText('颜色1')).toHaveValue('蓝色');
    expect(screen.getByLabelText('尺码1')).toHaveValue('XL');
    expect(screen.getByLabelText('数量1')).toHaveValue(3);
    expect(screen.getByLabelText('包装1')).toBeChecked();
    expect(screen.getAllByLabelText('一级位置').map(select => select.value)).toEqual(['closet', 'desk']);
    expect(screen.getByLabelText('隐私区')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /放大规格/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('名称'), '下一件');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存', exact: true }));
    expect(onCreateItem).toHaveBeenCalledWith(expect.objectContaining({ name: '下一件', isPrivate: false,
      categoryId: 'clothes', locationIds: ['closet', 'desk'], imagePaths: [], tags: [] }));
    expect(onCreateItem.mock.calls[0][0]).not.toHaveProperty('id');
    expect(onCreateItem.mock.calls[0][0]).not.toHaveProperty('createdAt');
  });

  it('does not remember canceled changes or the source privacy checkbox', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCreateItem = vi.fn();
    render(<ItemsGalleryPage allItems={[previous]} items={[previous]} categories={categories} locations={locations}
      onCreateItem={onCreateItem} canManagePrivacy />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新增物品', exact: true }));
    await user.clear(screen.getByLabelText('颜色1'));
    await user.type(screen.getByLabelText('颜色1'), '未保存颜色');
    await user.click(screen.getByLabelText('隐私区'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消', exact: true }));
    await user.click(screen.getByRole('button', { name: '新增物品', exact: true }));
    expect(screen.getByLabelText('颜色1')).toHaveValue('蓝色');
    expect(screen.getByLabelText('隐私区')).not.toBeChecked();
    expect(onCreateItem).not.toHaveBeenCalled();
  });
});
