import { useState } from 'react';
import { MAX_VARIANT_QUANTITY } from '../../../../shared/item-variants.mjs';
import VariantImageThumbnail from './VariantImageThumbnail';
import useVariantDrag from './useVariantDrag';

export default function ItemVariantFields({ variants, imageOptions = [], maxVariants, onChange, onAdd, onRemove, onReorder, onUpload, onRemoveImage, onPreview }) {
  const { rootRef, drag, handleProps } = useVariantDrag(variants, onReorder);
  const [managing, setManaging] = useState(false);
  const [sorting, setSorting] = useState(false);
  return (
    <section className="item-variant-editor" aria-label="物品规格" ref={rootRef}>
      <div className="item-variant-editor__heading">
        <strong>规格</strong>
        <div className="item-variant-editor__heading-actions">
          {managing ? <>
            {!sorting ? <button className="item-variant-editor__manage" type="button" aria-label="添加颜色" title="添加颜色和尺码" disabled={variants.length >= maxVariants} onClick={onAdd}>添加</button> : null}
            <button className="item-variant-editor__manage" type="button" aria-label={sorting ? '返回规格填写' : '排序规格'} onClick={() => setSorting(!sorting)}>{sorting ? '填写' : '排序'}</button>
            <button className="item-variant-editor__manage" type="button" aria-label="完成规格编辑" onClick={() => { setSorting(false); setManaging(false); }}>完成</button>
          </> : <button className="item-variant-editor__manage" type="button" aria-label="编辑规格" onClick={() => setManaging(true)}>编辑</button>}
        </div>
      </div>
      {variants.map((row, index) => {
        const imageIndex = imageOptions.findIndex(option => option.id === row.imageId);
        const image = imageOptions[imageIndex];
        return (
        <div className={`item-variant-editor__row${sorting ? ' is-sorting' : ''}${drag?.targetKey === String(row.rowKey) ? ` is-drop-${drag.position}` : ''}`} data-variant-row={row.rowKey} role="group" aria-label={`规格${index + 1}`} key={row.rowKey}>
          {sorting ? <button className="item-variant-editor__sort-handle" type="button" aria-label={`拖动规格${index + 1}`} title="拖动排序，也可用上下方向键" {...handleProps(row)}><span aria-hidden="true">⠿</span><span>{row.color.trim() || '—'}</span><span>·</span><span>{row.size.trim() || '—'}</span></button> : <>
          <div className="item-variant-editor__photo">
            {image ? <>
              <VariantImageThumbnail imageId={image.savedId} url={image.url} alt={image.alt || image.label} previewLabel={`放大规格${index + 1}图片`} onPreview={previewUrl => onPreview({ ...image, previewUrl })} />
              <button type="button" className="item-variant-editor__clear-image" aria-label={`移除图片 ${imageIndex + 1}`} title="移除图片" onClick={() => onRemoveImage(image.id)}>×</button>
            </> : <span className="item-variant-editor__empty-photo" aria-hidden="true" />}
          </div>
          <input className="item-variant-editor__color" aria-label={`颜色${index + 1}`} title="颜色" placeholder="颜色" maxLength={128} value={row.color} onChange={event => onChange(row.rowKey, { color: event.target.value })} />
          <input className="item-variant-editor__size" aria-label={`尺码${index + 1}`} title="尺码" placeholder="尺码" maxLength={128} value={row.size} onChange={event => onChange(row.rowKey, { size: event.target.value })} />
          <input className="item-variant-editor__quantity" type="number" inputMode="numeric" min="1" max={MAX_VARIANT_QUANTITY} step="1" aria-label={`数量${index + 1}`} title="数量，留空为1" placeholder="1" value={row.quantity ?? ''} onChange={event => onChange(row.rowKey, { quantity: event.target.value })} />
          <div className="item-variant-editor__controls" role="group" aria-label={`规格${index + 1}操作`}>
            <label className="item-variant-editor__packaging" title="有包装">
              <input type="checkbox" aria-label={`包装${index + 1}`} title="有包装" checked={row.isPackaged} onChange={event => onChange(row.rowKey, { isPackaged: event.target.checked })} />
            </label>
            <button className="item-variant-editor__upload" type="button" aria-label={`上传规格${index + 1}图片`} title={image ? '替换图片' : '上传图片'} onClick={() => onUpload(row.rowKey)}>＋</button>
            <button className="item-variant-editor__remove" type="button" aria-label={`移除规格${index + 1}`} title="移除颜色和尺码" disabled={variants.length <= 1} onClick={() => onRemove(row.rowKey)}>×</button>
          </div>
          </>}
        </div>
      ); })}
      {variants.length >= maxVariants ? <p className="item-variant-editor__hint">最多支持{maxVariants}条规格</p> : null}
    </section>
  );
}
