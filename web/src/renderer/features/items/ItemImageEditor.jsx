import { useRef } from 'react';
import { useImagePreviewState } from '../web/ImageAccessContext';

function SavedImage({ imageId, index, saving, onRemove }) {
  const targetRef = useRef(null);
  const preview = useImagePreviewState(imageId, '', { targetRef });
  return (
    <div className="web-item-image-thumbnail" ref={targetRef}>
      {preview.url ? <img src={preview.url} alt={`已保存图片${index + 1}`} draggable="false" loading="lazy" decoding="async" /> : (
        <span className="web-item-image-thumbnail__status" role="status">{preview.status === 'error' ? '图片暂不可用' : '读取图片…'}</span>
      )}
      {index === 0 ? <span className="web-item-image-thumbnail__cover">封面</span> : null}
      <button type="button" className="web-item-image-thumbnail__remove" aria-label={`移除图片 ${index + 1}`}
        disabled={saving} onClick={() => onRemove(imageId)}>×</button>
    </div>
  );
}

export default function ItemImageEditor({ imageIds, pendingImages, imageOrder, saving, onRemoveSaved, onRemovePending }) {
  const count = imageIds.length + pendingImages.length;
  const entries = [...imageIds.map(id => ({ id })), ...pendingImages.map((row, index) => ({ id: `pending:${row.key}`, row, pendingIndex: index }))];
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const ordered = imageOrder ? imageOrder.map(id => byId.get(id)).filter(Boolean) : entries;
  return (
    <div className={`web-item-image-selection${count ? ' has-images' : ''}`} aria-label="物品图片选择状态">
      {count ? <div className="web-item-image-strip" role="group" aria-label="物品图片，可横向滚动">
        {ordered.map((entry, position) => {
          if (!entry.row) return <SavedImage key={entry.id} imageId={entry.id} index={position} saving={saving} onRemove={onRemoveSaved} />;
          const { row, pendingIndex } = entry;
          return <div className="web-item-image-thumbnail" key={entry.id} title={row.file.name}>
            <img src={row.url} alt={`待上传图片${pendingIndex + 1}：${row.file.name}`} draggable="false" loading="lazy" decoding="async" />
            <span className="web-item-image-thumbnail__pending">{row.file.name}</span>
            {position === 0 ? <span className="web-item-image-thumbnail__cover">封面</span> : null}
            <button type="button" className="web-item-image-thumbnail__remove" aria-label={`移除图片 ${position + 1}`}
              disabled={saving} onClick={() => onRemovePending(row.key)}>×</button>
          </div>;
        })}
      </div> : <div className="web-item-image-selection__empty"><strong>尚未选择图片</strong><span>可多选图片，保存物品时上传</span></div>}
    </div>
  );
}
