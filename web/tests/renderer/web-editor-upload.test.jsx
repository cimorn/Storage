import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import ItemsGalleryPage from '../../src/renderer/features/items/ItemsGalleryPage';
import { ImageAccessProvider, useImageAccess } from '../../src/renderer/features/web/ImageAccessContext';

const categories = [
  { id: 'office', name: '办公', level: 1, parentId: null },
  { id: 'stationery', name: '文具', level: 2, parentId: 'office' }
];
const locations = [];
const item = { id: 'item-1', name: '标签机', categoryId: 'stationery', imagePath: '', tags: [] };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function CaptureAccess({ target }) { target.current = useImageAccess(); return null; }

function setup({ onSave = vi.fn(), onClose = vi.fn(), initialItem = item, api: overrides = {}, gallery = false, imageOptions = {} } = {}) {
  const access = { current: null };
  const api = {
    uploadImage: vi.fn(async () => ({ imageId: 'staged-image' })),
    readImage: vi.fn(async () => new Blob(['saved-image'], { type: 'image/png' })),
    ...overrides
  };
  URL.createObjectURL = vi.fn(() => 'blob:saved-image');
  URL.revokeObjectURL = vi.fn();
  const readFile = vi.spyOn(FileReader.prototype, 'readAsDataURL');
  const renderEditor = ({ editorPresent = true, ...props } = {}) => (
    <ImageAccessProvider api={api} {...imageOptions}>
      <CaptureAccess target={access} />
      {editorPresent ? <ItemEditorModal open item={initialItem} categories={categories} locations={locations} onSave={onSave} onClose={onClose} {...props} /> : null}
    </ImageAccessProvider>
  );
  const view = render(gallery ? (
    <ImageAccessProvider api={api} {...imageOptions}>
      <CaptureAccess target={access} />
      <ItemsGalleryPage allItems={[initialItem]} items={[initialItem]} categories={categories} locations={locations} onCreateItem={onSave} onSaveItem={onSave} />
    </ImageAccessProvider>
  ) : renderEditor());
  return { api, access, readFile, onSave, onClose, ...view, rerenderEditor: (props) => view.rerender(renderEditor(props)) };
}

