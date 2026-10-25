// ============================================================
// 观测站小游戏（第二批）：纯数学 / 数据层（无 DOM，smoke 与 E2E 可直接 import）
//   - montecarlo 第三章「蒙特卡洛估 π」：π̂ = 4M/N（mp5），随机点用均匀随机数（mp6），
//                误差按均值标准误 σ/√N 收敛（st5 / st14）
//   - scheduler  第五章「并行搬砖」：独立任务摊给 4 个 worker（sp3 Pool.map / sp12 可并行判据），
//                轮转分配 = range(rank, nruns, size)（sp7：任务 i 归 rank i % size）
// 题库没覆盖、但小游戏必须用到的知识（不出题、只在面板上做演示，需助教确认讲解口径）：
//   最长任务优先（LPT）贪心调度。
// 小游戏不发碎片、不碰封印门，完成奖励由场景层发放（回满爱心 + 观测日志）。
// ============================================================
import { seeded } from './observatory.js';

/** Fisher–Yates 洗牌（确定性：用传入的伪随机数） */
function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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

// ============================================================
// 第五章 · 并行搬砖（4 个 worker 的负载均衡）
// ============================================================

export const SCHED = {
  seed: 20260505,
  workers: 4,          // mpirun -np 4 / Pool(4) 的 4 个进程（sp13 / sp3）
  perWorker: 3,        // 每份工作切 3 刀 → 12 个任务
  load: 24,            // 每份工作量（秒）：最优分配下每个 worker 恰好 24 秒
  tolerance: 1.1,      // 总耗时 ≤ 1.1 × 最优 判定成功
};

/** 各 worker 的负载（秒）；assign[i] = 任务 i 分给的 worker（−1 = 未分配） */
export function loadsOf(tasks, assign, workers = SCHED.workers) {
  const loads = new Array(workers).fill(0);
  tasks.forEach((t, i) => { if (assign[i] >= 0) loads[assign[i]] += t.cost; });
  return loads;
}

/** 总耗时（makespan）= 最忙的 worker 干完的时刻 */
export const makespan = (tasks, assign, workers = SCHED.workers) => Math.max(...loadsOf(tasks, assign, workers));

/** 轮转分配：range(rank, nruns, size) 让任务 i 归 rank i % size（sp7） */
export const roundRobin = (tasks, workers = SCHED.workers) => tasks.map((_, i) => i % workers);

/** 贪心（最长任务优先，LPT）：任务按耗时从大到小，每次交给当前最闲的 worker */
export function greedyLPT(tasks, workers = SCHED.workers) {
  const assign = new Array(tasks.length).fill(-1);
  const loads = new Array(workers).fill(0);
  tasks.map((t, i) => ({ c: t.cost, i }))
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .forEach(({ c, i }) => {
      let w = 0;
      for (let k = 1; k < workers; k++) if (loads[k] < loads[w]) w = k;
      assign[i] = w;
      loads[w] += c;
    });
  return assign;
}

/**
 * 第 attempt 次的任务清单：4 份等量工作（各 24 秒）各切 3 刀、洗牌 → 12 个独立任务。
 * 最优总耗时 = 24（下界 Σ/4 恰好可达）。只收「轮转明显不均（> 1.15×）且贪心够用（≤ 1.1×）」的一组：
 * 学生先看到朴素轮转的问题，再找到均衡的办法。
 */
export function makeTasks(attempt = 0) {
  const rand = seeded(SCHED.seed + attempt * 104729);
  for (let tries = 0; tries < 200; tries++) {
    const costs = [];
    for (let w = 0; w < SCHED.workers; w++) {
      // 把 24 切成 3 段，每段 ≥ 2 秒
      const a = 2 + Math.floor(rand() * (SCHED.load - 6));
      const b = 2 + Math.floor(rand() * (SCHED.load - a - 4));
      costs.push(a, b, SCHED.load - a - b);
    }
    const tasks = shuffle(costs, rand).map((cost, i) => ({ id: i, cost }));
    const rr = makespan(tasks, roundRobin(tasks));
    const lpt = makespan(tasks, greedyLPT(tasks));
    if (rr > SCHED.load * 1.15 && lpt <= SCHED.load * SCHED.tolerance) {
      return { tasks, optimal: SCHED.load, serial: SCHED.load * SCHED.workers };
    }
  }
  throw new Error('makeTasks: 找不到满足条件的任务集');
}
