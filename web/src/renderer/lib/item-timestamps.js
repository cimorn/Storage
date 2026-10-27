import { getItemImageIds } from '../../../shared/item-images.mjs';
import { getItemVariants, getVariantQuantity } from '../../../shared/item-variants.mjs';

const TEXT_FIELDS = ['barcode', 'code', 'name', 'brand', 'specification', 'categoryId', 'imagePath'];

function variantContent(item) {
  const rows = getItemVariants(item);
  // Safe legacy counts and structured rows describe the same item units.
  // Their obsolete notes and redundant summary fields are format cleanup.
  // Preserve raw values when the old count cannot be converted safely.
  return rows.length
    ? [String(rows.reduce((sum,row)=>sum+getVariantQuantity(row),0)), rows.some(row => row.isPackaged), rows.map(row => [row.color, row.size, row.isPackaged, getVariantQuantity(row), row.imageId||''])]
    : [String(item.quantity ?? ''), item.isPackaged === true, null, String(item.notes ?? '')];
}

function itemContent(item) {
  // Keep the same comparison as the server: derived paths/catalog ordering do
  // not count as item edits. The first location remains meaningful.
  const locations = Array.isArray(item.locationIds) ? item.locationIds : item.locationId ? [item.locationId] : [];
  return JSON.stringify([
    ...TEXT_FIELDS.map(field => String(item[field] ?? '')),
    [...new Set(locations)],
    variantContent(item),
    item.isPrivate === true,
    [...new Set(item.tags || [])].sort(),
    getItemImageIds(item)
  ]);
}

export function applyItemTimestamps(previousProject, nextProject, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  const previousItems = new Map((previousProject?.items || []).map(item => [item.id, item]));
  return {
    ...nextProject,
    items: (nextProject.items || []).map(item => {
      const previous = previousItems.get(item.id);
      if (!previous) return { ...item, createdAt: timestamp, updatedAt: timestamp };

      const next = { ...item };
      for (const field of ['createdAt', 'updatedAt']) {
        if (previous[field] != null) next[field] = previous[field];
        else delete next[field];
      }
      if (itemContent(previous) !== itemContent(item)) next.updatedAt = timestamp;
      return next;
    })
  };
}
