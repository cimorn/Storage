import { useEffect, useRef } from 'react';

import ItemGalleryCard from './ItemGalleryCard';
import { observeScrollReveal } from './scroll-reveal';
import './scroll-reveal.css';

export default function ItemGalleryGrid({ items, hasItems = false, bulkMode = false, bulkSelectedIds = new Set(), onSelect }) {
  const gridRef = useRef(null);
  const seenRef = useRef(new WeakSet());
  useEffect(() => observeScrollReveal(gridRef.current, seenRef.current), [items]);

  if (!items.length) {
    return (
      <div className="item-gallery-empty">
        <p>{hasItems ? '没有找到物品' : '还没有物品'}</p>
        <span>{hasItems ? '试试换个关键词或筛选条件' : '点击「新增物品」开始记录'}</span>
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
