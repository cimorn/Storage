import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';
import { ImageAccessProvider } from '../../src/renderer/features/web/ImageAccessContext';
const item={id:'a',name:'衬衫',categoryId:'child',locationIds:['box'],imagePaths:['a','b'],variants:[{color:'蓝',size:'M',quantity:2,isPackaged:false,imageId:'a'},{color:'白',size:'L',quantity:1,isPackaged:true,imageId:'b'}]};
const categories=[{id:'root',name:'服装',parentId:null},{id:'child',name:'衬衫',parentId:'root'}];
const locations=[{id:'room',name:'卧室',parentId:null},{id:'box',name:'衣柜',parentId:'room'}];
function setup(extra={}){
  URL.createObjectURL=vi.fn(()=>'blob:preview');URL.revokeObjectURL=vi.fn();
  const onSave=vi.fn(),api={readImage:vi.fn(async()=>new Blob(['photo'])),uploadImage:vi.fn(async()=>({imageId:'new'}))};
  const view=render(<ImageAccessProvider api={api}><ItemEditorModal open item={item} categories={categories} locations={locations} onSave={onSave} {...extra}/></ImageAccessProvider>);
  return{...view,onSave,api,user:userEvent.setup()};
}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('cancels accidental row deletion and confirms one deletion including its photo',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const {user,onSave}=setup();
  await user.click(screen.getByRole('button',{name:'移除规格1',exact:true}));
  expect(screen.getByLabelText('颜色1')).toHaveValue('蓝');
  expect(screen.getByLabelText('数量1')).toHaveValue(2);
  await user.click(screen.getByRole('button',{name:'移除规格1',exact:true}));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('颜色1')).toHaveValue('白');
  await user.click(screen.getByRole('button',{name:'保存',exact:true}));
  await waitFor(()=>expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0]).toMatchObject({imagePaths:['b'],variants:[{color:'白',quantity:1,imageId:'b',isPackaged:true}]});
});
it('cancels a photo X without losing its association and confirms removal without deleting the row',async()=>{
  vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const {user,onSave}=setup();
  await user.click(screen.getByRole('button',{name:'移除图片 1',exact:true}));
  expect(screen.getByRole('button',{name:'放大规格1图片'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'移除图片 1',exact:true}));
  await user.click(screen.getByRole('button',{name:'保存',exact:true}));
  await waitFor(()=>expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0]).toMatchObject({imagePaths:['b'],variants:[{color:'蓝',quantity:2,imageId:''},{color:'白',imageId:'b'}]});
});
it('opens add/sort from Edit and reorders text rows without exposing inputs or changing row metadata',async()=>{
  const{user,onSave}=setup();
  expect(screen.queryByRole('button',{name:'添加颜色'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'拖动规格2'})).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'编辑规格'}));
  expect(screen.getByRole('button',{name:'添加颜色'})).toBeVisible();
  await user.click(screen.getByRole('button',{name:'排序规格'}));
  const region=screen.getByRole('region',{name:'物品规格'});
  expect(within(region).queryByRole('textbox')).not.toBeInTheDocument();
  expect(within(region).queryByRole('img')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'拖动规格2'}));
  await user.keyboard('{ArrowUp}');
  expect(screen.getByRole('button',{name:'拖动规格1'})).toHaveTextContent('白');
  await user.click(screen.getByRole('button',{name:'完成规格编辑'}));
  expect(screen.getByLabelText('颜色1')).toHaveValue('白');
  await user.click(screen.getByRole('button',{name:'保存',exact:true}));
  await waitFor(()=>expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0]).toMatchObject({imagePath:'b',variants:[{color:'白',quantity:1,isPackaged:true,imageId:'b'},{color:'蓝',quantity:2,imageId:'a'}]});
});
it('keeps compact accessible header paths and privacy beside the renamed tabs only when unlocked',async()=>{
  const {container,rerender}=setup({item:{...item,isPrivate:true},canManagePrivacy:true});
  expect(screen.getByRole('tab',{name:'编辑',exact:true})).toBeInTheDocument();
  expect(screen.getByRole('tab',{name:'信息',exact:true})).toBeInTheDocument();
  const header=within(container.querySelector('.item-editor-modal__header'));
  expect(header.getByText('服装/衬衫')).toBeInTheDocument();
  expect(header.getByText('卧室/衣柜')).toBeInTheDocument();
  const privacy=screen.getByRole('checkbox',{name:'隐私区',exact:true});
  expect(privacy.closest('.item-editor-modal__toolbar')).not.toBeNull();
  expect(screen.queryByText('所选分类或位置属于隐私区')).not.toBeInTheDocument();
});
it('does not render an empty style placeholder or style text',()=>{
  const {container}=render(<ItemGalleryCard item={{title:'衬衫',metaLine:''}}/>);
  expect(screen.queryByText('未填写款式')).not.toBeInTheDocument();
  expect(container.querySelector('.item-gallery-card__meta-text')).toBeNull();
});
