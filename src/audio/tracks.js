// ============================================================
// 背景音乐曲目数据 + 编译器（纯数据 / 纯函数，不碰 WebAudio，Node 里可校验）
//
// 记谱：每小节 16 个 token（十六分音符一格），空格分隔
//   旋律声部：整数 = 调式音级（0 = 主音，7 = 高八度，负数 = 低八度），
//             可带 # / b 升降半音；- = 延长上一个音；. = 休止
//   鼓组：k 底鼓 / s 军鼓 / h 闭镲 / o 开镲 / . 休止
// 声部：lead 主旋律、harm 和声/琶音、bass 低音、drums 噪声打击（2-4 个声部按需取用）
// 各声部小节数可不同（短声部循环填满），曲长 = 最长声部
// 变奏曲：base + transpose（半音）/ bpm / waves 覆盖，让相近主题的章节各有身份
// 章节映射：cueFor()（野外按章、巢穴分普通 / 部终章、通关后巢穴转安静版）
// ============================================================

export const STEPS_PER_BAR = 16;

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export const WAVES = ['square', 'triangle', 'sawtooth', 'sine', 'pulse25', 'pulse12'];
export const DRUM_KINDS = { k: 'kick', s: 'snare', h: 'hat', o: 'openhat' };

// 声部默认值（音量是相对音乐总线的增益；方波最响，三角波低音给足）
const VOICE_DEFAULTS = {
  lead: { wave: 'square', oct: 0, vol: 0.075 },
  harm: { wave: 'pulse12', oct: -1, vol: 0.04 },
  bass: { wave: 'triangle', oct: -2, vol: 0.17 },
};

