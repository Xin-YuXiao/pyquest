// 重拍：BOSS 战 + 胜利画面（保持 done=false 让 BOSS 真实生成）
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

const tele = (x, y) => page.evaluate(([tx, ty]) => {
  const s = window.__PYQUEST__.active();
  s.player.setPosition(tx, ty);
  s.player.body.reset(tx, ty);
}, [x, y]);
const waitForScene = (key) => page.waitForFunction((k) => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
  return !!(s && s.player);
}, key, { timeout: 8000 });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btn-start');
await page.waitForTimeout(1400);

// 第1章：碎片集齐、门开、未通关 → BOSS 真实存在
await page.evaluate(() => {
  window.__PYQUEST__.applyTestState({
    current: 1,
    progress: { 1: { shards: 5, gateOpen: true, bossDefeated: false, done: false } },
  });
  window.__PYQUEST__.active().scene.start('Dungeon', { spawn: 'fromField' });
});
await waitForScene('Dungeon');
await page.waitForTimeout(900);
await page.evaluate(() => { window.__PYQUEST__.scene('Dungeon').player.invulUntil = 1e12; });
await tele(13.5 * 128 + 64, 9 * 128 + 64);
await page.waitForTimeout(500);
await page.screenshot({ path: 'scripts/shots/design-06-boss.png' });
console.log('📷 design-06-boss.png');

// 击败 BOSS → 胜利画面
await page.evaluate(() => {
  const s = window.__PYQUEST__.scene('Dungeon');
  if (s.boss) s.boss.hurt(9999, 1792, 800);
});
await page.waitForTimeout(2400);
await page.screenshot({ path: 'scripts/shots/design-07-victory.png' });
console.log('📷 design-07-victory.png');
await browser.close();
console.log('done');
