// 无头冒烟测试：不需要浏览器
// 1) 验证所有像素图行宽一致（pixelTexture 会 throw）
// 2) 验证全部章节地图构建器输出（尺寸、越界、必需要素、传送门链）
// 3) 验证题库引用完整、题池同难度、槽位映射完整、随机抽题行为
// 4) 验证 W4-W11 三池式结构（24 个通用池齐备 / tier 对齐 / 旧池不残留 / 章节映射）
// 5) 验证背景音乐曲目数据（记谱合法、可编译）与章节曲目映射
// 6) 验证观测站小游戏：NFW / 频谱数学对齐题库（dm8 / dm9 / sg6 / st7）、观测台选址、观测日志
import { generateAllTextures } from '../src/textures/pixelArt.js';
import { makeGroundTexture } from '../src/textures/ground.js';
import { CHAPTERS } from '../src/data/chapters.js';
import { QUESTIONS, pickQuestion, highlight, POOLS, SLOT_POOL } from '../src/data/quizData.js';
import { G } from '../src/core/state.js';
import { TRACKS, trackErrors, compileTrack, cueFor } from '../src/audio/tracks.js';
import {
  OBSERVATORIES, NFW, TUNING, makeNfwData, nfwDensity, nfwChi2, nfwChi2dof, nfwLogSlope,
  makeTuner, findPeaks, readoutMagnitude, amplitudeOf, recordObservation, sanitizeObservationLog,
} from '../src/core/observatory.js';

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
    'particle', 'observatory'];
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
  ok(`观测台选址：${placed} 座（第七章 / 第八章），离符文 / 石碑 / 门 ≥ 4 格，避开出生点与传送门`);

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

console.log(errors === 0 ? '\n全部通过 ✔' : `\n${errors} 个错误 ✘`);
process.exit(errors === 0 ? 0 : 1);
