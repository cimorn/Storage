import { useEffect, useRef, useState } from 'react';

export default function useVariantDrag(variants, onReorder) {
  const rootRef = useRef(null), gestureRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const cancel = () => { gestureRef.current = null; setDrag(null); };
  useEffect(cancel, [variants]);
  function targetAt(event, sourceKey) {
    const node = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-variant-row]');
    if (!node || !rootRef.current?.contains(node) || node.dataset.variantRow === String(sourceKey)) return null;
    const targetKey = node.dataset.variantRow;
    if (!variants.some(row => String(row.rowKey) === targetKey)) return null;
    const bounds = node.getBoundingClientRect();
    return { targetKey, position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' };
  }
  function handleProps(row) {
    return {
      onPointerDown(event) {
        if (event.button !== 0 || event.isPrimary === false) return;
        event.preventDefault(); event.currentTarget.focus();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        gestureRef.current = { sourceKey: row.rowKey, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
      },
      onPointerMove(event) {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (!gesture.active && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return;
        gesture.active = true;
        const target = targetAt(event, gesture.sourceKey);
        setDrag({ sourceKey: gesture.sourceKey, ...target });
      },
      onPointerUp(event) {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const target = gesture.active ? targetAt(event, gesture.sourceKey) : null;
        cancel();
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (target) onReorder(gesture.sourceKey, target.targetKey, target.position);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown(event) {
        if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const index = variants.findIndex(value => value.rowKey === row.rowKey);
        const target = variants[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (target) onReorder(row.rowKey, target.rowKey, event.key === 'ArrowUp' ? 'before' : 'after');
      }
    };
  }
  return { rootRef, drag, handleProps };
}
