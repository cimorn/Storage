import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';
import { buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';
import { ImageAccessProvider } from '../../src/renderer/features/web/ImageAccessContext';
const row = (patch = {}) => ({ color: '白色', size: 'S', isPackaged: false, ...patch });
const base = { id: 'shirt', name: 'T恤', categoryId: 'cat', brand: 'Demo', specification: '印花', imagePath: 'a', imagePaths: ['a', 'b'], variants: [row({ quantity: 3, imageId: 'a' }), row({ color: '红色', size: 'M', quantity: 1, imageId: 'b' })] };
function setup({ item = base, mode = 'edit', card = false } = {}) {
  const api = { readImage: vi.fn(async () => new Blob(['image'], { type: 'image/webp' })), uploadImage: vi.fn(async () => ({ imageId: 'uploaded' })), copyImage: vi.fn(async id => ({ imageId: 'copy-' + id })) };
  const onSave = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn();
  const view = render(<ImageAccessProvider api={api}>{card ? <ItemGalleryCard item={buildItemCardView(item)} /> : <ItemEditorModal open mode={mode} item={item} categories={[{ id: 'cat', name: '服装', level: 1 }]} onSave={onSave} />}</ImageAccessProvider>);
  return { ...view, api, onSave, user: userEvent.setup() };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('variant photo and quantity editor', () => {
  it('keeps a separate quantity input for every specification and defaults a cleared value to one', async () => {
    const { user, onSave } = setup();
    expect(screen.getByRole('spinbutton', { name: '数量1' })).toHaveValue(3);
    await user.clear(screen.getByRole('spinbutton', { name: '数量1' }));
    await user.clear(screen.getByRole('spinbutton', { name: '数量2' }));
    await user.type(screen.getByRole('spinbutton', { name: '数量2' }), '2');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ quantity: '3', variants: [{ quantity: 1, imageId: 'a' }, { quantity: 2, imageId: 'b' }] });
  });
  it('disables photos assigned to another specification and permits releasing and reassigning one', async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole('button', { name: '规格1图片', exact: true }));
    expect(screen.getByRole('button', { name: '选择图片2', exact: true })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '不关联图片', exact: true }));
    await user.click(screen.getByRole('button', { name: '规格2图片', exact: true }));
    await user.click(screen.getByRole('button', { name: '选择图片2', exact: true }));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].variants.map(value => value.imageId)).toEqual(['', 'a']);
  });
  it('binds a locally cached first photo and substitutes its uploaded ID only when saving', async () => {
    const { user, api, onSave } = setup({ item: { ...base, imagePath: '', imagePaths: [], variants: [row()] } });
    await user.upload(screen.getByLabelText('从相册选择图片'), new File(['picture'], 'new.png', { type: 'image/png' }));
    expect(api.uploadImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ quantity: '1', imagePaths: ['uploaded'], variants: [{ quantity: 1, imageId: 'uploaded' }] });
  });
  it('clears the binding when a saved photo is removed without deleting its specification or quantity', async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole('button', { name: '移除图片 1', exact: true }));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ quantity: '4', imagePaths: ['b'], variants: [{ quantity: 3, imageId: '' }, { quantity: 1, imageId: 'b' }] });
  });
  it('copies every photo binding to its new independent ID', async () => {
    const { user, onSave } = setup({ mode: 'copy' });
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ quantity: '4', imagePaths: ['copy-a', 'copy-b'], variants: [{ quantity: 3, imageId: 'copy-a' }, { quantity: 1, imageId: 'copy-b' }] });
  });
  it('retains both local bindings on save failure and retries without uploading successful files twice', async () => {
    const { user, api, onSave } = setup({ item: { ...base, imagePath: '', imagePaths: [], variants: [row()] } });
    api.uploadImage.mockResolvedValueOnce({ imageId: 'uploaded-a' }).mockResolvedValueOnce({ imageId: 'uploaded-b' });
    onSave.mockRejectedValueOnce(new Error('暂时保存失败'));
    await user.upload(screen.getByLabelText('从相册选择图片'), [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })]);
    await user.click(screen.getByRole('button', { name: '添加颜色', exact: true }));
    await user.type(screen.getByRole('spinbutton', { name: '数量2' }), '5');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时保存失败');
    expect(api.uploadImage).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(api.uploadImage).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][0]).toMatchObject({ quantity: '6', variants: [{ quantity: 1, imageId: 'uploaded-a' }, { quantity: 5, imageId: 'uploaded-b' }] });
  });
  it('removes a pending-photo association while retaining the entered quantity', async () => {
    const { user, api, onSave } = setup({ item: { ...base, imagePath: '', imagePaths: [], variants: [row({ quantity: 3 })] } });
    await user.upload(screen.getByLabelText('从相册选择图片'), new File(['a'], 'a.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: '移除图片 1', exact: true }));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(onSave.mock.calls[0][0]).toMatchObject({ quantity: '3', imagePaths: [], variants: [{ quantity: 3, imageId: '' }] });
  });
  it('shows a quantity column in the information table', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: '信息页', exact: true }));
    const table = screen.getByRole('table', { name: '物品规格信息' });
    expect(within(table).getByRole('columnheader', { name: '图片', exact: true })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '数量', exact: true })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '3', exact: true })).toBeInTheDocument();
    expect(within(screen.getByRole('tabpanel', { name: '信息页', exact: true })).getByText('共4件')).toBeInTheDocument();
  });
  it('rejects a zero quantity before uploading pending photos', async () => {
    const { user, api, onSave } = setup();
    await user.upload(screen.getByLabelText('从相册选择图片'), new File(['picture'], 'new.png', { type: 'image/png' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: '数量1' }), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).not.toHaveBeenCalled(); expect(api.uploadImage).not.toHaveBeenCalled();
    expect(screen.getByText(/数量须为/)).toBeInTheDocument();
  });
});
describe('photo-specific card details', () => {
  it('switches the quantity badge and specification with the current photo and removes quantity from the third line', async () => {
    const { container } = setup({ card: true });
    const button = screen.getByRole('button', { name: 'T恤', exact: true });
    expect(screen.getByLabelText('当前规格数量3')).toBeInTheDocument();
    expect(container.querySelector('.item-gallery-card__variant-row')).toHaveTextContent('白色·S | 红色·M');
    expect(container.querySelector('.item-gallery-card__meta-row')).toHaveTextContent(/^印花$/);
    await act(async () => fireEvent.keyDown(button, { key: 'ArrowRight' }));
    expect(screen.getByLabelText('当前规格数量1')).toBeInTheDocument();
    expect(container.querySelector('.item-gallery-card__variant-row')).toHaveTextContent('白色·S | 红色·M');
    expect(screen.queryByLabelText('当前规格数量3')).not.toBeInTheDocument();
  });
});
