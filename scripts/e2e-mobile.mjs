// ============================================================
// 端到端测试（移动端触控）：手机横屏全流程
// 触屏开局 → 虚拟摇杆移动 → 摇杆按住时另一指挥剑（多点触控）→
// 交互按钮打开符文石 → 点选项答对领取碎片 → 对话框点按推进 →
// 地图 / 静音按钮 → 桌面视口下触控层不出现
// 用法: node scripts/e2e-mobile.mjs（需要先 npm run dev；或 npm run test:e2e -- mobile）
//
// 输入全部是真实触摸：点按用 locator.tap()（Playwright 触屏点按），
// 拖动摇杆 / 多指同时按用 CDP Input.dispatchTouchEvent（浏览器据此
// 生成 touch + pointer 事件，与真机路径一致）。作弊只用 __PYQUEST__ 语义动作
// （godmode / clearMinions / teleport）与只读查询（state / input / active）。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
let failed = false;
let assertions = 0;
const check = (cond, label) => {
  assertions++;
  if (cond) console.log(`  ✓ ${label}`);
  else { failed = true; console.log(`  ✗ ${label}`); }
};

const browser = await chromium.launch();

/** 与章节 runner 相同的测试环境封闭化：外部请求（字体 CDN）直接回空 200 */
async function sealed(page) {
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
  await page.route('**/*', (route) => (
    isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
  ));
}

/** 清档 → 标题 → 开始冒险（tap 为触屏点按，桌面上下文传 false 用鼠标点击）；
 *  onTitle 在标题画面停留时回调（用于断言标题说明） */
async function newGame(page, touch, onTitle) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  if (onTitle) await onTitle();
  if (touch) await page.locator('#btn-start').tap();
  else await page.locator('#btn-start').click();
  await page.waitForFunction(() => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.active();
    return !!(s && s.player);
  }, null, { timeout: 8000 });
  await page.waitForTimeout(800);
}

// ============================================================
// 一、手机横屏（iPhone 12-14 横屏 844×390，触屏 + 移动端）
// ============================================================
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
await sealed(page);
const cdp = await ctx.newCDPSession(page);
const shot = (name) => page.screenshot({ path: `scripts/shots/${name}.png` }).then(() => console.log(`📷 ${name}`));

const input = () => page.evaluate(() => window.__PYQUEST__.input());
const state = () => page.evaluate(() => window.__PYQUEST__.state());
const player = () => page.evaluate(() => {
  const p = window.__PYQUEST__.active().player;
  return { x: p.x, y: p.y, cd: p.attackCdUntil };
});
const mode = () => page.locator('#touch-layer').getAttribute('data-mode');
/** 等待页面条件成立（机器负载高时帧率低，用就绪条件代替固定等待；超时返回 false，由后续断言报告） */
const until = (pg, fn, arg, timeout = 5000) =>
  pg.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const tele = (x, y) => page.evaluate(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
/** 多指触摸：points = [{ x, y, id }]；type = touchStart | touchMove | touchEnd */
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
  type,
  touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })),
});
const centerOf = async (sel) => {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
};

console.log('[移动端] 开局');
await newGame(page, true, async () => {
  const keys = await page.locator('#title .keys').textContent();
  check(keys.includes('左半屏拖动') && !keys.includes('WASD'), '触屏设备的标题画面显示触控操作说明');
});
check((await input()).touch === true, '触屏开局后进入触控模式');
await page.waitForFunction(() => document.getElementById('touch-layer')?.dataset.mode === 'play', null, { timeout: 3000 })
  .catch(() => {});
check(await mode() === 'play', '世界场景中触控层显示（play 模式）');
check(await page.locator('.tc-attack').isVisible() && await page.locator('.tc-interact').isVisible(),
  '挥剑 / 交互按钮可见');
const atk = await centerOf('.tc-attack');
const small = await centerOf('.tc-map');
check(atk.w >= 44 && atk.h >= 44 && small.w >= 44 && small.h >= 44,
  `触控按钮真实尺寸 ≥ 44px（挥剑 ${Math.round(atk.w)}px / 地图 ${Math.round(small.w)}px）`);
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** 地图 / 静音小按钮与 HUD（碎片胶囊 + 爱心）互不遮挡 */
const hudClear = (pg) => Promise.all(['.hud-right', '#hearts', '.tc-map', '.tc-mute']
  .map((s) => pg.locator(s).boundingBox()))
  .then(([cap, hearts, m, u]) => [cap, hearts].every((h) => !overlap(h, m) && !overlap(h, u)));
check(await hudClear(page), '右上地图 / 静音按钮不遮挡 HUD');
await page.evaluate(() => {
  window.__PYQUEST__.godmode();
  window.__PYQUEST__.clearMinions(window.__PYQUEST__.active().scene.settings.key);
});
await shot('m01-play');

