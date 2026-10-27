// ============================================================
// 端到端测试：课堂演示入口（标题画面「第三章演示」按钮，npm run demo 打开的 /?demo）
// 用法: node scripts/e2e-demo.mjs（需要先 npm run dev；npm run test:e2e -- demo 会自动起服）
// 断言：不带 ?demo 时按钮不出现；带 ?demo 点按钮 → 第三章野外，第一、二章已通关、第三章全新；
// 已有存档时先弹确认，确认后同样从第三章开头开始；「全部关卡已通关」按钮把五个小游戏全部记为通过。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
let failed = false;
let assertions = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
await page.route('**/*', (route) => (isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })));
const check = (cond, label) => {
  assertions++;
  if (cond) console.log(`  ✓ ${label}`);
  else { failed = true; console.log(`  ✗ ${label}`); }
};
const waitForTitle = () => page.waitForFunction(() => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene('Boot');
  return !!(s && s.sys.isActive());
}, null, { timeout: 30000 });
const waitForField = () => page.waitForFunction(() => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.scene('SciField');
  return !!(s && s.player && s.scene.isActive());
}, null, { timeout: 15000 });
const demoVisible = () => page.evaluate(() => {
  const b = document.getElementById('btn-demo');
  return !!(b && b.offsetParent);
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  check(!(await demoVisible()), '不带 ?demo：标题画面没有演示按钮');

  const demoUrl = new URL('?demo', BASE).href;
  await page.goto(demoUrl, { waitUntil: 'networkidle' });
  await waitForTitle();
  check(await demoVisible(), '带 ?demo：标题画面出现「第三章演示」按钮');
  await page.screenshot({ path: 'scripts/shots/demo-01-title.png' });
  await page.click('#btn-demo');
  await waitForField();
  await page.waitForTimeout(600);
  let st = await page.evaluate(() => window.__PYQUEST__.state());
  check(st.current === 3, '点按钮直接进入第三章野外（科学计算高原）');
  check(st.progress[1].done && st.progress[2].done, '第一、二章记为已通关');
  check(!st.progress[3].done && st.progress[3].shards === 0 && !st.progress[3].gateOpen, '第三章是全新的（碎片 0 / 4、封印未开）');
  const sites = await page.evaluate(() => window.__PYQUEST__.games().sites.length);
  check(sites === 4, '野外的四座试炼场石台就位');
  await page.screenshot({ path: 'scripts/shots/demo-02-field.png' });

  // 已有存档：再点演示要先确认，确认后照样从第三章开头开始
  await page.evaluate(() => window.__PYQUEST__.setShards(3, 2));
  await page.waitForTimeout(300);
  await page.goto(demoUrl, { waitUntil: 'networkidle' });
  await waitForTitle();
  let confirmed = null;
  page.once('dialog', async (d) => { confirmed = d.message(); await d.accept(); });
  await page.click('#btn-demo');
  await waitForField();
  await page.waitForTimeout(600);
  st = await page.evaluate(() => window.__PYQUEST__.state());
  check(!!confirmed && confirmed.includes('覆盖当前存档'), '已有存档时先弹确认框');
  check(st.progress[3].shards === 0, '确认后第三章重新开始（碎片清零）');

  // 「全部关卡已通关」：五个小游戏每一关都记为通过，碎片集齐、封印已开、护盾已破，魔君仍在
  await page.goto(demoUrl, { waitUntil: 'networkidle' });
  await waitForTitle();
  check(await page.evaluate(() => !!document.getElementById('btn-demo-all').offsetParent), '带 ?demo：还有「全部关卡已通关」按钮');
  page.once('dialog', (d) => d.accept());
  await page.click('#btn-demo-all');
  await waitForField();
  await page.waitForTimeout(600);
  st = await page.evaluate(() => window.__PYQUEST__.state());
  const gs = await page.evaluate(() => window.__PYQUEST__.games().state);
  check(Object.values(gs).every((g) => g.complete && g.done.length === g.levels.length),
    `五个小游戏全部关卡（含挑战关）已通过：${Object.entries(gs).map(([k, g]) => `${k} ${g.done.length}/${g.levels.length}`).join('，')}`);
  check(st.progress[3].shards === 4 && st.progress[3].gateOpen, '碎片 4 / 4、巢穴封印已开');
  check(!st.progress[3].bossShielded && !st.progress[3].done, '魔君护盾已破、魔君仍在（可以演示 BOSS 战）');
  await page.screenshot({ path: 'scripts/shots/demo-03-all-cleared.png' });
} catch (e) {
  failed = true;
  console.log(`✗ 异常：${e.message}`);
}

if (errors.length) { failed = true; console.log('浏览器报错：\n' + errors.join('\n')); }
await browser.close();
console.log(`\n[e2e-demo] ${failed ? '✗ 有失败' : '✓ 全部通过'}（${assertions} 项断言）`);
process.exit(failed ? 1 : 0);
