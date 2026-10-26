import { parseLegacyVariant } from '../../../../shared/item-variants.mjs';

export default function ItemVariantFields({ variants, notes, legacyQuantity, maxVariants, onChange, onAdd, onRemove }) {
  const originalNotes = typeof notes === 'string' && notes.trim() && !parseLegacyVariant(notes) ? notes : '';
  return (
    <section className="item-variant-editor" aria-label="物品规格">
      <div className="item-variant-editor__heading">
        <strong>规格</strong>
        <span>{variants.length ? `共${variants.length}件` : `原数量：${legacyQuantity}`}</span>
      </div>
      {originalNotes ? <div className="item-variant-editor__original"><span>原规格</span><p>{originalNotes}</p></div> : null}
      {!variants.length ? <p className="item-variant-editor__hint">原数量无法自动转换。请按实际件数添加规格；保存后，数量将以规格行数为准。</p> : null}
      {variants.map((row, index) => (
        <div className="item-variant-editor__row" role="group" aria-label={`规格${index + 1}`} key={row.rowKey}>
          <span className="item-variant-editor__number" aria-hidden="true">{index + 1}</span>
          <label className="field">
            <span>颜色</span>
            <input aria-label={`颜色${index + 1}`} placeholder="白色" maxLength={128} value={row.color} onChange={event => onChange(row.rowKey, { color: event.target.value })} />
          </label>
          <label className="field">
            <span>尺码</span>
            <input aria-label={`尺码${index + 1}`} placeholder="S" maxLength={128} value={row.size} onChange={event => onChange(row.rowKey, { size: event.target.value })} />
          </label>
          <label className="item-variant-editor__packaging">
            <input type="checkbox" aria-label={`包装${index + 1}`} checked={row.isPackaged} onChange={event => onChange(row.rowKey, { isPackaged: event.target.checked })} />
            <span>包装</span>
          </label>
          <button className="ghost-button item-variant-editor__remove" type="button" aria-label={`移除规格${index + 1}`} disabled={variants.length <= 1} onClick={() => onRemove(row.rowKey)}>移除</button>
        </div>
      ))}
      <button className="secondary-button item-variant-editor__add" type="button" disabled={variants.length >= maxVariants} onClick={onAdd}>添加规格</button>
      {variants.length >= maxVariants ? <p className="item-variant-editor__hint">最多支持{maxVariants}件</p> : null}
    </section>
  );
}
