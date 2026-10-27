import { getItemImageIds } from './item-images.mjs';

export const MAX_ITEM_VARIANTS = 1000;
export const MAX_VARIANT_QUANTITY = 1000000;

export function getVariantQuantity(row = {}) {
  if (!Object.hasOwn(row, 'quantity')) return 1;
  const value = row.quantity;
  if (typeof value !== 'number' && typeof value !== 'string') throw new TypeError('规格数量须为正整数');
  if (typeof value === 'string' && value.trim() === '') return 1;
  if (typeof value === 'string' && (value.length > 16 || !/^\d+$/u.test(value.trim()))) throw new TypeError('规格数量须为正整数');
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_VARIANT_QUANTITY) throw new TypeError(`规格数量须为 1 至 ${MAX_VARIANT_QUANTITY} 的整数`);
  return quantity;
}

const text = value => String(value ?? '').trim();
const detailText = value => text(value).replace(/\s+/gu, ' ');
const CHINESE_COLOR = '(?:(?:深|浅|亮|暗|淡)?(?:黑|白|灰|红|橙|黄|绿|青|蓝|紫|棕|褐|粉|米|银|金|咖|杏|驼|肤)|卡其|藏青|玫红|酒红|墨绿|军绿|香槟|透明)';
const ENGLISH_COLOR = '(?:(?:light|dark)\\s+)?(?:black|white|gr[ae]y|red|orange|yellow|green|blue|purple|pink|brown|beige|navy|khaki|silver|gold|ivory|cream|tan|transparent)';
const COLOR = `(?:${CHINESE_COLOR}(?:色)?(?:[\\s/、拼-]?${CHINESE_COLOR}(?:色)?)*|${ENGLISH_COLOR}(?:[\\s/-]+${ENGLISH_COLOR})*)`;
const SIZE = '(?:X{0,4}S|X{0,4}L|M|[2-6]XL|(?:[2-6]\\d)(?:\\.5)?(?:\\s*码)?|均码|均号|one\\s*size|free\\s*size|F)';
const COLOR_AND_SIZE = new RegExp(`^(${COLOR})(?:[\\s·,，/]*(${SIZE}))?$`, 'iu');
const SIZE_ONLY = new RegExp(`^(${SIZE})$`, 'iu');
const LEGACY_COUNT = /^(\d+)\s*(?:个|件|台|套|双|条|只|本|瓶|盒|包|枚|张|部|把|辆|支|块|卷|顶|副|对|份|颗|盏|pcs?|pieces?|items?|pairs?|sets?|units?)?$/iu;

export function normalizeVariantRows(rows) {
  const invalid = () => { throw new TypeError('物品规格数据格式不正确'); };
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ITEM_VARIANTS) invalid();
  const assignedImages = new Set();
  return Array.from(rows, row => {
    if (!row || typeof row !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(row))) invalid();
    for (const key of ['color', 'size']) {
      if (typeof row[key] !== 'string' || row[key].length > 128 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(row[key])) invalid();
    }
    if (typeof row.isPackaged !== 'boolean') invalid();
    const result = { color: detailText(row.color), size: detailText(row.size), isPackaged: row.isPackaged };
    if (Object.hasOwn(row, 'quantity')) result.quantity = getVariantQuantity(row);
    if (Object.hasOwn(row, 'imageId')) {
      if (typeof row.imageId !== 'string' || row.imageId.length > 2048 || /[\u0000-\u001f\u007f]/u.test(row.imageId)) invalid();
      result.imageId = row.imageId.trim();
      if (result.imageId && assignedImages.has(result.imageId)) throw new TypeError('每张图片只能对应一条规格');
      if (result.imageId) assignedImages.add(result.imageId);
    }
    return result;
  });
}

// Only recognized whole strings are migrated into structured color/size rows.
// Unrecognized legacy text is never used as a display or search fallback.
export function parseLegacyVariant(value) {
  const input = detailText(value);
  if (!input) return null;
  const match = input.match(COLOR_AND_SIZE);
  if (match) return { color: match[1], size: match[2] || '' };
  const size = input.match(SIZE_ONLY);
  return size ? { color: '', size: size[1] } : null;
}

export function getItemVariants(item = {}) {
  if (Object.hasOwn(item, 'variants')) {
    const rows = normalizeVariantRows(item.variants);
    const images = getItemImageIds(item);
    // Old records have ordered lists but no association fields. Initialize
    // only a complete one-to-one list; explicit empty assignments stay empty.
    if (rows.length === images.length && rows.every(row => !Object.hasOwn(row, 'imageId'))) rows.forEach((row, index) => { row.imageId = images[index]; });
    return rows;
  }
  const quantity = text(item.quantity);
  const match = quantity ? quantity.match(LEGACY_COUNT) : null;
  const count = quantity ? match ? Number(match[1]) : NaN : 1;
  // An empty result leaves an unconvertible legacy record on its original
  // path. Never invent one item or truncate a count that exceeds the bound.
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_ITEM_VARIANTS) return [];
  const details = parseLegacyVariant(item.notes) || { color: '', size: '' };
  const rows = Array.from({ length: count }, () => ({ ...details, isPackaged: item.isPackaged === true }));
  const images = getItemImageIds(item);
  if (rows.length === images.length) rows.forEach((row, index) => { row.imageId = images[index]; });
  return rows;
}

export function hasItemPackaging(item = {}) {
  return Array.isArray(item.variants)
    ? item.variants.some(row => row.isPackaged === true)
    : item.isPackaged === true;
}

export function getItemQuantity(item = {}) {
  return Array.isArray(item.variants) ? String(normalizeVariantRows(item.variants).reduce((count, row) => count + getVariantQuantity(row), 0)) : text(item.quantity);
}

export function withVariantSummary(item = {}) {
  return Array.isArray(item.variants)
    ? { ...item, notes: '', quantity: getItemQuantity(item), isPackaged: hasItemPackaging(item) }
    : item;
}

export function formatItemVariants(item = {}) {
  const rows = getItemVariants(item);
  const colors = [...new Set(rows.map(row => row.color).filter(Boolean))].join('&');
  const sizes = [...new Set(rows.map(row => row.size).filter(Boolean))].join('&');
  return [colors, sizes].filter(Boolean).join('·');
}
