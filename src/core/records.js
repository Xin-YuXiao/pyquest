// ============================================================
// 学习记录：每次作答的原始日志 + 每题汇总（存档 v3 起随存档持久化）
// - recordAttempt / recordSkip：答题面板在「确认」/「取消」时把作答事实交过来
//   （答题面板只负责计时与发事实，不懂存储）
// - 每条记录带上当时的章 / 题池 / tier 快照：题库日后重组（如 W4-W8 扩题），
//   旧记录的统计口径依然正确
// - 汇总 stats 永不裁剪；原始日志 log 上限 LOG_CAP 条，超限丢最老的（dropped 累加）
// - 复习作答（kind = 'review'）只写日志与汇总里的复习状态 rv，不改主线汇总
// - 试炼塔作答（kind = 'tower'）：汇总 tw 计次；错题本里的题按复习同一规则推进掌握连击（rv）；
//   不在错题本里的题在塔里答错 = 记一次主线答错（入错题本）——塔是真实的提取练习
// - 只存本机（随 localStorage 存档），不发任何网络请求
// 纯函数 applyAttempt / applyReview 不碰 G（供 smoke 校验）；
// 薄包装 recordAttempt / recordSkip 写 G.records 并通知自动存档。
// ============================================================
import { G } from './state.js';
import { CHAPTERS } from '../data/chapters.js';
import { QUESTIONS, POOLS, SLOT_POOL } from '../data/quizBank.js';

export const LOG_CAP = 3000;                 // 原始日志上限（单条约 120 字节）
export const ATTEMPT_MS_CAP = 30 * 60 * 1000; // 单次作答用时上限（挂机不污染统计）
export const MASTERY_STREAK = 2;             // 复习连续答对几次算「已掌握」（mistake-review 推荐值）
export const OK = { RIGHT: 1, WRONG: 0, SKIP: -1 };

// 题池 → 章 id（按章节注册表的 pools 映射）；题 id → 首个包含它的题池
const POOL_CHAPTER = {};
for (const ch of CHAPTERS) {
  for (const pool of Object.values(ch.pools || {})) if (!(pool in POOL_CHAPTER)) POOL_CHAPTER[pool] = ch.id;
}
const QUESTION_POOL = {};
for (const [pool, ids] of Object.entries(POOLS)) {
  for (const id of ids) if (!(id in QUESTION_POOL)) QUESTION_POOL[id] = pool;
}

/** 作答时的题库快照：章 / 题池 / tier（符文槽优先按槽位映射取池） */
export function snapshotOf(qid, slot) {
  const pool = (slot && SLOT_POOL[slot]) || QUESTION_POOL[qid] || null;
  const q = QUESTIONS[qid];
  return {
    ch: pool && pool in POOL_CHAPTER ? POOL_CHAPTER[pool] : null,
    pool,
    tier: q ? q.tier : null,
  };
}

function freshStat() {
  return {
    n: 0,          // 主线提交次数（不含放弃）
    w: 0,          // 主线答错次数
    sk: 0,         // 放弃次数（打开面板未作答即关闭）
    first: null,   // 首次作答 'c' 对 / 'w' 错
    firstAt: null,
    lastAt: null,
    lastOk: null,
    solvedAt: null, // 首次答对时间（只写一次）
    ch: null, pool: null, tier: null, k: null, // 最近一次主线作答的快照与符文类型
    rv: null,      // 复习状态 { n, ok, streak, mastered, at }（首次复习时创建）
    tw: null,      // 试炼塔作答 { n, ok, at }（首次在塔里作答时创建）
  };
}

/** 复习状态转换：答对连续计数 +1，达到阈值即「已掌握」；答错清零并退回待复习 */
export function applyReview(rv, ok, t) {
  const r = rv ? { ...rv } : { n: 0, ok: 0, streak: 0, mastered: false, at: null };
  r.n += 1;
  r.at = t;
  if (ok) {
    r.ok += 1;
    r.streak += 1;
    if (r.streak >= MASTERY_STREAK) r.mastered = true;
  } else {
    r.streak = 0;
    r.mastered = false;
  }
  return r;
}

