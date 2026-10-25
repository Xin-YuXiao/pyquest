// ============================================================
// 端到端测试（代码训练场）：写真 Python 驱动勇者
// 用法: node scripts/e2e-dojo.mjs（需要先 npm run dev；npm run test:e2e 会自动起服）
//
// 全程真实：从第二章森林走到「代码训练场」门前按 E 进入；Pyodide 真实加载
// （本站自托管的 /pyodide/*，外网请求同 runner 一律回空 200——走 CDN 的话这里必然失败）；
// 代码用真实键盘敲进编辑器（顺带验证 w/a/s/d/e/j 不被 Phaser 吞掉），点「▶ 运行」。
// 覆盖：通关与存档 → 跳过回放 → 中文报错（带行号）→ 布局失败原因 → 死循环超时与 Worker 重建 →
//       返回森林 → 刷新读档后进度与代码草稿仍在。
// 判定期望由本脚本 import 关卡数据独立给出（参考解 / 布局数），不拿游戏自报的结论当答案。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import { buildForest } from '../src/data/maps.js';
import { DOJO_LEVELS, dojoLevel } from '../src/data/dojoLevels.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
const steps = [];
let failed = false;
let assertions = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
const external = [];
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (isLocal(url)) return route.continue();
  if (url.includes('pyodide')) external.push(url);
  return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
});

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
const evalRetry = async (fn, arg, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) { last = e; await page.waitForTimeout(350); }
  }
  throw last;
};

const dojo = () => evalRetry(() => window.__PYQUEST__.dojo());
const activeKey = () => evalRetry(() => {
  const s = window.__PYQUEST__.active();
  return s ? s.scene.settings.key : null;
});
const waitForTitle = async () => {
  await page.waitForFunction(() => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene('Boot');
    return !!(s && s.sys.isActive());
  }, null, { timeout: 30000 });
  await page.waitForTimeout(200);
};
const waitForField = (key) => page.waitForFunction((k) => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
  return !!(s && s.player && s.sys.isActive());
}, key, { timeout: 20000 });
/** 等 Python 运行时就绪（首次加载约 13 MB；机器负载高时给足时间） */
const waitRuntimeReady = () => page.waitForFunction(
  () => window.__PYQUEST__.dojo().runtime.state === 'ready', null, { timeout: 150000 },
);
/** 点运行并等这次运行（含回放）结束，返回 dojo() 快照 */
async function runAndWait(label) {
  await page.click('#dojo-run');
  await page.waitForFunction(() => {
    const d = window.__PYQUEST__.dojo();
    return d.open && d.phase === 'done';
  }, null, { timeout: 150000 });
  const d = await dojo();
  steps.push(`  · ${label}：${JSON.stringify(d.last)}`);
  return d;
}
/** 清空编辑器后用真实键盘敲入代码（自动缩进会补上一行的缩进，所以按行敲、先删掉自动补的空格） */
async function typeCode(code) {
  await page.click('#dojo-code');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  const lines = code.replace(/\n$/, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await page.keyboard.press('Enter');
      // 自动缩进补的空格先删掉，再按原文敲（原文自带缩进）
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Delete');
    }
    await page.keyboard.type(lines[i]);
  }
}
/** 直接替换编辑器内容（多行带缩进的代码；输入方式本身已在 typeCode 里验证过） */
const fillCode = (code) => page.fill('#dojo-code', code);
const outText = () => page.locator('#dojo-out').textContent();

