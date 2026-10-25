// ============================================================
// 端到端测试（功能 · 秘藏彩蛋）
//   村庄「你好世界石」：靠近提示 → 按 E 发现（计数 +1、卷轴、写档）→ 重读不重复计数
//   → 世界地图「秘藏 1 / 11」+ 节点 ✦ → 刷新读档后仍在
//   第七章「反重力石」：收起卷轴后浮空（物理体不动、贴图抬升）→ 悬在水面上方时
//   到点也不落地 → 回到岸上才落地
//   第五章「无限回廊」：触碰即被脚本驱动绕圈 → Esc 发出 KeyboardInterrupt 跳出 →
//   卷轴弹出；再次触碰不按键 → 自动中断（不会困住玩家）
// 用法: node scripts/e2e-secrets.mjs（需要先 npm run dev；npm run test:e2e 会自动发现本脚本）
// 作弊只通过 window.__PYQUEST__ 语义动作（teleport / godmode / clearMinions / gotoChapter），
// 秘藏状态读只读查询 secrets()。
// 等待一律「等条件成立」（有上限）而非固定时长：机器负载高时 Phaser 的游戏时钟
// 会慢于墙钟，按固定毫秒等特效计时器会误判。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import { SECRET_TOTAL } from '../src/data/secrets.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
const steps = [];
let failed = false;
let assertions = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
// 外部请求（字体 CDN）一律返回空 200，测试不依赖外网（同 runner）
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
await page.route('**/*', (route) => (
  isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
));

const shot = async (name) => {
  await page.screenshot({ path: `scripts/shots/${name}.png` });
  steps.push(`📷 ${name}`);
  console.log(`📷 ${name}`);
};
const check = (cond, label) => {
  assertions++;
  if (cond) { steps.push(`  ✓ ${label}`); console.log(`  ✓ ${label}`); }
  else { failed = true; steps.push(`  ✗ ${label}`); console.log(`  ✗ ${label}`); }
};
const wait = (ms) => page.waitForTimeout(ms);

/** 等页面内条件成立（每 100ms 轮询，超时返回 false 交给断言） */
async function until(fn, arg, timeout = 15000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; }
  catch { return false; }
}
/** evaluate 带重试：场景切换间隙 active() 可能短暂为空 */
async function evalRetry(fn, arg) {
  for (let i = 0; i < 8; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) { if (i === 7) throw e; await wait(300); }
  }
}
const secrets = () => evalRetry(() => window.__PYQUEST__.secrets());
const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
const player = () => evalRetry(() => {
  const p = window.__PYQUEST__.active().player;
  return { x: p.x, y: p.y, bodyY: p.body.y, originY: p.originY };
});
const untilScroll = (open) => until((o) => !!document.querySelector('#secret-backdrop.show') === o, open, 8000);
const untilFx = (key, val, timeout) => until(([k, v]) => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.secrets();
  return !!(s && s.fx) && s.fx[k] === v;
}, [key, val], timeout);
const untilScene = (key) => until((k) => {
  const P = window.__PYQUEST__;
  const a = P && P.active();
  return !!(a && a.player && a.scene.settings.key === k);
}, key, 20000);

/** 打开页面并等游戏启动完成：BootScene.create 生成贴图后同步调用 initTitle，
 *  所以「秘藏石碑贴图已注册」即标题按钮已就绪（新游戏 / 继续冒险都落在村庄） */
async function boot({ clear } = {}) {
  if (clear) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
  }
  await page.reload({ waitUntil: 'networkidle' });
  await until(() => {
    const b = window.__PYQUEST__ && window.__PYQUEST__.scene('Boot');
    return !!(b && b.textures && b.textures.exists('secret_stone'));
  }, null, 30000);
  await page.click('#btn-start');
  await untilScene(CHAPTERS[0].fieldKey);
  await wait(500);
}

/** 进入某章野外并清场：免伤 + 清小怪（保证交互确定性） */
async function enterField(chId) {
  const ch = CHAPTERS.find((c) => c.id === chId);
  if (await activeKey() !== ch.fieldKey) {
    await evalRetry((id) => window.__PYQUEST__.gotoChapter(id), chId);
    await untilScene(ch.fieldKey);
    await wait(500);
  }
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), ch.fieldKey);
  check(await activeKey() === ch.fieldKey, `进入${ch.fieldName}`);
}

