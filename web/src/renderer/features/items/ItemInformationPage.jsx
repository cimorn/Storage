export default function ItemInformationPage({ variants, legacyQuantity }) {
  return (
    <div className="item-information-page">
      <p className="item-information-page__count">{variants.length ? `共${variants.length}件` : `原数量：${legacyQuantity}`}</p>
      <table className="item-information-table" aria-label="物品规格信息">
        <thead><tr><th scope="col">颜色</th><th scope="col">尺码</th><th scope="col">有无包装</th></tr></thead>
        <tbody>
          {variants.map(row => <tr key={row.rowKey}><td>{row.color.trim() || '—'}</td><td>{row.size.trim() || '—'}</td><td>{row.isPackaged ? '有包装' : '无包装'}</td></tr>)}
        </tbody>
      </table>
      {!variants.length ? <p className="item-variant-editor__hint">原数量无法自动转换，请先在编辑页按实际件数添加规格。</p> : null}
    </div>
  );
}
