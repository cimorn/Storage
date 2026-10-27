import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';
import { buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';
import { ImageAccessProvider } from '../../src/renderer/features/web/ImageAccessContext';
import { formatItemVariants } from '../../shared/item-variants.mjs';

const row=(color,size,imageId,quantity=1)=>({color,size,imageId,quantity,isPackaged:false});
const item={id:'shirt',name:'T恤',brand:'Demo',specification:'印花',categoryId:'cat',imagePath:'a',imagePaths:['a','b'],variants:[row('红','M','a',3),row('白','L','b')]};
function setup(card=false){
  const api={readImage:vi.fn(async()=>new Blob(['image'],{type:'image/webp'})),uploadImage:vi.fn(async()=>({imageId:'pending-new'}))},onSave=vi.fn();
  URL.createObjectURL=vi.fn(()=>'blob:qa');URL.revokeObjectURL=vi.fn();
  const result=render(<ImageAccessProvider api={api}>{card?<ItemGalleryCard item={buildItemCardView(item)}/>:<ItemEditorModal open item={item} categories={[{id:'cat',name:'服装'}]} onSave={onSave}/>}</ImageAccessProvider>);
  return{...result,api,onSave,user:userEvent.setup()};
}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('size groups and specification ordering',()=>{
  it('groups colors under their first-seen size instead of listing independent colors and sizes',()=>{
    expect(formatItemVariants({variants:[row('蓝','M','a'),row('白','L','b'),row('红','M','c'),row('蓝','M','d')]})).toBe('蓝/红·M | 白·L');
    expect(formatItemVariants({variants:[row('蓝','','a'),row('红','','b'),row('','M','c')]})).toBe('蓝/红 | M');
  });
  it('keeps grouped item details while switching photo quantities, and moves the brand beside the title',async()=>{
    const{container}=setup(true);await act(async()=>{});
    expect(container.querySelector('.item-gallery-card__title-row')).toHaveTextContent('T恤Demo');
    expect(container.querySelector('.item-gallery-card__meta-row')).toHaveTextContent(/^印花$/);
    expect(container.querySelector('.item-gallery-card__variant-row')).toHaveTextContent('红·M | 白·L');
    expect(screen.getByLabelText('当前规格数量3')).toBeInTheDocument();
    await act(async()=>fireEvent.keyDown(screen.getByRole('button',{name:'T恤',exact:true}),{key:'ArrowRight'}));
    expect(screen.getByLabelText('当前规格数量1')).toBeInTheDocument();
    expect(container.querySelector('.item-gallery-card__variant-row')).toHaveTextContent('红·M | 白·L');
  });
  it('moves a specification with the keyboard and makes its associated image the cover on Save',async()=>{
    const{user,onSave,api}=setup();
    screen.getByRole('button',{name:'拖动规格2',exact:true}).focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByLabelText('颜色1')).toHaveValue('白');
    await user.click(screen.getByRole('button',{name:'保存',exact:true}));
    await waitFor(()=>expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({imagePath:'b',imagePaths:['b','a'],variants:[{imageId:'b',quantity:1},{imageId:'a',quantity:3}]});
    expect(api.uploadImage).not.toHaveBeenCalled();
  });
  it('supports a pointer drag before another row without changing quantities',async()=>{
    const{user,onSave}=setup();
    const handle=screen.getByRole('button',{name:'拖动规格2',exact:true}),target=screen.getByRole('group',{name:'规格1',exact:true});
    Object.defineProperty(document,'elementFromPoint',{configurable:true,value:vi.fn(()=>target)});
    vi.spyOn(target,'getBoundingClientRect').mockReturnValue({top:100,height:32});
    const dispatch=(type,y)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,button:0,isPrimary:true,clientX:20,clientY:y});fireEvent(handle,event);};
    await act(async()=>{dispatch('pointerdown',200);dispatch('pointermove',90);dispatch('pointerup',90);});
    expect(screen.getByLabelText('颜色1')).toHaveValue('白');
    await user.click(screen.getByRole('button',{name:'保存',exact:true}));
    await waitFor(()=>expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].variants.map(value=>value.quantity)).toEqual([1,3]);
  });
  it('previews a pending photo as cover after its specification moves first and saves the real uploaded ID',async()=>{
    const{user,onSave,container}=setup();
    await user.upload(screen.getByLabelText('从相册选择图片'),new File(['new'],'new.png',{type:'image/png'}));
    await user.click(screen.getByRole('button',{name:'添加颜色',exact:true}));
    screen.getByRole('button',{name:'拖动规格3',exact:true}).focus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(container.querySelector('.web-item-image-strip').firstElementChild.querySelector('img')).toHaveAttribute('alt','待上传图片1：new.png');
    await user.click(screen.getByRole('button',{name:'保存',exact:true}));
    await waitFor(()=>expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({imagePath:'pending-new',imagePaths:['pending-new','a','b'],variants:[{imageId:'pending-new',quantity:1},{imageId:'a',quantity:3},{imageId:'b',quantity:1}]});
  });
});