// ---------- 虚拟摇杆：按下点为中心，向右推满 ----------
console.log('[移动端] 虚拟摇杆');
await tele(2240, 896); // 村庄符文 v1 正下方的开阔地（与 e2e.mjs 同一落点）
await page.waitForTimeout(300);
const p0 = await player();
await touch('touchStart', [{ x: 150, y: 250, id: 0 }]);
await touch('touchMove', [{ x: 230, y: 250, id: 0 }]); // 超出半径 56 → 夹到满推
await page.waitForTimeout(120);
const held = await input();
check(held.stick.x > 0.95 && Math.abs(held.stick.y) < 0.05, `摇杆满推向右（stick=${held.stick.x.toFixed(2)}, ${held.stick.y.toFixed(2)}）`);
check(held.dir.dx === 1 && held.dir.dy === 0, '合并方向量化为「右」');

// 多点触控：摇杆不松手，第二指按挥剑
const before = (await player()).cd;
await touch('touchStart', [{ x: 230, y: 250, id: 0 }, { x: atk.x, y: atk.y, id: 1 }]);
await page.waitForTimeout(60);
// CDP 语义：touchEnd 会抬起全部手指；只抬第二指 = 发一个只含剩余手指的 touchMove
await touch('touchMove', [{ x: 230, y: 250, id: 0 }]);
await until(page, (x0) => window.__PYQUEST__.active().player.x > x0 + 150, p0.x);
const p1 = await player();
check(p1.cd > before, '摇杆按住时另一指点挥剑生效（多点触控）');
check(p1.x - p0.x > 150, `按住摇杆角色向右移动（Δx=${Math.round(p1.x - p0.x)}）`);
check((await input()).dir.dx === 1, '第二指抬起后摇杆仍在控制');

// 斜向：向右上推
await touch('touchMove', [{ x: 200, y: 200, id: 0 }]);
await page.waitForTimeout(80);
const diag = await input();
check(diag.dir.dx === 1 && diag.dir.dy === -1, '斜推量化为「右上」（8 向）');

await touch('touchEnd', []);
await until(page, () => {
  const v = window.__PYQUEST__.active().player.body.velocity;
  return v.x === 0 && v.y === 0;
});
const rel = await input();
check(rel.stick.x === 0 && rel.stick.y === 0 && rel.dir.dx === 0 && rel.dir.dy === 0, '松手后摇杆归零');
const p2 = await player();
await page.waitForTimeout(300);
const p3 = await player();
check(Math.abs(p3.x - p2.x) < 1 && Math.abs(p3.y - p2.y) < 1, '松手后角色停下');

// ---------- 交互按钮：符文石答题 ----------
console.log('[移动端] 交互按钮 → 答题');
await tele(2240, 896);
await until(page, () => !!document.querySelector('.tc-interact.ready'));
check(await page.locator('.tc-interact.ready').count() === 1, '靠近符文石时交互按钮高亮');
check((await page.locator('#hint').innerHTML()).includes('交互'), '提示条改为触控说法（点 交互）');
await page.locator('.tc-interact').tap();
await until(page, () => !!document.querySelector('#quiz-backdrop.show'));
check(await page.locator('#quiz-backdrop.show').count() === 1, '点交互按钮打开答题面板');
await until(page, () => document.getElementById('touch-layer').dataset.mode === 'off');
check(await mode() === 'off', '答题时触控层隐藏（不穿透）');
await shot('m02-quiz');

const optH = await page.locator('#quiz-options .opt').first().boundingBox();
check(optH.height >= 44, `选项真实可点高度 ≥ 44px（${Math.round(optH.height)}px）`);
const ans = await page.evaluate(() => window.__PYQUEST__.active().quiz.q.answer);
await page.locator(`#quiz-options .opt:nth-child(${ans + 1})`).tap();
await page.waitForTimeout(150);
// 确认按钮在小屏上可能在滚动区之外：tap 前 Playwright 会先滚动到可见（真机即手指上滑）
const confirm = page.locator('#quiz-confirm');
await confirm.scrollIntoViewIfNeeded();
const cBox = await confirm.boundingBox();
// 浮点包围盒：贴着屏幕底边时 y+h 可能比 390 多出零点几像素（亚像素），容差 1px
check(cBox.height >= 43 && cBox.y >= 0 && cBox.y + cBox.height <= 390 + 1,
  `确认按钮可达且 ≥ 44px（y=${cBox.y.toFixed(2)}, h=${cBox.height.toFixed(2)}）`);
await confirm.tap();
await until(page, () => !!document.querySelector('#quiz-feedback.ok'));
check(await page.locator('#quiz-feedback.ok').count() === 1, '点选正确项后答对');
await shot('m03-correct');
await confirm.scrollIntoViewIfNeeded();
await confirm.tap(); // 领取奖励
await until(page, () => window.__PYQUEST__.state().progress[1].shards === 1);
check((await state()).progress[1].shards === 1, '领取后碎片 +1');
await until(page, () => document.getElementById('touch-layer').dataset.mode === 'play');
check(await mode() === 'play', '关闭答题面板后触控层恢复');

