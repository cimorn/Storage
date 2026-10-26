export default function ItemVariantFields({ variants, maxVariants, onChange, onAdd, onRemove }) {
  return (
    <section className="item-variant-editor" aria-label="物品规格">
      <div className="item-variant-editor__heading">
        <strong>规格</strong>
        <div className="item-variant-editor__heading-actions">
          <span>{`共${variants.length}件`}</span>
          <button className="item-variant-editor__add" type="button" aria-label="添加颜色" title="添加颜色和尺码" disabled={variants.length >= maxVariants} onClick={onAdd}>＋</button>
        </div>
      </div>
      {variants.map((row, index) => (
        <div className="item-variant-editor__row" role="group" aria-label={`规格${index + 1}`} key={row.rowKey}>
          <input className="item-variant-editor__color" aria-label={`颜色${index + 1}`} title="颜色" placeholder="颜色" maxLength={128} value={row.color} onChange={event => onChange(row.rowKey, { color: event.target.value })} />
          <input className="item-variant-editor__size" aria-label={`尺码${index + 1}`} title="尺码" placeholder="尺码" maxLength={128} value={row.size} onChange={event => onChange(row.rowKey, { size: event.target.value })} />
          <div className="item-variant-editor__controls" role="group" aria-label={`规格${index + 1}操作`}>
            <label className="item-variant-editor__packaging" title="有包装">
              <input type="checkbox" aria-label={`包装${index + 1}`} title="有包装" checked={row.isPackaged} onChange={event => onChange(row.rowKey, { isPackaged: event.target.checked })} />
            </label>
            <button className="item-variant-editor__remove" type="button" aria-label={`移除规格${index + 1}`} title="移除颜色和尺码" disabled={variants.length <= 1} onClick={() => onRemove(row.rowKey)}>×</button>
          </div>
        </div>
      ))}
      {variants.length >= maxVariants ? <p className="item-variant-editor__hint">最多支持{maxVariants}件</p> : null}
    </section>
  );
}
