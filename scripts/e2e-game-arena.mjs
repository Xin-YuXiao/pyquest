// ============================================================
// 端到端测试：第三章试炼场「向量风暴」（src/games/arena）
// 用法: node scripts/e2e-game-arena.mjs（需要先起 dev server；npm run test:e2e -- game-arena 会自动起服）
//
// 交互路径保持真实：E 键进入竞技场、在备咒台用真实键盘输入法术（顺带验证 d / s / w 不被游戏吞掉）、
// 点「开战」、按 Q 放法术、点「返回高原」；作弊只走 window.__PYQUEST__ 语义动作
// （gotoChapter / teleport / godmode / clearMinions / winGameLevel），状态读取走只读快照 games() / state()。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import { LEVELS } from '../src/games/arena/levels.js';
import { evaluateSpell, sampleEnemies } from '../src/games/arena/rules.js';

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
    try { return await page.evaluate(fn, arg); }
    catch (e) { last = e; await page.waitForTimeout(350); }
  }
  throw last;
};
const state = () => evalRetry(() => window.__PYQUEST__.state());
const games = () => evalRetry(() => window.__PYQUEST__.games());
const arena = async () => (await games()).arena;
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
async function until(pred, label, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await pred()) return true;
    await page.waitForTimeout(200);
  }
  throw new Error(`until 超时：${label}`);
}
const qInput = '.ar-spell[data-spell="0"] .sp-input';
const rInput = '.ar-spell[data-spell="1"] .sp-input';
async function typeInto(sel, text) {
  await page.fill(sel, '');
  await page.click(sel);
  await page.keyboard.type(text, { delay: 15 });
  await page.waitForTimeout(250); // 等实时预览（90ms 防抖）
}

