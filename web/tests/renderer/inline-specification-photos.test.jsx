import { startVariantSort, showVariantInputs } from '../helpers/upload-variant-photo';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';
import { buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';
import { ImageAccessProvider } from '../../src/renderer/features/web/ImageAccessContext';

const item = { id: 'shirt', name: '衬衫', brand: 'Demo', categoryId: 'cat', imagePaths: ['old'], imagePath: 'old', variants: [
  { color: '蓝', size: 'M', quantity: 1, imageId: '', isPackaged: false },
  { color: '红', size: 'L', quantity: 3, imageId: 'old', isPackaged: true }
] };
function setup(overrides = {}) {
  const api = { readImage: vi.fn(async () => new Blob(['photo'], { type: 'image/webp' })), uploadImage: vi.fn(async () => ({ imageId: 'new' })), ...overrides };
  URL.createObjectURL = vi.fn(() => 'blob:photo'); URL.revokeObjectURL = vi.fn();
  const onSave = vi.fn();
  const view = render(<ImageAccessProvider api={api}><ItemEditorModal open item={item} categories={[{ id: 'cat', name: '服装' }]} canManagePrivacy={false} onSave={onSave} /></ImageAccessProvider>);
  return { ...view, api, onSave, user: userEvent.setup() };
}
beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('inline specification photos', () => {
  it('uploads to the clicked row even when an earlier row is unbound, replacing only that row photo on Save', async () => {
    const { user, api, onSave } = setup();
    await user.click(screen.getByRole('button', { name: '上传规格2图片' }));
    await user.upload(screen.getByLabelText('从相册选择图片'), new File(['new'], 'new.png', { type: 'image/png' }));
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(within(screen.getByRole('group', { name: '规格2', exact: true })).getByRole('img')).toHaveAttribute('src', 'blob:photo');
    expect(screen.queryByRole('button', { name: '不关联图片' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ imagePaths: ['new'], variants: [{ imageId: '', quantity: 1 }, { imageId: 'new', quantity: 3 }] });
  });
  it('keeps the upload target stable while rows are reordered and removes the image with its row', async () => {
    const { user, api, onSave } = setup();
    await user.click(screen.getByRole('button', { name: '上传规格2图片' }));
    await startVariantSort(user);
    screen.getByRole('button', { name: '拖动规格2' }).focus();
    await user.keyboard('{ArrowUp}');
    await user.upload(screen.getByLabelText('从相册选择图片'), new File(['new'], 'new.png', { type: 'image/png' }));
    await showVariantInputs(user);
    expect(screen.getByLabelText('颜色1')).toHaveValue('红');
    await user.click(screen.getByRole('button', { name: '移除规格1', exact: true }));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(onSave.mock.calls[0][0]).toMatchObject({ imagePaths: [], variants: [{ color: '蓝', imageId: '' }] });
  });
  it('opens and dismisses photos in both pages without changing the draft, and has a keyboard-accessible tags tab', async () => {
    const { user, onSave } = setup();
    const thumbnail = screen.getByRole('button', { name: '放大规格2图片' });
    await user.click(thumbnail);
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
    expect(thumbnail).toHaveFocus();
    await user.click(screen.getByRole('tab', { name: '信息', exact: true }));
    await user.click(screen.getByRole('button', { name: '放大规格2图片' }));
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '关闭图片预览' }));
    screen.getByRole('tab', { name: '信息', exact: true }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '标签', exact: true })).toHaveAttribute('aria-selected', 'true');
    await user.type(screen.getByLabelText('新增标签'), 'TEST');
    await user.click(screen.getByRole('button', { name: '添加', exact: true }));
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].tags).toContain('TEST-001');
  });
  it('hides a quantity of one and shows a larger quantity only on its own photo', async () => {
    render(<ItemGalleryCard item={buildItemCardView({ ...item, imagePaths: ['a', 'b'], imagePath: 'a', variants: item.variants.map((row, index) => ({ ...row, imageId: index ? 'b' : 'a' })) })} />);
    expect(screen.queryByLabelText('当前规格数量1')).not.toBeInTheDocument();
    await act(async () => fireEvent.keyDown(screen.getByRole('button', { name: '衬衫', exact: true }), { key: 'ArrowRight' }));
    expect(screen.getByLabelText('当前规格数量3')).toHaveTextContent('3');
  });
  it('reads the full image only on expansion and revokes its temporary URL on close', async () => {
    const fullBlob = new Blob(['full'], { type: 'image/webp' });
    const readImage = vi.fn(async (id, options) => options?.variant === 'card' ? new Blob(['small']) : fullBlob);
    const { user } = setup({ readImage });
    await act(async () => {});
    expect(readImage.mock.calls.every(([, options]) => options.variant === 'card')).toBe(true);
    await user.click(screen.getByRole('button', { name: '放大规格2图片' }));
    await waitFor(() => expect(URL.createObjectURL.mock.calls.some(([blob]) => blob === fullBlob)).toBe(true));
    await user.keyboard('{Escape}');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
  it('closes expansion on access changes and ignores a late full-image response', async () => {
    let accessChanged, resolveFull;
    const fullBlob = new Blob(['late-private-image']);
    const fullPromise = new Promise(resolve => { resolveFull = resolve; });
    const readImage = vi.fn(async (id, options) => options?.variant === 'card' ? new Blob(['small']) : fullPromise);
    const { user } = setup({ readImage, onAccessChange: listener => { accessChanged = listener; return () => {}; } });
    await user.click(screen.getByRole('button', { name: '放大规格2图片' }));
    const fullCall = readImage.mock.calls.find(([, options]) => !options.variant);
    await act(async () => accessChanged());
    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
    expect(fullCall[1].signal.aborted).toBe(true);
    await act(async () => resolveFull(fullBlob));
    expect(URL.createObjectURL.mock.calls.some(([blob]) => blob === fullBlob)).toBe(false);
  });
});
