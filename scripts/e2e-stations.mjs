// ============================================================
// 端到端测试（第二批观测站）：第三章蒙特卡洛估 π / 第五章并行搬砖 / 第六章引力沙盒 /
// 第九章贝叶斯硬币 / 第十一章星系分类台
// 用法: node scripts/e2e-stations.mjs（需要先 npm run dev；npm run test:e2e -- stations 会自动起服）
//
// 交互路径保持真实：E 键打开观测台、点面板按钮 / 按面板快捷键完成目标、Esc 关闭；
// 作弊只通过 window.__PYQUEST__ 语义动作（gotoChapter / teleport / godmode / clearMinions / setHearts），
// 状态读取一律走只读快照 state() / observatory()。
// 期望值由本脚本直接 import 纯数学层独立算出，再与面板快照、DOM 文本对照。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import { OBSERVATORIES } from '../src/core/observatory.js';
import {
  MC, makeMonteCarlo,
  SCHED, makeTasks, roundRobin, greedyLPT, makespan,
  GRAV, PLUNGE, simulateOrbit,
} from '../src/core/stations.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
const steps = [];
let failed = false;
let assertions = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
// 测试环境封闭化（同 runner）：外网字体请求直接返回空 200
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
await page.route('**/*', (route) => (
  isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
));

const shot = async (name) => {
  await page.screenshot({ path: `scripts/shots/${name}.png` });
  steps.push(`📷 ${name}`);
  console.log(`📷 ${name}`);
};
const check = (cond, label) => {
  assertions++;
  if (cond) { steps.push(`  ✓ ${label}`); console.log(`  ✓ ${label}`); }
  else { failed = true; steps.push(`  ✗ ${label}`); console.log(`  ✗ ${label}`); }
};
const evalRetry = async (fn, arg, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) { last = e; await page.waitForTimeout(350); }
  }
  throw last;
};

// ---------- seam 访问（只读查询 + 语义动作） ----------
const state = () => evalRetry(() => window.__PYQUEST__.state());
const obs = () => evalRetry(() => window.__PYQUEST__.observatory());
const station = async () => (await obs()).station;
const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
const paused = () => evalRetry(() => window.__PYQUEST__.active().scene.isPaused());
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
const setHearts = (n) => evalRetry((h) => window.__PYQUEST__.setHearts(h), n);
const savedObservatory = () => page.evaluate(() => {
  const raw = localStorage.getItem('pyquest:save:v3');
  return raw ? JSON.parse(raw).observatory || null : null;
});
/** 等某个条件成立（按面板快照判断；负载高时游戏帧会变慢，所以用轮询而不是固定睡眠） */
async function until(pred, label, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await pred()) return true;
    await page.waitForTimeout(200);
  }
  throw new Error(`until 超时：${label}`);
}

/** 用方向键把面板里某个滑块推到目标值（大差距用 Shift 大步，最后单步收尾） */
async function steer(read, target, step, coarse = 5) {
  for (let i = 0; i < 300; i++) {
    const v = await read();
    const diff = target - v;
    if (Math.abs(diff) <= step / 2 + 1e-9) return v;
    const key = diff > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.press(Math.abs(diff) >= step * coarse ? `Shift+${key}` : key);
  }
  return read();
}

async function gotoChapter(id) {
  const ch = CHAPTERS.find((c) => c.id === id);
  await evalRetry((cid) => window.__PYQUEST__.gotoChapter(cid), id);
  await page.waitForFunction((k) => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
    return !!(s && s.player);
  }, ch.fieldKey, { timeout: 8000 });
  await page.waitForTimeout(700);
  check(await activeKey() === ch.fieldKey, `进入${ch.title}`);
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), ch.fieldKey);
  return ch;
}

/** 站到观测台旁按 E：南 / 东 / 西 / 北四个靠近点轮询，直到面板打开 */
async function openStation(ch) {
  const o = ch.buildField(ch).props.find((p) => p.type === 'observatory');
  const title = OBSERVATORIES[ch.observatory].title;
  check(!!o && o.kind === ch.observatory, `${ch.title}野外有「${title}」`);
  for (const [x, y] of [[o.x, o.y + 160], [o.x + 160, o.y], [o.x - 160, o.y], [o.x, o.y - 160]]) {
    await tele(x, y);
    await page.waitForTimeout(320);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(450);
    const snap = await obs();
    if (snap && snap.isOpen) {
      check(snap.kind === ch.observatory && !!snap.station, `E 打开「${title}」（role=dialog，游戏暂停）`);
      check(await paused(), '面板打开时游戏世界暂停');
      return snap;
    }
  }
  throw new Error(`openStation: ${title} 四个靠近点都无法打开`);
}

