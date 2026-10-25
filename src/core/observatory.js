// ============================================================
// 观测站小游戏：纯数学 / 数据层（无 DOM，smoke 与 E2E 可直接 import）
// 野外的「观测台」道具打开可选小游戏，让学生亲手调参数体会拟合与频谱：
//   - nfw    第八章「NFW 拟合台」：拖 ρ₀ / Rₛ 滑块，让 NFW 曲线贴合模拟晕密度，
//            χ²/dof 实时反馈（判据对齐 st7 / st16：χ²/dof ≈ 1 即残差与误差棒一致）
//   - tuning 第七章「频率调谐台」：拖调谐频率扫描 sg6 的三纯音信号，
//            调谐表揭开频谱、锁定 1/4/7 Hz 三根尖峰并给出 sg6 的 FFT 读数
//   第二批（数学在 core/stations.js，面板在 ui/stations/）：
//   - montecarlo 第三章「蒙特卡洛估 π」
//   - scheduler  第五章「并行搬砖」
//   - gravity    第六章「引力沙盒」
//   - bayes      第九章「贝叶斯硬币」
// 公式与数值只复用题库里经 verify-quiz 实跑校验的知识（见各处题目 id），
// 小游戏不发碎片、不碰封印门，完成奖励由场景层发放（回满爱心 + 观测日志）。
// ============================================================

/** 确定性伪随机（Park–Miller，与 textures/pixelArt.js 的 rng 同算法） */
export function seeded(seed) {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** 标准正态随机数（Box–Muller） */
function gauss(rand) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ============================================================
// 第八章 · NFW 拟合台
// ============================================================

/** NFW 密度轮廓 ρ(r) = ρ₀ / [x(1+x)²]，x = r/Rₛ（dm1 / dm8 / dm9） */
export function nfwDensity(r, rho0, rs) {
  const x = r / rs;
  return rho0 / (x * (1 + x) ** 2);
}

export const NFW = {
  // 首次挑战的真值取讲义数字 ρ₀ = 5、Rₛ = 0.3（dm8 / dm9 题面同款）
  truth: { rho0: 5, rs: 0.3 },
  seed: 20280808,
  points: 18,                 // 数据点数；两个自由参数 → dof = 16
  rMin: 0.01, rMax: 10,       // 半径对数等距：内区 r⁻¹ 与外区 r⁻³ 都在视野里
  noise: 0.15,                // 乘性对数正态噪声（σ_ln = 0.15 ≈ 15%）
  // 滑块在 log10 空间（对数刻度），键盘 ←/→ 每次 STEP，Shift 为 5 倍
  logRho0: { min: -0.5, max: 2, start: Math.log10(30) },
  logRs: { min: -2, max: 0.5, start: Math.log10(1.5) },
  step: 0.01,
  passChi2dof: 1.5,           // χ²/dof 低于此值 ……
  holdMs: 1000,               // …… 并保持 1 秒判定「拟合成功」
};

/** 第 attempt 次挑战的真值：首次固定为讲义数字，之后换一组（重玩不是背答案） */
export function nfwTruth(attempt = 0) {
  if (!attempt) return { ...NFW.truth };
  const rand = seeded(NFW.seed + attempt * 7919);
  return {
    rho0: 10 ** (0.2 + rand() * 1.0),   // ρ₀ ∈ [1.6, 16]
    rs: 10 ** (-1.0 + rand() * 0.8),    // Rₛ ∈ [0.1, 0.63]
  };
}

/**
 * 生成一组模拟晕密度数据点（确定性）：
 * 半径对数等距，ρ_obs = ρ_true · exp(N(0, σ_ln))，误差棒按对数空间给出。
 * @returns {{ truth: {rho0:number, rs:number}, points: {r:number, rho:number, sigmaLog:number}[] }}
 */
export function makeNfwData(attempt = 0) {
  const truth = nfwTruth(attempt);
  const rand = seeded(NFW.seed + attempt * 104729 + 1);
  const sigmaLog = NFW.noise / Math.LN10; // 对数正态 σ_ln → log10 空间的误差棒
  const points = [];
  for (let i = 0; i < NFW.points; i++) {
    const t = i / (NFW.points - 1);
    const r = NFW.rMin * (NFW.rMax / NFW.rMin) ** t;
    const rho = nfwDensity(r, truth.rho0, truth.rs) * Math.exp(NFW.noise * gauss(rand));
    points.push({ r, rho, sigmaLog });
  }
  return { truth, points };
}

/** log10 空间的 χ²：Σ ((log ρ_obs − log ρ_model) / σ_log)² */
export function nfwChi2(points, rho0, rs) {
  let chi2 = 0;
  for (const p of points) {
    const d = (Math.log10(p.rho) - Math.log10(nfwDensity(p.r, rho0, rs))) / p.sigmaLog;
    chi2 += d * d;
  }
  return chi2;
}

/** χ²/dof，dof = 数据点数 − 自由参数数（st7 / st16 的判据口径） */
export function nfwChi2dof(points, rho0, rs, nParams = 2) {
  return nfwChi2(points, rho0, rs) / (points.length - nParams);
}

/** 对数斜率 d ln ρ / d ln r（数值差分）：内区 → −1，外区 → −3（dm9） */
export function nfwLogSlope(r, rho0, rs) {
  const h = 1e-4;
  return (Math.log(nfwDensity(r * (1 + h), rho0, rs)) - Math.log(nfwDensity(r, rho0, rs))) / Math.log(1 + h);
}

/** χ²/dof 的三档评语（面板配色与读屏文案共用） */
export function fitGrade(chi2dof) {
  if (chi2dof < NFW.passChi2dof) return 'good';
  if (chi2dof < 5) return 'close';
  return 'far';
}

// ============================================================
// 第七章 · 频率调谐台（sg6：三纯音 1/4/7 Hz、幅度 3/1/0.5、采样率 2000、共 1 秒）
// 两层计算各司其职：
//   - 读数：锁定尖峰后给出 sg6 原题的精确 FFT 频点值——1 秒记录、N = 2000，
//     整数 Hz 即第 k 个频点（sg16「频率轴 k/T」），|X| = A·N/2 = 3000 / 1000 / 500
//   - 调谐表：连续扫频时用 4 秒记录 + Hann 窗的单频探测，旁瓣压到 3% 以下，
//     表针读数 ≈ 该频率的振幅；若直接用 1 秒矩形窗连续扫，1 Hz 强音的泄漏会把
//     尖峰挤到 0.8 Hz、7.15 Hz，玩家看到的「峰」就不在真实频率上
// ============================================================

export const TUNING = {
  sr: 2000,
  tones: [
    { f: 1, a: 3 },
    { f: 4, a: 1 },
    { f: 7, a: 0.5 },
  ],
  readoutDuration: 1,         // sg6 原题记录长度（秒）
  probeDuration: 4,           // 调谐表探测记录长度（秒）
  fMin: 0, fMax: 10,
  step: 0.05,                 // 调谐滑块步长（Hz）；Shift 为 10 倍
  start: 0,
  lockTol: 0.1,               // 调谐频率离尖峰 ≤ 0.1 Hz ……
  holdMs: 800,                // …… 并停留 0.8 秒即锁定该峰
  peakFloor: 0.2,             // 表针读数（振幅单位）低于此值不算尖峰；最弱的 7 Hz 为 0.5
};

/** 生成三纯音时域信号（N = sr·T 个采样，t 不含端点，同 sg6 的 linspace(..., endpoint=False)） */
export function makeTuningSignal(duration = TUNING.readoutDuration) {
  const n = Math.round(TUNING.sr * duration);
  const sig = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / TUNING.sr;
    let v = 0;
    for (const { f, a } of TUNING.tones) v += a * Math.sin(2 * Math.PI * f * t);
    sig[i] = v;
  }
  return sig;
}

