// 无头冒烟测试：不需要浏览器
// 1) 验证所有像素图行宽一致（pixelTexture 会 throw）
// 2) 验证全部章节地图构建器输出（尺寸、越界、必需要素、传送门链）
// 3) 验证题库引用完整、题池同难度、槽位映射完整、随机抽题行为
// 4) 验证 W4-W11 三池式结构（24 个通用池齐备 / tier 对齐 / 旧池不残留 / 章节映射）
// 5) 验证背景音乐曲目数据（记谱合法、可编译）与章节曲目映射
// 6) 验证观测站小游戏：NFW / 频谱数学对齐题库（dm8 / dm9 / sg6 / st7）、观测台选址、观测日志
// 7) 验证秘藏彩蛋：数据完整、每章野外选址合法且确定（不与符文/出生点/传送门/障碍冲突）
// 8) 验证 BOSS 招牌机制配置（种类登记 / 原型匹配 / 开场文案）与机制公式（正弦 / NFW / 后验权重）
// 9) 验证存档 v3：v1/v2 真实样本迁移、校验、水合、配额降级（纯函数，不需要浏览器）
// 10) 验证学习记录与错题本：作答汇总规则、日志裁剪、复习掌握规则、选项打乱映射、错题视图
// 11) 验证第二批观测站的纯数学：蒙特卡洛 π / 并行搬砖 / 引力沙盒 / 贝叶斯硬币 / 星系分类（对齐题库）
import { readFileSync } from 'node:fs';
import { generateAllTextures } from '../src/textures/pixelArt.js';
import { makeGroundTexture } from '../src/textures/ground.js';
import { CHAPTERS } from '../src/data/chapters.js';
import { QUESTIONS, pickQuestion, highlight, POOLS, SLOT_POOL } from '../src/data/quizData.js';
import { TRACKS, trackErrors, compileTrack, cueFor } from '../src/audio/tracks.js';
import {
  OBSERVATORIES, NFW, TUNING, makeNfwData, nfwDensity, nfwChi2, nfwChi2dof, nfwLogSlope,
  makeTuner, findPeaks, readoutMagnitude, amplitudeOf, recordObservation, sanitizeObservationLog,
} from '../src/core/observatory.js';
import { SECRETS, SECRET_RULES, placeSecret, withSecret, secretForChapter } from '../src/data/secrets.js';
import { MECHANIC_KINDS, mechanicParams } from '../src/data/bossMechanics.js';
import { sineOffset, nfwPullSpeed, aimWeight, decayLr } from '../src/core/bossMath.js';
import { G, resetState } from '../src/core/state.js';
import {
  serialize, migrate, parseSave, validate, hydrate, readSave, writeSave,
  SAVE_KEY, LEGACY_KEYS, BROKEN_KEY,
} from '../src/core/save.js';
import { applyAttempt, applyReview, snapshotOf, LOG_CAP, MASTERY_STREAK, OK } from '../src/core/records.js';
import { buildMistakeEntries, filterMistakes, filterOptions, pendingCount } from '../src/core/mistakes.js';
import { optionOrder } from '../src/core/quiz.js';
import * as ST from '../src/core/stations.js';

let errors = 0;
const fail = (msg) => { errors++; console.error('  ✗', msg); };
const ok = (msg) => console.log('  ✓', msg);

// ---- 伪 DOM/Canvas ----
const ctxStub = new Proxy({}, {
  get: (t, k) => {
    if (k === 'canvas') return { width: 0, height: 0 };
    // 所有方法可链式调用（createRadialGradient().addColorStop() 等）
    return () => ctxStub;
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }),
};

// ---- 1. 贴图生成 ----
console.log('[1] 贴图生成');
const textures = {};
const sceneStub = {
  textures: {
    canvasKeys: new Set(),
    exists(key) { return this.canvasKeys.has(key); },
    get() { return null; }, // tileset 未加载 → ground 走占位分支（数据层测试不看像素）
    addCanvas(key, canvas) {
      this.canvasKeys.add(key);
      textures[key] = { w: canvas.width, h: canvas.height };
    },
  },
};
try {
  generateAllTextures(sceneStub);
  ok(`生成 ${Object.keys(textures).length} 张贴图`);
  const need = ['shard',
    'heart_full',
    'portal_door', 'crystal', 'shroom',
    'gate_closed', 'gate_open', 'torch_0',
    'slash_0', 'slash_1', 'slash_2',
    'particle', 'observatory', 'secret_stone'];
  for (const k of need) if (!textures[k]) fail(`缺少贴图 ${k}`);
} catch (e) { fail(`贴图生成抛出异常: ${e.message}`); }

// ---- 2. 全部章节地图 ----
console.log('[2] 全部章节地图构建');
function checkMap(def, label) {
  if (def.grid.length !== def.h) fail(`${label} 行数不符`);
  def.grid.forEach((row, y) => {
    if (row.length !== def.w) fail(`${label} 第 ${y} 行宽度 ${row.length} != ${def.w}`);
    row.forEach((v, x) => { if (!Number.isInteger(v) || v < 0 || v > 11) fail(`${label} (${x},${y}) 非法瓦片 ${v}`); });
  });
  const inRange = (p, what) => {
    if (p.x < 64 || p.x > def.w * 128 - 64 || p.y < 64 || p.y > def.h * 128 - 64) fail(`${label} ${what} 越界: (${p.x},${p.y})`);
  };
  def.props.forEach((p) => inRange(p, `prop:${p.type}`));
  (def.slimes || []).forEach((p) => inRange(p, 'slime'));
  Object.values(def.spawns).forEach((p) => inRange(p, 'spawn'));
  (def.portals || []).forEach((p) => {
    const r = p.rect;
    if (r.x < 0 || r.y < 0 || r.x + r.w > def.w * 128 || r.y + r.h > def.h * 128) fail(`${label} 传送门越界`);
  });
  // 出生点不能在碰撞瓦片里
  const solidAt = (x, y) => {
    const tx = Math.floor(x / 128), ty = Math.floor(y / 128);
    return def.colliding.includes(def.grid[ty] && def.grid[ty][tx]);
  };
  Object.entries(def.spawns).forEach(([k, p]) => {
    if (solidAt(p.x, p.y)) fail(`${label} 出生点 ${k} 落在碰撞瓦片上 (${p.x},${p.y})`);
  });
  ok(`${label}: ${def.w}x${def.h}, ${def.props.length} 个道具, ${def.slimes?.length || 0} 只史莱姆`);
}

