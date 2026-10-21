// 端到端测试（第五章 · 加速熔炉）：全流程
// 引擎碎片 ×3 → 解开封印 → 迟缓深渊 → 破盾 → 净化迟缓巨魔 → 进入第六章
// 用法: node scripts/e2e-ch5.mjs（需要先 npm run dev）
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';

const CH = CHAPTERS.find((c) => c.id === 5);
const NEXT = CHAPTERS.find((c) => c.id === 6);
const FIELD = CH.buildField(CH);
const LAIR = CH.buildLair(CH);

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
const steps = [];
let failed = false;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `scripts/shots/${name}.png` });
  steps.push(`📷 ${name}`);
  console.log(`📷 ${name}`);
};
const check = (cond, label) => {
  if (cond) { steps.push(`  ✓ ${label}`); console.log(`  ✓ ${label}`); }
  else { failed = true; steps.push(`  ✗ ${label}`); console.log(`  ✗ ${label}`); }
};

const activeKey = () => page.evaluate(() => window.__PYQUEST__.active().scene.settings.key);
const tele = (x, y) => page.evaluate(([tx, ty]) => {
  const s = window.__PYQUEST__.active();
  s.player.setPosition(tx, ty);
  s.player.body.reset(tx, ty);
}, [x, y]);
const freeze = () => page.evaluate(() => {
  const s = window.__PYQUEST__.active();
  s.player.invulUntil = 1e12;
});
const G = () => page.evaluate(() => window.__PYQUEST__.G);
const waitForScene = (key) => page.waitForFunction((k) => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
  return !!(s && s.player);
}, key, { timeout: 6000 });

/** 为符文选一个安全的靠近点：距目标符文 < 260，且避开其他符文/封印门（282）、
 *  引导石碑（302）、水晶实体（180）与地图边界——防止 E 被邻近交互抢占 */
function approachPoint(map, r) {
  const npc = map.props.find((p) => p.type === 'npc');
  const solids = map.props.filter((p) => p.type === 'crystal');
  const others = map.props.filter((p) => (p.type === 'rune' && p.qid !== r.qid) || p.type === 'doorlink');
  const W = map.w * 128, H = map.h * 128;
  for (let radius = 120; radius <= 250; radius += 20) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = r.x + Math.round(Math.cos(a) * radius);
      const py = r.y + Math.round(Math.sin(a) * radius);
      if (px < 200 || py < 200 || px > W - 200 || py > H - 200) continue;
      if (others.some((o) => Math.hypot(px - o.x, py - o.y) < 282)) continue;
      if (solids.some((o) => Math.hypot(px - o.x, py - o.y) < 180)) continue;
      if (npc && Math.hypot(px - npc.x, py - npc.y) < 302) continue;
      return [px, py];
    }
  }
  return [r.x, r.y + 192]; // 兜底：样板默认位
}

async function openRune(map, r, label) {
  // 逐条关掉可能残留的对话（石碑对话会暂停场景并吞掉后续 E）
  const closeDialogue = async () => {
    for (let i = 0; i < 12; i++) {
      if (await page.locator('#dialogue.show').count() === 0) return;
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(240);
    }
  };
  // 首选安全靠近点；失败再按南 / 东 / 北 / 西方位轮询
  const candidates = [
    approachPoint(map, r),
    [r.x, r.y + 192], [r.x + 192, r.y], [r.x, r.y - 192], [r.x - 192, r.y],
  ];
  for (const [px, py] of candidates) {
    await closeDialogue();
    await tele(px, py);
    await page.waitForTimeout(320);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(480);
    if (await page.locator('#quiz-backdrop.show').count() === 1) {
      // 确认打开的正是这块符文：只有它的槽位会记录抽题
      const mine = await page.evaluate((slot) => {
        const s = window.__PYQUEST__.active();
        return s.quiz.isOpen && !!window.__PYQUEST__.G.runeRolls[slot];
      }, r.qid);
      if (mine) {
        check(true, `${label} 答题面板打开`);
        return true;
      }
      await page.click('#quiz-cancel'); // 打开的是邻近符文：取消后换点重试
      await page.waitForTimeout(400);
    }
  }
  await closeDialogue();
  check(false, `${label} 答题面板打开`);
  return false;
}

