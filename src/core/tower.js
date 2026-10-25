// ============================================================
// 试炼塔：可反复挑战的 roguelite 式爬塔（第三章通关后开放）
// 也是「间隔复习」的游戏化：塔里只出已通关章节的题，优先出错题本里未掌握的题，
// 其次出很久没见过的题，再其次随机（INSPIRATION.md：提取练习 / 间隔重复；
// 只记个人最佳，不做排行榜）。
//
// 两层：
//   纯函数（无 Phaser、不读写 G，smoke 直接校验）——楼层规划、选题规则、楼层推进、
//     战绩累计、HUD 文案、结算摘要
//   挑战生命周期（读写 G）——startRun / assignFloor / noteTowerAnswer / climb / restHeal / endRun
// 状态隔离：进塔时把主线爱心存进 run.main，塔内从满心开局；出塔（主动离开或爱心归零）时还原。
// 挑战进行中写档（save.js 的 serialize）写的是 run.main 里的主线爱心，塔里的伤害永远进不了主线存档；
// G.current / G.progress / G.answered / G.qAnswered 塔内一概不碰（塔用虚拟章节，见 scenes/TowerScene.js）。
// ============================================================
import { G, freshTowerStats, updateHud } from './state.js';
import { CHAPTERS } from '../data/chapters.js';
import { QUESTIONS, POOLS } from '../data/quizBank.js';

export const TOWER_KEY = 'TOWER';
export const TOWER_UNLOCK_CH = 3;               // 第三章通关后开放
export const GUARDIAN_EVERY = 5;                // 每 5 层一个守层者
export const STEP_EVERY = 3;                    // 每 3 层小怪升一档
export const STALE_MS = 24 * 60 * 60 * 1000;    // 超过一天没见过的题 = 「很久没见过」
export const PALETTES = ['grass', 'dungeon', 'deep'];

