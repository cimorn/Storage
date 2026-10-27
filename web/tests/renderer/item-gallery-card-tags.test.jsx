import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';

describe('ItemGalleryCard compact details', () => {
  it('keeps packaging in the third row as an accessible icon only when true', () => {
    const { container, rerender } = render(<ItemGalleryCard item={{ title: '相机', brand: '品牌', note: '黑色·S | 白色·M', metaLine: '款式', locationLine: '书房', tags: ['标签'], isPackaged: true }} />);
    const marker = screen.getByRole('img', { name: '有包装' });
    const rows = container.querySelector('.item-gallery-card__content').children;
    expect(marker.tagName.toLowerCase()).toBe('svg');
    expect(within(marker).getByTitle('有包装')).toBeInTheDocument();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/^相机品牌$/);
    expect(rows[1]).toHaveTextContent(/^黑色·S \| 白色·M$/);
    expect(within(rows[2]).getByText('款式')).toBeInTheDocument();
    expect(rows[2].lastElementChild).toBe(marker);
    for (const flag of [false, undefined, 'true', 1]) {
      rerender(<ItemGalleryCard item={{ title: '相机', isPackaged: flag }} />);
      expect(screen.queryByRole('img', { name: '有包装' })).not.toBeInTheDocument();
    }
  });
  it('omits locations and tags from the card', () => {
    render(
      <ItemGalleryCard
        item={{
          id: 'demo_item',
          title: '标签机',
          brand: 'Demo', metaLine: 'D30',
          locationLine: '书房 · 书架',
          tags: ['BG-001', 'BG-002'],
          imageSrc: ''
        }}
      />
    );

    expect(screen.getByText('D30')).toBeInTheDocument();
    expect(screen.queryByText('书房 · 书架')).not.toBeInTheDocument();
    expect(screen.queryByText('BG-001')).not.toBeInTheDocument();
    expect(screen.queryByText('BG-002')).not.toBeInTheDocument();
  });
});
