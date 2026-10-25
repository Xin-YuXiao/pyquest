// ============================================================
// 端到端测试（观测站小游戏）：第七章「频率调谐台」+ 第八章「NFW 拟合台」
// 用法: node scripts/e2e-observatory.mjs（需要先 npm run dev；npm run test:e2e 会自动起服）
//
// 交互路径保持真实：E 键打开观测台、方向键调滑块（Shift 大步）、H 提示、Esc / Enter 关闭；
// 作弊只通过 window.__PYQUEST__ 语义动作（gotoChapter / teleport / godmode / clearMinions /
// setHearts），状态读取一律走只读快照 state() / observatory()。
// 期望值由本脚本直接 import 纯数学层独立算出（尖峰位置、sg6 读数、NFW 真值），
// 再与面板快照、DOM 文本对照——不拿游戏自己报的数当标准答案。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import {
  NFW, TUNING, makeNfwData, makeTuner, findPeaks, readoutMagnitude,
} from '../src/core/observatory.js';

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
const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
const paused = () => evalRetry(() => window.__PYQUEST__.active().scene.isPaused());
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
const setHearts = (n) => evalRetry((h) => window.__PYQUEST__.setHearts(h), n);
const savedObservatory = () => page.evaluate(() => {
  const raw = localStorage.getItem('pyquest:save:v2');
  return raw ? JSON.parse(raw).observatory || null : null;
});

async function gotoChapter(id) {
  const ch = CHAPTERS.find((c) => c.id === id);
  await evalRetry((cid) => window.__PYQUEST__.gotoChapter(cid), id);
  await page.waitForFunction((k) => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
    return !!(s && s.player);
  }, ch.fieldKey, { timeout: 6000 });
  await page.waitForTimeout(700);
  check(await activeKey() === ch.fieldKey, `进入${ch.title}`);
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), ch.fieldKey);
  return ch;
}

/** 站到观测台旁按 E：南 / 东 / 西 / 北四个靠近点轮询，直到面板打开 */
async function openObservatory(ch, label) {
  const o = ch.buildField(ch).props.find((p) => p.type === 'observatory');
  check(!!o && o.kind === ch.observatory, `${ch.title}野外有${label}`);
  for (const [x, y] of [[o.x, o.y + 160], [o.x + 160, o.y], [o.x - 160, o.y], [o.x, o.y - 160]]) {
    await tele(x, y);
    await page.waitForTimeout(320);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(450);
    const snap = await obs();
    if (snap && snap.isOpen) return snap;
  }
  throw new Error(`openObservatory: ${label} 四个靠近点都无法打开`);
}

/** 用方向键把某个读数推到目标值（大差距用 Shift 大步，最后按单步收尾） */
async function steer(read, target, step, coarse) {
  for (let i = 0; i < 400; i++) {
    const v = await read();
    const diff = target - v;
    if (Math.abs(diff) <= step / 2 + 1e-9) return v;
    const key = diff > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.press(Math.abs(diff) >= step * coarse ? `Shift+${key}` : key);
  }
  return read();
}

