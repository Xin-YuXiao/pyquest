// #9-#11 批次复截（b9-* 前缀）：对话 / 地图 / HUD / 胜利
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

const shot = async (name, opts) => {
  await page.screenshot({ path: `scripts/shots/${name}.png`, ...opts });
  console.log(`📷 ${name}`);
};
const check = (cond, label) => console.log(`  ${cond ? '✓' : '✗✗✗'} ${label}`);
const waitForScene = (key) => page.waitForFunction((k) => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
  return !!(s && s.player);
}, key, { timeout: 6000 });
/** 连按 E 直到对话完全关闭 */
const closeDialogue = async () => {
  for (let i = 0; i < 12; i++) {
    if (await page.locator('#dialogue.show').count() === 0) return;
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
  }
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.click('#btn-start');
await page.waitForTimeout(1200);

// ---- 1. 对话：新档长老教学台词（含 kbd 键帽），入场动画结束后稳定态 ----
await page.evaluate(() => { window.__PYQUEST__.active().talkToElder(); });
await page.waitForTimeout(400);
await page.keyboard.press('KeyE'); // 补完第一行
await page.waitForTimeout(300);
await page.keyboard.press('KeyE'); // 第二行 = 键帽教学行
await page.waitForTimeout(1600);  // 打字机完成 + 入场动画（200ms）已结束
const kbdTexts = await page.locator('#dlg-text kbd').allTextContents();
check(kbdTexts.join(',') === '方向键,WASD,J,空格,E', `kbd 键帽渲染: ${JSON.stringify(kbdTexts)}`);
check(await page.locator('#dlg-next .pq-icon').count() === 1, '继续提示的像素下箭头');
check(await page.locator('#dlg-next kbd').count() === 1, '继续提示的 <kbd>E</kbd>');
await shot('b9-01-dialogue-kbd');
await closeDialogue();
check(await page.locator('#dialogue.show').count() === 0, '对话已关闭');

// ---- 2. HUD 特写：碎片胶囊 + 悬挂目标行分离 ----
await page.evaluate(() => { window.__PYQUEST__.setShards(1, 3); });
await page.waitForTimeout(500);
check(await page.locator('.hud-right #objective').count() === 0, '目标文案不在碎片胶囊内');
check((await page.locator('#objective').textContent()).includes('收集代码碎片'), `目标行: ${await page.locator('#objective').textContent()}`);
check((await page.locator('.hud-right').textContent()).includes('3 / 5'), `胶囊只含计数: ${await page.locator('.hud-right').textContent()}`);
await shot('b9-02-hud-objective', { clip: { x: 620, y: 20, width: 360, height: 140 } });

// ---- 3. 世界地图：像素图标（标题 / 传送提示 / 锁定 / 当前所在）----
await page.keyboard.press('Tab');
await page.waitForTimeout(600);
check(await page.locator('#map-backdrop.show').count() === 1, '地图已打开');
check(await page.locator('.map-title .pq-icon').count() === 1, '标题藏宝图图标');
check(await page.locator('.map-tip .pq-icon').count() === 1, '传送准星图标');
check(await page.locator('.map-node.locked .mn-badge .pq-icon').count() === 7, `锁定挂锁 × ${await page.locator('.map-node.locked .mn-badge .pq-icon').count()}（应 7）`);
check(await page.locator('.map-node.here .mn-badge .pq-icon').count() === 1, '当前所在大头针');
check((await page.locator('#map-sub').textContent()).includes('Tab'), 'map-sub 用 kbd Tab');
await shot('b9-03-worldmap');

// ---- 4. 胜利画面：章节印章 + 剥离 emoji 的标题 ----
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
await closeDialogue();
await page.evaluate(() => {
  window.__PYQUEST__.applyTestState({
    progress: { 1: { shards: 5, gateOpen: true, bossShielded: false, bossDefeated: false } },
  });
  window.__PYQUEST__.active().scene.start('Dungeon');
});
await waitForScene('Dungeon');
await page.evaluate(() => {
  const s = window.__PYQUEST__.scene('Dungeon');
  s.boss.setVelocity(0, 0); s.boss.knockUntil = 1e12;
  s.boss.hp = 1; s.boss.hurt(1, s.boss.x, s.boss.y - 1);
});
await page.waitForTimeout(2600);
check((await page.locator('#victory-title').textContent()).includes('第一章 完成！'), `标题文案: ${await page.locator('#victory-title').textContent()}`);
check(await page.locator('.victory-stamp .pq-icon').count() === 1, '章节印章图标');
await shot('b9-04-victory-stamp');

console.log(errors.length ? `浏览器错误:\n${errors.join('\n')}` : '浏览器无报错 ✓');
await browser.close();
process.exit(errors.length ? 1 : 0);