// ---------- 对话框：点按推进 ----------
console.log('[移动端] 对话框点按推进');
const npc = await page.evaluate(() => {
  const n = window.__PYQUEST__.active().npc;
  return n && { x: n.x, y: n.y };
});
await tele(npc.x, npc.y + 200);
await until(page, () => !!document.querySelector('.tc-interact.ready'));
await page.locator('.tc-interact').tap();
await until(page, () => !!document.querySelector('#dialogue.show'));
check(await page.locator('#dialogue.show').count() === 1, '点交互按钮与 NPC 对话');
check(await mode() === 'off', '对话时触控层隐藏');
for (let i = 0; i < 30 && await page.locator('#dialogue.show').count() === 1; i++) {
  await page.locator('#dialogue').tap();
  await page.waitForTimeout(260);
}
check(await page.locator('#dialogue.show').count() === 0, '点按对话框逐句推进直到结束');

// ---------- 地图 / 静音 ----------
console.log('[移动端] 地图 / 静音按钮');
await page.locator('.tc-map').tap();
await until(page, () => !!document.querySelector('#map-backdrop.show'));
check(await page.locator('#map-backdrop.show').count() === 1, '地图按钮打开世界地图');
await until(page, () => document.getElementById('touch-layer').dataset.mode === 'map');
check(await mode() === 'map' && await page.locator('.tc-attack').isHidden(), '地图打开时只留地图按钮');
await shot('m04-map');
await page.locator('.tc-map').tap();
await until(page, () => !document.querySelector('#map-backdrop.show'));
check(await page.locator('#map-backdrop.show').count() === 0, '再点地图按钮关闭世界地图');
await until(page, () => document.getElementById('touch-layer').dataset.mode === 'play');
await page.locator('.tc-mute').tap();
await until(page, () => !!document.querySelector('.tc-mute.off'));
check(await page.locator('.tc-mute.off').count() === 1, '静音按钮切换为静音态');
await page.locator('.tc-mute').tap();
await until(page, () => !document.querySelector('.tc-mute.off'));
check(await page.locator('.tc-mute.off').count() === 0, '再点恢复声音');
await ctx.close();

// ============================================================
// 二、小屏横屏（740×360，右侧黑边只有 100px）：小按钮改竖排，仍不遮挡 HUD
// ============================================================
console.log('[小屏横屏] 布局');
const sctx = await browser.newContext({
  viewport: { width: 740, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const spage = await sctx.newPage();
await sealed(spage);
await newGame(spage, true);
await until(spage, () => document.getElementById('touch-layer')?.dataset.mode === 'play');
check(await hudClear(spage), '小屏横屏：地图 / 静音按钮不遮挡 HUD');
const sAtk = await spage.locator('.tc-attack').boundingBox();
check(sAtk.width >= 44 && sAtk.x + sAtk.width <= 740 && sAtk.y + sAtk.height <= 360, '小屏横屏：挥剑按钮完整在屏内');
await sctx.close();

// ============================================================
// 三、桌面（无触屏）：触控层不出现，键盘照旧
// ============================================================
console.log('[桌面] 触控层不出现');
const dctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const dpage = await dctx.newPage();
await sealed(dpage);
await newGame(dpage, false, async () => {
  check((await dpage.locator('#title .keys').textContent()).includes('WASD'), '桌面标题画面仍是键盘操作说明');
});
check(await dpage.evaluate(() => window.__PYQUEST__.input().touch) === false, '桌面视口不进入触控模式');
check(await dpage.locator('#touch-layer').isHidden(), '桌面视口下触控层不显示');
await dpage.evaluate(() => {
  window.__PYQUEST__.godmode();
  window.__PYQUEST__.teleport(2240, 896); // 与触控段同一块开阔地
});
await dpage.waitForTimeout(200);
const d0 = await dpage.evaluate(() => window.__PYQUEST__.active().player.x);
await dpage.keyboard.down('ArrowRight');
await until(dpage, (x0) => window.__PYQUEST__.active().player.x > x0 + 100, d0);
await dpage.keyboard.up('ArrowRight');
const d1 = await dpage.evaluate(() => window.__PYQUEST__.active().player.x);
check(d1 - d0 > 100, `桌面键盘移动不受影响（Δx=${Math.round(d1 - d0)}）`);
await dctx.close();

await browser.close();

console.log(`\n断言 ${assertions} 条`);
if (errors.length) {
  console.log('浏览器报错：');
  errors.forEach((e) => console.log('  ', e));
} else {
  console.log('浏览器无报错 ✓');
}
process.exit(failed || errors.length ? 1 : 0);
