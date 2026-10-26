// ============================================================
// 星图拼绘 · 纯逻辑（无 DOM；game.js 与 scripts/verify-game-picross.mjs 共用）
// - 图案：字符画（'.' 暗格，其余字符 = 亮格，字母区分上色部件），解析成 0/1 目标
// - 线索：经典 Picross 游程线索（每行 / 列连续亮格的段长）
// - 施法：一句咒语在 sky 上执行（core/npmini.js），按本玩法规则校验后计入「咒语程序」
//   规则：只能给 sky 赋值；不许列表字面量（不能手抄整幅图）；sky 必须保持同形状、整数、只含 0 / 1
// - 成绩 = 程序里给 sky 赋值的句数（查询如 sky.sum(axis=0) 不计）；对照参考解句数 par 评奖牌
// ============================================================
import { run, fromJS, toJS, selectionOf, isNDArray } from '../../core/npmini.js';

/** 字符画 → { rows, cols, target: 0/1 二维数组, parts: 字符二维数组 } */
export function parseArt(art) {
  const parts = art.map((line) => [...line]);
  const rows = parts.length;
  const cols = parts[0].length;
  if (parts.some((r) => r.length !== cols)) throw new Error('星图字符画每行长度必须相同');
  const target = parts.map((r) => r.map((ch) => (ch === '.' ? 0 : 1)));
  return { rows, cols, target, parts };
}

/** 一行 / 一列的游程线索（全暗 = []） */
export function runsOf(line) {
  const out = [];
  let c = 0;
  for (const v of line) {
    if (v) c++;
    else if (c) { out.push(c); c = 0; }
  }
  if (c) out.push(c);
  return out;
}

export const column = (grid, j) => grid.map((r) => r[j]);

export function cluesOf(grid) {
  return {
    rows: grid.map(runsOf),
    cols: grid[0].map((_, j) => runsOf(column(grid, j))),
  };
}

const sameRuns = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 当前画布每行 / 每列是否已满足线索 */
export function clueStatus(grid, clues) {
  return {
    rows: grid.map((r, i) => sameRuns(runsOf(r), clues.rows[i])),
    cols: clues.cols.map((c, j) => sameRuns(runsOf(column(grid, j)), c)),
  };
}

export const gridsEqual = (a, b) => a.length === b.length && a.every((r, i) => r.length === b[i].length && r.every((v, j) => v === b[i][j]));

