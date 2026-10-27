const RELOAD_PARAM = '__storage_reload';

// A fresh document resets the browser's failed module map and reads the latest
// HTML after a deployment. The URL flag prevents repeated automatic reloads;
// no password, session capability or inventory is persisted for recovery.
export function createEntryRecovery({ location = window.location, history = window.history } = {}) {
  return {
    recoverOnce() {
      const url = new URL(location.href);
      if (url.searchParams.get(RELOAD_PARAM) === '1') return false;
      url.searchParams.set(RELOAD_PARAM, '1');
      location.replace(url.href);
      return true;
    },
    reload() { location.reload(); },
    complete() {
      const url = new URL(location.href);
      if (!url.searchParams.has(RELOAD_PARAM)) return;
      url.searchParams.delete(RELOAD_PARAM);
      history.replaceState(history.state, '', url.href);
    }
  };
}
