import { addVariant, openVariantManagement } from '../helpers/upload-variant-photo';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';
import ItemFilterChips from '../../src/renderer/features/items/ItemFilterChips';
import { buildFilterGroups, buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';
import CatalogWorkspace from '../../src/renderer/features/catalog/CatalogWorkspace';
import NodeEditorPane from '../../src/renderer/features/catalog/NodeEditorPane';
import { ImageAccessProvider } from '../../src/renderer/features/web/ImageAccessContext';

const categories = [
  { id: 'public', name: '日常', level: 1, parentId: null },
  { id: 'look', name: 'Look', level: 1, parentId: null },
  { id: 'private', name: '私人', level: 1, parentId: null, isPrivate: true },
  { id: 'child', name: '子类', level: 2, parentId: 'public' }
];
const locations = [
  { id: 'room', name: '房间', level: 1, parentId: null },
  { id: 'cabinet', name: '柜子', level: 2, parentId: 'room' },
  { id: 'box', name: '盒子', level: 3, parentId: 'cabinet' },
  { id: 'other', name: '另一个房间', level: 1, parentId: null },
  { id: 'secret', name: '私人柜', level: 1, parentId: null, isPrivate: true }
];
const item = { id: 'item', name: '书', categoryId: 'public', locationId: 'box', tags: [] };
beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function editor(initialItem = item, extra = {}) {
  const onSave = vi.fn();
  const props = { open: true, item: initialItem, categories, locations, onSave, ...extra };
  const view = render(<ImageAccessProvider api={{}}><ItemEditorModal {...props} /></ImageAccessProvider>);
  return { user: userEvent.setup(), onSave, ...view };
}
const locationRow = number => within(screen.getByRole('group', { name: `存放位置 ${number}` }));

describe('compact NAS item controls', () => {
  it('keeps style normalization while saving separate color and size fields', async () => {
    const { user, onSave } = editor({ ...item, specification: '' });
    const style = screen.getByLabelText('款式');
    await user.type(screen.getByLabelText('颜色1'), '白色');
    await user.type(screen.getByLabelText('尺码1'), 'S');
    await user.type(style, '印花　镂空');
    expect(style).toHaveValue('印花　镂空');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存', exact: true })));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ variants: [{ color: '白色', size: 'S', isPackaged: false, quantity: 1, imageId: '' }], specification: '印花 镂空' }));
  });

  it('opens recognizable legacy details as a row and derives quantity from rows', async () => {
    const { user, onSave } = editor({ ...item, notes: '白色·S', specification: '印花·镂空', quantity: '1' });
    expect(screen.getByLabelText('颜色1')).toHaveValue('白色');
    expect(screen.getByLabelText('尺码1')).toHaveValue('S');
    expect(screen.getByLabelText('款式')).toHaveValue('印花 镂空');
    expect(screen.getByLabelText('款式')).toHaveAttribute('placeholder', '印花 镂空');
    expect(screen.queryByLabelText('数量')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('规格')).not.toBeInTheDocument();
    expect(screen.getByText('共1件')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('颜色1'));
    await user.type(screen.getByLabelText('颜色1'), '黑色');
    await user.clear(screen.getByLabelText('尺码1'));
    await user.type(screen.getByLabelText('尺码1'), 'M');
    await user.clear(screen.getByLabelText('款式'));
    await user.type(screen.getByLabelText('款式'), '纯色');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ variants: [{ color: '黑色', size: 'M', isPackaged: false, quantity: 1, imageId: '' }], specification: '纯色' }));
    expect(String(onSave.mock.calls[0][0].quantity)).toBe('1');
  });

  it('offers one ordinary file selector with privacy, keeps packaging per row, and puts tags last', async () => {
    const { container, user, onSave } = editor();
    expect(screen.queryByRole('button', { name: '手机拍照' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(container.querySelector('input[type="file"]')).not.toHaveAttribute('capture');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
    expect(screen.getByRole('tab', { name: '标签', exact: true }).closest('.item-editor-modal__toolbar')).toContainElement(screen.getByRole('tablist', { name: '物品页面' }));
    await user.click(screen.getByLabelText('包装1'));
    expect(screen.getByRole('tab', { name: '标签', exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ isPackaged: true, isPrivate: false }));
  });

  it('uses compact accessible row controls without visible row numbers or packaging labels', async () => {
    const { container, user } = editor();
    const row = screen.getByRole('group', { name: '规格1' });
    const packaging = within(row).getByRole('checkbox', { name: '包装1' });
    const remove = within(row).getByRole('button', { name: '移除规格1' });
    expect(container.querySelector('.item-variant-editor__number')).toBeNull();
    expect(within(row).queryByText('包装')).not.toBeInTheDocument();
    expect(packaging.closest('.item-variant-editor__controls')).toContainElement(remove);
    expect(packaging).toHaveAttribute('title', '有包装');
    expect(remove).toHaveTextContent('×');
    expect(remove).toHaveAttribute('title', '移除颜色和尺码');
    await openVariantManagement(user);
    const add = screen.getByRole('button', { name: '添加颜色' });
    expect(add).toHaveTextContent('添加');
    expect(add).toHaveAttribute('title', '添加颜色和尺码');
    await user.click(add);
    expect(screen.getByRole('group', { name: '规格2' })).toBeInTheDocument();
    const location = screen.getByRole('group', { name: '存放位置 1' });
    const addLocation = within(location).getByRole('button', { name: '添加位置' });
    expect(addLocation).toHaveTextContent('＋');
    expect(addLocation.closest('.item-location-editor__controls')).toContainElement(within(location).getByRole('button', { name: '移除位置 1' }));
  });

  it('keeps the current category and every ordered location in the header above the table', async () => {
    const { user, container } = editor({ ...item, categoryId: 'child', locationIds: ['other', 'box'] });
    await user.click(screen.getByRole('tab', { name: '信息' }));
    const header=within(container.querySelector('.item-editor-modal__header'));
    const category=header.getByText('日常/子类');
    expect(header.getByText('另一个房间；房间/柜子/盒子')).toBeInTheDocument();
    const panel=screen.getByRole('tabpanel', { name: '信息' });
    const table=within(panel).getByRole('table');
    expect(category.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).queryByText('分类')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '编辑' }));
    await user.selectOptions(screen.getByLabelText('子分类'), '');
    await user.click(screen.getByRole('tab', { name: '信息' }));
    expect(header.getByText('日常')).toBeInTheDocument();
  });

  it('allows the only row packaging to be removed and shows packaging on the gallery card', async () => {
    const { user, onSave, unmount } = editor({ ...item, isPackaged: true });
    await user.click(screen.getByLabelText('包装1'));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isPackaged: false }));
    unmount();
    render(<ItemGalleryCard item={buildItemCardView({ ...item, isPackaged: true, locationPaths: ['房间 / 柜子 / 盒子', '另一个房间'] }, '')} />);
    expect(screen.getByRole('img', { name: '有包装' })).toBeInTheDocument();
    expect(screen.queryByText('房间 · 柜子 · 盒子；另一个房间')).not.toBeInTheDocument();
  });

  it('adds physical item rows, preserves remaining rows after removal, and saves a derived mixed packaging summary', async () => {
    const { user, onSave } = editor();
    expect(screen.getByRole('button', { name: '移除规格1' })).toBeDisabled();
    await user.type(screen.getByLabelText('颜色1'), '白色');
    await user.type(screen.getByLabelText('尺码1'), 'S');
    await addVariant(user);
    await user.type(screen.getByLabelText('颜色2'), '黑色');
    await user.type(screen.getByLabelText('尺码2'), 'M');
    await addVariant(user);
    await user.type(screen.getByLabelText('颜色3'), '蓝色');
    await user.type(screen.getByLabelText('尺码3'), 'L');
    await user.click(screen.getByLabelText('包装3'));
    expect(screen.getByText('共3件')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除规格2' }));
    expect(screen.getByLabelText('颜色2')).toHaveValue('蓝色');
    expect(screen.getByLabelText('尺码2')).toHaveValue('L');
    expect(screen.getByLabelText('包装2')).toBeChecked();
    expect(screen.getByText('共2件')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      variants: [{ color: '白色', size: 'S', isPackaged: false, quantity: 1, imageId: '' }, { color: '蓝色', size: 'L', isPackaged: true, quantity: 1, imageId: '' }], isPackaged: true
    }));
    expect(String(onSave.mock.calls[0][0].quantity)).toBe('2');
  });

  it('shows current unsaved rows in a read-only information table and preserves the draft across keyboard tab switches', async () => {
    const { user, onSave } = editor();
    await user.type(screen.getByLabelText('颜色1'), '奶油白');
    await user.type(screen.getByLabelText('尺码1'), 'S');
    await user.click(screen.getByLabelText('包装1'));
    await addVariant(user);
    await user.click(screen.getByRole('tab', { name: '信息' }));
    expect(screen.getByRole('tab', { name: '信息' })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: '信息' });
    const table = within(panel).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['图片', '颜色', '尺码', '数量', '包装']);
    expect(within(table).getAllByRole('row').slice(1).map(row => row.textContent)).toEqual(['—奶油白S1有', '———1无']);
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: '编辑' })).toHaveFocus();
    expect(screen.getByLabelText('颜色1')).toHaveValue('奶油白');
    expect(screen.getByLabelText('尺码1')).toHaveValue('S');
    expect(screen.getByText('共2件')).toBeInTheDocument();
  });

  it('discards unrecognized original specification text while allowing nonclothing rows with no color or size', async () => {
    const { user, onSave } = editor({ ...item, notes: '备用／适配旧型号', quantity: '2' });
    expect(screen.queryByText('原规格')).not.toBeInTheDocument();
    expect(screen.queryByText('备用／适配旧型号')).not.toBeInTheDocument();
    expect(screen.getByLabelText('颜色1')).toHaveValue('');
    expect(screen.getByLabelText('尺码1')).toHaveValue('');
    expect(screen.getByText('共2件')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ notes: '', variants: [
      { color: '', size: '', isPackaged: false, quantity: 1, imageId: '' }, { color: '', size: '', isPackaged: false, quantity: 1, imageId: '' }
    ] }));
  });

  it.each(['若干', '1001'])('requires an explicit physical row count before replacing an ambiguous legacy quantity %s', async quantity => {
    const { user, onSave } = editor({ ...item, quantity, notes: '旧物品规格' });
    expect(screen.queryByText(`原数量：${quantity}`)).not.toBeInTheDocument();
    expect(screen.queryByText(/原数量无法自动转换/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('颜色1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请按实际件数添加规格后再保存');
    expect(onSave).not.toHaveBeenCalled();
    await addVariant(user);
    expect(screen.getByText('共1件')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ notes: '', variants: [{ color: '', size: '', isPackaged: false, quantity: 1, imageId: '' }] }));
    expect(String(onSave.mock.calls[0][0].quantity)).toBe('1');
  });

  it('keeps accessible filter groups while labeling the root choices directly', () => {
    render(<ItemFilterChips groups={buildFilterGroups(categories, locations, {}, [])} filters={{}} onChange={vi.fn()} />);
    const category = screen.getByRole('group', { name: '分类筛选' });
    const location = screen.getByRole('group', { name: '位置筛选' });
    expect(within(category).getByLabelText('一级分类筛选').selectedOptions[0]).toHaveTextContent('分类');
    expect(within(location).getByLabelText('一级位置筛选').selectedOptions[0]).toHaveTextContent('位置');
    expect(category.querySelector('.item-hierarchy-filter__label')).toBeNull();
    expect(location.querySelector('.item-hierarchy-filter__label')).toBeNull();
  });
});

