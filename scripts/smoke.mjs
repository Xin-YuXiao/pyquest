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
// 11) 验证代码训练场：关卡数据完整、模拟器规则（撞墙 / 落水 / 陷阱 / 碎片 / 史莱姆 / 步数上限）、进度清洗、门的选址
//     （参考解在全部布局上通关由 verify-dojo 用 CPython 实跑校验）
// 12) 验证试炼塔：解锁与题源、选题优先级（错题 → 久未见 → 随机）、楼层规划与推进、
//     楼层布局合法、塔内作答入学习记录、战绩累计与存档（主线爱心隔离）
// 13) 验证 Project 秘境：注册表（六步 / 题目都在题库 / 槽位不撞主线）、地图合法、按序解锁规则、存档往返、章节数不变
// 14) 验证第二批观测站的纯数学：蒙特卡洛 π / 并行搬砖 / 引力沙盒 / 贝叶斯硬币 / 星系分类（对齐题库）
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
import { DOJO_LEVELS, DOJO_API_DOCS } from '../src/data/dojoLevels.js';
import {
  createSim, apply, finish, simulate, STOP, MAX_QUERIES, countLines, countSteps,
  recordClear, sanitizeDojo, levelUnlocked,
} from '../src/core/dojoSim.js';
import { explainPyError } from '../src/core/dojoPrelude.js';
import { buildForest } from '../src/data/maps.js';
import {
  TOWER_UNLOCK_CH, GUARDIAN_EVERY, STALE_MS, towerUnlocked, clearedChapterIds, towerCandidates,
  pickTowerQuestions, floorPlan, nextStop, pickGuardianChapter, newRun, floorCleared, assignSlots,
  sanitizeTowerStats, statsOnStart, statsOnFloor, statsOnAnswer, runSummary, towerHud,
} from '../src/core/tower.js';
import { buildTowerFloor, TOWER_INTERACT_GAP, T } from '../src/data/maps.js';
import { REALMS, REALM_STEPS, REALM_HALL, realmSlot, hallSpawnKey, realmsUnlocked } from '../src/data/realms.js';
import { buildRealmHall, buildRealmField, buildRealmSanctum } from '../src/data/realmMaps.js';
import {
  realmState, stepState, solveRealmStep, sealRealm, badgeCount, realmBossShielded, sanitizeRealms, realmHud,
} from '../src/core/realms.js';
import { buildVillage } from '../src/data/maps.js';
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

