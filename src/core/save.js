// ============================================================
// 存档系统：localStorage 持久化冒险进度 + 学习记录（数据驱动多章结构）
// - v3（当前）：v2 全部字段 + 学习记录 records + 有效游玩时长 playMs
//   + 各章时间点 enteredAt / gateOpenedAt / doneAt
// - 迁移链 v1 → v2 → v3 逐级纯函数升级；首次成功写入 v3 后才删除旧键
// - 分层：序列化（G → 存档对象）/ 迁移（旧版本 → v3）/ 校验（问题列表）/
//   水合（存档对象 → G）四个纯函数 + 一层薄的 localStorage 读写
// - saveGame()：HUD / 学习记录变化、关页、切后台时自动写档
// ============================================================
import { G, resetState, freshRecords } from './state.js';
import { CHAPTERS } from '../data/chapters.js';

export const SAVE_VERSION = 3;
export const SAVE_KEY = 'pyquest:save:v3';
// 旧版本键：读档时按 v3 → v2 → v1 顺序找
export const LEGACY_KEYS = ['pyquest:save:v2', 'pyquest:save:v1'];
const ALL_KEYS = [SAVE_KEY, ...LEGACY_KEYS];
// 读不出来的存档原样挪到这里（不随清档删除），留给人工抢救
export const BROKEN_KEY = 'pyquest:save:broken';

const PROGRESS_TIMES = ['enteredAt', 'gateOpenedAt', 'doneAt'];

// ---------- 纯函数：序列化（G → v3 存档对象） ----------
export function serialize(g, now = Date.now()) {
  const progress = {};
  for (const [id, p] of Object.entries(g.progress)) {
    progress[id] = {
      shards: p.shards,
      shardsNeeded: p.shardsNeeded,
      gateOpen: p.gateOpen,
      bossShielded: p.bossShielded,
      bossDefeated: p.bossDefeated,
      done: p.done,
      enteredAt: p.enteredAt ?? null,
      gateOpenedAt: p.gateOpenedAt ?? null,
      doneAt: p.doneAt ?? null,
    };
  }
  const r = g.records || freshRecords();
  return {
    v: SAVE_VERSION,
    savedAt: now,
    startTime: g.startTime,
    playMs: g.playMs || 0,
    hearts: g.hearts,
    maxHearts: g.maxHearts,
    current: g.current,
    answered: [...g.answered],
    qAnswered: [...g.qAnswered],
    runeRolls: { ...g.runeRolls },
    progress,
    records: {
      stats: JSON.parse(JSON.stringify(r.stats)),
      log: r.log.slice(),
      dropped: r.dropped || 0,
    },
  };
}

// ---------- 纯函数：迁移（任意旧版本 → v3） ----------

/** v1（两章时代的扁平字段）→ v2 多章结构 */
function v1ToV2(d) {
  return {
    v: 2,
    savedAt: d.savedAt,
    startTime: d.startTime,
    hearts: d.hearts ?? 6,
    maxHearts: d.maxHearts ?? 6,
    current: d.ch1Done && !d.ch2Done ? 2 : 1,
    answered: d.answered || [],
    qAnswered: d.qAnswered || [],
    runeRolls: d.runeRolls || {},
    progress: {
      1: {
        shards: d.shards ?? 0,
        gateOpen: !!d.gateOpen,
        bossShielded: d.bossShielded !== false,
        bossDefeated: !!d.bossDefeated,
        done: !!d.ch1Done,
      },
      2: {
        shards: d.ch2Shards ?? 0,
        gateOpen: !!d.ch2GateOpen,
        bossShielded: d.boss2Shielded !== false,
        bossDefeated: !!d.ch2Done,
        done: !!d.ch2Done,
      },
    },
  };
}

/** v2 → v3：进度原样保留；学习记录从空开始，章节时间点标为未知（null） */
function v2ToV3(d) {
  const progress = {};
  for (const [id, p] of Object.entries(d.progress || {})) {
    progress[id] = { ...p, enteredAt: null, gateOpenedAt: null, doneAt: null };
  }
  return { ...d, v: 3, playMs: 0, progress, records: freshRecords() };
}

/** 任意版本的存档对象 → v3；不认识的输入返回 null（不抛异常） */
export function migrate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  let cur = d;
  if (cur.v === 1) cur = v1ToV2(cur);
  if (cur.v === 2) cur = v2ToV3(cur);
  return cur.v === SAVE_VERSION ? cur : null;
}

