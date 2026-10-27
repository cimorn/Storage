import { getVariantQuantity, MAX_VARIANT_QUANTITY } from '../../../../shared/item-variants.mjs';
import VariantImageThumbnail from './VariantImageThumbnail';
import useVariantDrag from './useVariantDrag';

export default function ItemVariantFields({ variants, imageOptions = [], maxVariants, onChange, onAdd, onRemove, onReorder, onUpload, onRemoveImage, onPreview }) {
  const { rootRef, drag, handleProps } = useVariantDrag(variants, onReorder);
  let count;
  try { count = variants.reduce((total, row) => total + getVariantQuantity(row), 0); } catch { count = null; }
  return (
    <section className="item-variant-editor" aria-label="物品规格" ref={rootRef}>
      <div className="item-variant-editor__heading">
        <strong>规格</strong>
        <div className="item-variant-editor__heading-actions">
          <span>{count === null ? '请检查数量' : `共${count}件`}</span>
          <button className="item-variant-editor__add" type="button" aria-label="添加颜色" title="添加颜色和尺码" disabled={variants.length >= maxVariants} onClick={onAdd}>＋</button>
        </div>
      </div>
      {variants.map((row, index) => {
        const imageIndex = imageOptions.findIndex(option => option.id === row.imageId);
        const image = imageOptions[imageIndex];
        return (
        <div className={`item-variant-editor__row${drag?.targetKey === String(row.rowKey) ? ` is-drop-${drag.position}` : ''}`} data-variant-row={row.rowKey} role="group" aria-label={`规格${index + 1}`} key={row.rowKey}>
          <button className="item-variant-editor__drag" type="button" aria-label={`拖动规格${index + 1}`} title="拖动排序，也可用上下方向键" {...handleProps(row)}>⠿</button>
          <div className="item-variant-editor__photo">
            {image ? <>
              <VariantImageThumbnail imageId={image.savedId} url={image.url} alt={image.alt || image.label} previewLabel={`放大规格${index + 1}图片`} onPreview={() => onPreview(image)} />
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
            <button className="item-variant-editor__remove" type="button" aria-label={`移除规格${index + 1}`} title="移除颜色和尺码" disabled={variants.length <= 1} onClick={() => onRemove(row.rowKey)}>×</button>
            <button className="item-variant-editor__upload" type="button" aria-label={`上传规格${index + 1}图片`} title={image ? '替换图片' : '上传图片'} onClick={() => onUpload(row.rowKey)}>＋</button>
          </div>
        </div>
      ); })}
      {variants.length >= maxVariants ? <p className="item-variant-editor__hint">最多支持{maxVariants}条规格</p> : null}
    </section>
  );
}
