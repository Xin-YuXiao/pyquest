// #12 移动端断裂修复验证（b12-* 前缀）：
//  - 桌面 1200×800（quiz / 地图 / 标题，无回归）+ 1000×700 地图直接对照 b9-03
//  - 移动竖屏 375×667：标题 / 野外+HUD / quiz / 地图（对照 design-m1~m4）
//  - 移动横屏 667×375：quiz / 地图抽查
//  - 结构断言：#ui-scale 的 computed scale == stage宽/960（与画布同系数）；
//    quiz 面板 getBoundingClientRect 不溢出 stage/视口；标题不截断；
//    竖屏时全屏浮层铺满视口、HUD 仍锚定画布顶部。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const browser = await chromium.launch();
let failed = false;
const check = (cond, label) => {
  console.log(`  ${cond ? '✓' : '✗✗✗'} ${label}`);
  if (!cond) failed = true;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function makePage(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()); });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return page;
}

/** 缩放一致性：#ui-scale computed scale == stage宽/960；canvas 盒 == stage 盒 */
async function assertScale(page, label) {
  const r = await page.evaluate(() => {
    const ui = document.getElementById('ui-scale');
    const stage = document.getElementById('stage');
    const canvas = stage.querySelector('canvas');
    return {
      k: new DOMMatrixReadOnly(getComputedStyle(ui).transform).a,
      stage: stage.getBoundingClientRect().toJSON(),
      ui: ui.getBoundingClientRect().toJSON(),
      canvas: canvas ? canvas.getBoundingClientRect().toJSON() : null,
      portrait: document.body.classList.contains('portrait'),
    };
  });
  const expect = r.stage.width / 960;
  check(near(r.k, expect, 0.002), `${label}：#ui-scale scale=${r.k.toFixed(4)} == stage宽/960=${expect.toFixed(4)}`);
  check(r.canvas && near(r.canvas.x, r.stage.x, 1.5) && near(r.canvas.width, r.stage.width, 1.5),
    `${label}：canvas 与 stage 左上角/宽度对齐（不漂移）`);
  return r;
}

/** 标题不截断：h1 无横向溢出且完整落在视口内 */
async function assertTitle(page, label) {
  const r = await page.evaluate(() => {
    const h1 = document.querySelector('#title h1');
    const b = h1.getBoundingClientRect();
    return { sw: h1.scrollWidth, cw: h1.clientWidth, box: b.toJSON(), vw: innerWidth, vh: innerHeight };
  });
  check(r.sw <= r.cw + 1, `${label}：标题无截断（scrollWidth ${r.sw} ≤ clientWidth ${r.cw}）`);
  check(r.box.left >= -0.5 && r.box.right <= r.vw + 0.5, `${label}：标题完整落在视口内（x ${r.box.left.toFixed(1)}~${r.box.right.toFixed(1)} / ${r.vw}）`);
}

/** quiz 面板不溢出：完全落在给定参考盒内 */
function assertInside(box, ref, label, tol = 0.5) {
  check(box.left >= ref.left - tol && box.right <= ref.right + tol
     && box.top >= ref.top - tol && box.bottom <= ref.bottom + tol,
    `${label}：quiz 面板在界内（[${box.left.toFixed(1)},${box.top.toFixed(1)} ~ ${box.right.toFixed(1)},${box.bottom.toFixed(1)}] within [${ref.left.toFixed(1)},${ref.top.toFixed(1)} ~ ${ref.right.toFixed(1)},${ref.bottom.toFixed(1)}]）`);
}

const quizBox = (page) => page.locator('#quiz').evaluate((el) => el.getBoundingClientRect().toJSON());
const viewportBox = (page) => page.evaluate(() => ({ left: 0, top: 0, right: innerWidth, bottom: innerHeight }));

async function openQuiz(page) {
  await page.evaluate(() => {
    const s = window.__PYQUEST__.active();
    s.player.setPosition(2240, 896);
    s.player.body.reset(2240, 896);
  });
  await page.waitForTimeout(350);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
}

// ============ 1. 桌面 1200×800 ============
console.log('== 桌面 1200×800 ==');
{
  const page = await makePage(1200, 800);
  const sc = await assertScale(page, '1200×800');
  check(!sc.portrait, '1200×800：非竖屏（.portrait 未挂）');
  await assertTitle(page, '1200×800');
  await page.screenshot({ path: 'scripts/shots/b12-d1-title.png' });
  console.log('📷 b12-d1-title.png');

  await page.click('#btn-start');
  await page.waitForTimeout(1300);
  await page.evaluate(() => { window.__PYQUEST__.setShards(1, 3); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'scripts/shots/b12-d2-hud.png' });
  console.log('📷 b12-d2-hud.png');

  await openQuiz(page);
  check(await page.locator('#quiz-backdrop.show').count() === 1, '1200×800：quiz 打开');
  assertInside(await quizBox(page), sc.stage, '1200×800');
  await page.screenshot({ path: 'scripts/shots/b12-d3-quiz.png' });
  console.log('📷 b12-d3-quiz.png');
  await page.keyboard.press('Escape').catch(() => {});
  await page.click('#quiz-cancel').catch(() => {});
  await page.waitForTimeout(400);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  check(await page.locator('#map-backdrop.show').count() === 1, '1200×800：地图打开');
  await page.screenshot({ path: 'scripts/shots/b12-d4-map.png' });
  console.log('📷 b12-d4-map.png');
  await page.close();
}

