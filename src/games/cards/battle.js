// ============================================================
// 阵列牌局 · 战斗规则（纯函数 + 可变状态对象，无 DOM；verify-game-cards.mjs 直接驱动）
//
// 作用域里有两个数组（玩家咒语与自由咒语都能读）：
//   hp  —— 每个敌人的生命（一维一排 / 二维阵型），倒下的敌人留在原位、生命为 0（下标不会变）
//   atk —— 每个敌人本回合的攻击意图（不攻击 / 已倒下为 0），可以拿来做掩膜：hp[atk > 3]
// 玩家打出「选择器 + 操作」= 一行真 NumPy（hp[1:4] -= 3），由 core/npmini.js 在真作用域上执行，
// 按 hp 的变化结算伤害；只打操作卡 = 整个数组（hp -= 3，广播），多花 1 费。
// 敌人的回合同样写成 NumPy 记进战斗日志：atk[hp > 0].sum() 是本回合总伤害，祭司的 hp[hp > 0] += 2 是群体回血。
// ============================================================
import { run, fromJS, toJS, cloneScope, selectionOf } from '../../core/npmini.js';
import { getCard, opCost, FREE } from './cards.js';

export const HAND_SIZE = 5;
export const MAX_HAND = 10;
export const ENERGY = 3;

export const ENEMY_KINDS = {
  slime: { name: '史莱姆' },
  imp: { name: '小鬼' },
  assassin: { name: '刺客' },
  knight: { name: '盾卫' },
  archer: { name: '弓手' },
  healer: { name: '祭司' },
  skeleton: { name: '骷髅兵' },
  golem: { name: '石像' },
  lich: { name: '亡灵法师' },
};

// ---------- 确定性随机（关卡 id + 第几次尝试） ----------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 敌人行动计划里的一条：'a4' 攻击 4 · 'h2' 群体回血 2 · 'g3' 自己生命 +3 · 'u1' 不死：全体存活者 +1 · 'w' 蓄势 */
export function parseAction(code) {
  const m = /^([ahguw])(\d*)$/.exec(code);
  if (!m) throw new Error(`未知的敌人行动 ${code}`);
  return { t: m[1], v: Number(m[2] || 0) };
}

const flatEnemies = (level) => (level.grid ? level.grid.flat() : level.row);
export const shapeOf = (level) => (level.grid ? [level.grid.length, level.grid[0].length] : [level.row.length]);

/** 平铺下标 → 代码里的下标写法：一维 '3'、二维 '1, 2' */
export function idxLabel(shape, i) {
  if (shape.length === 1) return String(i);
  return `${Math.floor(i / shape[1])}, ${i % shape[1]}`;
}

// ============================================================
// 建立战斗
// ============================================================

/**
 * level：{ id, row | grid（敌人定义 { kind, hp, plan: ['a3', …] }）, deck: [卡 id], playerHp, par }
 * extra：持久牌组里额外的奖励卡 id
 */
export function createBattle(level, { attempt = 0, extra = [] } = {}) {
  const defs = flatEnemies(level);
  const shape = shapeOf(level);
  const rnd = mulberry32(hashStr(`${level.id}#${attempt}`));
  let uid = 0;
  const deck = [...level.deck, ...extra].filter(getCard).map((id) => ({ uid: ++uid, id }));
  const st = {
    level,
    attempt,
    shape,
    ndim: shape.length,
    turn: 0,
    rnd,
    enemies: defs.map((e) => ({
      kind: e.kind, name: e.name || ENEMY_KINDS[e.kind]?.name || '敌人',
      plan: e.plan.map(parseAction), maxHp: e.hp,
    })),
    scope: {
      hp: reshape(fromJS(defs.map((e) => e.hp), 'int'), shape),
      atk: reshape(fromJS(defs.map(() => 0), 'int'), shape),
    },
    player: { hp: level.playerHp ?? 30, maxHp: level.playerHp ?? 30, block: 0, energy: ENERGY },
    drawPile: shuffle(deck, rnd),
    hand: [],
    discard: [],
    log: [],
    over: null,
    nextUid: uid,
    stats: { spells: 0, damage: 0, taken: 0 },
    // 执行轨迹：在作用域上跑过的每一行（以及游戏直接改写的 atk），verify 用它在真 NumPy 上重放
    trace: [{ set: 'hp', values: defs.map((d) => d.hp) }],
  };
  startTurn(st);
  return st;
}

