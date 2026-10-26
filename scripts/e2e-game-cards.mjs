// ============================================================
// 端到端测试：第三章试炼场「阵列牌局」
// 用法: node scripts/e2e-game-cards.mjs（需要先 npm run dev；npm run test:e2e -- game-cards 会自动起服）
//
// 路径保持真实：科学计算高原里走到石台旁按 E 打开、用鼠标点牌 / 数字键选牌 / 回车施放 / E 结束回合、
// 在自由咒语的方括号里用真实键盘打字、战后点奖励卡、通关浮层回车进下一关、Esc 关面板。
// 「下一步打什么」由本脚本在 Node 里用同一套规则（battle.js + autoplay.js、同一关卡同一种子）同步算出，
// 每打一步都核对界面上的 hp / 勇者生命 / 回合数与 Node 端完全一致——界面没有偷偷改规则。
// 作弊只走 window.__PYQUEST__ 语义动作（gotoChapter / teleport / godmode / clearMinions / winGameLevel），
// 状态读取走只读快照 games() / state()。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { LEVELS } from '../src/games/cards/levels.js';
import { getCard } from '../src/games/cards/cards.js';
import { createBattle, cast, useSkill, endTurn, hpValues, atkValues } from '../src/games/cards/battle.js';
import { bestSpell } from '../src/games/cards/autoplay.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
let failed = false;
let assertions = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
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
const game = async () => (await panel()).game;
const state = () => evalRetry(() => window.__PYQUEST__.state());
const paused = () => evalRetry(() => window.__PYQUEST__.active().scene.isPaused());
const player = () => evalRetry(() => { const p = window.__PYQUEST__.active().player; return { x: Math.round(p.x), y: Math.round(p.y) }; });
async function until(pred, label, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await pred()) return true;
    await page.waitForTimeout(120);
  }
  throw new Error(`until 超时：${label}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idle = async () => until(async () => { const g = await game(); return g && !g.busy; }, '界面空闲');

/** 点手牌里 uid 对应的牌（useKey：改用数字键选牌） */
async function pickCard(uid, useKey = false) {
  if (useKey) {
    const g = await game();
    const k = g.hand.findIndex((c) => c.uid === uid);
    await page.keyboard.press(k === 9 ? 'Digit0' : `Digit${k + 1}`);
  } else {
    await page.click(`.cb-card[data-uid="${uid}"]`);
  }
  await page.waitForTimeout(90);
}

/**
 * 在界面上用真实点击 / 键盘打完一整场，同时在 Node 端用同一套规则同步推进并逐步核对。
 * keyEvery：每隔几手改用数字键 + 回车（其余用鼠标点牌 + 点「施放」按钮）
 */
async function playBattle(lv, { attempt, extra }, label) {
  const sim = createBattle(lv, { attempt, extra });
  let moves = 0;
  let typed = 0;
  let mismatch = 0;
  for (let guard = 0; guard < 120 && !sim.over; guard++) {
    await idle();
    const b = bestSpell(sim);
    if (b) {
      const useKey = moves % 2 === 1;
      const { sel, op, free } = b.choice;
      if (sel !== null) await pickCard(sel, useKey);
      await pickCard(op, useKey);
      if (free) {
        await page.locator('.cb-free').click();
        check(await page.locator('.cb-free').inputValue() === '', `${label}：重新选中自由咒语时方括号是空的`);
        await page.keyboard.type(free, { delay: 8 });
        typed++;
        await page.waitForTimeout(160);
      }
      const want = (await game()).line;
      if (useKey || free) await page.keyboard.press('Enter');
      else await page.click('.cb-cast');
      const r = cast(sim, b.choice);
      moves++;
      if (want !== r.line) { mismatch++; console.log(`    ! 咒语行：界面 ${want} / 规则 ${r.line}`); }
      await page.waitForTimeout(260);
      if (sim.over) break;
      await idle().catch(() => {});
      const g = await game();
      if (!same(g.hp, hpValues(sim))) { mismatch++; console.log(`    ! hp：界面 ${JSON.stringify(g.hp)} / 规则 ${JSON.stringify(hpValues(sim))}`); }
      continue;
    }
    const incoming = atkValues(sim).reduce((s, v) => s + v, 0);
    const block = sim.hand.find((c) => getCard(c.id).block && getCard(c.id).cost <= sim.player.energy);
    if (incoming > sim.player.block && block) {
      await pickCard(block.uid);
      useSkill(sim, block.uid);
      continue;
    }
    await page.keyboard.press('KeyE');
    endTurn(sim);
    await until(async () => {
      const g = await game();
      return g && (sim.over === 'lose' ? g.phase === 'defeat' : g.phase === 'battle' && !g.busy && g.turn === sim.turn);
    }, `${label} 第 ${sim.turn} 回合`);
    const g = await game();
    if (!sim.over && (!same(g.hp, hpValues(sim)) || g.player.hp !== sim.player.hp)) {
      mismatch++;
      console.log(`    ! 回合末：界面 hp ${JSON.stringify(g.hp)} 勇者 ${g.player.hp} / 规则 hp ${JSON.stringify(hpValues(sim))} 勇者 ${sim.player.hp}`);
    }
  }
  return { sim, moves, typed, mismatch };
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

  // ---------- 科学计算高原：找到阵列牌局石台 ----------
  await evalRetry(() => window.__PYQUEST__.gotoChapter(3));
  await page.waitForFunction(() => { const s = window.__PYQUEST__.scene('SciField'); return !!(s && s.player && s.scene.isActive()); }, null, { timeout: 10000 });
  await page.waitForTimeout(700);
  await evalRetry(() => { window.__PYQUEST__.godmode(); window.__PYQUEST__.clearMinions('SciField'); });
  const g0 = await games();
  const site = g0.sites.find((s) => s.game === 'cards');
  check(!!site, '高原上有「阵列牌局」石台');
  const shards0 = (await state()).progress[3].shards;

  let opened = false;
  for (const [x, y] of [[site.x, site.y + 170], [site.x + 170, site.y], [site.x - 170, site.y], [site.x, site.y - 170]]) {
    await evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);
    const p = await panel();
    if (p && p.isOpen) { opened = true; break; }
  }
  check(opened, '在石台旁按 E 打开阵列牌局面板');
  let p = await panel();
  check(p.gameId === 'cards' && p.levelId === 'c1', `从第 1 关开始（${p.levelId}）`);
  check(await paused(), '面板打开时游戏世界暂停');
  let g = await game();
  check(same(g.hp, [6, 3, 6]) && g.player.hp === 30 && g.player.energy === 3 && g.hand.length === 5, `开局：hp = ${JSON.stringify(g.hp)}，勇者 30 生命 3 能量，手牌 5 张`);
  check(await page.locator('.cb-arr-val[data-arr="hp"]').textContent() === '[6 3 6]', '数组视图按 numpy 的 print 格式显示 hp');
  await shot('cb-01-open');

  // ---------- 规则在界面上的表现：整体运算 +1 费、选择器高亮、Backspace 取消 ----------
  const opCard = g.hand.find((c) => getCard(c.id).kind === 'op');
  await pickCard(opCard.uid);
  g = await game();
  check(g.line === 'hp -= 3' && g.preview.cost === 2 && g.preview.selection.length === 3, `只选操作卡 = 整个数组：${g.line}，费用 ${g.preview.cost}（+1）`);
  check(await page.locator('.cb-code .tag').count() === 1, '咒语行标出「整个数组 +1⚡」');
  const selCard = g.hand.find((c) => c.id === '[1]');
  await pickCard(selCard.uid);
  g = await game();
  check(g.line === 'hp[1] -= 3' && same(g.preview.selection, [1]) && g.preview.kills === 1, `选择器 + 操作：${g.line}，只命中下标 1、预计击倒 1 个`);
  check(await page.locator('.cb-enemy.targeted').count() === 1 && await page.locator('.cb-enemy[data-i="1"].will-die').count() === 1, '战场高亮被选中的敌人并标出「会倒下」');
  const before = await player();
  await page.keyboard.press('Backspace');
  g = await game();
  check(g.armed.sel === null && g.armed.op === null, 'Backspace 取消选择');
  const after = await player();
  check(before.x === after.x && before.y === after.y, '面板里按键不会让勇者走动');
  await shot('cb-02-preview');

  // ---------- 用真实点击 / 键盘打完第 1 关 ----------
  const lv1 = LEVELS[0];
  const r1 = await playBattle(lv1, { attempt: 0, extra: [] }, '第 1 关');
  check(r1.sim.over === 'win', `第 1 关打赢（Node 同步模拟 ${r1.sim.turn} 回合、${r1.moves} 手）`);
  check(r1.mismatch === 0, '每一步界面上的咒语行 / hp / 勇者生命都与 Node 端规则一致');
  await until(async () => (await game()).phase === 'reward', '战后奖励');
  g = await game();
  check(g.rewards.length === 3, `战后三选一：${g.rewards.join(' / ')}`);
  check(await page.locator('.cb-overlay.win .cb-reward').count() === 3, '胜利浮层展示 3 张奖励卡');
  await shot('cb-03-reward');
  const pick = g.rewards[0];
  await page.click(`.cb-reward[data-card="${pick}"]`);
  await until(async () => (await panel()).winShown, '通关浮层');
  p = await panel();
  check(p.won, '第 1 关过关');
  const gs1 = (await games()).state.cards;
  check(gs1.done.includes('c1') && gs1.data.extra.includes(pick), `关卡记为通过，奖励卡「${pick}」进了持久牌组`);
  const summary = await page.locator('#gp-win-summary').textContent();
  check(/回合/.test(summary) && /(金|银|铜)牌/.test(summary), `成绩：${summary.split('\n')[0]}`);
  await shot('cb-04-win');

  // ---------- 回车进第 2 关；Node 与界面用同一份牌组（含奖励卡） ----------
  await page.keyboard.press('Enter');
  await until(async () => (await panel()).levelId === 'c2', '进入第 2 关');
  g = await game();
  const deck2 = LEVELS[1].deck.length + 1;
  check(g.hand.length + g.drawPile === deck2, `第 2 关牌组 ${deck2} 张（基础 ${LEVELS[1].deck.length} + 奖励 1）`);

  // ---------- 其余前四关用 winGameLevel 推进，第 5 关真打（自由咒语里打字） ----------
  for (const id of ['c2', 'c3', 'c4']) await evalRetry((lid) => window.__PYQUEST__.winGameLevel('cards', lid), id);
  await page.keyboard.press('Escape');
  await until(async () => !(await panel()).isOpen, '关面板');
  await evalRetry(() => window.__PYQUEST__.openGame('cards', 'c5'));
  await until(async () => (await panel()).levelId === 'c5', '直接打开第 5 关');
  await idle();
  g = await game();
  // 先演示一次：自由咒语 + 掩膜，实时预览会命中谁（开局没抽到自由咒语就点 ↺ 重新洗牌）
  const lv5 = LEVELS.find((l) => l.id === 'c5');
  for (let k = 0; k < 10 && !(g.hand.some((c) => c.id === 'free') && g.hand.some((c) => getCard(c.id).kind === 'op')); k++) {
    const a0 = g.attempt;
    await page.click('.cb-restart');
    await until(async () => (await game()).attempt === a0 + 1, '重新洗牌');
    await idle();
    g = await game();
  }
  const freeCard = g.hand.find((c) => c.id === 'free');
  const op5 = g.hand.find((c) => getCard(c.id).kind === 'op');
  check(!!(freeCard && op5), `第 5 关手牌里有自由咒语与操作卡（第 ${g.attempt} 次洗牌）`);
  if (freeCard && op5) {
    await pickCard(freeCard.uid);
    await pickCard(op5.uid);
    await page.locator('.cb-free').click();
    await page.keyboard.type('hp < 4 & ', { delay: 10 });
    await page.waitForTimeout(200);
    const status = await page.locator('#gp-status').textContent();
    check(/SyntaxError|Error/.test(status), `自由咒语写错时状态行给 Python 报错（${status.slice(0, 40)}…）`);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('hp < 4', { delay: 10 });
    await page.waitForTimeout(200);
    g = await game();
    const expect = g.hp.map((v, i) => (v < 4 ? i : -1)).filter((i) => i >= 0);
    check(same(g.preview.selection, expect) && /^hp\[hp < 4\] /.test(g.line), `自由咒语 hp < 4：预览命中 ${expect.join(', ')}（${g.line}）`);
    check((await panel()).isOpen, '在方括号里打字（含 e / 空格 / 数字）不会关面板或触发出牌');
    await shot('cb-05-free');
    // 点一下战场让输入框失焦，Backspace 取消选择，之后交给同步打法从头打
    await page.click('.cb-field');
    await page.keyboard.press('Backspace');
    g = await game();
    check(g.armed.sel === null && g.armed.op === null && same(g.hp, hpValues(createBattle(lv5, { attempt: g.attempt, extra: g.extra }))), '预览不改局面：取消后 hp 原样');
  }
  g = await game();
  const r5 = await playBattle(lv5, { attempt: g.attempt, extra: g.extra }, '第 5 关');
  check(r5.sim.over === 'win' && r5.mismatch === 0, `第 5 关打赢且界面与规则一致（${r5.sim.turn} 回合，${r5.typed} 次在自由咒语里打字）`);
  await until(async () => ['reward', 'won'].includes((await game()).phase) || (await panel()).winShown, '第 5 关结算');
  if ((await game()).phase === 'reward') await page.click('.cb-skip');
  await until(async () => (await panel()).winShown, '第 5 关通关浮层');
  check((await games()).state.cards.done.includes('c5'), '第 5 关记为通过');
  await shot('cb-06-c5-win');

  // ---------- 剩余核心关推进完：试炼场完成，碎片 +1 ----------
  for (const id of ['c6', 'c7']) await evalRetry((lid) => window.__PYQUEST__.winGameLevel('cards', lid), id);
  const gs = (await games()).state.cards;
  check(gs.complete && gs.unlocked.includes('cx'), '7 场核心战斗全部通过：阵列牌局完成，挑战关「不死军团」解锁');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  check(!(await panel()).isOpen && !(await paused()), 'Esc 关闭面板，游戏世界恢复');
  const st = await state();
  check(st.progress[3].shards === shards0 + 1, `第三章数值碎片 +1（${shards0} → ${st.progress[3].shards}）`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v3')).games.cards);
  check(saved && saved.doneAt && saved.levels.c1 && Array.isArray(saved.data.extra), '存档记着关卡进度、完成时间与持久牌组');

  // ---------- 挑战关打开看一眼：二维阵型 + 亡灵法师 ----------
  await evalRetry(() => window.__PYQUEST__.openGame('cards', 'cx'));
  await until(async () => (await panel()).levelId === 'cx', '打开挑战关');
  g = await game();
  check(g.shape.length === 2 && g.shape[0] === 2 && g.shape[1] === 3, `挑战关是 2×3 的二维阵型（${JSON.stringify(g.shape)}）`);
  check(await page.locator('.cb-axis.col').count() === 3 && await page.locator('.cb-axis.row').count() === 2, '二维阵型标出行号与列号');
  await shot('cb-07-challenge');
  await page.keyboard.press('Escape');
} catch (e) {
  failed = true;
  console.log(`✗ 异常：${e.message}`);
  await shot('cb-99-error').catch(() => {});
}

if (errors.length) { failed = true; console.log('浏览器报错：\n' + errors.join('\n')); }
await browser.close();
console.log(`\n[e2e-game-cards] ${failed ? '✗ 有失败' : '✓ 全部通过'}（${assertions} 项断言）`);
process.exit(failed ? 1 : 0);
