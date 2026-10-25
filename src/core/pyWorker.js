// ============================================================
// Pyodide Worker：在独立线程里运行玩家的 Python（代码训练场）
//
// 协议（与 core/pyRuntime.js 对应）：
//   主线程 → { type: 'init', indexURL }           加载本站自托管的 Pyodide（不走 CDN）
//   主线程 → { type: 'run', id, levelId, code }    在该关全部布局上各跑一遍
//   Worker → { type: 'stage', text } / { type: 'ready', version } / { type: 'error', message }
//   Worker → { type: 'result', id, variants: [{ actions, stdout, error, status, reason }] }
// 玩家代码碰不到任何游戏对象：英雄 API 只经 _dojo_js.call 同步调用本线程里的关卡模拟器，
// 结果以动作列表送回主线程，主线程再用同一个模拟器重算判定。
// 死循环由主线程计时后 terminate 本 Worker 处理（不依赖 SharedArrayBuffer：静态托管设不了 COOP/COEP）。
// ============================================================
import { dojoLevel } from '../data/dojoLevels.js';
import { createSim, apply, finish } from './dojoSim.js';
import { HERO_PRELUDE } from './dojoPrelude.js';

let py = null;
let sim = null; // 当前布局的模拟器状态（_dojo_js.call 结算到它身上）

const stage = (text) => self.postMessage({ type: 'stage', text });

async function init(indexURL) {
  const t0 = performance.now();
  stage('下载 Python 运行时（约 13 MB，只在第一次进入时下载）……');
  const { loadPyodide } = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`);
  stage('启动 Python 解释器……');
  py = await loadPyodide({ indexURL, stdout: () => {}, stderr: () => {} });
  stage('准备英雄 API……');
  py.registerJsModule('_dojo_js', {
    call: (op, arg, line) => apply(sim, op, arg ?? null, line || 0),
  });
  py.runPython(HERO_PRELUDE);
  const pyVersion = py.runPython("import sys; '%d.%d' % sys.version_info[:2]");
  self.postMessage({ type: 'ready', version: py.version, pyVersion, ms: Math.round(performance.now() - t0) });
}

function run({ id, levelId, code }) {
  const level = dojoLevel(levelId);
  const runHero = py.globals.get('_run_hero');
  const variants = level.variants.map((v, i) => {
    sim = createSim(level, i);
    const res = JSON.parse(runHero(code, JSON.stringify(level.api), JSON.stringify(v.vars || {})));
    finish(sim);
    return { actions: sim.actions, stdout: res.stdout, error: res.error, status: sim.status, reason: sim.reason };
  });
  runHero.destroy();
  self.postMessage({ type: 'result', id, variants });
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') await init(msg.indexURL);
    else if (msg.type === 'run') run(msg);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
};
