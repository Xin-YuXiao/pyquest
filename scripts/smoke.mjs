// 无头冒烟测试：不需要浏览器
// 1) 验证所有像素图行宽一致（pixelTexture 会 throw）
// 2) 验证全部章节地图构建器输出（尺寸、越界、必需要素、传送门链）
// 3) 验证题库引用完整、题池同难度、槽位映射完整、随机抽题行为
// 4) 验证 W4-W11 三池式结构（24 个通用池齐备 / tier 对齐 / 旧池不残留 / 章节映射）
import { generateAllTextures } from '../src/textures/pixelArt.js';
import { makeGroundTexture } from '../src/textures/ground.js';
import { CHAPTERS } from '../src/data/chapters.js';
import { QUESTIONS, pickQuestion, highlight, POOLS, SLOT_POOL } from '../src/data/quizData.js';
import { G } from '../src/core/state.js';

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
    'particle'];
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

console.log(errors === 0 ? '\n全部通过 ✔' : `\n${errors} 个错误 ✘`);
process.exit(errors === 0 ? 0 : 1);
