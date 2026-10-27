import { createWebApi } from './api';
import { createEntryRecovery } from './entry-recovery';

// This controller deliberately has no React or shared-style dependency. The form
// is already usable for typing while session restore and app download overlap.
export function startWebEntry({ root, fetchImpl, loadApp, timeoutMs = 15000, moduleTimeoutMs = 45000, recovery = createEntryRecovery() }) {
  const form = root.querySelector('#entry-login');
  const password = form.querySelector('input');
  const submit = form.querySelector('[type=submit]');
  const retry = form.querySelector('[data-entry-retry]');
  const feedback = form.querySelector('[data-entry-feedback]');
  const api = createWebApi({ fetchImpl });
  let epoch = 0;
  let busy = false;
  let stopped = false;
  let finished = false;
  let activeController;
  let modulePromise;
  let moduleFailed = false;
  let ready;
  const timers = new Set();

  function preload() {
    if (!modulePromise) {
      try { modulePromise = Promise.resolve(loadApp()); }
      catch (error) { modulePromise = Promise.reject(error); }
      // Rejections may happen while the user is still typing. Keep them handled
      // and retryable without discarding a successful ordinary bootstrap.
      const pending = modulePromise;
      pending.catch(() => { if (modulePromise === pending) moduleFailed = true; });
    }
    return modulePromise;
  }

  function bounded(promise, controller, stage) {
    const messages = {
      session: '连接网站超时，请重试',
      login: '登录请求超时，请重试',
      project: '读取物品超时，请重试',
      module: '界面文件下载超时，请重试或切换网络'
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        controller?.abort();
        reject(new Error(messages[stage]));
      }, stage === 'module' ? moduleTimeoutMs : timeoutMs);
      timers.add(timer);
      Promise.resolve(promise).then(resolve, reject).finally(() => {
        clearTimeout(timer);
        timers.delete(timer);
      });
    });
  }

  function updateButton() { submit.disabled = stopped || busy || !password.value; }
  function status(message, error = false) {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.setAttribute('role', error ? 'alert' : 'status');
  }
  function failed(error, attempt) {
    if (stopped || attempt !== epoch) return;
    if (error.entryStage === 'module') {
      status('界面文件下载失败，正在重新加载…');
      if (recovery.recoverOnce()) return;
    }
    busy = false;
    updateButton();
    retry.hidden = false;
    retry.disabled = false;
    retry.textContent = moduleFailed ? '重新加载' : '重试';
    status(error.message || '连接失败，请重试', true);
    password.focus();
  }
  async function open(project, attempt) {
    if (stopped || attempt !== epoch) return;
    ready = { project, attempt };
    busy = true;
    updateButton();
    status('正在打开物品…');
    let app;
    try { app = await bounded(preload(), null, 'module'); }
    catch (error) {
      if (moduleFailed) throw Object.assign(new Error('界面文件下载失败，请重新加载页面；若仍失败，请切换网络后重试'), { entryStage: 'module' });
      throw error;
    }
    if (stopped || attempt !== epoch) return;
    password.value = '';
    cleanup();
    app.mountWebApp(root, { api, project });
    recovery.complete();
  }
  async function restore() {
    const attempt = ++epoch;
    activeController?.abort();
    const controller = activeController = new AbortController();
    retry.hidden = true;
    status('');
    try {
      const session = await bounded(api.session({ signal: controller.signal }), controller, 'session');
      if (stopped || attempt !== epoch || !session.authenticated) return;
      status('正在读取物品…');
      const project = await bounded(api.getProject({ signal: controller.signal }), controller, 'project');
      await open(project, attempt);
    } catch (error) { failed(error, attempt); }
  }
  async function login(event) {
    event.preventDefault();
    if (busy || !password.value || stopped) return;
    const attempt = ++epoch;
    activeController?.abort();
    const controller = activeController = new AbortController();
    ready = null;
    busy = true;
    let submittedPassword = password.value;
    password.value = '';
    updateButton();
    retry.hidden = true;
    status('登录中…');
    try {
      const request = api.login(submittedPassword, { signal: controller.signal });
      submittedPassword = '';
      await bounded(request, controller, 'login');
      if (stopped || attempt !== epoch) return;
      status('密码已验证，正在读取物品…');
      const project = await bounded(api.getProject({ signal: controller.signal }), controller, 'project');
      await open(project, attempt);
    } catch (error) { failed(error, attempt); }
  }
  function retryEntry() {
    if (busy || stopped) return;
    retry.hidden = true;
    if (moduleFailed) { recovery.reload(); return; }
    const attempt = epoch;
    if (ready && ready.attempt === attempt) void open(ready.project, attempt).catch((error) => failed(error, attempt));
    else void restore();
  }
  function pause() {
    stopped = true;
    epoch += 1;
    activeController?.abort();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    password.value = '';
    ready = null;
    busy = false;
    retry.hidden = true;
    status('');
    updateButton();
  }
  function hide() { pause(); api.clearSession(); }
  function show(event) {
    if (!event.persisted || !stopped || finished) return;
    stopped = false;
    if (moduleFailed) { modulePromise = null; moduleFailed = false; }
    updateButton();
    preload();
    void restore();
  }
  function cleanup() {
    finished = true;
    pause();
    form.removeEventListener('submit', login);
    password.removeEventListener('input', updateButton);
    retry.removeEventListener('click', retryEntry);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
  }
  function dispose() { cleanup(); api.clearSession(); }

  form.addEventListener('submit', login);
  password.addEventListener('input', updateButton);
  retry.addEventListener('click', retryEntry);
  // A cached document keeps this controller alive. Suspend its credentials and
  // requests on navigation, then revalidate the cookie when that page returns.
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  updateButton();
  // Start immediately, before waiting for the session endpoint or user input.
  // Calling loadApp synchronously also lets the browser discover its chunks now.
  preload();
  void restore();
  return dispose;
}