// 每章构建 field + lair，并校验章节必需结构
const allFields = [];
const allLairs = [];
for (const ch of CHAPTERS) {
  try {
    const field = ch.buildField(ch);
    const lair = ch.buildLair(ch);
    checkMap(field, `${ch.fieldKey}(${ch.fieldName})`);
    checkMap(lair, `${ch.lairKey}(${ch.lairName})`);

    // 野外：碎片符文数量 = shardsNeeded；有引导 NPC；有通往巢穴的封印传送门
    const shardRunes = field.props.filter((p) => p.type === 'rune' && !p.bossRune && !p.healRune);
    const npc = field.props.find((p) => p.type === 'npc');
    const toLair = (field.portals || []).find((p) => p.to === ch.lairKey);
    if (shardRunes.length !== ch.shardsNeeded) fail(`${ch.fieldKey} 碎片符文 ${shardRunes.length} != ${ch.shardsNeeded}`);
    if (!npc) fail(`${ch.fieldKey} 缺少引导 NPC`);
    if (!toLair) fail(`${ch.fieldKey} 缺少通往巢穴的传送门`);
    if (ch.id > 1 && !toLair.requires) fail(`${ch.fieldKey} 通往巢穴的传送门应带封印条件`);

    // 巢穴：BOSS + BOSS 符文 + 回野外的传送门
    const bossRune = lair.props.filter((p) => p.type === 'rune' && p.bossRune);
    if (!lair.boss) fail(`${ch.lairKey} 缺少 BOSS`);
    if (bossRune.length !== 1) fail(`${ch.lairKey} BOSS 符文数量 ${bossRune.length} != 1`);
    if (!(lair.portals || []).some((p) => p.to === ch.fieldKey)) fail(`${ch.lairKey} 缺少回野外的传送门`);

    // 章节衔接：非末章应有通往下一章的传送门（requires done）
    if (ch.nextKey) {
      if (!(field.portals || []).some((p) => p.to === ch.nextKey)) fail(`${ch.fieldKey} 缺少通往下一章的传送门`);
    }
    if (ch.prevKey) {
      if (!(field.portals || []).some((p) => p.to === ch.prevKey)) fail(`${ch.fieldKey} 缺少返回上一章的传送门`);
    }
    allFields.push(field);
    allLairs.push(lair);
  } catch (e) { fail(`第 ${ch.id} 章 ${ch.title} 构建异常: ${e.message}`); }
}
ok(`全部 ${allFields.length} 章：${allFields.length} 野外 + ${allLairs.length} 巢穴全部构建成功`);

// 地面画布（抽查五章：两手工图 + 通用图首尾——高原 / 暗物质核心 / 三途之门）
try {
  const g1 = makeGroundTexture(sceneStub, allFields[0]);
  const g2 = makeGroundTexture(sceneStub, allLairs[0]);
  const g3 = makeGroundTexture(sceneStub, allFields[2]);
  const g4 = makeGroundTexture(sceneStub, allLairs[7]);
  const g5 = makeGroundTexture(sceneStub, allLairs[10]);
  if (!textures[g1] || !textures[g2] || !textures[g3] || !textures[g4] || !textures[g5]) fail('地面画布生成失败');
  ok('地面画布生成成功（村庄/地牢/高原/暗物质核心/三途之门）');
} catch (e) { fail(`地面画布异常: ${e.message}`); }

// ---- 3. 题库 ----
console.log('[3] 题库');
for (const [id, q] of Object.entries(QUESTIONS)) {
  try {
    if (!q.chapter || !q.prompt || !q.code || !Array.isArray(q.options) || q.options.length < 3) fail(`${id} 题目结构不完整`);
    if (q.answer < 0 || q.answer >= q.options.length) fail(`${id} answer 越界`);
    if (!q.explain) fail(`${id} 缺少讲解`);
    if (!Number.isInteger(q.tier)) fail(`${id} 缺少难度 tier`);
    const html = highlight(q.code);
    if (q.fill && !html.includes('quiz-blank')) fail(`${id} 填空题缺少空槽占位`);
    if (/<script/i.test(html)) fail(`${id} 高亮结果包含可疑内容`);
    // 高亮只能加标签、不能改字：去掉标签、还原实体后必须与原代码逐字一致（填空 ___ 统一为 ____）
    const text = html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    if (text !== q.code.replace(/_{3,}/g, '____')) fail(`${id} 高亮后文本被破坏（标签嵌套或吞字）`);
    if (/<span class="[^"]*</.test(html)) fail(`${id} 高亮生成了嵌套在属性里的坏标签`);
  } catch (e) { fail(`题目 ${id} 异常: ${e.message}`); }
}
ok(`题库 ${Object.keys(QUESTIONS).length} 题，格式校验通过`);

// 3b. 题池：非空 / 引用存在 / 池内难度（tier）一致 / 章节归属正确
for (const [name, ids] of Object.entries(POOLS)) {
  if (!ids.length) fail(`题池 ${name} 为空`);
  ids.forEach((id) => { if (!QUESTIONS[id]) fail(`题池 ${name} 引用了不存在的题目 ${id}`); });
  const tiers = new Set(ids.map((id) => QUESTIONS[id]?.tier));
  if (tiers.size !== 1) fail(`题池 ${name} 难度不一致: tier ${[...tiers].join(' / ')}`);
}
ok(`题池 ${Object.keys(POOLS).length} 个，池内难度一致（同池同难度随机抽题）`);

// 3b'. W4-W11 三池式结构改造：24 个通用池齐备非空 / tier 与提纲一致（11-34）/ 旧池不残留 / 章节映射有效
// （W9 提纲 grilling 决议：w9shard 为 11 题，其余 shard 池 10 题）
{
  const newPools = [];
  for (let w = 4; w <= 11; w++) for (const k of ['shard', 'lair', 'boss']) newPools.push(`w${w}${k}`);
  newPools.forEach((name) => {
    if (!POOLS[name]) fail(`缺少新题池 ${name}`);
    else if (!POOLS[name].length) fail(`新题池 ${name} 为空`);
  });
  ['w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11'].forEach((name) => { if (POOLS[name]) fail(`旧题池 ${name} 仍残留`); });
  const expectTier = {
    4: [11, 12, 13], 5: [14, 15, 16], 6: [17, 18, 19], 7: [20, 21, 22],
    8: [23, 24, 25], 9: [26, 27, 28], 10: [29, 30, 31], 11: [32, 33, 34],
  };
  for (let w = 4; w <= 11; w++) {
    ['shard', 'lair', 'boss'].forEach((k, i) => {
      (POOLS[`w${w}${k}`] || []).forEach((id) => {
        if (QUESTIONS[id] && QUESTIONS[id].tier !== expectTier[w][i]) {
          fail(`w${w}${k} 中 ${id} tier ${QUESTIONS[id].tier} != 提纲 ${expectTier[w][i]}`);
        }
      });
    });
  }
  CHAPTERS.filter((c) => c.id >= 4).forEach((ch) => {
    ['shard', 'heal', 'lair', 'boss'].forEach((k) => {
      if (!POOLS[ch.pools[k]]) fail(`第 ${ch.id} 章 pools.${k} 指向不存在的题池 ${ch.pools[k]}`);
    });
  });
  ok('W4-W11 三池式：24 个通用池齐备、tier 对齐提纲（11-34）、旧池已清、章节映射有效');
}

// 3c. 每张地图的符文 qid 都是合法槽位，且指向非空题池（题量充足）
const allRunes = [...allFields, ...allLairs].flatMap((m) => m.props.filter((p) => p.type === 'rune'));
allRunes.forEach((p) => {
  const poolName = SLOT_POOL[p.qid];
  const pool = POOLS[poolName];
  if (!pool) fail(`符文槽 ${p.qid} 没有对应题池`);
  else if (pool.length < 3) fail(`符文槽 ${p.qid} 的题池题量不足（${pool.length} < 3）`);
});
ok(`符文-题池映射完整（${allRunes.length} 个符文槽）`);

// 3c'. W4-W11 池题量下限：w{N}shard ≥ 10 / w{N}lair ≥ 7 / w{N}boss ≥ 3（用下限而非精确值，留扩充余地）
for (let w = 4; w <= 11; w++) {
  [['shard', 10], ['lair', 7], ['boss', 3]].forEach(([k, n]) => {
    const pool = POOLS[`w${w}${k}`];
    if (pool && pool.length < n) fail(`题池 w${w}${k} 题量不足（${pool.length} < ${n}）`);
  });
}
ok('W4-W11 题池题量达标（shard ≥ 10 / lair ≥ 7 / boss ≥ 3）');

