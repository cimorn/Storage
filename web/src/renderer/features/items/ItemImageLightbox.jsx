import { useEffect, useRef, useState } from 'react';
import { useImageAccess, useImagePreviewState } from '../web/ImageAccessContext';

export default function ItemImageLightbox({ image, onClose }) {
  const closeRef = useRef(null);
  const access = useImageAccess();
  const [full, setFull] = useState(null);
  const preview = useImagePreviewState(image.savedId || '');
  const source = image.url || (full?.access === access && full.id === image.savedId ? full.url : '') || preview.url;
  useEffect(() => {
    if (!image.savedId || !access) return undefined;
    const controller = new AbortController();
    let cancelled = false, url;
    const timer = setTimeout(() => controller.abort(), 12000);
    access.readFull(image.savedId, { signal: controller.signal }).then(blob => {
      if (cancelled || controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setFull({ access, id: image.savedId, url });
    }).catch(() => {}).finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [access, image.savedId]);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="item-image-lightbox" onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
    }}>
    <div role="dialog" aria-modal="true" aria-label="图片预览" className="item-image-lightbox__dialog">
      <button ref={closeRef} className="item-image-lightbox__close" type="button" aria-label="关闭图片预览" onClick={onClose}>×</button>
      {source ? <img src={source} alt={image.label || '物品图片'} /> : <p role="status">{preview.status === 'error' ? '图片暂不可用' : '读取图片…'}</p>}
    </div>
  </div>;
}
