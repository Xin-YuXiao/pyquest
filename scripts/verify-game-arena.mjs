// ============================================================
// 向量风暴 · 纯逻辑校验（不起浏览器）：node scripts/verify-game-arena.mjs
// [1] 关卡数据完整（示例战场三数组等长且类型对、波次 / 挑战关字段齐、与登记表一致）
// [2] 法术判定：参考法术在示例战场上合法且命中；不改 hp / 改形状 / 报错 / 空槽一律拒绝
// [3] 法力口径：消耗 = (旧 hp − 新 hp) 正数部分之和（含过量伤害）；新血量向下取整、夹到 ≥ 0；回血不花法力
// [4] 与 npmini 打印一致：verify.js 送真 NumPy 的用例，用解释器跑出的 hp / 消耗与 evaluateSpell 相同
// [5] 平衡：简化模拟（玩家站桩）里参考法术每关都能活着通关；「对全场一把梭」在法力上限下行不通
// 任一失败 exit 1。
// ============================================================
import { LEVELS } from '../src/games/arena/levels.js';
import { GAMES } from '../src/games/registry.js';
import { VERIFY_CASES } from '../src/games/arena/verify.js';
import {
  evaluateSpell, sampleEnemies, regenMana, medalFor, simulateLevel, waveSchedule, rng, SPELL_COOLDOWN,
} from '../src/games/arena/rules.js';
import { run } from '../src/core/npmini.js';

let failed = 0;
let passed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; return; }
  failed++;
  console.log(`  ✗ ${label}`);
};
const section = (t) => console.log(`[${t}]`);

// ---------- [1] 关卡数据 ----------
section('1 关卡数据');
ok(GAMES.arena.levels === LEVELS, '登记表 GAMES.arena.levels 就是 arena/levels.js 的 LEVELS');
ok(GAMES.arena.kind === 'scene' && GAMES.arena.sceneKey === 'VectorArena', '向量风暴登记为场景玩法 VectorArena');
ok(new Set(LEVELS.map((l) => l.id)).size === LEVELS.length, '关卡 id 不重复');
ok(LEVELS.filter((l) => l.challenge).length === 1 && LEVELS[LEVELS.length - 1].challenge, '恰好一个挑战关且放在最后');
for (const lv of LEVELS) {
  const s = lv.sample;
  ok(s && s.hp.length === s.dist.length && s.hp.length === s.elite.length && s.hp.length >= 6, `${lv.id} 示例战场三个数组等长（≥ 6）`);
  ok(s.hp.every((x) => Number.isInteger(x) && x > 0), `${lv.id} 示例 hp 是正整数`);
  ok(s.dist.every((x) => typeof x === 'number' && x > 0), `${lv.id} 示例 dist 是正数`);
  ok(s.elite.every((x) => typeof x === 'boolean'), `${lv.id} 示例 elite 是布尔`);
  ok(lv.title && lv.concept && lv.story && lv.solution && (lv.hints || []).length >= 2, `${lv.id} 标题 / 概念 / 故事 / 参考法术 / ≥ 2 条提示齐全`);
  ok(lv.mana && lv.mana.max > 0 && lv.mana.regen > 0 && lv.mana.start <= lv.mana.max, `${lv.id} 法力字段合法`);
  ok(lv.playerHp > 0 && lv.speed > 0 && lv.par > 0, `${lv.id} 生命 / 速度 / 金牌线为正`);
  if (lv.challenge) ok(lv.survive > 0 && lv.spawnEvery > 0 && (lv.mix || []).length > 0, `${lv.id} 挑战关有坚持时长 / 刷怪间隔 / 敌人配比`);
  else ok(lv.waves.length > 0 && lv.waves.every((w) => w.groups.length && w.groups.every((g) => g.n > 0)), `${lv.id} 至少一波、每组至少 1 只`);
}