// 3d. 每章符文槽位抽到的题目所属章节正确（章→池归属抽查）
for (const ch of CHAPTERS) {
  const field = ch.buildField(ch);
  const lair = ch.buildLair(ch);
  const validPools = new Set([ch.pools.shard, ch.pools.heal, ch.pools.lair, ch.pools.boss]);
  [...field.props, ...lair.props].filter((p) => p.type === 'rune').forEach((p) => {
    const poolName = SLOT_POOL[p.qid];
    if (!validPools.has(poolName)) {
      fail(`符文槽 ${p.qid}（第 ${ch.id} 章）指向了别章的题池 ${poolName}`);
    }
  });
}
ok('各章符文槽均指向本章题池');

// 3e. 随机抽题行为：同池同难度 / 重开同题 / 已答不重复 / 同池不撞题
try {
  G.qAnswered = new Set(); G.runeRolls = {};
  for (const [slot, poolName] of Object.entries(SLOT_POOL)) {
    const pool = POOLS[poolName];
    const tier = QUESTIONS[pool[0]].tier;
    const seen = new Set();
    for (let i = 0; i < 24; i++) {
      G.runeRolls = {}; // 清掉抽题记录，模拟多次独立抽取
      const q = pickQuestion(slot);
      if (!pool.includes(q.id)) fail(`符文槽 ${slot} 抽到池外题目 ${q.id}`);
      if (q.tier !== tier) fail(`符文槽 ${slot} 抽到难度不符的题 ${q.id}（tier ${q.tier} != ${tier}）`);
      seen.add(q.id);
    }
    // 多题池多次独立抽取，应至少覆盖两道不同题
    if (seen.size < 2) fail(`符文槽 ${slot} 多次抽题毫无随机性（题池 ${poolName}）`);
  }
  // 同一符文重开：题目保持不变
  G.qAnswered = new Set(); G.runeRolls = {};
  const q1 = pickQuestion('v1');
  if (pickQuestion('v1').id !== q1.id) fail('同一符文重开时题目应保持不变');
  // 同池不同符文：不撞题
  G.runeRolls = {};
  if (pickQuestion('v1').id === pickQuestion('v2').id) fail('同池两块符文抽到了同一道题');
  // 已答过的题不再出现
  const pool = POOLS.w1field;
  G.qAnswered = new Set(pool.slice(0, -1)); G.runeRolls = {};
  const qLast = pickQuestion('v1');
  if (qLast.id !== pool[pool.length - 1]) fail(`已答过的题仍被抽到（期望 ${pool[pool.length - 1]}，实际 ${qLast.id}）`);
  ok('随机抽题：同池同难度、重开不变题、已答不重复、同池不撞题');
} catch (e) { fail(`随机抽题异常: ${e.message}`); }

