// ============================================================
// 观测站小游戏（第二批）：纯数学 / 数据层（无 DOM，smoke 与 E2E 可直接 import）
//   - montecarlo 第三章「蒙特卡洛估 π」：π̂ = 4M/N（mp5），随机点用均匀随机数（mp6），
//                误差按均值标准误 σ/√N 收敛（st5 / st14）
// 小游戏不发碎片、不碰封印门，完成奖励由场景层发放（回满爱心 + 观测日志）。
// ============================================================
import { seeded } from './observatory.js';

// ============================================================
// 第三章 · 蒙特卡洛估 π
// ============================================================

export const MC = {
  seed: 20260303,
  minN: 3000,          // 至少撒 3000 点才计数（点太少时碰巧落在 π 附近不算本事）
  tol: 0.01,           // |π̂ − π| < 0.01 判定成功（N = 3000 时 1σ ≈ 0.03，要靠继续撒点把误差压下去）
  maxN: 50000,         // 面板上限（防无限撒点）
  batches: [10, 100, 1000],
  drawCap: 3000,       // 画布只保留最近 3000 个点
};

/** π 的估计：单位正方形里 M / N ≈ 四分之一圆面积 π/4 → π̂ = 4M/N（mp5） */
export const piEstimate = (inside, n) => (n ? (4 * inside) / n : 0);

/** π̂ 的 1σ 统计误差：σ(π̂) = 4·√(p(1−p)/N)，p = π/4——均值的标准误 σ/√N（st5 / st14） */
export const mcSigma = (n) => 4 * Math.sqrt(((Math.PI / 4) * (1 - Math.PI / 4)) / n);

/**
 * 第 attempt 次撒点实验（确定性随机流）。throw(k) 逐点撒、逐点判定：
 * 一旦 N ≥ minN 且 |π̂ − π| < tol 就记下 solvedAt（与一次撒几颗无关，结果可复现）。
 */
export function makeMonteCarlo(attempt = 0) {
  const rand = seeded(MC.seed + attempt * 7919);
  const s = { n: 0, inside: 0, solvedAt: null, solvedErr: null, recent: [], history: [] };
  let nextMark = 10;
  return {
    state: s,
    throw(k) {
      const take = Math.min(k, MC.maxN - s.n);
      for (let i = 0; i < take; i++) {
        const x = rand(), y = rand();           // np.random.rand 的两个 [0, 1) 坐标（mp6）
        const hit = x * x + y * y < 1;
        s.n++;
        if (hit) s.inside++;
        s.recent.push({ x, y, hit });
        if (s.solvedAt == null && s.n >= MC.minN && Math.abs(piEstimate(s.inside, s.n) - Math.PI) < MC.tol) {
          s.solvedAt = s.n;
          s.solvedErr = Math.abs(piEstimate(s.inside, s.n) - Math.PI);
        }
        if (s.n >= nextMark) {                  // 误差曲线：对数等距记录（每 ×1.12 记一次）
          s.history.push({ n: s.n, err: Math.abs(piEstimate(s.inside, s.n) - Math.PI) });
          nextMark = Math.ceil(nextMark * 1.12);
        }
      }
      if (s.recent.length > MC.drawCap) s.recent.splice(0, s.recent.length - MC.drawCap);
      return take;
    },
  };
}