export const TRACKS = {
  // ---------- 标题画面：缓慢、开阔的序曲 ----------
  title: {
    title: '序曲 · 星图展开', bpm: 100, root: 67, scale: 'major',
    lead: { bars: [
      '0 - - - 4 - - - 7 - - - 6 - 4 -',
      '5 - - - 4 - 2 - 4 - - - - - - -',
      '0 - - - 4 - - - 7 - - - 9 - 8 -',
      '7 - - - 6 - 5 - 4 - - - - - . .',
    ] },
    harm: { bars: [
      '0 2 4 7 4 2 0 2 4 7 4 2 0 2 4 2',
      '5 7 9 12 9 7 5 7 9 12 9 7 5 7 9 7',
      '0 2 4 7 4 2 0 2 4 7 4 2 0 2 4 2',
      '3 5 7 10 7 5 3 5 4 6 8 11 8 6 4 6',
    ] },
    bass: { bars: [
      '0 - - - - - - - 4 - - - - - - -',
      '5 - - - - - - - 2 - - - - - - -',
      '0 - - - - - - - 4 - - - - - - -',
      '3 - - - - - - - 4 - - - - - - -',
    ] },
    drums: { vol: 0.35, bars: ['k . . . h . . . s . . . h . . .'] },
  },

  // ---------- 第一章 · 诺瓦村庄：明快的村庄小调 ----------
  village: {
    title: '诺瓦村庄', bpm: 126, root: 72, scale: 'major',
    lead: { wave: 'pulse25', bars: [
      '4 - 7 - 6 - 4 - 5 - 4 - 2 - - -',
      '3 - 5 - 4 - 2 - 1 - 2 - 0 - - -',
      '4 - 7 - 6 - 4 - 5 - 7 - 9 - - -',
      '8 - 7 - 6 - 4 - 5 - 6 - 7 - - -',
    ] },
    harm: { wave: 'square', vol: 0.03, bars: [
      '. . 2 . . . 2 . . . 2 . . . 2 .',
      '. . 5 . . . 5 . . . 2 . . . 2 .',
      '. . 2 . . . 2 . . . 0 . . . 0 .',
      '. . 1 . . . 1 . . . 2 . . . . .',
    ] },
    bass: { bars: [
      '0 . 4 . 0 . 4 . 0 . 4 . 0 . 4 .',
      '3 . 7 . 3 . 7 . 0 . 4 . 0 . 4 .',
      '0 . 4 . 0 . 4 . 5 . 9 . 5 . 9 .',
      '4 . 8 . 4 . 8 . 0 . 4 . 7 . . .',
    ] },
    drums: { bars: ['k . h . s . h . k . h k s . h .'] },
  },

  // ---------- 第二章 · 函数之森：多利亚调式 + 摇摆律动 ----------
  forest: {
    title: '函数之森', bpm: 108, root: 74, scale: 'dorian', swing: 0.18,
    lead: { wave: 'pulse25', bars: [
      '0 - - 2 3 - 4 - 3 - 2 - 0 - - -',
      '-1 - - 0 2 - 3 - 4 - - - - - . .',
      '4 - - 5 6 - 7 - 6 - 4 - 3 - - -',
      '2 - 3 - 2 - 0 - -1 - 0 - - - . .',
    ] },
    bass: { bars: [
      '0 - . 0 4 - . . 0 - . 0 4 - . .',
      '-1 - . -1 3 - . . -1 - . -1 3 - . .',
      '0 - . 0 4 - . . 0 - . 0 4 - . .',
      '-3 - . -3 1 - . . 4 - . 4 0 - . .',
    ] },
    drums: { vol: 0.4, bars: ['k . h . s . h . k . h . s . h h'] },
  },

  // ---------- 第三章 · 科学计算高原：冒险感的大地图主题 ----------
  plateau: {
    title: '科学计算高原', bpm: 120, root: 69, scale: 'major',
    lead: { bars: [
      '0 - - 4 - - 7 - 6 - 5 - 4 - - -',
      '3 - - 5 - - 4 - 2 - 1 - 2 - - -',
      '0 - - 4 - - 7 - 9 - 8 - 7 - - -',
      '8 - 7 - 6 - 5 - 4 - - - - - . .',
    ] },
    harm: { bars: [
      '2 - - - - - - - 4 - - - - - - -',
      '5 - - - - - - - 6 - - - - - - -',
      '7 - - - - - - - 4 - - - - - - -',
      '5 - - - 6 - - - 4 - - - - - - -',
    ] },
    bass: { bars: [
      '0 0 . 0 0 . 0 . 4 4 . 4 4 . 4 .',
      '3 3 . 3 3 . 3 . 4 4 . 4 4 . 4 .',
      '5 5 . 5 5 . 5 . 2 2 . 2 2 . 2 .',
      '3 3 . 3 4 4 . 4 0 - - - . . . .',
    ] },
    drums: { bars: ['k . h . s . h k k . h . s . h .'] },
  },
  // 第四章 · 星图塔：高原主题降调放慢、换成更细的脉冲波（夜空里的同一条路）
  starmap: { base: 'plateau', title: '星图塔平原', transpose: -3, bpm: 112, waves: { lead: 'pulse12', harm: 'triangle' } },

  // ---------- 第五章 · 加速熔炉：快速推进的小调（加速！） ----------
  forge: {
    title: '加速熔炉', bpm: 152, root: 76, scale: 'minor',
    lead: { bars: [
      '0 . 0 . 3 . 2 . 0 . -1 . 0 - - -',
      '0 . 0 . 3 . 4 . 5 . 4 . 3 - - -',
      '4 . 4 . 7 . 6 . 4 . 3 . 4 - - -',
      '2 . 3 . 4 . 5 . 6 . 5 . 4 . 3 .',
    ] },
    bass: { vol: 0.15, bars: [
      '0 0 7 0 0 0 7 0 0 0 7 0 0 0 7 0',
      '5 5 12 5 5 5 12 5 6 6 13 6 6 6 13 6',
      '0 0 7 0 0 0 7 0 3 3 10 3 3 3 10 3',
      '5 5 12 5 6 6 13 6 4 4 11 4 4 4 11 4',
    ] },
    drums: { bars: ['k . h k s . h . k k h . s . h s'] },
  },

  // ---------- 第六章 · 数值方法神殿：和声小调的神秘感 ----------
  temple: {
    title: '数值方法神殿', bpm: 96, root: 69, scale: 'harmonicMinor',
    lead: { bars: [
      '0 - - - 2 - 1 - 0 - -1 - 0 - - -',
      '4 - - - 5 - 4 - 2 - 1 - 2 - - -',
      '0 - 2 - 4 - 7 - 6 - - - 4 - - -',
      '5 - 4 - 3 - 2 - 1 - - - -1 - - -',
    ] },
    harm: { bars: [
      '0 . 2 . 4 . 2 . 0 . 2 . 4 . 2 .',
      '5 . 7 . 9 . 7 . 4 . 6 . 8 . 6 .',
      '0 . 2 . 4 . 2 . 2 . 4 . 6 . 4 .',
      '3 . 5 . 7 . 5 . 4 . 6 . 8 . 6 .',
    ] },
    bass: { bars: [
      '0 - - - - - - - 0 - - - - - - -',
      '5 - - - - - - - 4 - - - - - - -',
      '0 - - - - - - - 2 - - - - - - -',
      '3 - - - - - - - 4 - - - - - - -',
    ] },
    drums: { vol: 0.4, bars: ['k . . . . . h . s . . . . . h .'] },
  },
  // 第七章 · 信号圣殿：神殿主题升四度、加快，锯齿波像一条振荡的信号
  signal: { base: 'temple', title: '信号圣殿', transpose: 5, bpm: 108, waves: { lead: 'sawtooth' } },

  // ---------- 第八章 · 深空晕环：利底亚调式的空灵长音 + 闪烁琶音 ----------
  deepspace: {
    title: '深空晕环', bpm: 84, root: 74, scale: 'lydian',
    lead: { wave: 'triangle', vol: 0.11, bars: [
      '4 - - - - - - - 3 - - - 2 - - -',
      '1 - - - - - - - - - - - . . . .',
      '4 - - - 6 - - - 7 - - - 8 - - -',
      '7 - - - - - - - 3 - - - - - - -',
    ] },
    harm: { vol: 0.03, bars: [
      '0 4 7 4 9 4 7 4 0 4 7 4 9 4 7 4',
      '-2 2 5 2 7 2 5 2 -2 2 5 2 7 2 5 2',
      '0 4 7 4 9 4 7 4 0 4 7 4 9 4 7 4',
      '1 5 8 5 10 5 8 5 1 5 8 5 10 5 8 5',
    ] },
    bass: { bars: [
      '0 - - - - - - - - - - - - - - -',
      '-2 - - - - - - - - - - - - - - -',
      '0 - - - - - - - - - - - - - - -',
      '1 - - - - - - - - - - - - - - -',
    ] },
    drums: { vol: 0.3, bars: ['k . . . . . . . . . . . . . h .'] },
  },

  // ---------- 第九章 · 统计圣所：沉静的三角波钟声 + 分解和弦 ----------
  sanctum: {
    title: '统计圣所', bpm: 96, root: 77, scale: 'major',
    lead: { wave: 'triangle', vol: 0.12, bars: [
      '2 - - - 1 - 0 - 1 - 2 - 4 - - -',
      '3 - - - 2 - 1 - 2 - - - - - . .',
      '2 - - - 1 - 0 - 1 - 2 - 4 - 5 -',
      '4 - 2 - 1 - - - 0 - - - - - . .',
    ] },
    harm: { bars: [
      '0 . 4 . 7 . 4 . 5 . 9 . 12 . 9 .',
      '3 . 7 . 10 . 7 . 1 . 5 . 8 . 5 .',
      '0 . 4 . 7 . 4 . 5 . 9 . 12 . 9 .',
      '4 . 8 . 11 . 8 . 0 . 4 . 7 . 4 .',
    ] },
    bass: { bars: [
      '0 - - - - - - - 5 - - - - - - -',
      '3 - - - - - - - 1 - - - - - - -',
      '0 - - - - - - - 5 - - - - - - -',
      '4 - - - - - - - 0 - - - - - - -',
    ] },
    drums: { vol: 0.3, bars: ['k . . . h . . . s . . . h . . .'] },
  },

  // ---------- 第十章 · 灵思之塔：增音程「故障」点缀 + 计算机式琶音 ----------
  tower: {
    title: '灵思之塔', bpm: 132, root: 72, scale: 'major',
    lead: { bars: [
      '0 . 4 . 7 . 4# . 5 . 4 . 2 . . .',
      '0 . 4 . 7 . 9 . 8 . 7 . 4 . . .',
      '5 . 5 . 4 . 4# . 5 . 7 . 9 - - -',
      '11 . 9 . 7 . 4 . 2 . 1 . 0 . . .',
    ] },
    harm: { vol: 0.03, bars: [
      '0 7 0 7 2 9 2 9 4 11 4 11 2 9 2 9',
      '0 7 0 7 2 9 2 9 4 11 4 11 2 9 2 9',
      '3 10 3 10 2 9 2 9 3 10 3 10 4 11 4 11',
      '4 11 4 11 2 9 2 9 0 7 0 7 . . . .',
    ] },
    bass: { bars: [
      '0 . . 0 . . 0 . 3 . . 3 . . 4 .',
      '0 . . 0 . . 0 . 3 . . 3 . . 4 .',
      '3 . . 3 . . 3 . 4 . . 4 . . 4 .',
      '4 . . 4 . . 4 . 0 . . . . . . .',
    ] },
    drums: { bars: ['k . h h s . h . k . h h s . h k'] },
  },

  // ---------- 第十一章 · 毕业试炼：庄严的进行曲 ----------
  trial: {
    title: '毕业试炼', bpm: 92, root: 70, scale: 'major',
    lead: { bars: [
      '0 - - - - - 4 - 7 - - - - - 6 -',
      '5 - - - 4 - 3 - 4 - - - - - - -',
      '0 - - - - - 4 - 7 - - - 9 - 8 -',
      '7 - - - 6 - 5 - 7 - - - - - - -',
    ] },
    harm: { wave: 'square', vol: 0.03, bars: [
      '2 - - - - - - - 5 - - - - - - -',
      '7 - - - - - - - 6 - - - - - - -',
      '2 - - - - - - - 4 - - - - - - -',
      '5 - - - 6 - - - 4 - - - - - - -',
    ] },
    bass: { bars: [
      '0 - - 0 0 - - - 3 - - 3 3 - - -',
      '5 - - 5 5 - - - 4 - - 4 4 - - -',
      '0 - - 0 0 - - - 2 - - 2 2 - - -',
      '3 - - 3 4 - - 4 0 - - - - - - -',
    ] },
    drums: { bars: ['k . . k s . . . k . . k s . s s'] },
  },

  // ---------- 巢穴 · BOSS 战：和声小调的紧张固定低音 ----------
  boss: {
    title: 'BOSS 战', bpm: 148, root: 64, scale: 'harmonicMinor',
    lead: { bars: [
      '7 . 6 . 7 . 4 . 5 . 4 . 3 . 4 .',
      '7 . 6 . 7 . 4 . 2 . 3 . 4 - - -',
      '9 . 8 . 9 . 7 . 8 . 7 . 6 . 7 .',
      '4 . 5 . 6 . 7 . 8 . 9 . 10 - - -',
    ] },
    bass: { vol: 0.15, bars: [
      '0 0 7 0 0 7 0 0 -2 -2 5 -2 -1 -1 6 -1',
      '0 0 7 0 0 7 0 0 -2 -2 5 -2 -1 -1 6 -1',
      '3 3 10 3 3 10 3 3 2 2 9 2 -1 -1 6 -1',
      '0 0 7 0 0 7 0 0 -1 -1 6 -1 -1 -1 6 -1',
    ] },
    drums: { bars: ['k . s k k . s . k . s k k s s s'] },
  },
  // 部终章（第八章 / 第十一章）BOSS：升半音、更快、锯齿波更凶
  'boss-finale': { base: 'boss', title: '终章 BOSS 战', transpose: 1, bpm: 160, waves: { lead: 'sawtooth' } },

  // ---------- 巢穴 · BOSS 已封印：安静的回声 ----------
  'lair-calm': {
    title: '封印之后', bpm: 80, root: 69, scale: 'minor',
    lead: { wave: 'triangle', vol: 0.08, bars: [
      '0 - - - - - - - 2 - - - 1 - - -',
      '0 - - - - - - - - - - - . . . .',
    ] },
    harm: { vol: 0.03, bars: [
      '0 . 2 . 4 . 7 . 4 . 2 . 0 . 2 .',
      '5 . 7 . 9 . 12 . 9 . 7 . 5 . 7 .',
    ] },
    bass: { vol: 0.12, bars: [
      '0 - - - - - - - - - - - - - - -',
      '5 - - - - - - - - - - - - - - -',
    ] },
  },

  // ---------- 胜利封印页：一次性的凯旋号角（不循环） ----------
  victory: {
    title: '凯旋', bpm: 132, root: 72, scale: 'major', loop: false,
    lead: { bars: [
      '4 . 4 . 4 . 7 - - - - - 6 . 7 .',
      '9 - - - - - - - - - - - . . . .',
    ] },
    harm: { wave: 'square', vol: 0.035, bars: [
      '2 . 2 . 2 . 4 - - - - - 4 . 4 .',
      '7 - - - - - - - - - - - . . . .',
    ] },
    bass: { bars: [
      '0 . 0 . 0 . 0 - - - 4 - - - 4 .',
      '0 - - - - - - - - - - - . . . .',
    ] },
    drums: { bars: [
      'k . k . k . s . . . . . s . s .',
      'k . . . . . . . . . . . . . . .',
    ] },
  },
};