function reshape(arr, shape) {
  if (shape.length === 1) return arr;
  const scope = { a: arr };
  run(`a = a.reshape(${shape.join(', ')})`, scope);
  return scope.a;
}

/** 平铺成一维的 hp / atk 数值（二维阵型按行优先，与平铺下标一致） */
export const hpValues = (st) => [toJS(st.scope.hp)].flat(2);
export const atkValues = (st) => [toJS(st.scope.atk)].flat(2);
export const aliveIdx = (st) => hpValues(st).map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);

function setFlat(arr, i, v) {
  arr.store.data[arr.map[i]] = v;
}

/** 本回合每个敌人的行动（倒下的为 null） */
export function intents(st) {
  const hp = hpValues(st);
  return st.enemies.map((e, i) => (hp[i] > 0 ? e.plan[(st.turn - 1) % e.plan.length] : null));
}

function refreshAtk(st) {
  const it = intents(st);
  it.forEach((a, i) => setFlat(st.scope.atk, i, a && a.t === 'a' ? a.v : 0));
  if (st.trace) st.trace.push({ set: 'atk', values: atkValues(st) });
}

/** 在真作用域上执行一行并记进轨迹 */
function exec(st, code, { expr = false } = {}) {
  const r = run(code, st.scope);
  st.trace.push({ code, expr });
  return r;
}

function log(st, who, code, note = '') {
  st.log.push({ who, code, note, turn: st.turn });
  if (st.log.length > 80) st.log.shift();
}

function draw(st, n) {
  const drawn = [];
  for (let k = 0; k < n; k++) {
    if (st.hand.length >= MAX_HAND) break;
    if (!st.drawPile.length) {
      if (!st.discard.length) break;
      st.drawPile = shuffle(st.discard, st.rnd);
      st.discard = [];
      log(st, 'sys', '', '弃牌堆洗回抽牌堆');
    }
    const c = st.drawPile.pop();
    st.hand.push(c);
    drawn.push(c);
  }
  return drawn;
}

export function startTurn(st) {
  st.turn += 1;
  st.player.block = 0;
  st.player.energy = ENERGY;
  refreshAtk(st);
  draw(st, HAND_SIZE);
  log(st, 'sys', '', `第 ${st.turn} 回合`);
}

// ============================================================
// 玩家：组合一行咒语
// ============================================================

const inHand = (st, uid) => st.hand.find((c) => c.uid === uid) || null;

/** 自由咒语方括号里的内容是否只是一个下标表达式（挡住 `0] = 0; hp[1` 这类拼接） */
function checkFree(expr) {
  const e = String(expr || '').trim();
  if (!e) return '先在方括号里写下标：例如 2:5 或 hp > 3';
  if (/[;\n]/.test(e)) return '方括号里只写下标，不要写分号或换行';
  return null;
}

/**
 * 组合：sel / op 是手牌 uid（sel 可空 = 整个数组），free 是自由咒语方括号里的文字。
 * 返回 { line, selCode, cost, whole, error }
 */
export function compose(st, { sel = null, op = null, free = '' } = {}) {
  const selCard = sel !== null ? inHand(st, sel) : null;
  const opCard = op !== null ? inHand(st, op) : null;
  if (sel !== null && !selCard) return { error: '这张选择器不在手牌里' };
  if (!opCard) return { error: '还差一张操作卡（-= 3、//= 2 …）' };
  const opDef = getCard(opCard.id);
  if (opDef.kind !== 'op') return { error: '这不是操作卡' };
  let selCode = '';
  if (selCard) {
    const sd = getCard(selCard.id);
    if (sd.kind !== 'sel') return { error: '这不是选择器卡' };
    if (sd.free) {
      const bad = checkFree(free);
      if (bad) return { error: bad, needFree: true };
      selCode = `[${String(free).trim()}]`;
    } else selCode = sd.code;
  }
  const whole = !selCard;
  const line = `hp${selCode} ${opDef.code}`;
  return { line, selCode, whole, cost: opCost(opDef, whole), opDef };
}

/**
 * 预览（不改状态）：在作用域副本上执行，算出会命中谁、每个敌人掉多少血、会不会倒下。
 * 返回 { ok, error, line, cost, affordable, selection: [平铺下标], hits: [{ i, before, after }], kills }
 */
