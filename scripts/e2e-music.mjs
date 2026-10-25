// ============================================================
// 端到端测试（背景音乐）：只断言逻辑状态（window.__PYQUEST__.audio()），不断言声音本身
//   标题主题 + 自动播放策略（首次交互前不启动）→ 进村庄切章节主题 →
//   答题面板压低 / 关闭恢复 → N 关音乐并持久化（刷新后保持，标题图标同步）→
//   标题图标重新打开 → M 静音音乐与音效 → 跳到第八章（深空主题、交叉淡化不叠音）→
//   巢穴切部终章 BOSS 战 → 通关胜利号角只放一次 → 进入第九章切统计圣所主题
// 用法: node scripts/e2e-music.mjs（需要先 npm run dev；或 npm run test:e2e -- music）
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
const steps = [];
let failed = false;
let assertions = 0;
const check = (cond, label) => {
  assertions++;
  if (cond) { steps.push(`  ✓ ${label}`); console.log(`  ✓ ${label}`); }
  else { failed = true; steps.push(`  ✗ ${label}`); console.log(`  ✗ ${label}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
// 测试环境封闭化（同 e2e/lib/runner.mjs）：外部字体 CDN 请求直接返回空 200
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
await page.route('**/*', (route) => (
  isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
));

// ---------- seam 访问 ----------
const evalRetry = async (fn, arg, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); } catch (e) { last = e; await page.waitForTimeout(350); }
  }
  throw last;
};
const audio = () => evalRetry(() => window.__PYQUEST__.audio());
const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
// 标题就绪：BootScene.create()（含 initTitle → 请求标题主题）跑完（同 runner 的 waitForTitle）
const waitForTitle = () => page.waitForFunction(() => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene('Boot');
  return !!(s && s.sys.settings.status >= 5); // 5 = Phaser.Scenes.RUNNING
}, null, { timeout: 20000 });
const waitForScene = (key) => page.waitForFunction((k) => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
  return !!(s && s.player);
}, key, { timeout: 8000 });
const settle = async (key) => {
  await waitForScene(key);
  await page.waitForTimeout(700);
  await evalRetry((k) => { window.__PYQUEST__.godmode(); window.__PYQUEST__.clearMinions(k); }, key);
};
const closeDialogue = async () => {
  for (let i = 0; i < 12; i++) {
    if (await page.locator('#dialogue.show').count() === 0) return;
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(240);
  }
};
const pref = () => page.evaluate(() => localStorage.getItem('pyquest:settings:music'));
const toggleState = () => page.locator('#music-toggle').getAttribute('aria-pressed');

const CH1 = CHAPTERS[0];
const CH8 = CHAPTERS.find((c) => c.id === 8);
const CH9 = CHAPTERS.find((c) => c.id === 9);

try {
  // ---- 1. 标题画面：请求标题主题，但首次交互前不启动 AudioContext ----
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  await page.waitForTimeout(400);
  let a = await audio();
  check(a.track === 'title', `标题画面请求标题主题（track=${a.track}）`);
  check(a.started === false && a.playing === false, '首次用户交互前不启动音频（自动播放策略）');
  check(a.musicOn === true, '默认开启背景音乐');
  check(await toggleState() === 'true', '标题右上角音乐开关显示「开」');
  const hasAudio = await page.evaluate(() => !!(window.AudioContext || window.webkitAudioContext));

  // ---- 2. 开始冒险：首次点击解锁音频，村庄切到第一章主题 ----
  await page.click('#btn-start');
  await settle(CH1.fieldKey);
  check(await activeKey() === CH1.fieldKey, '新游戏进入诺瓦村庄');
  a = await audio();
  check(a.track === 'village', `村庄播放第一章主题（track=${a.track}）`);
  if (hasAudio) check(a.started && a.playing, '首次点击后音频启动并开始播放');
  else console.log('  · 浏览器无 WebAudio：跳过「已发声」断言（逻辑状态照常校验）');

  // ---- 3. 答题面板：打开压低，取消后恢复 ----
  await closeDialogue();
  const rune = CH1.buildField(CH1).props.find((p) => p.type === 'rune' && !p.healRune && !p.bossRune);
  for (const [px, py] of [[rune.x, rune.y + 192], [rune.x + 192, rune.y], [rune.x, rune.y - 192], [rune.x - 192, rune.y]]) {
    await tele(px, py);
    await page.waitForTimeout(320);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(480);
    if (await page.locator('#quiz-backdrop.show').count() === 1) break;
    await closeDialogue();
  }
  check(await page.locator('#quiz-backdrop.show').count() === 1, '符文答题面板打开');
  check((await audio()).ducked === true, '答题时背景音乐被压低（ducked）');
  await page.click('#quiz-cancel');
  await page.waitForTimeout(400);
  check((await audio()).ducked === false, '关闭答题面板后音乐恢复');

  // ---- 4. N 关闭音乐：立即停播、持久化到独立设置键 ----
  await page.keyboard.press('KeyN');
  await page.waitForTimeout(300);
  a = await audio();
  check(a.musicOn === false && a.playing === false, '按 N 关闭背景音乐');
  check(await pref() === 'off', '音乐开关写入独立设置键（pyquest:settings:music = off）');
  check((await page.locator('#hint').textContent()).includes('背景音乐已关闭'), 'HUD 提示「背景音乐已关闭」');
  check(a.track === 'village', '关闭音乐不改变场景曲目（重新开启时接着放本章主题）');

  // ---- 5. 刷新：设置保持；标题图标同步显示「关」，点击重新打开 ----
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  await page.waitForTimeout(400);
  check((await audio()).musicOn === false, '刷新后音乐仍为关闭（设置已持久化）');
  check(await toggleState() === 'false', '标题音乐开关同步显示「关」');
  await page.click('#music-toggle');
  await page.waitForTimeout(300);
  a = await audio();
  check(a.musicOn === true && await toggleState() === 'true', '点击标题图标重新打开音乐');
  check(await pref() === 'on', '标题图标的开关同样持久化');
  if (hasAudio) check(a.track === 'title' && a.playing, '点击图标即解锁音频，标题主题响起');

  // ---- 6. 继续冒险 → M 静音音乐与音效，再按 M 恢复 ----
  await page.click('#btn-start');
  await settle(CH1.fieldKey);
  await closeDialogue();
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);
  a = await audio();
  check(a.muted === true && a.playing === false, '按 M 同时静音背景音乐');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);
  a = await audio();
  check(a.muted === false && a.musicOn === true, '再按 M 恢复声音（音乐开关不受影响）');
  if (hasAudio) check(a.playing, '恢复声音后音乐继续播放');

  // ---- 7. 跳到第八章：深空主题；交叉淡化结束后只剩一层（不叠音） ----
  await evalRetry((id) => window.__PYQUEST__.gotoChapter(id), 8);
  await settle(CH8.fieldKey);
  a = await audio();
  check(a.track === 'deepspace', `第八章野外切到深空主题（track=${a.track}）`);
  await page.waitForTimeout(1200);
  if (hasAudio) check((await audio()).layers === 1, '切曲淡出完成后只剩一层播放器（不叠音）');

  // ---- 8. 进入巢穴：部终章 BOSS 战 ----
  const field8 = CH8.buildField(CH8);
  const door = field8.props.find((p) => p.type === 'doorlink');
  await evalRetry(([id, n]) => window.__PYQUEST__.setShards(id, n), [8, CH8.shardsNeeded]);
  await tele(door.x, door.y + 192);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  const portal = field8.portals.find((p) => p.to === CH8.lairKey);
  await tele(portal.rect.x + portal.rect.w / 2, portal.rect.y + portal.rect.h / 2);
  await settle(CH8.lairKey);
  check(await activeKey() === CH8.lairKey, `进入${CH8.lairName}`);
  a = await audio();
  check(a.track === 'boss-finale', `部终章巢穴播放终章 BOSS 战（track=${a.track}）`);

  // ---- 9. 通关：胜利号角只放一次，放完不重播 ----
  await evalRetry((id) => window.__PYQUEST__.applyTestState({ progress: { [id]: { bossShielded: false } } }), 8);
  await evalRetry((k) => window.__PYQUEST__.slayBoss(k), CH8.lairKey);
  await page.waitForTimeout(2200);
  check(await page.locator('#victory').evaluate((el) => !el.classList.contains('hidden')), '胜利封印页出现');
  a = await audio();
  check(a.track === 'victory', `胜利封印页播放凯旋号角（track=${a.track}）`);
  if (hasAudio) {
    check(a.playing, '凯旋号角正在播放');
    await page.waitForTimeout(4500);
    a = await audio();
    check(a.track === 'victory' && a.playing === false, '凯旋号角是一次性的：放完不重播');
  }
  await page.screenshot({ path: 'scripts/shots/music-victory.png' });

  // ---- 10. 进入第九章：切到统计圣所主题 ----
  await page.click('#btn-next');
  await settle(CH9.fieldKey);
  a = await audio();
  check(a.track === 'sanctum', `进入第九章切到统计圣所主题（track=${a.track}）`);
} catch (err) {
  failed = true;
  errors.push(`[e2e-music] ${err && err.message ? err.message : err}`);
  console.error('执行中断:', err);
}

console.log(`=== E2E 背景音乐测试结果 ===（断言 ${assertions} 项）`);
for (const s of steps) console.log(s);
if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
else console.log('浏览器无报错 ✓');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
