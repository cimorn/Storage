import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ItemGalleryGrid from '../../src/renderer/features/items/ItemGalleryGrid';

const items = [{ id: 'one', title: '首屏物品' }, { id: 'two', title: '下方物品' }];
let observers;
let preference;
let preferenceListeners;

beforeEach(() => {
  observers = [];
  preferenceListeners = new Set();
  preference = {
    matches: false,
    addEventListener: vi.fn((_, listener) => preferenceListeners.add(listener)),
    removeEventListener: vi.fn((_, listener) => preferenceListeners.delete(listener))
  };
  vi.stubGlobal('matchMedia', vi.fn(() => preference));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) {
      this.notify = entries => act(() => callback(entries));
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
      observers.push(this);
    }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('gallery scroll reveal', () => {
  it('shows the first screen immediately and reveals later cards only once without blocking clicks', () => {
    const onSelect = vi.fn();
    render(<ItemGalleryGrid items={items} onSelect={onSelect} />);
    expect(observers).toHaveLength(1);
    const first = screen.getByRole('button', { name: '首屏物品' });
    const later = screen.getByRole('button', { name: '下方物品' });
    observers[0].notify([{ target: first, isIntersecting: true }, { target: later, isIntersecting: false }]);
    expect(first).not.toHaveClass('scroll-reveal-enter');
    expect(later).toBeVisible();
    observers[0].notify([{ target: later, isIntersecting: true }]);
    expect(later).toHaveClass('scroll-reveal-enter');
    fireEvent.click(later);
    expect(onSelect).toHaveBeenCalledWith('two');
    fireEvent.animationEnd(later);
    expect(later).not.toHaveClass('scroll-reveal-enter');
    observers[0].notify([{ target: later, isIntersecting: false }, { target: later, isIntersecting: true }]);
    expect(later).not.toHaveClass('scroll-reveal-enter');
  });

  it('keeps cards readable when reduced motion is requested or observation is unavailable', () => {
    preference.matches = true;
    const view = render(<ItemGalleryGrid items={items} onSelect={vi.fn()} />);
    expect(observers).toHaveLength(0);
    expect(screen.getByRole('button', { name: '下方物品' })).toBeVisible();
    view.unmount();
    preference.matches = false;
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<ItemGalleryGrid items={items} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: '下方物品' })).toBeVisible();
  });

  it('stops current motion on preference changes and ignores callbacks after unmount', () => {
    const view = render(<ItemGalleryGrid items={items} onSelect={vi.fn()} />);
    expect(observers).toHaveLength(1);
    const later = screen.getByRole('button', { name: '下方物品' });
    observers[0].notify([{ target: later, isIntersecting: false }, { target: later, isIntersecting: true }]);
    expect(later).toHaveClass('scroll-reveal-enter');
    act(() => {
      preference.matches = true;
      preferenceListeners.forEach(listener => listener());
    });
    expect(later).not.toHaveClass('scroll-reveal-enter');
    expect(observers[0].disconnect).toHaveBeenCalled();
    view.unmount();
    observers[0].notify([{ target: later, isIntersecting: true }]);
    expect(later).not.toHaveClass('scroll-reveal-enter');
    expect(preferenceListeners.size).toBe(0);
  });

  it('does not replay seen cards when filtering and cancels motion for keyboard focus', () => {
    const view = render(<ItemGalleryGrid items={items} onSelect={vi.fn()} />);
    expect(observers).toHaveLength(1);
    const later = screen.getByRole('button', { name: '下方物品' });
    observers[0].notify([{ target: later, isIntersecting: false }, { target: later, isIntersecting: true }]);
    fireEvent.focusIn(later);
    expect(later).not.toHaveClass('scroll-reveal-enter');
    view.rerender(<ItemGalleryGrid items={[...items].reverse()} onSelect={vi.fn()} />);
    const current = observers.at(-1);
    current.notify([{ target: later, isIntersecting: false }, { target: later, isIntersecting: true }]);
    expect(later).not.toHaveClass('scroll-reveal-enter');
  });
});
