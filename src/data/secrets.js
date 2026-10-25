// ============================================================
// 秘藏（Python 文化彩蛋）：每章野外藏一块神秘石碑，靠近按 E 触碰
// - 不计入通关进度、不阻塞主线；发现记录存 G.secrets（存档可选字段 secrets）
// - 石碑展示一段 REPL 交互（>>> 输入 / 输出），输出必须是真实 Python 的输出：
//   scripts/verify-secrets.mjs 会用本机 python 逐条实跑比对（run: false 的条目
//   除外——如死循环、会打开浏览器的 import；这类用 checks 另行核实相关事实）
// - 位置不写死坐标：placeSecret 按地图数据确定性地挑一个「主路线之外」的空地，
//   手工地图与生成器地图同一套规则（smoke 校验其合法性）
// - 本模块是纯数据 + 纯函数，不依赖 Phaser / DOM（smoke 直接 import）
// ============================================================

import { T } from './maps.js';

/**
 * @typedef {Object} ReplLine
 * @property {string} in   输入（多行用 \n，渲染时续行加 ...）
 * @property {string} out  REPL 回显（空串 = 无输出；异常只显示最后一行「类型: 信息」）
 * @property {boolean} [run]  false = 不实跑（死循环 / 副作用），缺省 true
 * @property {boolean} [pick] true = out 只摘录实际输出中的若干行（逐行包含即可）
 *
 * @typedef {Object} SecretDef
 * @property {string} id
 * @property {number} chapter 所在章（野外）
 * @property {string} name 石碑名
 * @property {ReplLine[]} repl
 * @property {string[]} lines 中文讲解（1-2 句一行）
 * @property {{ code: string, expect: string }[]} [checks] 额外核实（python -c 实跑，stdout 全等）
 * @property {'antigravity'|'loop'} [effect] 关闭卷轴后（loop 为触碰时）的特效
 * @property {'water'} [near] 选址偏好：靠近水边
 */

