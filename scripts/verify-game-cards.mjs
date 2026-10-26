// ============================================================
// 阵列牌局 · 纯逻辑校验（node 直接跑，不依赖浏览器）
// - 关卡数据完整：标题 / 概念 / 故事 / 两条提示 / 参考解、牌组与奖励池里的卡都已登记、核心关 7 + 挑战关 1
// - 平衡：每场战斗用「基础牌组」（不带奖励卡）+ 贪心自动打法（src/games/cards/autoplay.js）
//   首次尝试的种子必须在 par 回合内打赢；12 个种子里核心关至少 9 次、挑战关至少 7 次打赢；
//   只按「结束回合」不出牌必须输。
// - 参考解在开局局面上能执行、至少命中一个敌人；规则细节：整体运算 +1 费、能量不够拒绝、
//   自由咒语拒绝分号拼接、倒下的敌人归零且下标不变、奖励三选一确定且不重复。
// 任一失败 exit 1。
// ============================================================
import { LEVELS } from '../src/games/cards/levels.js';
import { CARDS, getCard, FREE } from '../src/games/cards/cards.js';
import {
  createBattle, preview, cast, useSkill, endTurn, hpValues, rewardChoices, medal, snapshotBattle,
} from '../src/games/cards/battle.js';
import { autoBattle, idleBattle } from '../src/games/cards/autoplay.js';
import { run, cloneScope } from '../src/core/npmini.js';

