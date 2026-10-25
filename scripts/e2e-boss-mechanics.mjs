// ============================================================
// 端到端测试 · BOSS 招牌机制专项（11 章各一个场景）
//
// 用 __PYQUEST__.gotoLair 直达各章巢穴（shielded:false = 护盾已破，机制进巢穴即开战），
// 再用语义动作 pinBoss({ keepMechanic }) / hitBoss / breakBossShield 驱动机制，
// 用只读快照 bossMech() 断言机制状态；挥剑、交互走真实键盘 J / E。
// 破盾激活 + 开场横幅在各章 E2E 的 bossRune 步骤里断言（runner），这里测机制本身。
//
// 用法: node scripts/e2e-boss-mechanics.mjs（需要先 npm run dev；或 npm run test:e2e -- boss-mechanics）
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
let failed = false;
let assertions = 0;
let passed = 0;
const check = (cond, label) => {
  assertions++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed = true; console.log(`  ✗ ${label}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
// 测试环境封闭化：外部字体 CDN 请求直接返回空 200（同 runner）
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
await page.route('**/*', (route) => (
  isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
));

// ---------- seam 访问 ----------
const evalRetry = async (fn, arg, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) { last = e; await page.waitForTimeout(350); }
  }
  throw last;
};
const wait = (ms) => page.waitForTimeout(ms);
const mech = (k) => evalRetry((key) => window.__PYQUEST__.bossMech(key), k);
const state = () => evalRetry(() => window.__PYQUEST__.state());
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
const pin = (k, x, y, keepMechanic) => evalRetry(
  ([key, px, py, keep]) => window.__PYQUEST__.pinBoss(key, px, py, { keepMechanic: keep }), [k, x, y, keepMechanic],
);
const hit = (k, n) => evalRetry(([key, times]) => window.__PYQUEST__.hitBoss(key, times), [k, n]);
const player = () => evalRetry(() => {
  const p = window.__PYQUEST__.active().player;
  return { x: Math.round(p.x), y: Math.round(p.y) };
});
/** 轮询直到快照满足条件（机制按时间间隔触发的场景用） */
async function pollMech(k, pred, timeout) {
  const t0 = Date.now();
  let m = await mech(k);
  while (!pred(m) && Date.now() - t0 < timeout) { await wait(250); m = await mech(k); }
  return m;
}
/** 挥剑：teleport 到目标左侧（出生朝向为右）后按 J，攻击矩形正好罩住目标 */
async function swingAt(x, y) {
  await tele(x - 116, y);
  await wait(200);
  await page.keyboard.press('KeyJ');
  await wait(420);
}
/** 靠近某点按 E：依次尝试下/右/左/上四个落脚点，直到 predicate 成立 */
async function interactNear(x, y, predicate) {
  for (const [dx, dy] of [[0, 192], [192, 0], [-192, 0], [0, -192]]) {
    await tele(x + dx, y + dy);
    await wait(300);
    await page.keyboard.press('KeyE');
    await wait(500);
    if (await predicate()) return true;
  }
  return false;
}

/** 直达第 id 章巢穴；godmode 默认开（W10 要真扣心时关掉） */
async function enter(id, { shielded = false, godmode = true } = {}) {
  const ch = CHAPTERS.find((c) => c.id === id);
  await evalRetry(([cid, sh]) => window.__PYQUEST__.gotoLair(cid, { shielded: sh }), [id, shielded]);
  await page.waitForFunction((k) => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
    return !!(s && s.player && s.scene.isActive());
  }, ch.lairKey, { timeout: 8000 });
  await wait(600);
  if (godmode) await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), ch.lairKey);
  const lair = ch.buildLair(ch);
  console.log(`\n[${ch.title} · ${ch.bossName} · ${ch.bossMechanic.name}]`);
  return { ch, k: ch.lairKey, boss: lair.boss };
}

// ---------- 开始 ----------
try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1400);
  await page.click('#btn-start');
  await wait(1200);

  // W1 列表召唤：第 k 波 append k 个帮手
  {
    const { k, boss } = await enter(1);
    await pin(k, boss.x, boss.y, true);
    const minions = () => evalRetry((key) => window.__PYQUEST__.scene(key).slimeGroup.getChildren()
      .filter((s) => !s.isBoss && !s.dead).length, k);
    await hit(k, 3);
    let m = await mech(k);
    check(m.waves === 1 && m.helpers === 1 && await minions() === 1, `hp 7：第 1 波 append 1 个帮手（helpers=${m.helpers}）`);
    await hit(k, 3);
    m = await mech(k);
    check(m.waves === 2 && m.helpers === 3 && await minions() === 3, `hp 4：第 2 波再 append 2 个（len(helpers)=${m.helpers}）`);
  }

  // W2 循环倒数：每断一节，range 少一轮
  {
    const { k, boss } = await enter(2);
    await pin(k, boss.x, boss.y, true);
    let m = await mech(k);
    check(m.lastCount === 6, `开战时 for 循环 range(6)（${m.lastText}）`);
    await hit(k, 2);
    m = await mech(k);
    check(m.lastCount === 5 && m.lastText.includes('range(5)'), `断尾后倒数到 range(5)（${m.lastText}）`);
  }

  // W3 正弦混沌弹：弹道横向按 sin 摆动；冻结即清弹
  {
    const { k, boss } = await enter(3);
    await pin(k, boss.x, boss.y, true);
    await tele(boss.x, boss.y + 900);
    let m = await pollMech(k, (s) => s.bullets >= 1, 5000);
    check(m.bullets >= 1, `魔君射出混沌弹（${m.bullets} 发）`);
    await wait(300);
    m = await mech(k);
    check(m.lateral.some((v) => v !== 0), `弹道带横向正弦摆动（偏移 ${m.lateral.join('/')}px）`);
    await page.screenshot({ path: 'scripts/shots/bm-03-sine.png' });
    await pin(k, boss.x, boss.y, false);
    m = await mech(k);
    check(m.frozen && m.bullets === 0, '冻结机制时混沌弹全部清除');
  }

  // W4 单位符印：踩进符印被减速
  {
    const { k, boss } = await enter(4);
    await pin(k, boss.x, boss.y, true);
    let m = await pollMech(k, (s) => s.traps >= 1, 5000);
    check(m.traps >= 1, `术士落下单位符印（${m.trapSpots.map((t) => t.unit).join('，')}）`);
    const spot = m.trapSpots[0];
    await tele(spot.x, spot.y);
    await wait(300);
    m = await mech(k);
    check(m.slowed && m.playerSpeedMul < 1, `踩进符印被「单位不匹配」减速（速度 ×${m.playerSpeedMul}）`);
  }

  // W5 迟缓光环：光环内减速；破盾瞬间获得向量化加速
  {
    let { k, boss } = await enter(5);
    await pin(k, boss.x, boss.y, true);
    await tele(boss.x + 300, boss.y);
    await wait(250);
    let m = await mech(k);
    check(m.inAura && m.playerSpeedMul === 0.5, `光环内移速减半（×${m.playerSpeedMul}）`);
    await tele(boss.x + 900, boss.y);
    await wait(250);
    m = await mech(k);
    check(!m.inAura && m.playerSpeedMul === 1, '离开光环恢复原速');
    ({ k, boss } = await enter(5, { shielded: true }));
    await evalRetry((key) => window.__PYQUEST__.breakBossShield(key), k);
    m = await mech(k);
    check(m.active && m.buffActive && m.playerSpeedMul === 1.5, `破盾瞬间获得「向量化」加速（×${m.playerSpeedMul}）`);
  }

  // W6 梯度冲锋：冲刺速度按学习率衰减；冲过头撞墙眩晕
  {
    const { k, boss } = await enter(6);
    // 站在大厅里偏离中央门洞：牛头怪隔着墙冲锋，冲过头就撞墙
    await tele(boss.x - 640, boss.y + 640);
    const m = await pollMech(k, (s) => s.charges >= 2 && s.stuns >= 1, 16000);
    check(m.charges >= 2 && m.speeds[1] < m.speeds[0], `冲锋速度随学习率衰减（${m.speeds.join(' → ')}）`);
    check(m.stuns >= 1, `冲过头撞墙被眩晕（${m.stuns} 次）`);
  }

  // W7 频谱分身：乱序复原、按频率从低到高击破 → 相位锁定；击败后衍生物清理干净
  {
    const { k, boss } = await enter(7);
    await pin(k, boss.x, boss.y, false); // 冻结：分身原地静止，便于确定性挥剑
    let m = await mech(k);
    check(m.clones.length === 3 && m.clones.every((c) => c.alive), `魅影分出 3 个频谱分身（${m.clones.map((c) => `${c.freq}×`).join(' / ')}）`);
    await page.screenshot({ path: 'scripts/shots/bm-07-echoes.png' });
    const byFreq = [...m.clones].sort((a, b) => a.freq - b.freq);
    const highest = byFreq[byFreq.length - 1];
    await swingAt(highest.x, highest.y);
    m = await mech(k);
    check(m.resets === 1 && m.clones.every((c) => c.alive), '先打最高频分身 → 频谱乱序，分身复原');
    for (const c of byFreq) await swingAt(c.x, c.y);
    m = await mech(k);
    check(m.clones.every((c) => !c.alive) && m.locks === 1 && m.phaseLocked, '按频率从低到高击破 → 魅影相位锁定');
    await evalRetry((key) => window.__PYQUEST__.slayBoss(key), k);
    await wait(300);
    const left = await evalRetry((key) => window.__PYQUEST__.scene(key).extraTargets.length, k);
    check(left === 0, `击败魅影后分身全部清理（剩 ${left}）`);
  }

  // W8 暗物质引力：玩家被拉向核心
  {
    const { k, boss } = await enter(8);
    await pin(k, boss.x, boss.y, true);
    await tele(boss.x + 700, boss.y);
    await wait(100);
    const before = await player();
    await wait(700);
    const after = await player();
    const m = await mech(k);
    check(after.x < before.x - 40 && m.pullSpeed > 0, `不动也被暗物质晕拉向核心（${before.x} → ${after.x}，拉速 ${m.pullSpeed}px/s）`);
  }

  // W9 后验瞄准：每被击中一次瞄准权重 +0.2
  {
    const { k, boss } = await enter(9);
    await pin(k, boss.x, boss.y, true);
    let m = await mech(k);
    check(m.aimWeight === 0, '开战时只按先验瞄准（w=0）');
    await hit(k, 2);
    m = await mech(k);
    check(m.hits === 2 && m.aimWeight === 0.4, `被击中两次后后验更新（w=${m.aimWeight}）`);
    m = await pollMech(k, (s) => s.bullets >= 1, 4000);
    check(m.bullets >= 1, '祭司射出预判弹幕');
  }

  // W10 幻觉符文：识破假符文扣 1 心、真符文能打开答题；破盾后幻觉消散、魔像开始说谎
  {
    const { ch, k } = await enter(10, { shielded: true, godmode: false });
    let m = await mech(k);
    check(m.fakes === 2 && !m.active, `护盾期巢穴里混进 2 块幻觉符文石`);
    const banner = (await page.locator('#boss-banner').textContent().catch(() => '')) || '';
    check(banner.includes(ch.bossMechanic.name), '进巢穴即用横幅提示「先验证再信任」');
    await page.screenshot({ path: 'scripts/shots/bm-10-fakes.png' });
    const hearts0 = (await state()).hearts;
    const fake = m.fakeSpots[0];
    await interactNear(fake.x, fake.y, async () => (await mech(k)).revealed === 1);
    m = await mech(k);
    const hearts1 = (await state()).hearts;
    const quizOpen = await page.locator('#quiz-backdrop.show').count();
    check(m.revealed === 1 && m.fakes === 1 && hearts1 === hearts0 - 1 && quizOpen === 0,
      `交互假符文 = 识破幻觉并扣 1 心，不弹答题（心 ${hearts0} → ${hearts1}）`);
    const opened = await interactNear(m.realRune.x, m.realRune.y,
      async () => await page.locator('#quiz-backdrop.show').count() === 1);
    check(opened, '真 BOSS 符文能正常打开答题面板');
    if (opened) {
      await page.click('#quiz-cancel');
      await wait(300);
      // 回归：旧场景的答题面板实例曾残留按钮监听，点「取消」会把已关停的野外场景
      // 重新跑起来、访问已销毁的玩家，整个游戏循环崩溃
      const t1 = await evalRetry(() => window.__PYQUEST__.active().time.now);
      await wait(400);
      const after = await evalRetry(() => {
        const s = window.__PYQUEST__.active();
        return { key: s.scene.settings.key, t: s.time.now };
      });
      check(after.key === k && after.t > t1, '取消答题后只恢复当前巢穴（旧场景未被误唤醒，游戏循环照常）');
    }
    await evalRetry(() => window.__PYQUEST__.godmode());
    await evalRetry((key) => window.__PYQUEST__.breakBossShield(key), k);
    m = await mech(k);
    check(m.active && m.fakes === 0, '破盾后剩余幻觉随护盾一同消散');
    m = await pollMech(k, (s) => s.lies >= 1, 7500);
    check(m.lies >= 1, `魔像谎称护盾恢复（${m.lies} 次）`);
  }

  // W11 三途试炼：按血量切换拟合 → 模拟 → 学习三段子机制
  {
    const { k, boss } = await enter(11);
    await pin(k, boss.x, boss.y, true);
    let m = await mech(k);
    check(m.phase === 'fit', `第一途：${m.phaseLabel}`);
    await hit(k, 3);
    m = await mech(k);
    check(m.phase === 'simulate', `hp 7 进入第二途：${m.phaseLabel}`);
    await hit(k, 4);
    m = await mech(k);
    check(m.phase === 'learn', `hp 3 进入第三途：${m.phaseLabel}`);
    await evalRetry((key) => window.__PYQUEST__.slayBoss(key), k);
    await wait(300);
    m = await mech(k);
    check(m.bossDead && !m.active, '击败守门人后机制停止');
  }

} catch (err) {
  failed = true;
  errors.push(`[runner] ${err && err.message ? err.message : err}`);
  console.error('执行中断:', err);
}

// ---------- 汇总 ----------
console.log(`\n=== E2E BOSS 招牌机制专项 ===（断言 ${passed} / ${assertions} 通过）`);
if (errors.length) { console.log('浏览器错误:'); console.log(errors.join('\n')); }
else console.log('浏览器无报错 ✓');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
