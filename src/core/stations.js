// ============================================================
// 观测站小游戏（第二批）：纯数学 / 数据层（无 DOM，smoke 与 E2E 可直接 import）
//   - montecarlo 第三章「蒙特卡洛估 π」：π̂ = 4M/N（mp5），随机点用均匀随机数（mp6），
//                误差按均值标准误 σ/√N 收敛（st5 / st14）
//   - scheduler  第五章「并行搬砖」：独立任务摊给 4 个 worker（sp3 Pool.map / sp12 可并行判据），
//                轮转分配 = range(rank, nruns, size)（sp7：任务 i 归 rank i % size）
//   - gravity    第六章「引力沙盒」：softening 力律 g(r) = GM/(r² + ε²)（nm20），
//                中心星 + 卫星的两体问题（两两位置差 nm6、成对求和 nm19 的最小情形）
//   - bayes      第九章「贝叶斯硬币」：后验 ∝ 先验 × 似然（st8），Beta 先验 + 计数 → Beta 后验，
//                众数 (a−1)/(a+b−2)（st18），先验选择与数据量（st11）
// 题库没覆盖、但小游戏必须用到的知识（不出题、只在面板上做演示，需助教确认讲解口径）：
//   最长任务优先（LPT）贪心调度、leapfrog 积分器、softening 力律对应的势能、
//   Beta 分布分位数的数值积分。
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

// ============================================================
// 第六章 · 引力沙盒（中心星 + 卫星，固定步长 leapfrog）
// ============================================================

export const GRAV = {
  gm: 1,               // G·M（模拟单位）
  r0: 1,               // 卫星出发点 (r0, 0)
  starRadius: 0.03,    // 撞上中心星（几乎是质点）
  escapeR: 4,          // 飞出 4 倍出发半径算逃逸
  orbitsToWin: 3,
  stepsPerFrame: 10,
  maxTime: 120,        // 单次发射最长模拟时间（模拟单位）
  speed: { min: 0.2, max: 1.6, step: 0.01, start: 1.45 },  // 开局速度偏大：先体验「逃逸」
  angle: { min: 0, max: 180, step: 1, start: 90 },          // 速度与半径方向的夹角（90° = 切向）
  eps: { min: 0, max: 0.3, step: 0.01, start: 0.05 },       // softening 长度 ε（nm20）
  dt: { min: 0.002, max: 0.05, step: 0.002, start: 0.01 },  // 积分步长
};

/** 软化后的引力加速度大小：g(r) = GM / (r² + ε²)（nm20：r = 0 处有限，r ≫ ε 时 ≈ 1/r²） */
export const softAccel = (r, eps, gm = GRAV.gm) => gm / (r * r + eps * eps);

/**
 * 与 nm20 力律配对的势能：Φ(r) = −(GM/ε)(π/2 − arctan(r/ε))，满足 dΦ/dr = GM/(r² + ε²)、Φ(∞) = 0；
 * ε = 0 时退回 −GM/r。（题库未覆盖：若误用 Plummer 势能 −GM/√(r²+ε²)，能量曲线会出现假漂移）
 */
export function softPotential(r, eps, gm = GRAV.gm) {
  if (eps <= 0) return -gm / r;
  return -(gm / eps) * (Math.PI / 2 - Math.atan(r / eps));
}

/** 圆轨道速度：v_c = √(r·g(r)) */
export const circularSpeed = (r, eps, gm = GRAV.gm) => Math.sqrt(r * softAccel(r, eps, gm));

const energyOf = (s) => 0.5 * (s.vx * s.vx + s.vy * s.vy) + softPotential(Math.hypot(s.x, s.y), s.eps);

/** 发射：从 (r0, 0) 出发，速度大小 speed、与径向夹角 angle（度） */
export function launchOrbit({ speed, angle, eps, dt }) {
  const a = (angle * Math.PI) / 180;
  const s = {
    x: GRAV.r0, y: 0,
    vx: speed * Math.cos(a), vy: speed * Math.sin(a),
    eps, dt, t: 0, sweep: 0, theta: 0,
    status: 'flying', orbits: 0, minR: GRAV.r0, maxDrift: 0,
  };
  s.e0 = energyOf(s);
  s.energy = s.e0;
  return s;
}

function accel(x, y, eps) {
  const r = Math.hypot(x, y);
  const g = softAccel(r, eps);
  return [(-g * x) / r, (-g * y) / r];
}

