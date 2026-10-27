import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import VariantImageThumbnail from '../../src/renderer/features/items/VariantImageThumbnail';
import ItemImageLightbox from '../../src/renderer/features/items/ItemImageLightbox';
import { ImageAccessProvider } from '../../src/renderer/features/web/ImageAccessContext';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const item = { id: 'disk', name: '机械硬盘', categoryId: 'storage', locationIds: ['nas', 'spare'], imagePaths: ['a'], variants: [{color:'Red',size:'plus',quantity:2,imageId:'a',isPackaged:false}] };
const categories = [{id:'digital',name:'数码',parentId:null},{id:'storage',name:'存储',parentId:'digital'}];
const locations = [{id:'room',name:'325',parentId:null},{id:'desk',name:'桌下',parentId:'room'},{id:'nas',name:'NAS',parentId:'desk'},{id:'spare',name:'备用',parentId:null}];
it('shows category, every location and the draft total beside the title across tabs', async () => {
  const user = userEvent.setup();
  const {container} = render(<ItemEditorModal open item={item} categories={categories} locations={locations} canManagePrivacy={false} />);
  const header = within(container.querySelector('.item-editor-modal__header'));
  expect(header.getByText('数码 / 存储')).toBeInTheDocument();
  expect(header.getByText('325 / 桌下 / NAS；备用')).toBeInTheDocument();
  expect(header.getByText('共2件')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('数量1'), {target:{value:'4'}});
  await user.click(screen.getByRole('tab',{name:'信息页',exact:true}));
  expect(header.getByText('共4件')).toBeInTheDocument();
  const panel=within(screen.getByRole('tabpanel',{name:'信息页',exact:true}));
  expect(panel.queryByText('分类')).not.toBeInTheDocument();
  expect(panel.queryByText('位置')).not.toBeInTheDocument();
  expect(panel.queryByText('共4件')).not.toBeInTheDocument();
  expect(panel.getByRole('table')).toBeInTheDocument();
  await user.click(screen.getByRole('tab',{name:'标签',exact:true}));
  expect(header.getByText('数码 / 存储')).toBeVisible();
});
it('passes the already displayed thumbnail to preview rather than waiting for another lookup', async () => {
  const onPreview=vi.fn();
  URL.createObjectURL=vi.fn(()=>'blob:ready');URL.revokeObjectURL=vi.fn();
  render(<ImageAccessProvider api={{readImage:vi.fn(async()=>new Blob(['card']))}}><VariantImageThumbnail imageId="a" alt="缩略图" onPreview={onPreview}/></ImageAccessProvider>);
  await screen.findByRole('img',{name:'缩略图'});
  fireEvent.click(screen.getByRole('button',{name:'放大缩略图'}));
  expect(onPreview).toHaveBeenCalledWith('blob:ready');
});
it('uses the handed-off thumbnail in the first rendered frame while the full photo is pending', () => {
  const pending=new Promise(()=>{});
  const api={readImage:vi.fn(()=>pending)};
  render(<ImageAccessProvider api={api}><ItemImageLightbox image={{savedId:'a',label:'图片',previewUrl:'blob:ready'}} onClose={()=>{}}/></ImageAccessProvider>);
  expect(screen.getByRole('img',{name:'图片'})).toHaveAttribute('src','blob:ready');
});
