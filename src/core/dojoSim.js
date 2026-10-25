// ============================================================
// 代码训练场 · 关卡模拟器（纯函数，无 DOM / Phaser）
//
// 同一份逻辑跑在两处：
//   - Pyodide Worker：玩家的 Python 每调用一次英雄 API，就同步调用 apply() 结算一步，
//     look() 等查询的返回值也来自这里；
//   - 主线程：拿到 Worker 送回的动作列表后用 simulate() 重算一遍，生成回放帧并判定——
//     判定只取决于动作列表，不信任 Worker 送回的结论（玩家代码碰不到游戏对象）。
// smoke 校验模拟器规则与关卡数据；scripts/verify-dojo.mjs 用 CPython 实跑参考解。
// ============================================================

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIR_NAMES = Object.keys(DIRS);
export const MAX_QUERIES = 500; // look / position / shards 的调用上限（防「只看不走」的死循环）
export const STOP = '__stop__'; // apply 返回它 = 本次运行已结束（Python 侧据此抛出停止信号）

const TILE_NAME = { '#': 'wall', '~': 'water', '^': 'trap', '*': 'shard', m: 'slime', E: 'exit', F: 'flag' };

/** 网格某格对外的名字（look() 的返回值）；出界算墙 */
export function tileName(state, x, y) {
  if (y < 0 || y >= state.h || x < 0 || x >= state.w) return 'wall';
  return TILE_NAME[state.grid[y][x]] || 'empty';
}

/** 新建一次运行的状态（某关的第 variant 个布局） */
export function createSim(level, variant = 0) {
  const v = level.variants[variant];
  const grid = v.grid.map((row) => row.split(''));
  let sx = 0, sy = 0, shardsTotal = 0, slimes = 0;
  grid.forEach((row, y) => row.forEach((c, x) => {
    if (c === 'S') { sx = x; sy = y; row[x] = '.'; }
    if (c === '*') shardsTotal++;
    if (c === 'm') slimes++;
  }));
  return {
    level, variant,
    w: grid[0].length, h: grid.length, grid,
    x: sx, y: sy, facing: 'right',
    shards: 0, shardsTotal, slimes,
    steps: 0, queries: 0,
    status: 'running', reason: '',
    actions: [], // { op, arg, line }：所有 API 调用（含查询），主线程据此重算
    frames: [],  // 回放帧：每个改变局面的动作一帧
  };
}

function frame(s, event, extra = {}) {
  s.frames.push({ event, x: s.x, y: s.y, facing: s.facing, shards: s.shards, line: s._line || 0, ...extra });
}

function end(s, status, reason) {
  s.status = status;
  s.reason = reason;
  frame(s, status, { reason });
}

function goalMet(s) {
  const need = s.level.win.shards === 'all' ? s.shardsTotal : 0;
  return s.shards >= need;
}

/** 勇者落到 (x, y)：处理陷阱 / 碎片 / 传送门（墙、水、史莱姆在调用前已排除） */
function landOn(s, x, y, how) {
  s.x = x; s.y = y;
  const c = s.grid[y][x];
  if (c === '^') { frame(s, how); end(s, 'fail', '踩到陷阱了'); return; }
  if (c === '*') {
    s.grid[y][x] = '.';
    s.shards++;
    frame(s, how, { pickup: { x, y } });
  } else {
    frame(s, how);
  }
  if (c === 'E' && s.level.win.type === 'reach') {
    if (goalMet(s)) end(s, 'win', '到达传送门');
    else frame(s, 'locked', { reason: `传送门还没亮：先收集全部碎片（${s.shards} / ${s.shardsTotal}）` });
  }
}

function blockReason(c, jumped) {
  if (c === 'wall') return jumped ? '跳起来撞到墙了' : '撞到墙了';
  if (c === 'water') return '掉进水里了';
  if (c === 'slime') return '被史莱姆挡住了——先 attack() 再走';
  return '';
}

function checkDir(dir) {
  return dir === undefined || dir === null || DIR_NAMES.includes(dir);
}

/**
 * 结算一次英雄 API 调用。返回值：
 *   look → 格子名；position → 'x,y'；shards → 数字字符串；其余 → 'ok'；
 *   本次调用让运行结束（胜利 / 失败 / 步数用尽）→ STOP。
 * 非法方向不在这里报错（Python 侧先校验并抛出中文 ValueError）。
 */
