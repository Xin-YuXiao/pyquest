// ============================================================
// 端到端测试（试炼塔）：解锁 → 进塔 → 错题优先 → 答对开阶梯 → 上楼 → 答错扣到 0 心 → 结算 → 出塔
// 用法: node scripts/e2e-tower.mjs（需要先 npm run dev；npm run test:e2e -- tower 会自动起服）
//
// 交互路径保持真实：Tab 呼出世界地图并点「试炼塔」地标、E 键开符文与登阶梯、
// 数字键 + Enter 答题、点击结算页按钮；作弊只通过 window.__PYQUEST__ 语义动作
// （teleport / godmode / clearMinions / setHearts），状态读取走只读快照 state() / tower() / quizInfo()。
// 「曾答错的题」用注入的 v3 存档预置（与 e2e-review 注入旧存档同法），期望值由本脚本独立给出。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import { QUESTIONS, POOLS } from '../src/data/quizBank.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
const steps = [];
let failed = false;
let assertions = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
// 页面异常带上前几帧调用栈（定位用）
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message} @ ${(err.stack || '').split('\n').slice(1, 4).join(' / ')}`));
// 测试环境封闭化（同 runner）：外网字体请求直接返回空 200
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
const evalRetry = async (fn, arg, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) { last = e; await page.waitForTimeout(350); }
  }
  throw last;
};
/** 等页面条件成立（负载高时游戏时钟慢于墙钟：一律等状态，不用固定 sleep 判断结果） */
const until = (fn, arg, timeout = 10000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

// ---------- seam 访问 ----------
const state = () => evalRetry(() => window.__PYQUEST__.state());
const tower = () => evalRetry(() => window.__PYQUEST__.tower());
const quizInfo = () => evalRetry(() => window.__PYQUEST__.quizInfo());
const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
const savedGame = () => page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v3') || 'null'));
const hudText = () => page.locator('#shard-count').textContent();

/** 等标题画面就绪（BootScene.create 跑完，按钮处理已挂好；同 runner 的 waitForTitle） */
async function waitForTitle() {
  await page.waitForFunction(() => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene('Boot');
    return !!(s && s.sys.isActive());
  }, null, { timeout: 30000 });
  await page.waitForTimeout(200);
}
async function waitForScene(key) {
  await page.waitForFunction((k) => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene(k);
    return !!(s && s.player && s.sys.isActive());
  }, key, { timeout: 15000 });
  await page.waitForTimeout(500);
}
/** 进入塔的第 floor 层：场景重建完成且本层符文已就位 */
async function waitForFloor(floor) {
  const okFloor = await until((f) => {
    const t = window.__PYQUEST__ && window.__PYQUEST__.tower();
    const s = window.__PYQUEST__.scene('TOWER');
    return !!(t && t.run && t.run.floor === f && t.floor && t.floor.runes.length && s && s.sys.isActive() && !s.transitioning);
  }, floor, 15000);
  await page.waitForTimeout(500);
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry(() => window.__PYQUEST__.clearMinions('TOWER'));
  return okFloor;
}

/** 站到塔符文旁按 E 打开它的答题面板（四个靠近点轮询；开错了就取消重来） */
async function openRune(slot) {
  const t = await tower();
  const r = t.floor.runes.find((x) => x.slot === slot);
  const want = t.run.assign[slot].qid;
  for (const [x, y] of [[r.x, r.y + 100], [r.x + 100, r.y], [r.x - 100, r.y], [r.x, r.y - 100]]) {
    await tele(x, y);
    await page.waitForTimeout(250);
    await page.keyboard.press('KeyE');
    if (!(await until(() => window.__PYQUEST__.quizInfo().isOpen, null, 2500))) continue;
    const qi = await quizInfo();
    if (qi.qid === want) return qi;
    await page.click('#quiz-cancel');
    await until(() => !window.__PYQUEST__.quizInfo().isOpen, null, 3000);
  }
  throw new Error(`openRune: 打不开塔符文 ${slot}`);
}
/** 答对并领取 */
async function answerRight(qi) {
  await page.keyboard.press(String(qi.answerAt + 1));
  await page.keyboard.press('Enter');
  await until(() => window.__PYQUEST__.quizInfo().phase === 'correct', null, 4000);
  await page.keyboard.press('Enter');
  await until(() => !window.__PYQUEST__.quizInfo().isOpen, null, 4000);
  await page.waitForTimeout(300);
}

// ---------- 预置存档：第 1-3 章通关、主线爱心 4、一道第二章题曾答错未掌握 ----------
const MISTAKE = POOLS.w2lair[0];
function presetSave() {
  const t = Date.now() - 60 * 60 * 1000;
  const progress = {};
  for (const ch of CHAPTERS) {
    const done = ch.id <= 3;
    progress[ch.id] = {
      shards: done ? ch.shardsNeeded : 0, shardsNeeded: ch.shardsNeeded,
      gateOpen: done, bossShielded: !done, bossDefeated: done, done,
      enteredAt: null, gateOpenedAt: null, doneAt: null,
    };
  }
  return {
    v: 3, savedAt: t, startTime: t, playMs: 0, hearts: 4, maxHearts: 6, current: 4,
    answered: [], qAnswered: [], runeRolls: {}, progress, secrets: [], observatory: {},
    records: {
      stats: {
        [MISTAKE]: {
          n: 1, w: 1, sk: 0, first: 'w', firstAt: t, lastAt: t, lastOk: false, solvedAt: null,
          ch: 2, pool: 'w2lair', tier: QUESTIONS[MISTAKE].tier, k: 'heal', rv: null,
        },
      },
      log: [], dropped: 0,
    },
  };
}

try {
  // ============================================================
  // 1) 第三章未通关：地图上的试炼塔地标锁着
  // ============================================================
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  await page.click('#btn-start');
  await waitForScene(CHAPTERS[0].fieldKey);
  check((await tower()).unlocked === false, '新游戏：试炼塔未开放');
  await page.keyboard.press('Tab');
  check(await until(() => !!document.querySelector('#map-backdrop.show'), null, 5000), 'Tab 呼出世界地图');
  const locked = page.locator('#map-path .map-tower');
  check(await locked.count() === 1, '世界地图上有「试炼塔」地标');
  check(await locked.evaluate((el) => el.classList.contains('locked') && el.disabled), '第三章未通关：试炼塔地标锁定且不可点');
  check((await locked.textContent()).includes('第三章通关后开放'), '锁定地标写明开放条件');
  check(await page.locator('#map-path .map-node').count() === CHAPTERS.length, '章节地标数不受试炼塔地标影响');
  await page.keyboard.press('Tab');
  await until(() => !document.querySelector('#map-backdrop.show'), null, 3000);

  // ============================================================
  // 2) 读入预置存档（第 1-3 章通关）→ 继续冒险落在第四章
  //    先回到标题页再注入：游戏里刷新会触发关页自动存档，把注入的存档覆盖掉（标题页不写档）
  // ============================================================
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await waitForTitle();
  await page.evaluate((save) => {
    localStorage.clear();
    localStorage.setItem('pyquest:save:v3', JSON.stringify(save));
  }, presetSave());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  await page.click('#btn-start');
  await waitForScene(CHAPTERS[3].fieldKey);
  let s = await state();
  check(s.hearts === 4 && s.progress[3].done && !s.progress[4].done, '读档：第 1-3 章通关、主线爱心 4');
  check((await tower()).unlocked === true, '第三章通关后试炼塔开放');

  // ============================================================
  // 3) 世界地图 → 试炼塔 → 第 1 层
  // ============================================================
  await page.keyboard.press('Tab');
  await until(() => !!document.querySelector('#map-backdrop.show'), null, 5000);
  const node = page.locator('#map-path .map-tower');
  check(await node.evaluate((el) => !el.classList.contains('locked') && !el.disabled), '试炼塔地标已点亮可点');
  await shot('130-tower-map');
  await node.click();
  await waitForScene('TOWER');
  check(await waitForFloor(1), '进入试炼塔第 1 层');
  check(await activeKey() === 'TOWER', '当前场景为试炼塔');
  check((await hudText()).includes('试炼塔 第 1 层'), `HUD 显示「试炼塔 第 1 层」（${(await hudText()).trim()}）`);
  let t = await tower();
  s = await state();
  check(s.hearts === s.maxHearts && t.run.mainHearts === 4, '塔内满心开局，主线爱心 4 已快照');
  check(s.current === 4, '进塔不改「当前所在章」');
  check(t.stats.runs === 1, '挑战次数 +1');
  check(t.run.assign.t1r1 && t.run.assign.t1r1.qid === MISTAKE && t.run.assign.t1r1.review, `错题优先：第一块塔符文抽到曾答错的 ${MISTAKE}`);
  const qids = Object.values(t.run.assign).map((a) => a.qid);
  check(new Set(qids).size === qids.length, '同层不撞题');
  await shot('131-tower-floor1');

  // 塔内打不开世界地图
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  check(await page.locator('#map-backdrop.show').count() === 0, '塔内 Tab 不会打开世界地图');

  // 阶梯未开启时登不上去
  await tele(t.floor.stairs.x, t.floor.stairs.y + 150);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  check((await tower()).run.floor === 1, '没解开符文时阶梯不开');

  // ============================================================
  // 4) 答对错题 → 掌握连击 +1；答完本层 → 阶梯开启 → 第 2 层
  // ============================================================
  let qi = await openRune('t1r1');
  check(qi.mode === 'main' && qi.qid === MISTAKE, '塔符文打开答题面板（错题）');
  await answerRight(qi);
  s = await state();
  const st = s.records.stats[MISTAKE];
  check(!!st.rv && st.rv.streak === 1 && !st.rv.mastered, '错题在塔里答对：掌握连击 +1（与错题本复习同规则）');
  check(st.tw && st.tw.n === 1, '学习记录记下一次塔内作答');
  check((await tower()).run.solved.includes('t1r1'), '塔符文 t1r1 已解开');
  for (const r of (await tower()).floor.runes.filter((x) => x.alive)) {
    qi = await openRune(r.slot);
    await answerRight(qi);
  }
  t = await tower();
  check(t.run.cleared, '本层塔符文全部答对 → 本层通过');
  check(t.run.correct === 2 && t.run.total === 2 && t.run.reviewed.length === 1, '本次正确率 2/2，复习错题 1 道');
  check((await page.locator('#objective').textContent()).includes('正确率 100%'), 'HUD 目标行显示本次正确率');
  await tele(t.floor.stairs.x, t.floor.stairs.y + 150);
  // 提示条按游戏时钟刷新（答题时场景暂停，先前的短时提示可能还没到期）：等它切过来
  check(await until(() => (document.getElementById('hint').textContent || '').includes('登上阶梯'), null, 6000), '阶梯旁提示「登上阶梯」');
  await page.keyboard.press('KeyE');
  check(await waitForFloor(2), '登上阶梯 → 第 2 层');
  check((await hudText()).includes('试炼塔 第 2 层'), 'HUD 显示「试炼塔 第 2 层」');
  check(((await savedGame()) || {}).tower.best === 2, '个人最佳（第 2 层）随上楼写档');
  check(((await savedGame()) || {}).hearts === 4, '塔内写档仍是主线爱心 4');
  await shot('132-tower-floor2');

  // ============================================================
  // 5) 守层者层（跳到第 5 层）→ BOSS 符文破盾 → 击败守层者 → 休息平台篝火 → 第 6 层
  // ============================================================
  await evalRetry(() => window.__PYQUEST__.towerJump(5));
  check(await waitForFloor(5), '跳到第 5 层（守层者层）');
  t = await tower();
  check(t.floor.guardian && t.run.shielded, '第 5 层有守层者，护盾在身');
  check(t.floor.runes.some((r) => r.bossRune) && t.floor.runes.some((r) => r.healRune), '守层者层有 BOSS 符文与祝福符文');
  const mech = await evalRetry(() => window.__PYQUEST__.bossMech('TOWER'));
  check(!!mech, '守层者带着借来的招牌机制');
  check((await hudText()).includes('试炼塔 第 5 层'), 'HUD 显示「试炼塔 第 5 层」');
  await evalRetry(() => window.__PYQUEST__.pinBoss('TOWER'));
  await tele(t.floor.stairs.x, t.floor.stairs.y + 150);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  check((await tower()).run.floor === 5 && !(await tower()).run.rest, '守层者未倒下时阶梯不开');
  const bossSlot = t.floor.runes.find((r) => r.bossRune).slot;
  qi = await openRune(bossSlot);
  await answerRight(qi);
  check(!(await tower()).run.shielded, '答对 BOSS 符文 → 守层者护盾破碎');
  await evalRetry(() => window.__PYQUEST__.pinBoss('TOWER'));
  await evalRetry(() => window.__PYQUEST__.slayBoss('TOWER'));
  check(await until(() => window.__PYQUEST__.tower().run.guardianDown, null, 6000), '击败守层者');
  check((await tower()).run.cleared, '守层者倒下 → 本层通过');
  await shot('134-tower-guardian');
  t = await tower();
  await tele(t.floor.stairs.x, t.floor.stairs.y + 150);
  await until(() => (document.getElementById('hint').textContent || '').includes('登上阶梯'), null, 6000);
  await page.keyboard.press('KeyE');
  check(await until(() => {
    const x = window.__PYQUEST__.tower();
    const s = window.__PYQUEST__.scene('TOWER');
    return !!(x.run && x.run.rest && x.floor && x.floor.campfire && s.sys.isActive() && !s.transitioning);
  }, null, 15000), '守层者层之后进入休息平台');
  await page.waitForTimeout(500);
  check((await hudText()).includes('休息平台'), 'HUD 显示「休息平台」');
  await evalRetry(() => window.__PYQUEST__.setHearts(3));
  t = await tower();
  await tele(t.floor.campfire.x, t.floor.campfire.y + 160);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  check((await state()).hearts === 4 && (await tower()).run.rested, '篝火旁休息：回 1 心');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  check((await state()).hearts === 4, '同一处篝火只能歇一次');
  await tele(t.floor.stairs.x, t.floor.stairs.y + 150);
  await until(() => (document.getElementById('hint').textContent || '').includes('登上阶梯'), null, 6000);
  await page.keyboard.press('KeyE');
  check(await waitForFloor(6), '休息平台 → 第 6 层');
  check((await tower()).stats.best === 6, '个人最佳刷新为第 6 层');

  // ============================================================
  // 6) 第 6 层答错把爱心扣到 0 → 结算页 → 出塔回主线
  // ============================================================
  await evalRetry(() => window.__PYQUEST__.setHearts(1));
  t = await tower();
  const victim = t.floor.runes[0];
  const victimQ = t.run.assign[victim.slot].qid;
  qi = await openRune(victim.slot);
  await page.keyboard.press(String(((qi.answerAt + 1) % qi.optionCount) + 1));
  await page.keyboard.press('Enter');
  check(await until(() => {
    const r = window.__PYQUEST__.tower().result;
    return !!(r && r.isOpen);
  }, null, 8000), '答错扣到 0 心 → 结算页弹出');
  check(await page.locator('#tower-result:not(.hidden) [role="dialog"], #tower-result[role="dialog"]:not(.hidden)').count() === 1, '结算页以对话框形式出现');
  t = await tower();
  check(t.run === null, '挑战已结束');
  check(t.result.summary.reason === 'defeat' && t.result.summary.floor === 6, '结算：爱心耗尽，到达第 6 层');
  check(t.result.summary.accuracy === 75 && t.result.summary.reviewed === 1, '结算：正确率 75%（3/4）、复习错题 1 道');
  check(t.result.summary.newBest && t.result.summary.best === 6, '结算：刷新个人最佳第 6 层');
  check((await page.locator('#tr-floor').textContent()).trim() === '6', '结算页显示到达层数 6');
  check((await page.locator('#tr-best').textContent()).includes('新纪录'), '结算页标出新纪录');
  await page.waitForTimeout(1600); // 统计印 / 按钮区按封印页时间轴依次盖下（0.85s ~ 1.32s）
  check(await page.locator('#tower-again').isVisible() && await page.locator('#tower-leave').isVisible(), '结算页有「再闯一次」与「离开试炼塔」');
  s = await state();
  check(s.hearts === 4, '出塔还原主线爱心 4');
  const st2 = s.records.stats[victimQ];
  check(!!st2 && st2.w === 1 && st2.k === 'tower', '塔里答错的新题入错题本（kind = tower）');
  const save = await savedGame();
  check(save.tower.best === 6 && save.tower.runs === 1 && save.tower.answered === 4 && save.tower.correct === 3, '塔战绩写档：最佳 6 层 / 挑战 1 次 / 答 4 对 3');
  check(save.hearts === 4 && save.current === 4, '存档里的主线爱心与当前章未被塔改动');
  check([1, 2, 3].every((id) => save.progress[id].done) && !save.progress[4].done && save.progress[4].shards === 0, '主线章节进度未被塔改动');
  await shot('133-tower-result');

  await page.click('#tower-leave');
  await waitForScene(CHAPTERS[3].fieldKey);
  check(await activeKey() === CHAPTERS[3].fieldKey, '离开试炼塔 → 回到第四章野外');
  check(!(await hudText()).includes('试炼塔'), 'HUD 回到主线显示');
  s = await state();
  check(s.hearts === 4, '回到主线后爱心仍是 4');
  await page.keyboard.press('Tab');
  await until(() => !!document.querySelector('#map-backdrop.show'), null, 5000);
  check((await page.locator('#map-path .map-tower').textContent()).includes('最高 第 6 层'), '世界地图试炼塔地标显示个人最佳');
  await page.keyboard.press('Tab');

  check(errors.length === 0, `浏览器无报错${errors.length ? `：${errors.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  failed = true;
  console.error('执行中断:', e);
  steps.push(`  ✗ 执行中断：${e.message}`);
}

await browser.close();
console.log(`\n${failed ? '✗' : '✓'} 试炼塔 E2E：${assertions} 项断言${failed ? '，有失败' : '全部通过'}`);
if (errors.length) console.log(errors.join('\n'));
process.exit(failed ? 1 : 0);