/** @type {SecretDef[]} */
export const SECRETS = [
  {
    id: 'hello-world', chapter: 1, name: '你好世界石',
    repl: [{ in: 'print("Hello, World!")', out: 'Hello, World!' }],
    lines: [
      '几乎每位程序员学一门新语言，写下的第一行都是向世界问好。',
      '这个传统可以追溯到 1970 年代贝尔实验室的 C 语言教程——你的 Python 冒险，也从这里开始。',
    ],
  },
  {
    id: 'zen', chapter: 2, name: '禅之石碑',
    repl: [{
      in: 'import this',
      out: [
        'Beautiful is better than ugly.',
        'Explicit is better than implicit.',
        'Simple is better than complex.',
        'Readability counts.',
        'Errors should never pass silently.',
      ].join('\n'),
      pick: true,
    }],
    lines: [
      '《Python 之禅》：Tim Peters 写下的 19 条格言，藏在每一个 Python 解释器里（这里摘录 5 条）。',
      '优美胜于丑陋 · 明了胜于晦涩 · 简单胜于复杂 · 可读性很重要 · 错误不应悄悄放过。',
    ],
  },
  {
    id: 'float-fountain', chapter: 3, name: '浮点数之泉', near: 'water',
    repl: [
      { in: '0.1 + 0.2', out: '0.30000000000000004' },
      { in: '0.1 + 0.2 == 0.3', out: 'False' },
      { in: 'import math', out: '' },
      { in: 'math.isclose(0.1 + 0.2, 0.3)', out: 'True' },
    ],
    lines: [
      '计算机用二进制存小数，0.1 和 0.2 都只能存成近似值，相加后差了一丝丝。',
      '所以比较浮点数别用 ==，用 math.isclose（数组用 np.isclose）看「足够接近」。',
    ],
  },
  {
    id: 'nan-mirror', chapter: 4, name: '不认识自己的镜子',
    repl: [
      { in: "x = float('nan')", out: '' },
      { in: 'x == x', out: 'False' },
      { in: 'import math', out: '' },
      { in: 'math.isnan(x)', out: 'True' },
    ],
    lines: [
      'NaN（Not a Number，「不是一个数」）和谁比较都不相等——包括它自己。',
      '天文图像里的坏像素常记作 NaN：判断要用 math.isnan / np.isnan，求均值可以用 np.nanmean 跳过它们。',
    ],
  },
  {
    id: 'while-true', chapter: 5, name: '无限回廊', effect: 'loop',
    repl: [
      { in: 'while True:\n    walk()', out: 'KeyboardInterrupt', run: false },
      { in: 'issubclass(KeyboardInterrupt, Exception)', out: 'False' },
      { in: 'issubclass(KeyboardInterrupt, BaseException)', out: 'True' },
    ],
    lines: [
      '没有出口的 while True 会一直转下去，按 Ctrl+C 发出 KeyboardInterrupt 才能打断它。',
      'KeyboardInterrupt 继承自 BaseException 而不是 Exception，所以 except Exception: 拦不住 Ctrl+C——死循环总能被你叫停。',
    ],
  },
  {
    id: 'braces', chapter: 6, name: '花括号之门',
    repl: [{ in: 'from __future__ import braces', out: 'SyntaxError: not a chance' }],
    lines: [
      'Python 用缩进而不是花括号 { } 来划分代码块。',
      '__future__ 本是提前启用「未来语法」的模块；这一行是开发者留下的玩笑——花括号永远不会来（not a chance）。',
    ],
  },
  {
    id: 'antigravity', chapter: 7, name: '反重力石', effect: 'antigravity', near: 'water',
    repl: [{ in: 'import antigravity', out: '（浏览器打开了 xkcd 第 353 号漫画）', run: false }],
    checks: [{
      code: "import importlib.util, pathlib\nspec = importlib.util.find_spec('antigravity')\nprint('xkcd.com/353' in pathlib.Path(spec.origin).read_text())",
      expect: 'True',
    }],
    lines: [
      '真实的 Python 里，这一行会打开浏览器跳到 xkcd 第 353 号漫画：有人 import antigravity，就飞了起来。',
      '石碑的魔力让你也浮空几秒——试试飞过水面！',
    ],
  },
  {
    id: 'hello-module', chapter: 8, name: '深空回声',
    repl: [
      { in: 'import __hello__', out: '' },
      { in: '__hello__.main()', out: 'Hello world!' },
    ],
    lines: [
      '__hello__ 是 CPython 自带的一个小测试模块，用来检查「冻结模块」能否正常加载。',
      '从 Python 3.11 起 import 它不再自动打印，要调用 main()——来自深空的问候，也得主动去听。',
    ],
  },
  {
    id: 'identity-twins', chapter: 9, name: '双子石',
    repl: [
      { in: 'a = []', out: '' },
      { in: 'b = []', out: '' },
      { in: 'a == b', out: 'True' },
      { in: 'a is b', out: 'False' },
    ],
    lines: [
      '== 问「值相等吗」，is 问「是同一个对象吗」：两个新建的空列表内容一样，却是两个不同的对象。',
      '所以判断 None 写 x is None；比较数值和内容，请用 ==。',
    ],
  },
  {
    id: 'main-gate', chapter: 10, name: '主程序之门',
    repl: [{ in: '__name__', out: "'__main__'" }],
    checks: [{ code: 'print(__name__)', expect: '__main__' }],
    lines: [
      '直接运行的脚本里，__name__ 的值是 "__main__"；被别人 import 时，它是模块自己的名字。',
      '所以写在 if __name__ == "__main__": 下面的代码只在直接运行时执行——这扇门只为主程序打开。',
    ],
  },
  {
    id: 'assert-guard', chapter: 11, name: '断言守卫',
    repl: [
      { in: 'assert 1 + 1 == 2', out: '' },
      { in: 'assert 1 + 1 == 3, "守卫不同意"', out: 'AssertionError: 守卫不同意' },
    ],
    lines: [
      'assert 后面的条件为真就放行，为假就抛出 AssertionError——测试用例本质上就是一排这样的守卫。',
      '注意：用 python -O 运行时 assert 会被整体跳过，所以别拿它校验用户输入。',
    ],
  },
];

export const SECRET_TOTAL = SECRETS.length;

export const getSecret = (id) => SECRETS.find((s) => s.id === id) || null;
export const secretForChapter = (chId) => SECRETS.find((s) => s.chapter === chId) || null;
/** 已发现的秘藏数（只数登记在册的 id，存档里的陌生 id 不计） */
export const countFound = (found) => SECRETS.filter((s) => found.has(s.id)).length;

// ------------------------------------------------------------
// 选址：在地图数据上确定性地挑一个「主路线之外」的空地
// 规则（切比雪夫距离，单位：格）——smoke 按同一份常量复核：
// ------------------------------------------------------------
export const SECRET_RULES = {
  margin: 2,          // 离地图边缘
  clearance: 2,       // 周边 (2r+1)² 格不可有碰撞瓦片（特效需要活动空间）
  nearClearance: 1,   // near: 'water' 时放宽为 3×3（水边）
  solid: 2,           // 树 / 水晶 / 火炬
  house: 4,           // 房屋（贴图大）
  interact: 4,        // 符文石 / 石碑 / 门：避免 E 交互与提示互相抢占
  spawn: 5,           // 出生点：要靠探索才能发现
  slime: 3,           // 史莱姆初始位置
  portal: 3,          // 传送门判定区
  route: 3,           // 离主路线（土路；地牢风格取十字中线）
  water: 3,           // near: 'water' 时水面需在此距离内
};

