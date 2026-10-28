import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../../src/renderer/features/layout/AppShell';

const categories = [
  { id: 'clothes', name: '服装', level: 1, parentId: null },
  { id: 'tops', name: '上衣', level: 2, parentId: 'clothes' },
  { id: 'shoes', name: '鞋子', level: 2, parentId: 'clothes' },
  { id: 'empty', name: '空分类', level: 1, parentId: null }
];
const locations = [
  { id: 'home', name: '家', level: 1, parentId: null },
  { id: 'cabinet', name: '衣柜', level: 2, parentId: 'home' },
  { id: 'top', name: '上层', level: 3, parentId: 'cabinet' },
  { id: 'bottom', name: '下层', level: 3, parentId: 'cabinet' },
  { id: 'office', name: '办公室', level: 1, parentId: null }
];
const items = [
  { id: 'a', name: 'A', categoryId: 'tops', locationIds: ['top', 'bottom'], quantity: '100' },
  { id: 'b', name: 'B', categoryId: 'clothes', locationId: 'cabinet' },
  { id: 'c', name: 'C', categoryId: 'shoes', locationIds: ['top', 'office'] }
];
const props = (mode = 'category', currentItems = items, selectedId = 'clothes') => ({
  project: { meta: {}, categories, locations, items: currentItems },
  selectedSection: 'catalog', selectedCatalogMode: mode, selectedCatalogNodeId: selectedId,
  visibleItems: [], search: '不匹配的搜索',
  onDeleteCatalogNode: vi.fn()
});
const count = (name, value) => expect(within(screen.getByRole('treeitem', { name, exact: true })).getByText(`${value} 个物品`)).toBeInTheDocument();
afterEach(cleanup);

describe('catalog item totals', () => {
  it('counts all project cards rather than gallery search results and displays zeros and selected totals', async () => {
    const user = userEvent.setup();
    render(<AppShell {...props()} />);
    count('服装', 3); count('空分类', 0);
    expect(screen.getByLabelText('当前分类物品数量')).toHaveTextContent('3 个物品');
    await user.click(screen.getByRole('treeitem', { name: '服装', exact: true }));
    count('上衣', 1); count('鞋子', 1);
    expect(screen.getByText('2 个下级')).toBeInTheDocument();
  });
  it('shows three-level location counts while deduplicating the shared ancestors of multiple locations', () => {
    render(<AppShell {...props('location', items, 'top')} />);
    count('家', 3); count('衣柜', 3); count('上层', 2); count('下层', 1); count('办公室', 1);
    expect(screen.getByLabelText('当前位置物品数量')).toHaveTextContent('2 个物品');
  });
  it('refreshes totals when cards are added, removed or moved and hides totals for an unsaved node', async () => {
    const user = userEvent.setup();
    const view = render(<AppShell {...props()} />);
    const changed = [{ ...items[0], categoryId: 'empty' }, items[2], { id: 'new', name: '新增', categoryId: 'empty' }];
    view.rerender(<AppShell {...props('category', changed)} />);
    count('服装', 1); count('空分类', 2);
    expect(screen.getByLabelText('当前分类物品数量')).toHaveTextContent('1 个物品');
    await user.click(screen.getByRole('button', { name: '新增顶级', exact: true }));
    expect(screen.queryByLabelText('当前分类物品数量')).not.toBeInTheDocument();
  });
});
