import { getVariantQuantity } from '../../../../shared/item-variants.mjs';
import VariantImageThumbnail from './VariantImageThumbnail';

export default function ItemInformationPage({ variants, imageOptions = [], categoryPath = '', locationPaths = [] }) {
  let count;
  try { count = variants.reduce((total, row) => total + getVariantQuantity(row), 0); } catch { count = null; }
  return (
    <div className="item-information-page">
      <dl className="item-information-page__metadata">
        <div><dt>分类</dt><dd>{categoryPath || '未选择分类'}</dd></div>
        <div><dt>位置</dt><dd>{locationPaths.length ? <ul>{locationPaths.map((path, index) => <li key={index}>{path}</li>)}</ul> : '未设置位置'}</dd></div>
      </dl>
      <p className="item-information-page__count">{count === null ? '请检查数量' : `共${count}件`}</p>
      <table className="item-information-table" aria-label="物品规格信息">
        <thead><tr><th scope="col">图片</th><th scope="col">颜色</th><th scope="col">尺码</th><th scope="col">数量</th><th scope="col">有无包装</th></tr></thead>
        <tbody>
          {variants.map(row => {
            const image = imageOptions.find(option => option.id === row.imageId);
            return <tr key={row.rowKey}><td>{image ? <VariantImageThumbnail imageId={image.savedId} url={image.url} alt={`${row.color || '规格'}图片`} /> : '—'}</td><td>{row.color.trim() || '—'}</td><td>{row.size.trim() || '—'}</td><td>{String(row.quantity ?? '').trim() || '1'}</td><td>{row.isPackaged ? '有包装' : '无包装'}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