describe('multiple item locations', () => {
  it('starts from the legacy primary, clears descendants, and saves unique ordered locations', async () => {
    const { user, onSave } = editor();
    expect(locationRow(1).getByLabelText('三级位置')).toHaveValue('box');
    await user.click(screen.getByRole('button', { name: '添加位置' }));
    expect(screen.getByRole('button', { name: '添加位置' })).toBeDisabled();
    await user.selectOptions(locationRow(2).getByLabelText('一级位置'), 'other');
    await user.click(screen.getByRole('button', { name: '添加位置' }));
    await user.selectOptions(locationRow(3).getByLabelText('一级位置'), 'other');
    await user.selectOptions(locationRow(1).getByLabelText('一级位置'), 'other');
    expect(locationRow(1).getByLabelText('二级位置')).toHaveValue('');
    expect(locationRow(1).getByLabelText('三级位置')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ locationIds: ['other'], locationId: 'other' }));
  });

  it('preserves existing order and removes every assigned location explicitly', async () => {
    const { user, onSave } = editor({ ...item, locationIds: ['other', 'box'] });
    expect(locationRow(1).getByLabelText('一级位置')).toHaveValue('other');
    expect(locationRow(2).getByLabelText('三级位置')).toHaveValue('box');
    await user.click(screen.getByRole('button', { name: '移除位置 1' }));
    await user.click(screen.getByRole('button', { name: '移除位置 1' }));
    expect(locationRow(1).getByLabelText('一级位置')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ locationIds: [], locationId: null }));
  });

  it('limits location rows to 32', () => {
    editor({ ...item, locationIds: Array.from({ length: 32 }, (_, index) => `location_${index}`) });
    expect(screen.getAllByRole('group', { name: /^存放位置 / })).toHaveLength(32);
    expect(screen.getByRole('button', { name: '添加位置' })).toBeDisabled();
  });
});

