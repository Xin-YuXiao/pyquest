// ============================================================
// Project 秘境 · 进度规则（纯函数，入参是状态对象 g，不依赖 Phaser / DOM，smoke 可直接导入）
// 进度存在 g.realms（存档 v3 的可选字段 realms）：{ [秘境 id]: { steps, done, doneAt } }
//   steps  已解开的课题步数 0..6（第 6 步「报告」= 圣所里的 BOSS 符文，解开即破盾）
//   done   已击败秘境 BOSS（课题封印、获得徽章）
//   doneAt 首次封印时间戳
// 与章节进度完全分开：不写 G.progress / G.answered / G.qAnswered，主线统计不受影响。
// ============================================================
import { REALMS, REALM_STEPS, getRealm, realmsUnlocked } from '../data/realms.js';

export const STEP_COUNT = REALM_STEPS.length;
/** 外庭的课题符文数（第 6 步在圣所） */
export const FIELD_STEPS = STEP_COUNT - 1;

const fresh = () => ({ steps: 0, done: false, doneAt: null });

/** 某秘境的进度（未开始返回初始值，不写回 g） */
export function realmState(g, id) {
  const s = g.realms && g.realms[id];
  return s ? s : fresh();
}

/** 第 i 步（0 起）的状态：solved 已解 / next 当前可解 / locked 封印中 */
export function stepState(g, id, i) {
  const { steps } = realmState(g, id);
  if (i < steps) return 'solved';
  return i === steps ? 'next' : 'locked';
}

/** 解开第 i 步：只接受「当前可解」的那一步（越级返回 false，不改状态） */
export function solveRealmStep(g, id, i) {
  if (!getRealm(id) || stepState(g, id, i) !== 'next') return false;
  if (!g.realms) g.realms = {};
  const s = { ...realmState(g, id) };
  s.steps = i + 1;
  g.realms[id] = s;
  return true;
}

/** 击败秘境 BOSS：课题封印（需六步全解；首次封印记时间） */
export function sealRealm(g, id, now = Date.now()) {
  const s = realmState(g, id);
  if (!getRealm(id) || s.steps < STEP_COUNT) return false;
  if (!g.realms) g.realms = {};
  g.realms[id] = { ...s, done: true, doneAt: s.doneAt || now };
  return true;
}

/** 已获得的课题徽章数 */
export function badgeCount(g) {
  return REALMS.filter((r) => realmState(g, r.id).done).length;
}

/** 秘境 BOSS 是否仍有护盾：第 6 步「报告」答对前都有 */
export function realmBossShielded(g, id) {
  return realmState(g, id).steps < STEP_COUNT;
}

/** 读档清洗：只保留已登记的秘境、steps 夹到 0..6、done 需六步全解；坏数据丢弃不抛错 */
export function sanitizeRealms(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const r of REALMS) {
    const s = raw[r.id];
    if (!s || typeof s !== 'object') continue;
    const steps = Number.isInteger(s.steps) ? Math.min(STEP_COUNT, Math.max(0, s.steps)) : 0;
    const done = s.done === true && steps === STEP_COUNT;
    if (!steps && !done) continue;
    out[r.id] = { steps, done, doneAt: done && typeof s.doneAt === 'number' ? s.doneAt : null };
  }
  return out;
}

/**
 * HUD 文案：在秘境里时返回 { pill, objective }，不在秘境返回 null。
 * where：'hall'（秘境大厅）或秘境 id；lairName / bossName 取自秘境配置
 */
export function realmHud(g, where) {
  if (!where) return null;
  if (where === 'hall') {
    const n = badgeCount(g);
    return {
      pill: `徽章 ${n} / ${REALMS.length}`,
      objective: n === REALMS.length ? '四枚课题徽章全部集齐！' : '走进一扇课题之门，完成一个 Project 的六步课题链',
    };
  }
  const realm = getRealm(where);
  if (!realm) return null;
  const s = realmState(g, where);
  let objective;
  if (s.done) objective = `课题已封印 ✦ 从西侧的门返回秘境大厅`;
  else if (s.steps < FIELD_STEPS) objective = `按顺序解开课题符文：第 ${s.steps + 1} 步「${REALM_STEPS[s.steps]}」`;
  else if (s.steps === FIELD_STEPS) objective = `前往${realm.lairName}，向${realm.bossName}「报告」`;
  else objective = `击败${realm.bossName}，封印本课题！`;
  return { pill: `课题 ${s.steps} / ${STEP_COUNT}`, objective };
}

export { realmsUnlocked };
