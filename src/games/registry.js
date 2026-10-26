// ============================================================
// 第三章「科学计算高原」的小游戏登记表（纯数据，无 DOM）
// 每个小游戏：src/games/<id>/levels.js（关卡数据）+ game.js（面板玩法，mount 进 ui/GamePanel）
//   或 kind: 'scene'（自带 Phaser 场景，如向量风暴）。进度规则见 core/games.js。
// ============================================================
import { LEVELS as CARDS } from './cards/levels.js';
import { LEVELS as PICROSS } from './picross/levels.js';
import { LEVELS as ARENA } from './arena/levels.js';
import { LEVELS as SIGNAL } from './signal/levels.js';
import { LEVELS as CURVE } from './curve/levels.js';

/**
 * @typedef {Object} GameMeta
 * @property {string} id
 * @property {string} title 试炼场名
 * @property {string} badge 徽记（面板角标 / 地图牌子）
 * @property {string} inspired 借鉴的游戏（面板副标题）
 * @property {string} concept 本场练的 NumPy 概念（一句话）
 * @property {string} blurb 一句玩法介绍（NPC / 入口提示）
 * @property {'panel'|'scene'} kind panel = DOM 面板玩法；scene = 自带 Phaser 场景
 * @property {string} [sceneKey] kind='scene' 时的场景 key
 * @property {boolean} [boss] BOSS 护盾玩法（巢穴里，不发碎片，全部通过即破盾）
 * @property {Array<{id: string, title: string, challenge?: boolean}>} levels
 */

/** @type {Record<string, GameMeta>} */
export const GAMES = {
  cards: {
    id: 'cards', title: '阵列牌局', badge: '🃏', kind: 'panel',
    inspired: '借鉴《杀戮尖塔》的卡牌构筑',
    concept: '下标 · 切片 · 步长 · 布尔掩膜 · 原地运算',
    blurb: '敌人排成数组 hp，用「选择器卡」拼「操作卡」打出 hp[1:4] -= 3。',
    levels: CARDS,
  },
  picross: {
    id: 'picross', title: '星图拼绘', badge: '✦', kind: 'panel',
    inspired: '借鉴 Picross 数织 + Zachtronics 式步数评分',
    concept: '二维切片赋值 · 整行整列 · 步长',
    blurb: '按行列线索推理星座，用 sky[1:3, 2] = 1 这样的切片作画，施法越少奖牌越亮。',
    levels: PICROSS,
  },
  arena: {
    id: 'arena', title: '向量风暴', badge: '⚡', kind: 'scene', sceneKey: 'VectorArena',
    inspired: '借鉴《吸血鬼幸存者》+ Noita 式自编法术',
    concept: '布尔掩膜 + 向量化原地运算',
    blurb: '成群的史莱姆冲过来：战前写好 hp[dist < 3] -= 2 这样的咒语，战斗中按 Q 释放。',
    levels: ARENA,
  },
  signal: {
    id: 'signal', title: '外星信号', badge: '📡', kind: 'panel',
    inspired: '取材 1974 年阿雷西博信息（1679 = 23 × 73）',
    concept: 'reshape 与 shape · 翻转 [::-1] · 转置 .T',
    blurb: '一串 0/1 比特流——reshape 成正确的形状才会显出图案。',
    levels: SIGNAL,
  },
  curve: {
    id: 'curve', title: '曲线对消', badge: '〰', kind: 'panel', boss: true,
    inspired: '借鉴 Graphwar / Sine Rider 的函数作图',
    concept: 'np.linspace · np.sin · 振幅 / 频率 / 平移',
    blurb: '写出 A * np.sin(w * x) + b，与魔君的混沌曲线逐点抵消，打碎护盾。',
    levels: CURVE,
  },
};

export const getGame = (id) => GAMES[id] || null;

/** 第三章野外的四座试炼场（顺序 = 地图上从近到远的推荐顺序） */
export const FIELD_GAMES = ['cards', 'picross', 'signal', 'arena'];