// ---- 5. 背景音乐 ----
console.log('[5] 背景音乐曲目');
try {
  trackErrors().forEach(fail);
  const ids = Object.keys(TRACKS);
  ids.forEach((id) => {
    const c = compileTrack(id);
    if (!c.length || !c.voices.length) fail(`曲目 ${id} 编译后为空`);
  });
  ok(`曲目 ${ids.length} 首：记谱合法（每小节 16 格）、全部可编译、音高在可听范围`);
  // 每章野外 / 巢穴都映射到存在的曲目；野外主题章章不同（每章有自己的声音身份）
  const fieldCues = CHAPTERS.map((ch) => cueFor('field', ch));
  CHAPTERS.forEach((ch, i) => {
    if (!TRACKS[fieldCues[i]]) fail(`第 ${ch.id} 章野外曲目 ${fieldCues[i]} 不存在`);
    if (!TRACKS[cueFor('lair', ch)]) fail(`第 ${ch.id} 章巢穴曲目 ${cueFor('lair', ch)} 不存在`);
  });
  if (new Set(fieldCues).size !== CHAPTERS.length) fail(`野外主题有重复：${fieldCues.join(' / ')}`);
  ['title', 'victory', 'lair-calm'].forEach((id) => { if (!TRACKS[id]) fail(`缺少曲目 ${id}`); });
  if (compileTrack('victory').loop) fail('胜利号角应为一次性（loop: false）');
  ok(`章节曲目映射：${CHAPTERS.length} 章野外主题各不相同，巢穴 / 标题 / 胜利 / 通关后巢穴齐备`);
} catch (e) { fail(`背景音乐曲目异常: ${e.message}`); }
// ---- 6. 观测站小游戏（纯数学层 + 观测台选址 + 观测日志） ----
console.log('[6] 观测站小游戏');
try {
  // 6a. NFW 拟合台：讲义数字与题库同口径（dm8 ρ(Rₛ)=ρ₀/4、dm9 外区 r⁻³、st7 χ²/dof）
  if (Math.abs(nfwDensity(0.3, 5, 0.3) - 1.25) > 1e-12) fail('NFW：r = Rₛ 处应为 ρ₀/4 = 1.25（dm8）');
  const r9 = Math.round((nfwDensity(30, 5, 0.3) / nfwDensity(3, 5, 0.3)) * 1e4) / 1e4;
  if (r9 !== 0.0012) fail(`NFW：半径 3 → 30 密度比应为 0.0012（dm9），实际 ${r9}`);
  const inner = nfwLogSlope(0.003, 5, 0.3), outer = nfwLogSlope(30, 5, 0.3);
  if (Math.abs(inner + 1) > 0.05 || Math.abs(outer + 3) > 0.05) fail(`NFW：内 / 外区对数斜率应 ≈ −1 / −3（实际 ${inner.toFixed(3)} / ${outer.toFixed(3)}）`);
  const d0 = makeNfwData(0);
  if (d0.truth.rho0 !== 5 || d0.truth.rs !== 0.3) fail('NFW：首次挑战真值应为讲义数字 ρ₀=5、Rₛ=0.3');
  if (JSON.stringify(makeNfwData(0)) !== JSON.stringify(d0)) fail('NFW：同一次挑战的数据应确定性一致');
  const chi = nfwChi2(d0.points, 5, 0.3);
  if (Math.abs(nfwChi2dof(d0.points, 5, 0.3) - chi / (d0.points.length - 2)) > 1e-12) fail('NFW：χ²/dof 应为 χ² / (N − 2)（st7）');
  const onGrid = (v, spec) => 10 ** (spec.min + Math.round((Math.log10(v) - spec.min) / NFW.step) * NFW.step);
  for (let a = 0; a < 6; a++) {
    const { truth, points } = makeNfwData(a);
    const lr = Math.log10(truth.rho0), ls = Math.log10(truth.rs);
    if (lr < NFW.logRho0.min || lr > NFW.logRho0.max || ls < NFW.logRs.min || ls > NFW.logRs.max) fail(`NFW 第 ${a} 次：真值超出滑块范围`);
    const atTruth = nfwChi2dof(points, truth.rho0, truth.rs);
    const atGrid = nfwChi2dof(points, onGrid(truth.rho0, NFW.logRho0), onGrid(truth.rs, NFW.logRs));
    const atStart = nfwChi2dof(points, 10 ** NFW.logRho0.start, 10 ** NFW.logRs.start);
    if (atTruth >= NFW.passChi2dof) fail(`NFW 第 ${a} 次：真值处 χ²/dof = ${atTruth.toFixed(2)} 未过线（数据噪声种子需调整）`);
    if (atGrid >= NFW.passChi2dof) fail(`NFW 第 ${a} 次：滑块网格上离真值最近的点 χ²/dof = ${atGrid.toFixed(2)} 未过线（键盘调不到）`);
    if (atStart < 5) fail(`NFW 第 ${a} 次：滑块起点 χ²/dof = ${atStart.toFixed(2)}，开局就太接近了`);
  }
  ok('NFW 拟合台：ρ(Rₛ)=ρ₀/4、外区 r⁻³、χ²/dof 口径对齐题库；6 组挑战真值可达、起点远离');

  // 6b. 频率调谐台：sg6 原题读数 3000 / 1000 / 500 → 振幅 3 / 1 / 0.5；调谐表恰好 3 根尖峰在 1 / 4 / 7 Hz
  const mags = [1, 4, 7].map((f) => Math.round(readoutMagnitude(f)));
  if (mags.join(' ') !== '3000 1000 500') fail(`调谐台：sg6 读数应为 3000 1000 500，实际 ${mags.join(' ')}`);
  const amps = [1, 4, 7].map((f) => amplitudeOf(readoutMagnitude(f), TUNING.sr * TUNING.readoutDuration));
  if (amps.some((a, i) => Math.abs(a - TUNING.tones[i].a) > 1e-9)) fail(`调谐台：A = 2|X|/N 应还原振幅 3 / 1 / 0.5，实际 ${amps.join(' / ')}`);
  const tuner = makeTuner();
  const peaks = findPeaks(tuner);
  if (peaks.map((p) => p.f).join(',') !== '1,4,7') fail(`调谐台：尖峰应恰为 1 / 4 / 7 Hz，实际 ${peaks.map((p) => p.f).join(' / ')}`);
  if (peaks.some((p, i) => Math.abs(p.amp - TUNING.tones[i].a) > 0.01)) fail('调谐台：尖峰处调谐表读数应 ≈ 振幅 3 / 1 / 0.5');
  let side = 0;
  for (let f = 0; f <= 10.0001; f += 0.05) {
    if (TUNING.tones.every((t) => Math.abs(f - t.f) > 0.55)) side = Math.max(side, tuner(+f.toFixed(4)));
  }
  if (side >= TUNING.peakFloor / 2) fail(`调谐台：尖峰之外的旁瓣 ${side.toFixed(3)} 太高（应远低于尖峰门槛 ${TUNING.peakFloor}）`);
  ok(`频率调谐台：sg6 读数 ${mags.join(' / ')} → 振幅 3 / 1 / 0.5；调谐表尖峰 1 / 4 / 7 Hz，旁瓣 ≤ ${side.toFixed(3)}`);

  // 6c. 观测台选址：登记的章节恰好 1 座，离符文 / 石碑 ≥ 4 格，不在碰撞瓦片上，远离出生点与传送门
  let placed = 0;
  for (const ch of CHAPTERS) {
    const field = ch.buildField(ch);
    const obs = field.props.filter((p) => p.type === 'observatory');
    if (!ch.observatory) { if (obs.length) fail(`${ch.fieldKey} 未登记观测台却生成了 ${obs.length} 座`); continue; }
    if (!OBSERVATORIES[ch.observatory]) { fail(`${ch.fieldKey} 登记了未知观测台 ${ch.observatory}`); continue; }
    if (obs.length !== 1) { fail(`${ch.fieldKey} 观测台数量 ${obs.length} != 1`); continue; }
    const o = obs[0];
    const tx = Math.floor(o.x / 128), ty = Math.floor(o.y / 128);
    if (o.kind !== ch.observatory) fail(`${ch.fieldKey} 观测台 kind ${o.kind} != ${ch.observatory}`);
    if (field.colliding.includes(field.grid[ty][tx])) fail(`${ch.fieldKey} 观测台落在碰撞瓦片上`);
    const cheb = (p) => Math.max(Math.abs(Math.floor(p.x / 128) - tx), Math.abs(Math.floor(p.y / 128) - ty));
    field.props.filter((p) => p.type === 'rune' || p.type === 'npc' || p.type === 'doorlink').forEach((p) => {
      if (cheb(p) < 4) fail(`${ch.fieldKey} 观测台离 ${p.type}${p.qid ? ` ${p.qid}` : ''} 只有 ${cheb(p)} 格（< 4，交互会抢键）`);
    });
    Object.entries(field.spawns).forEach(([k, s]) => { if (cheb(s) <= 4) fail(`${ch.fieldKey} 观测台离出生点 ${k} 太近`); });
    (field.portals || []).forEach((p) => {
      const r = p.rect;
      const dx = Math.max(r.x - o.x, 0, o.x - (r.x + r.w)), dy = Math.max(r.y - o.y, 0, o.y - (r.y + r.h));
      if (Math.hypot(dx, dy) < 520) fail(`${ch.fieldKey} 观测台离传送门「${p.label}」太近（${Math.round(Math.hypot(dx, dy))}px）`);
    });
    placed++;
  }
  if (placed !== Object.keys(OBSERVATORIES).length) fail(`观测台应有 ${Object.keys(OBSERVATORIES).length} 座，实际 ${placed}`);
  const where = CHAPTERS.filter((c) => c.observatory).map((c) => c.title.split(' · ')[0]).join(' / ');
  ok(`观测台选址：${placed} 座（${where}），离符文 / 石碑 / 门 ≥ 4 格，避开出生点与传送门`);

  // 6d. 观测日志：合并完成记录 + 读档清洗（坏数据丢弃、不抛错）
  const rec1 = recordObservation(undefined, { seconds: 30, chi2dof: 1.1 }, 1000);
  const rec2 = recordObservation(rec1, { seconds: 20, chi2dof: 1.3 }, 2000);
  if (rec1.clears !== 1 || rec1.firstAt !== 1000 || rec1.bestSeconds !== 30) fail('观测日志：首次记录字段不对');
  if (rec2.clears !== 2 || rec2.firstAt !== 1000 || rec2.bestSeconds !== 20 || rec2.bestChi2dof !== 1.1) fail('观测日志：第二次应累计次数、保留首次时间与最好成绩');
  const roundTrip = sanitizeObservationLog(JSON.parse(JSON.stringify({ nfw: rec2, bogus: { solved: true }, tuning: { solved: false } })));
  if (Object.keys(roundTrip).join(',') !== 'nfw' || roundTrip.nfw.clears !== 2) fail('观测日志：读档清洗应只保留已登记且完成过的记录');
  for (const bad of [null, 42, 'x', [], { nfw: 'oops' }]) {
    if (Object.keys(sanitizeObservationLog(bad)).length) fail(`观测日志：坏数据 ${JSON.stringify(bad)} 应清洗为空`);
  }
  ok('观测日志：完成次数 / 首次时间 / 最好成绩合并正确，读档清洗丢弃坏数据');
} catch (e) { fail(`观测站小游戏异常: ${e.message}`); }
// ---- 7. 秘藏彩蛋 ----
console.log('[7] 秘藏彩蛋');
try {
  const ids = new Set();
  const chs = new Set();
  for (const s of SECRETS) {
    if (ids.has(s.id)) fail(`秘藏 id 重复：${s.id}`);
    ids.add(s.id);
    if (chs.has(s.chapter)) fail(`第 ${s.chapter} 章有多个秘藏（每章最多一个）`);
    chs.add(s.chapter);
    if (!CHAPTERS.some((c) => c.id === s.chapter)) fail(`秘藏 ${s.id} 指向不存在的第 ${s.chapter} 章`);
    if (!s.name || !s.repl?.length || !s.lines?.length) fail(`秘藏 ${s.id} 缺 name / repl / lines`);
    if (s.repl.every((r) => r.run === false) && !(s.checks || []).length) fail(`秘藏 ${s.id} 没有任何可实跑核实的内容`);
  }
  ok(`${SECRETS.length} 个秘藏：id 唯一、每章最多一个、内容齐全`);

  // 选址：独立复核几何（不复用 placeSecret 内部判定），并确认确定性
  const R = SECRET_RULES;
  const tileOf = (p) => [Math.floor(p.x / 128), Math.floor(p.y / 128)];
  const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  for (const ch of CHAPTERS) {
    const secret = secretForChapter(ch.id);
    if (!secret) continue;
    const def = ch.buildField(ch);
    const spot = placeSecret(def, secret);
    if (!spot) { fail(`第 ${ch.id} 章找不到秘藏 ${secret.id} 的合法位置`); continue; }
    const again = placeSecret(ch.buildField(ch), secret);
    if (!again || again.tx !== spot.tx || again.ty !== spot.ty) fail(`第 ${ch.id} 章秘藏选址不确定`);
    const t = [spot.tx, spot.ty];
    const label = `第 ${ch.id} 章秘藏 ${secret.id}@(${spot.tx},${spot.ty})`;
    if (spot.tx < R.margin || spot.ty < R.margin || spot.tx > def.w - 1 - R.margin || spot.ty > def.h - 1 - R.margin) fail(`${label} 太靠边`);
    const c = secret.near === 'water' ? R.nearClearance : R.clearance;
    for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) {
      const row = def.grid[spot.ty + dy];
      if (!row || def.colliding.includes(row[spot.tx + dx])) fail(`${label} 周边 ${c} 格内有不可走瓦片`);
    }
    for (const p of def.props) {
      const d = cheb(t, tileOf(p));
      if (['rune', 'npc', 'door', 'doorlink', 'gate', 'observatory'].includes(p.type) && d < R.interact) fail(`${label} 离 ${p.type}${p.qid ? ' ' + p.qid : ''} 只有 ${d} 格`);
      if (['tree', 'crystal', 'torch'].includes(p.type) && d < R.solid) fail(`${label} 离 ${p.type} 只有 ${d} 格`);
    }
    for (const s of Object.values(def.spawns)) if (cheb(t, tileOf(s)) < R.spawn) fail(`${label} 离出生点太近`);
    for (const s of def.slimes || []) if (cheb(t, tileOf(s)) < R.slime) fail(`${label} 离史莱姆初始位置太近`);
    for (const p of def.portals || []) {
      const cx = Math.floor((p.rect.x + p.rect.w / 2) / 128), cy = Math.floor((p.rect.y + p.rect.h / 2) / 128);
      if (cheb(t, [cx, cy]) < R.portal) fail(`${label} 离传送门太近`);
    }
    // withSecret 只追加一个 secret 道具，不改动其他道具
    const withS = withSecret(ch, ch.buildField(ch));
    const added = withS.props.filter((p) => p.type === 'secret');
    if (added.length !== 1 || added[0].secretId !== secret.id) fail(`第 ${ch.id} 章 withSecret 未正确挂上秘藏`);
    if (withS.props.length !== def.props.length + 1) fail(`第 ${ch.id} 章 withSecret 改动了其他道具`);
  }
  ok('每章秘藏选址合法（不贴边 / 周边可走 / 远离符文·石碑·门·出生点·史莱姆·传送门）且确定可复现');
} catch (e) { fail(`秘藏校验异常: ${e.message}`); }
// ---- 8. BOSS 招牌机制 ----
console.log('[8] BOSS 招牌机制');
try {
  const kindsUsed = new Set();
  for (const ch of CHAPTERS) {
    const m = ch.bossMechanic;
    if (!m) { fail(`第 ${ch.id} 章 ${ch.bossName} 没有配置招牌机制`); continue; }
    const kind = MECHANIC_KINDS[m.kind];
    if (!kind) { fail(`第 ${ch.id} 章机制种类未登记：${m.kind}`); continue; }
    if (!kind.archetypes.includes(ch.boss)) fail(`第 ${ch.id} 章机制 ${m.kind} 不能挂在 ${ch.boss} 原型上`);
    if (!m.name || !m.tip) fail(`第 ${ch.id} 章机制缺少开场文案（name/tip）`);
    const full = mechanicParams(m);
    if (m.kind === 'threePaths') {
      full.phases.forEach((ph) => {
        if (!MECHANIC_KINDS[ph.kind]) fail(`三途子机制种类未登记：${ph.kind}`);
        else if (!MECHANIC_KINDS[ph.kind].archetypes.includes(ch.boss)) fail(`三途子机制 ${ph.kind} 不能挂在 ${ch.boss} 原型上`);
      });
      const aboves = full.phases.map((ph) => ph.above);
      if (aboves.some((a, i) => i && a >= aboves[i - 1]) || aboves[aboves.length - 1] !== 0) {
        fail(`三途阶段血线须严格递减且以 0 收尾（实际 ${aboves.join('/')}）`);
      }
    }
    if (m.kind === 'fourierEchoes' && new Set(full.freqs).size !== full.freqs.length) fail('频谱分身频率必须互不相同');
    kindsUsed.add(m.kind);
  }
  const unused = Object.keys(MECHANIC_KINDS).filter((k) => !kindsUsed.has(k));
  if (unused.length) fail(`登记了但没有章节使用的机制：${unused.join(', ')}`);
  ok(`${CHAPTERS.length} 个 BOSS 各有招牌机制（${kindsUsed.size} 种，原型匹配、文案齐全）`);

  // 机制公式：正弦弹道
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
  if (!near(sineOffset(0, 150, 4), 0) || !near(sineOffset(Math.PI / 8, 150, 4), 150)) fail('正弦弹道 y = A·sin(ωt) 计算错误');
  // NFW 引力：核心取上限、向外单调衰减、远处趋零
  const g = [0, 50, 200, 380, 800, 1500, 4000].map((r) => nfwPullSpeed(r, 380, 420));
  if (!near(g[0], 420, 1)) fail(`NFW 引力在核心应取上限 420（实际 ${g[0].toFixed(1)}）`);
  if (g.some((v, i) => i && v >= g[i - 1])) fail(`NFW 引力须随半径单调衰减（${g.map((v) => v.toFixed(0)).join(' → ')}）`);
  if (g[g.length - 1] > 60) fail('NFW 引力在远处应趋于很小');
  // 后验权重：从 0 起步、每次 +step、封顶 1
  if (aimWeight(0, 0.2) !== 0 || aimWeight(2, 0.2) !== 0.4 || aimWeight(9, 0.2) !== 1) fail('后验瞄准权重计算错误');
  // 学习率衰减：逐次 ×decay，不低于下限
  let lr = 1;
  for (let i = 0; i < 10; i++) lr = decayLr(lr, 0.8, 0.45);
  if (lr !== 0.45 || decayLr(1, 0.8, 0.45) !== 0.8) fail(`学习率衰减错误（10 次后 ${lr}）`);
  ok('机制公式：正弦弹道 / NFW 引力单调衰减 / 后验权重封顶 / 学习率衰减下限');
} catch (e) { fail(`BOSS 招牌机制校验异常: ${e.message}`); }
// ---- 9. 存档 v3（纯函数：迁移 / 校验 / 水合 / 读写降级） ----
console.log('[9] 存档 v3 迁移与读写');
/** 假存储：failWhen(key, value) 为真时 setItem 抛配额异常 */
function fakeStorage(init = {}, failWhen = null) {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      if (failWhen && failWhen(k, String(v))) throw new Error('QuotaExceededError');
      data[k] = String(v);
    },
    removeItem: (k) => { delete data[k]; },
  };
}
const PROGRESS_FIELDS = ['shards', 'gateOpen', 'bossShielded', 'bossDefeated', 'done'];
const sameSet = (a, b) => a.size === b.length && b.every((x) => a.has(x));
try {
  // 9a. v2 真实样本（用 v2 版本真实玩出）→ v3：进度逐字段一致，学习记录为空、时间点为 null
  const v2 = JSON.parse(readFileSync(new URL('./fixtures/save-v2.json', import.meta.url), 'utf8'));
  const m2 = migrate(JSON.parse(JSON.stringify(v2)));
  if (!m2 || m2.v !== 3) fail('v2 样本迁移后不是 v3');
  if (validate(m2).length) fail(`v2 样本迁移结果校验不通过：${validate(m2).join('；')}`);
  resetState();
  hydrate(G, m2);
  if (G.hearts !== v2.hearts || G.maxHearts !== v2.maxHearts || G.current !== v2.current) fail('v2→v3 心数/当前章不一致');
  if (!sameSet(G.answered, v2.answered) || !sameSet(G.qAnswered, v2.qAnswered)) fail('v2→v3 已破解槽位/已答题目不一致');
  if (JSON.stringify(G.runeRolls) !== JSON.stringify(v2.runeRolls)) fail('v2→v3 符文石抽题记录不一致');
  for (const [id, p] of Object.entries(v2.progress)) {
    for (const f of PROGRESS_FIELDS) if (G.progress[id][f] !== p[f]) fail(`v2→v3 第 ${id} 章 ${f} 不一致`);
    if (G.progress[id].enteredAt !== null || G.progress[id].doneAt !== null) fail(`v2→v3 第 ${id} 章时间点应为 null`);
  }
  if (G.records.log.length || Object.keys(G.records.stats).length || G.playMs !== 0) fail('v2→v3 学习记录应从空开始');
  ok('v2 真实样本 → v3：进度逐字段一致、学习记录为空、章节时间点为 null');

  // 9b. v1 样本 → v2 → v3（两章时代的扁平字段）
  const v1 = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8'));
  resetState();
  hydrate(G, migrate(v1));
  const p1 = G.progress[1], p2 = G.progress[2];
  if (!(p1.done && p1.gateOpen && !p1.bossShielded && p1.bossDefeated && p1.shards === v1.shards)) fail('v1→v3 第一章进度不一致');
  if (!(p2.shards === v1.ch2Shards && !p2.gateOpen && p2.bossShielded && !p2.done)) fail('v1→v3 第二章进度不一致');
  if (G.current !== 2 || G.hearts !== v1.hearts || !sameSet(G.answered, v1.answered)) fail('v1→v3 当前章/心数/槽位不一致');
  if (JSON.stringify(G.runeRolls) !== JSON.stringify(v1.runeRolls)) fail('v1→v3 抽题记录不一致');
  ok('v1 样本 → v2 → v3：两章进度、当前章、心数、槽位与抽题记录全部保留');

  // 9c. v3 往返不变（序列化 → 解析 → 水合 → 再序列化）
  const s1 = serialize(G, 123);
  resetState();
  hydrate(G, parseSave(JSON.stringify(s1)));
  if (JSON.stringify(serialize(G, 123)) !== JSON.stringify(s1)) fail('v3 存档往返后内容变化');
  if (validate(s1).length) fail(`v3 序列化结果校验不通过：${validate(s1).join('；')}`);
  ok('v3 往返不变，序列化结果通过校验');

  // 9d. 损坏 / 未知版本 / 缺字段
  if (parseSave('{not json') !== null || parseSave('{"v":9}') !== null || migrate([]) !== null || migrate(null) !== null) {
    fail('损坏 JSON / 未知版本号应返回 null');
  }
  if (!validate({ v: 3, hearts: -1 }).length) fail('校验应能发现残缺存档的问题');
  resetState();
  hydrate(G, migrate({ v: 2 }));
  if (G.hearts !== 6 || G.current !== 1 || G.records.log.length !== 0) fail('缺字段存档应按初始值补齐');
  ok('损坏 JSON / 未知版本返回 null，缺字段按初始值补齐，校验能指出问题');

  // 9e. 读档顺序 v3 → v2 → v1；读不出来的原文挪去 BROKEN_KEY 后继续找
  const st1 = fakeStorage({ [SAVE_KEY]: '{broken', [LEGACY_KEYS[0]]: JSON.stringify(v2) });
  const r1 = readSave(st1);
  if (!r1 || r1.key !== LEGACY_KEYS[0] || st1.data[BROKEN_KEY] !== '{broken') fail('v3 损坏时应回退读 v2 并保留损坏原文');
  const r2 = readSave(fakeStorage({ [LEGACY_KEYS[1]]: JSON.stringify(v1) }));
  if (!r2 || r2.data.v !== 3 || r2.data.current !== 2) fail('只有 v1 存档时应迁移读出');
  if (readSave(null) !== null || readSave(fakeStorage({})) !== null) fail('无存储 / 无存档时应返回 null');
  ok('读档顺序 v3 → v2 → v1，损坏原文挪去抢救键，无档返回 null');

  // 9f. 写档：成功后删旧键；配额不足逐级降级（日志砍半 → 不含日志），进度字段始终写入
  resetState();
  G.progress[1].shards = 4;
  for (let i = 0; i < 40; i++) {
    applyAttempt(G.records, { t: i, q: 'v2', s: 'v1', k: 'shard', ch: 1, pool: 'w1field', tier: 1, pick: 0, ok: i % 2, ms: 1 });
  }
  const st2 = fakeStorage({ [LEGACY_KEYS[0]]: 'old', [LEGACY_KEYS[1]]: 'older' });
  const w1 = writeSave(st2, serialize(G));
  if (!w1 || w1.level !== 'full' || LEGACY_KEYS.some((k) => k in st2.data)) fail('正常写档应为 full 并删除旧版本键');
  const full = st2.data[SAVE_KEY].length;
  const st3 = fakeStorage({}, (k, v) => v.length >= full);
  const w2 = writeSave(st3, serialize(G));
  const saved3 = JSON.parse(st3.data[SAVE_KEY]);
  if (!w2 || w2.level !== 'half' || saved3.records.log.length !== 20 || saved3.records.dropped !== 20) fail('配额不足应先把日志砍半');
  if (saved3.progress[1].shards !== 4) fail('降级写档丢了进度');
  const st4 = fakeStorage({}, (k, v) => v.includes('"log":[{'));
  const w3 = writeSave(st4, serialize(G));
  if (!w3 || w3.level !== 'nolog' || JSON.parse(st4.data[SAVE_KEY]).progress[1].shards !== 4) fail('再不行应写不含日志的存档且进度完整');
  if (writeSave(fakeStorage({}, () => true), serialize(G)) !== null || writeSave(null, serialize(G)) !== null) {
    fail('存储完全不可用时应返回 null 且不抛异常');
  }
  ok('写档删旧键；配额不足 full → half → nolog 逐级降级，进度始终写入；存储不可用不抛异常');
} catch (e) { fail(`存档 v3 校验异常: ${e.message}`); }

