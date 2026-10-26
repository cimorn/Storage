import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeProject } from '../../src/renderer/lib/project-data';
import { createProjectStore } from '../../src/renderer/store/project-store';
import { parseImportDocument } from '../../src/renderer/features/web/api';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';
import { buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';

vi.mock('../../src/renderer/features/web/ImageAccessContext', () => ({
  useImagePreviewState: imageId => ({ url: imageId ? `https://images.invalid/${imageId}` : '', status: imageId ? 'loaded' : 'none' })
}));

function fixture() {
  return { categories: [], locations: [], items: [{ id: 'shirt', name: 'T恤', imagePath: 'stale', imagePaths: ['photo-a', 'photo-b'],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', tags: [] }] };
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('ordered item images', () => {
  it('preserves independent photo arrays and derives their cover, including clearing every photo', () => {
    const input = fixture(), output = sanitizeProject(input);
    expect(output.items[0]).toMatchObject({ imagePath: 'photo-a', imagePaths: ['photo-a', 'photo-b'] });
    output.items[0].imagePaths.push('photo-c');
    expect(input.items[0].imagePaths).toHaveLength(2);
    input.items[0].imagePaths = [];
    expect(sanitizeProject(input).items[0].imagePath).toBe('');
  });

  it('retains unseen photos during a scalar edit and tracks secondary-image changes as an update', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T12:00:00.000Z'));
    const store = createProjectStore(); store.getState().setProject(fixture());
    store.getState().updateItem('shirt', { imagePath: 'replacement' });
    expect(store.getState().currentProject.items[0]).toMatchObject({ imagePath: 'replacement', imagePaths: ['replacement', 'photo-b'] });
    vi.setSystemTime(new Date('2026-10-26T13:00:00.000Z'));
    store.getState().updateItem('shirt', { imagePaths: ['replacement', 'photo-c'] });
    expect(store.getState().currentProject.items[0].updatedAt).toBe('2026-10-26T13:00:00.000Z');
    store.getState().updateItem('shirt', { imagePaths: [] });
    expect(store.getState().currentProject.items[0].imagePath).toBe('');
  });

  it('requires secondary photos in an imported full backup', () => {
    const project = fixture();
    const data = 'data:image/webp;base64,UklGRg==';
    expect(() => parseImportDocument({ project, images: { 'photo-a': data } })).toThrow(/缺少/);
    expect(parseImportDocument({ project, images: { 'photo-a': data, 'photo-b': data } }).project.items[0].imagePaths).toHaveLength(2);
  });
});

describe('gallery photo navigation', () => {
  const card = () => buildItemCardView(fixture().items[0]);
  it('switches photo with keyboard arrows, while Enter/click retain the edit action', () => {
    const onClick = vi.fn(); render(<ItemGalleryCard item={card()} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'T恤', exact: true });
    expect(screen.getByAltText('T恤')).toHaveAttribute('src', expect.stringContaining('photo-a'));
    fireEvent.keyDown(button, { key: 'ArrowRight' });
    expect(screen.getByAltText('T恤')).toHaveAttribute('src', expect.stringContaining('photo-b'));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(button); expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not open editing after a horizontal drag and permits a subsequent tap', () => {
    const onClick = vi.fn(); const view = render(<ItemGalleryCard item={card()} onClick={onClick} />);
    const surface = view.container.querySelector('.item-gallery-card__image-shell');
    const dispatch = (type, x, y) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true });
      fireEvent(surface, event);
    };
    dispatch('pointerdown', 200, 100); dispatch('pointermove', 120, 104); dispatch('pointerup', 120, 104);
    fireEvent.click(screen.getByRole('button', { name: 'T恤', exact: true }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByAltText('T恤')).toHaveAttribute('src', expect.stringContaining('photo-b'));
    dispatch('pointerdown', 120, 104); dispatch('pointerup', 120, 104);
    fireEvent.click(screen.getByRole('button', { name: 'T恤', exact: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
