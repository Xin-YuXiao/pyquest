// 曲线对消送去与真 NumPy 对拍的用例：每层护盾的参考解与魔君曲线逐点相减，残差应为 0，并抽样打印曲线
import { LEVELS } from './levels.js';
import { X_EXPR } from './rules.js';

export const VERIFY_CASES = LEVELS.map((l) => ({
  name: `curve ${l.id}`,
  code: `x = ${X_EXPR}\nt = ${l.target}\ny = ${l.solution}\nprint(np.abs(t - y).max())\nprint(t[::9])\nprint(t.max(), t.min())`,
}));
