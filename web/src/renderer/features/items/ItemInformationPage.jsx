import VariantImageThumbnail from './VariantImageThumbnail';

export default function ItemInformationPage({ variants, imageOptions = [], onPreview }) {
  return (
    <div className="item-information-page">
      <table className="item-information-table" aria-label="物品规格信息">
        <thead><tr><th scope="col">图片</th><th scope="col">颜色</th><th scope="col">尺码</th><th scope="col">数量</th><th scope="col">包装</th></tr></thead>
        <tbody>
          {variants.map((row, index) => {
            const image = imageOptions.find(option => option.id === row.imageId);
            return <tr key={row.rowKey}><td>{image ? <VariantImageThumbnail imageId={image.savedId} url={image.url} alt={`${row.color || '规格'}图片`} previewLabel={`放大规格${index + 1}图片`} onPreview={onPreview ? previewUrl => onPreview({ ...image, previewUrl }) : undefined} /> : '—'}</td><td>{row.color.trim() || '—'}</td><td>{row.size.trim() || '—'}</td><td>{String(row.quantity ?? '').trim() || '1'}</td><td>{row.isPackaged ? '有' : '无'}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
