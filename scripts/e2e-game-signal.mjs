// ============================================================
// 端到端测试（第三章试炼场「外星信号」）
// 用法: node scripts/e2e-game-signal.mjs（需要先 npm run dev；npm run test:e2e -- game-signal 会自动起服）
//
// 交互路径保持真实：E 键打开石台、真实键盘在咒语输入框里打字（顺带验证 w/a/s/d/e 不被游戏吞掉）、
// 回车 / 点「施放」施法、Enter 进入下一关、Esc 离开。
// 作弊只通过 window.__PYQUEST__ 语义动作（gotoChapter / teleport / godmode / clearMinions / setHearts / winGameLevel），
// 状态读取一律走只读快照 state() / games()。期望值由本脚本直接 import 关卡数据与判定层独立算出。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import { LEVELS } from '../src/games/signal/levels.js';
import { targetShape } from '../src/games/signal/logic.js';

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

// ---------- seam ----------
const state = () => evalRetry(() => window.__PYQUEST__.state());
const games = () => evalRetry(() => window.__PYQUEST__.games());
const panel = async () => (await games()).panel;
const game = async () => { const p = await panel(); return p && p.game; };
const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
const paused = () => evalRetry(() => window.__PYQUEST__.active().scene.isPaused());
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
const savedGames = () => page.evaluate(() => {
  const raw = localStorage.getItem('pyquest:save:v3');
  return raw ? JSON.parse(raw).games || null : null;
});
async function until(pred, label, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await pred()) return true;
    await page.waitForTimeout(150);
  }
  throw new Error(`until 超时：${label}`);
}
const byId = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/** 清空输入框后用真实键盘输入一行咒语，等实时预览刷新 */
async function typeSpell(src) {
  await page.click('.gp-game-signal .sp-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(src, { delay: 8 });
  await until(async () => {
    const g = await game();
    return g && g.input === src;
  }, `输入框内容 = ${src}`);
  await page.waitForTimeout(220); // 预览防抖 90ms
}

/** 站到石台旁按 E：南 / 东 / 西 / 北四个靠近点轮询，直到面板打开 */
async function openSite(id) {
  const site = (await games()).sites.find((s) => s.game === id);
  check(!!site, `野外有「${id}」石台`);
  for (const [x, y] of [[site.x, site.y + 170], [site.x + 170, site.y], [site.x - 170, site.y], [site.x, site.y - 170]]) {
    await tele(x, y);
    await page.waitForTimeout(320);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);
    const p = await panel();
    if (p && p.isOpen) return p;
  }
  throw new Error(`openSite: ${id} 四个靠近点都无法打开`);
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
  await page.waitForFunction(() => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.active();
    return !!(s && s.player);
  }, null, { timeout: 15000 });

  // ---------- 进入第三章，打开「外星信号」 ----------
  const ch = CHAPTERS.find((c) => c.id === 3);
  await evalRetry(() => window.__PYQUEST__.gotoChapter(3));
  await page.waitForFunction((k) => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
    return !!(s && s.player);
  }, ch.fieldKey, { timeout: 8000 });
  await page.waitForTimeout(700);
  check(await activeKey() === ch.fieldKey, `进入${ch.title}`);
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), ch.fieldKey);
  const shards0 = (await state()).progress[3].shards;

  let p = await openSite('signal');
  check(p.gameId === 'signal' && p.levelId === 'first', 'E 打开「外星信号」，从第 1 关开始');
  check(await paused(), '面板打开时游戏世界暂停');
  let g = await game();
  check(g.bits === 35 && g.casts === 0 && !g.solved, '第 1 关：收到 35 个比特，尚未施法');
  check(await page.locator('.gp-game-signal .sg-scope-cv').count() === 1 && await page.locator('.gp-game-signal .sg-screen-cv').count() === 1, '示波器条带与解码屏就位');
  await shot('sig-01-open');

  // ---------- 第 1 关：先试错误的形状 ----------
  const before = await evalRetry(() => { const s = window.__PYQUEST__.active(); return [s.player.x, s.player.y]; });
  await typeSpell('signal.reshape(5, 7)');
  g = await game();
  check(g.preview && g.preview.kind === 'shape' && g.preview.shape.join() === '5,7' && !g.preview.ok, '实时预览：reshape(5, 7) 排出 5×7 的斜条纹，判形状不对');
  check(g.casts === 0, '只是预览，不计施法次数');
  const after = await evalRetry(() => { const s = window.__PYQUEST__.active(); return [s.player.x, s.player.y]; });
  check(before[0] === after[0] && before[1] === after[1], '在输入框里打 s / a / e 等字母不会让勇者移动');
  check((await page.locator('.gp-game-signal .sp-out').textContent()).includes('[[1 0 0 0 1 0 1]'), '输出区按 numpy 格式显示 5×7 数组');
  await shot('sig-02-wrong-preview');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  g = await game();
  check(g.casts === 1 && g.lastCast.kind === 'shape' && !g.solved, '回车施法：第 1 次，没解出来');
  check((await page.locator('.gp-game-signal .sg-verdict.bad').textContent()).includes('5 行 × 7 列'), '判定栏提示行列与行优先');

  // 报错不计次数
  await typeSpell('signal.reshape(6, 6)');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  g = await game();
  check(g.casts === 1 && g.screen === 'error', 'reshape(6, 6) 报错：解码屏显示雪花，不计施法次数');
  check((await page.locator('.gp-game-signal .sp-out').textContent()).includes('ValueError'), '输出区显示 ValueError 与中文解释');
  await shot('sig-03-error');

  // 正确的形状
  await typeSpell(byId.first.solution);
  g = await game();
  check(g.preview.ok, `实时预览：${byId.first.solution} 与目标一致`);
  await page.keyboard.press('Enter');
  await until(async () => (await game()).solved, '第 1 关判定解码成功');
  g = await game();
  check(g.casts === 2, '第 2 次施法解码成功');
  await page.waitForTimeout(1300);
  await shot('sig-04-reveal');
  await until(async () => (await panel()).winShown, '通关浮层出现');
  check((await page.locator('#gp-win-summary').textContent()).includes('第 2 次施法'), '通关浮层显示施法次数与奖牌');
  let st = (await games()).state.signal;
  check(st.done.includes('first') && !st.complete, '进度记下第 1 关（试炼场尚未完成）');
  await shot('sig-05-win');

  // ---------- 第 2 关：倒着来的信号（Enter 进入下一关） ----------
  await page.keyboard.press('Enter');
  await until(async () => (await panel()).levelId === 'reversed', 'Enter 进入第 2 关');
  await typeSpell('signal.reshape(7, 17)');
  g = await game();
  check(g.preview.kind === 'values' && !g.preview.ok, '第 2 关：直接排成 7×17 → 形状对但图案颠倒');
  await shot('sig-06-reversed-wrong');
  await typeSpell(byId.reversed.solution);
  check((await game()).preview.ok, `预览：${byId.reversed.solution} 正确`);
  await page.click('.gp-game-signal .sp-cast'); // 点按钮施法（触屏路径）
  await until(async () => (await game()).solved, '第 2 关点「施放」解码成功');
  check((await game()).casts === 1, '第 2 关一次施法即成（金牌）');
  await until(async () => (await panel()).winShown, '第 2 关通关浮层');

  // ---------- 第 4 关（噪声）与第 7 关（阿雷西博）：看一眼画面 ----------
  await page.keyboard.press('Escape');
  await until(async () => !(await panel()).isOpen, 'Esc 关闭面板');
  check(!(await paused()), '关闭面板后游戏世界恢复');
  await evalRetry(() => window.__PYQUEST__.winGameLevel('signal', 'mirror'));
  p = await openSite('signal');
  check(p.levelId === 'noise', '再次打开：直接到下一关「噪声里的行星」');
  await typeSpell('signal.reshape(7, 11)');
  check((await game()).preview.kind === 'values', '噪声关：直接 reshape 得到灰度噪声图（还不是 0/1）');
  await shot('sig-07-noise-raw');
  await typeSpell(byId.noise.solution);
  await page.keyboard.press('Enter');
  await until(async () => (await game()).solved, '噪声关：比较运算阈值化后解码成功');
  await page.keyboard.press('Escape');
  await until(async () => !(await panel()).isOpen, '关闭面板');

  for (const id of ['pad', 'color']) await evalRetry((lid) => window.__PYQUEST__.winGameLevel('signal', lid), id);
  p = await openSite('signal');
  check(p.levelId === 'arecibo', '第 7 关「迷你阿雷西博」');
  g = await game();
  check(g.bits === 713, '713 个比特');
  await typeSpell('signal.reshape(31, 23)');
  await shot('sig-08-arecibo-upside');
  await typeSpell(byId.arecibo.solution);
  await page.keyboard.press('Enter');
  await until(async () => (await game()).solved, '阿雷西博解码成功');
  await page.waitForTimeout(1300);
  await shot('sig-09-arecibo-reveal');
  await until(async () => (await panel()).winShown, '阿雷西博通关浮层');
  check((await page.locator('#gp-win-rewards').textContent()).includes('数值碎片'), '通关浮层列出 +1 数值碎片');
  st = (await games()).state.signal;
  check(st.complete && st.unlocked.includes('columns'), '7 关核心全部通过 → 试炼场完成，挑战关解锁');
  await page.keyboard.press('Escape');
  await until(async () => !(await panel()).isOpen, '关闭面板');
  const s1 = await state();
  check(s1.progress[3].shards === shards0 + 1, `完成外星信号：数值碎片 +1（${shards0} → ${s1.progress[3].shards}）`);

  // ---------- 挑战关：按列发送（.T） ----------
  await evalRetry(() => window.__PYQUEST__.setHearts(2));
  p = await openSite('signal');
  check(p.levelId === 'columns', '再次打开：挑战关「一列一列的信号」');
  await typeSpell('signal.reshape(11, 13)');
  check((await game()).preview.kind === 'values', '按行排列：乱码（形状对、图案错）');
  await shot('sig-10-columns-wrong');
  const [R, C] = targetShape(byId.columns);
  await typeSpell(`signal.reshape(${C}, ${R}).T`);
  await page.keyboard.press('Enter');
  await until(async () => (await game()).solved, '挑战关：reshape + .T 解码成功');
  await until(async () => (await panel()).winShown, '挑战关通关浮层');
  const s2 = await state();
  check(s2.hearts === s2.maxHearts, `挑战关首次通过：爱心回满（${s2.hearts} / ${s2.maxHearts}）`);
  await page.keyboard.press('Escape');
  await until(async () => !(await panel()).isOpen, '关闭面板');

  // ---------- 存档 ----------
  const saved = await savedGames();
  const lv = saved && saved.signal && saved.signal.levels;
  check(!!lv && ['first', 'reversed', 'mirror', 'noise', 'pad', 'color', 'arecibo', 'columns'].every((k) => lv[k]), '8 关进度全部写入存档');
  check(lv.first.best === 2 && lv.reversed.best === 1, `个人最佳写入存档（第 1 关 ${lv.first.best} 次 / 第 2 关 ${lv.reversed.best} 次）`);
  check(typeof saved.signal.doneAt === 'number', '试炼场完成时间写入存档');
  await shot('sig-11-field-after');
} catch (err) {
  failed = true;
  errors.push(`[e2e] ${err && err.message ? err.message : err}`);
  console.error('执行中断:', err);
}

console.log(`=== E2E 外星信号测试结果 ===（断言 ${assertions} 项）`);
for (const s of steps) console.log(s);
if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
else console.log('浏览器无报错 ✓');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