// ============ 2. 桌面 1000×700：世界地图直接对照 b9-03（同视口同状态） ============
console.log('== 桌面 1000×700（对照 b9-03）==');
{
  const page = await makePage(1000, 700);
  await assertScale(page, '1000×700');
  await page.click('#btn-start');
  await page.waitForTimeout(1300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  check(await page.locator('#map-backdrop.show').count() === 1, '1000×700：地图打开');
  await page.screenshot({ path: 'scripts/shots/b12-d5-map-1000.png' });
  console.log('📷 b12-d5-map-1000.png');
  await page.close();
}

// ============ 3. 移动竖屏 375×667（对照 design-m1~m4） ============
console.log('== 移动竖屏 375×667 ==');
{
  const page = await makePage(375, 667);
  const sc = await assertScale(page, '375×667');
  check(sc.portrait, '375×667：.portrait 已挂（竖屏断点生效）');
  // 竖屏扩展：#ui-scale 视觉盒应铺满整块视口
  const vb = await viewportBox(page);
  check(near(sc.ui.left, 0, 1) && near(sc.ui.top, 0, 1) && near(sc.ui.right, 375, 1) && near(sc.ui.bottom, 667, 1),
    `375×667：设计画布铺满视口（${sc.ui.left.toFixed(1)},${sc.ui.top.toFixed(1)} ~ ${sc.ui.right.toFixed(1)},${sc.ui.bottom.toFixed(1)}）`);
  await assertTitle(page, '375×667');
  await page.screenshot({ path: 'scripts/shots/b12-m1-title.png' });
  console.log('📷 b12-m1-title.png');

  await page.click('#btn-start');
  await page.waitForTimeout(1300);
  await page.evaluate(() => { window.__PYQUEST__.setShards(1, 3); });
  await page.waitForTimeout(400);
  // HUD 仍锚定画布（stage）顶部：#hud-top 设计 top:10px → 视觉 10×k 之下
  const hudTop = await page.locator('#hud-top').evaluate((el) => el.getBoundingClientRect().top);
  check(near(hudTop, sc.stage.top + 10 * sc.k, 2), `375×667：HUD 锚定画布顶部（hud top ${hudTop.toFixed(1)} ≈ stage top + 10×k = ${(sc.stage.top + 10 * sc.k).toFixed(1)}）`);
  await page.screenshot({ path: 'scripts/shots/b12-m2-field-hud.png' });
  console.log('📷 b12-m2-field-hud.png');

  await openQuiz(page);
  check(await page.locator('#quiz-backdrop.show').count() === 1, '375×667：quiz 打开');
  assertInside(await quizBox(page), vb, '375×667');
  await page.screenshot({ path: 'scripts/shots/b12-m3-quiz.png' });
  console.log('📷 b12-m3-quiz.png');
  await page.click('#quiz-cancel').catch(() => {});
  await page.waitForTimeout(400);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  check(await page.locator('#map-backdrop.show').count() === 1, '375×667：地图打开');
  const mapBox = await page.locator('#worldmap').evaluate((el) => el.getBoundingClientRect().toJSON());
  check(near(mapBox.left, 0, 1) && near(mapBox.right, 375, 1) && near(mapBox.top, 0, 1) && near(mapBox.bottom, 667, 1),
    `375×667：世界地图全屏列表（${mapBox.left.toFixed(1)},${mapBox.top.toFixed(1)} ~ ${mapBox.right.toFixed(1)},${mapBox.bottom.toFixed(1)}）`);
  await page.screenshot({ path: 'scripts/shots/b12-m4-map.png' });
  console.log('📷 b12-m4-map.png');
  await page.close();
}

// ============ 4. 移动横屏 667×375（抽查 quiz / 地图） ============
console.log('== 移动横屏 667×375 ==');
{
  const page = await makePage(667, 375);
  const sc = await assertScale(page, '667×375');
  check(!sc.portrait, '667×375：非竖屏');
  await page.click('#btn-start');
  await page.waitForTimeout(1300);
  await openQuiz(page);
  check(await page.locator('#quiz-backdrop.show').count() === 1, '667×375：quiz 打开');
  assertInside(await quizBox(page), sc.stage, '667×375');
  await page.screenshot({ path: 'scripts/shots/b12-l1-quiz.png' });
  console.log('📷 b12-l1-quiz.png');
  await page.click('#quiz-cancel').catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  check(await page.locator('#map-backdrop.show').count() === 1, '667×375：地图打开');
  const mapBox = await page.locator('#worldmap').evaluate((el) => el.getBoundingClientRect().toJSON());
  check(mapBox.top >= -0.5 && mapBox.bottom <= 375.5 && mapBox.left >= -0.5 && mapBox.right <= 667.5,
    `667×375：世界地图不溢出（${mapBox.left.toFixed(1)},${mapBox.top.toFixed(1)} ~ ${mapBox.right.toFixed(1)},${mapBox.bottom.toFixed(1)}）`);
  await page.screenshot({ path: 'scripts/shots/b12-l2-map.png' });
  console.log('📷 b12-l2-map.png');
  await page.close();
}

await browser.close();
console.log(failed ? '\n存在失败项 ✘' : '\n全部通过 ✔');
process.exit(failed ? 1 : 0);
