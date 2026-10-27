export const MAX_ITEM_IMAGES = 20;

export function orderImagesByVariants(imageIds, variants = []) {
  const available = new Set(imageIds);
  return [...new Set([...variants.map(row => row.imageId).filter(id => id && available.has(id)), ...imageIds])];
}

function imageReference(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError('物品图片数据格式不正确');
  }
  return value.trim();
}

// An explicitly supplied list owns the order, including an empty list. Legacy
// projects continue to work with their scalar primary reference.
export function getItemImageIds(item = {}) {
  if (!item || typeof item !== 'object') throw new TypeError('物品图片数据格式不正确');
  if (Object.hasOwn(item, 'imagePaths')) {
    if (!Array.isArray(item.imagePaths) || item.imagePaths.length > MAX_ITEM_IMAGES) throw new TypeError('物品图片数据格式不正确');
    return [...new Set(Array.from(item.imagePaths, imageReference))];
  }
  return item.imagePath == null || item.imagePath === '' ? [] : [imageReference(item.imagePath)];
}

export function withImageSummary(item = {}) {
  if (!Object.hasOwn(item, 'imagePaths')) return item;
  const imagePaths = getItemImageIds(item);
  return { ...item, imagePaths, imagePath: imagePaths[0] || '' };
}
