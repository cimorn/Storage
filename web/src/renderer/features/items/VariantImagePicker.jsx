import { useEffect, useRef, useState } from 'react';
import VariantImageThumbnail from './VariantImageThumbnail';

export default function VariantImagePicker({ value, index, options, assignedImages, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find(option => option.id === value);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  function choose(imageId) { onChange(imageId); setOpen(false); }
  return <div className="variant-image-picker" ref={rootRef} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className="variant-image-picker__trigger" aria-label={`规格${index + 1}图片`} aria-expanded={open} title="关联规格图片" onClick={() => setOpen(!open)}>
      <VariantImageThumbnail imageId={selected?.savedId} url={selected?.url} alt={`规格${index + 1}图片缩略图`} />
    </button>
    {open ? <div className="variant-image-picker__popover" role="group" aria-label={`规格${index + 1}可选图片`}>
      <div className="variant-image-picker__grid">{options.map((option, optionIndex) => {
        const unavailable = option.id !== value && assignedImages.has(option.id);
        return <button key={option.id} type="button" aria-label={`选择图片${optionIndex + 1}`} aria-pressed={option.id === value} disabled={unavailable} title={unavailable ? '已关联其他规格' : `图片${optionIndex + 1}`} onClick={() => choose(option.id)}>
          <VariantImageThumbnail imageId={option.savedId} url={option.url} alt={`可选图片${optionIndex + 1}`} /><span>{optionIndex + 1}</span>
        </button>;
      })}</div>
      {!options.length ? <p>先在上方选择图片</p> : null}
      <button className="variant-image-picker__clear" type="button" onClick={() => choose('')}>不关联图片</button>
    </div> : null}
  </div>;
}