export function preview(st, choice) {
  const c = compose(st, choice);
  if (c.error) return { ok: false, error: { type: '', message: c.error, hint: '' }, needFree: c.needFree, line: c.line || '' };
  const before = hpValues(st);
  // 先只求选择器：hp[...] 选中了哪些格子（来源位置）
  let selection;
  if (c.whole) selection = before.map((_, i) => i);
  else {
    const probe = cloneScope(st.scope);
    const r = run(`hp${c.selCode}`, probe);
    if (!r.ok) return { ok: false, error: r.error, line: c.line, cost: c.cost };
    if (r.statements !== 1 || r.lastKind !== 'expr') {
      return { ok: false, error: { type: '', message: '方括号里只写下标表达式', hint: '' }, line: c.line, cost: c.cost };
    }
    const s = selectionOf(r.value, probe.hp);
    if (!s) {
      return {
        ok: false, line: c.line, cost: c.cost,
        error: { type: '', message: '这个写法没有从 hp 里选出敌人', hint: '方括号里写下标、切片或布尔掩膜，例如 1:4、::2、hp > 5' },
      };
    }
    selection = [...s].sort((a, b) => a - b);
  }
  const scope = cloneScope(st.scope);
  const r = run(c.line, scope);
  if (!r.ok) return { ok: false, error: r.error, line: c.line, cost: c.cost, selection };
  const after = [toJS(scope.hp)].flat(2).map((v) => Math.max(0, v));
  const hits = [];
  let kills = 0;
  before.forEach((b, i) => {
    if (b > 0 && after[i] !== b) {
      hits.push({ i, before: b, after: after[i] });
      if (after[i] === 0) kills++;
    }
  });
  const aliveHit = selection.filter((i) => before[i] > 0).length;
  const out = {
    ok: true, line: c.line, cost: c.cost, whole: c.whole, selection, hits, kills,
    affordable: c.cost <= st.player.energy, aliveHit,
  };
  if (!aliveHit) out.warn = '选中的格子里没有活着的敌人';
  return out;
}

/** 打出一行咒语：花能量、两张卡进弃牌堆、在真作用域上执行、倒下的归零、记日志。返回 { ok, error, hits, kills, line } */
export function cast(st, choice) {
  if (st.over) return { ok: false, error: { message: '战斗已经结束' } };
  const p = preview(st, choice);
  if (!p.ok) return p;
  if (!p.aliveHit) return { ...p, ok: false, error: { type: '', message: p.warn, hint: '换一个下标，选中还站着的敌人' } };
  if (!p.affordable) {
    return { ...p, ok: false, error: { type: '', message: `能量不够：这行咒语要 ${p.cost} 点，你只剩 ${st.player.energy} 点`, hint: p.whole ? '不配选择器（整个数组）会多花 1 点能量' : '' } };
  }
  const r = exec(st, p.line);
  if (!r.ok) return { ...p, ok: false, error: r.error };
  st.player.energy -= p.cost;
  for (const uid of [choice.sel, choice.op]) {
    if (uid === null || uid === undefined) continue;
    const k = st.hand.findIndex((c) => c.uid === uid);
    if (k >= 0) st.discard.push(...st.hand.splice(k, 1));
  }
  log(st, 'player', p.line, p.kills ? `击倒 ${p.kills} 个` : `命中 ${p.hits.length} 个`);
  clampDead(st);
  st.stats.spells++;
  st.stats.damage += p.hits.reduce((s, h) => s + (h.before - h.after), 0);
  refreshAtk(st);
  if (!aliveIdx(st).length) {
    st.over = 'win';
    log(st, 'sys', '', '全部敌人倒下了！');
  }
  return { ...p, ok: true };
}

function clampDead(st) {
  const hp = hpValues(st);
  if (hp.some((v) => v < 0)) {
    exec(st, 'hp[hp < 0] = 0');
    log(st, 'sys', 'hp[hp < 0] = 0', '倒下的敌人生命记为 0');
  }
}

/** 技能卡：格挡 / 抽牌 */
export function useSkill(st, uid) {
  if (st.over) return { ok: false, error: { message: '战斗已经结束' } };
  const card = inHand(st, uid);
  const def = card && getCard(card.id);
  if (!def || def.kind !== 'skill') return { ok: false, error: { message: '这不是技能卡' } };
  if (def.cost > st.player.energy) return { ok: false, error: { message: `能量不够：要 ${def.cost} 点` } };
  st.player.energy -= def.cost;
  st.discard.push(...st.hand.splice(st.hand.indexOf(card), 1));
  let drawn = [];
  if (def.block) st.player.block += def.block;
  if (def.draw) drawn = draw(st, def.draw);
  log(st, 'player', def.code, def.block ? `格挡 ${st.player.block}` : `抽到 ${drawn.length} 张`);
  return { ok: true, def, drawn };
}