export function apply(s, op, arg = null, line = 0) {
  if (s.status !== 'running') return STOP;
  s.actions.push({ op, arg, line });
  s._line = line;

  if (op === 'look' || op === 'position' || op === 'shards') {
    s.queries++;
    if (s.queries > MAX_QUERIES) { end(s, 'limit', `查看次数超过 ${MAX_QUERIES} 次——是不是写了死循环？`); return STOP; }
    if (op === 'position') return `${s.x},${s.y}`;
    if (op === 'shards') return String(s.shards);
    const d = DIRS[arg || s.facing];
    return tileName(s, s.x + d[0], s.y + d[1]);
  }

  s.steps++;
  if (s.steps > s.level.maxSteps) { end(s, 'limit', `步数用尽（本关最多 ${s.level.maxSteps} 步）`); return STOP; }

  if (op === 'move' || op === 'jump') {
    if (!checkDir(arg)) { end(s, 'fail', `不认识的方向 ${arg}`); return STOP; }
    s.facing = arg || s.facing;
    const [dx, dy] = DIRS[s.facing];
    const n = op === 'jump' ? 2 : 1;
    const tx = s.x + dx * n, ty = s.y + dy * n;
    const blocked = blockReason(tileName(s, tx, ty), op === 'jump');
    if (op === 'jump' && tileName(s, s.x + dx, s.y + dy) === 'wall') {
      frame(s, 'bump');
      end(s, 'fail', '前面是墙，跳不过去');
    } else if (blocked) {
      frame(s, tileName(s, tx, ty) === 'water' ? 'fall' : 'bump', { tx, ty });
      end(s, 'fail', blocked);
    } else {
      landOn(s, tx, ty, op);
    }
  } else if (op === 'attack') {
    const [dx, dy] = DIRS[s.facing];
    const tx = s.x + dx, ty = s.y + dy;
    if (tileName(s, tx, ty) === 'slime') {
      s.grid[ty][tx] = '.';
      s.slimes--;
      frame(s, 'attack', { hit: { x: tx, y: ty } });
    } else {
      frame(s, 'attack');
    }
  } else {
    end(s, 'fail', `未知动作 ${op}`);
  }
  return s.status === 'running' ? 'ok' : STOP;
}

/** 程序跑完后的收尾判定（运行中途已分出胜负的不变） */
export function finish(s) {
  if (s.status !== 'running') return s;
  if (!s.actions.some((a) => a.op !== 'look' && a.op !== 'position' && a.op !== 'shards')) {
    end(s, 'fail', '勇者一动不动——试试调用 move()');
  } else if (s.level.win.type === 'stop') {
    if (s.grid[s.y][s.x] === 'F' && goalMet(s)) end(s, 'win', '停在了旗子上');
    else end(s, 'fail', '程序结束了，但勇者没有停在旗子上');
  } else {
    end(s, 'fail', goalMet(s) ? '程序结束了，还没走到传送门' : `还没收集全部碎片（${s.shards} / ${s.shardsTotal}）`);
  }
  return s;
}

/** 主线程重算：按动作列表回放一遍，得到回放帧与判定 */
export function simulate(level, variant, actions) {
  const s = createSim(level, variant);
  for (const a of actions) {
    if (apply(s, a.op, a.arg, a.line) === STOP && s.status !== 'running') break;
  }
  return finish(s);
}

/** 代码行数：非空、非注释行 */
export function countLines(code) {
  return String(code || '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length;
}

/** 动作步数（不含 look / position / shards 查询） */
export function countSteps(actions) {
  return actions.filter((a) => a.op === 'move' || a.op === 'jump' || a.op === 'attack').length;
}

// ---------- 进度（存档 v3 可选字段 dojo） ----------

const MAX_CODE = 4000;

/** 记一次通关：个人最佳取行数 / 步数各自的最小值；看过参考解的成绩打标记 */
export function recordClear(rec, { lines, steps, sawSolution = false, code = '' }) {
  const r = rec ? { ...rec } : { clears: 0 };
  r.clears = (r.clears || 0) + 1;
  r.cleared = true;
  r.bestLines = r.bestLines ? Math.min(r.bestLines, lines) : lines;
  r.bestSteps = r.bestSteps ? Math.min(r.bestSteps, steps) : steps;
  if (sawSolution) r.sawSolution = true;
  if (code) r.code = String(code).slice(0, MAX_CODE);
  return r;
}

/** 读档清洗：只保留合法关卡 id 的合法字段，坏数据丢弃不抛错 */
export function sanitizeDojo(d, levelIds) {
  const out = {};
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  for (const [k, v] of Object.entries(d)) {
    const id = Number(k);
    if (!levelIds.includes(id) || !v || typeof v !== 'object') continue;
    const r = {};
    if (v.cleared === true) r.cleared = true;
    for (const f of ['clears', 'bestLines', 'bestSteps']) {
      if (Number.isInteger(v[f]) && v[f] > 0) r[f] = v[f];
    }
    if (v.sawSolution === true) r.sawSolution = true;
    if (typeof v.code === 'string') r.code = v.code.slice(0, MAX_CODE);
    out[id] = r;
  }
  return out;
}

/** 关卡是否已解锁：第 1 关总是开放，之后每关要求前一关通关 */
export function levelUnlocked(levels, dojo, id) {
  const i = levels.findIndex((l) => l.id === id);
  if (i <= 0) return i === 0;
  return !!(dojo[levels[i - 1].id] && dojo[levels[i - 1].id].cleared);
}
