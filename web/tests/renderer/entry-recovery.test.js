import { describe, expect, it, vi } from 'vitest';
import { createEntryRecovery } from '../../src/renderer/features/web/entry-recovery';

function setup(href = 'https://storage.example/?filter=all#items') {
  const location = { href, replace: vi.fn(), reload: vi.fn() };
  location.replace.mockImplementation(url => { location.href = url; });
  const history = { state: { existing: true }, replaceState: vi.fn() };
  return { location, history, recovery: createEntryRecovery({ location, history }) };
}
describe('fresh document recovery for failed module imports', () => {
  it('replaces the entry document once, preserving existing URL state without storing credentials', () => {
    const { recovery, location } = setup();
    expect(recovery.recoverOnce()).toBe(true);
    const target = new URL(location.replace.mock.calls[0][0]);
    expect(target.searchParams.get('filter')).toBe('all');
    expect(target.hash).toBe('#items');
    expect(target.searchParams.get('__storage_reload')).toBe('1');
    expect(recovery.recoverOnce()).toBe(false);
    expect(location.replace).toHaveBeenCalledTimes(1);
  });
  it('does not loop after a replacement document also fails, but permits an explicit reload', () => {
    const { recovery, location } = setup('https://storage.example/?__storage_reload=1');
    expect(recovery.recoverOnce()).toBe(false);
    recovery.reload();
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(location.replace).not.toHaveBeenCalled();
  });
  it('removes only the recovery marker after a successful mount', () => {
    const { recovery, location, history } = setup('https://storage.example/?filter=all&__storage_reload=1#items');
    recovery.complete();
    expect(history.replaceState).toHaveBeenCalledWith(history.state, '', 'https://storage.example/?filter=all#items');
    expect(location.reload).not.toHaveBeenCalled();
  });
});
