// ============================================================
// 端到端测试（Project 秘境）：课程 Project 的通关后隐藏关卡
// 用法: node scripts/e2e-realms.mjs（需要先 npm run dev；npm run test:e2e 会自动起服）
//
// 主线：村庄秘境之门封印（第一部未通关）→ 开启 → 秘境大厅 → Project-4「暗晕重建」外庭：
//   课题符文按序解锁（越级被拒）→ 第 2 步先答错一次（扣心 + 进学习记录 / 错题本）→ 前五步解开 →
//   圣所之门解封 → 圣所第 6 步「报告」破盾 → 击败秘境 BOSS → 课题封印页 → 回大厅 →
//   世界地图「Project 秘境」区块显示徽章（章节地标仍为 11 个）→ 刷新读档进度仍在。
// 另外三个秘境（Project-1 / 2 / 5-7）：外庭五块课题符文就位、第 1 步能开题；圣所 BOSS 带对应招牌机制、处于护盾期。
//
// 交互路径保持真实：E 键开门 / 开题 / 对话，答题走真实 DOM 点击；
// 作弊只通过 window.__PYQUEST__ 语义动作（unlockRealms / gotoChapter / gotoRealm / teleport /
// godmode / clearMinions / setHearts / pinBoss / slayBoss），状态读取走只读快照 realms() / state() / quizInfo()。
// 等待一律等游戏状态就绪（负载高时游戏时钟慢于墙钟，不靠固定长睡眠）。
// ============================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHAPTERS } from '../src/data/chapters.js';
import { buildVillage } from '../src/data/maps.js';
import { REALMS, REALM_HALL, REALM_STEPS } from '../src/data/realms.js';
import { buildRealmHall, buildRealmField } from '../src/data/realmMaps.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
let failed = false;
let assertions = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
// 测试环境封闭化（同 runner）：外网字体请求直接返回空 200
const isLocal = (url) => url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
await page.route('**/*', (route) => (
  isLocal(route.request().url()) ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
));

const shot = async (name) => {
  await page.screenshot({ path: `scripts/shots/${name}.png` });
  console.log(`📷 ${name}`);
};
const check = (cond, label) => {
  assertions++;
  if (cond) console.log(`  ✓ ${label}`);
  else { failed = true; console.log(`  ✗ ${label}`); }
};
const evalRetry = async (fn, arg, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) { last = e; await page.waitForTimeout(350); }
  }
  throw last;
};
/** 等页面内条件成立（失败不抛错，返回是否成立；条件由后续断言兜底） */
const until = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

// ---------- seam 访问（只读查询 + 语义动作） ----------
const realms = () => evalRetry(() => window.__PYQUEST__.realms());
const state = () => evalRetry(() => window.__PYQUEST__.state());
const activeKey = () => evalRetry(() => window.__PYQUEST__.active().scene.settings.key);
const tele = (x, y) => evalRetry(([tx, ty]) => window.__PYQUEST__.teleport(tx, ty), [x, y]);
const realmOf = (id) => REALMS.find((r) => r.id === id);
const progressOf = async (id) => (await realms()).list.find((r) => r.id === id);

/** 场景切换前给当前玩家打标记：Phaser 重启同一场景会复用场景实例，
 *  只有 create() 新建的玩家对象没有标记——据此确认等到的是新场景，而不是正在关停的旧场景 */
const markScene = () => evalRetry(() => {
  const s = window.__PYQUEST__ && window.__PYQUEST__.active();
  if (s && s.player) s.player.__stale = true;
});

/** 等某场景成为当前场景且（新建的）玩家就位；随后开无敌、清小怪（答题环节确定性） */
async function waitForScene(key, label) {
  const ok = await until((k) => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.active();
    return !!(s && s.scene.settings.key === k && s.player && !s.player.__stale && s.scene.isActive());
  }, key, 15000);
  check(ok, label);
  if (!ok) throw new Error(`waitForScene: ${key} 未就绪`);
  await page.waitForTimeout(300);
  await evalRetry(() => window.__PYQUEST__.godmode());
  await evalRetry((k) => window.__PYQUEST__.clearMinions(k), key);
}

