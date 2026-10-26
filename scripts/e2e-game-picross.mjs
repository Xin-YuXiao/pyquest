// ============================================================
// 端到端测试：第三章试炼场「星图拼绘」（Picross + 切片作画）
// 用法: node scripts/e2e-game-picross.mjs（需要先 npm run dev；npm run test:e2e -- game-picross 会自动起服）
//
// 交互路径保持真实：E 键打开石台、真实键盘在咒语输入框里打字（顺带验证 W/A/S/D/E 不被游戏吞掉）、
// 回车施放、点按钮撤销 / 提示、Esc 关闭面板；作弊只通过 window.__PYQUEST__ 语义动作
// （gotoChapter / teleport / godmode / setHearts / openGame / winGameLevel），状态读取走只读快照。
// 期望值由本脚本 import 纯逻辑层（logic.js）独立算出，再与面板快照对照。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import { LEVELS } from '../src/games/picross/levels.js';
import { parseArt, initialGrid, replay } from '../src/games/picross/logic.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
let failed = false;
let assertions = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
await page.route('**/*', (route) => (
  isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
));

const shot = async (name) => {
  await page.screenshot({ path: `scripts/shots/${name}.png` });
  console.log(`📷 ${name}`);
};
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
async function until(pred, label, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await pred()) return true;
    await page.waitForTimeout(150);
  }
  throw new Error(`until 超时：${label}`);
}

const Q = (name, arg) => evalRetry(([n, a]) => window.__PYQUEST__[n](...(a === undefined ? [] : [].concat(a))), [name, arg]);
const games = () => Q('games');
const panel = async () => (await games()).panel;
const game = async () => (await panel()).game;
const state = () => Q('state');
const LV = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/** 在咒语输入框里清空并用真实键盘输入一句 */
async function typeSpell(src, { enter = false } = {}) {
  const input = page.locator('.gp-game-picross .sp-input');
  await input.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(src, { delay: 12 });
  await page.waitForTimeout(220); // 实时预览有 90ms 去抖
  if (enter) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(220);
  }
  return input.inputValue();
}