try {
  // ---------- 新游戏 ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.click('#btn-start');
  await page.waitForTimeout(1200);
  check(await activeKey() === CHAPTERS[0].fieldKey, '新游戏从村庄开始');

  // ============================================================
  // 第七章 · 频率调谐台
  // ============================================================
  const ch7 = await gotoChapter(7);
  await setHearts(2);
  let snap = await openObservatory(ch7, '频率调谐台');
  check(snap.kind === 'tuning', '打开的是频率调谐台');
  check(await page.locator('#obs-backdrop.show [role="dialog"]').count() === 1, '观测面板以对话框形式出现（role=dialog）');
  check((await page.locator('#obs-title').textContent()).includes('频率调谐台'), '面板标题为「频率调谐台」');
  check(await paused(), '面板打开时游戏世界暂停');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
  check(await page.locator('#map-backdrop.show').count() === 0, '观测面板打开时 Tab 不会叠开世界地图');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  snap = await obs();
  check(!snap.isOpen && !(await paused()), 'Esc 关闭面板，游戏世界恢复');
  const hint7 = await page.locator('#hint').textContent();
  check(hint7.includes('频率调谐台'), `观测台旁有交互提示（「${hint7.trim()}」）`);

  snap = await openObservatory(ch7, '频率调谐台');
  const expectPeaks = findPeaks(makeTuner()).map((p) => p.f);
  check(JSON.stringify(snap.tuning.peaks) === JSON.stringify(expectPeaks),
    `面板的尖峰与独立计算一致（${expectPeaks.join(' / ')} Hz）`);
  await shot('obs-01-tuning-open');
  const readF = async () => (await obs()).tuning.f;
  for (const f of expectPeaks) {
    await steer(readF, f, TUNING.step, 10);
    await page.waitForTimeout(TUNING.holdMs + 450);
    snap = await obs();
    check(snap.tuning.locked.includes(f), `调谐到 ${f} Hz 停留后锁定尖峰`);
    const li = await page.locator(`#obs-peaks li[data-f="${f}"]`).textContent();
    const mag = Math.round(readoutMagnitude(f));
    check(li.includes(`|X| = ${mag}`), `${f} Hz 读数 |X| = ${mag}（sg6 原题同值）`);
  }
  snap = await obs();
  check(snap.solved, '三根尖峰全部锁定 → 观测完成');
  check(await page.locator('#obs-status.ok').count() === 1, '完成提示出现');
  let g = await state();
  check(g.hearts === g.maxHearts, `完成奖励：爱心回满（${g.hearts} / ${g.maxHearts}）`);
  check(g.observatory.tuning && g.observatory.tuning.solved && g.observatory.tuning.clears === 1, '观测日志记下频率调谐台（第 1 次）');
  check(g.progress[7].shards === 0 && !g.progress[7].gateOpen, '小游戏不发碎片、不碰封印门（不阻塞也不替代主线）');
  const saved7 = await savedObservatory();
  check(!!(saved7 && saved7.tuning && saved7.tuning.solved), '观测日志已写入存档（v2 可选字段）');
  await shot('obs-02-tuning-solved');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(!(await obs()).isOpen && !(await paused()), '完成后 Enter 关闭面板，游戏世界恢复');

  // ============================================================
  // 第八章 · NFW 拟合台
  // ============================================================
  const ch8 = await gotoChapter(8);
  await setHearts(3);
  snap = await openObservatory(ch8, 'NFW 拟合台');
  const truth = makeNfwData(0).truth;
  check(snap.kind === 'nfw' && snap.attempt === 0, '打开的是 NFW 拟合台（首次挑战）');
  check(Math.abs(snap.nfw.truth.rho0 - truth.rho0) < 1e-9 && Math.abs(snap.nfw.truth.rs - truth.rs) < 1e-9,
    `首次挑战真值为讲义数字 ρ₀ = ${truth.rho0}、Rₛ = ${truth.rs}（dm8）`);
  check(snap.nfw.chi2dof > 5 && !snap.solved, `开局曲线远离数据（χ²/dof = ${snap.nfw.chi2dof.toFixed(1)}）`);
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(200);
  check((await obs()).nfw.hint && await page.locator('#obs-hint:not([hidden])').count() === 1, 'H 打开提示（ρ₀/4 标记与 r⁻³ 斜线）');
  await shot('obs-03-nfw-open');

  check((await obs()).nfw.selected === 0, '默认选中 ρ₀ 滑块');
  await steer(async () => (await obs()).nfw.logRho0, Math.log10(truth.rho0), NFW.step, 5);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  check((await obs()).nfw.selected === 1, '↓ 切换到 Rₛ 滑块');
  await steer(async () => (await obs()).nfw.logRs, Math.log10(truth.rs), NFW.step, 5);
  await page.waitForTimeout(NFW.holdMs + 600);
  snap = await obs();
  check(snap.nfw.chi2dof < NFW.passChi2dof, `调到真值附近 χ²/dof = ${snap.nfw.chi2dof.toFixed(3)} < ${NFW.passChi2dof}`);
  check(snap.solved, 'χ²/dof 过线并稳住 1 秒 → 拟合成功');
  const status = await page.locator('#obs-status').textContent();
  check(status.includes('拟合成功') && status.includes('真值'), '成功提示揭晓真值并对比玩家结果');
  check(await page.locator('#obs-truth.show').count() === 1, '真值曲线亮出');
  g = await state();
  check(g.hearts === g.maxHearts, `完成奖励：爱心回满（${g.hearts} / ${g.maxHearts}）`);
  check(g.observatory.nfw && g.observatory.nfw.clears === 1 && Number.isFinite(g.observatory.nfw.bestChi2dof),
    `观测日志记下 NFW 拟合台（χ²/dof = ${g.observatory.nfw && g.observatory.nfw.bestChi2dof}）`);
  await shot('obs-04-nfw-solved');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(!(await obs()).isOpen && !(await paused()), 'Esc 关闭面板，游戏世界恢复');

  // ============================================================
  // 读档续玩：观测日志随存档恢复；再次挑战换一组数据
  // ============================================================
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.click('#btn-start');
  await page.waitForTimeout(1200);
  g = await state();
  check(!!(g.observatory.nfw && g.observatory.nfw.solved && g.observatory.tuning && g.observatory.tuning.solved),
    '刷新读档后两座观测台的完成记录都在');
  check(await activeKey() === ch8.fieldKey, '读档后落在第八章野外');
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), ch8.fieldKey);
  snap = await openObservatory(ch8, 'NFW 拟合台');
  const truth1 = makeNfwData(1).truth;
  check(snap.attempt === 1 && Math.abs(snap.nfw.truth.rho0 - truth1.rho0) < 1e-9 && snap.nfw.truth.rho0 !== truth.rho0,
    '再次挑战换了一组数据（不是背答案）');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const hint8 = await page.locator('#hint').textContent();
  check(hint8.includes('已完成'), `完成过的观测台提示「已完成」（「${hint8.trim()}」）`);
} catch (err) {
  failed = true;
  errors.push(`[e2e] ${err && err.message ? err.message : err}`);
  console.error('执行中断:', err);
}

// ---- 汇总 ----
console.log(`=== E2E 观测站小游戏测试结果 ===（断言 ${assertions} 项）`);
for (const s of steps) console.log(s);
if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
else console.log('浏览器无报错 ✓');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
