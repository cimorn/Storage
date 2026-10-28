import { getItemLocationIds } from '../../lib/project-data';

// Callers supply their currently authorized projection, never hidden inventory.
// A per-card set merges overlapping location paths before adding to ancestors.
export function buildCatalogItemCounts(entries = [], items = [], mode = 'category') {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const counts = new Map(entries.map(entry => [entry.id, 0]));

  for (const item of items) {
    const assignedIds = mode === 'location' ? getItemLocationIds(item) : [item.categoryId];
    const visited = new Set();
    for (const assignedId of assignedIds) {
      let id = assignedId;
      while (byId.has(id) && !visited.has(id)) {
        visited.add(id);
        id = byId.get(id).parentId;
      }
    }
    for (const id of visited) counts.set(id, counts.get(id) + 1);
  }

  return counts;
}
