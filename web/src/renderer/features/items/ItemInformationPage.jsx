export default function ItemInformationPage({ variants, categoryPath = '', locationPaths = [] }) {
  return (
    <div className="item-information-page">
      <dl className="item-information-page__metadata">
        <div><dt>分类</dt><dd>{categoryPath || '未选择分类'}</dd></div>
        <div><dt>位置</dt><dd>{locationPaths.length ? <ul>{locationPaths.map((path, index) => <li key={index}>{path}</li>)}</ul> : '未设置位置'}</dd></div>
      </dl>
      <p className="item-information-page__count">{`共${variants.length}件`}</p>
      <table className="item-information-table" aria-label="物品规格信息">
        <thead><tr><th scope="col">颜色</th><th scope="col">尺码</th><th scope="col">有无包装</th></tr></thead>
        <tbody>
          {variants.map(row => <tr key={row.rowKey}><td>{row.color.trim() || '—'}</td><td>{row.size.trim() || '—'}</td><td>{row.isPackaged ? '有包装' : '无包装'}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
