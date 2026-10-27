import { useRef, useState } from 'react';
import { useImagePreviewState } from '../web/ImageAccessContext';
import { formatItemVariants, getItemVariants, getVariantQuantity, hasItemPackaging } from '../../../../shared/item-variants.mjs';
import { getItemImageIds } from '../../../../shared/item-images.mjs';

export default function ItemGalleryCard({ item, bulkMode = false, bulkSelected = false, onClick }) {
  const imageTargetRef = useRef(null);
  const imageIds = getItemImageIds(item);
  const [selectedImageId, setSelectedImageId] = useState('');
  const imageIndex = Math.max(0, imageIds.indexOf(selectedImageId));
  const currentImageId = imageIds[imageIndex] || '';
  const currentVariant = currentImageId ? getItemVariants(item).find(row => row.imageId === currentImageId) : null;
  const currentSpecification = currentVariant ? formatItemVariants({ variants: [currentVariant] }) : item.note;
  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);
  const { url: imageSrc, status: imageStatus } = useImagePreviewState(currentImageId, imageIndex === 0 ? item.imageSrc : '', { targetRef: imageTargetRef });
  const className = ['item-gallery-card', bulkSelected ? 'is-bulk-selected' : '']
    .filter(Boolean)
    .join(' ');

  function changeImage(delta) {
    const next = Math.max(0, Math.min(imageIds.length - 1, imageIndex + delta));
    if (imageIds[next]) setSelectedImageId(imageIds[next]);
  }

  function pointerDown(event) {
    if (imageIds.length < 2 || event.isPrimary === false || event.button !== 0) return;
    gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    const start = gestureRef.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      suppressClickRef.current = true;
      event.preventDefault();
    }
  }

  function pointerUp(event) {
    const start = gestureRef.current;
    gestureRef.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      suppressClickRef.current = true;
      changeImage(dx < 0 ? 1 : -1);
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <button
      ref={imageTargetRef}
      type="button"
      className={className}
      onPointerDown={() => { suppressClickRef.current = false; }}
      onClick={event => {
        if (suppressClickRef.current) { suppressClickRef.current = false; event.preventDefault(); return; }
        onClick?.(event);
      }}
      onKeyDown={event => {
        if (['Enter', ' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) suppressClickRef.current = false;
        if (imageIds.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault(); changeImage(event.key === 'ArrowRight' ? 1 : -1);
        }
      }}
      aria-label={item.title}
      aria-pressed={bulkMode ? bulkSelected : undefined}
    >
      {bulkMode ? <span className="item-gallery-card__select-mark">{bulkSelected ? '已选' : '选择'}</span> : null}
      <div className="item-gallery-card__image-shell" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={() => { gestureRef.current = null; }}>
        {imageSrc ? (
          <img className="item-gallery-card__image" src={imageSrc} alt={item.title} loading="lazy" draggable={false} />
        ) : (
          <div className="item-gallery-card__image item-gallery-card__image--placeholder" aria-label={`${item.title} 占位图`}>
            {imageStatus === 'none' ? '无图' : imageStatus === 'error' ? '图片加载失败' : '图片加载中…'}
          </div>
        )}
        {currentVariant ? <span className="item-gallery-card__quantity" aria-label={`当前规格数量${getVariantQuantity(currentVariant)}`} aria-live="polite">{getVariantQuantity(currentVariant)}</span> : null}
        {imageIds.length > 1 ? <span className="item-gallery-card__image-count" aria-live="polite" aria-label={`第${imageIndex + 1}张，共${imageIds.length}张`}>{imageIndex + 1}/{imageIds.length}</span> : null}
      </div>

      <div className="item-gallery-card__content">
        <div className="item-gallery-card__title-row">
          <strong>{item.title}</strong>
        </div>
        <div className="item-gallery-card__variant-row">{currentSpecification}</div>
        <div className="item-gallery-card__meta-row">
          <span className="item-gallery-card__meta-text">{item.metaLine || '未填写品牌或款式'}</span>
          {hasItemPackaging(item) ? (
            <svg className="item-gallery-card__packaging" role="img" aria-label="有包装" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" focusable="false">
              <title>有包装</title>
              <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4" />
            </svg>
          ) : null}
        </div>
      </div>
    </button>
  );
}