const TILE = 128;
const tileOf = (p) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const isWater = (t) => t === T.WATER || t === T.WATER2;
const INTERACT_TYPES = new Set(['rune', 'npc', 'door', 'doorlink', 'gate']);
const SOLID_TYPES = new Set(['tree', 'crystal', 'torch']);

/** 主路线瓦片：有土路就用土路；地牢风格野外没有土路，取生成器的十字中线 */
function routeTiles(def) {
  const tiles = [];
  for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
    if (def.grid[y][x] === T.PATH) tiles.push([x, y]);
  }
  if (tiles.length) return tiles;
  const cx = Math.floor(def.w / 2), midY = Math.floor(def.h / 2);
  for (let y = 0; y < def.h; y++) tiles.push([cx, y]);
  for (let x = 0; x < def.w; x++) tiles.push([x, midY]);
  return tiles;
}

/** 点到矩形（像素）的切比雪夫格距 */
function rectDist(tx, ty, r) {
  const x0 = Math.floor(r.x / TILE), y0 = Math.floor(r.y / TILE);
  const x1 = Math.floor((r.x + r.w - 1) / TILE), y1 = Math.floor((r.y + r.h - 1) / TILE);
  const dx = tx < x0 ? x0 - tx : tx > x1 ? tx - x1 : 0;
  const dy = ty < y0 ? y0 - ty : ty > y1 ? ty - y1 : 0;
  return Math.max(dx, dy);
}

/** 候选格是否满足全部硬约束（smoke 复用这一判定，再独立核对几何） */
export function secretSpotOk(def, secret, tx, ty) {
  const R = SECRET_RULES;
  const { w, h, grid } = def;
  if (tx < R.margin || ty < R.margin || tx > w - 1 - R.margin || ty > h - 1 - R.margin) return false;
  const blocked = (x, y) => x < 0 || y < 0 || x >= w || y >= h || def.colliding.includes(grid[y][x]);
  const c = secret.near === 'water' ? R.nearClearance : R.clearance;
  for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) if (blocked(tx + dx, ty + dy)) return false;
  for (const p of def.props) {
    const [px, py] = tileOf(p);
    const d = cheb(tx, ty, px, py);
    if (INTERACT_TYPES.has(p.type) && d < R.interact) return false;
    if (SOLID_TYPES.has(p.type) && d < R.solid) return false;
    if (p.type === 'house' && d < R.house) return false;
    if (d === 0) return false; // 灌木 / 蘑菇等装饰：至少不重叠
  }
  for (const s of Object.values(def.spawns || {})) {
    const [sx, sy] = tileOf(s);
    if (cheb(tx, ty, sx, sy) < R.spawn) return false;
  }
  for (const s of def.slimes || []) {
    const [sx, sy] = tileOf(s);
    if (cheb(tx, ty, sx, sy) < R.slime) return false;
  }
  for (const p of def.portals || []) if (rectDist(tx, ty, p.rect) < R.portal) return false;
  return true;
}

/** 确定性散列（同一章永远同一个位置，与生成器的随机流互不干扰） */
const hash = (tx, ty, seed) => (((tx * 73856093) ^ (ty * 19349663) ^ (seed * 83492791)) >>> 0);

/**
 * 为一块秘藏石碑选址。返回 { x, y, tx, ty }（像素为格子中心）或 null（无合法位置）。
 * 软偏好按顺序收窄：near: 'water' → 水面在 3 格内；否则 → 离主路线 ≥ 3 格；
 * 收窄后无候选则退回上一层（硬约束始终满足）。
 */
export function placeSecret(def, secret) {
  const R = SECRET_RULES;
  let cands = [];
  for (let ty = 0; ty < def.h; ty++) for (let tx = 0; tx < def.w; tx++) {
    if (secretSpotOk(def, secret, tx, ty)) cands.push([tx, ty]);
  }
  if (!cands.length) return null;

  if (secret.near === 'water') {
    const water = [];
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) if (isWater(def.grid[y][x])) water.push([x, y]);
    const wet = cands.filter(([tx, ty]) => water.some(([x, y]) => cheb(tx, ty, x, y) <= R.water));
    if (wet.length) cands = wet;
  } else {
    const route = routeTiles(def);
    const off = cands.filter(([tx, ty]) => route.every(([x, y]) => cheb(tx, ty, x, y) >= R.route));
    if (off.length) cands = off;
  }

  const seed = secret.chapter * 7919 + 17;
  cands.sort((a, b) => hash(a[0], a[1], seed) - hash(b[0], b[1], seed));
  const [tx, ty] = cands[0];
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, tx, ty };
}

/** 野外地图挂上本章秘藏石碑（无秘藏 / 无合法位置时原样返回） */
export function withSecret(ch, def) {
  const s = secretForChapter(ch.id);
  if (!s) return def;
  const spot = placeSecret(def, s);
  if (spot) def.props.push({ type: 'secret', x: spot.x, y: spot.y, secretId: s.id });
  return def;
}
