import { useRef } from 'react';
import { useImagePreviewState } from '../web/ImageAccessContext';

export default function VariantImageThumbnail({ imageId = '', url = '', alt = '', onPreview, previewLabel }) {
  const targetRef = useRef(null);
  const preview = useImagePreviewState(url ? '' : imageId, '', { targetRef });
  const source = url || preview.url;
  const content = <span className="variant-image-thumbnail" ref={targetRef}>
    {source ? <img src={source} alt={alt} draggable={false} loading="lazy" decoding="async" /> : (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m4 18 5-5 3 3 4-6 5 7" /></svg>
    )}
  </span>;
  return onPreview ? <button type="button" className="variant-image-open" aria-label={previewLabel || `放大${alt}`} onClick={onPreview}>{content}</button> : content;
}
