// ============================================================
// 阵列牌局 · 贪心自动打法（纯函数）：verify-game-cards.mjs 用它证明每关「用基础牌组能在 par 回合内打赢」
// 每一步枚举手牌里所有「选择器 × 操作」组合（含不配选择器的整体运算；自由咒语枚举一组候选下标），
// 在作用域副本上预览，按「造成的伤害 + 击倒加成（越凶的敌人加成越高）/ 费用」挑最好的打；
// 打不出有价值的咒语时，若敌人本回合要打人就用格挡，然后结束回合。
// ============================================================
import { getCard } from './cards.js';
import { preview, cast, useSkill, endTurn, hpValues, atkValues, intents } from './battle.js';

/** 自由咒语的候选下标（按阵型生成：单个、负下标、切片、步长、掩膜；二维再加行 / 列 / 块） */
export function freeCandidates(st) {
  const out = new Set();
  const hp = hpValues(st);
  const vals = [...new Set(hp.filter((v) => v > 0))];
  const atk = [...new Set(atkValues(st))];
  if (st.ndim === 1) {
    const n = hp.length;
    for (let i = 0; i < n; i++) { out.add(String(i)); out.add(String(i - n)); }
    for (let a = 0; a < n; a++) for (let b = a + 2; b <= n; b++) out.add(`${a}:${b}`);
    out.add('::2'); out.add('1::2'); out.add('::3');
  } else {
    const [R, C] = st.shape;
    for (let r = 0; r < R; r++) out.add(String(r));
    for (let c = 0; c < C; c++) out.add(`:, ${c}`);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) out.add(`${r}, ${c}`);
    for (let r0 = 0; r0 < R; r0++) for (let r1 = r0 + 1; r1 <= R; r1++) {
      for (let c0 = 0; c0 < C; c0++) for (let c1 = c0 + 1; c1 <= C; c1++) out.add(`${r0}:${r1}, ${c0}:${c1}`);
    }
  }
  vals.forEach((v) => { out.add(`hp >= ${v}`); out.add(`hp <= ${v}`); });
  atk.filter((v) => v > 0).forEach((v) => out.add(`atk >= ${v}`));
  out.add('hp > 0');
  return [...out];
}

function playValue(st, p) {
  const atk = atkValues(st);
  const acts = intents(st);
  let v = 0;
  for (const h of p.hits) {
    const dmg = h.before - h.after;
    const act = acts[h.i];
    const threat = (atk[h.i] || 0) + (act && act.t !== 'a' && act.t !== 'w' ? 4 : 0);
    v += dmg;
    if (h.after === 0) v += 6 + 2 * threat;
  }
  return v / Math.max(1, p.cost);
}

/** 当前手牌里最好的一手（没有值得打的返回 null） */
export function bestSpell(st) {
  const hand = st.hand;
  const sels = [null, ...hand.filter((c) => getCard(c.id).kind === 'sel')];
  const ops = hand.filter((c) => getCard(c.id).kind === 'op');
  let best = null;
  for (const op of ops) {
    for (const s of sels) {
      const isFree = s && getCard(s.id).free;
      const frees = isFree ? freeCandidates(st) : [''];
      for (const free of frees) {
        const choice = { sel: s ? s.uid : null, op: op.uid, free };
        const p = preview(st, choice);
        if (!p.ok || !p.affordable || !p.aliveHit || !p.hits.length) continue;
        const v = playValue(st, p);
        if (!best || v > best.v) best = { v, choice, p };
      }
    }
  }
  return best;
}

/** 自动打一整回合：返回本回合打出的代码行 */
export function autoTurn(st) {
  const lines = [];
  for (let guard = 0; guard < 20 && !st.over; guard++) {
    // 手牌里有抽牌卡且能量够时先抽（多拿选择 / 操作）
    const drawCard = st.hand.find((c) => getCard(c.id).draw && getCard(c.id).cost < st.player.energy);
    if (drawCard) { useSkill(st, drawCard.uid); lines.push('draw(2)'); continue; }
    const b = bestSpell(st);
    if (b) {
      const r = cast(st, b.choice);
      if (!r.ok) break;
      lines.push(r.line);
      continue;
    }
    const incoming = atkValues(st).reduce((s, v) => s + v, 0);
    const block = st.hand.find((c) => getCard(c.id).block && getCard(c.id).cost <= st.player.energy);
    if (incoming > st.player.block && block) { useSkill(st, block.uid); lines.push(getCard(block.id).code); continue; }
    break;
  }
  if (!st.over) endTurn(st);
  return lines;
}

/** 从头打完一场：返回 { won, turns, script: [每回合的代码行] } */
export function autoBattle(st, maxTurns = 30) {
  const script = [];
  while (!st.over && st.turn <= maxTurns) script.push(autoTurn(st));
  return { won: st.over === 'win', turns: st.turn, script };
}

/** 什么都不做，只按「结束回合」：用来断言「不出牌就会输」 */
export function idleBattle(st, maxTurns = 60) {
  while (!st.over && st.turn <= maxTurns) endTurn(st);
  return { lost: st.over === 'lose', turns: st.turn };
}