// ---------- [2] 法术判定 ----------
section('2 法术判定');
for (const lv of LEVELS) {
  const foes = sampleEnemies(lv);
  for (const spell of [lv.solution, lv.solutionR].filter(Boolean)) {
    const r = evaluateSpell(spell, foes);
    ok(r.ok && r.hits > 0, `${lv.id} 参考法术 ${spell} 在示例战场上合法且命中（${r.ok ? `命中 ${r.hits}` : r.message}）`);
    ok(r.ok && r.cost <= lv.mana.max, `${lv.id} 参考法术 ${spell} 消耗 ${r.cost} ≤ 法力上限 ${lv.mana.max}`);
  }
}
const foes = sampleEnemies(LEVELS[2]); // 斩杀线：hp [1 7 2 2 8 1 6 2 1 7]
const reject = (src, reason, label) => {
  const r = evaluateSpell(src, foes);
  ok(!r.ok && r.reason === reason, `${label}：${src} → ${reason}（实际 ${r.ok ? 'ok' : r.reason}）`);
};
reject('', 'empty', '空槽');
reject('   ', 'empty', '只有空格');
reject('hp - 1', 'noassign', '只算不写回');
reject('x = hp - 1', 'noassign', '写给别的变量');
reject('print(hp)', 'noassign', '只打印');
reject('hp = hp[hp > 2]', 'shape', '掩膜取副本再赋给 hp（形状变了）');
reject('hp = 0', 'type', 'hp 变成一个数');
reject('hp[dist < 3] -= 1.5', 'error', '整数数组原地减小数（UFuncTypeError）');
reject('hp[dist < 3 & hp <= 2] = 0', 'error', '组合条件漏括号（ValueError）');
reject('hp -= ', 'error', '语法错误');
reject('for e in hp: e -= 1', 'error', '写循环');
{
  const r = evaluateSpell('hp[dist < 3] -= 1.5', foes);
  ok(r.error && r.error.type === 'UFuncTypeError' && r.hint, '原地减小数的报错类型是 UFuncTypeError 且带中文解释');
}

// ---------- [3] 法力口径 ----------
section('3 法力口径');
{
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const hp = foes.map((e) => e.hp);
  let r = evaluateSpell('hp -= 100', foes);
  ok(r.ok && r.cost === 100 * hp.length && r.kills === hp.length, `hp -= 100：过量伤害也算（${r.cost} = 100 × ${hp.length}），全灭`);
  r = evaluateSpell('hp[hp <= 2] = 0', foes);
  const weak = hp.filter((x) => x <= 2);
  ok(r.ok && r.cost === sum(weak) && r.kills === weak.length && r.hits === weak.length, `hp[hp <= 2] = 0：只花残血的血量（${r.cost} = ${sum(weak)}）`);
  r = evaluateSpell('hp[:] = 0', foes);
  ok(r.ok && r.cost === sum(hp), 'hp[:] = 0：消耗 = 全场血量之和');
  r = evaluateSpell('hp += 1', foes);
  ok(r.ok && r.cost === 0 && r.healed === hp.length && r.hits === 0, 'hp += 1：给敌人回血不花法力，标记 healed');
  r = evaluateSpell('hp = hp / 2', foes);
  ok(r.ok && r.newHp.every((v, i) => v === Math.floor(hp[i] / 2)), 'hp = hp / 2：新血量向下取整');
  r = evaluateSpell('hp -= 5', foes);
  ok(r.ok && r.newHp.every((v) => v >= 0) && r.damage.every((d, i) => d === Math.min(5, hp[i])), 'hp -= 5：新血量夹到 ≥ 0，实际伤害 = min(5, hp)');
  r = evaluateSpell('hp[elite] -= 3', sampleEnemies(LEVELS[3]));
  ok(r.ok && r.hits === 3 && r.cost === 9, '精英混编：hp[elite] -= 3 只打 3 个精英、花 9 法力');
  r = evaluateSpell('hp[~elite] -= 1', sampleEnemies(LEVELS[3]));
  ok(r.ok && r.hits === 7 && r.kills === 7 && r.cost === 7, '精英混编：hp[~elite] -= 1 清掉 7 个小兵、花 7 法力');
  const lv = LEVELS[1];
  ok(regenMana(0, 1, lv) === lv.mana.regen && regenMana(lv.mana.max - 1, 10, lv) === lv.mana.max, '法力回复按秒计、不超过上限');
  ok(medalFor(lv, lv.par) === 'gold' && medalFor(lv, lv.par * 1.5) === 'silver' && medalFor(lv, lv.par * 2) === 'bronze', '奖牌：≤ par 金、≤ 1.6 par 银、其余铜');
  ok(SPELL_COOLDOWN > 0 && SPELL_COOLDOWN < 2, '冷却时间合理');
}