// ---------- 章节 → 曲目映射 ----------
// 键为章节 id（与 data/chapters.js 一致）；新增章节未登记时按地图 palette 回退
const FIELD_CUE = {
  1: 'village', 2: 'forest', 3: 'plateau', 4: 'starmap', 5: 'forge', 6: 'temple',
  7: 'signal', 8: 'deepspace', 9: 'sanctum', 10: 'tower', 11: 'trial',
};
const FINALE_IDS = new Set([8, 11]); // 第一部终章 / 全游戏终章

/**
 * 场景 → 曲目 id
 * @param {'title'|'field'|'lair'|'lair-calm'|'victory'} kind
 * @param {{ id: number, theme?: { palette?: string } }} [ch] 章节配置
 */
export function cueFor(kind, ch) {
  if (kind === 'field') {
    return FIELD_CUE[ch.id] || (ch.theme && ch.theme.palette === 'dungeon' ? 'temple' : 'plateau');
  }
  if (kind === 'lair') return FINALE_IDS.has(ch.id) ? 'boss-finale' : 'boss';
  return kind; // title / lair-calm / victory 与曲目 id 同名
}

// ---------- 编译 ----------
const NOTE_TOKEN = /^(-?\d+)([#b]?)$/;

function degreeToSemis(deg, scale) {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  return oct * 12 + scale[((deg % n) + n) % n];
}

/** 一个旋律声部的小节 → [{ step, midi, len }]（len 以十六分音符计） */
function compileVoice(bars, { scale, root, oct, transpose }) {
  const tokens = bars.join(' ').trim().split(/\s+/);
  const events = [];
  let open = null;
  tokens.forEach((tok, step) => {
    if (tok === '-') { if (open) open.len++; return; }
    open = null;
    if (tok === '.') return;
    const m = NOTE_TOKEN.exec(tok);
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    const midi = root + transpose + oct * 12 + degreeToSemis(Number(m[1]), scale) + acc;
    open = { step, midi, len: 1 };
    events.push(open);
  });
  return { events, steps: tokens.length };
}

function compileDrums(bars) {
  const tokens = bars.join(' ').trim().split(/\s+/);
  const events = [];
  tokens.forEach((tok, step) => { if (tok !== '.') events.push({ step, kind: DRUM_KINDS[tok] }); });
  return { events, steps: tokens.length };
}

/** 展开变奏：base 曲目 + transpose / bpm / waves / title 覆盖 */
function resolve(id) {
  const t = TRACKS[id];
  if (!t) throw new Error(`未知曲目: ${id}`);
  if (!t.base) return { ...t, transpose: t.transpose || 0 };
  const base = resolve(t.base);
  const merged = { ...base, title: t.title || base.title, bpm: t.bpm || base.bpm, transpose: base.transpose + (t.transpose || 0) };
  for (const v of ['lead', 'harm', 'bass']) {
    if (base[v] && t.waves && t.waves[v]) merged[v] = { ...base[v], wave: t.waves[v] };
  }
  return merged;
}

/** 把每个声部的事件按「曲内步号」分桶，短声部循环填满到曲长 */
function bucket(events, voiceSteps, length) {
  const byStep = Array.from({ length }, () => []);
  for (let offset = 0; offset < length; offset += voiceSteps) {
    for (const ev of events) {
      const step = ev.step + offset;
      if (step < length) byStep[step].push({ ...ev, step });
    }
  }
  return byStep;
}

/**
 * 编译曲目 → 播放器直接消费的结构
 * @returns {{ id, title, bpm, swing, loop, length,
 *   voices: { name, wave, vol, byStep: {midi, len}[][] }[],
 *   drums: { vol, byStep: {kind}[][] } | null }}
 */
export function compileTrack(id) {
  const t = resolve(id);
  const scale = SCALES[t.scale];
  const parts = [];
  for (const name of ['lead', 'harm', 'bass']) {
    if (!t[name]) continue;
    const cfg = { ...VOICE_DEFAULTS[name], ...t[name] };
    const v = compileVoice(cfg.bars, { scale, root: t.root, oct: cfg.oct, transpose: t.transpose });
    parts.push({ name, wave: cfg.wave, vol: cfg.vol, ...v });
  }
  const drums = t.drums ? { vol: t.drums.vol ?? 0.5, ...compileDrums(t.drums.bars) } : null;
  const length = Math.max(...parts.map((p) => p.steps), drums ? drums.steps : 0);
  return {
    id,
    title: t.title,
    bpm: t.bpm,
    swing: t.swing || 0,
    loop: t.loop !== false,
    length,
    voices: parts.map((p) => ({ name: p.name, wave: p.wave, vol: p.vol, byStep: bucket(p.events, p.steps, length) })),
    drums: drums ? { vol: drums.vol, byStep: bucket(drums.events, drums.steps, length) } : null,
  };
}

/** 数据校验（smoke 用）：返回问题列表，空数组 = 全部合法 */
export function trackErrors() {
  const errs = [];
  for (const [id, raw] of Object.entries(TRACKS)) {
    if (raw.base) {
      if (!TRACKS[raw.base]) errs.push(`${id}: base 曲目 ${raw.base} 不存在`);
      for (const w of Object.values(raw.waves || {})) if (!WAVES.includes(w)) errs.push(`${id}: 未知波形 ${w}`);
      continue;
    }
    if (!SCALES[raw.scale]) errs.push(`${id}: 未知调式 ${raw.scale}`);
    if (!(raw.bpm >= 40 && raw.bpm <= 220)) errs.push(`${id}: bpm 越界 ${raw.bpm}`);
    const lengths = [];
    for (const name of ['lead', 'harm', 'bass', 'drums']) {
      const voice = raw[name];
      if (!voice) continue;
      const wave = voice.wave || (VOICE_DEFAULTS[name] && VOICE_DEFAULTS[name].wave);
      if (name !== 'drums' && !WAVES.includes(wave)) errs.push(`${id}.${name}: 未知波形 ${wave}`);
      voice.bars.forEach((bar, i) => {
        const toks = bar.trim().split(/\s+/);
        if (toks.length !== STEPS_PER_BAR) errs.push(`${id}.${name} 第 ${i + 1} 小节有 ${toks.length} 格（应为 ${STEPS_PER_BAR}）`);
        toks.forEach((tok) => {
          const ok = name === 'drums' ? (tok === '.' || DRUM_KINDS[tok]) : (tok === '.' || tok === '-' || NOTE_TOKEN.test(tok));
          if (!ok) errs.push(`${id}.${name} 第 ${i + 1} 小节非法记号「${tok}」`);
        });
      });
      if (name !== 'drums' && voice.bars[0].trim().startsWith('-')) errs.push(`${id}.${name}: 首格不能是延长记号`);
      lengths.push(voice.bars.length);
    }
    const max = Math.max(...lengths);
    if (lengths.some((n) => max % n !== 0)) errs.push(`${id}: 各声部小节数 ${lengths.join('/')} 不能整除曲长`);
  }
  if (!errs.length) {
    for (const id of Object.keys(TRACKS)) {
      const c = compileTrack(id);
      for (const v of c.voices) {
        for (const bucketed of v.byStep) {
          for (const ev of bucketed) if (ev.midi < 24 || ev.midi > 108) errs.push(`${id}.${v.name}: 音高越界 MIDI ${ev.midi}`);
        }
      }
    }
  }
  return errs;
}