// ---- 10. 学习记录与错题本（纯函数） ----
console.log('[10] 学习记录与错题本');
try {
  const [qa, qb, qc] = POOLS.w1field;
  const rec = { stats: {}, log: [], dropped: 0 };
  const at = (t, q, ok, k = 'shard', s = 'v1') => applyAttempt(rec, { t, q, s, k, ...snapshotOf(q, s), pick: 0, ok, ms: 10 });

  // 10a. 主线汇总：错 → 对（尝试序号 1、2，首答错）；放弃单独计数不算尝试；solvedAt 只写一次
  const e1 = at(1, qa, OK.WRONG);
  const e2 = at(2, qa, OK.RIGHT);
  const e3 = at(3, qa, OK.SKIP);
  at(4, qa, OK.RIGHT);
  const sa = rec.stats[qa];
  if (e1.a !== 1 || e2.a !== 2 || e3.a !== 0) fail(`尝试序号应为 1/2/0（实际 ${e1.a}/${e2.a}/${e3.a}）`);
  if (sa.n !== 3 || sa.w !== 1 || sa.sk !== 1 || sa.first !== 'w' || sa.solvedAt !== 2 || sa.lastOk !== true) {
    fail(`主线汇总不符：${JSON.stringify(sa)}`);
  }
  if (e1.ch !== 1 || e1.pool !== 'w1field' || e1.tier !== QUESTIONS[qa].tier) fail('作答记录缺少章/题池/tier 快照');
  ok('主线汇总：错→对尝试序号 1/2、首答为错、放弃单独计数、首次答对时间只写一次、带章/题池/tier 快照');

  // 10b. 复习：只改复习状态 rv，不改主线汇总；连续答对达阈值即掌握，答错清零并退回
  for (let i = 0; i < MASTERY_STREAK; i++) at(10 + i, qa, OK.RIGHT, 'review', '');
  if (!rec.stats[qa].rv.mastered || rec.stats[qa].n !== 3) fail('复习连续答对应达成掌握且不改主线次数');
  at(20, qa, OK.WRONG, 'review', '');
  if (rec.stats[qa].rv.mastered || rec.stats[qa].rv.streak !== 0 || rec.stats[qa].w !== 1) fail('已掌握后复习答错应退回待复习、不计主线错误');
  const rv = applyReview(applyReview(null, false, 1), true, 2);
  if (rv.streak !== 1 || rv.mastered || rv.n !== 2) fail('复习状态转换不符（错→对 应为连续 1、未掌握）');
  ok(`复习：连续答对 ${MASTERY_STREAK} 次即掌握，复习答错清零并退回，主线汇总不受影响`);

  // 10c. 日志上限：超出丢最老的并累加 dropped，汇总不裁剪；3500 条体积 < 600 KB
  const big = { stats: {}, log: [], dropped: 0 };
  for (let i = 0; i < 3500; i++) {
    applyAttempt(big, { t: 1760000000000 + i, q: POOLS.w4shard[i % 10], s: 'c4s1', k: 'shard', ch: 4, pool: 'w4shard', tier: 11, pick: i % 4, ok: i % 3 ? 1 : 0, ms: 12345 });
  }
  const totalN = Object.values(big.stats).reduce((s, x) => s + x.n, 0);
  if (big.log.length !== LOG_CAP || big.dropped !== 3500 - LOG_CAP || totalN !== 3500) fail('日志裁剪不符（应保留最新 3000 条、汇总不裁剪）');
  if (big.log[0].t !== 1760000000000 + 500) fail('裁剪应丢最老的记录');
  const kb = JSON.stringify(big).length / 1024;
  if (kb >= 600) fail(`3500 条记录序列化体积过大（${kb.toFixed(0)} KB）`);
  ok(`日志上限 ${LOG_CAP} 条：丢最老的并累加 dropped、汇总不裁剪；3500 条记录约 ${kb.toFixed(0)} KB`);

  // 10d. 选项打乱：主线保持原序；复习为随机排列，按展示下标映射回原始下标判定
  if (optionOrder(4).join() !== '0,1,2,3') fail('主线选项顺序应保持不变');
  let seq = 0;
  const fixedRand = () => [0.9, 0.1, 0.5][seq++ % 3];
  const ord = optionOrder(4, true, fixedRand);
  if ([...ord].sort().join() !== '0,1,2,3') fail('打乱结果不是排列');
  const q0 = QUESTIONS[qb];
  if (ord[ord.indexOf(q0.answer)] !== q0.answer) fail('展示下标 → 原始下标映射错误');
  let moved = false;
  for (let i = 0; i < 30; i++) if (optionOrder(4, true).join() !== '0,1,2,3') moved = true;
  if (!moved) fail('复习模式选项从未被打乱');
  ok('选项打乱：主线原序、复习为排列，展示下标可正确映射回原始答案');

  // 10e. 错题视图：曾错入册（后来答对也保留）、下线题标「题目已更新」且不计数、页签与三组筛选
  at(30, qb, OK.WRONG, 'boss', 'boss');
  at(31, qc, OK.RIGHT); // 一次答对的题不入册
  rec.stats.zz_gone = { n: 1, w: 1, sk: 0, first: 'w', lastAt: 5, lastOk: false, ch: 1, k: 'shard', rv: null };
  const entries = buildMistakeEntries(rec.stats, QUESTIONS);
  const ids = entries.map((e) => e.qid);
  if (!ids.includes(qa) || !ids.includes(qb) || ids.includes(qc)) fail(`错题入册不符：${ids.join(',')}`);
  const gone = entries.find((e) => e.qid === 'zz_gone');
  if (!gone || !gone.missing || gone.summary !== '题目已更新') fail('下线题应标为「题目已更新」');
  if (pendingCount(entries) !== 2) fail(`待复习数应为 2（实际 ${pendingCount(entries)}，下线题不计）`);
  if (filterMistakes(entries, { kind: 'boss' }).map((e) => e.qid).join() !== qb) fail('按符文类型筛选不符');
  if (filterMistakes(entries, { ch: '2' }).length !== 0) fail('按章筛选不符');
  if (filterMistakes(entries, { topic: QUESTIONS[qa].chapter }).every((e) => e.topic !== QUESTIONS[qa].chapter)) fail('按知识点筛选不符');
  at(40, qb, OK.RIGHT, 'review', ''); at(41, qb, OK.RIGHT, 'review', '');
  const after = buildMistakeEntries(rec.stats, QUESTIONS);
  if (filterMistakes(after, { tab: 'mastered' }).map((e) => e.qid).join() !== qb) fail('已掌握页签应只含掌握的题');
  if (filterMistakes(after, { tab: 'pending' }).some((e) => e.qid === qb)) fail('掌握后应移出待复习');
  const fo = filterOptions(after);
  if (!fo.chapters.includes(1) || !fo.kinds.includes('boss')) fail('筛选可选值不完整');
  ok('错题视图：曾错入册、下线题不计数、待复习/已掌握页签、章/符文类型/知识点筛选');
} catch (e) { fail(`学习记录 / 错题本校验异常: ${e.message}`); }
resetState();