describe('item inherited privacy', () => {
  it.each(['look', 'private'])('protects category %s while keeping the own flag editable after leaving', async categoryId => {
    const { user, onSave } = editor({ ...item, categoryId });
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeDisabled();
    expect(screen.queryByText('所选分类或位置属于隐私区')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('主分类'), 'public');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false }));
  });

  it('inherits a secondary location and retains an explicitly marked flag until unmarked', async () => {
    const { user } = editor({ ...item, locationIds: ['box', 'secret'], isPrivate: true });
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '移除位置 2' }));
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
  });
});

describe('catalog privacy drafts', () => {
  it.each(['category', 'location'])('forwards %s private create metadata', async mode => {
    const onAddRoot = vi.fn(), user = userEvent.setup();
    render(<CatalogWorkspace mode={mode} entries={mode === 'category' ? categories : locations} onAddRoot={onAddRoot} />);
    await user.click(screen.getByRole('button', { name: '新增顶级', exact: true }));
    await user.type(screen.getByLabelText('名称'), '收藏');
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    await user.click(screen.getByRole('button', { name: '确定', exact: true }));
    expect(onAddRoot).toHaveBeenCalledWith(mode, '收藏', { isPrivate: true });
  });

  it.each(['category', 'location'])('saves and cancels %s privacy-only edits, and resets on metadata refresh', async mode => {
    const onUpdate = vi.fn(), user = userEvent.setup(), node = categories[0];
    const view = render(<NodeEditorPane mode={mode} entries={categories} node={node} onUpdate={onUpdate} />);
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onUpdate).toHaveBeenCalledWith(mode, node.id, { name: node.name, isPrivate: true });
    view.rerender(<NodeEditorPane mode={mode} entries={categories} node={{ ...node, isPrivate: true }} onUpdate={onUpdate} />);
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onUpdate).toHaveBeenLastCalledWith(mode, node.id, { name: node.name, isPrivate: false });
  });

  it('derives Look privacy from the draft name without persisting it as an explicit flag', async () => {
    const onConfirmCreate = vi.fn(), user = userEvent.setup();
    render(<NodeEditorPane mode="category" entries={categories.filter(node => node.id !== 'look')} node={{ id: 'draft', name: '', parentId: null, level: 1 }} isCreate onConfirmCreate={onConfirmCreate} />);
    await user.type(screen.getByLabelText('名称'), 'Look');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onConfirmCreate).toHaveBeenCalledWith({ name: 'Look', parentId: null, isPrivate: false });
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '公开');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
  });

  it.each(['category', 'location'])('derives %s parent privacy while moving and allows an own flag outside it', async mode => {
    const user = userEvent.setup(), node = categories[3];
    render(<NodeEditorPane mode={mode} entries={categories} node={node} onUpdate={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('父级'), 'private');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('父级'), 'public');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
  });
});
