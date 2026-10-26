// ============================================================
// 第三章小游戏（试炼场）· 进度规则（纯函数，入参是状态对象 g，不依赖 Phaser / DOM，smoke 可直接导入）
// 进度存在 g.games（存档 v3 的可选字段 games）：
//   { [gameId]: { levels: { [levelId]: { at, best } }, doneAt, data } }
//   levels  已通过的关卡：首次通关时间 at、个人最佳 best（越小越好的分数，如施法次数；没有则 null）
//   doneAt  核心关（非挑战关）全部通过的时间——试炼场完成，发一枚碎片 / 破 BOSS 护盾
//   data    小游戏自己的持久数据（如阵列牌局的牌组），结构由各小游戏定义，读档时只保证是对象
// 解锁规则：核心关按顺序一关一关开；挑战关在核心关全部通过后开放。
// ============================================================
import { GAMES, getGame } from '../games/registry.js';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** 某小游戏的进度（未开始返回初始值，不写回 g） */
export function gameState(g, id) {
  const s = g.games && g.games[id];
  return s || { levels: {}, doneAt: null, data: {} };
}

const coreLevels = (meta) => meta.levels.filter((l) => !l.challenge);

export const levelDone = (g, id, levelId) => !!gameState(g, id).levels[levelId];

/** 核心关是否全部通过 */
export function gameComplete(g, id) {
  const meta = getGame(id);
  if (!meta || !meta.levels.length) return false;
  return coreLevels(meta).every((l) => levelDone(g, id, l.id));
}

/** 关卡是否已解锁：核心关要求前面的核心关都已通过；挑战关要求核心关全部通过 */
export function levelUnlocked(g, id, levelId) {
  const meta = getGame(id);
  if (!meta) return false;
  const lv = meta.levels.find((l) => l.id === levelId);
  if (!lv) return false;
  if (lv.challenge) return gameComplete(g, id);
  for (const l of coreLevels(meta)) {
    if (l.id === levelId) return true;
    if (!levelDone(g, id, l.id)) return false;
  }
  return false;
}

/** 下一个该玩的关卡（第一个未通过且已解锁的；全部通过返回最后一关） */
export function nextLevel(g, id) {
  const meta = getGame(id);
  if (!meta || !meta.levels.length) return null;
  const open = meta.levels.find((l) => !levelDone(g, id, l.id) && levelUnlocked(g, id, l.id));
  return (open || meta.levels[meta.levels.length - 1]).id;
}

/**
 * 记一次通关。score：越小越好的分数（施法次数等），没有传 null。
 * 返回 { first: 首次通过本关, best: 是否刷新个人最佳, completed: 这一关让试炼场首次完成, challenge }
 * 未解锁 / 未登记的关卡返回 null，不改状态。
 */
export function markLevel(g, id, levelId, score = null, now = Date.now()) {
  const meta = getGame(id);
  const lv = meta && meta.levels.find((l) => l.id === levelId);
  if (!lv || !levelUnlocked(g, id, levelId)) return null;
  if (!g.games) g.games = {};
  const s = gameState(g, id);
  const prev = s.levels[levelId];
  const wasComplete = !!s.doneAt;
  const rec = prev ? { ...prev } : { at: now, best: null };
  let best = false;
  if (typeof score === 'number' && Number.isFinite(score) && (rec.best === null || score < rec.best)) {
    rec.best = score;
    best = true;
  }
  const next = { levels: { ...s.levels, [levelId]: rec }, doneAt: s.doneAt, data: s.data || {} };
  g.games[id] = next;
  let completed = false;
  if (!wasComplete && gameComplete(g, id)) {
    next.doneAt = now;
    completed = true;
  }
  return { first: !prev, best, completed, challenge: !!lv.challenge };
}

/** 读写小游戏自己的持久数据（如牌组） */
export function gameData(g, id) {
  return gameState(g, id).data || {};
}
export function setGameData(g, id, data) {
  if (!g.games) g.games = {};
  const s = gameState(g, id);
  g.games[id] = { levels: { ...s.levels }, doneAt: s.doneAt, data: isObj(data) ? data : {} };
}

/** 已完成的试炼场数 */
export function completedCount(g, ids = Object.keys(GAMES)) {
  return ids.filter((id) => !!gameState(g, id).doneAt).length;
}

/** 读档清洗：只保留登记过的小游戏与关卡；时间戳 / 分数类型不对的丢掉；doneAt 以「核心关是否齐」为准重算 */
export function sanitizeGames(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, s] of Object.entries(raw)) {
    const meta = getGame(id);
    if (!meta || !isObj(s)) continue;
    const levels = {};
    const known = new Set(meta.levels.map((l) => l.id));
    if (isObj(s.levels)) {
      for (const [lid, rec] of Object.entries(s.levels)) {
        if (!known.has(lid) || !isObj(rec)) continue;
        levels[lid] = {
          at: typeof rec.at === 'number' ? rec.at : null,
          best: typeof rec.best === 'number' && Number.isFinite(rec.best) ? rec.best : null,
        };
      }
    }
    const entry = { levels, doneAt: null, data: isObj(s.data) ? s.data : {} };
    out[id] = entry;
    if (gameComplete({ games: out }, id)) entry.doneAt = typeof s.doneAt === 'number' ? s.doneAt : Date.now();
  }
  return out;
}
