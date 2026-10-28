import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageBackground from '../../src/renderer/features/layout/PageBackground';

let frames, nextFrame, preference, requestFrame;

function dimensions(element, top, height = 1200, viewport = 400) {
  Object.defineProperties(element, {
    scrollTop: { configurable: true, value: top },
    scrollHeight: { configurable: true, value: height },
    clientHeight: { configurable: true, value: viewport }
  });
}

function flushFrame() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(0));
}

function fixture() {
  const view = render(<div className="app-shell">
    <PageBackground />
    <div className="item-gallery-grid" data-testid="gallery" />
    <div role="dialog"><div className="editor-pane" data-testid="dialog-scroll" /></div>
  </div>);
  return { ...view, layer: view.container.querySelector('.page-background'), grid: view.getByTestId('gallery') };
}

beforeEach(() => {
  frames = new Map(); nextFrame = 0;
  requestFrame = vi.fn(callback => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', vi.fn(id => frames.delete(id)));
  preference = Object.assign(new EventTarget(), { matches: false, media: '(prefers-reduced-motion: reduce)' });
  vi.stubGlobal('matchMedia', vi.fn(() => preference));
  dimensions(document.documentElement, 0, 400, 400);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('decorative page parallax', () => {
  it('is inaccessible decoration and coalesces desktop nested scrolling into one bounded update', () => {
    const { layer, grid } = fixture();
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    flushFrame(); requestFrame.mockClear();
    dimensions(grid, 200);
    fireEvent.scroll(grid);
    dimensions(grid, 600);
    fireEvent.scroll(grid);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    flushFrame();
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('-42px');
    dimensions(grid, 1200);
    fireEvent.scroll(grid); flushFrame();
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('-56px');
    expect(grid).not.toHaveAttribute('style');
  });

  it('uses document scrolling on mobile without intercepting input', () => {
    const { layer } = fixture(); flushFrame();
    dimensions(document.documentElement, 400);
    const event = new Event('scroll', { cancelable: true });
    document.dispatchEvent(event); flushFrame();
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('-28px');
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores horizontal-only surfaces, editor dialogs, and other app roots', () => {
    const { layer, grid, getByTestId } = fixture(); flushFrame();
    dimensions(grid, 0, 400, 400);
    fireEvent.scroll(grid);
    const dialog = getByTestId('dialog-scroll'); dimensions(dialog, 500);
    fireEvent.scroll(dialog);
    const outside = document.createElement('div'); outside.className = 'item-gallery-grid';
    document.body.append(outside); dimensions(outside, 500); fireEvent.scroll(outside); outside.remove();
    expect(frames.size).toBe(0);
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('0px');
  });

  it('stops and resets when reduced motion is enabled, then resumes if disabled', () => {
    const { layer, grid } = fixture(); flushFrame();
    dimensions(grid, 400); fireEvent.scroll(grid); flushFrame();
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('-28px');
    preference.matches = true; preference.dispatchEvent(new Event('change'));
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('0px');
    fireEvent.scroll(grid);
    expect(frames.size).toBe(0);
    preference.matches = false; preference.dispatchEvent(new Event('change')); flushFrame();
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('-28px');
  });

  it('cancels pending work on unmount and ignores a callback already dispatched by the browser', () => {
    const { layer, grid, unmount } = fixture(); flushFrame();
    dimensions(grid, 400); fireEvent.scroll(grid);
    const lateCallback = [...frames.values()][0];
    unmount();
    expect(frames.size).toBe(0);
    lateCallback(0);
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('0px');
  });

  it('keeps a static background when animation frames are unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    const { layer, grid } = fixture();
    dimensions(grid, 400); fireEvent.scroll(grid);
    expect(layer).toBeInTheDocument();
    expect(frames.size).toBe(0);
    expect(layer.style.getPropertyValue('--page-parallax-y')).toBe('');
  });

  it('starts static for reduced motion and tolerates browsers without matchMedia', () => {
    preference.matches = true;
    const first = fixture();
    dimensions(first.grid, 400); fireEvent.scroll(first.grid);
    expect(frames.size).toBe(0);
    expect(first.layer.style.getPropertyValue('--page-parallax-y')).toBe('0px');
    first.unmount();
    vi.stubGlobal('matchMedia', undefined);
    const second = fixture(); flushFrame();
    dimensions(second.grid, 400); fireEvent.scroll(second.grid); flushFrame();
    expect(second.layer.style.getPropertyValue('--page-parallax-y')).toBe('-28px');
  });
});