/** 完成后的共同断言：爱心回满、观测日志（内存 + 存档）、不碰碎片与封印门、Esc 关闭恢复 */
async function afterSolved(ch, shotName) {
  const kind = ch.observatory;
  const title = OBSERVATORIES[kind].title;
  const snap = await obs();
  check(snap.solved, `「${title}」判定完成`);
  check(await page.locator('#obs-status.ok').count() === 1, '完成提示出现');
  const g = await state();
  check(g.hearts === g.maxHearts, `完成奖励：爱心回满（${g.hearts} / ${g.maxHearts}）`);
  check(!!(g.observatory[kind] && g.observatory[kind].solved && g.observatory[kind].clears === 1), `观测日志记下「${title}」（第 1 次）`);
  check(g.progress[ch.id].shards === 0 && !g.progress[ch.id].gateOpen, '小游戏不发碎片、不碰封印门');
  const saved = await savedObservatory();
  check(!!(saved && saved[kind] && saved[kind].solved), '观测日志已写入存档');
  await shot(shotName);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(!(await obs()).isOpen && !(await paused()), 'Esc 关闭面板，游戏世界恢复');
}

try {
  // ---------- 新游戏 ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const b = document.getElementById('btn-start');
    return !!(b && b.offsetParent && window.__PYQUEST__);
  }, null, { timeout: 15000 });
  await page.click('#btn-start');
  await page.waitForFunction(() => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.active();
    return !!(s && s.player);
  }, null, { timeout: 15000 });
  check(await activeKey() === CHAPTERS[0].fieldKey, '新游戏从村庄开始');

  // ============================================================
  // 第三章 · 蒙特卡洛估 π
  // ============================================================
  {
    const ch = await gotoChapter(3);
    await setHearts(2);
    await openStation(ch);
    let st = await station();
    check(st.n === 0 && st.solvedAt == null, '开局还没撒点');
    // 先撒 10 点：点太少、不能判成功
    await page.click('[data-batch="10"]');
    await page.waitForTimeout(150);
    st = await station();
    check(st.n === 10 && !(await obs()).solved, `撒 10 点（N = ${st.n}），点太少不判成功`);
    // 键盘 3 = 撒 1000 点，直到估成；成功点由纯数学层独立算出
    const expect = makeMonteCarlo(0);
    while (expect.state.solvedAt == null && expect.state.n < MC.maxN) expect.throw(1000);
    for (let i = 0; i < 60 && !(await obs()).solved; i++) {
      await page.keyboard.press('Digit3');
      await page.waitForTimeout(60);
    }
    await until(async () => (await obs()).solved, '蒙特卡洛估成');
    st = await station();
    check(st.solvedAt === expect.state.solvedAt, `估成时的 N = ${st.solvedAt}，与独立计算一致（${expect.state.solvedAt}）`);
    check(st.solvedAt >= MC.minN, `估成前至少撒了 ${MC.minN} 点`);
    const txt = await page.locator('#st-mc-pi').textContent();
    check(/^3\.\d{4}$/.test(txt.trim()), `面板显示 π̂ = 4M/N（${txt.trim()}）`);
    await afterSolved(ch, 'st-01-montecarlo');
  }

  // ============================================================
  // 第五章 · 并行搬砖
  // ============================================================
  {
    const ch = await gotoChapter(5);
    await setHearts(2);
    await openStation(ch);
    const { tasks, optimal } = makeTasks(0);
    let st = await station();
    check(JSON.stringify(st.costs) === JSON.stringify(tasks.map((t) => t.cost)) && st.optimal === optimal,
      `12 个任务与独立计算一致（最优 ${optimal} 秒 = Σ/4）`);
    check(!st.allAssigned && st.makespan === 0, '开局所有任务都未分配');
    // 手动：选中第 0 个任务，按 2 交给 rank 1
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(120);
    st = await station();
    check(st.assign[0] === 1 && st.selected === 1, '按 2 把选中的任务交给 rank 1，并自动跳到下一个任务');
    // 轮转：range(rank, 12, 4)，总耗时超标、不判成功
    await page.click('#st-sc-rr');
    await page.waitForTimeout(150);
    st = await station();
    const rr = makespan(tasks, roundRobin(tasks));
    check(st.allAssigned && JSON.stringify(st.assign) === JSON.stringify(roundRobin(tasks)), '轮转按编号摊派：任务 i 归 rank i % 4（sp7）');
    check(st.makespan === rr && rr > optimal * SCHED.tolerance && !(await obs()).solved, `轮转总耗时 ${rr} 秒超过目标，不判成功`);
    check((await page.locator('#obs-status').textContent()).includes('range(rank, 12, 4)'), '状态行解释轮转不看任务大小');
    await shot('st-02-scheduler-rr');
    // 贪心：最长任务先给最闲的 worker → 达标
    await page.keyboard.press('KeyG');
    await page.waitForTimeout(150);
    st = await station();
    const lpt = makespan(tasks, greedyLPT(tasks));
    check(st.makespan === lpt && lpt <= optimal * SCHED.tolerance, `贪心分配后总耗时 ${lpt} 秒 ≤ 最优的 1.1 倍`);
    await afterSolved(ch, 'st-03-scheduler-solved');
  }

  // ============================================================
  // 第六章 · 引力沙盒
  // ============================================================
  {
    const ch = await gotoChapter(6);
    await setHearts(2);
    await openStation(ch);
    let st = await station();
    check(st.speed === GRAV.speed.start && st.angle === 90 && st.eps === GRAV.eps.start && st.status === 'idle', `开局：速度 ${st.speed}、切向、ε = ${st.eps}，尚未发射`);
    // 1) 开局速度太大：空格发射 → 逃逸
    await page.keyboard.press('Space');
    await until(async () => (await station()).status !== 'flying', '第一次发射结束');
    st = await station();
    check(st.status === 'escaped' && !(await obs()).solved, '开局速度超过逃逸速度：卫星逃逸，不判成功');
    // 2) 破坏实验：ε 调到 0，按 P 近心掠过 → 被数值误差甩飞（与独立模拟一致）
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    check((await station()).selected === 2, '↓↓ 选中 softening ε 滑块');
    await steer(async () => (await station()).eps, 0, GRAV.eps.step);
    await page.keyboard.press('KeyP');
    await until(async () => (await station()).status !== 'flying', 'ε = 0 近心掠过结束');
    st = await station();
    const raw = simulateOrbit({ ...PLUNGE, eps: 0 });
    check(st.eps === 0 && st.status === raw.status && st.status === 'escaped', 'ε = 0 近心掠过：卫星被甩飞（与独立模拟一致）');
    check(Math.abs(st.maxDrift - raw.maxDrift) < 1e-9 && st.maxDrift > 1, `能量误差暴涨到 ${Math.round(st.maxDrift * 100)}%（数值误差，不是物理）`);
    check((await page.locator('#obs-status').textContent()).includes('数值误差'), '状态行点明是数值误差、提示调大 ε 或调小 dt');
    await shot('st-04-gravity-plunge-eps0');
    // 3) ε 调到 0.1 再掠过一次 → 轨道保住、绕满 3 圈 → 完成
    await steer(async () => (await station()).eps, 0.1, GRAV.eps.step);
    await page.keyboard.press('KeyP');
    await until(async () => (await station()).status !== 'flying', 'ε = 0.1 近心掠过结束', 40000);
    st = await station();
    const soft = simulateOrbit({ ...PLUNGE, eps: 0.1 });
    check(st.status === 'won' && soft.status === 'won' && st.orbits >= GRAV.orbitsToWin, `ε = 0.1：轨道保住、绕满 ${GRAV.orbitsToWin} 圈`);
    check(st.maxDrift < raw.maxDrift / 10, `softening 让能量误差从 ${Math.round(raw.maxDrift * 100)}% 降到 ${Math.round(st.maxDrift * 100)}%`);
    await afterSolved(ch, 'st-05-gravity-solved');
  }
} catch (err) {
  failed = true;
  errors.push(`[e2e] ${err && err.message ? err.message : err}`);
  console.error('执行中断:', err);
}

// ---- 汇总 ----
console.log(`=== E2E 第二批观测站测试结果 ===（断言 ${assertions} 项）`);
for (const s of steps) console.log(s);
if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
else console.log('浏览器无报错 ✓');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