try {
  // ---------- 新游戏 → 第二章森林 → 走到训练场门前按 E ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  await page.click('#btn-start');
  await waitForField(CHAPTERS[0].fieldKey);
  const ch2 = CHAPTERS[1];
  await evalRetry((id) => window.__PYQUEST__.gotoChapter(id), 2);
  await waitForField(ch2.fieldKey);
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), ch2.fieldKey);
  const door = buildForest(ch2).props.find((p) => p.type === 'dojo');
  check(!!door, '第二章森林里有代码训练场之门');
  await evalRetry(([x, y]) => window.__PYQUEST__.teleport(x, y), [door.x, door.y + 150]);
  await page.waitForTimeout(400);
  const hint = await page.locator('#hint').textContent();
  check(hint.includes('代码训练场'), `门前提示进入训练场（「${hint.trim()}」）`);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__PYQUEST__.dojo().open, null, { timeout: 15000 });
  let d = await dojo();
  check(d.open && d.levelId === 1, '按 E 进入训练场第 1 关');
  check(await page.locator('#dojo-panel').isVisible(), '训练场面板出现');
  check(await page.locator('#hud-top').isHidden(), '训练场里收起世界 HUD');

  // ---------- Python 运行时：自托管加载 ----------
  const t0 = Date.now();
  await waitRuntimeReady();
  const loadSec = ((Date.now() - t0) / 1000).toFixed(1);
  d = await dojo();
  check(d.runtime.state === 'ready' && /^\d+\.\d+/.test(d.runtime.version), `Pyodide ${d.runtime.version}（Python ${d.runtime.pyVersion}）加载就绪，用时 ${loadSec}s`);
  check(external.length === 0, 'Pyodide 全部来自本站（没有请求任何 CDN）');
  check((await page.locator('#dojo-runtime').textContent()).includes('已就绪'), '面板显示 Python 已就绪');

  // ---------- 编辑器里能正常输入游戏快捷键字母 ----------
  await typeCode('# wasdej WASD EJ 1234');
  const typed = await page.inputValue('#dojo-code');
  check(typed.includes('wasdej') && typed.includes('WASD') && typed.includes('1234'), `编辑器里 w/a/s/d/e/j/数字都能输入（「${typed}」）`);
  check(await page.locator('#map-backdrop.show').count() === 0, '在编辑器里打字不会触发其他快捷键');

  // ---------- 第 1 关：真实键盘敲入参考解 → 运行 → 通关 ----------
  const L1 = dojoLevel(1);
  await typeCode(L1.solution);
  check((await page.inputValue('#dojo-code')).trim() === L1.solution.trim(), '第 1 关参考解逐键敲入编辑器');
  d = await runAndWait('第 1 关');
  check(d.last && d.last.result === 'win', '第 1 关运行后回放结束判定通关');
  check((await outText()).includes('通关'), '面板显示「通关」');
  check(d.progress[1] && d.progress[1].cleared && d.progress[1].bestLines === 6, '第 1 关通关记录与个人最佳行数（6 行）');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v3') || 'null'));
  check(!!saved && saved.dojo && saved.dojo['1'] && saved.dojo['1'].cleared === true, '训练场进度写进存档 v3（可选字段 dojo）');
  check(await page.locator('#dojo-next').isVisible(), '通关后出现「下一关」');
  await shot('d1-level1-win');

  // ---------- 第 2 关：下一关 → 运行 → 跳过回放 ----------
  await page.click('#dojo-next');
  await page.waitForFunction(() => window.__PYQUEST__.dojo().levelId === 2);
  await fillCode(dojoLevel(2).solution);
  await page.click('#dojo-run');
  await page.waitForFunction(() => window.__PYQUEST__.dojo().phase === 'replaying', null, { timeout: 60000 });
  check(await page.locator('#dojo-skip').isVisible(), '回放中出现「跳过回放」');
  await page.click('#dojo-skip');
  await page.waitForFunction(() => window.__PYQUEST__.dojo().phase === 'done', null, { timeout: 30000 });
  d = await dojo();
  check(d.last.result === 'win' && d.last.lines === 2, '第 2 关跳过回放后直接判定通关（2 行 for 循环）');
  check((await page.locator('#dojo-best').textContent()).includes('★'), '2 行通关达成挑战星');

  // ---------- 第 3 关：中文报错 / 布局失败 / 死循环超时 ----------
  await page.click('#dojo-next');
  await page.waitForFunction(() => window.__PYQUEST__.dojo().levelId === 3);
  const L3 = dojoLevel(3);
  await fillCode("mvoe('right')\n");
  d = await runAndWait('第 3 关拼错函数名');
  let out = await outText();
  check(d.last.result === 'error' && d.last.error.type === 'NameError', '拼错函数名 → NameError');
  check(out.includes('第 1 行') && out.includes('mvoe') && out.includes('没有定义'), `报错翻成中文并标出行号（「${out.trim().slice(0, 60)}」）`);

  await fillCode("for i in range(9)\n    move('right')\n");
  d = await runAndWait('第 3 关少冒号');
  out = await outText();
  check(d.last.result === 'error' && out.includes('第 1 行') && out.includes('冒号'), '少写冒号 → 「第 1 行：…少了冒号」');

  await fillCode(L3.starter);
  d = await runAndWait('第 3 关起始代码');
  out = await outText();
  check(d.last.result === 'fail' && out.includes('踩到陷阱'), `起始代码在布局里踩到陷阱（「${out.trim().slice(0, 50)}」）`);
  await shot('d2-level3-fail');

  await fillCode('while True:\n    pass\n');
  d = await runAndWait('第 3 关死循环');
  out = await outText();
  check(d.last.result === 'timeout' && out.includes('超时'), '死循环 → 「代码运行超时」');
  await waitRuntimeReady();
  d = await dojo();
  check(d.runtime.restarts >= 1, `超时后 Python Worker 已重建（重启 ${d.runtime.restarts} 次）`);
  await fillCode(L3.solution);
  d = await runAndWait('第 3 关参考解');
  check(d.last.result === 'win' && d.last.variants === L3.variants.length, `重建后运行正常：参考解通过全部 ${L3.variants.length} 个布局`);
  await shot('d3-level3-win');

  // ---------- 第 4 关：留一份代码草稿，返回森林 ----------
  await page.click('#dojo-next');
  await page.waitForFunction(() => window.__PYQUEST__.dojo().levelId === 4);
  await fillCode("# 我的草稿\nmove('right')\n");
  await page.click('#dojo-exit');
  await waitForField(ch2.fieldKey);
  check(await activeKey() === ch2.fieldKey, '「返回森林」回到第二章野外');
  check(await page.locator('#dojo-panel').count() === 0, '离开后训练场面板移除');
  check(await page.locator('#hud-top').isVisible(), '回到野外后 HUD 恢复');
  const pos = await evalRetry(() => { const p = window.__PYQUEST__.active().player; return [p.x, p.y]; });
  check(Math.abs(pos[0] - door.x) < 300 && Math.abs(pos[1] - door.y) < 400, '回到训练场门前');

  // ---------- 刷新读档：进度与草稿仍在 ----------
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  await page.click('#btn-start');
  await waitForField(ch2.fieldKey);
  await evalRetry(() => window.__PYQUEST__.openDojo(4));
  await page.waitForFunction(() => window.__PYQUEST__.dojo().open);
  d = await dojo();
  check([1, 2, 3].every((id) => d.progress[id] && d.progress[id].cleared), '刷新读档后第 1-3 关通关记录仍在');
  check((await page.inputValue('#dojo-code')).includes('我的草稿'), '第 4 关的代码草稿随存档保留');
  const tabs = await page.locator('#dojo-levels button:not([disabled])').count();
  check(tabs === 4, `已解锁 4 关页签（实际 ${tabs}）`);
  check(DOJO_LEVELS.length >= 6, `训练场共 ${DOJO_LEVELS.length} 关`);
} catch (err) {
  failed = true;
  errors.push(`[e2e] ${err && err.message ? err.message : err}`);
  console.error('执行中断:', err);
}

console.log(`=== E2E 代码训练场测试结果 ===（断言 ${assertions} 项）`);
for (const s of steps) console.log(s);
if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
else console.log('浏览器无报错 ✓');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