// ---------- [4] 与 npmini 一致 ----------
section('4 与解释器一致');
for (const c of VERIFY_CASES) {
  const lv = LEVELS.find((l) => c.name.startsWith(`arena ${l.id}:`));
  const spell = c.name.slice(`arena ${lv.id}: `.length);
  const res = run(c.code, {}, { maxSource: 1e5 });
  const r = evaluateSpell(spell, sampleEnemies(lv));
  if (!res.ok) {
    // 解释器报错的写法：evaluateSpell 也必须拒绝
    ok(!r.ok, `${c.name}：解释器报错，判定也拒绝`);
    continue;
  }
  const printedHp = res.output[0].replace(/[[\]]/g, '').trim().split(/\s+/).map(Number);
  const printedCost = Number(res.output[1]);
  if (r.ok) {
    ok(printedHp.every((v, i) => Math.max(0, Math.floor(v)) === r.newHp[i]), `${c.name}：新血量与解释器打印一致`);
    ok(printedCost === r.cost, `${c.name}：消耗 ${r.cost} 与 (old - hp) 正部之和 ${printedCost} 一致`);
  } else {
    ok(r.reason === 'noassign' && printedHp.every((v, i) => v === lv.sample.hp[i]), `${c.name}：被拒绝的写法确实没改 hp`);
  }
}

// ---------- [5] 平衡 ----------
section('5 平衡（站桩模拟，8 个随机种子）');
const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
for (const lv of LEVELS) {
  const spells = [lv.solution, lv.solutionR || ''];
  const rs = seeds.map((seed) => simulateLevel(lv, spells, { seed }));
  const wins = rs.filter((r) => r.won);
  ok(wins.length === seeds.length, `${lv.id} 参考法术 ${spells.filter(Boolean).join(' ／ ')}：${wins.length}/${seeds.length} 局通关`);
  ok(rs.every((r) => r.rejected === 0), `${lv.id} 参考法术从不被拒绝`);
  if (!lv.survive) {
    const worst = Math.max(...rs.map((r) => r.time));
    ok(worst <= lv.par * 1.6 + 5, `${lv.id} 站桩最慢 ${worst.toFixed(1)}s，在银牌线附近（par ${lv.par}）`);
    ok(Math.max(...rs.map((r) => r.casts)) <= 80, `${lv.id} 施法次数合理（≤ 80）`);
  }
  console.log(`  ${lv.id} ${lv.title}：${rs.map((r) => `${r.won ? '胜' : '负'} ${r.time.toFixed(0)}s/施法${r.casts}/剩血${r.hpLeft}`).join('  ')}`);
}
// 一把梭：法力上限挡住「对全场施法」
{
  const a1 = simulateLevel(LEVELS[0], ['hp -= 2', ''], { seed: 1 });
  ok(!a1.won && a1.casts === 0, '史莱姆潮：hp -= 2（36 只 × 2 = 72 > 上限 40）一次都放不出来');
  const a2 = seeds.map((seed) => simulateLevel(LEVELS[1], ['hp -= 3', ''], { seed }));
  ok(a2.every((r) => !r.won), '近身防卫：hp -= 3 对全场施法撑不过去（必须用 dist 掩膜）');
  const a3 = seeds.map((seed) => simulateLevel(LEVELS[2], ['hp -= 2', ''], { seed }));
  ok(a3.every((r) => !r.won), '斩杀线：hp -= 2 对全场施法撑不过去（要用 hp <= 2 斩杀）');
}
// 刷怪计划可复现、数量对
{
  const w = LEVELS[1].waves[0];
  const p1 = waveSchedule(w, rng(42)), p2 = waveSchedule(w, rng(42));
  ok(JSON.stringify(p1) === JSON.stringify(p2), '同一种子刷怪计划完全相同');
  ok(p1.length === w.groups.reduce((s, g) => s + g.n, 0) && p1.every((e, i) => Math.abs(e.t - i * w.every) < 1e-9), '刷怪数量 = 各组之和，按间隔逐个刷出');
}

console.log(failed ? `\n[verify-game-arena] ✗ ${failed} 项失败（${passed} 项通过）` : `\n[verify-game-arena] ✓ ${passed} 项全部通过`);
process.exit(failed ? 1 : 0);