try {
  // ---------- 新游戏 → 第三章 ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const b = document.getElementById('btn-start');
    return !!(b && b.offsetParent && window.__PYQUEST__);
  }, null, { timeout: 15000 });
  await page.click('#btn-start');
  await page.waitForFunction(() => !!(window.__PYQUEST__.active() && window.__PYQUEST__.active().player), null, { timeout: 15000 });
  const ch = CHAPTERS.find((c) => c.id === 3);
  await Q('gotoChapter', 3);
  await page.waitForFunction((k) => !!(window.__PYQUEST__.scene(k) && window.__PYQUEST__.scene(k).player), ch.fieldKey, { timeout: 8000 });
  await page.waitForTimeout(700);
  await Q('godmode');
  await Q('clearMinions', ch.fieldKey);
  check(ch.games.includes('picross'), '第三章登记了星图拼绘');

  // ---------- 走到石台按 E ----------
  const site = (await games()).sites.find((s) => s.game === 'picross');
  check(!!site, '野外有「星图拼绘」石台');
  let opened = false;
  for (const [x, y] of [[site.x, site.y + 170], [site.x + 170, site.y], [site.x - 170, site.y], [site.x, site.y - 170]]) {
    await Q('teleport', [x, y]);
    await page.waitForTimeout(320);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(450);
    const p = await panel();
    if (p && p.isOpen) { opened = true; break; }
  }
  check(opened, 'E 打开星图拼绘面板');
  let p = await panel();
  check(p.gameId === 'picross' && p.levelId === 'polaris', '从第 1 关「北极星」开始');
  check(await evalRetry(() => window.__PYQUEST__.active().scene.isPaused()), '面板打开时游戏世界暂停');
  check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('sp-input')), '咒语输入框自动获得焦点');
  let g = await game();
  const pol = parseArt(LV.polaris.art);
  check(g.rows === pol.rows && g.cols === pol.cols && g.casts === 0 && !g.solved, `5×5 空画布，施法 0 句`);
  check(await page.locator('.pc-clue-row').count() === pol.rows && await page.locator('.pc-clue-col').count() === pol.cols, '每行每列都有游程线索');
  await shot('pc-01-open');

  // ---------- 实时预览：选区 / 幽灵格 ----------
  const typed = await typeSpell('sky[:, 2]');
  check(typed === 'sky[:, 2]', '在输入框里能正常打出 s / k / y（游戏按键不会吞字）');
  g = await game();
  check(g.preview.kind === 'query' && g.preview.selected === 5 && g.casts === 0, '纯切片 sky[:, 2] 预览：选中 5 格（青框），不计入施法');
  check(await page.locator('.pc-cell.sel').count() === 5, '画布上 5 格显示青色选区框');
  await shot('pc-02-preview-select');
  await typeSpell('sky[2] = 1');
  g = await game();
  check(g.preview.kind === 'paint' && g.preview.on === 5 && g.casts === 0, '赋值预览：5 格金色幽灵（还没施放）');
  check(await page.locator('.pc-cell.g-on').count() === 5, '画布上 5 格显示将点亮');
  await shot('pc-03-preview-paint');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  g = await game();
  check(g.casts === 1 && g.sky[2].every((v) => v === 1) && g.rowsOk[2], '回车施放：第 2 行点亮，施法 1 句，第 2 行线索变绿');
  check(await page.locator('.pc-clue-row.ok').count() >= 1, '满足的线索显示为绿色');

  // ---------- 报错不计数 ----------
  await typeSpell('sky[5] = 1', { enter: true });
  g = await game();
  check(g.casts === 1, '越界咒语不计入施法次数');
  const errText = await page.locator('.gp-game-picross .sp-out').textContent();
  check(errText.includes('IndexError') && errText.includes('下标越界'), '报错显示 Python 原文 + 中文解释');
  await shot('pc-04-error');

  // ---------- × 笔记：点格子只做标记，不算作画 ----------
  await page.locator('.pc-cell[data-r="0"][data-c="0"]').click();
  await page.waitForTimeout(150);
  g = await game();
  check(g.notes === 1 && g.casts === 1 && g.sky[0][0] === 0 && await page.locator('.pc-cell.note').count() === 1, '点暗格打 × 笔记：不改 sky、不计施法');

  // ---------- 撤销 ----------
  await typeSpell('sky[0] = 1', { enter: true });
  g = await game();
  check(g.casts === 2 && g.program.length === 2, '再施一句：程序 2 句');
  await page.click('.pc-undo');
  await page.waitForTimeout(200);
  g = await game();
  check(g.casts === 1 && g.program.length === 1 && g.sky[0].every((v) => v === 0), '撤销：回到上一次施法后的画布');

  // ---------- 画完第 1 关 ----------
  await typeSpell('sky[:, 2] = 1', { enter: true });
  g = await game();
  check(g.solved && g.casts === 2 && g.medal === 'gold', '画出北极星：施法 2 句 = 参考解，金牌');
  await page.waitForTimeout(900);
  await shot('pc-05-reveal');
  await until(async () => (await panel()).winShown, '通关浮层出现', 6000);
  check((await games()).state.picross.done.includes('polaris'), '通关记入进度');
  await shot('pc-06-win');

  // ---------- 下一关：提示开放行列求和 ----------
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  p = await panel();
  check(p.levelId === 'meteors' && !p.winShown, '浮层回车 → 第 2 关「流星雨」');
  await page.click('#gp-hint-btn');
  await page.waitForTimeout(200);
  g = await game();
  check(g.sumsShown && await page.locator('#gp-hint').isVisible(), '第 1 条提示：显示提示文字并开放 sky.sum(axis=…) 读数');
  check((await page.locator('.pc-sums').textContent()).includes('sky.sum(axis=1)'), '读数里出现 sky.sum(axis=1) / axis=0');
  await typeSpell('sky[0, 1:4] = 1', { enter: true });
  await shot('pc-07-meteors-hint');

  // ---------- 离开再回来：程序还在 ----------
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  check(!(await panel()).isOpen && !(await evalRetry(() => window.__PYQUEST__.active().scene.isPaused())), 'Esc 关闭面板，游戏世界恢复');
  await Q('openGame', 'picross');
  await page.waitForTimeout(400);
  g = await game();
  check((await panel()).levelId === 'meteors' && g.casts === 1 && g.program[0] === 'sky[0, 1:4] = 1', '再进来：接着上次的咒语程序（1 句）');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---------- 推进到「玻璃底片」，真实输入向量化咒语 ----------
  for (const id of ['meteors', 'saturn', 'guidebox', 'grid']) await Q('winGameLevel', ['picross', id]);
  await Q('openGame', ['picross', 'plate']);
  await page.waitForTimeout(400);
  g = await game();
  const plate = LV.plate;
  check((await panel()).levelId === 'plate' && JSON.stringify(g.sky) === JSON.stringify(initialGrid(plate)), '「玻璃底片」初始画布是负片');
  await shot('pc-08-plate-negative');
  await typeSpell('sky = 1 - sky', { enter: true });
  g = await game();
  const after1 = replay(plate, ['sky = 1 - sky']).grid;
  check(g.casts === 1 && JSON.stringify(g.sky) === JSON.stringify(after1), '一句 sky = 1 - sky 把整张底片翻成正片');
  await typeSpell('sky[:, 5] = 0', { enter: true });
  g = await game();
  check(g.solved && g.casts === 2, '擦掉划痕 → 画出「玻璃底片」（2 句）');
  await page.waitForTimeout(1500);
  await shot('pc-09-plate-reveal');
  await until(async () => (await panel()).winShown, '底片关通关浮层', 6000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---------- 核心关全过 → 1 枚数值碎片 ----------
  const before = (await state()).progress[3].shards;
  const r = await Q('winGameLevel', ['picross', 'radio']);
  const after = (await state()).progress[3].shards;
  const gs = (await games()).state.picross;
  check(r.completed && r.shard && after === before + 1, `7 个核心关全部通过 → +1 数值碎片（${before} → ${after}）`);
  check(gs.complete && gs.unlocked.includes('station'), '试炼场完成，挑战关 ★ 解锁');

  // ---------- 挑战关：10×13，一整段咒语 ----------
  await Q('setHearts', 2);
  await Q('openGame', ['picross', 'station']);
  await page.waitForTimeout(400);
  g = await game();
  check(g.rows === 10 && g.cols === 13, '挑战关「空间站」10×13 画布');
  await shot('pc-10-station-board');
  await typeSpell(LV.station.solution, { enter: true });
  g = await game();
  check(g.solved && g.casts === LV.station.par, `整段参考解一次施放：${g.casts} 句画完空间站`);
  await page.waitForTimeout(1800);
  await shot('pc-11-station-reveal');
  await until(async () => (await panel()).winShown, '挑战关通关浮层', 6000);
  const st = await state();
  check(st.hearts === st.maxHearts, `挑战关首次通过：生命回满（${st.hearts} / ${st.maxHearts}）`);
  await shot('pc-12-station-win');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v3')).games);
  check(!!(saved && saved.picross && saved.picross.levels.station && saved.picross.doneAt), '试炼场进度写入存档');
} catch (e) {
  failed = true;
  console.log(`✗ 异常：${e.stack || e.message}`);
  await shot('pc-error').catch(() => {});
}

if (errors.length) {
  failed = true;
  console.log('浏览器报错：');
  errors.forEach((e) => console.log(`  ${e}`));
} else {
  console.log('  ✓ 浏览器无报错');
}
await browser.close();
console.log(`\n[e2e-game-picross] ${failed ? '✗ 失败' : '✓ 通过'}（${assertions} 项断言）`);
process.exit(failed ? 1 : 0);
