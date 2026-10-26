// ============================================================
// 星图拼绘 · 关卡校验（纯逻辑，不依赖浏览器 / Python）
// 每关断言：
//   - 图案合法（每行等长、至少一个亮格、parts 覆盖图中所有字母）
//   - 行列线索有唯一解（Picross 求解器），且唯一解就是目标图案——学生能纯靠推理画出来
//   - 参考解经 npmini 按游戏规则（logic.trySpell）逐句执行后等于目标；par = 参考解给 sky 赋值的句数
//   - 初始画布不是目标（空画布 / 负片都不过关）；数据字段齐全（两条提示 + 参考解 + 天文知识）
//   - 规则：手抄列表、改变形状、写成浮点、另外定义变量都被拒绝；查询不计入
// 参考解在真 NumPy 上的对拍见 src/games/picross/verify.js（由 verify-npmini.mjs 执行）。
// 任一失败 exit 1。
// ============================================================
import { LEVELS } from '../src/games/picross/levels.js';
import {
  parseArt, cluesOf, countSolutions, gridsEqual, initialGrid, trySpell, replay, medalOf, previewCells,
} from '../src/games/picross/logic.js';

let fail = 0;
const ok = (cond, msg) => {
  if (cond) return true;
  fail++;
  console.log(`  ✗ ${msg}`);
  return false;
};

console.log('[星图拼绘] 关卡校验');
const ids = new Set();
for (const lv of LEVELS) {
  const label = `${lv.id}（${lv.title}）`;
  ok(!ids.has(lv.id), `${label} id 重复`);
  ids.add(lv.id);
  for (const f of ['title', 'concept', 'story', 'solution', 'fact']) ok(typeof lv[f] === 'string' && lv[f].length > 0, `${label} 缺少 ${f}`);
  ok(Array.isArray(lv.hints) && lv.hints.length === 2, `${label} 应有两条提示（概念 → 关键写法）`);
  const { rows, cols, target, parts } = parseArt(lv.art);
  ok(rows >= 5 && cols >= 5 && rows <= 10 && cols <= 13, `${label} 尺寸 ${rows}×${cols} 超出 5~10 × 5~13`);
  const letters = new Set(parts.flat().filter((ch) => ch !== '.'));
  letters.forEach((ch) => ok(lv.parts && lv.parts[ch], `${label} 部件「${ch}」没有配色`));
  ok(target.flat().some(Boolean), `${label} 没有亮格`);

  const clues = cluesOf(target);
  const sol = countSolutions(clues, 2);
  ok(sol.count === 1, `${label} 行列线索有 ${sol.count} 个解（应唯一）`);
  if (sol.count === 1) ok(gridsEqual(sol.solutions[0], target), `${label} 线索的唯一解不是目标图案`);

  if (lv.init) {
    const init = parseArt(lv.init);
    ok(init.rows === rows && init.cols === cols, `${label} 初始画布尺寸与目标不一致`);
  }
  const init = initialGrid(lv);
  ok(!gridsEqual(init, target), `${label} 初始画布已经等于目标`);

  const steps = lv.solution.split(';').map((s) => s.trim()).filter(Boolean);
  let grid = init;
  let count = 0;
  let good = true;
  for (const st of steps) {
    const r = trySpell(grid, st);
    if (!ok(r.kind === 'paint', `${label} 参考解「${st}」在游戏规则下是 ${r.kind}${r.reason ? `：${r.reason}` : r.res && r.res.error ? `：${r.res.error.message}` : ''}`)) { good = false; break; }
    grid = r.grid;
    count += r.count;
  }
  if (good) {
    ok(gridsEqual(grid, target), `${label} 参考解画出的图与目标不一致`);
    ok(count === lv.par, `${label} par=${lv.par} 但参考解是 ${count} 句`);
    // 整段一次施放（; 连写）与逐句施放结果一致，句数也一致
    const whole = trySpell(init, lv.solution);
    ok(whole.kind === 'paint' && gridsEqual(whole.grid, target) && whole.count === lv.par, `${label} 参考解整段施放结果不一致`);
    const rp = replay(lv, steps);
    ok(gridsEqual(rp.grid, target) && rp.count === lv.par, `${label} 程序重放结果不一致`);
  }
  console.log(`  ${fail ? '·' : '✓'} ${label} ${rows}×${cols}，${target.flat().filter(Boolean).length} 个亮格，线索唯一解，参考解 ${lv.par} 句`);
}

// ---------- 规则 ----------
const blank = Array.from({ length: 5 }, () => Array(5).fill(0));
const kind = (src, g = blank) => trySpell(g, src).kind;
ok(kind('sky[2] = 1') === 'paint', '整行赋值应计入');
ok(kind('sky[:, 2]') === 'query', '没有赋值的选区应是查询');
ok(trySpell(blank, 'sky[1:3, 2]').selected.size === 2, '选区预览应选中 2 格');
ok(kind('sky.sum(axis=0)') === 'query', 'axis 求和是查询');
ok(kind('sky = np.array([[1, 0, 0, 0, 0]] * 5)') === 'reject', '手抄列表应被拒绝');
ok(kind('sky = np.zeros((3, 3), dtype=int)') === 'reject', '改变形状应被拒绝');
ok(kind('sky = sky + 0.5') === 'reject', '浮点画布应被拒绝');
ok(kind('sky = sky + 2') === 'reject', '出现 0 / 1 以外的值应被拒绝');
ok(kind('x = 1') === 'reject', '另外定义变量应被拒绝');
ok(kind('sky[5] = 1') === 'error', '越界应是 Python 报错');
ok(kind('sky[0] = 0') === 'noop', '没有改变画布应是 noop');
ok(trySpell(blank, 'sky[0] = 1; sky[1] = 1').count === 2, '; 连写的两句都计数');
ok(trySpell(blank, 'sky[0] = 1; sky.sum()').count === 1, '查询句不计数');
const pv = previewCells([[1, 0, 0, 0, 0], ...blank.slice(1)], 'sky[0] = 0; sky[1, :2] = 1');
ok(pv.on.size === 2 && pv.off.size === 1, '预览应标出 2 格新点亮、1 格擦掉');
ok(medalOf(2, 2).id === 'gold' && medalOf(4, 2).id === 'silver' && medalOf(5, 2).id === 'bronze', '奖牌线：≤ par 金、≤ par+2 银、其余铜');
console.log(`  ${fail ? '·' : '✓'} 施法规则：查询不计数、手抄列表 / 改形状 / 浮点 / 越值 / 另起变量被拒、预览标出变化格`);

const core = LEVELS.filter((l) => !l.challenge).length;
if (fail) {
  console.log(`\n[verify-game-picross] ${fail} 项失败 ✘`);
  process.exit(1);
}
console.log(`[verify-game-picross] ✓ ${LEVELS.length} 关（核心 ${core} + 挑战 ${LEVELS.length - core}）全部通过`);