/** 推进 n 步（leapfrog：半步 kick → drift → 半步 kick；题库未覆盖的积分器） */
export function stepOrbit(s, n = 1) {
  for (let i = 0; i < n && s.status === 'flying'; i++) {
    let [ax, ay] = accel(s.x, s.y, s.eps);
    s.vx += 0.5 * s.dt * ax; s.vy += 0.5 * s.dt * ay;
    s.x += s.dt * s.vx; s.y += s.dt * s.vy;
    [ax, ay] = accel(s.x, s.y, s.eps);
    s.vx += 0.5 * s.dt * ax; s.vy += 0.5 * s.dt * ay;
    s.t += s.dt;
    // 绕行圈数：累计扫过的角度（跨 ±π 时按最短方向接续）
    const th = Math.atan2(s.y, s.x);
    let d = th - s.theta;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    s.sweep += d;
    s.theta = th;
    s.orbits = Math.abs(s.sweep) / (2 * Math.PI);
    const r = Math.hypot(s.x, s.y);
    s.minR = Math.min(s.minR, r);
    s.energy = energyOf(s);
    s.maxDrift = Math.max(s.maxDrift, Math.abs((s.energy - s.e0) / s.e0));
    if (r < GRAV.starRadius) s.status = 'crashed';
    else if (r > GRAV.escapeR) s.status = 'escaped';
    else if (s.orbits >= GRAV.orbitsToWin) s.status = 'won';
    else if (s.t >= GRAV.maxTime) s.status = 'timeout';
  }
  return s;
}

/** 一口气模拟到结局（smoke 与 E2E 的独立期望值） */
export function simulateOrbit(params) {
  const s = launchOrbit(params);
  const maxSteps = Math.ceil(GRAV.maxTime / params.dt) + 1;
  stepOrbit(s, maxSteps);
  return s;
}

/** 破坏实验预设：几乎径向的发射，近心点擦过中心星 */
export const PLUNGE = { speed: 0.25, angle: 90, dt: 0.01 };

// ============================================================
// 第九章 · 贝叶斯硬币
// ============================================================

export const COIN = {
  seed: 20260909,
  truths: [0.7, 0.5, 0.3, 0.75, 0.5, 0.25],  // 第 n 次挑战的真实正面概率（循环）
  widthGoal: 0.2,      // 后验 95% 区间宽度 < 0.2 才能下结论
  level: 0.95,
  priors: {
    flat: { a: 1, b: 1, name: '均匀先验 Beta(1, 1)' },                   // st18 的无信息先验
    informed: { a: 10, b: 10, name: '有信息先验 Beta(10, 10)' },         // 「以往见过的硬币大多公平」（st11）
  },
};

export const coinTruth = (attempt = 0) => COIN.truths[attempt % COIN.truths.length];

/** 第 attempt 枚硬币：flip(k) 抛 k 次（确定性随机流），1 = 正面 */
export function makeCoin(attempt = 0) {
  const p = coinTruth(attempt);
  const rand = seeded(COIN.seed + attempt * 6151);
  const s = { p, heads: 0, tails: 0, flips: [] };
  return {
    state: s,
    flip(k = 1) {
      for (let i = 0; i < k; i++) {
        const h = rand() < p ? 1 : 0;
        s.flips.push(h);
        if (h) s.heads++; else s.tails++;
      }
    },
  };
}

/** 后验 = 先验 × 似然：Beta(a, b) 先验 + h 次正面 t 次反面 → Beta(a + h, b + t)（st18） */
export const posterior = (prior, heads, tails) => ({ a: prior.a + heads, b: prior.b + tails });

/** Beta 众数 (a−1)/(a+b−2)（a, b > 1 时，st18）；Beta(4,3) → 0.6 */
export const betaMode = (a, b) => (a > 1 && b > 1 ? (a - 1) / (a + b - 2) : null);
export const betaMean = (a, b) => a / (a + b);

/** ln Γ(x)（Lanczos 近似，x > 0） */
function lgamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Beta(a, b) 概率密度 */
export function betaPdf(p, a, b) {
  if (p <= 0 || p >= 1) return 0;
  return Math.exp((a - 1) * Math.log(p) + (b - 1) * Math.log(1 - p) + lgamma(a + b) - lgamma(a) - lgamma(b));
}

/** Beta 分布的中心可信区间（数值积分 CDF，网格 4000 段；题库未覆盖的数值方法） */
export function betaInterval(a, b, level = COIN.level) {
  const n = 4000;
  const lo = (1 - level) / 2, hi = 1 - lo;
  let cdf = 0;
  let qLo = null, qHi = null;
  // 端点密度可能为 0 或发散（a 或 b < 1）：用中点规则积分
  for (let i = 0; i < n; i++) {
    const pm = (i + 0.5) / n;
    const step = betaPdf(pm, a, b) / n;
    const before = cdf;
    cdf += step;
    if (qLo == null && cdf >= lo) qLo = i / n + ((lo - before) / step) / n;
    if (qHi == null && cdf >= hi) { qHi = i / n + ((hi - before) / step) / n; break; }
  }
  return [qLo ?? 0, qHi ?? 1];
}

/** 由可信区间下结论：0.5 不在区间里 → 偏心；在区间里 → 与公平相容 */
export const coinVerdict = ([lo, hi]) => (lo > 0.5 || hi < 0.5 ? 'biased' : 'fair');