/** 单频 DFT：|X(f)| = |Σ x[n]·w[n]·e^{−2πi f n / sr}|（w 缺省为矩形窗） */
export function dftMagnitude(sig, f, { sr = TUNING.sr, window = null } = {}) {
  let re = 0, im = 0;
  const step = (2 * Math.PI * f) / sr;
  for (let i = 0; i < sig.length; i++) {
    const v = window ? sig[i] * window[i] : sig[i];
    re += v * Math.cos(step * i);
    im -= v * Math.sin(step * i);
  }
  return Math.hypot(re, im);
}

/** 由 FFT 频点幅度反推振幅：A = 2|X| / N（sg6 的 |X| = A·N/2 倒过来） */
export function amplitudeOf(mag, n) {
  return (2 * mag) / n;
}

/** sg6 原题读数：1 秒记录在整数 Hz 频点上的 |X|（= np.abs(np.fft.rfft(sig))[k]） */
export function readoutMagnitude(f) {
  return dftMagnitude(makeTuningSignal(TUNING.readoutDuration), Math.round(f));
}

/** 调谐表：4 秒记录 + Hann 窗探测，按相干增益归一到振幅单位（尖峰处读数 = 3 / 1 / 0.5） */
export function makeTuner() {
  const sig = makeTuningSignal(TUNING.probeDuration);
  const n = sig.length;
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const gain = n / 2; // Hann 窗的 Σw
  const cache = new Map();
  return (f) => {
    const key = f.toFixed(3);
    if (!cache.has(key)) cache.set(key, (2 * dftMagnitude(sig, f, { window: win })) / gain);
    return cache.get(key);
  };
}

/** 调谐网格（0–10 Hz，步长 0.05）：浮点累加误差统一按 4 位小数取整 */
export function tuningGrid() {
  const grid = [];
  const n = Math.round((TUNING.fMax - TUNING.fMin) / TUNING.step);
  for (let i = 0; i <= n; i++) grid.push(+(TUNING.fMin + i * TUNING.step).toFixed(4));
  return grid;
}