async function answerCorrect(label) {
  const ansIdx = await page.evaluate(() => window.__PYQUEST__.active().quiz.q.answer);
  await page.click(`#quiz-options .opt:nth-child(${ansIdx + 1})`);
  await page.click('#quiz-confirm');
  await page.waitForTimeout(380);
  const ok = await page.locator('#quiz-feedback.ok').count() === 1;
  check(ok, `${label} 答对`);
  await page.click('#quiz-confirm');
  await page.waitForTimeout(420);
}

// 把 BOSS 钉在指定位置并冻结 AI，保证挥剑命中确定性
const pinBoss = (x, y) => page.evaluate(([k, bx, by]) => {
  const s = window.__PYQUEST__.scene(k);
  s.boss.setVelocity(0, 0);
  s.boss.knockUntil = 1e12;
  s.boss.setPosition(bx, by);
  s.boss.body.reset(bx, by);
}, [CH.lairKey, x, y]);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

// ---- 新游戏 → 作弊跳过前四章，直达第五章 ----
await page.click('#btn-start');
await page.waitForTimeout(1200);
check(await activeKey() === 'Village', '新游戏从村庄开始');

await page.evaluate(([n, key]) => {
  const G = window.__PYQUEST__.G;
  for (let id = 1; id < n; id++) {
    const p = G.progress[id];
    p.shards = 5; p.gateOpen = true; p.bossShielded = false;
    p.bossDefeated = true; p.done = true;
  }
  G.current = n;
  window.__PYQUEST__.active().scene.start(key, { spawn: 'fromPrev' });
}, [CH.id, CH.fieldKey]);
await waitForScene(CH.fieldKey);
await page.waitForTimeout(700);
check(await activeKey() === CH.fieldKey, `进入第五章 · ${CH.fieldName}`);
await freeze();
await shot('50-c5field');

// ---- 3 块引擎碎片符文（题目从 w5shard 题池随机抽取） ----
const shardRunes = FIELD.props.filter((p) => p.type === 'rune' && !p.healRune && !p.bossRune);
check(shardRunes.length === CH.shardsNeeded, `熔炉有 ${CH.shardsNeeded} 块碎片符文（实际 ${shardRunes.length}）`);
for (let i = 0; i < shardRunes.length; i++) {
  const r = shardRunes[i];
  await openRune(FIELD, r, `符文 ${r.qid}`);
  // 章节徽标应为第五章
  const badge = await page.locator('#quiz-chapter').textContent();
  check(badge.includes('第五章'), `题目来自第五章题池（${badge}）`);
  await answerCorrect(`${r.qid}（加速随机题）`);
}
const g1 = await G();
check(g1.progress[5].shards === CH.shardsNeeded, `集齐 ${CH.shardsNeeded} 枚引擎碎片（实际 ${g1.progress[5].shards}）`);

// ---- 北方深渊封印：碎片不足时拒绝，集齐后按 E 解开 ----
const door = FIELD.props.find((p) => p.type === 'doorlink');
await page.evaluate(() => { window.__PYQUEST__.G.progress[5].shards = 0; });
await tele(door.x, door.y + 192);
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
check(await page.locator('#dialogue.show').count() === 1, '碎片不足时封印之门拒绝开启');
for (let i = 0; i < 6; i++) {
  if (await page.locator('#dialogue.show').count() === 0) break;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(260);
}
await page.evaluate(() => { window.__PYQUEST__.G.progress[5].shards = 3; });
await tele(door.x, door.y + 192);
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
const gateOpen5 = await page.evaluate(() => window.__PYQUEST__.G.progress[5].gateOpen);
check(gateOpen5, '集齐引擎碎片后封印解开');

// ---- 进入迟缓深渊 ----
await tele(door.x, 100);
await waitForScene(CH.lairKey);
await page.waitForTimeout(700);
check(await activeKey() === CH.lairKey, `进入${CH.lairName}`);
await freeze();
await page.evaluate((k) => {
  const s = window.__PYQUEST__.scene(k);
  if (s.boss) { s.boss.setVelocity(0, 0); s.boss.knockUntil = 1e12; }
  s.slimeGroup.children.iterate((sl) => {
    if (sl && !sl.isBoss) { sl.dead = true; sl.destroy(); }
  });
}, CH.lairKey);
await shot('51-c5lair');

