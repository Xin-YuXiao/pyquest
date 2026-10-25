// 设计审计截图脚本：标题 / 村庄 / 答题 / 对话 / 世界地图 / BOSS / 移动端
// 用法: node scripts/design-audit.mjs（需要先 npm run dev）
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });
const shot = (page) => async (name) => {
  await page.screenshot({ path: `scripts/shots/design-${name}.png` });
  console.log(`📷 design-${name}.png`);
};

const browser = await chromium.launch();

// ================= 桌面 1200×800（stage 恰好 3:2 满铺） =================
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const snap = shot(page);

const tele = (x, y) => page.evaluate(([tx, ty]) => {
  const s = window.__PYQUEST__.active();
  s.player.setPosition(tx, ty);
  s.player.body.reset(tx, ty);
}, [x, y]);
const freeze = () => page.evaluate(() => {
  const s = window.__PYQUEST__.active();
  s.player.invulUntil = 1e12;
});
const waitForScene = (key) => page.waitForFunction((k) => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
  return !!(s && s.player);
}, key, { timeout: 8000 });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. 标题界面
await snap('01-title');

// 2. 第一章野外（村庄）
await page.click('#btn-start');
await page.waitForTimeout(1500);
await freeze();
await snap('02-village');

// 2b. 靠近符文：底部提示条 + HUD 目标态
await tele(2240 + 0, 704 + 192); // v1 符文下方
await page.waitForTimeout(500);
await snap('02b-village-hint');

// 3. 答题浮层（打开态）
await page.keyboard.press('KeyE');
await page.waitForTimeout(600);
await snap('03-quiz');

// 3b. 答对态（✓ + 反馈 + 「领取奖励」）
const ansIdx = await page.evaluate(() => window.__PYQUEST__.active().quiz.q.answer);
await page.click(`#quiz-options .opt:nth-child(${ansIdx + 1})`);
await page.click('#quiz-confirm');
await page.waitForTimeout(450);
await snap('03b-quiz-correct');
await page.click('#quiz-confirm'); // 领取奖励关闭
await page.waitForTimeout(500);

// 3c. 答错态（✗ + 抖动 + 反馈）——开第二块符文
await tele(6 * 128 + 64, 15.5 * 128 + 64 + 192); // v2
await page.waitForTimeout(400);
await page.keyboard.press('KeyE');
await page.waitForTimeout(600);
const q2 = await page.evaluate(() => {
  const q = window.__PYQUEST__.active().quiz.q;
  return { answer: q.answer, n: q.options.length };
});
const wrongIdx = (q2.answer + 1) % q2.n;
await page.click(`#quiz-options .opt:nth-child(${wrongIdx + 1})`);
await page.click('#quiz-confirm');
await page.waitForTimeout(200);
await snap('03c-quiz-wrong');
await page.click('#quiz-cancel');
await page.waitForTimeout(400);

// 4. 对话框（长老）
await tele(11 * 128 + 64, 13 * 128 + 64 + 160); // NPC 下方
await page.waitForTimeout(400);
await page.keyboard.press('KeyE');
await page.waitForTimeout(1400); // 等第一行打完
await snap('04-dialogue');
// 关闭对话
for (let i = 0; i < 8; i++) { await page.keyboard.press('KeyE'); await page.waitForTimeout(200); }

// 5. 世界地图（Tab，初期状态：第1章 here，其余 locked）
await page.keyboard.press('Tab');
await page.waitForTimeout(600);
await snap('05-map');
await page.keyboard.press('Tab');
await page.waitForTimeout(300);

// 5b. 世界地图（中期状态：第1章 done，第2章 here，其余 locked）
await page.evaluate(() => {
  window.__PYQUEST__.applyTestState({
    current: 2,
    answered: ['v1'],
    progress: { 1: { shards: 5, gateOpen: true, bossDefeated: true, done: true } },
  });
});
await page.keyboard.press('Tab');
await page.waitForTimeout(600);
await snap('05b-map-progress');
await page.keyboard.press('Tab');
await page.waitForTimeout(300);

// 6. 巢穴 / BOSS 战（数据地牢）
await page.evaluate(() => {
  window.__PYQUEST__.applyTestState({ progress: { 1: { gateOpen: true } } });
  window.__PYQUEST__.active().scene.start('Dungeon', { spawn: 'fromField' });
});
await waitForScene('Dungeon');
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = window.__PYQUEST__.scene('Dungeon');
  s.player.invulUntil = 1e12;
});
await tele(13.5 * 128 + 64, 9 * 128 + 64); // BOSS 下方
await page.waitForTimeout(500);
await snap('06-boss');

// 6b. BOSS 符文答题（紫色章节标签态）
await tele(9 * 128 + 64, 6 * 128 + 64 + 192); // boss 符文
await page.waitForTimeout(400);
await page.keyboard.press('KeyE');
await page.waitForTimeout(600);
await snap('06b-boss-quiz');
await page.click('#quiz-cancel');
await page.waitForTimeout(300);

// 7. 胜利画面（快速击杀 BOSS）
await page.evaluate(() => {
  const s = window.__PYQUEST__.scene('Dungeon');
  if (s.boss) s.boss.hurt(9999, 1792, 800);
});
await page.waitForTimeout(2200);
await snap('07-victory');
await page.close();

// ================= 移动端 375×667 =================
const m = await browser.newPage({ viewport: { width: 375, height: 667 } });
const msnap = shot(m);
await m.goto(BASE, { waitUntil: 'networkidle' });
await m.evaluate(() => localStorage.clear());
await m.reload({ waitUntil: 'networkidle' });
await m.waitForTimeout(1500);
await msnap('m1-title');
await m.click('#btn-start');
await m.waitForTimeout(1500);
await m.evaluate(() => { window.__PYQUEST__.active().player.invulUntil = 1e12; });
await msnap('m2-village');
await m.evaluate(() => {
  const s = window.__PYQUEST__.active();
  s.player.setPosition(17 * 128 + 64, 5 * 128 + 64 + 192);
  s.player.body.reset(17 * 128 + 64, 5 * 128 + 64 + 192);
});
await m.waitForTimeout(400);
await m.keyboard.press('KeyE');
await m.waitForTimeout(600);
await msnap('m3-quiz');
await m.keyboard.press('Escape');
await m.waitForTimeout(300);
await m.evaluate(() => { window.__PYQUEST__.active().scene.resume(); });
await m.waitForTimeout(200);
await m.keyboard.press('Tab');
await m.waitForTimeout(600);
await msnap('m4-map');
await m.close();

await browser.close();
console.log('done');
