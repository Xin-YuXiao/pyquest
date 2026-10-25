// ============================================================
// Python 运行时（主线程侧）：管理 Pyodide Worker 的加载、运行、超时与重建
//
// - 懒加载：游戏启动不碰 Pyodide；第一次进入代码训练场才创建 Worker 并下载运行时；
// - 运行时文件由本站自托管（vite.config.js 的 pyodide 插件：开发时从 node_modules 直供，
//   构建时复制到 dist/pyodide/），离线 / E2E / 国内网络都不依赖 CDN；
// - 超时（死循环）：terminate Worker 并立即重建，返回 { timedOut: true }；
// - 状态变化通过 onChange 通知界面（加载阶段文案、出错、重启）。
// ============================================================

const READY_TIMEOUT_MS = 90000; // 首次加载上限（约 13 MB；慢网下也给足时间）
export const RUN_TIMEOUT_MS = 4000; // 单次运行上限：训练场的程序都很短，超过就是死循环

let worker = null;
let readyP = null;
let seq = 0;
const pending = new Map();
const listeners = new Set();
const info = { state: 'idle', stage: '', error: '', loadMs: 0, restarts: 0, version: '', pyVersion: '' };

const emit = () => listeners.forEach((fn) => fn({ ...info }));
const set = (patch) => { Object.assign(info, patch); emit(); };

function spawn() {
  const w = new Worker(new URL('./pyWorker.js', import.meta.url), { type: 'module' });
  worker = w;
  set({ state: 'loading', stage: '正在启动 Python……', error: '' });
  const t0 = performance.now();
  readyP = new Promise((resolve, reject) => {
    const fail = (message) => {
      clearTimeout(timer);
      if (worker === w) { w.terminate(); worker = null; }
      set({ state: 'error', error: message });
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail('加载超时'), READY_TIMEOUT_MS);
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'stage') set({ stage: m.text });
      else if (m.type === 'ready') {
        clearTimeout(timer);
        set({ state: 'ready', stage: '', loadMs: Math.round(performance.now() - t0), version: m.version, pyVersion: m.pyVersion });
        resolve();
      } else if (m.type === 'result') {
        const cb = pending.get(m.id);
        pending.delete(m.id);
        if (cb) cb({ variants: m.variants });
      } else if (m.type === 'error') {
        if (m.id && pending.has(m.id)) {
          const cb = pending.get(m.id);
          pending.delete(m.id);
          cb({ crashed: m.message });
        } else {
          fail(m.message);
        }
      }
    };
    w.onerror = (ev) => fail((ev && ev.message) || 'Worker 启动失败');
  });
  readyP.catch(() => {}); // 失败由界面读 state 呈现，这里不让未处理的 rejection 冒泡
  w.postMessage({ type: 'init', indexURL: new URL('pyodide/', document.baseURI).href });
}

export const pyRuntime = {
  /** 当前状态快照：{ state: idle|loading|ready|running|error, stage, error, loadMs, restarts, version } */
  info: () => ({ ...info }),

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** 确保 Worker 已加载就绪（重复调用复用同一个加载过程；出错后再调用会重试） */
  ensure() {
    if (!worker || info.state === 'error') spawn();
    return readyP;
  },

  /** 在某关全部布局上运行代码 → { variants } | { timedOut: true } | { crashed: message } */
  async run(levelId, code) {
    await this.ensure();
    const w = worker;
    const id = ++seq;
    set({ state: 'running' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        if (worker === w) { w.terminate(); worker = null; }
        info.restarts++;
        resolve({ timedOut: true });
        spawn(); // 后台重建，下一次运行时自动等待就绪
      }, RUN_TIMEOUT_MS);
      pending.set(id, (res) => {
        clearTimeout(timer);
        set({ state: 'ready' });
        resolve(res);
      });
      w.postMessage({ type: 'run', id, levelId, code });
    });
  },
};
