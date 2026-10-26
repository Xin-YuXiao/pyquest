// ============================================================
// 向量风暴 · 规则（纯函数：无 Phaser / DOM，场景与 scripts/verify-game-arena.mjs 共用）
//
// 一句法术 = 一行（或几句 ; 分隔的）NumPy，作用在「此刻场上存活的敌人」现场构造的三个数组上：
//   hp    每个敌人的血量（int）      dist  到玩家的距离（float，单位格，保留 1 位小数）
//   elite 是否精英（bool）
// 法术必须给 hp 赋值（hp -= 1 / hp[掩膜] = 0 / hp = hp // 2 …），执行后按 hp 的变化结算：
//   新血量 = 向下取整并夹到 ≥ 0；法力消耗 = (旧 hp − 新 hp) 的正数部分之和（含过量伤害——hp -= 100 很贵）。
// ============================================================
import { run, fromJS, toJS, isNDArray } from '../../core/npmini.js';

export const TILE = 128;
export const SPELL_COOLDOWN = 0.8;   // 秒
export const HP_CAP = 99;
export const SILVER_RATIO = 1.6;

/** 两点距离 → 格（保留 1 位小数，打印出来整齐） */
export const tilesBetween = (ax, ay, bx, by) => Math.round((Math.hypot(ax - bx, ay - by) / TILE) * 10) / 10;

/** enemies: [{ hp, dist, elite }] → 法术作用域 */
export function buildScope(enemies) {
  return {
    hp: fromJS(enemies.map((e) => e.hp), 'int'),
    dist: fromJS(enemies.map((e) => e.dist), 'float'),
    elite: fromJS(enemies.map((e) => !!e.elite), 'bool'),
  };
}

/** 示例战场（关卡数据的 sample）→ enemies */
export function sampleEnemies(level) {
  const s = level.sample;
  return s.hp.map((hp, i) => ({ hp, dist: s.dist[i], elite: !!s.elite[i] }));
}

/**
 * 一句法术在一组敌人上的效果（不改入参）。
 * 成功：{ ok: true, newHp, damage（每个敌人扣掉的血，≥ 0）, cost, hits, kills, healed, output }
 * 失败：{ ok: false, reason: 'empty' | 'error' | 'noassign' | 'shape' | 'type', message, error? }
 */
export function evaluateSpell(src, enemies) {
  if (!src || !src.trim()) return { ok: false, reason: 'empty', message: '这个法术槽还空着。' };
  const scope = buildScope(enemies);
  const before = scope.hp;
  const res = run(src, scope);
  if (!res.ok) {
    return { ok: false, reason: 'error', error: res.error, message: `${res.error.type}: ${res.error.message}`, hint: res.error.hint };
  }
  if (!res.usage.assigns.some((a) => a.name === 'hp')) {
    return {
      ok: false, reason: 'noassign',
      message: '这句咒语只算出了结果，没有改 hp——敌人不会受伤。',
      hint: '要把结果写回 hp：例如 hp -= 1、hp[dist < 3] -= 2、hp[hp <= 2] = 0。',
    };
  }
  const after = scope.hp;
  if (!isNDArray(after)) {
    return { ok: false, reason: 'type', message: `hp 被改成了别的东西（不是数组）。`, hint: '法术要让 hp 仍然是一个数组，例如 hp -= 1。' };
  }
  if (after.shape.join() !== before.shape.join()) {
    return {
      ok: false, reason: 'shape',
      message: `hp 的形状变了：原来 ${before.size} 个敌人，现在 hp 只剩 ${after.size} 个数。`,
      hint: 'hp[掩膜] 取出来的是一份副本；要改场上敌人，得原地写回：hp[掩膜] -= 2 或 hp[掩膜] = 0。',
    };
  }
  const oldHp = enemies.map((e) => e.hp);
  const raw = toJS(after).map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)));
  const newHp = raw.map((v) => (Number.isFinite(v) ? Math.min(HP_CAP, Math.max(0, Math.floor(v))) : 0));
  let cost = 0;
  let hits = 0;
  let kills = 0;
  let healed = 0;
  const damage = oldHp.map((o, i) => {
    const dec = o - (Number.isFinite(raw[i]) ? raw[i] : 0);
    if (dec > 0) { cost += dec; hits++; }
    if (newHp[i] > o) healed++;
    if (o > 0 && newHp[i] <= 0) kills++;
    return Math.max(0, o - newHp[i]);
  });
  return { ok: true, newHp, damage, cost: Math.ceil(cost - 1e-9), hits, kills, healed, output: res.output };
}

/** 法力回复（不超过上限） */
export const regenMana = (mana, dtSec, level) => Math.min(level.mana.max, mana + level.mana.regen * dtSec);

/** 成绩 → 奖牌：用时（秒）越少越好；挑战关成绩 = 被击中次数 */
export function medalFor(level, score) {
  if (score <= level.par) return 'gold';
  if (score <= level.par * SILVER_RATIO) return 'silver';
  return 'bronze';
}
export const MEDAL_NAME = { gold: '金牌', silver: '银牌', bronze: '铜牌' };