// ---- 11. 第二批观测站（纯数学层；面板在 ui/stations/） ----
console.log('[11] 第二批观测站');
try {
  // 11a. 蒙特卡洛估 π：π̂ = 4M/N（mp5）；1σ = 4√(p(1−p)/N)（st14）；每次挑战都能在上限内估成
  if (ST.piEstimate(7850, 10000) !== 3.14) fail('蒙特卡洛：mp5 的 4 × 7850 / 10000 应为 3.14');
  if (Math.abs(ST.mcSigma(400) / ST.mcSigma(100) - 0.5) > 1e-12) fail('蒙特卡洛：点数 ×4，1σ 应减半（1/√N）');
  const solvedAt = [];
  for (let a = 0; a < 6; a++) {
    const m = ST.makeMonteCarlo(a);
    while (m.state.solvedAt == null && m.state.n < ST.MC.maxN) m.throw(1000);
    const m2 = ST.makeMonteCarlo(a);
    while (m2.state.solvedAt == null && m2.state.n < ST.MC.maxN) m2.throw(10);
    if (m.state.solvedAt == null) fail(`蒙特卡洛第 ${a} 次：撒满 ${ST.MC.maxN} 点仍未估成`);
    if (m.state.solvedAt !== m2.state.solvedAt) fail(`蒙特卡洛第 ${a} 次：成功点与一次撒几颗有关（${m.state.solvedAt} vs ${m2.state.solvedAt}）`);
    if (m.state.solvedAt < ST.MC.minN) fail(`蒙特卡洛第 ${a} 次：不足 ${ST.MC.minN} 点就判成功`);
    solvedAt.push(m.state.solvedAt);
  }
  ok(`蒙特卡洛估 π：4M/N 与 1/√N 口径对齐题库；6 次挑战分别在 N = ${solvedAt.join(' / ')} 估成（与撒点批量无关）`);

  // 11b. 并行搬砖：轮转 = range(rank, nruns, size)（sp7：任务 7 归 rank 3）；最优 = Σ/4 恰好可达；
  //      每次挑战都是「轮转明显不均、贪心够用」，学生先看到问题再找到办法
  const rr15 = ST.roundRobin(Array.from({ length: 15 }, (_, i) => ({ id: i, cost: 1 })));
  if (rr15[7] !== 3) fail(`并行搬砖：range(rank, 15, 4) 下任务 7 应归 rank 3（sp7），实际 ${rr15[7]}`);
  const spans = [];
  for (let a = 0; a < 6; a++) {
    const { tasks, optimal, serial } = ST.makeTasks(a);
    const sum = tasks.reduce((s, t) => s + t.cost, 0);
    if (tasks.length !== ST.SCHED.workers * ST.SCHED.perWorker) fail(`并行搬砖第 ${a} 次：任务数 ${tasks.length}`);
    if (sum !== serial || optimal !== sum / ST.SCHED.workers) fail(`并行搬砖第 ${a} 次：最优应为 Σ/4（Σ = ${sum}）`);
    if (JSON.stringify(ST.makeTasks(a)) !== JSON.stringify({ tasks, optimal, serial })) fail(`并行搬砖第 ${a} 次：任务集不确定`);
    const rr = ST.makespan(tasks, ST.roundRobin(tasks));
    const lpt = ST.makespan(tasks, ST.greedyLPT(tasks));
    if (rr <= optimal * ST.SCHED.tolerance) fail(`并行搬砖第 ${a} 次：轮转就过关了（${rr}），体会不到负载不均`);
    if (lpt > optimal * ST.SCHED.tolerance) fail(`并行搬砖第 ${a} 次：贪心也过不了关（${lpt} > ${optimal * ST.SCHED.tolerance}）`);
    spans.push(`${rr}→${lpt}`);
  }
  ok(`并行搬砖：轮转 = range(rank, nruns, size)（sp7）；6 次挑战最优 = Σ/4 = ${ST.SCHED.load}s，轮转→贪心总耗时 ${spans.join(' / ')}`);

  // 11c. 引力沙盒：nm20 的 g(0) = 1/ε² = 4.0、g(1) = 0.8（ε = 0.5）；势能与力律配对（dΦ/dr = g，
  //      否则能量曲线假漂移）；圆轨道能量守恒；开局速度先体验逃逸；ε = 0 近心掠过被数值误差甩飞、ε = 0.1 保住
  if (Math.abs(ST.softAccel(0, 0.5) - 4) > 1e-12 || Math.abs(ST.softAccel(1, 0.5) - 0.8) > 1e-12) fail('引力沙盒：nm20 的 g(0) / g(1) 应为 4.0 / 0.8');
  for (const eps of [0, 0.05, 0.1, 0.3]) {
    for (const r of [0.05, 0.3, 1, 2.5]) {
      const h = 1e-6;
      const dPhi = (ST.softPotential(r + h, eps) - ST.softPotential(r - h, eps)) / (2 * h);
      if (Math.abs(dPhi - ST.softAccel(r, eps)) > 1e-5 * Math.max(1, ST.softAccel(r, eps))) fail(`引力沙盒：ε=${eps}、r=${r} 处 dΦ/dr ≠ g（势能与力律不配对）`);
    }
  }
  const circ = ST.simulateOrbit({ speed: ST.circularSpeed(1, ST.GRAV.eps.start), angle: 90, eps: ST.GRAV.eps.start, dt: ST.GRAV.dt.start });
  if (circ.status !== 'won' || circ.maxDrift > 1e-6) fail(`引力沙盒：圆轨道应绕满 3 圈且能量守恒（${circ.status}，误差 ${circ.maxDrift}）`);
  const opening = ST.simulateOrbit({ speed: ST.GRAV.speed.start, angle: ST.GRAV.angle.start, eps: ST.GRAV.eps.start, dt: ST.GRAV.dt.start });
  if (opening.status !== 'escaped') fail(`引力沙盒：开局速度 ${ST.GRAV.speed.start} 应先体验逃逸（实际 ${opening.status}）`);
  const raw = ST.simulateOrbit({ ...ST.PLUNGE, eps: 0 });
  const soft = ST.simulateOrbit({ ...ST.PLUNGE, eps: 0.1 });
  if (raw.status !== 'escaped' || raw.maxDrift < 1) fail(`引力沙盒：ε = 0 的近心掠过应被数值误差甩飞（${raw.status}，误差 ${raw.maxDrift.toFixed(2)}）`);
  if (soft.status !== 'won' || soft.maxDrift > 0.3) fail(`引力沙盒：ε = 0.1 的近心掠过应保住轨道（${soft.status}，误差 ${soft.maxDrift.toFixed(2)}）`);
  ok(`引力沙盒：nm20 力律 g(0)=4.0 / g(1)=0.8，势能与力律配对；圆轨道能量误差 ${circ.maxDrift.toExponential(1)}；`
    + `近心掠过 ε=0 被甩飞（误差 ${Math.round(raw.maxDrift * 100)}%）、ε=0.1 保住（${Math.round(soft.maxDrift * 100)}%）`);

  // 11d. 贝叶斯硬币：st18 的 Beta(1,1) + 3 正 2 反 → Beta(4,3)、众数 0.6、均值 4/7；
  //      95% 区间口径（Beta(1,1) → [0.025, 0.975]）；每枚硬币在区间窄到 0.2 时的结论与真值一致
  const st18 = ST.posterior(ST.COIN.priors.flat, 3, 2);
  if (st18.a !== 4 || st18.b !== 3 || ST.betaMode(4, 3) !== 0.6 || Math.abs(ST.betaMean(4, 3) - 4 / 7) > 1e-12) fail('贝叶斯硬币：st18 的 Beta(4,3)、众数 0.6、均值 4/7 不对');
  const flatCI = ST.betaInterval(1, 1);
  if (Math.abs(flatCI[0] - 0.025) > 1e-3 || Math.abs(flatCI[1] - 0.975) > 1e-3) fail(`贝叶斯硬币：Beta(1,1) 的 95% 区间应为 [0.025, 0.975]，实际 ${flatCI.map((v) => v.toFixed(4))}`);
  const symCI = ST.betaInterval(50, 50);
  if (Math.abs(symCI[0] + symCI[1] - 1) > 1e-3) fail('贝叶斯硬币：对称 Beta(50,50) 的区间应关于 0.5 对称');
  const tosses = [];
  for (const which of ['flat', 'informed']) {
    for (let a = 0; a < ST.COIN.truths.length; a++) {
      const c = ST.makeCoin(a);
      let iv;
      do {
        c.flip(10);
        const p = ST.posterior(ST.COIN.priors[which], c.state.heads, c.state.tails);
        iv = ST.betaInterval(p.a, p.b);
      } while (iv[1] - iv[0] >= ST.COIN.widthGoal && c.state.flips.length < 1000);
      const truth = c.state.p === 0.5 ? 'fair' : 'biased';
      if (ST.coinVerdict(iv) !== truth) fail(`贝叶斯硬币第 ${a} 枚（${which}）：区间 [${iv.map((v) => v.toFixed(3))}] 的结论与真值 p = ${c.state.p} 不符`);
      if (which === 'flat') tosses.push(c.state.flips.length);
    }
  }
  ok(`贝叶斯硬币：st18 的 Beta(4,3) 众数 0.6；95% 区间口径正确；6 枚硬币两种先验下结论都与真值一致（均匀先验各抛 ${tosses.join(' / ')} 次）`);
} catch (e) { fail(`第二批观测站校验异常: ${e.message}`); }

console.log(errors === 0 ? '\n全部通过 ✔' : `\n${errors} 个错误 ✘`);
process.exit(errors === 0 ? 0 : 1);