/** 在调谐网格上扫描表针读数，找局部极大（smoke 校验恰为 1 / 4 / 7 Hz） */
export function findPeaks(tuner = makeTuner()) {
  const grid = tuningGrid();
  const vals = grid.map((f) => tuner(f));
  const peaks = [];
  for (let i = 1; i < grid.length - 1; i++) {
    if (vals[i] >= TUNING.peakFloor && vals[i] > vals[i - 1] && vals[i] >= vals[i + 1]) {
      peaks.push({ f: grid[i], amp: vals[i] });
    }
  }
  return peaks;
}

// ============================================================
// 观测台登记（章节配置 ch.observatory 指向这里的 id）
// ============================================================

export const OBSERVATORIES = {
  montecarlo: {
    id: 'montecarlo',
    chapter: 3,
    title: '蒙特卡洛估 π 台',
    badge: '第三章 · 观测站',
    blurb: '混沌魔君把圆周率藏进了随机里。往单位正方形里撒点，数一数落进四分之一圆的有几个：π ≈ 4M/N。撒够 3000 点、把误差压到 0.01 以内就算估成。',
  },
  scheduler: {
    id: 'scheduler',
    chapter: 5,
    title: '并行搬砖台',
    badge: '第五章 · 观测站',
    blurb: '熔炉旁堆着 12 份互不相干的矿石活，4 个 worker 等着开工。把任务分下去：总耗时取决于最忙的那一个。把总耗时压到最优的 1.1 倍以内就算成功。',
  },
  nfw: {
    id: 'nfw',
    chapter: 8,
    title: 'NFW 拟合台',
    badge: '第八章 · 观测站',
    blurb: '模拟暗物质晕的密度数据刚从 N-body 里出炉。拖动 ρ₀ 与 Rₛ，让 NFW 曲线穿过数据点——χ²/dof 降到 1.5 以下并稳住 1 秒，就算拟合成功。',
  },
  gravity: {
    id: 'gravity',
    chapter: 6,
    title: '引力沙盒',
    badge: '第六章 · 观测站',
    blurb: '神殿穹顶下悬着一颗小卫星。给它一个初速度——太慢会坠向中心星，太快会一去不回。让它稳稳绕行 3 圈；再试试把 softening 调到 0，看近距离掠过时数值误差怎样把它甩飞。',
  },
  bayes: {
    id: 'bayes',
    chapter: 9,
    title: '贝叶斯硬币台',
    badge: '第九章 · 观测站',
    blurb: '祭司递来一枚硬币：它公平吗？一次次地抛，看先验 × 似然怎样变成后验、后验分布怎样一点点收窄。等后验 95% 区间窄到 0.2 以内，再下结论。',
  },
  tuning: {
    id: 'tuning',
    chapter: 7,
    title: '频率调谐台',
    badge: '第七章 · 观测站',
    blurb: '傅里叶魅影的咆哮是几个纯音的叠加。转动调谐旋钮扫过 0–10 Hz：哪里响应最强，哪里就藏着一根频谱尖峰。在尖峰上停留片刻即可锁定，找齐全部尖峰。',
  },
};

// ============================================================
// 观测日志（存档可选字段 observatory：{ [观测台 id]: 记录 }）
// v2 存档新增的可选字段，旧档缺省为空对象；不改存档版本号与 KEY
// ============================================================

/**
 * @typedef {Object} ObservationRecord
 * @property {boolean} solved       是否完成过
 * @property {number} clears        完成次数（决定下一次挑战换哪组数据）
 * @property {number} firstAt       首次完成时间戳（ms）
 * @property {number} bestSeconds   最快完成用时（秒）
 * @property {number} [bestChi2dof] 仅 nfw：完成时最好的 χ²/dof
 */

/** 合并一次完成结果 → 新记录（纯函数）。result: { seconds, chi2dof? } */
export function recordObservation(prev, result, now = Date.now()) {
  const rec = {
    solved: true,
    clears: (prev && prev.clears ? prev.clears : 0) + 1,
    firstAt: prev && prev.firstAt ? prev.firstAt : now,
    bestSeconds: Math.min(prev && Number.isFinite(prev.bestSeconds) ? prev.bestSeconds : Infinity, result.seconds),
  };
  const chi = [prev && prev.bestChi2dof, result.chi2dof].filter(Number.isFinite);
  if (chi.length) rec.bestChi2dof = Math.min(...chi);
  return rec;
}

/** 读档清洗：只保留已登记观测台、字段类型正确的记录（坏数据丢弃而非抛错） */
export function sanitizeObservationLog(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(OBSERVATORIES)) {
    const r = raw[id];
    if (!r || typeof r !== 'object' || !r.solved) continue;
    const rec = {
      solved: true,
      clears: Number.isInteger(r.clears) && r.clears > 0 ? r.clears : 1,
      firstAt: Number.isFinite(r.firstAt) ? r.firstAt : 0,
      bestSeconds: Number.isFinite(r.bestSeconds) ? r.bestSeconds : Infinity,
    };
    if (Number.isFinite(r.bestChi2dof)) rec.bestChi2dof = r.bestChi2dof;
    out[id] = rec;
  }
  return out;
}
