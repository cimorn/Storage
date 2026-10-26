'use strict';

const {getItemImageIds}=require('../shared/item-images.mjs');
const {getItemVariants}=require('../shared/item-variants.mjs');

const TEXT_FIELDS = ['barcode', 'code', 'name', 'brand', 'specification', 'categoryId', 'imagePath'];

function variantContent(item) {
  const rows = getItemVariants(item);
  // Safe legacy counts and structured rows describe the same item units.
  // Their obsolete notes and redundant summary fields are format cleanup.
  // Preserve raw values when the old count cannot be converted safely.
  return rows.length
    ? [String(rows.length), rows.some(row => row.isPackaged), rows.map(row => [row.color, row.size, row.isPackaged])]
    : [String(item.quantity ?? ''), item.isPackaged === true, null, String(item.notes ?? '')];
}

function itemContent(item) {
  // Derived paths and catalog ordering are not item edits. Location order is
  // meaningful (the first location is primary), while tag order is not.
  const locations = Array.isArray(item.locationIds) ? item.locationIds : item.locationId ? [item.locationId] : [];
  return JSON.stringify([
    ...TEXT_FIELDS.map(field => String(item[field] ?? '')),
    [...new Set(locations)],
    getItemImageIds(item),
    variantContent(item),
    item.isPrivate === true,
    [...new Set(item.tags || [])].sort()
  ]);
}

function applyItemTimestamps(previousProject, nextProject, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  const previousItems = new Map((previousProject?.items || []).map(item => [item.id, item]));
  return {
    ...nextProject,
    items: (nextProject.items || []).map(item => {
      const previous = previousItems.get(item.id);
      if (!previous) return { ...item, createdAt: timestamp, updatedAt: timestamp };

      const next = { ...item };
      // Existing dates are authoritative, including their absence in legacy
      // records. Older clients may omit them; clients cannot rewrite history.
      for (const field of ['createdAt', 'updatedAt']) {
        if (previous[field] != null) next[field] = previous[field];
        else delete next[field];
      }
      if (itemContent(previous) !== itemContent(item)) next.updatedAt = timestamp;
      return next;
    })
  };
}

module.exports = { applyItemTimestamps };