/** 站到向量风暴石台前按 E，直到切进竞技场 */
async function enterArena(ch) {
  const site = ch.buildField(ch).props.find((p) => p.type === 'game' && p.game === 'arena');
  for (const [x, y] of [[site.x, site.y + 170], [site.x + 170, site.y], [site.x - 170, site.y]]) {
    await tele(x, y);
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    try {
      await page.waitForFunction(() => {
        const s = window.__PYQUEST__.active();
        return !!(s && s.scene.settings.key === 'VectorArena' && s.arena);
      }, null, { timeout: 4000 });
      return site;
    } catch { /* 换一个靠近点 */ }
  }
  throw new Error('enterArena：进不了竞技场');
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
  await evalRetry(() => window.__PYQUEST__.gotoChapter(3));
  await page.waitForFunction((k) => !!(window.__PYQUEST__.scene(k) && window.__PYQUEST__.scene(k).player), ch.fieldKey, { timeout: 8000 });
  await page.waitForTimeout(700);
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), ch.fieldKey);
  const heartsBefore = (await state()).hearts;
  const shardsBefore = (await state()).progress[3].shards;

  // ============================================================
  // 第 1 关 · 史莱姆潮
  // ============================================================
  const site = await enterArena(ch);
  check(true, 'E 键从高原石台进入「向量风暴」竞技场');
  await until(async () => (await arena()).prepOpen, '备咒台打开');
  let a = await arena();
  check(a.levelId === 'a1' && a.phase === 'prep', `从第 1 关开始，先进备咒台（${a.levelId} / ${a.phase}）`);
  check(await evalRetry(() => window.__PYQUEST__.active().scene.isPaused()), '备咒时战斗暂停');
  check((await page.locator('.ar-arrays').textContent()).includes('hp'), '备咒台列出示例战场的 hp / dist / elite');
  check(await page.locator('.ar-radar .ar-foe').count() === LEVELS[0].sample.hp.length, '雷达图画出示例战场的每个敌人');

  // 先写错：只算不写回 hp
  await typeInto(qInput, 'hp - 1');
  check((await page.locator('[data-k="effect0"]').textContent()).includes('没有改 hp'), '「hp - 1」被判为没写回 hp');
  // 再写对：真实键盘输入
  await typeInto(qInput, 'hp -= 1');
  check(await page.inputValue(qInput) === 'hp -= 1', 'Q 槽输入框收到 hp -= 1');
  const exp = evaluateSpell('hp -= 1', sampleEnemies(LEVELS[0]));
  const eff0 = await page.locator('[data-k="effect0"]').textContent();
  check(eff0.includes(`命中 ${exp.hits} 个`) && eff0.includes(`消耗 ${exp.cost} 法力`), `预览：${eff0.trim()}`);
  check((await page.locator('.ar-spell[data-spell="0"] .sp-out').textContent()).includes('hp →'), '输入区实时显示执行后的 hp');
  // R 槽：含 d / s / w 的字母不被游戏快捷键吞掉
  await typeInto(rInput, 'hp[dist < 3] -= 1');
  check(await page.inputValue(rInput) === 'hp[dist < 3] -= 1', 'R 槽输入「hp[dist < 3] -= 1」完整（d / s 没被当成移动键）');
  await shot('arena-01-prep');

  await page.click('[data-k="go"]');
  await until(async () => (await arena()).phase === 'fight' && (await arena()).alive >= 30, '开战且史莱姆潮刷满');
  a = await arena();
  check(!a.prepOpen && a.spells[0] === 'hp -= 1', `开战：场上 ${a.alive} 只，法术槽 Q = ${a.spells[0]}`);
  check(a.hp.every((x) => x === 1 || x === 2), `hp 数组按刷出的敌人现场生成（${a.hp.length} 个，取值 1 / 2）`);
  await evalRetry(() => window.__PYQUEST__.godmode());
  await page.waitForTimeout(300);
  await shot('arena-02-swarm');

  const aliveBefore = (await arena()).alive;
  const twoHp = (await arena()).hp.filter((x) => x === 2).length;
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(120);
  await shot('arena-03-lightning');
  await until(async () => (await arena()).casts >= 1, '第一次施法');
  // 击杀按敌人顺序逐个延时结算（每只 +12ms），等全部倒下再断言
  await until(async () => { const s = await arena(); return s.alive <= twoHp || s.won; }, '一句法术后只剩 2 血的那批', 5000).catch(() => {});
  a = await arena();
  check(a.casts === 1, '按 Q 放出 1 次法术');
  check(a.spellKills >= aliveBefore - twoHp && a.alive <= twoHp, `一句 hp -= 1：法术击杀 ${a.spellKills}，只剩 ${a.alive} 只（原本 2 血的 ${twoHp} 只）`);
  check(a.hp.every((x) => x === 1), `剩下的 hp 全部降到 1（${JSON.stringify(a.hp)}）`);
  check(a.mana < LEVELS[0].mana.max, `法力扣除（剩 ${a.mana}）`);
  // 冷却结束后再放一次，清场
  for (let i = 0; i < 12 && !(await arena()).won; i++) {
    await page.waitForTimeout(500);
    await page.keyboard.press('KeyQ');
  }
  await until(async () => (await arena()).won, '第 1 关清场', 15000);
  await page.waitForSelector('.ar-result:not([hidden])', { timeout: 5000 });
  a = await arena();
  check(a.result && a.result.won && a.result.medal, `结算：${a.result.score} 秒，${a.result.medal}`);
  const resultText = await page.locator('.ar-result').textContent();
  check(resultText.includes('法术击杀') && resultText.includes('下一关'), '结算浮层显示击杀对比与「下一关」');
  const gs = (await games()).state.arena;
  check(gs.done.includes('a1') && gs.unlocked.includes('a2'), '第 1 关记入进度，第 2 关解锁');
  await shot('arena-04-result');

  // ============================================================
  // 第 2 关 · 近身防卫：法力上限挡住「对全场施法」、战斗中途改写法术
  // ============================================================
  await page.click('[data-k="rnext"]');
  await page.waitForFunction(() => {
    const s = window.__PYQUEST__.active();
    return !!(s && s.arena && s.levelId === 'a2' && s.ui && s.ui.prepOpen);
  }, null, { timeout: 8000 });
  check((await arena()).levelId === 'a2', '「下一关」进入第 2 关，先备咒');
  await typeInto(qInput, 'hp -= 100');
  check((await page.locator('[data-k="effect0"]').textContent()).includes('超过法力上限'), '预览提示 hp -= 100 超过法力上限');
  await typeInto(rInput, '');
  await page.click('[data-k="go"]');
  await evalRetry(() => window.__PYQUEST__.godmode());
  await until(async () => (await arena()).alive >= 6, '近身防卫刷出一批敌人', 15000);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(250);
  const toast = await page.locator('.ar-toast').textContent();
  check(toast.includes('法力') && (await arena()).casts === 0, `法力不够放不出来：「${toast.trim()}」`);
  // 中途按 B 改写法术
  await page.keyboard.press('KeyB');
  await until(async () => (await arena()).prepOpen, '战斗中途打开备咒台');
  check((await page.locator('[data-k="pmode"]').textContent()).includes('暂停'), '备咒台标明战斗已暂停');
  check((await page.locator('[data-k="fieldhead"]').textContent()).includes('当前战场'), '中途备咒用当前战场的数组预览');
  await typeInto(qInput, 'hp[dist < 3] -= 3');
  await page.keyboard.press('Escape');
  await until(async () => !(await arena()).prepOpen, 'Esc 回到战斗');
  check((await arena()).spells[0] === 'hp[dist < 3] -= 3', '法术槽更新为 hp[dist < 3] -= 3');
  // 把玩家传到某个敌人身边，保证 dist < 3 有人可打
  const target = await evalRetry(() => {
    const s = window.__PYQUEST__.active();
    const e = s.enemies.find((x) => x.active && !x.dead);
    return e ? { x: e.x, y: e.y } : null;
  });
  if (target) await tele(target.x + 140, target.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyQ');
  await until(async () => (await arena()).casts >= 1, '掩膜法术放出', 6000);
  a = await arena();
  check(a.casts === 1 && a.spellKills >= 1, `hp[dist < 3] -= 3 打掉近身的敌人（法术击杀 ${a.spellKills}）`);
  await shot('arena-05-mask');
  // 离开竞技场
  await page.keyboard.press('KeyB');
  await until(async () => (await arena()).prepOpen, '再开备咒台');
  await page.click('[data-k="leave"]');
  await page.waitForFunction((k) => {
    const s = window.__PYQUEST__.active();
    return !!(s && s.scene.settings.key === k && s.player);
  }, ch.fieldKey, { timeout: 8000 });
  await page.waitForTimeout(500);
  const p = await evalRetry(() => ({ x: window.__PYQUEST__.active().player.x, y: window.__PYQUEST__.active().player.y }));
  check(Math.hypot(p.x - site.x, p.y - site.y) < 400, '「返回高原」回到向量风暴石台前');
  const st = await state();
  check(st.hearts === heartsBefore, `竞技场里的伤不带回高原（爱心 ${st.hearts}）`);
  check(st.progress[3].shards === shardsBefore, '只过了 1 关，还没发碎片');

  // ============================================================
  // 其余核心关（语义动作推进）→ 试炼场完成发碎片
  // ============================================================
  for (const id of ['a2', 'a3']) {
    await evalRetry((lid) => window.__PYQUEST__.winGameLevel('arena', lid), id);
    check((await state()).progress[3].shards === shardsBefore, `通过 ${id}：核心关没全过，不发碎片`);
  }
  const r4 = await evalRetry(() => window.__PYQUEST__.winGameLevel('arena', 'a4'));
  check(r4.completed && r4.shard, '第 4 关通过：向量风暴完成');
  check((await state()).progress[3].shards === shardsBefore + 1, `核心关全过 → 数值碎片 +1（${shardsBefore} → ${(await state()).progress[3].shards}）`);
  const g2 = (await games()).state.arena;
  check(g2.complete && g2.unlocked.includes('a5'), '挑战关 ★ 无尽潮解锁');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v3')).games.arena);
  check(saved && saved.levels.a1 && saved.levels.a4 && saved.doneAt && saved.data.spells.a2[0] === 'hp[dist < 3] -= 3', '进度与写过的法术都进了存档');
  await shot('arena-06-plateau');

  // 再次进入：直接到挑战关，法术槽记得上次写的（挑战关还没写过 → 空）
  await enterArena(ch);
  await until(async () => (await arena()).prepOpen, '挑战关备咒台');
  a = await arena();
  check(a.levelId === 'a5', '核心关全过后再进竞技场 → 挑战关');
  check((await page.locator('[data-k="ptitle"]').textContent()).includes('无尽潮'), '备咒台标题是「无尽潮」');
  await shot('arena-07-challenge-prep');
} catch (e) {
  failed = true;
  console.log(`  ✗ 异常：${e.message}`);
  await shot('arena-zz-failure').catch(() => {});
}

const realErrors = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
check(!realErrors.length, `浏览器无报错${realErrors.length ? `：${realErrors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(`\n[e2e-game-arena] ${failed ? '✗ 有失败' : '✓ 全部通过'}（${assertions} 项断言）`);
process.exit(failed ? 1 : 0);