/** 确定性伪随机（mulberry32）：同一种子同一序列，选题与选址可复现 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一次挑战的种子 + 层号 → 本层种子 */
export function floorSeed(runSeed, floor) {
  return ((runSeed >>> 0) ^ Math.imul(floor + 1, 0x9E3779B1)) >>> 0;
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 解锁与题源 ----------

/** progress（G.progress 形状）→ 试炼塔是否已开放 */
export function towerUnlocked(progress) {
  return !!(progress && progress[TOWER_UNLOCK_CH] && progress[TOWER_UNLOCK_CH].done);
}

/** 已通关章节 id 列表（升序） */
export function clearedChapterIds(progress) {
  return CHAPTERS.filter((ch) => progress && progress[ch.id] && progress[ch.id].done).map((ch) => ch.id);
}

/** 章节 id 列表 → 这些章全部题池里的题（去重，按章节、题池登记顺序） */
export function towerCandidates(chapterIds) {
  const seen = new Set();
  const out = [];
  for (const id of chapterIds) {
    const ch = CHAPTERS.find((c) => c.id === id);
    if (!ch || !ch.pools) continue;
    for (const pool of new Set(Object.values(ch.pools))) {
      for (const qid of POOLS[pool] || []) {
        if (QUESTIONS[qid] && !seen.has(qid)) { seen.add(qid); out.push(qid); }
      }
    }
  }
  return out;
}

// ---------- 选题规则 ----------

/** 学习记录汇总里的一条 → 是否「曾错且未掌握」（= 错题本里的待复习题，口径同 core/mistakes.js） */
export function isPendingMistake(st) {
  return !!st && st.w > 0 && !(st.rv && st.rv.mastered);
}

/** 这道题最近一次出现在学生面前的时间（主线 / 复习 / 塔里取最近；从没见过返回 null） */
export function lastSeenAt(st) {
  if (!st) return null;
  const ts = [st.lastAt, st.rv && st.rv.at, st.tw && st.tw.at].filter((t) => typeof t === 'number');
  return ts.length ? Math.max(...ts) : null;
}

/**
 * 给本层的 count 块符文选题：
 *   1) 错题本里「曾错且未掌握」的题（答错次数多的优先，同次数按种子打乱）
 *   2) 「很久没见过」：见过、但最近一次超过 STALE_MS 的题（越久越优先）
 *   3) 其余题按种子随机
 * 本次挑战已出过的题（used）先排除；不够时才放回 used 里的题兜底（题源很小也不会卡住）。
 * 返回 [{ qid, review }]：review = 选中时它是错题本里的待复习题（结算页「复习了几道错题」用）
 */
export function pickTowerQuestions({ candidates, stats = {}, used = [], count, now = Date.now(), seed = 1 }) {
  const rand = seededRandom(seed);
  const usedSet = new Set(used);
  const rank = (pool) => {
    const mistakes = [];
    const stale = [];
    const rest = [];
    for (const qid of shuffle(pool, rand)) {
      const st = stats[qid];
      if (isPendingMistake(st)) mistakes.push(qid);
      else {
        const seen = lastSeenAt(st);
        if (seen != null && now - seen > STALE_MS) stale.push(qid);
        else rest.push(qid);
      }
    }
    mistakes.sort((a, b) => stats[b].w - stats[a].w); // 稳定排序：同次数保持打乱后的顺序
    stale.sort((a, b) => lastSeenAt(stats[a]) - lastSeenAt(stats[b]));
    return [...mistakes, ...stale, ...rest];
  };
  const fresh = rank(candidates.filter((q) => !usedSet.has(q)));
  const reuse = rank(candidates.filter((q) => usedSet.has(q)));
  return [...fresh, ...reuse].slice(0, count).map((qid) => ({ qid, review: isPendingMistake(stats[qid]) }));
}

// ---------- 楼层规划 ----------

/**
 * 第 floor 层的规划：
 *   - 每 GUARDIAN_EVERY 层是守层者层：1 块祝福符文（答对回 1 心）+ BOSS 符文 + 守层者
 *     （借用某个已通关章节的 BOSS 原型与招牌机制）；击败守层者 = 本层通过
 *   - 其余是普通层：前两层 2 块塔符文、之后 3 块；全部答对 = 本层通过（阶梯开启）
 *   - 每 STEP_EVERY 层升一档 tier：小怪 +1（上限 7）；tier ≥ 1 一半换成更硬的黑勇士、tier ≥ 2 全换；
 *     tier ≥ 3 起每档再 +1 血、移速 +8%
 *   - 地貌按层轮换：草原 / 地牢 / 深空
 */
export function floorPlan(floor) {
  const tier = Math.floor((floor - 1) / STEP_EVERY);
  const guardian = floor % GUARDIAN_EVERY === 0;
  const slimes = Math.min(2 + tier, 7);
  const extra = Math.max(0, tier - 2);
  return {
    floor,
    tier,
    guardian,
    palette: PALETTES[(floor - 1) % PALETTES.length],
    runes: guardian ? 0 : (floor <= 2 ? 2 : 3),  // 计入通关的塔符文
    healRunes: guardian ? 1 : 0,
    slimes: guardian ? Math.max(1, slimes - 2) : slimes,
    crimson: tier >= 2 ? 1 : tier >= 1 ? 0.5 : 0, // 黑勇士占比
    bonusHp: extra,
    speedMul: 1 + extra * 0.08,
  };
}

/** 守层者层之后是休息平台（篝火可回 1 心） */
export function restAfter(floor) {
  return floor % GUARDIAN_EVERY === 0;
}

/** 爬一次阶梯：守层者层 → 同层的休息平台；其余（含休息平台）→ 下一层 */
export function nextStop({ floor, rest }) {
  if (!rest && restAfter(floor)) return { floor, rest: true };
  return { floor: floor + 1, rest: false };
}

/** 守层者借用哪一章的 BOSS（只在已通关章节里按种子挑；原型与招牌机制原样沿用） */
export function pickGuardianChapter(clearedIds, seed) {
  if (!clearedIds.length) return null;
  const rand = seededRandom((seed ^ 0x5bd1e995) >>> 0);
  return clearedIds[Math.floor(rand() * clearedIds.length)];
}

// ---------- 一次挑战（纯数据） ----------

/** 一次挑战的初始状态；main = 进塔前的主线快照（出塔时原样还原） */
export function newRun({ seed, main, cleared, startBest = 0 }) {
  return {
    active: true,
    seed: seed >>> 0,
    floor: 1,
    rest: false,         // 当前是否在休息平台
    cleared,             // 题源章节：进塔时的快照（挑战中途主线进度不会变）
    used: [],            // 本次挑战已出过的题
    reviewed: [],        // 本次挑战遇到的错题本待复习题（去重）
    correct: 0,
    total: 0,
    startBest,           // 进塔前的个人最佳（结算页判断是否刷新纪录）
    main,                // { hearts }
    floorState: null,    // 当前层：{ assign, towerSlots, solved, shielded, guardianDown, rested }
  };
}

/** 本层是否已通过：休息平台随时可上楼；守层者层 = 守层者被击败；普通层 = 塔符文全部答对 */
export function floorCleared(run) {
  if (!run || !run.floorState) return false;
  if (run.rest) return true;
  const fs = run.floorState;
  if (fs.guardian) return !!fs.guardianDown;
  return fs.towerSlots.every((s) => fs.solved.includes(s));
}

/** 本层符文分配：按槽位顺序依次填入选题结果（错题优先落在第一块塔符文上） */
export function assignSlots(slots, picks) {
  const assign = {};
  slots.forEach((slot, i) => { if (picks[i]) assign[slot] = { ...picks[i] }; });
  return assign;
}

// ---------- 累计战绩（持久化，纯函数） ----------

export function sanitizeTowerStats(x) {
  const t = freshTowerStats();
  if (!x || typeof x !== 'object' || Array.isArray(x)) return t;
  for (const k of Object.keys(t)) {
    if (Number.isInteger(x[k]) && x[k] >= 0) t[k] = x[k];
  }
  if (t.correct > t.answered) t.correct = t.answered;
  return t;
}
export const statsOnStart = (s) => ({ ...s, runs: s.runs + 1, best: Math.max(s.best, 1) });
export const statsOnFloor = (s, floor) => ({ ...s, best: Math.max(s.best, floor) });
export const statsOnAnswer = (s, ok) => ({ ...s, answered: s.answered + 1, correct: s.correct + (ok ? 1 : 0) });

/** 结算摘要（结算页 / 测试接缝共用） */
export function runSummary(run, stats, reason) {
  return {
    reason,              // 'defeat' 爱心归零 | 'leave' 主动离开
    floor: run.floor,
    correct: run.correct,
    total: run.total,
    accuracy: run.total ? Math.round((run.correct / run.total) * 100) : null,
    reviewed: run.reviewed.length,
    best: stats.best,
    newBest: run.floor > run.startBest,
    runs: stats.runs,
  };
}

/** HUD 文案：徽章「试炼塔 第 N 层」+ 目标行（本次正确率 · 本层目标） */
export function towerHud(run) {
  const acc = run.total
    ? `正确率 ${Math.round((run.correct / run.total) * 100)}%（${run.correct}/${run.total}）`
    : '正确率 —';
  const fs = run.floorState;
  let goal;
  if (run.rest) goal = fs && fs.rested ? '已在篝火旁歇过脚，登上阶梯继续' : '休息平台：篝火旁按 E 回 1 心，然后登上阶梯';
  else if (floorCleared(run)) goal = '阶梯已开启，上楼！';
  else if (fs && fs.guardian) goal = '答对 BOSS 符文破盾，击败守层者';
  else {
    const done = fs ? fs.towerSlots.filter((s) => fs.solved.includes(s)).length : 0;
    const need = fs ? fs.towerSlots.length : floorPlan(run.floor).runes;
    goal = `解开本层塔符文 ${done} / ${need}，阶梯即开`;
  }
  return { badge: `试炼塔 第 ${run.floor} 层${run.rest ? ' · 休息平台' : ''}`, objective: `${acc} · ${goal}` };
}

// ============================================================
// 挑战生命周期（读写 G；场景与世界地图调用）
// ============================================================

/** 进塔：快照主线爱心、塔内满心开局、挑战次数 +1 */
export function startRun(seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) {
  G.towerRun = newRun({
    seed,
    main: { hearts: G.hearts },
    cleared: clearedChapterIds(G.progress),
    startBest: G.tower.best,
  });
  G.tower = statsOnStart(G.tower);
  G.hearts = G.maxHearts;
  updateHud();
  return G.towerRun;
}

/**
 * 进入新的一层时给符文选题（同一层场景重建沿用已有分配）。
 * slots = { tower: [..], heal: [..], boss: slot | null }，按 tower → heal → boss 的顺序填题
 */
export function assignFloor(run, slots, now = Date.now()) {
  if (run.floorState) return run.floorState;
  const order = [...slots.tower, ...slots.heal, ...(slots.boss ? [slots.boss] : [])];
  const picks = pickTowerQuestions({
    candidates: towerCandidates(run.cleared),
    stats: G.records.stats,
    used: run.used,
    count: order.length,
    now,
    seed: floorSeed(run.seed, run.floor) ^ 0x1234,
  });
  run.used.push(...picks.map((p) => p.qid));
  run.floorState = {
    assign: assignSlots(order, picks),
    towerSlots: slots.tower.slice(),
    guardian: !!slots.boss,
    solved: [],
    shielded: !!slots.boss,
    guardianDown: false,
    rested: false,
  };
  updateHud();
  return run.floorState;
}

/** 记一次塔内作答（本次正确率 + 复习了几道错题 + 累计战绩） */
export function noteTowerAnswer(run, entry, ok) {
  run.total += 1;
  if (ok) run.correct += 1;
  if (entry && entry.review && !run.reviewed.includes(entry.qid)) run.reviewed.push(entry.qid);
  G.tower = statsOnAnswer(G.tower, ok);
  updateHud();
}

/** 爬阶梯：推进到下一站（休息平台或下一层），刷新个人最佳 */
export function climb(run) {
  const next = nextStop(run);
  run.floor = next.floor;
  run.rest = next.rest;
  run.floorState = null;
  G.tower = statsOnFloor(G.tower, run.floor);
  updateHud();
}

/** 休息平台篝火：每个平台回 1 心（只能歇一次） */
export function restHeal(run) {
  if (!run.floorState || run.floorState.rested) return false;
  run.floorState.rested = true;
  G.hearts = Math.min(G.maxHearts, G.hearts + 1);
  updateHud();
  return true;
}

/** 出塔：还原主线爱心，返回结算摘要（无进行中的挑战返回 null） */
export function endRun(reason) {
  const run = G.towerRun;
  if (!run) return null;
  run.active = false;
  const summary = runSummary(run, G.tower, reason);
  G.hearts = run.main.hearts;
  G.towerRun = null;
  updateHud();
  return summary;
}