const shielded5 = await page.evaluate(() => window.__PYQUEST__.G.progress[5].bossShielded);
check(shielded5, `${CH.bossName}初始处于护盾状态`);

// ---- 祝福符文（回心不产碎片）×3 + BOSS 符文 ----
const healRunes = LAIR.props.filter((p) => p.type === 'rune' && p.healRune);
check(healRunes.length === 3, `深渊有 3 块祝福符文（实际 ${healRunes.length}）`);
await openRune(LAIR, healRunes[0], `符文 ${healRunes[0].qid}`);
await answerCorrect(`${healRunes[0].qid}（祝福随机题）`);
const healCheck = await page.evaluate(() => window.__PYQUEST__.G.progress[5].shards);
check(healCheck === 3, `祝福符文不产碎片（碎片仍 ${healCheck}）`);

const bossRune = LAIR.props.find((p) => p.type === 'rune' && p.bossRune);
await openRune(LAIR, bossRune, 'BOSS 符文');
const bossBadge = await page.locator('#quiz-chapter').textContent();
check(bossBadge.includes('第五章'), `BOSS 谜题来自第五章题池（${bossBadge}）`);
await answerCorrect('BOSS 符文（加速综合随机题）');
const shieldBroken5 = await page.evaluate(() => window.__PYQUEST__.G.progress[5].bossShielded === false);
check(shieldBroken5, `答对加速谜题，${CH.bossName}护盾破碎`);

// ---- 攻击迟缓巨魔（BossSlime 机制）→ 击败 ----
const bossX = LAIR.boss.x, bossY = LAIR.boss.y;
await pinBoss(bossX, bossY);
await tele(bossX, bossY - 192); // 巨魔正上方，向右挥剑
await page.waitForTimeout(250);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(320);
const hpAfterHit = await page.evaluate((k) => {
  const s = window.__PYQUEST__.scene(k);
  return s.boss ? s.boss.hp : -1;
}, CH.lairKey);
check(hpAfterHit === 9, `破盾后挥剑命中巨魔（hp=${hpAfterHit}）`);
await shot('52-slime5');

await page.evaluate(([k, bx, by]) => {
  const s = window.__PYQUEST__.scene(k);
  if (s.boss) { s.boss.hp = 1; s.boss.hurt(1, bx, by); } // 最后一击
}, [CH.lairKey, bossX, bossY + 224]);
await page.waitForTimeout(2400);
const gEnd = await G();
check(gEnd.progress[5].done, `击败${CH.bossName}，第五章通关`);
check(await page.locator('#victory').evaluate((el) => !el.classList.contains('hidden')), '胜利画面出现');
check((await page.locator('#victory-title').textContent()).includes('第五章'), '显示第五章通关标题');
const stats = await page.locator('#victory-stats').textContent();
check(stats.includes('5 / 8'), `结算显示章节进度（${stats}）`);
await shot('53-victory5');

// ---- 下一章衔接：第六章 · 数值方法神殿 ----
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v2') || 'null'));
check(!!saved && saved.progress[5].done === true, '第五章进度已自动存档（v2）');

await page.click('#btn-next');
await waitForScene(NEXT.fieldKey);
await page.waitForTimeout(700);
check(await activeKey() === NEXT.fieldKey, `通关后进入第六章 · ${NEXT.fieldName}`);
await freeze();
await shot('54-c6f-intro');

// ---- 刷新 → 继续冒险应落在第六章 ----
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
const btnText = (await page.locator('#btn-start').textContent()).trim();
check(btnText.includes('第6章'), `标题画面显示「${btnText}」`);
await page.click('#btn-start');
await page.waitForTimeout(1200);
check(await activeKey() === NEXT.fieldKey, '读档后落到第六章野外');
await shot('55-resume-c6');

// ---- 汇总 ----
console.log('=== E2E 第五章测试结果 ===');
for (const s of steps) console.log(s);
if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
else console.log('浏览器无报错 ✓');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