/** 站到石碑正下方（交互半径内）并按 E */
async function touchSecret(here) {
  await tele(here.x, here.y + 170);
  await wait(350);
  await page.keyboard.press('KeyE');
}

try {
  // ---------- 1. 村庄：你好世界石 ----------
  await boot({ clear: true });
  await enterField(1);

  let s = await secrets();
  check(s.total === SECRET_TOTAL && SECRET_TOTAL >= 8, `秘藏总数 ${s.total}（≥ 8）`);
  check(s.found.length === 0, '新游戏尚未发现任何秘藏');
  check(s.here && s.here.id === 'hello-world', `村庄藏着「你好世界石」（${s.here && s.here.id}）`);

  await tele(s.here.x, s.here.y + 170);
  const hinted = await until(() => (document.getElementById('hint').textContent || '').includes('神秘石碑'), null, 5000);
  check(hinted, `靠近石碑出现提示（${(await page.locator('#hint').textContent()).trim()}）`);
  await page.keyboard.press('KeyE');
  check(await untilScroll(true), '按 E 弹出秘藏卷轴');
  const repl = await page.locator('#secret-repl').textContent();
  check(repl.includes('print("Hello, World!")') && repl.includes('Hello, World!'), '卷轴展示 REPL 输入与输出');
  check((await page.locator('#secret-name').textContent()).includes('新发现'), '首次发现带「新发现」标记');
  check((await page.locator('#secret-count').textContent()).includes(`秘藏 1 / ${SECRET_TOTAL}`), '卷轴显示发现计数 1');
  s = await secrets();
  check(s.found.length === 1 && s.found[0] === 'hello-world', '发现计数 +1');
  await shot('s1-hello-world');
  await page.keyboard.press('Enter');
  check(await untilScroll(false), 'Enter 收起卷轴');

  // 重读：不重复计数、无「新发现」（收起后有 350ms 冷却，防同一次按键立刻重开）
  await wait(500);
  await page.keyboard.press('KeyE');
  check(await untilScroll(true), '再次按 E 可重读');
  check(!(await page.locator('#secret-name').textContent()).includes('新发现'), '重读不再标「新发现」');
  check((await secrets()).found.length === 1, '重读不重复计数');
  await page.keyboard.press('Escape');
  check(await untilScroll(false), 'Esc 收起卷轴');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v2') || 'null'));
  check(!!saved && Array.isArray(saved.secrets) && saved.secrets.includes('hello-world'), '发现记录已自动写档（v2 存档 secrets 字段）');

  // 世界地图
  await page.keyboard.press('Tab');
  await until(() => !!document.querySelector('#map-backdrop.show'), null, 5000);
  const sub = await page.locator('#map-sub').textContent();
  check(sub.includes(`秘藏 1 / ${SECRET_TOTAL}`), `世界地图头部显示秘藏计数（${sub.trim()}）`);
  check(await page.locator('.map-node[data-id="1"].has-secret .mn-secret').count() === 1, '第一章地标带秘藏标记 ✦');
  check(await page.locator('.map-node.has-secret').count() === 1, '只有已发现的章节带标记');
  await shot('s2-worldmap');
  await page.keyboard.press('Tab');
  await until(() => !document.querySelector('#map-backdrop.show'), null, 5000);

  // 刷新读档
  await boot();
  check((await secrets()).found.includes('hello-world'), '刷新读档后秘藏记录仍在');

  // ---------- 2. 第七章：反重力石（浮空 / 水面不落地 / 上岸落地） ----------
  await enterField(7);
  s = await secrets();
  check(s.here && s.here.id === 'antigravity', `第七章藏着「反重力石」（${s.here && s.here.id}）`);
  await touchSecret(s.here);
  check(await untilScroll(true), '触碰反重力石弹出卷轴');
  const before = await player();
  await page.keyboard.press('Enter');
  check(await untilFx('floating', true, 8000), '收起卷轴后勇者浮空');
  await wait(400); // 升空动画（300ms 游戏时间）
  const during = await player();
  check(Math.abs(during.bodyY - before.bodyY) < 1, `浮空时物理体不动（body.y ${before.bodyY.toFixed(1)} → ${during.bodyY.toFixed(1)}）`);
  check(during.originY > before.originY, '浮空时贴图抬升（origin 上移）');
  await shot('s3-antigravity');

  // 飞到水面上方：碰撞被跳过，不会被推回岸上；到点也不落地
  const ch7 = CHAPTERS.find((c) => c.id === 7);
  const field7 = ch7.buildField(ch7);
  // 找一格四周也是水的水面（T.WATER=3 / T.WATER2=4），确保物理体整个压在水上
  const wet = (x, y) => [3, 4].includes(field7.grid[y]?.[x]);
  let water = null;
  for (let y = 0; y < field7.h && !water; y++) for (let x = 0; x < field7.w && !water; x++) {
    if (wet(x, y) && wet(x, y - 1) && wet(x, y + 1) && wet(x - 1, y) && wet(x + 1, y)) water = { x: x * 128 + 64, y: y * 128 + 64 };
  }
  check(!!water, '第七章野外有可测试的水面');
  await tele(water.x, water.y);
  await wait(600);
  const onWater = await player();
  check(Math.hypot(onWater.x - water.x, onWater.y - water.y) < 8, '浮空时可悬停在水面上方（未被碰撞推开）');
  check(await untilFx('floatDue', true, 30000), '浮空时长已到（按游戏时钟）');
  await wait(600); // 给落地判定几轮轮询的机会
  check((await secrets()).fx.floating, '时间到时仍在水面上方：继续浮空，不会掉进水里');
  await tele(s.here.x, s.here.y + 170); // 回到岸上
  check(await untilFx('floating', false, 10000), '回到岸上后自动落地');
  await wait(300);
  const landed = await player();
  check(Math.abs(landed.originY - before.originY) < 1e-6, '落地后贴图复位');

  // ---------- 3. 第五章：无限回廊（Esc 跳出 / 自动中断） ----------
  await enterField(5);
  s = await secrets();
  check(s.here && s.here.id === 'while-true', `第五章藏着「无限回廊」（${s.here && s.here.id}）`);
  await touchSecret(s.here);
  check(await untilFx('scripted', true, 8000), '触碰后被卷进无限回廊（玩家由脚本驱动）');
  const looping = await until(() => (document.getElementById('hint').textContent || '').includes('KeyboardInterrupt'), null, 5000);
  check(looping, `提示条给出脱身方法（${(await page.locator('#hint').textContent()).trim()}）`);
  const p1 = await player();
  const moved = await until(([x, y]) => {
    const p = window.__PYQUEST__.active().player;
    return Math.hypot(p.x - x, p.y - y) > 40;
  }, [p1.x, p1.y], 10000);
  check(moved, '回廊里勇者在自动绕圈');
  await shot('s4-while-true');
  await page.keyboard.press('Escape');
  check(await untilFx('scripted', false, 5000), 'Esc 发出 KeyboardInterrupt，跳出回廊');
  check(await untilScroll(true), '跳出后弹出卷轴');
  check((await page.locator('#secret-repl').textContent()).includes('KeyboardInterrupt'), '卷轴讲解 KeyboardInterrupt');
  await page.keyboard.press('Enter');
  await untilScroll(false);
  await wait(500);

  // 不按键：回廊自动中断，不会困住玩家
  await page.keyboard.press('KeyE');
  check(await untilFx('scripted', true, 8000), '再次触碰重新进入回廊');
  check(await untilFx('scripted', false, 40000), '不按键也会自动中断（不会被困住）');
  if (await untilScroll(true)) { await page.keyboard.press('Enter'); await untilScroll(false); }

  s = await secrets();
  check(s.found.length === 3, `共发现 3 个秘藏（${s.found.join(', ')}）`);
  await page.keyboard.press('Tab');
  await until(() => !!document.querySelector('#map-backdrop.show'), null, 5000);
  check((await page.locator('#map-sub').textContent()).includes(`秘藏 3 / ${SECRET_TOTAL}`), '世界地图计数更新为 3');
  await page.keyboard.press('Tab');
  await wait(300);
} catch (err) {
  failed = true;
  errors.push(`[e2e-secrets] ${err && err.message ? err.message : err}`);
  console.error('执行中断:', err);
}

console.log(`=== E2E 秘藏彩蛋测试结果 ===（断言 ${assertions} 项）`);
for (const s of steps) console.log(s);
if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
else console.log('浏览器无报错 ✓');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