/** 关卡的初始画布（0/1 二维数组）：缺省全暗，底片关用 init 字符画 */
export function initialGrid(level) {
  const { rows, cols } = parseArt(level.art);
  if (level.init) return parseArt(level.init).target;
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

export const makeSky = (grid) => fromJS(grid, 'int');

/** 一段咒语里给 sky 赋值的句数（成绩口径） */
export const paintCount = (res) => res.usage.assigns.filter((a) => a.name === 'sky').length;

/**
 * 在画布 grid 上试施一句咒语（不改 grid）。返回：
 *   { kind: 'error', res }                       Python 报错
 *   { kind: 'reject', reason, res }               违反本玩法规则（不计入程序）
 *   { kind: 'query', res, selected: Set|null }     没给 sky 赋值：查询 / 选区预览（不计入）
 *   { kind: 'noop', res }                         赋值了但画布没变
 *   { kind: 'paint', res, grid, count, lit, erased }  有效作画
 */
export function trySpell(grid, src) {
  const scope = { sky: makeSky(grid) };
  const before = scope.sky;
  const res = run(src, scope);
  if (!res.ok) return { kind: 'error', res };
  const others = res.usage.assigns.filter((a) => a.name !== 'sky');
  if (others.length) {
    return { kind: 'reject', res, reason: `这里只给 sky 作画：不要另外定义变量（${[...new Set(others.map((a) => a.name))].join('、')}）。` };
  }
  if (res.usage.lists > 0) {
    return { kind: 'reject', res, reason: '不能手抄整幅图（不许用 [1, 0, …] 这样的列表）——用切片一块一块地画。' };
  }
  const count = paintCount(res);
  if (!count) return { kind: 'query', res, selected: selectionOf(res.value, before) };
  const sky = scope.sky;
  if (!isNDArray(sky)) return { kind: 'reject', res, reason: 'sky 必须还是一个数组。' };
  if (sky.shape.join() !== before.shape.join()) {
    return { kind: 'reject', res, reason: `画布的形状不能变：原来是 (${before.shape.join(', ')})，现在成了 (${sky.shape.join(', ')})。` };
  }
  if (sky.dtype === 'float') return { kind: 'reject', res, reason: 'sky 要保持整数数组（例如写 1 而不是 1.0，或者 sky[:] = 1 而不是 sky = np.ones(…)）。' };
  const next = toJS(sky).map((r) => r.map((v) => (v === true ? 1 : v === false ? 0 : v)));
  if (next.some((r) => r.some((v) => v !== 0 && v !== 1))) {
    return { kind: 'reject', res, reason: '画布上只能有 0（暗）和 1（亮）。' };
  }
  let lit = 0;
  let erased = 0;
  next.forEach((r, i) => r.forEach((v, j) => {
    if (v && !grid[i][j]) lit++;
    if (!v && grid[i][j]) erased++;
  }));
  if (!lit && !erased) return { kind: 'noop', res, count };
  return { kind: 'paint', res, grid: next, count, lit, erased };
}

/** 从关卡初始画布出发按顺序重放咒语程序 → { grid, count }（任何一句失效都抛错——程序里只存有效咒语） */
export function replay(level, program) {
  let grid = initialGrid(level);
  let count = 0;
  for (const src of program) {
    const r = trySpell(grid, src);
    if (r.kind !== 'paint') throw new Error(`咒语程序重放失败：${src}`);
    grid = r.grid;
    count += r.count;
  }
  return { grid, count };
}

/** 奖牌：≤ par 金，≤ par + 2 银，其余铜 */
export function medalOf(score, par) {
  if (score <= par) return { id: 'gold', icon: '🥇', name: '金牌' };
  if (score <= par + 2) return { id: 'silver', icon: '🥈', name: '银牌' };
  return { id: 'bronze', icon: '🥉', name: '铜牌' };
}

/** 预览：一句咒语将改变哪些格子（不改 grid） → { on: Set, off: Set, selected: Set } 键为 'r,c' */
export function previewCells(grid, src) {
  const out = { on: new Set(), off: new Set(), selected: new Set(), kind: null };
  if (!src.trim()) return out;
  const r = trySpell(grid, src);
  out.kind = r.kind;
  if (r.kind === 'paint') {
    r.grid.forEach((row, i) => row.forEach((v, j) => {
      if (v && !grid[i][j]) out.on.add(`${i},${j}`);
      if (!v && grid[i][j]) out.off.add(`${i},${j}`);
    }));
  } else if (r.kind === 'query' && r.selected) {
    const cols = grid[0].length;
    r.selected.forEach((k) => out.selected.add(`${Math.floor(k / cols)},${k % cols}`));
  }
  return out;
}

// ---------- Picross 求解器（验证线索唯一解；verify 脚本用） ----------

function lineOptions(clue, n) {
  const res = [];
  const k = clue.length;
  if (!k) return [Array(n).fill(0)];
  const rec = (i, acc) => {
    if (i === k) {
      if (acc.length <= n) res.push([...acc, ...Array(n - acc.length).fill(0)]);
      return;
    }
    const rest = clue.slice(i + 1).reduce((a, b) => a + b, 0) + (k - i - 1);
    for (let start = acc.length; start <= n - clue[i] - rest; start++) {
      const a = [...acc, ...Array(start - acc.length).fill(0), ...Array(clue[i]).fill(1)];
      rec(i + 1, i < k - 1 ? [...a, 0] : a);
    }
  };
  rec(0, []);
  return res;
}

/** 数解的个数（最多数到 limit）：行列线索传播 + 回溯 */
export function countSolutions(clues, limit = 2) {
  const R = clues.rows.length;
  const C = clues.cols.length;
  const sols = [];
  const propagate = (g, ro, co) => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < R; i++) {
        ro[i] = ro[i].filter((o) => o.every((v, j) => g[i][j] === null || g[i][j] === v));
        if (!ro[i].length) return false;
        for (let j = 0; j < C; j++) {
          if (g[i][j] !== null) continue;
          const v = ro[i][0][j];
          if (ro[i].every((o) => o[j] === v)) { g[i][j] = v; changed = true; }
        }
      }
      for (let j = 0; j < C; j++) {
        co[j] = co[j].filter((o) => o.every((v, i) => g[i][j] === null || g[i][j] === v));
        if (!co[j].length) return false;
        for (let i = 0; i < R; i++) {
          if (g[i][j] !== null) continue;
          const v = co[j][0][i];
          if (co[j].every((o) => o[i] === v)) { g[i][j] = v; changed = true; }
        }
      }
    }
    return true;
  };
  const solve = (g0, ro0, co0) => {
    if (sols.length >= limit) return;
    const g = g0.map((r) => r.slice());
    const ro = ro0.map((x) => x.slice());
    const co = co0.map((x) => x.slice());
    if (!propagate(g, ro, co)) return;
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < C; j++) {
        if (g[i][j] === null) {
          for (const v of [1, 0]) {
            const g2 = g.map((r) => r.slice());
            g2[i][j] = v;
            solve(g2, ro, co);
          }
          return;
        }
      }
    }
    sols.push(g);
  };
  solve(Array.from({ length: R }, () => Array(C).fill(null)),
    clues.rows.map((c) => lineOptions(c, C)), clues.cols.map((c) => lineOptions(c, R)));
  return { count: sols.length, solutions: sols };
}
