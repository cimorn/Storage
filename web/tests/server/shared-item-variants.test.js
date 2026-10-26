// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
let helpers = {};
try { helpers = require('../../shared/item-variants.mjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

describe('shared variant helpers', () => {
  it('exports strict row normalization shared by browser and server', () => {
    expect(helpers.normalizeVariantRows).toBeTypeOf('function');
    expect(helpers.normalizeVariantRows([{ color: ' light  blue ', size: ' one\tsize ', isPackaged: false }])).toEqual([
      { color: 'light blue', size: 'one size', isPackaged: false }
    ]);
  });

  it.each([
    [], null, {}, [null], [[]], [new Date()], [{ color: '', size: '', isPackaged: 0 }],
    [{ color: 3, size: '', isPackaged: true }], [{ color: '', size: null, isPackaged: true }],
    [{ color: 'x'.repeat(129), size: '', isPackaged: true }], [{ color: '\u0000', size: '', isPackaged: false }],
    Array.from({ length: 1001 }, () => ({ color: '', size: '', isPackaged: false }))
  ])('rejects malformed explicit rows in helpers instead of coercing or treating them as legacy %#', variants => {
    expect(() => helpers.getItemVariants({ notes: '白色 S', quantity: '2', variants })).toThrow();
  });

  it('normalizes and clones explicit rows without mutating their source', () => {
    expect(helpers.getItemVariants).toBeTypeOf('function');
    const item = { variants: [{ color: ' 白色 ', size: ' S ', isPackaged: true }], notes: '旧文字', quantity: '9' };
    const result = helpers.getItemVariants(item);
    expect(result).toEqual([{ color: '白色', size: 'S', isPackaged: true }]);
    result[0].color = '蓝色'; expect(item.variants[0].color).toBe(' 白色 ');
  });

  it.each([
    ['白色 S', { color: '白色', size: 'S' }], ['蓝白44码', { color: '蓝白', size: '44码' }],
    ['White XL', { color: 'White', size: 'XL' }], ['黑色', { color: '黑色', size: '' }],
    ['S', { color: '', size: 'S' }], ['白色·S', { color: '白色', size: 'S' }],
    ['带印花的白色上衣', null], ['自由描述 42', null], ['定制 蓝白 其他', null], ['', null]
  ])('conservatively parses legacy detail %j', (text, expected) => {
    expect(helpers.parseLegacyVariant).toBeTypeOf('function');
    expect(helpers.parseLegacyVariant(text)).toEqual(expected);
  });

  it.each(['3', 3, '3件', '3 台', '3 pcs'])('keeps a legacy count of %j as independent rows', quantity => {
    expect(helpers.getItemVariants).toBeTypeOf('function');
    const item = { notes: '白色 S', quantity, isPackaged: true };
    const result = helpers.getItemVariants(item);
    expect(result).toEqual(Array.from({ length: 3 }, () => ({ color: '白色', size: 'S', isPackaged: true })));
    result[0].size = 'M'; expect(result[1].size).toBe('S'); expect(item.notes).toBe('白色 S');
  });

  it('preserves unknown original detail text and defaults missing quantities to one row', () => {
    expect(helpers.getItemVariants).toBeTypeOf('function');
    const item = { notes: '旧款自定义说明' };
    expect(helpers.getItemVariants(item)).toEqual([{ color: '', size: '', isPackaged: false }]);
    expect(helpers.formatItemVariants(item)).toBe('旧款自定义说明');
    expect(item.notes).toBe('旧款自定义说明');
  });

  it.each(['1001', '1001件', '若干', '2箱3件', '0', '-1', '2.5'])('keeps unsafe legacy count %j on the legacy path without truncation', quantity => {
    expect(helpers.getItemVariants).toBeTypeOf('function');
    const item = { notes: '白色 S', quantity, isPackaged: true };
    expect(helpers.getItemVariants(item)).toEqual([]);
    expect(helpers.getItemQuantity(item)).toBe(quantity);
    expect(helpers.formatItemVariants(item)).toBe('白色 S');
    expect(helpers.withVariantSummary(item)).toEqual(item);
  });

  it('derives explicit counts and any-row packaging while leaving legacy summaries intact', () => {
    expect(helpers.withVariantSummary).toBeTypeOf('function');
    expect(helpers.MAX_ITEM_VARIANTS).toBe(1000);
    const variants = [{ color: '白色', size: 'S', isPackaged: false }, { color: '白色', size: 'S', isPackaged: true }];
    const item = { variants, notes: '原文', specification: '款式', quantity: '9', isPackaged: false };
    expect(helpers.withVariantSummary(item)).toMatchObject({ quantity: '2', isPackaged: true, notes: '原文', specification: '款式' });
    expect(helpers.hasItemPackaging(item)).toBe(true);
    expect(helpers.getItemQuantity(item)).toBe('2');
    expect(helpers.withVariantSummary({ quantity: '2件', isPackaged: true })).toEqual({ quantity: '2件', isPackaged: true });
    expect(helpers.getItemQuantity({ quantity: 3 })).toBe('3');
    expect(helpers.hasItemPackaging({ isPackaged: true })).toBe(true);
    expect(helpers.hasItemPackaging({ variants: [{ isPackaged: false }], isPackaged: true })).toBe(false);
  });

  it('formats unique detail pairs without deduplicating physical rows', () => {
    expect(helpers.formatItemVariants).toBeTypeOf('function');
    const row = { color: '白色', size: 'S', isPackaged: false };
    const item = { variants: [row, { ...row }, { color: '黑色', size: '', isPackaged: true }], notes: '旧文字' };
    expect(helpers.formatItemVariants(item)).toBe('白色·S / 黑色');
    expect(helpers.getItemQuantity(item)).toBe('3');
    expect(helpers.formatItemVariants({ variants: [{ color: '', size: '', isPackaged: true }], notes: '旧文字' })).toBe('旧文字');
  });
});