/** 原始字符串 → v3 存档对象；非法 JSON / 未知版本返回 null */
export function parseSave(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try { return migrate(JSON.parse(raw)); } catch { return null; }
}

// ---------- 纯函数：校验（返回问题列表，空数组 = 结构完好） ----------
const isInt = (x) => Number.isInteger(x);
const isStrArr = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string');
const isPlainObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export function validate(d) {
  const problems = [];
  if (!isPlainObj(d)) return ['存档不是对象'];
  if (d.v !== SAVE_VERSION) problems.push(`版本号 ${d.v} 不是 ${SAVE_VERSION}`);
  if (!isInt(d.hearts) || d.hearts < 0) problems.push('hearts 不是非负整数');
  if (!isInt(d.maxHearts) || d.maxHearts < 1) problems.push('maxHearts 不是正整数');
  if (!isInt(d.current) || d.current < 1 || d.current > CHAPTERS.length) problems.push('current 章节号越界');
  if (!isStrArr(d.answered)) problems.push('answered 不是字符串数组');
  if (!isStrArr(d.qAnswered)) problems.push('qAnswered 不是字符串数组');
  if (!isPlainObj(d.runeRolls) || !Object.values(d.runeRolls).every((s) => typeof s === 'string')) {
    problems.push('runeRolls 不是「槽位 → 题 id」映射');
  }
  if (!isPlainObj(d.progress)) problems.push('progress 不是对象');
  else {
    for (const [id, p] of Object.entries(d.progress)) {
      if (!isPlainObj(p)) { problems.push(`progress[${id}] 不是对象`); continue; }
      if (!isInt(p.shards) || p.shards < 0) problems.push(`progress[${id}].shards 不是非负整数`);
      for (const f of ['gateOpen', 'bossShielded', 'bossDefeated', 'done']) {
        if (typeof p[f] !== 'boolean') problems.push(`progress[${id}].${f} 不是布尔值`);
      }
      for (const f of PROGRESS_TIMES) {
        if (p[f] !== null && typeof p[f] !== 'number') problems.push(`progress[${id}].${f} 不是时间戳或 null`);
      }
    }
  }
  if (typeof d.playMs !== 'number' || d.playMs < 0) problems.push('playMs 不是非负数');
  const r = d.records;
  if (!isPlainObj(r)) problems.push('records 不是对象');
  else {
    if (!isPlainObj(r.stats)) problems.push('records.stats 不是对象');
    if (!Array.isArray(r.log)) problems.push('records.log 不是数组');
    if (typeof r.dropped !== 'number' || r.dropped < 0) problems.push('records.dropped 不是非负数');
  }
  return problems;
}

// ---------- 纯函数：水合（v3 存档对象 → G；缺字段按初始值补齐） ----------
function sanitizeRecords(r) {
  if (!isPlainObj(r)) return freshRecords();
  return {
    stats: isPlainObj(r.stats) ? r.stats : {},
    log: Array.isArray(r.log) ? r.log.filter(isPlainObj) : [],
    dropped: typeof r.dropped === 'number' && r.dropped >= 0 ? r.dropped : 0,
  };
}

/** 把 v3 存档对象写进状态对象 g（调用方先 resetState，未出现的章保持初始进度） */
export function hydrate(g, d) {
  g.startTime = d.startTime || Date.now();
  g.playMs = typeof d.playMs === 'number' && d.playMs > 0 ? d.playMs : 0;
  g.hearts = d.hearts ?? 6;
  g.maxHearts = d.maxHearts ?? 6;
  g.current = Math.min(Math.max(d.current || 1, 1), CHAPTERS.length);
  g.answered = new Set(Array.isArray(d.answered) ? d.answered : []);
  g.qAnswered = new Set(Array.isArray(d.qAnswered) ? d.qAnswered : []);
  g.runeRolls = isPlainObj(d.runeRolls) ? { ...d.runeRolls } : {};
  // 逐章恢复进度（缺省字段按初始值补齐）
  for (const ch of CHAPTERS) {
    const saved = d.progress && d.progress[ch.id];
    const p = g.progress[ch.id];
    if (!saved || !p) continue;
    p.shards = saved.shards ?? 0;
    p.shardsNeeded = ch.shardsNeeded;
    p.gateOpen = !!saved.gateOpen;
    p.bossShielded = saved.bossShielded !== false;
    p.bossDefeated = !!saved.bossDefeated;
    p.done = !!saved.done;
    for (const f of PROGRESS_TIMES) p[f] = typeof saved[f] === 'number' ? saved[f] : null;
  }
  g.records = sanitizeRecords(d.records);
  return g;
}