/** 可复现的伪随机（Park–Miller） */
export function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** 一组敌人的初始血量：数 或 [min, max] 闭区间 */
export const rollHp = (spec, rand) => (Array.isArray(spec) ? spec[0] + Math.floor(rand() * (spec[1] - spec[0] + 1)) : spec);

/** 挑战关按权重抽一种敌人 */
export function rollMix(mix, rand) {
  const total = mix.reduce((s, m) => s + m.w, 0);
  let r = rand() * total;
  for (const m of mix) { r -= m.w; if (r <= 0) return m; }
  return mix[mix.length - 1];
}

/** 一波的刷怪计划：[{ t（秒，相对本波开始）, hp, elite }]，顺序 = 刷出顺序 */
export function waveSchedule(wave, rand) {
  const out = [];
  for (const g of wave.groups) for (let k = 0; k < g.n; k++) out.push({ hp: rollHp(g.hp, rand), elite: !!g.elite });
  // 打散顺序（精英 / 大块头混进小兵里），再按间隔排时间
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.map((e, i) => ({ ...e, t: wave.every ? i * wave.every : 0 }));
}

/** 挑战关当前的刷怪间隔：随时间线性缩短到 45% */
export const challengeInterval = (level, tSec) => level.spawnEvery * Math.max(0.45, 1 - tSec / (level.survive * 1.6));

/**
 * 不依赖 Phaser 的简化模拟（校验平衡用）：玩家站在原地，敌人从 spawnDist 格外以 speed 直线逼近，
 * 贴脸（≤ 0.6 格）每秒造成 1（精英 2）点伤害；Q / R 冷却好且法力够、并且能命中时就施放。
 * 返回 { won, time, casts, hpLeft, hitsTaken, rejected }
 */
export function simulateLevel(level, spells, { seed = 7, dt = 0.05, maxTime = 240, spawnDist = [6, 11] } = {}) {
  const rand = rng(seed);
  const speedTiles = level.speed / TILE;
  let enemies = [];
  const pending = [];
  let waveIdx = -1;
  let mana = level.mana.start;
  const cd = [0, 0];
  let casts = 0;
  let hp = level.playerHp;
  let invul = 0;
  let hitsTaken = 0;
  let rejected = 0;
  const startWave = (t) => {
    waveIdx++;
    waveSchedule(level.waves[waveIdx], rand).forEach((e) => pending.push({ ...e, t: e.t + t }));
  };
  let nextSpawn = 0;
  if (!level.survive) startWave(0);
  for (let t = 0; t < maxTime; t += dt) {
    // 刷怪
    if (level.survive) {
      if (t >= nextSpawn) {
        const m = rollMix(level.mix, rand);
        enemies.push({ hp: rollHp(m.hp, rand), elite: !!m.elite, d: spawnDist[0] + rand() * (spawnDist[1] - spawnDist[0]) });
        nextSpawn = t + challengeInterval(level, t);
      }
    } else {
      while (pending.length && pending[0].t <= t) {
        const e = pending.shift();
        enemies.push({ hp: e.hp, elite: e.elite, d: spawnDist[0] + rand() * (spawnDist[1] - spawnDist[0]) });
      }
    }
    // 逼近 + 接触伤害
    for (const e of enemies) e.d = Math.max(0.5, e.d - speedTiles * dt);
    invul = Math.max(0, invul - dt);
    const touching = enemies.filter((e) => e.d <= 0.6);
    if (touching.length && invul <= 0) {
      hp -= touching.some((e) => e.elite) ? 2 : 1;
      hitsTaken++;
      invul = 1;
      if (hp <= 0) return { won: false, time: t, casts, hpLeft: 0, hitsTaken, rejected };
    }
    // 施法
    mana = regenMana(mana, dt, level);
    for (let k = 0; k < 2; k++) {
      cd[k] = Math.max(0, cd[k] - dt);
      const src = spells[k];
      if (!src || cd[k] > 0 || !enemies.length) continue;
      const view = enemies.map((e) => ({ hp: e.hp, dist: Math.round(e.d * 10) / 10, elite: e.elite }));
      const r = evaluateSpell(src, view);
      if (!r.ok) { rejected++; continue; }
      if (!r.hits || r.cost > mana) continue;
      mana -= r.cost;
      cd[k] = SPELL_COOLDOWN;
      casts++;
      enemies.forEach((e, i) => { e.hp = r.newHp[i]; });
      enemies = enemies.filter((e) => e.hp > 0);
    }
    // 判定
    if (level.survive) {
      if (t >= level.survive) return { won: true, time: t, casts, hpLeft: hp, hitsTaken, rejected };
    } else if (!pending.length && !enemies.length) {
      if (waveIdx + 1 < level.waves.length) startWave(t);
      else return { won: true, time: Math.round(t * 10) / 10, casts, hpLeft: hp, hitsTaken, rejected };
    }
  }
  return { won: false, time: maxTime, casts, hpLeft: hp, hitsTaken, rejected };
}
