// ============================================================
// 曲线对消 · 判定规则（纯函数，无 DOM；verify / smoke 直接导入）
// 作用域里只有 x = np.linspace(0, 2 * np.pi, 100)；魔君的护盾曲线是 level.target（对学生隐藏）。
// 学生写一个关于 x 的表达式（或 y = …），结果必须是和 x 同形状的数组；
// 残差 = 魔君曲线 − 学生曲线，最大绝对残差 ≤ level.tol 即该层护盾被对消。
// ============================================================
import { run, cloneScope, NONE, isNDArray, toJS } from '../../core/npmini.js';

export const X_EXPR = 'np.linspace(0, 2 * np.pi, 100)';
export const DEFAULT_TOL = 0.05;

/** 新建作用域 { x } */
export function makeScope() {
  const scope = {};
  const r = run(`x = ${X_EXPR}`, scope);
  if (!r.ok) throw new Error(`曲线对消：x 初始化失败 ${r.error.message}`);
  return scope;
}

/** 魔君曲线（JS 数组）：在作用域副本上算 level.target */
export function targetCurve(level, scope = makeScope()) {
  const s = cloneScope(scope);
  const r = run(level.target, s);
  if (!r.ok || !isNDArray(r.value)) throw new Error(`曲线对消：第 ${level.id} 关 target 写错了：${r.ok ? '不是数组' : r.error.message}`);
  return toJS(r.value);
}

/**
 * 判定一句咒语。返回
 *   { status: 'empty' | 'error' | 'shape' | 'miss' | 'hit', y, residual（最大 |残差|）, worst（残差最大的下标）, res（npmini 结果）, message }
 * status=shape：执行成功但结果不是和 x 同形状的数组。
 */
export function judge(level, src, scope = makeScope()) {
  if (!src || !src.trim()) return { status: 'empty', y: null, residual: null, worst: null, res: null, message: '' };
  const s = cloneScope(scope);
  const res = run(src, s);
  if (!res.ok) return { status: 'error', y: null, residual: null, worst: null, res, message: '' };
  let v = res.value;
  if (v === NONE && s.y !== undefined) v = s.y; // 允许写成 y = …
  const n = scope.x.size;
  if (!isNDArray(v) || v.shape.length !== 1 || v.shape[0] !== n) {
    return {
      status: 'shape', y: null, residual: null, worst: null, res,
      message: isNDArray(v)
        ? `结果的形状是 (${v.shape.join(', ')}${v.shape.length === 1 ? ',' : ''})，要和 x 一样是 (${n},)——每个 x 对应一个 y。`
        : `结果是一个数，不是曲线：要对每个 x 算一个 y，例如 np.sin(x)。`,
    };
  }
  if (!res.usage.names.has('x')) {
    return { status: 'shape', y: null, residual: null, worst: null, res, message: '曲线要用 x 来算（例如 np.sin(x)），不能手抄数字。' };
  }
  const y = toJS(v);
  const target = targetCurve(level, scope);
  let residual = 0;
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(target[i] - y[i]);
    if (!(d <= residual)) { residual = Number.isFinite(d) ? d : Infinity; worst = i; }
  }
  const tol = level.tol ?? DEFAULT_TOL;
  return { status: residual <= tol ? 'hit' : 'miss', y, residual, worst, res, message: '' };
}

/** 读数：曲线的最大值 / 最小值 / 中线（给学生对照用） */
export function readout(ys) {
  const mx = Math.max(...ys), mn = Math.min(...ys);
  return { max: mx, min: mn, mid: (mx + mn) / 2, amp: (mx - mn) / 2 };
}