// ---------- 读写层（storage 可注入：smoke 用假存储模拟配额异常 / 不可用） ----------

/** 按 v3 → v2 → v1 找第一份读得出来的存档；读不出来的原样挪去 BROKEN_KEY 后继续找 */
export function readSave(storage) {
  if (!storage) return null;
  for (const key of ALL_KEYS) {
    let raw;
    try { raw = storage.getItem(key); } catch { return null; }
    if (!raw) continue;
    const data = parseSave(raw);
    if (data) return { key, data };
    try { storage.setItem(BROKEN_KEY, raw); } catch { /* 抢救失败也不影响游戏 */ }
  }
  return null;
}

/**
 * 写入 v3 存档，配额不足时逐级降级：完整 → 日志砍半 → 不含日志；
 * 游戏进度字段在任何一级都完整保留。成功后删除旧版本键。
 * 返回实际写入的级别 'full' | 'half' | 'nolog'，全部失败返回 null；
 * 降级时同时返回实际写入的 records，便于调用方让内存与存档保持一致。
 */
export function writeSave(storage, obj) {
  if (!storage) return null;
  const log = obj.records.log;
  const keep = Math.floor(log.length / 2);
  const tries = [
    ['full', obj.records],
    ['half', { ...obj.records, log: log.slice(log.length - keep), dropped: obj.records.dropped + (log.length - keep) }],
    ['nolog', { ...obj.records, log: [], dropped: obj.records.dropped + log.length }],
  ];
  for (const [level, records] of tries) {
    try {
      storage.setItem(SAVE_KEY, JSON.stringify({ ...obj, records }));
    } catch {
      continue;
    }
    for (const k of LEGACY_KEYS) { try { storage.removeItem(k); } catch { /* noop */ } }
    return { level, records };
  }
  return null;
}

function store() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

// ---------- 对外接口 ----------

export function hasSave() {
  const s = store();
  if (!s) return false;
  try { return ALL_KEYS.some((k) => !!s.getItem(k)); } catch { return false; }
}

// 自动存档只在玩家真正开始冒险（新的冒险 / 继续冒险）之后生效。
// 标题画面时 G 还是空白初始状态：若此刻刷新 / 关页 / 切后台触发写档，
// 会用空进度覆盖玩家的真实存档（v2 时代即存在的隐患）。
let armed = false;
export function armAutosave() { armed = true; }

export function saveGame() {
  if (!armed) return;
  const res = writeSave(store(), serialize(G));
  // 配额降级时让内存记录与存档一致，避免每次写档都重复降级
  if (res && res.level !== 'full') G.records = res.records;
}

/** 读取存档并应用到 G。成功返回 true，无档/损坏返回 false（损坏原文已挪去 BROKEN_KEY） */
export function loadGame() {
  const found = readSave(store());
  if (!found) return false;
  resetState();
  hydrate(G, found.data);
  return true;
}

/** 清档：删除全部版本的存档键（学习记录随存档一起清除；BROKEN_KEY 保留） */
export function clearSave() {
  const s = store();
  if (!s) return;
  for (const k of ALL_KEYS) { try { s.removeItem(k); } catch { /* noop */ } }
}

/** 只读探测存档进度（不应用到 G）：返回玩家可推进到的最新章节号 */
export function saveChapter() {
  const found = readSave(store());
  if (!found) return 1;
  const progress = found.data.progress || {};
  let n = 1;
  for (const ch of CHAPTERS) {
    if (progress[ch.id] && progress[ch.id].done) n = Math.min(CHAPTERS.length, ch.id + 1);
  }
  return progress[1] && progress[1].done ? n : 1;
}

/** 绑定自动存档：HUD 数据变化（碎片/爱心/开门等）与学习记录变化都自动写档 */
export function initAutosave() {
  document.addEventListener('pyquest:hud', saveGame);
  document.addEventListener('pyquest:records', saveGame);
  // 关页/切后台时兜底保存
  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGame();
  });
}
