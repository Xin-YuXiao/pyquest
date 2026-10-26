// ============================================================
// 端到端测试：第三章 BOSS 护盾「曲线对消」
// 用法: node scripts/e2e-game-curve.mjs（需要先 npm run dev；npm run test:e2e -- game-curve 会自动起服）
//
// 路径保持真实：巢穴里走到对消台旁按 E、用真实键盘输入咒语（顺带验证 w/a/s/d/e 不会让勇者走动 / 重开面板）、
// 回车施放、通关浮层回车进下一关、Esc 关面板；作弊只走 window.__PYQUEST__ 语义动作
// （gotoLair / godmode / clearMinions / teleport / slayBoss），状态读取走只读快照 games() / state()。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { LEVELS } from '../src/games/curve/levels.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
let failed = false;
let assertions = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
await page.route('**/*', (route) => (isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })));

const shot = async (name) => { await page.screenshot({ path: `scripts/shots/${name}.png` }); console.log(`📷 ${name}`); };
const check = (cond, label) => {
  assertions++;
  if (cond) console.log(`  ✓ ${label}`);
  else { failed = true; console.log(`  ✗ ${label}`); }
};
const evalRetry = async (fn, arg, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); } catch (e) { last = e; await page.waitForTimeout(350); }
  }
  throw last;
};
const games = () => evalRetry(() => window.__PYQUEST__.games());
const panel = async () => (await games()).panel;
const state = () => evalRetry(() => window.__PYQUEST__.state());
const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
const paused = () => evalRetry(() => window.__PYQUEST__.active().scene.isPaused());
const player = () => evalRetry(() => { const p = window.__PYQUEST__.active().player; return { x: Math.round(p.x), y: Math.round(p.y) }; });
async function until(pred, label, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await pred()) return true;
    await page.waitForTimeout(150);
  }
  throw new Error(`until 超时：${label}`);
}
/** 清空咒语输入框并用真实键盘输入 */
async function typeSpell(src) {
  const inp = page.locator('.gp-game-curve .sp-input');
  await inp.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(src, { delay: 12 });
  await page.waitForTimeout(220);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const b = document.getElementById('btn-start');
    return !!(b && b.offsetParent && window.__PYQUEST__);
  }, null, { timeout: 15000 });
  await page.click('#btn-start');
  await page.waitForFunction(() => { const s = window.__PYQUEST__ && window.__PYQUEST__.active(); return !!(s && s.player); }, null, { timeout: 15000 });

  // ---------- 进巢穴：BOSS 带护盾，BOSS 符文换成了对消台 ----------
  await evalRetry(() => window.__PYQUEST__.gotoLair(3));
  await page.waitForFunction(() => { const s = window.__PYQUEST__.scene('SciLair'); return !!(s && s.player && s.scene.isActive()); }, null, { timeout: 10000 });
  await page.waitForTimeout(700);
  check(await activeKey() === 'SciLair', '进入混沌巢穴');
  await evalRetry(() => { window.__PYQUEST__.godmode(); window.__PYQUEST__.clearMinions('SciLair'); });
  const g0 = await games();
  const site = g0.sites.find((s) => s.game === 'curve');
  check(!!site && g0.sites.length === 1, '巢穴里有一座「曲线对消」石台（替代 BOSS 符文）');
  check((await state()).progress[3].bossShielded, 'BOSS 带着护盾');

  // ---------- 走到石台旁按 E ----------
  let opened = false;
  for (const [x, y] of [[site.x, site.y + 170], [site.x + 170, site.y], [site.x - 170, site.y]]) {
    await evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(450);
    const p = await panel();
    if (p && p.isOpen) { opened = true; break; }
  }
  check(opened, '在石台旁按 E 打开曲线对消面板');
  let p = await panel();
  check(p.gameId === 'curve' && p.levelId === 'c1', `从第一层开始（${p.levelId}）`);
  check(await paused(), '面板打开时游戏世界暂停');
  await shot('cv-01-open');

  // ---------- 先写错：频率不对 ----------
  const before = await player();
  await typeSpell('np.sin(2 * x)');
  await until(async () => (await panel()).game.status === 'miss', '预览判定 miss').catch(() => {});
  p = await panel();
  check(p.game.status === 'miss' && p.game.residual > 0.5, `实时预览：np.sin(2 * x) 残差 ${p.game.residual && p.game.residual.toFixed(2)}，判为对不上`);
  const after = await player();
  check(before.x === after.x && before.y === after.y, '在输入框里打字（含 w / a / s / d）勇者纹丝不动');
  check((await panel()).isOpen, '在输入框里按 e / 空格不会关面板或重开');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  p = await panel();
  check(!p.won && p.game.casts === 1, '错误咒语施放后没有过关（施法 1 次）');
  check(await page.locator('#gp-status.bad').count() === 1, '状态行提示残差过大');
  await shot('cv-02-miss');

  // ---------- 报错也能看懂 ----------
  await typeSpell('np.sine(x)');
  const outText = await page.locator('.gp-game-curve .sp-out').textContent();
  check(outText.includes('AttributeError') && outText.includes('sine'), '拼错函数名：输出区显示 AttributeError 与中文解释');

  // ---------- 正确咒语 ----------
  await typeSpell('np.sin(x)');
  await until(async () => (await panel()).game.status === 'hit', '预览判定 hit').catch(() => {});
  p = await panel();
  check(p.game.status === 'hit', '实时预览：np.sin(x) 与魔君曲线吻合');
  await page.keyboard.press('Enter');
  await until(async () => (await panel()).winShown, '第一层通关浮层');
  p = await panel();
  check(p.won && p.game.solved && p.game.casts === 2, `第一层对消成功（施法 ${p.game.casts} 次）`);
  await shot('cv-03-hit');

  // ---------- 浮层回车进下一关，一路打完四层 ----------
  for (const lv of LEVELS.filter((l) => !l.challenge).slice(1)) {
    await page.keyboard.press('Enter');
    await until(async () => (await panel()).levelId === lv.id, `进入 ${lv.id}`);
    await typeSpell(lv.solution);
    await page.keyboard.press('Enter');
    await until(async () => (await panel()).winShown, `${lv.id} 通关浮层`);
    check((await panel()).won, `${lv.title}：${lv.solution} 对消成功`);
  }
  const rewards = await page.locator('#gp-win-rewards').textContent();
  check(rewards.includes('护盾碎了'), `最后一层的奖励写明「护盾碎了」（${rewards.trim()}）`);
  const gs = (await games()).state.curve;
  check(gs.complete && gs.unlocked.includes('c5'), '四层全部对消：曲线对消完成，挑战关解锁');
  await shot('cv-04-all');

  // ---------- Esc 关面板：护盾真的破了，BOSS 招牌机制开战 ----------
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  check(!(await panel()).isOpen && !(await paused()), 'Esc 关闭面板，游戏世界恢复');
  check(!(await state()).progress[3].bossShielded, '关面板后 BOSS 护盾已破');
  const mech = await evalRetry(() => window.__PYQUEST__.bossMech('SciLair'));
  check(!!mech && mech.active, `BOSS 招牌机制「正弦混沌弹」开战（active=${mech && mech.active}）`);
  await shot('cv-05-shield-broken');

  // ---------- 读档后保持 ----------
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v3')).games.curve);
  check(saved && Object.keys(saved.levels).length === 4 && saved.doneAt, '存档里记着四层已通过、曲线对消完成');

  // ---------- 击败 BOSS：第三章通关 ----------
  await evalRetry(() => window.__PYQUEST__.slayBoss('SciLair'));
  await until(async () => (await state()).progress[3].done, '第三章通关');
  check((await state()).progress[3].done, '击败混沌曲线魔君，第三章通关');
} catch (e) {
  failed = true;
  console.log(`✗ 异常：${e.message}`);
  await shot('cv-99-error').catch(() => {});
}

if (errors.length) { failed = true; console.log('浏览器报错：\n' + errors.join('\n')); }
await browser.close();
console.log(`\n[e2e-game-curve] ${failed ? '✗ 有失败' : '✓ 全部通过'}（${assertions} 项断言）`);
process.exit(failed ? 1 : 0);
