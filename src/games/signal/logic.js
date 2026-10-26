// ============================================================
// 外星信号 · 判定与评分（纯函数，无 DOM；面板与校验脚本共用）
// ============================================================
import { fromJS, isNDArray, isScalar, NONE } from '../../core/npmini.js';

/** 本关的初始作用域：每个变量是一份全新的 ndarray */
export function makeScope(level) {
  const scope = {};
  for (const [name, v] of Object.entries(level.vars)) scope[name] = fromJS(v.data, v.dtype);
  return scope;
}

/** 比特总数（多频道关卡取第一个频道的长度） */
export const bitCount = (level) => Object.values(level.vars)[0].data.length;

export const targetShape = (level) => [level.target.length, level.target[0].length];

/** 从一次执行结果里取出「要解码的值」：表达式的值；赋值语句取最后被赋值的变量 */
export function valueOf(res, scope) {
  if (!res || !res.ok) return null;
  if (res.value !== NONE) return res.value;
  const names = res.usage.assigns.map((a) => a.name).filter(Boolean);
  const last = names[names.length - 1];
  return last && scope[last] !== undefined ? scope[last] : null;
}

/**
 * 判定一个值和目标图像的关系：
 *   ok      形状与像素都一致（dtype 不论：布尔 True/False 当作 1/0）
 *   values  形状对、像素不对（match = 相同像素占比）
 *   shape   二维但形状不对
 *   1d / nd 一维 / 三维以上的数组
 *   scalar  一个数；none 不是数组
 */
export function judge(level, v) {
  const [R, C] = targetShape(level);
  if (v === null || v === undefined) return { kind: 'none', ok: false };
  if (isScalar(v)) return { kind: 'scalar', ok: false, value: v.v };
  if (!isNDArray(v)) return { kind: 'none', ok: false };
  const shape = v.shape.slice();
  if (v.ndim === 1) return { kind: '1d', ok: false, shape };
  if (v.ndim !== 2) return { kind: 'nd', ok: false, shape };
  if (shape[0] !== R || shape[1] !== C) return { kind: 'shape', ok: false, shape };
  let same = 0;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < C; j++) if (Number(v.at(i * C + j)) === level.target[i][j]) same++;
  }
  const match = same / (R * C);
  return { kind: same === R * C ? 'ok' : 'values', ok: same === R * C, shape, match };
}

/** 施法次数 → 奖牌：≤ par 金、≤ par + 2 银、其余铜 */
export function medalFor(casts, par) {
  if (casts <= par) return { key: 'gold', label: '金牌', icon: '🥇' };
  if (casts <= par + 2) return { key: 'silver', label: '银牌', icon: '🥈' };
  return { key: 'bronze', label: '铜牌', icon: '🥉' };
}

/** 判定结果 → 给学生的一句反馈 */
export function feedback(level, j) {
  const n = bitCount(level);
  switch (j.kind) {
    case 'ok': return '解码成功！';
    case 'values':
      return `形状对了，但图案还不对（相同像素 ${Math.round(j.match * 100)}%）——是不是颠倒、镜像了，或者还没解码？`;
    case 'shape':
      return `排成了 ${j.shape[0]} 行 × ${j.shape[1]} 列，可画面是乱的——行优先：每一行依次装入 ${j.shape[1]} 个比特。行数 × 列数 = ${n}，换一种排法试试。`;
    case '1d': return `还是一维数组（shape (${j.shape[0]},)）——用 reshape(行数, 列数) 把它排成二维图像。`;
    case 'nd': return `排成了 ${j.shape.length} 维数组——图像只需要两维：(行数, 列数)。`;
    case 'scalar': return `得到一个数：${Number.isInteger(j.value) ? j.value : j.value.toFixed(3)}。解码器要的是一张二维图像（数组）。`;
    default: return '这句咒语没有给出图像——直接写出要解码的表达式（或赋值后再写变量名）。';
  }
}