async function closeDialogue() {
  for (let i = 0; i < 20; i++) {
    if (await page.locator('#dialogue.show').count() === 0) return;
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(200);
  }
}

/** 等标题画面就绪（BootScene.create 跑完，按钮文案与点击处理都已挂好） */
async function waitForTitle() {
  await until(() => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.scene('Boot');
    return !!(s && s.sys.isActive());
  }, null, 30000);
  await page.waitForTimeout(200);
}

// 外庭研究小径所在行的 y（瓦片 10 的格子中心）：符文在小径北侧就从南边靠近，反之从北边
const PATH_Y = 10 * 128 + 64;

/** 站到课题符文旁按 E：先从小径一侧靠近（圣所的 BOSS 符文从南侧），再四方位轮询，直到本块符文的题面打开 */
async function openTrial(t, qid, label) {
  const dy = t.y < PATH_Y ? 190 : -190;
  const cands = [[t.x, t.y + dy], [t.x, t.y - dy], [t.x + 190, t.y], [t.x - 190, t.y]];
  for (const [x, y] of cands) {
    await closeDialogue();
    await tele(x, y);
    await page.waitForTimeout(260);
    await page.keyboard.press('KeyE');
    const open = await until((q) => {
      const s = window.__PYQUEST__.active();
      return !!(s.quiz && s.quiz.isOpen && s.quiz.q && s.quiz.q.id === q);
    }, qid, 1500);
    if (open) { check(true, `${label} 答题面板打开`); return true; }
  }
  check(false, `${label} 答题面板打开`);
  throw new Error(`openTrial: ${label}（${qid}）打不开`);
}

/** 有界点击：效果以 verifyFn 为准，卡住时补点 */
async function quizClick(sel, verifyFn, tries = 4) {
  for (let i = 0; i < tries; i++) {
    if (await verifyFn().catch(() => false)) return true;
    try { await page.click(sel, { timeout: 2500 }); } catch { /* 由 verifyFn 决定是否重试 */ }
    await page.waitForTimeout(160);
  }
  return verifyFn().catch(() => false);
}

async function answerWrong(label) {
  const info = await evalRetry(() => window.__PYQUEST__.quizInfo());
  const wrong = (info.answerAt + 1) % info.optionCount;
  await quizClick(`#quiz-options .opt:nth-child(${wrong + 1})`,
    () => page.evaluate((i) => window.__PYQUEST__.active().quiz.selected === i, wrong));
  await quizClick('#quiz-confirm',
    () => page.evaluate((n) => window.__PYQUEST__.quizInfo().attempts >= n, info.attempts + 1));
  check(await until(() => !!document.querySelector('#quiz-feedback.bad'), null, 3000), `${label} 答错给出反馈`);
}

async function answerCorrect(label) {
  const at = await evalRetry(() => window.__PYQUEST__.quizInfo().answerAt);
  await quizClick(`#quiz-options .opt:nth-child(${at + 1})`,
    () => page.evaluate((i) => window.__PYQUEST__.active().quiz.selected === i, at));
  await quizClick('#quiz-confirm', () => page.evaluate(() => window.__PYQUEST__.active().quiz.phase === 'correct'));
  check(await until(() => !!document.querySelector('#quiz-feedback.ok'), null, 3000), `${label} 答对`);
  await quizClick('#quiz-confirm', () => page.evaluate(() => !window.__PYQUEST__.active().quiz.isOpen));
  await page.waitForTimeout(350);
}

/** 走进传送门矩形（传送门判定是重叠触发） */
async function walkInto(rect) {
  await tele(rect.x + rect.w / 2, rect.y + rect.h / 2);
}

