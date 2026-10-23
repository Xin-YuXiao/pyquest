// #13 批次截图（b13-* 前缀）：胜利画面「章节封印页」
// 桌面 1200×800：入场稳定态 + 盖印动画中段一帧；竖屏 375×667：稳定态
// 对照旧版 design-07-victory.png（紫渐变星空模板）与 b9-04-victory-stamp.png（dot-sep 数据行）
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const browser = await chromium.launch();
const errors = [];
const check = (cond, label) => console.log(`  ${cond ? '✓' : '✗✗✗'} ${label}`);
const shot = (page) => async (name) => {
  await page.screenshot({ path: `scripts/shots/${name}.png` });
  console.log(`📷 ${name}`);
};

/** 第一章速通到胜利画面：resolves 于 #victory 显示的瞬间（动画 T=0） */
async function reachVictory(page) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.click('#btn-start');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.__PYQUEST__.applyTestState({
      progress: { 1: { shards: 5, gateOpen: true, bossShielded: false, bossDefeated: false } },
    });
    window.__PYQUEST__.active().scene.start('Dungeon');
  });
  await page.waitForFunction(() => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene('Dungeon');
    return !!(s && s.player);
  }, { timeout: 6000 });
  await page.evaluate(() => {
    const s = window.__PYQUEST__.scene('Dungeon');
    s.boss.setVelocity(0, 0); s.boss.knockUntil = 1e12;
    s.boss.hp = 1; s.boss.hurt(1, s.boss.x, s.boss.y - 1);
  });
  await page.waitForFunction(() =>
    !document.getElementById('victory').classList.contains('hidden'),
  { timeout: 8000 });
}

async function verifyDom(page) {
  check((await page.locator('#victory-title').textContent()).includes('第一章 完成！'),
    `标题文案: ${await page.locator('#victory-title').textContent()}`);
  check(await page.locator('.victory-stamp .pq-icon').count() === 1, '章节金印（盖章仪式主体）');
  check(await page.locator('.stat-seal').count() === 3, '三枚统计印');
  check((await page.locator('.stat-seal .pq-icon').count()) === 3, '统计印像素图标 ×3');
  const stats = await page.locator('#victory-stats').textContent();
  check(stats.includes('1 / 8'), `统计印含章节进度「1 / 8」（${stats}）`);
  check(await page.locator('#btn-next').count() === 1 && await page.locator('#btn-restart').count() === 1,
    '下一章 / 放弃冒险按钮在位');
}

// ---- 1. 桌面 1200×800 ----
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await reachVictory(page);
  await verifyDom(page);
  // 盖印动画中段：sealDrop 在 T+0.26s~T+0.72s，T+0.42s 处金印仍在空中（放大 + 半透明）
  await page.waitForTimeout(420);
  await shot(page)('b13-01-victory-stamp-mid');
  // 入场稳定态：全部动画（金印 0.72s / 统计印 1.15s+0.3s / 按钮 1.32s+0.3s）结束
  await page.waitForTimeout(2100);
  await shot(page)('b13-02-victory-stable');
  await page.close();
}

// ---- 2. 竖屏 375×667（稳定态，全屏竖排封印页） ----
{
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await reachVictory(page);
  await verifyDom(page);
  await page.waitForTimeout(2500);
  await shot(page)('b13-03-victory-portrait');
  await page.close();
}

console.log(errors.length ? `浏览器错误:\n${errors.join('\n')}` : '浏览器无报错 ✓');
await browser.close();
process.exit(errors.length ? 1 : 0);
