// ============================================================
// 全局游戏状态（单例，跨场景共享；进度通过 core/save.js 持久化）
// 数据驱动的多章结构：G.progress[chapterId] 保存每一章的独立进度，
// 章节配置见 data/chapters.js（64 学时课程 = 第一部 W1-W8 + 第二部 W9-W11）。
// ============================================================

import { CHAPTERS, getChapter } from '../data/chapters.js';

/** 构造一章的初始进度 */
function freshChapterProgress(ch) {
  return {
    shards: 0,
    shardsNeeded: ch.shardsNeeded,
    gateOpen: false,      // 野外 → 本章 BOSS 巢穴 的封印门是否已开
    bossShielded: true,   // BOSS 是否处于护盾状态
    bossDefeated: false,
    done: false,          // 本章通关（击败 BOSS）
    // 章节时间点（存档 v3 起）：首次进入 / 开门 / 通关的时间戳，未知为 null
    enteredAt: null,
    gateOpenedAt: null,
    doneAt: null,
  };
}

function buildAllProgress() {
  const p = {};
  for (const ch of CHAPTERS) p[ch.id] = freshChapterProgress(ch);
  return p;
}

/**
 * 学习记录的空结构（存档 v3 起，见 core/records.js）：
 *   stats   —— 每题汇总 { [qid]: {...} }，永不裁剪
 *   log     —— 原始作答日志（环形，超上限丢最老的）
 *   dropped —— 因上限被裁掉的日志条数
 */
export function freshRecords() {
  return { stats: {}, log: [], dropped: 0 };
}

export const G = {
  hearts: 6,
  maxHearts: 6,
  answered: new Set(),   // 已答对的符文槽 id（符文石已破解）
  qAnswered: new Set(),  // 已答对的题目 id（随机抽题时避开）
  runeRolls: {},         // 符文槽 → 已抽中尚未答对的题目 id（重开同符文不变题）
  secrets: new Set(),    // 已发现的秘藏彩蛋 id（data/secrets.js；不计入通关进度）
  current: 1,            // 玩家当前所在章节 id
  progress: buildAllProgress(),
  startTime: Date.now(),
  observatory: {},       // 观测日志：观测台 id → 完成记录（core/observatory.js，可选小游戏）
  dojo: {},              // 代码训练场：关卡 id → 通关记录 / 个人最佳 / 代码草稿（core/dojoSim.js）
  playMs: 0,             // 有效游玩时长（存档 v3 起预留；计时见 learning-records 后续工单）
  records: freshRecords(), // 学习记录：作答日志 + 每题汇总（core/records.js 维护）
};

export function resetState() {
  G.hearts = 6;
  G.maxHearts = 6;
  G.answered = new Set();
  G.qAnswered = new Set();
  G.runeRolls = {};
  G.secrets = new Set();
  G.current = 1;
  G.progress = buildAllProgress();
  G.startTime = Date.now();
  G.observatory = {};
  G.dojo = {};
  G.playMs = 0;
  G.records = freshRecords();
}

/** 取某章进度（默认当前章） */
export function cp(id = G.current) {
  if (!G.progress[id]) G.progress[id] = freshChapterProgress(getChapter(id));
  return G.progress[id];
}

/** 当前章节的碎片进度（HUD / 各场景通用） */
export function chapterShards(id = G.current) {
  const p = cp(id);
  return { shards: p.shards, needed: p.shardsNeeded };
}

export function addShards(n = 1, id = G.current) {
  cp(id).shards += n;
  updateHud();
}

/** 符文石答对收尾：槽位破解、题目记为已用、清掉抽题记录 */
export function markRuneSolved(slotId, questionId) {
  G.answered.add(slotId);
  G.qAnswered.add(questionId);
  delete G.runeRolls[slotId];
  updateHud();
}

/** 登记一个秘藏彩蛋：首次发现返回 true（并触发写档），重复触碰返回 false */
export function discoverSecret(id) {
  if (G.secrets.has(id)) return false;
  G.secrets.add(id);
  updateHud();
  return true;
}

export function damageHearts(n = 1) {
  G.hearts = Math.max(1, G.hearts - n); // 答题失误最多扣到 1，不会答死
  updateHud();
}

export function healHearts(n = 1) {
  G.hearts = Math.min(G.maxHearts, G.hearts + n);
  updateHud();
}

export function updateHud() {
  document.dispatchEvent(new CustomEvent('pyquest:hud'));
}

// ------------------------------------------------------------
// 传送门 / 封印门的解锁条件解析
// requires 形如 { ch: 1, flag: 'done' } → G.progress[1].done
// ------------------------------------------------------------
export function meetsRequires(req) {
  if (!req) return true;
  if (typeof req === 'function') return !!req(G);
  const p = cp(req.ch);
  return !!p[req.flag];
}

/** 玩家进度可推进到的最新章节（用于标题「继续冒险」落点） */
export function furthestChapter() {
  let n = 1;
  for (const ch of CHAPTERS) {
    if (cp(ch.id).done) n = Math.min(CHAPTERS.length, ch.id + 1);
  }
  // 若第一章都没通关，落在第一章
  return cp(1).done ? n : 1;
}