try {
  // ============================================================
  // 新游戏 → 村庄：秘境之门在第一部通关前封印
  // ============================================================
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  await page.click('#btn-start');
  const village = CHAPTERS[0];
  await waitForScene(village.fieldKey, '新游戏从村庄开始');

  const vmap = buildVillage(village);
  const door = vmap.props.find((p) => p.type === 'doorlink' && p.to === REALM_HALL.key);
  const doorPortal = vmap.portals.find((p) => p.to === REALM_HALL.key);
  check(!!door && !!doorPortal, '村庄里有秘境之门');
  check((await realms()).unlocked === false, '第一部未通关：秘境未开启');

  await tele(door.x, door.y - 220);
  await page.waitForTimeout(300);
  const lockHint = await page.locator('#hint').textContent();
  check(lockHint.includes('秘境之门'), `秘境之门旁有交互提示（「${lockHint.trim()}」）`);
  await page.keyboard.press('KeyE');
  check(await until(() => !!document.querySelector('#dialogue.show'), null, 3000), '按 E 检查封印的秘境之门');
  const lockLines = await evalRetry(() => window.__PYQUEST__.active().dialogue.lines.join('|'));
  check(lockLines.includes('NFW 幻龙'), '封印提示说明开启条件（打通第一部）');
  await closeDialogue();
  await walkInto(doorPortal.rect);
  await page.waitForTimeout(1500);
  check(await activeKey() === village.fieldKey, '秘境之门封印时走进去也不会传送');
  // 先离开门口：否则一开启秘境，站在传送门里的玩家下一帧就会被传走（与下面的跳章重启抢场景）
  await tele(door.x, door.y - 420);
  await page.waitForTimeout(300);

  // ============================================================
  // 开启秘境（第一部通关）→ 长老提示 → 走进秘境之门 → 秘境大厅
  // ============================================================
  await evalRetry(() => window.__PYQUEST__.unlockRealms());
  check((await realms()).unlocked === true, '第一部通关后秘境开启');
  await markScene();
  await evalRetry(() => window.__PYQUEST__.gotoChapter(1));
  await waitForScene(village.fieldKey, '回到村庄（门按新状态重建）');
  check(await evalRetry(() => {
    const it = window.__PYQUEST__.active().interactables.find((i) => i.kind === 'doorlink' && i.prop.to === 'RealmHall');
    return !!it && !it.locked;
  }), '秘境之门的封印已解除');
  const elder = vmap.props.find((p) => p.type === 'npc');
  await tele(elder.x, elder.y + 180);
  await page.waitForTimeout(260);
  await page.keyboard.press('KeyE');
  await until(() => !!document.querySelector('#dialogue.show'), null, 3000);
  const elderLines = await evalRetry(() => window.__PYQUEST__.active().dialogue.lines.join('|'));
  check(elderLines.includes('秘境之门'), '长老提示秘境之门已开启');
  await closeDialogue();

  await markScene();
  await walkInto(doorPortal.rect);
  await waitForScene(REALM_HALL.key, '走进秘境之门 → 秘境大厅');
  await shot('r1-hall');
  let rs = await realms();
  check(rs.here === 'hall', '所在区域为秘境大厅');
  check((await page.locator('#objective').textContent()).includes('课题之门'), 'HUD 目标提示走进课题之门');
  check((await page.locator('#shard-count').textContent()).includes('徽章 0 / 4'), 'HUD 胶囊显示课题徽章 0 / 4');

  // ============================================================
  // Project-4 · 暗晕重建：外庭课题链
  // ============================================================
  const p4 = realmOf('p4');
  const hall = buildRealmHall();
  await markScene();
  await walkInto(hall.portals.find((p) => p.to === p4.fieldKey).rect);
  await waitForScene(p4.fieldKey, '走进 Project-4 之门 → 暗晕前哨');
  await shot('r2-p4-field');
  rs = await realms();
  check(rs.here === 'p4', '所在区域为 Project-4');
  check(rs.trials.length === 5 && rs.trials.map((t) => t.state).join() === 'next,locked,locked,locked,locked',
    `外庭五块课题符文：只有第 1 步亮起（${rs.trials.map((t) => t.state).join()}）`);
  check((await page.locator('#shard-count').textContent()).includes('课题 0 / 6'), 'HUD 胶囊显示课题 0 / 6');
  check((await page.locator('#objective').textContent()).includes('第 1 步「选题」'), 'HUD 目标指向第 1 步「选题」');
  check(await evalRetry(() => window.__PYQUEST__.active().interactables.some((i) => i.kind === 'observatory' && i.obs === 'nfw')),
    '外庭有 NFW 拟合台');

  // 越级：第 3 步封印中，提示先完成第 1 步，不开题
  const t3 = rs.trials[2];
  await tele(t3.x, t3.y + (t3.y < PATH_Y ? 190 : -190));
  await page.waitForTimeout(300);
  const lockedHint = await page.locator('#hint').textContent();
  check(lockedHint.includes('先完成第 1 步「选题」'), `封印的课题符文提示先做哪一步（「${lockedHint.trim()}」）`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  check(await page.locator('#quiz-backdrop.show').count() === 0, '越级交互不开题');
  check((await progressOf('p4')).steps === 0, '越级交互不推进课题');

  // 圣所之门封印中
  check(await evalRetry(() => {
    const it = window.__PYQUEST__.active().interactables.find((i) => i.kind === 'doorlink');
    return !!it && it.locked;
  }), '前五步未完成时圣所之门封印');

  await evalRetry(() => window.__PYQUEST__.setHearts(3));
  for (let i = 0; i < 5; i++) {
    const t = (await realms()).trials[i];
    const qid = p4.steps[i].qid;
    const label = `第 ${i + 1} 步「${REALM_STEPS[i]}」（${qid}）`;
    await openTrial(t, qid, label);
    const heading = await page.locator('#quiz-chapter').textContent();
    check(heading.includes(`Project-4 · 第 ${i + 1} 步 · ${REALM_STEPS[i]}`), `题面标签显示课题步骤（「${heading}」）`);
    if (i === 1) {
      const before = (await state()).hearts;
      await answerWrong(label);
      check((await state()).hearts === before - 1, '课题符文答错扣 1 心（与主线一致）');
    }
    const heartsBefore = (await state()).hearts;
    await answerCorrect(label);
    const p = await progressOf('p4');
    check(p.steps === i + 1, `解开第 ${i + 1} 步（进度 ${p.steps} / 6）`);
    check((await state()).hearts === Math.min(6, heartsBefore + 1), '答对课题符文回 1 心');
  }
  rs = await realms();
  check(rs.trials.every((t) => t.state === 'solved'), '外庭五块课题符文全部已解');
  check(await evalRetry(() => {
    const it = window.__PYQUEST__.active().interactables.find((i) => i.kind === 'doorlink');
    return !!it && !it.locked;
  }), '第 5 步「验证」解开后圣所之门当场解封');
  check((await page.locator('#objective').textContent()).includes('报告'), 'HUD 目标指向圣所「报告」');

  // 学习记录 / 错题本：秘境作答照常记录，答错的题入错题本
  const st = await state();
  const wrongQ = p4.steps[1].qid;
  const log = st.records.log.filter((e) => e.k === 'trial');
  check(log.length === 6 && log.every((e) => e.s.startsWith('rp4s')), `课题符文作答写入学习记录（${log.length} 条，kind = trial）`);
  check(st.records.stats[wrongQ] && st.records.stats[wrongQ].w === 1, `答错的 ${wrongQ} 记 1 次错`);
  const mk = await evalRetry(() => window.__PYQUEST__.mistakes());
  check(mk.entries.some((e) => e.qid === wrongQ && e.kind === 'trial'), '答错的课题题目进入错题本（类型「秘境」）');
  check(Object.keys(st.progress).every((id) => !String(id).startsWith('realm')), '秘境不写章节进度');

  // ============================================================
  // 圣所：第 6 步「报告」破盾 → 击败秘境 BOSS → 课题封印页
  // ============================================================
  const fieldMap = buildRealmField(p4);
  await markScene();
  await walkInto(fieldMap.portals.find((p) => p.to === p4.lairKey).rect);
  await waitForScene(p4.lairKey, '走进圣所之门 → 暗晕之心');
  await shot('r3-p4-sanctum');
  check(await evalRetry(() => window.__PYQUEST__.active().isBossShielded()), '「报告」之前秘境 BOSS 有护盾');
  const mech0 = await evalRetry((k) => window.__PYQUEST__.bossMech(k), p4.lairKey);
  check(!!mech0 && mech0.kind === p4.bossMechanic.kind && !mech0.active, `BOSS 挂着「${p4.bossMechanic.name}」机制，护盾期未开战`);
  await evalRetry((k) => window.__PYQUEST__.pinBoss(k), p4.lairKey);
  rs = await realms();
  check(rs.trials.length === 1 && rs.trials[0].bossRune && rs.trials[0].state === 'next', '圣所正中是第 6 步「报告」的 BOSS 符文');
  await openTrial(rs.trials[0], p4.steps[5].qid, '第 6 步「报告」');
  check((await page.locator('#quiz-chapter').textContent()).includes('第 6 步 · 报告'), '题面标签显示第 6 步「报告」');
  await answerCorrect('第 6 步「报告」');
  check((await progressOf('p4')).steps === 6, '课题六步全部解开');
  check(!(await evalRetry(() => window.__PYQUEST__.active().isBossShielded())), '「报告」答对后 BOSS 护盾破碎');
  check(await until((k) => {
    const m = window.__PYQUEST__.bossMech(k);
    return !!(m && m.active);
  }, p4.lairKey, 3000), '破盾后招牌机制开战');
  const banner = await page.locator('#boss-banner .bb-title').textContent();
  check(banner.includes(p4.bossName) && banner.includes(p4.bossMechanic.name), `开战横幅交代玩法（「${banner}」）`);

  await evalRetry((k) => window.__PYQUEST__.pinBoss(k), p4.lairKey);
  for (let i = 0; i < 6; i++) {
    if (await page.locator('#victory:not(.hidden)').count()) break;
    await evalRetry((k) => window.__PYQUEST__.slayBoss(k), p4.lairKey);
    await until(() => !document.getElementById('victory').classList.contains('hidden'), null, 2500);
  }
  check(await until(() => !document.getElementById('victory').classList.contains('hidden'), null, 6000), '击败秘境 BOSS → 课题封印页');
  await shot('r4-p4-seal');
  check((await page.locator('#victory-title').textContent()).includes('暗晕重建'), '封印页标题为「课题封印 · 暗晕重建」');
  const stats = await page.locator('#victory-stats').textContent();
  check(stats.includes('6 / 6') && stats.includes(p4.badge) && stats.includes('1 / 4'), `封印页统计：课题 6/6、${p4.badge}、徽章 1/4`);
  const p4done = await progressOf('p4');
  check(p4done.done === true && (await realms()).badges === 1, '课题封印、徽章 +1');
  check((await state()).progress[9].done === false, '主线进度不受秘境影响（第九章仍未通关）');

  await markScene();
  await page.click('#btn-next');
  await waitForScene(REALM_HALL.key, '封印页「返回秘境大厅」');
  check((await page.locator('#shard-count').textContent()).includes('徽章 1 / 4'), '大厅 HUD 徽章 1 / 4');

  // ============================================================
  // 世界地图：Project 秘境区块（章节地标仍为 11 个）
  // ============================================================
  await page.keyboard.press('Tab');
  check(await until(() => !!document.querySelector('#map-backdrop.show'), null, 3000), 'Tab 呼出世界地图');
  check(await page.locator('#map-path .map-node').count() === CHAPTERS.length, `章节地标仍为 ${CHAPTERS.length} 个`);
  const box = await page.locator('#map-path .map-realms').textContent();
  check(box.includes('Project 秘境') && box.includes('徽章 1 / 4'), '地图上有「Project 秘境」区块，显示徽章 1 / 4');
  check(await page.locator('.map-realms .mr-item[data-realm="p4"].mr-done').count() === 1, 'Project-4 在地图上标为已封印');
  check(await page.locator('.map-realms .mr-item[data-realm="p1"]:not([disabled])').count() === 1, '其余秘境可从地图直达');
  await shot('r5-map');
  await page.keyboard.press('Tab');
  await until(() => !document.querySelector('#map-backdrop.show'), null, 3000);

  // ============================================================
  // 刷新读档：秘境进度保留（存档 v3 的 realms 字段）
  // ============================================================
  await until(() => {
    const raw = localStorage.getItem('pyquest:save:v3');
    return !!raw && JSON.parse(raw).realms && JSON.parse(raw).realms.p4 && JSON.parse(raw).realms.p4.done === true;
  }, null, 5000);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pyquest:save:v3') || 'null'));
  check(!!saved && saved.realms && saved.realms.p4 && saved.realms.p4.done === true && saved.realms.p4.steps === 6, '秘境进度已写入存档 v3（realms 字段）');
  await page.reload({ waitUntil: 'networkidle' });
  await waitForTitle();
  check((await page.locator('#btn-start').textContent()).includes('继续冒险'), '刷新后标题显示「继续冒险」');
  await page.click('#btn-start');
  await until(() => {
    const s = window.__PYQUEST__ && window.__PYQUEST__.active();
    return !!(s && s.player && s.scene.isActive());
  }, null, 15000);
  const after = await progressOf('p4');
  check(after.done === true && after.steps === 6, '读档后 Project-4 仍为已封印');
  check((await realms()).badges === 1, '读档后徽章数保留');

  // ============================================================
  // 其余三个秘境：外庭课题链就位、第 1 步能开题；圣所 BOSS 机制正确、护盾期
  // ============================================================
  for (const r of REALMS.filter((x) => x.id !== 'p4')) {
    await markScene();
    await evalRetry((id) => window.__PYQUEST__.gotoRealm(id), r.id);
    await waitForScene(r.fieldKey, `${r.project}「${r.title}」外庭可进入`);
    // 草地秘境没有水面：让环境粒子定时器（每 640ms）多跑几轮，回归「无水面草地图取水面波光崩溃」
    if (r.theme.palette === 'grass') await page.waitForTimeout(3000);
    rs = await realms();
    check(rs.trials.length === 5 && rs.trials[0].state === 'next' && rs.trials[1].state === 'locked', `${r.project} 外庭五块课题符文按序待解`);
    await openTrial(rs.trials[0], r.steps[0].qid, `${r.project} 第 1 步「选题」`);
    check((await page.locator('#quiz-chapter').textContent()).includes(`${r.project} · 第 1 步 · 选题`), `${r.project} 题面标签正确`);
    await quizClick('#quiz-cancel', () => page.evaluate(() => !window.__PYQUEST__.active().quiz.isOpen));
    await markScene();
    await evalRetry((id) => window.__PYQUEST__.gotoRealm(id, { where: 'sanctum' }), r.id);
    await waitForScene(r.lairKey, `${r.project} 圣所可进入`);
    const m = await evalRetry((k) => window.__PYQUEST__.bossMech(k), r.lairKey);
    check(!!m && m.kind === r.bossMechanic.kind, `${r.project} 的 BOSS「${r.bossName}」挂着「${r.bossMechanic.name}」机制`);
    check(await evalRetry(() => window.__PYQUEST__.active().isBossShielded()), `${r.project} 圣所 BOSS 处于护盾期`);
  }
  await shot('r6-other-realm');
} catch (e) {
  failed = true;
  console.error('执行中断:', e.message);
}

check(errors.length === 0, `浏览器无报错${errors.length ? `：${errors.slice(0, 3).join(' / ')}` : ''}`);
await browser.close();
console.log(`\n[e2e-realms] ${assertions} 项断言 · ${failed ? '失败 ✘' : '全部通过 ✔'}`);
process.exit(failed ? 1 : 0);