// ============================================================
// 敌人的回合
// ============================================================

/**
 * 结束回合：弃掉手牌 → 存活敌人按意图行动（攻击先结算、再回血 / 成长）→ 下一回合抽牌。
 * 返回 { events: [{ type: 'attack'|'heal'|'grow'|'undying', i?, v, … }], taken, lost }
 */
export function endTurn(st) {
  if (st.over) return { events: [], taken: 0 };
  st.discard.push(...st.hand.splice(0));
  const events = [];
  const acts = intents(st);
  const hp0 = hpValues(st);
  // 1) 攻击：本回合总伤害 = 存活敌人的 atk 之和（掩膜 + 求和）
  const total = acts.reduce((s, a) => s + (a && a.t === 'a' ? a.v : 0), 0);
  let taken = 0;
  if (total > 0) {
    const r = exec(st, 'atk[hp > 0].sum()', { expr: true });
    const shown = r.ok ? Number(toJS(r.value)) : total;
    const absorbed = Math.min(st.player.block, shown);
    taken = shown - absorbed;
    st.player.hp = Math.max(0, st.player.hp - taken);
    st.stats.taken += taken;
    log(st, 'enemy', 'atk[hp > 0].sum()', `→ ${shown} 点伤害${absorbed ? `，格挡 ${absorbed}` : ''}，你受到 ${taken}`);
    acts.forEach((a, i) => { if (a && a.t === 'a') events.push({ type: 'attack', i, v: a.v }); });
    events.push({ type: 'hurt', v: taken, absorbed });
  }
  if (st.player.hp <= 0) {
    st.over = 'lose';
    log(st, 'sys', '', '你倒下了……');
    return { events, taken, lost: true };
  }
  // 2) 回血 / 成长 / 不死（按敌人顺序；只对行动开始时还活着的敌人）
  acts.forEach((a, i) => {
    if (!a || hp0[i] <= 0) return;
    if (a.t === 'h') {
      exec(st, `hp[hp > 0] += ${a.v}`);
      log(st, 'enemy', `hp[hp > 0] += ${a.v}`, `${st.enemies[i].name}为全体回血`);
      events.push({ type: 'heal', i, v: a.v });
    } else if (a.t === 'g') {
      exec(st, `hp[${idxLabel(st.shape, i)}] += ${a.v}`);
      log(st, 'enemy', `hp[${idxLabel(st.shape, i)}] += ${a.v}`, `${st.enemies[i].name}变强了`);
      events.push({ type: 'grow', i, v: a.v });
    } else if (a.t === 'u') {
      exec(st, `hp[hp > 0] += ${a.v}`);
      log(st, 'enemy', `hp[hp > 0] += ${a.v}`, '不死军团：全体存活者复苏');
      events.push({ type: 'undying', i, v: a.v });
    }
  });
  // 血条上限随回血抬高（显示用）
  hpValues(st).forEach((v, i) => { if (v > st.enemies[i].maxHp) st.enemies[i].maxHp = v; });
  startTurn(st);
  return { events, taken, lost: false };
}

/** 用了几回合（打赢时 = 当前回合数） */
export const turnsUsed = (st) => st.turn;

/** 奖牌：≤ par 金 / ≤ par+1 银 / 其余铜 */
export function medal(turns, par) {
  if (turns <= par) return { key: 'gold', name: '金牌', icon: '🥇' };
  if (turns <= par + 1) return { key: 'silver', name: '银牌', icon: '🥈' };
  return { key: 'bronze', name: '铜牌', icon: '🥉' };
}

/** 战后三选一：从关卡的奖励池里按（关卡 id + 尝试次数）确定性地抽 3 张不同的 */
export function rewardChoices(level, attempt = 0) {
  const pool = [...new Set(level.rewards || [])].filter(getCard);
  return shuffle(pool, mulberry32(hashStr(`${level.id}~reward~${attempt}`))).slice(0, 3);
}

/** 测试 / 调试用快照 */
export function snapshotBattle(st) {
  return {
    turn: st.turn,
    over: st.over,
    shape: st.shape.slice(),
    hp: hpValues(st),
    atk: atkValues(st),
    player: { ...st.player },
    hand: st.hand.map((c) => ({ uid: c.uid, id: c.id })),
    drawPile: st.drawPile.length,
    discard: st.discard.length,
    log: st.log.slice(-8).map((l) => (l.code ? `${l.code}  # ${l.note}` : `# ${l.note}`)),
  };
}

export { FREE };