/**
 * 纯函数：把一条作答 e 记进 records（就地修改并返回日志条目）。
 * e = { t, q, s, k, ch, pool, tier, pick, ok, ms }，ok: 1 对 / 0 错 / -1 放弃
 * 日志条目额外带 a：主线 = 该题第几次提交；复习 = 第几次复习；放弃 = 0
 */
export function applyAttempt(records, e, cap = LOG_CAP) {
  const st = records.stats[e.q] || (records.stats[e.q] = freshStat());
  let a = 0;
  if (e.ok === OK.SKIP) {
    st.sk += 1;
  } else if (e.k === 'review') {
    st.rv = applyReview(st.rv, e.ok === OK.RIGHT, e.t);
    a = st.rv.n;
  } else if (e.k === 'tower') {
    const right = e.ok === OK.RIGHT;
    const tw = st.tw || { n: 0, ok: 0, at: null };
    st.tw = { n: tw.n + 1, ok: tw.ok + (right ? 1 : 0), at: e.t };
    a = st.tw.n;
    if (st.w > 0) {
      st.rv = applyReview(st.rv, right, e.t); // 错题本里的题：与错题本复习同一掌握规则
    } else if (!right) {
      // 塔里第一次答错：按主线答错入错题本（快照取本次作答）
      st.n += 1;
      st.w += 1;
      if (st.first === null) { st.first = 'w'; st.firstAt = e.t; }
      st.lastAt = e.t;
      st.lastOk = false;
      st.ch = e.ch; st.pool = e.pool; st.tier = e.tier; st.k = e.k;
    }
  } else {
    st.n += 1;
    a = st.n;
    if (e.ok !== OK.RIGHT) st.w += 1;
    if (st.first === null) { st.first = e.ok === OK.RIGHT ? 'c' : 'w'; st.firstAt = e.t; }
    st.lastAt = e.t;
    st.lastOk = e.ok === OK.RIGHT;
    if (e.ok === OK.RIGHT && st.solvedAt === null) st.solvedAt = e.t;
    st.ch = e.ch; st.pool = e.pool; st.tier = e.tier; st.k = e.k;
  }
  const entry = { ...e, a };
  records.log.push(entry);
  if (records.log.length > cap) {
    const over = records.log.length - cap;
    records.log.splice(0, over);
    records.dropped = (records.dropped || 0) + over;
  }
  return entry;
}

const clampMs = (ms) => Math.min(ATTEMPT_MS_CAP, Math.max(0, Math.round(Number(ms) || 0)));

function notify() {
  if (typeof document !== 'undefined' && document.dispatchEvent) {
    document.dispatchEvent(new CustomEvent('pyquest:records'));
  }
}

/** 记一次提交作答（答题面板「确认」时调用）。kind: shard / heal / boss / review / tower / trial（秘境课题符文） */
export function recordAttempt({ qid, slot = '', kind, pick, ok, ms }) {
  const e = {
    t: Date.now(), q: qid, s: slot || '', k: kind, ...snapshotOf(qid, slot),
    pick, ok: ok ? OK.RIGHT : OK.WRONG, ms: clampMs(ms),
  };
  const entry = applyAttempt(G.records, e);
  notify();
  return entry;
}

/** 记一次放弃（打开面板后一次都没提交就关闭） */
export function recordSkip({ qid, slot = '', kind, ms }) {
  const e = {
    t: Date.now(), q: qid, s: slot || '', k: kind, ...snapshotOf(qid, slot),
    pick: -1, ok: OK.SKIP, ms: clampMs(ms),
  };
  const entry = applyAttempt(G.records, e);
  notify();
  return entry;
}

/** 只读汇总查询（错题本 / 学习报告使用） */
export const statsOf = (qid) => G.records.stats[qid] || null;
export const allStats = () => G.records.stats;