async function selectPhoto(user, name = '相册照片.png') {
  const file = new File(['photo'], name, { type: 'image/png' });
  await user.upload(screen.getByLabelText('从相册选择图片'), file);
  return file;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('NAS editor deferred image upload', () => {
  it('previews selected files as local images without reading or uploading them', async () => {
    const user = userEvent.setup();
    const { api, readFile } = setup();
    await selectPhoto(user);
    expect(screen.getByRole('img', { name: '待上传图片1：相册照片.png' })).toHaveAttribute('src', 'blob:saved-image');
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(api.readImage).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('快速填写')).not.toBeInTheDocument();
  });

  it('reads each saved image for an inline preview when opening the editor', async () => {
    const { api } = setup({ initialItem: { ...item, imagePath: 'cover', imagePaths: ['cover', 'detail'] } });
    expect(await screen.findByRole('img', { name: '已保存图片1' })).toHaveAttribute('src', 'blob:saved-image');
    expect(await screen.findByRole('img', { name: '已保存图片2' })).toHaveAttribute('src', 'blob:saved-image');
    expect(api.readImage.mock.calls.map(([id]) => id)).toEqual(['cover', 'detail']);
  });

  it('appends multiple selections, removes individual pending and saved images, and saves the first remaining image as cover', async () => {
    const user = userEvent.setup();
    const { api, onSave } = setup({ initialItem: { ...item, imagePath: 'cover', imagePaths: ['cover', 'detail'] }, api: { uploadImage: vi.fn().mockResolvedValueOnce({ imageId: 'first-upload' }).mockResolvedValueOnce({ imageId: 'third-upload' }) } });
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('从相册选择图片'), [first, second]);
    expect(screen.getByLabelText('从相册选择图片')).toHaveAttribute('multiple');
    await selectPhoto(user, 'third.png');
    expect(screen.getAllByRole('button', { name: /^移除图片 / })).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: '移除图片 1' }));
    await user.click(screen.getByRole('button', { name: '移除图片 3' }));
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(api.uploadImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imagePath: 'detail', imagePaths: ['detail', 'first-upload', 'third-upload'] })));
    expect(api.uploadImage).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[0][0].imagePaths.every(id => typeof id === 'string')).toBe(true);
  });

  it('allows removing every image and persists an empty array and primary path', async () => {
    const user = userEvent.setup();
    const { onSave } = setup({ initialItem: { ...item, imagePath: 'cover', imagePaths: ['cover', 'detail'] } });
    await user.click(screen.getByRole('button', { name: '移除图片 1' }));
    await user.click(screen.getByRole('button', { name: '移除图片 1' }));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imagePaths: [], imagePath: '' }));
  });

  it('validates all selected file types and sizes before accepting a batch', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { api } = setup();
    const valid = new File(['photo'], 'valid.png', { type: 'image/png' });
    const invalid = new File(['text'], 'bad.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('从相册选择图片'), [valid, invalid]);
    expect(screen.getByRole('alert')).toHaveTextContent('图片格式');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const large = new File(['photo'], 'large.png', { type: 'image/png' });
    Object.defineProperty(large, 'size', { value: 20 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText('从相册选择图片'), [valid, large]);
    expect(screen.getByRole('alert')).toHaveTextContent('20MB');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(api.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects a whole batch above twenty total images while preserving existing selections', async () => {
    const user = userEvent.setup();
    const { api } = setup({ initialItem: { ...item, imagePaths: Array.from({ length: 19 }, (_, index) => `saved-${index}`) } });
    await user.upload(screen.getByLabelText('从相册选择图片'), [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })]);
    expect(screen.getByRole('alert')).toHaveTextContent('20');
    expect(screen.getAllByRole('button', { name: /^移除图片 / })).toHaveLength(19);
    expect(api.uploadImage).not.toHaveBeenCalled();
  });

  it('retries a partially completed multi-file upload without reuploading the successful file', async () => {
    const user = userEvent.setup();
    const uploadImage = vi.fn().mockResolvedValueOnce({ imageId: 'first-id' }).mockRejectedValueOnce(new Error('第二张上传失败')).mockResolvedValueOnce({ imageId: 'second-id' });
    const { onSave } = setup({ api: { uploadImage } });
    await user.upload(screen.getByLabelText('从相册选择图片'), [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })]);
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('第二张上传失败');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByRole('img', { name: /^待上传图片/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imagePaths: ['first-id', 'second-id'], imagePath: 'first-id' })));
    expect(uploadImage).toHaveBeenCalledTimes(3);
  });

  it('revokes local previews after removal, close, and a privacy access change and ignores a late upload', async () => {
    const user = userEvent.setup();
    let accessChanged; const upload = deferred();
    const { api, onSave, rerenderEditor } = setup({ api: { onAccessChange: listener => { accessChanged = listener; return () => {}; }, uploadImage: vi.fn(() => upload.promise) } });
    await selectPhoto(user, 'first.png');
    await user.click(screen.getByRole('button', { name: '移除图片 1' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    await selectPhoto(user, 'second.png');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    act(() => accessChanged());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    await act(async () => upload.resolve({ imageId: 'late-private-upload' }));
    expect(onSave).not.toHaveBeenCalled();
    await selectPhoto(user, 'third.png');
    rerenderEditor({ open: false });
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it('keeps a selected File and information tab draft through an ordinary project refresh', async () => {
    const user = userEvent.setup();
    const { api, onSave, rerenderEditor } = setup();
    await user.type(screen.getByLabelText('颜色1'), '蓝色');
    await selectPhoto(user);
    await user.click(screen.getByRole('tab', { name: '信息页' }));
    rerenderEditor({ item: { ...item }, categories: categories.map(category => ({ ...category })), locations: [] });
    expect(screen.getByRole('tab', { name: '信息页' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('cell', { name: '蓝色' })).toBeInTheDocument();
    expect(api.uploadImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: '编辑页' }));
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(screen.getByLabelText('颜色1')).toHaveValue('蓝色');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imagePath: 'staged-image', variants: [{ color: '蓝色', size: '', isPackaged: false, quantity: 1, imageId: 'staged-image' }] })));
  });

  it('offers the image picker beside both tabs and keeps information-page selections local until Save', async () => {
    const user = userEvent.setup();
    const { api, onSave } = setup();
    const picker = screen.getByRole('button', { name: '选择图片' });
    const tabs = screen.getByRole('tablist', { name: '物品页面' });
    expect(picker.closest('.item-editor-modal__toolbar')).toContainElement(tabs);
    expect(tabs).not.toContainElement(picker);
    await user.click(screen.getByRole('tab', { name: '信息页' }));
    expect(picker).toBeVisible();
    await selectPhoto(user);
    expect(api.uploadImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: '编辑页' }));
    expect(screen.getByRole('img', { name: '待上传图片1：相册照片.png' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imagePaths: ['staged-image'] })));
  });

  it('shows a save failure on the information page while preserving the selected photo and rows', async () => {
    const user = userEvent.setup();
    const { onSave } = setup({ api: { uploadImage: vi.fn().mockRejectedValue(new Error('上传断开')) } });
    await user.type(screen.getByLabelText('颜色1'), '蓝色');
    await selectPhoto(user);
    await user.click(screen.getByRole('tab', { name: '信息页' }));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('上传断开');
    expect(screen.getByRole('cell', { name: '蓝色' })).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: '编辑页' }));
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(screen.getByLabelText('颜色1')).toHaveValue('蓝色');
  });

  it('cancels a selected photo without reading or uploading it', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { api, readFile, onClose, onSave } = setup();
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('validates name and category before reading or uploading a selected photo', async () => {
    const user = userEvent.setup();
    const { api, readFile, onSave } = setup({ initialItem: { ...item, name: '', categoryId: '' } });
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('请填写物品名称')).toBeInTheDocument();
    await user.type(screen.getByLabelText('名称'), '照片物品');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('请先选择分类')).toBeInTheDocument();
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uploads only on Save and passes its returned image ID to the awaited record save', async () => {
    const user = userEvent.setup();
    const upload = deferred();
    const save = deferred();
    const onSave = vi.fn(() => save.promise);
    const { api, readFile } = setup({ api: { uploadImage: vi.fn(() => upload.promise) }, onSave });
    await selectPhoto(user);
    await user.selectOptions(screen.getByLabelText('子分类'), 'stationery');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
    expect(screen.getByLabelText('名称')).toBeDisabled();
    expect(screen.getByLabelText('主分类')).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '关闭物品弹窗' })).toBeDisabled();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    await act(async () => upload.resolve({ imageId: 'uploaded-after-classification' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'stationery', imagePath: 'uploaded-after-classification' }));
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    await act(async () => save.resolve());
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    expect(screen.getByLabelText('名称')).toBeEnabled();
  });

  it('keeps the draft and selected File after upload failure so Save can retry', async () => {
    const user = userEvent.setup();
    const uploadImage = vi.fn().mockRejectedValueOnce(new Error('上传断开')).mockResolvedValueOnce({ imageId: 'retry-image' });
    const { onSave } = setup({ api: { uploadImage } });
    await selectPhoto(user);
    await user.type(screen.getByLabelText('颜色1'), '保留这段草稿');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('上传断开')).toBeInTheDocument();
    expect(screen.getByLabelText('颜色1')).toHaveValue('保留这段草稿');
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imagePath: 'retry-image', variants: [{ color: '保留这段草稿', size: '', isPackaged: false, quantity: 1, imageId: 'retry-image' }] })));
    expect(uploadImage).toHaveBeenCalledTimes(2);
  });

  it('reuses a successful staged upload after record save failure', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValueOnce(new Error('保存断开')).mockResolvedValueOnce(undefined);
    const { api, access } = setup({ onSave, imageOptions: { maxBytes: 5 }, api: { readImage: vi.fn(async () => new Blob(['photo'])) } });
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('保存断开')).toBeInTheDocument();
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const ordinary = access.current.acquire('ordinary');
    await expect(ordinary.promise).resolves.toBe('blob:saved-image');
    ordinary.release();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls.map(([draft]) => draft.imagePath)).toEqual(['staged-image', 'staged-image']);
  });

  it.each(['cancel', 'unmount', 'remove-file'])('revokes the local preview after a failed save followed by %s', async change => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSave = vi.fn().mockRejectedValue(new Error('保存失败'));
    const { onClose, rerenderEditor } = setup({ onSave });
    await selectPhoto(user, 'first.png');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByText('保存失败')).toBeInTheDocument();
    if (change === 'cancel') {
      await user.click(screen.getByRole('button', { name: '取消', exact: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      rerenderEditor({ open: false });
    } else if (change === 'unmount') rerenderEditor({ editorPresent: false });
    else await user.click(screen.getByRole('button', { name: '移除图片 1' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:saved-image');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('preserves a dirty draft and selected File when the same record and catalogs refresh', async () => {
    const user = userEvent.setup();
    const { api, onSave, rerenderEditor } = setup();
    await user.type(screen.getByLabelText('颜色1'), '不能被项目刷新覆盖');
    await selectPhoto(user);
    rerenderEditor({ item: { ...item, name: '服务器更新的名称' }, categories: categories.map((category) => ({ ...category })), locations: [...locations] });

    expect(screen.getByLabelText('名称')).toHaveValue('标签机');
    expect(screen.getByLabelText('颜色1')).toHaveValue('不能被项目刷新覆盖');
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: '标签机', variants: [{ color: '不能被项目刷新覆盖', size: '', isPackaged: false, quantity: 1, imageId: 'staged-image' }], imagePath: 'staged-image' })));
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending save frozen with its File and draft when same-record props refresh', async () => {
    const user = userEvent.setup();
    const upload = deferred();
    const { api, onSave, rerenderEditor } = setup({ api: { uploadImage: vi.fn(() => upload.promise) } });
    await user.type(screen.getByLabelText('颜色1'), '上传时保留');
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    rerenderEditor({ item: { ...item }, categories: categories.map((category) => ({ ...category })), locations: [...locations] });

    expect(screen.getByLabelText('颜色1')).toHaveValue('上传时保留');
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(screen.getByLabelText('颜色1')).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    await act(async () => upload.resolve({ imageId: 'refreshed-upload' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ variants: [{ color: '上传时保留', size: '', isPackaged: false, quantity: 1, imageId: 'refreshed-upload' }], imagePath: 'refreshed-upload' }));
  });

  it.each(['close', 'unmount'])('does not save an obsolete upload after editor %s while its image provider remains mounted', async (endSession) => {
    const user = userEvent.setup();
    const upload = deferred();
    const { api, onSave, rerenderEditor } = setup({ api: { uploadImage: vi.fn(() => upload.promise) } });
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    rerenderEditor(endSession === 'close' ? { open: false } : { editorPresent: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => upload.resolve({ imageId: 'obsolete-upload' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:saved-image');
  });

  it('starts a fresh draft on record switch and ignores the previous record upload', async () => {
    const user = userEvent.setup();
    const upload = deferred();
    const { api, onSave, rerenderEditor } = setup({ api: { uploadImage: vi.fn(() => upload.promise) } });
    await user.type(screen.getByLabelText('颜色1'), '上一个物品的草稿');
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    rerenderEditor({ item: { ...item, id: 'item-2', name: '第二个物品' } });
    expect(screen.getByLabelText('名称')).toHaveValue('第二个物品');
    expect(screen.getByLabelText('颜色1')).toHaveValue('');
    expect(screen.getByLabelText('颜色1')).toBeEnabled();
    expect(screen.queryByText('相册照片.png')).not.toBeInTheDocument();
    await act(async () => upload.resolve({ imageId: 'old-record-upload' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the gallery editor open while saving and after an error, then closes on success', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onSave = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(undefined);
    setup({ gallery: true, onSave });
    await user.click(screen.getByRole('button', { name: '新增物品' }));
    await user.type(screen.getByLabelText('名称'), '新物品');
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => pending.reject(new Error('项目未写入')));
    expect(await screen.findByText('项目未写入')).toBeInTheDocument();
    expect(screen.getByLabelText('名称')).toHaveValue('新物品');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