// ---- 11. 代码训练场（关卡数据 + 模拟器纯函数 + 进度 + 门的选址） ----
console.log('[11] 代码训练场');
try {
  // 11a. 关卡数据：编号连续、API 都有说明、每个布局等宽且恰好一个起点、终点与胜利方式匹配
  DOJO_LEVELS.forEach((l, i) => {
    if (l.id !== i + 1) fail(`训练场关卡编号应连续：第 ${i + 1} 个是 ${l.id}`);
    for (const k of ['concept', 'title', 'blurb', 'goal', 'starter', 'solution']) if (!l[k]) fail(`第 ${l.id} 关缺少 ${k}`);
    if (!Array.isArray(l.hints) || l.hints.length < 2) fail(`第 ${l.id} 关提示少于 2 级`);
    if (!l.api.length || l.api.some((a) => !DOJO_API_DOCS[a])) fail(`第 ${l.id} 关 API 白名单不合法`);
    if (!['reach', 'stop'].includes(l.win.type)) fail(`第 ${l.id} 关胜利方式不合法`);
    if (!(l.maxSteps > 0)) fail(`第 ${l.id} 关缺少步数上限`);
    l.variants.forEach((v, j) => {
      const w = v.grid[0].length;
      if (v.grid.some((r) => r.length !== w)) fail(`第 ${l.id} 关布局 ${j + 1} 行宽不一致`);
      if (v.grid.some((r) => /[^S.#~^*mEF]/.test(r))) fail(`第 ${l.id} 关布局 ${j + 1} 有不认识的格子`);
      const all = v.grid.join('');
      if ((all.match(/S/g) || []).length !== 1) fail(`第 ${l.id} 关布局 ${j + 1} 起点不是恰好 1 个`);
      const goal = l.win.type === 'reach' ? 'E' : 'F';
      if (!all.includes(goal)) fail(`第 ${l.id} 关布局 ${j + 1} 缺少终点 ${goal}`);
    });
  });
  ok(`训练场 ${DOJO_LEVELS.length} 关：数据完整（目标 / 两级提示 / 参考解 / API 白名单 / 布局网格合法）`);

  // 11b. 模拟器规则（用第 7 关「史莱姆巢穴」的布局 1：S.m.^.*.m.*.E）
  const L7 = DOJO_LEVELS[6];
  let s = createSim(L7, 0);
  if (apply(s, 'look') !== 'empty' || apply(s, 'look', 'up') !== 'wall' || apply(s, 'look', 'left') !== 'wall') fail('look 结果不对');
  apply(s, 'move', 'right');
  if (apply(s, 'look') !== 'slime') fail('前方应是史莱姆');
  if (apply(s, 'move', 'right') !== STOP || s.reason.indexOf('史莱姆') < 0) fail('撞上史莱姆应失败');
  s = createSim(L7, 0);
  apply(s, 'move', 'right'); apply(s, 'attack');
  if (apply(s, 'look') !== 'empty' || s.slimes !== 1) fail('attack 应打倒前方的史莱姆');
  apply(s, 'move', 'right'); apply(s, 'move', 'right');
  if (apply(s, 'look') !== 'trap') fail('前方应是陷阱');
  apply(s, 'jump');
  if (s.status !== 'running' || s.x !== 5) fail('jump 应越过陷阱落在第 5 格');
  apply(s, 'move', 'right');
  if (s.shards !== 1) fail('踩上碎片应拾取');
  s = createSim(L7, 0);
  apply(s, 'move', 'right'); apply(s, 'attack'); apply(s, 'move', 'right'); apply(s, 'move', 'right'); apply(s, 'move', 'right');
  if (s.status !== 'fail' || s.reason !== '踩到陷阱了') fail('走上陷阱应失败');
  s = createSim(L7, 0);
  if (apply(s, 'move', 'up') !== STOP || s.reason !== '撞到墙了') fail('撞墙应失败');
  s = createSim(DOJO_LEVELS[1], 0);
  if (apply(s, 'move', 'down') !== STOP || s.reason !== '掉进水里了') fail('走进水里应失败');
  // 碎片没收齐时传送门不亮：第 6 关布局 1 跳过碎片直接去终点是走不通的，用 finish 的原因检验
  s = finish(createSim(DOJO_LEVELS[5], 0));
  if (s.status !== 'fail' || !s.reason.includes('一动不动')) fail('一步都不走应判「一动不动」');
  // 步数上限 / 查看上限（防死循环）
  s = createSim(DOJO_LEVELS[3], 2); // 迷雾小径最长布局
  for (let i = 0; i < 200 && s.status === 'running'; i++) { apply(s, 'move', 'right'); apply(s, 'move', 'left'); }
  if (s.status !== 'limit' || !s.reason.includes('步数用尽')) fail('来回走应在步数上限处终止');
  s = createSim(DOJO_LEVELS[3], 0);
  for (let i = 0; i <= MAX_QUERIES && s.status === 'running'; i++) apply(s, 'look');
  if (s.status !== 'limit' || !s.reason.includes('死循环')) fail('只看不走应在查看上限处终止');
  // 「停在旗子上」在程序结束时判定
  s = createSim(DOJO_LEVELS[3], 0);
  for (let i = 0; i < 4; i++) apply(s, 'move', 'right');
  if (finish(s).status !== 'win') fail('停在旗子上应判定通关');
  // 主线程重算：同一份动作列表得到同一个结果
  s = createSim(L7, 0);
  apply(s, 'move', 'right'); apply(s, 'attack'); apply(s, 'move', 'right');
  finish(s); // simulate 末尾同样会做收尾判定
  const re = simulate(L7, 0, s.actions);
  if (re.x !== s.x || re.steps !== s.steps || re.status !== s.status || re.frames.length !== s.frames.length) fail('simulate 重算结果与逐步结算不一致');
  ok('模拟器：look / attack / jump / 碎片 / 撞墙 / 落水 / 陷阱 / 步数与查看上限 / 停在旗子上 / 重算一致');

  // 11c. 行数 / 步数 / 进度记录 / 清洗 / 解锁 / 报错翻译
  if (countLines("# 注释\n\nmove('right')\n  # 缩进注释\nmove('up')\n") !== 2) fail('行数应只数非空非注释行');
  if (countSteps([{ op: 'look' }, { op: 'move' }, { op: 'attack' }, { op: 'position' }]) !== 2) fail('步数不应计入查询');
  let rec = recordClear(null, { lines: 6, steps: 9, code: 'x' });
  rec = recordClear(rec, { lines: 8, steps: 7, sawSolution: true });
  if (rec.clears !== 2 || rec.bestLines !== 6 || rec.bestSteps !== 7 || !rec.sawSolution) fail('个人最佳应分别取行数 / 步数的最小值');
  const clean = sanitizeDojo({ 1: rec, 99: { cleared: true }, 2: 'bad', 3: { cleared: 'yes', bestLines: -1, code: 5 } }, DOJO_LEVELS.map((l) => l.id));
  if (!clean[1] || clean[99] || clean[2] || clean[3].cleared || clean[3].bestLines || clean[3].code) fail('训练场进度清洗应丢掉非法关卡与字段');
  if (Object.keys(sanitizeDojo('坏数据', [1])).length) fail('训练场进度清洗遇到非对象应返回空');
  if (!levelUnlocked(DOJO_LEVELS, {}, 1) || levelUnlocked(DOJO_LEVELS, {}, 2) || !levelUnlocked(DOJO_LEVELS, { 1: { cleared: true } }, 2)) fail('关卡应逐关解锁');
  const e1 = explainPyError({ type: 'NameError', msg: "name 'mvoe' is not defined", line: 3 }, ['move']);
  const e2 = explainPyError({ type: 'SyntaxError', msg: "expected ':'", line: 1 });
  if (!e1.startsWith('第 3 行') || !e1.includes('mvoe') || !e2.includes('冒号')) fail(`报错翻译不符：${e1} / ${e2}`);
  ok('训练场进度：个人最佳取最小值、读档清洗坏数据、逐关解锁；Python 报错翻译成中文并带行号');

  // 11d. 存档 v3：dojo 可选字段随序列化写出、读档清洗；旧档缺省为空
  resetState();
  G.dojo = { 1: rec };
  const sv = serialize(G);
  if (!sv.dojo || !sv.dojo[1] || validate(sv).length) fail('dojo 字段应写进存档且通过校验');
  resetState();
  hydrate(G, sv);
  if (!G.dojo[1] || G.dojo[1].bestLines !== 6) fail('读档应恢复训练场进度');
  resetState();
  hydrate(G, migrate({ v: 2 }));
  if (Object.keys(G.dojo).length) fail('旧存档缺省训练场进度应为空');
  ok('存档 v3：训练场进度写出 / 读回 / 旧档缺省为空');

  // 11e. 第二章森林里的训练场之门：站在可走的地面上，离符文 / 石碑 / 封印门都有距离，回程出生点也可走
  const forest = buildForest(CHAPTERS[1]);
  const door = forest.props.find((p) => p.type === 'dojo');
  const tile = (x, y) => forest.grid[Math.floor(y / 128)][Math.floor(x / 128)];
  if (!door) fail('第二章森林缺少训练场之门');
  else {
    if (forest.colliding.includes(tile(door.x, door.y))) fail('训练场之门不能放在水上');
    const near = forest.props.filter((p) => ['rune', 'npc', 'doorlink', 'secret', 'tree'].includes(p.type)
      && Math.hypot(p.x - door.x, p.y - door.y) < 300);
    if (near.length) fail(`训练场之门离其他道具太近：${near.map((p) => p.type).join(',')}`);
    const sp = forest.spawns.fromDojo;
    if (!sp || forest.colliding.includes(tile(sp.x, sp.y))) fail('训练场回程出生点不可走');
  }
  ok('训练场之门：第二章森林空地上、离其他可交互道具 ≥ 300px、回程出生点可走');
} catch (e) { fail(`代码训练场校验异常: ${e.message}`); }
// ---- 12. 试炼塔（纯函数：解锁 / 选题 / 楼层 / 布局 / 记录 / 战绩与存档） ----
console.log('[12] 试炼塔');
try {
  // 12a. 解锁与题源：第三章通关才开放；题源 = 已通关章节的全部题池（去重）
  const prog = (ids) => Object.fromEntries(CHAPTERS.map((c) => [c.id, { done: ids.includes(c.id) }]));
  if (towerUnlocked(prog([1, 2]))) fail('第三章未通关时试炼塔不应开放');
  if (!towerUnlocked(prog([1, 2, TOWER_UNLOCK_CH]))) fail('第三章通关后试炼塔应开放');
  if (clearedChapterIds(prog([1, 3, 5])).join() !== '1,3,5') fail('已通关章节列表不符');
  const cands = towerCandidates([1, 2, 3]);
  const expectPools = new Set([1, 2, 3].flatMap((id) => Object.values(CHAPTERS.find((c) => c.id === id).pools)));
  const expectIds = new Set([...expectPools].flatMap((p) => POOLS[p]));
  if (cands.length !== expectIds.size || cands.some((q) => !expectIds.has(q))) fail('题源应恰为第 1-3 章各题池的题（去重）');
  if (new Set(cands).size !== cands.length) fail('题源有重复题');
  ok(`解锁与题源：第三章通关才开放；第 1-3 章题源 ${cands.length} 题，不混入未通关章节`);

  // 12b. 选题优先级：错题本待复习 → 久未见 → 随机；本次挑战已出过的题先排除；同种子结果一致
  const now = 10 * STALE_MS;
  const [m1, m2, mastered, old1, old2, recent] = cands;
  const stats = {
    [m1]: { w: 1, lastAt: now - 10, rv: null },
    [m2]: { w: 3, lastAt: now - 10, rv: { streak: 1, mastered: false } },
    [mastered]: { w: 2, lastAt: now - 10, rv: { streak: 2, mastered: true, at: now - 5 } },
    [old1]: { w: 0, lastAt: now - 3 * STALE_MS },
    [old2]: { w: 0, lastAt: now - 2 * STALE_MS },
    [recent]: { w: 0, lastAt: now - 1000 },
  };
  const picks = pickTowerQuestions({ candidates: cands, stats, count: 5, now, seed: 42 });
  const order = picks.map((p) => p.qid);
  if (order[0] !== m2 || order[1] !== m1) fail(`错题应最先出、答错次数多的在前：${order.slice(0, 2).join(',')}`);
  if (order[2] !== old1 || order[3] !== old2) fail(`其次应是久未见的题（越久越前）：${order.slice(2, 4).join(',')}`);
  if (order.includes(mastered) && order.indexOf(mastered) < 4) fail('已掌握的错题不应按错题优先');
  if (!picks[0].review || !picks[1].review || picks[2].review) fail('review 标记应只落在错题本待复习题上');
  if (JSON.stringify(pickTowerQuestions({ candidates: cands, stats, count: 5, now, seed: 42 })) !== JSON.stringify(picks)) fail('同种子选题应确定');
  const exclude = pickTowerQuestions({ candidates: cands, stats, used: [m1, m2], count: 2, now, seed: 42 }).map((p) => p.qid);
  if (exclude.includes(m1) || exclude.includes(m2)) fail('本次挑战已出过的题应先排除');
  const tiny = pickTowerQuestions({ candidates: [m1, old1], stats, used: [m1, old1], count: 2, now, seed: 1 });
  if (tiny.length !== 2) fail('题源用尽时应放回已出过的题兜底');
  const seeds = new Set([1, 2, 3, 4, 5].map((sd) => pickTowerQuestions({ candidates: cands, stats: {}, count: 3, now, seed: sd }).map((p) => p.qid).join()));
  if (seeds.size < 2) fail('无记录时不同种子应抽到不同的题（随机层）');
  ok('选题：错题本待复习（错多在前）→ 久未见（越久越前）→ 随机；排除已出过的题、用尽兜底、同种子确定');

  // 12c. 楼层规划与推进：每 5 层守层者、每 3 层升档；守层者层之后是休息平台
  if (!floorPlan(GUARDIAN_EVERY).guardian || floorPlan(GUARDIAN_EVERY + 1).guardian) fail('守层者应只在 5 的倍数层');
  if (floorPlan(1).runes !== 2 || floorPlan(3).runes !== 3 || floorPlan(5).runes !== 0 || floorPlan(5).healRunes !== 1) fail('塔符文数量规划不符');
  if (!(floorPlan(4).slimes > floorPlan(3).slimes) || floorPlan(1).crimson !== 0 || floorPlan(7).crimson !== 1) fail('每 3 层小怪应变多变硬');
  if (floorPlan(10).bonusHp !== 1 || floorPlan(10).speedMul <= 1) fail('tier ≥ 3 起小怪应加血加速');
  if (floorPlan(40).slimes > 7) fail('小怪数量应有上限');
  if (new Set([1, 2, 3].map((f) => floorPlan(f).palette)).size !== 3) fail('地貌应按层轮换');
  const s5 = nextStop({ floor: 5, rest: false });
  if (!s5.rest || s5.floor !== 5) fail('第 5 层之后应进休息平台');
  const s5r = nextStop(s5);
  if (s5r.rest || s5r.floor !== 6) fail('休息平台之后应上第 6 层');
  if (nextStop({ floor: 2, rest: false }).floor !== 3) fail('普通层之后应直接上一层');
  const gch = pickGuardianChapter([1, 2, 3], 99);
  if (![1, 2, 3].includes(gch) || pickGuardianChapter([1, 2, 3], 99) !== gch || pickGuardianChapter([], 1) !== null) fail('守层者只能借已通关章节的 BOSS、且确定');
  ok('楼层：普通层 2→3 块符文、每 3 层小怪升档（有上限）、每 5 层守层者 + 休息平台、地貌轮换');

  // 12d. 本层是否通过：塔符文全部答对 / 守层者倒下 / 休息平台随时可走
  const run = newRun({ seed: 7, main: { hearts: 3 }, cleared: [1, 2, 3], startBest: 4 });
  run.floorState = { assign: assignSlots(['t1r1', 't1r2'], [{ qid: m1, review: true }, { qid: old1, review: false }]), towerSlots: ['t1r1', 't1r2'], guardian: false, solved: [] };
  if (floorCleared(run)) fail('没答符文时不应通过');
  run.floorState.solved.push('t1r1');
  if (floorCleared(run) || !towerHud(run).objective.includes('1 / 2')) fail('答对一半时不应通过，HUD 显示 1 / 2');
  run.floorState.solved.push('t1r2');
  if (!floorCleared(run)) fail('塔符文全部答对应通过');
  if (run.floorState.assign.t1r1.qid !== m1) fail('错题应落在第一块塔符文上');
  const g = { ...run, floorState: { assign: {}, towerSlots: [], guardian: true, solved: [], guardianDown: false } };
  if (floorCleared(g)) fail('守层者未倒下不应通过');
  g.floorState.guardianDown = true;
  if (!floorCleared(g)) fail('守层者倒下应通过');
  if (!floorCleared({ ...run, rest: true })) fail('休息平台应随时可上楼');
  if (!towerHud(run).badge.includes('试炼塔 第 1 层')) fail('HUD 徽章应为「试炼塔 第 N 层」');
  ok('本层通过判定：塔符文全部答对 / 守层者倒下 / 休息平台；HUD 显示层数与进度');

  // 12e. 楼层布局：每种楼层在多种子下都合法——在地图内、不压碰撞瓦片、与阶梯 / 出塔门 / 篝火至少隔 3 格
  let layouts = 0;
  for (const f of [1, 2, 3, 4, 5, 6, 9, 10, 15]) {
    for (const seed of [1, 7, 12345, 99991]) {
      for (const rest of f % GUARDIAN_EVERY === 0 ? [false, true] : [false]) {
        const plan = floorPlan(f);
        const d = buildTowerFloor({ plan, seed, rest, bossType: 'snake' });
        layouts++;
        const tile = (p) => ({ tx: Math.floor(p.x / 128), ty: Math.floor(p.y / 128) });
        const anchors = d.props.filter((p) => ['tower_stairs', 'tower_exit', 'tower_campfire'].includes(p.type)).map(tile);
        const runes = d.props.filter((p) => p.type === 'rune');
        const label = `第 ${f} 层${rest ? '休息平台' : ''} seed=${seed}`;
        if (!d.props.some((p) => p.type === 'tower_stairs') || !d.props.some((p) => p.type === 'tower_exit')) fail(`${label} 缺阶梯或出塔门`);
        if (rest) {
          if (runes.length || d.slimes.length || !d.props.some((p) => p.type === 'tower_campfire')) fail(`${label} 休息平台应只有篝火`);
          continue;
        }
        const need = plan.runes + plan.healRunes + (plan.guardian ? 1 : 0);
        if (runes.length !== need) fail(`${label} 符文数 ${runes.length} ≠ ${need}`);
        if (new Set(runes.map((r) => r.qid)).size !== runes.length) fail(`${label} 符文槽 id 重复`);
        if (plan.guardian !== !!d.boss || plan.guardian !== runes.some((r) => r.bossRune)) fail(`${label} 守层者与 BOSS 符文不匹配`);
        for (const r of runes) {
          const { tx, ty } = tile(r);
          if (tx < 1 || ty < 1 || tx >= d.w - 1 || ty >= d.h - 1) fail(`${label} 符文 ${r.qid} 越界`);
          if (d.colliding.includes(d.grid[ty][tx])) fail(`${label} 符文 ${r.qid} 压在碰撞瓦片上`);
          if (anchors.some((a) => Math.max(Math.abs(a.tx - tx), Math.abs(a.ty - ty)) < TOWER_INTERACT_GAP)) fail(`${label} 符文 ${r.qid} 离阶梯 / 出塔门太近`);
        }
        const sp = tile(d.spawns.fromBelow);
        if (d.grid[sp.ty][sp.tx] === T.VOID || d.grid[sp.ty][sp.tx] === T.DWALL) fail(`${label} 出生点不可走`);
        for (const s of d.slimes) {
          const t = tile(s);
          if (Math.max(Math.abs(t.tx - sp.tx), Math.abs(t.ty - sp.ty)) <= 4) fail(`${label} 史莱姆离出生点太近`);
        }
        if (d.slimes.length !== plan.slimes) fail(`${label} 史莱姆数 ${d.slimes.length} ≠ ${plan.slimes}`);
      }
    }
  }
  ok(`楼层布局：${layouts} 种层号 × 种子组合全部合法（符文 / 守层者 / 史莱姆 / 篝火齐备且互不抢交互）`);

  // 12f. 塔内作答入学习记录：错题本里的题按复习规则推进连击；新题塔里答错 = 入错题本
  const rec = { stats: {}, log: [], dropped: 0 };
  applyAttempt(rec, { t: 1, q: m1, s: 'v1', k: 'shard', ch: 1, pool: 'w1field', tier: 1, pick: 0, ok: OK.WRONG, ms: 1 });
  applyAttempt(rec, { t: 2, q: m1, s: 't1r1', k: 'tower', ch: 1, pool: 'w1field', tier: 1, pick: 1, ok: OK.RIGHT, ms: 1 });
  if (!rec.stats[m1].rv || rec.stats[m1].rv.streak !== 1 || rec.stats[m1].n !== 1) fail('错题在塔里答对应推进掌握连击、不改主线次数');
  applyAttempt(rec, { t: 3, q: m1, s: 't2r1', k: 'tower', ch: 1, pool: 'w1field', tier: 1, pick: 1, ok: OK.RIGHT, ms: 1 });
  if (!rec.stats[m1].rv.mastered) fail(`错题在塔里连续答对 ${MASTERY_STREAK} 次应「已掌握」`);
  applyAttempt(rec, { t: 4, q: old1, s: 't2r2', k: 'tower', ch: 1, pool: 'w1field', tier: 1, pick: 3, ok: OK.WRONG, ms: 1 });
  if (rec.stats[old1].w !== 1 || rec.stats[old1].tw.n !== 1 || rec.stats[old1].k !== 'tower') fail('新题在塔里答错应入错题本（kind = tower）');
  applyAttempt(rec, { t: 5, q: recent, s: 't2r3', k: 'tower', ch: 1, pool: 'w1field', tier: 1, pick: 0, ok: OK.RIGHT, ms: 1 });
  if (rec.stats[recent].w !== 0 || rec.stats[recent].tw.ok !== 1) fail('新题在塔里答对只计塔内次数');
  const book = buildMistakeEntries(rec.stats, QUESTIONS).map((e) => e.qid);
  if (!book.includes(old1) || book.includes(recent)) fail('错题本应收塔里答错的新题、不收答对的题');
  ok('塔内作答：错题按复习同规则推进连击直到掌握；塔里答错的新题入错题本；答对只计塔内次数');

  // 12g. 战绩累计与存档：挑战次数 / 最佳层数 / 答题数；进行中的挑战写档用主线爱心
  let st = sanitizeTowerStats({ best: 3, runs: -1, answered: 'x', correct: 9 });
  if (st.best !== 3 || st.runs !== 0 || st.answered !== 0 || st.correct !== 0) fail('塔战绩清洗不符');
  st = statsOnAnswer(statsOnAnswer(statsOnFloor(statsOnStart(st), 6), true), false);
  if (st.runs !== 1 || st.best !== 6 || st.answered !== 2 || st.correct !== 1) fail('塔战绩累计不符');
  const sum = runSummary({ ...run, floor: 6, correct: 3, total: 4, reviewed: [m1] }, st, 'defeat');
  if (sum.accuracy !== 75 || sum.reviewed !== 1 || !sum.newBest || sum.best !== 6) fail('结算摘要不符');
  resetState();
  G.hearts = 2;
  G.tower = st;
  G.towerRun = newRun({ seed: 1, main: { hearts: 5 }, cleared: [1, 2, 3] });
  const saved = serialize(G, 1);
  if (saved.hearts !== 5) fail(`挑战进行中写档应写主线爱心 5（实际 ${saved.hearts}）`);
  if (validate(saved).length) fail(`含塔战绩的存档校验不通过：${validate(saved).join('；')}`);
  resetState();
  hydrate(G, migrate(JSON.parse(JSON.stringify(saved))));
  if (G.tower.best !== 6 || G.tower.runs !== 1 || G.towerRun !== null || G.hearts !== 5) fail('塔战绩读档不符 / 读档后不应残留进行中的挑战');
  resetState();
  hydrate(G, migrate({ v: 2 }));
  if (G.tower.best !== 0 || G.tower.runs !== 0) fail('旧档缺省塔战绩应为空');
  ok('战绩：清洗 / 累计 / 结算摘要；挑战中写档只写主线爱心，读档不残留挑战，旧档缺省为空');
} catch (e) { fail(`试炼塔校验异常: ${e.message}`); }
// ---- 13. Project 秘境（注册表 / 地图 / 进度规则 / 存档） ----
console.log('[13] Project 秘境');
try {
  // 13a. 注册表：独立于章节注册表；每个秘境六步、题目都在题库里、槽位不撞主线
  if (CHAPTERS.length !== 11) fail(`章节数应仍为 11（秘境不进章节注册表），实际 ${CHAPTERS.length}`);
  const keys = new Set([REALM_HALL.key]);
  const chapterKeys = new Set(CHAPTERS.flatMap((c) => [c.fieldKey, c.lairKey]));
  for (const r of REALMS) {
    for (const k of [r.fieldKey, r.lairKey]) {
      if (keys.has(k) || chapterKeys.has(k)) fail(`秘境 ${r.id} 场景 key ${k} 重复`);
      keys.add(k);
    }
    if (r.steps.length !== REALM_STEPS.length) fail(`秘境 ${r.id} 应有 ${REALM_STEPS.length} 步，实际 ${r.steps.length}`);
    const qids = r.steps.map((s) => s.qid);
    qids.forEach((q) => { if (!QUESTIONS[q]) fail(`秘境 ${r.id} 引用了题库里没有的题 ${q}`); });
    if (new Set(qids).size !== qids.length) fail(`秘境 ${r.id} 课题链里有重复的题`);
    r.steps.forEach((s, i) => {
      if (!s.task) fail(`秘境 ${r.id} 第 ${i + 1} 步缺少任务说明`);
      if (SLOT_POOL[realmSlot(r, i)]) fail(`课题符文槽位 ${realmSlot(r, i)} 与主线符文槽撞名`);
    });
    const kind = MECHANIC_KINDS[r.bossMechanic.kind];
    if (!kind) fail(`秘境 ${r.id} 的 BOSS 机制 ${r.bossMechanic.kind} 未登记`);
    else if (!kind.archetypes.includes(r.boss)) fail(`秘境 ${r.id}：机制 ${r.bossMechanic.kind} 不能挂在 ${r.boss} 原型上`);
    if (!TRACKS[r.music]) fail(`秘境 ${r.id} 的音乐 ${r.music} 不存在`);
    if (r.observatory && !OBSERVATORIES[r.observatory]) fail(`秘境 ${r.id} 的观测台 ${r.observatory} 未登记`);
  }
  ok(`注册表：${REALMS.length} 个秘境 × ${REALM_STEPS.length} 步，题目全部来自题库，槽位 / 场景 key 不撞主线，章节数仍为 ${CHAPTERS.length}`);

  // 13b. 地图：尺寸 / 越界、出生点不在传送门里、课题符文与可交互物彼此不抢 E 键、不站在障碍上
  const inRect = (p, rc) => p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h;
  const checkRealmMap = (m, label) => {
    checkMap(m, label);
    for (const [k, s] of Object.entries(m.spawns)) {
      for (const p of m.portals) if (inRect(s, p.rect)) fail(`${label} 出生点 ${k} 落在通往 ${p.to} 的传送门里`);
    }
    const inter = m.props.filter((p) => ['trial', 'observatory', 'npc', 'doorlink'].includes(p.type));
    for (let i = 0; i < inter.length; i++) {
      for (let j = i + 1; j < inter.length; j++) {
        if (Math.hypot(inter[i].x - inter[j].x, inter[i].y - inter[j].y) < 560) fail(`${label} 的 ${inter[i].type} 与 ${inter[j].type} 太近（会抢 E 键）`);
      }
    }
    for (const p of m.props.filter((q) => q.type === 'trial' || q.type === 'observatory')) {
      const tile = m.grid[Math.floor(p.y / 128)][Math.floor(p.x / 128)];
      if (m.colliding.includes(tile)) fail(`${label} 的 ${p.type} 落在障碍瓦片上`);
    }
  };
  const hall = buildRealmHall();
  checkRealmMap(hall, REALM_HALL.name);
  REALMS.forEach((r) => {
    if (!hall.spawns[hallSpawnKey(r)]) fail(`大厅缺少从 ${r.id} 回来的出生点`);
    if (!hall.portals.some((p) => p.to === r.fieldKey)) fail(`大厅缺少通往 ${r.id} 的门`);
  });
  for (const r of REALMS) {
    const f = buildRealmField(r);
    const s = buildRealmSanctum(r);
    checkRealmMap(f, `${r.project} 外庭`);
    checkRealmMap(s, `${r.project} 圣所`);
    const steps = f.props.filter((p) => p.type === 'trial').map((p) => p.step);
    if (steps.join() !== '0,1,2,3,4') fail(`${r.project} 外庭的课题符文应依次为第 1-5 步，实际 ${steps.join()}`);
    if (f.props.filter((p) => p.type === 'trial').some((p, i, a) => i && p.x <= a[i - 1].x)) fail(`${r.project} 外庭课题符文应自西向东排开`);
    const boss = s.props.filter((p) => p.type === 'trial');
    if (boss.length !== 1 || boss[0].step !== 5 || !boss[0].bossRune) fail(`${r.project} 圣所应只有第 6 步「报告」的 BOSS 符文`);
    if (!f.portals.some((p) => p.to === r.lairKey && typeof p.requires === 'function')) fail(`${r.project} 外庭通往圣所的门应带解锁条件`);
    if (!!r.observatory !== f.props.some((p) => p.type === 'observatory')) fail(`${r.project} 外庭观测台与登记不符`);
    if (s.boss.type !== r.boss) fail(`${r.project} 圣所 BOSS 原型应为 ${r.boss}`);
  }
  const village = buildVillage(CHAPTERS[0]);
  const realmDoor = village.portals.find((p) => p.to === REALM_HALL.key);
  if (!realmDoor || realmDoor.requires !== realmsUnlocked) fail('诺瓦村庄缺少秘境之门（或解锁条件不是「第一部通关」）');
  if (!village.spawns.fromRealm || inRect(village.spawns.fromRealm, realmDoor.rect)) fail('村庄从秘境回来的出生点缺失或落在秘境之门里');
  ok(`地图：大厅 + ${REALMS.length} × (外庭 + 圣所) 尺寸合法、出生点不落进传送门、可交互物互不抢 E 键；村庄秘境之门就位`);

  // 13c. 进度规则：按序解锁、越级拒绝、第 6 步破盾、封印需六步全解、徽章计数
  const g = { progress: { 8: { done: false } }, realms: {} };
  if (realmsUnlocked(g)) fail('第八章未通关时秘境不应开启');
  g.progress[8].done = true;
  if (!realmsUnlocked(g)) fail('第八章通关后秘境应开启');
  if (stepState(g, 'p4', 0) !== 'next' || stepState(g, 'p4', 1) !== 'locked') fail('初始应只有第 1 步可解');
  if (solveRealmStep(g, 'p4', 2)) fail('越级解第 3 步应被拒绝');
  for (let i = 0; i < 5; i++) if (!solveRealmStep(g, 'p4', i)) fail(`按序解第 ${i + 1} 步失败`);
  if (solveRealmStep(g, 'p4', 1)) fail('已解的步骤不应重复计入');
  if (!realmBossShielded(g, 'p4')) fail('第 6 步「报告」答对前 BOSS 应有护盾');
  if (sealRealm(g, 'p4')) fail('六步未全解时不应封印');
  solveRealmStep(g, 'p4', 5);
  if (realmBossShielded(g, 'p4')) fail('第 6 步答对后护盾应破');
  if (!sealRealm(g, 'p4', 123) || !realmState(g, 'p4').done || realmState(g, 'p4').doneAt !== 123) fail('六步全解后应可封印并记时间');
  if (badgeCount(g) !== 1) fail(`徽章数应为 1，实际 ${badgeCount(g)}`);
  if (realmState(g, 'p1').steps !== 0) fail('其他秘境进度应不受影响');
  const hud = realmHud(g, 'p1');
  if (!hud || !hud.pill.includes('0 / 6') || !hud.objective.includes('选题')) fail(`秘境 HUD 文案不对：${JSON.stringify(hud)}`);
  if (realmHud(g, null) !== null) fail('不在秘境时 realmHud 应返回 null');
  ok('进度规则：按序解锁 / 越级拒绝 / 第 6 步破盾 / 六步全解才能封印 / 徽章计数 / HUD 文案');

  // 13d. 存档：realms 可选字段往返；坏数据清洗（未知秘境丢弃、steps 夹紧、未满六步不算封印）；旧档缺字段为空
  const clean = sanitizeRealms({ p4: { steps: 9, done: true, doneAt: 5 }, p1: { steps: 3, done: true }, zz: { steps: 2 }, p2: 'x', p5: { steps: -2 } });
  if (JSON.stringify(clean) !== JSON.stringify({ p4: { steps: 6, done: true, doneAt: 5 }, p1: { steps: 3, done: false, doneAt: null } })) fail(`秘境存档清洗不对：${JSON.stringify(clean)}`);
  if (JSON.stringify(sanitizeRealms(undefined)) !== '{}' || JSON.stringify(sanitizeRealms([1])) !== '{}') fail('缺字段 / 非对象应清洗为空');
  resetState();
  G.realms = { p4: { steps: 6, done: true, doneAt: 77 }, p2: { steps: 2, done: false, doneAt: null } };
  const saved = serialize(G, 1);
  if (validate(saved).length) fail(`带秘境进度的存档校验不通过：${validate(saved).join('；')}`);
  resetState();
  hydrate(G, migrate(JSON.parse(JSON.stringify(saved))));
  if (JSON.stringify(G.realms) !== JSON.stringify({ p4: { steps: 6, done: true, doneAt: 77 }, p2: { steps: 2, done: false, doneAt: null } })) fail('秘境进度存档往返不一致');
  if (G.realm !== null) fail('所在秘境（G.realm）是瞬态，读档后应为 null');
  resetState();
  hydrate(G, migrate({ v: 2, progress: {} }));
  if (JSON.stringify(G.realms) !== '{}') fail('v2 旧档迁移后秘境进度应为空');
  if (Object.keys(SLOT_POOL).some((s) => /^rp\d+s\d+$/.test(s))) fail('课题符文槽位不应进入主线 SLOT_POOL');
  ok('存档：realms 字段往返、坏数据清洗、旧档缺字段为空；不碰主线槽位映射');
} catch (e) { fail(`Project 秘境校验异常: ${e.message}`); }
resetState();
// ---- 14. 第二批观测站（纯数学层；面板在 ui/stations/） ----
console.log('[14] 第二批观测站');
try {
  // 14a. 蒙特卡洛估 π：π̂ = 4M/N（mp5）；1σ = 4√(p(1−p)/N)（st14）；每次挑战都能在上限内估成
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

  // 14b. 并行搬砖：轮转 = range(rank, nruns, size)（sp7：任务 7 归 rank 3）；最优 = Σ/4 恰好可达；
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

  // 14c. 引力沙盒：nm20 的 g(0) = 1/ε² = 4.0、g(1) = 0.8（ε = 0.5）；势能与力律配对（dΦ/dr = g，
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

  // 14d. 贝叶斯硬币：st18 的 Beta(1,1) + 3 正 2 反 → Beta(4,3)、众数 0.6、均值 4/7；
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

  // 14e. 星系分类台：混淆矩阵 行=真实 列=预测（sg18）；类别比例（稀有类 6%，pj16）；训练 / 测试不重叠（pj7）；
  //      「只用颜色、k=15」准确率高但稀有类召回 0（陷阱存在），「颜色 + 集中度、k=5」过关（有解）
  const cm = ST.confusionMatrix(['spiral', 'spiral', 'irregular'], ['spiral', 'irregular', 'spiral']);
  if (cm[0][0] !== 1 || cm[0][2] !== 1 || cm[2][0] !== 1) fail('星系分类台：混淆矩阵应为 行 = 真实、列 = 预测（sg18）');
  const dumb = ST.classMetrics(ST.confusionMatrix([...Array(99).fill('spiral'), 'irregular'], Array(100).fill('spiral')));
  if (dumb.acc !== 0.99 || dumb.recall.irregular !== 0) fail('星系分类台：pj16 的哑模型应为准确率 99%、稀有类召回 0');
  const trap = [], solve = [];
  for (let a = 0; a < 4; a++) {
    const d = ST.makeGalaxyData(a);
    const count = (set, cls) => set.filter((g) => g.cls === cls).length;
    if (d.label.length !== ST.GALAXY.nLabel || count(d.test, 'irregular') !== Math.round(ST.GALAXY.nTest * ST.GALAXY.mix.irregular)) fail(`星系分类台第 ${a} 次：数据量或类别比例不对`);
    if (d.train.some((g) => d.test.includes(g))) fail(`星系分类台第 ${a} 次：训练集与测试集重叠`);
    if (JSON.stringify(ST.makeGalaxyData(a)) !== JSON.stringify(d)) fail(`星系分类台第 ${a} 次：数据不确定`);
    const t = ST.evaluateClassifier(d, ['color'], 15);
    const s = ST.evaluateClassifier(d, ['color', 'conc'], 5);
    if (!(t.acc >= ST.GALAXY.pass.acc && t.rareRecall < ST.GALAXY.pass.rareRecall && !t.pass)) fail(`星系分类台第 ${a} 次：「颜色、k=15」应准确率高但稀有类认不出（${t.acc} / ${t.rareRecall}）`);
    if (!s.pass) fail(`星系分类台第 ${a} 次：「颜色 + 集中度、k=5」应能过关（${s.acc} / ${s.rareRecall}）`);
    trap.push(`${Math.round(t.acc * 100)}%/${Math.round(t.rareRecall * 100)}%`);
    solve.push(`${Math.round(s.acc * 100)}%/${Math.round(s.rareRecall * 100)}%`);
  }
  ok(`星系分类台：混淆矩阵行 = 真实；训练 / 测试不重叠；陷阱「颜色、k=15」准确率/稀有召回 ${trap.join(' ')}，`
    + `「颜色 + 集中度、k=5」${solve.join(' ')}`);
} catch (e) { fail(`第二批观测站校验异常: ${e.message}`); }

console.log(errors === 0 ? '\n全部通过 ✔' : `\n${errors} 个错误 ✘`);
process.exit(errors === 0 ? 0 : 1);
