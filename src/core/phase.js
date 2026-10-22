// ============================================================
// 章内阶段（Phase）：玩家在某一章内推进状态的单一推断来源
// （GLOSSARY.md「章内阶段（Phase）」）。原先散落在章节 NPC 对话、
// HUD 目标提示、世界地图节点状态里的进度 if-梯子全部收拢到这里。
//
// 五阶段（只读本章进度，不读跨章状态；G 与存档结构不变）：
//   new        新来（本章进度为零）
//   collecting 收集碎片（有进度但未集齐）
//   ready      集齐未开门（碎片达标，封印门还没开）
//   open       门开未通关（gateOpen 但还没击败 BOSS）
//   done       已通关
// ============================================================
import { cp } from './state.js';

export const PHASE = {
  NEW: 'new',
  COLLECTING: 'collecting',
  READY: 'ready',
  OPEN: 'open',
  DONE: 'done',
};

/** 玩家在指定章节所处的阶段 */
export function phaseOf(id) {
  const p = cp(id);
  if (p.done) return PHASE.DONE;
  if (p.gateOpen) return PHASE.OPEN;
  if (p.shards >= p.shardsNeeded) return PHASE.READY;
  if (p.shards > 0) return PHASE.COLLECTING;
  return PHASE.NEW;
}

// ------------------------------------------------------------
// 阶段驱动的 NPC 台词选择（数据表在 data/chapters.js 的 npcLines）
//
// 章节字段约定：
//   npcLines   {[阶段]: 台词[] | ({ cp, G, ch }) => 台词[]}
//              静态文案直接写字符串数组；含 ${cp.shards} 等动态
//              数字的词条写成取台词的函数
//   extraGreets (G) => 台词[] | null
//              跨章问候 / 全通关彩蛋等塞不进 Phase 的台词，
//              优先于阶段表（返回 null 则走阶段表）
//   npc        (phase, G) => 台词[]
//              逃生舱：个别复杂章节完全自管台词
// 阶段表缺 open 词条时回退到 collecting：ready 台词条款
// （「碎片集齐」播报）以门未开为前提，门开后石碑沿用收集进度
// 台词——与原 if-梯子的行为一致。
// ------------------------------------------------------------
const PHASE_FALLBACK = { [PHASE.OPEN]: PHASE.COLLECTING };

export function npcLinesFor(ch, G) {
  if (typeof ch.npc === 'function') return ch.npc(phaseOf(ch.id), G);
  if (ch.extraGreets) {
    const extra = ch.extraGreets(G);
    if (extra) return extra;
  }
  const table = ch.npcLines || {};
  let phase = phaseOf(ch.id);
  let entry = table[phase];
  while (entry === undefined && PHASE_FALLBACK[phase]) {
    phase = PHASE_FALLBACK[phase];
    entry = table[phase];
  }
  if (entry === undefined) entry = table[PHASE.NEW] || [];
  return typeof entry === 'function' ? entry({ cp: cp(ch.id), G, ch }) : entry;
}