let failed = 0;
let checks = 0;
const ok = (cond, label) => {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${label}`); }
};
const section = (t) => console.log(`[${t}]`);

// ---------- 数据 ----------
section('关卡数据');
const core = LEVELS.filter((l) => !l.challenge);
ok(core.length === 7, `核心关 7 场（实际 ${core.length}）`);
ok(LEVELS.filter((l) => l.challenge).length === 1, '挑战关 1 场');
ok(new Set(LEVELS.map((l) => l.id)).size === LEVELS.length, '关卡 id 不重复');
for (const lv of LEVELS) {
  for (const f of ['id', 'title', 'concept', 'story', 'solution']) ok(typeof lv[f] === 'string' && lv[f].length > 0, `${lv.id} 有 ${f}`);
  ok(Array.isArray(lv.hints) && lv.hints.length === 2, `${lv.id} 两条提示`);
  ok(!!(lv.row || lv.grid), `${lv.id} 有敌阵`);
  ok(typeof lv.par === 'number' && lv.par >= 1, `${lv.id} 有 par`);
  for (const id of [...lv.deck, ...(lv.rewards || []), ...(lv.newCards || [])]) ok(!!getCard(id), `${lv.id} 的卡 ${id} 已登记`);
  ok(lv.deck.filter((id) => getCard(id).kind === 'op').length >= 3, `${lv.id} 牌组里至少 3 张操作卡`);
  const enemies = lv.grid ? lv.grid.flat() : lv.row;
  if (lv.grid) ok(lv.grid.every((r) => r.length === lv.grid[0].length), `${lv.id} 二维阵型每行等长`);
  enemies.forEach((e, i) => {
    ok(Number.isInteger(e.hp) && e.hp > 0, `${lv.id} 敌人 ${i} 生命为正整数`);
    ok(Array.isArray(e.plan) && e.plan.length > 0 && e.plan.every((a) => /^[ahguw]\d*$/.test(a)), `${lv.id} 敌人 ${i} 行动计划合法`);
  });
  if (!lv.challenge) ok((lv.rewards || []).length >= 3, `${lv.id} 奖励池至少 3 张`);
}
ok(Object.values(CARDS).every((c) => typeof c.cost === 'number' && c.code), '每张卡都有费用与代码');
// 一维 / 二维关卡用的选择器与阵型维数一致（二维关不出现只对一维有意义的说明）
console.log(`  ${checks - failed} / ${checks} 项`);

// ---------- 参考解 ----------
section('参考解');
for (const lv of LEVELS) {
  const st = createBattle(lv, { attempt: 0 });
  const scope = cloneScope(st.scope);
  const before = hpValues(st);
  const r = run(lv.solution, scope);
  ok(r.ok, `${lv.id} 参考解 ${lv.solution} 能执行${r.ok ? '' : `（${r.error.type}: ${r.error.message}）`}`);
  if (r.ok) ok(JSON.stringify(before) !== JSON.stringify(hpValues({ scope })), `${lv.id} 参考解改变了 hp`);
}

// ---------- 平衡：自动打法 ----------
section('平衡（基础牌组 + 贪心自动打法）');
for (const lv of LEVELS) {
  const results = [];
  for (let a = 0; a < 12; a++) {
    const r = autoBattle(createBattle(lv, { attempt: a }));
    results.push(r.won ? r.turns : null);
  }
  const first = results[0];
  const wins = results.filter((x) => x !== null).length;
  ok(first !== null && first <= lv.par, `${lv.id}「${lv.title}」首次尝试在 par ${lv.par} 回合内打赢（实际 ${first ?? '输'}）`);
  ok(wins >= (lv.challenge ? 7 : 9), `${lv.id} 12 个种子里打赢 ${wins} 次`);
  const idle = idleBattle(createBattle(lv, { attempt: 0 }));
  ok(idle.lost, `${lv.id} 不出牌必输（第 ${idle.turns} 回合倒下）`);
  console.log(`  ${lv.id} ${lv.title}：自动打法回合数 ${results.map((x) => x ?? '✗').join(' ')}（par ${lv.par}）· 不出牌第 ${idle.turns} 回合倒下`);
}

// ---------- 规则细节 ----------
section('规则');
{
  const lv = LEVELS[0];
  const st = createBattle(lv, { attempt: 0 });
  const opCard = st.hand.find((c) => getCard(c.id).kind === 'op');
  const selCard = st.hand.find((c) => getCard(c.id).kind === 'sel' && !getCard(c.id).free);
  const whole = preview(st, { sel: null, op: opCard.uid });
  ok(whole.ok && whole.cost === getCard(opCard.id).cost + 1, '不配选择器 = 整个数组，多花 1 费');
  ok(whole.line === `hp ${getCard(opCard.id).code}`, `整体运算的代码是 hp ${getCard(opCard.id).code}`);
  if (selCard) {
    const p = preview(st, { sel: selCard.uid, op: opCard.uid });
    ok(p.ok && p.line === `hp${getCard(selCard.id).code} ${getCard(opCard.id).code}`, `选择器 + 操作 = ${p.line}`);
    ok(p.cost === getCard(opCard.id).cost, '配了选择器不加费');
  }
  // 能量不够
  st.player.energy = 0;
  const poor = cast(st, { sel: null, op: opCard.uid });
  ok(!poor.ok && /能量不够/.test(poor.error.message), '能量不够时拒绝施放');
}
{
  // 自由咒语：拒绝拼接、实时预览命中
  const lv = LEVELS.find((l) => l.id === 'c5');
  const st = createBattle(lv, { attempt: 0 });
  st.hand.push({ uid: 999, id: FREE }, { uid: 998, id: '-= 3' });
  const inj = preview(st, { sel: 999, op: 998, free: '0] = 0; hp[1' });
  ok(!inj.ok, '自由咒语拒绝分号拼接');
  const bad = preview(st, { sel: 999, op: 998, free: 'hp >' });
  ok(!bad.ok && bad.error.type === 'SyntaxError', `自由咒语语法错误给 SyntaxError（${bad.error && bad.error.type}）`);
  const mask = preview(st, { sel: 999, op: 998, free: 'hp < 4' });
  const expect = hpValues(st).map((v, i) => (v < 4 ? i : -1)).filter((i) => i >= 0);
  ok(mask.ok && JSON.stringify(mask.selection) === JSON.stringify(expect), `hp < 4 选中 ${expect.join(',')}`);
  const other = preview(st, { sel: 999, op: 998, free: 'atk > 3' });
  ok(other.ok && other.selection.length >= 0, '可以用 atk 做掩膜');
  st.player.energy = 3;
  const r = cast(st, { sel: 999, op: 998, free: 'hp < 4' });
  const hp = hpValues(st);
  ok(r.ok && expect.every((i) => hp[i] === 0), '残血全部倒下、生命记为 0');
  ok(hp.length === lv.row.length, '倒下的敌人留在原位，数组长度不变');
  ok(snapshotBattle(st).log.some((l) => l.startsWith('hp[hp < 4] -= 3')), '战斗日志记下玩家的咒语');
}
{
  // 敌人回合：伤害 = atk[hp > 0].sum()，格挡吸收；祭司群体回血
  const lv = LEVELS.find((l) => l.id === 'c7');
  const st = createBattle(lv, { attempt: 0 });
  const blockCard = st.hand.find((c) => getCard(c.id).block);
  const atkSum = st.scope.atk.map.reduce((s, p) => s + st.scope.atk.store.data[p], 0);
  if (blockCard) useSkill(st, blockCard.uid);
  const block = st.player.block;
  const hpBefore = st.player.hp;
  const enemyBefore = hpValues(st);
  const res = endTurn(st);
  ok(res.taken === Math.max(0, atkSum - block), `受到的伤害 = atk 之和 ${atkSum} − 格挡 ${block}`);
  ok(st.player.hp === hpBefore - res.taken, '勇者生命扣对');
  const after = hpValues(st);
  ok(after.every((v, i) => v === enemyBefore[i] + 2), '祭司回合：全体存活者 +2');
  ok(st.turn === 2 && st.hand.length === 5, '下一回合抽 5 张');
}
{
  const lv = LEVELS[0];
  const a = rewardChoices(lv, 0);
  const b = rewardChoices(lv, 0);
  ok(a.length === 3 && new Set(a).size === 3, '奖励三选一：3 张不重复');
  ok(JSON.stringify(a) === JSON.stringify(b), '奖励按种子确定');
  ok(medal(2, 2).key === 'gold' && medal(3, 2).key === 'silver' && medal(5, 2).key === 'bronze', '奖牌：≤ par 金 / par+1 银 / 其余铜');
  const s1 = createBattle(lv, { attempt: 3 });
  const s2 = createBattle(lv, { attempt: 3 });
  ok(JSON.stringify(s1.hand.map((c) => c.id)) === JSON.stringify(s2.hand.map((c) => c.id)), '同一次尝试洗牌结果相同');
  const withExtra = createBattle(lv, { attempt: 0, extra: ['-= 8', 'nope'] });
  ok(withExtra.drawPile.length + withExtra.hand.length === lv.deck.length + 1, '奖励卡加入牌组（未登记的卡丢弃）');
}

console.log(failed ? `\n[verify-game-cards] ${failed} / ${checks} 项失败 ✘` : `\n[verify-game-cards] ✓ ${checks} 项全部通过`);
process.exit(failed ? 1 : 0);
