// 本小游戏送去与真 NumPy 对拍的用例（scripts/verify-npmini.mjs 汇总）：每条 { name, code }，code 用 print 输出
// 每关：从初始画布出发逐句执行参考解，打印最终 sky 与行列求和——证明游戏里的切片作画与真 NumPy 逐格一致
// （「最终 sky 等于目标图案」由 scripts/verify-game-picross.mjs 用同一个解释器校验）
import { LEVELS } from './levels.js';
import { initialGrid, parseArt } from './logic.js';

const pyList = (grid) => `[${grid.map((r) => `[${r.join(', ')}]`).join(', ')}]`;

const levelCases = LEVELS.map((lv) => {
  const { rows, cols } = parseArt(lv.art);
  const init = lv.init ? `np.array(${pyList(initialGrid(lv))})` : `np.zeros((${rows}, ${cols}), dtype=int)`;
  const steps = lv.solution.split(';').map((s) => s.trim()).filter(Boolean);
  return {
    name: `picross:${lv.id}`,
    code: [`sky = ${init}`, ...steps, 'print(sky)', 'print(sky.sum(axis=1))', 'print(sky.sum(axis=0))'].join('\n'),
  };
});

// 学生常写的选区 / 查询（预览与报错路径）
const extra = [
  'sky = np.zeros((5, 7), dtype=int)\nprint(sky[0, 1:4])\nprint(sky[1:3, 2:5].shape)\nprint(sky[:, -1])\nprint(sky[1:-1, 1:-1].shape)',
  'sky = np.zeros((9, 9), dtype=int)\nsky[1:8:6, 1:8] = 1\nprint(sky)',
  'sky = np.zeros((4, 5), dtype=int)\nsky[::2, ::2] = 1\nsky = 1 - sky\nprint(sky)\nprint(sky.sum())',
  'sky = np.zeros((4, 5), dtype=int)\nsky[:, 1::2] = 1\nsky[2] = 0\nprint(sky)\nprint(sky.sum(axis=0))',
  'sky = np.zeros((4, 5), dtype=int)\nsky[5] = 1',
  'sky = np.zeros((4, 5), dtype=int)\nsky[1, 2, 3] = 1',
  'sky = np.zeros((4, 5), dtype=int)\nsky[:, 1:3] = [1, 1, 1]',
  'sky = np.zeros((4, 5), dtype=int)\nsky[1:3] = 1.0\nprint(sky)',
  'sky = np.zeros((4, 5), dtype=int)\nsky = sky + 1\nprint(sky)',
].map((code, i) => ({ name: `picross:extra${i}`, code }));

export const VERIFY_CASES = [...levelCases, ...extra];
