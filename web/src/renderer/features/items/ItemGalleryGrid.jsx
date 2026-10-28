import { useEffect, useRef } from 'react';

import ItemGalleryCard from './ItemGalleryCard';
import { observeScrollReveal } from './scroll-reveal';
import './scroll-reveal.css';

export default function ItemGalleryGrid({ items, bulkMode = false, bulkSelectedIds = new Set(), onSelect }) {
  const gridRef = useRef(null);
  const seenRef = useRef(new WeakSet());
  useEffect(() => observeScrollReveal(gridRef.current, seenRef.current), [items]);

  if (!items.length) {
    return (
      <div className="item-gallery-empty">
        <p>没有匹配物品</p>
        <span>换个筛选，或者直接新增。</span>
      </div>
    );
  }

  return (
    <div ref={gridRef} className="item-gallery-grid item-gallery-grid--showcase">
      {items.map((item) => (
        <ItemGalleryCard
          key={item.id}
          item={item}
          bulkMode={bulkMode}
          bulkSelected={bulkSelectedIds.has(item.id)}
          onClick={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
}
