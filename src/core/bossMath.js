// ============================================================
// BOSS 招牌机制里的「课程公式」：纯函数，无 Phaser 依赖（smoke 直接校验）
// 每个公式都对应一章的知识点，机制的手感就是公式本身的形状。
// ============================================================

/**
 * W3 正弦弹道的横向摆动：y = A·sin(ωt)
 * @param {number} t 飞行时间（秒）
 * @param {number} amp 振幅 A（px）
 * @param {number} omega 角频率 ω（rad/s）
 */
export function sineOffset(t, amp, omega) {
  return amp * Math.sin(omega * t);
}

/**
 * W8 NFW 暗物质晕的引力（换算成把玩家拉向核心的速度，px/s）。
 * g(r) ∝ M(<r) / r²，NFW 包含质量 M(<r) ∝ ln(1+x) − x/(1+x)，x = r/Rₛ。
 * 中心处 M ≈ x²/2，故 2M/x² → 1：拉力在核心取到上限 g0，向外单调衰减。
 */
export function nfwPullSpeed(r, rs, g0) {
  const x = Math.max(r / rs, 1e-3);
  const m = Math.log(1 + x) - x / (1 + x);
  return g0 * Math.min(1, (2 * m) / (x * x));
}

/**
 * W9 后验瞄准权重：先验只瞄当前位置（w=0），每次被击中「更新后验」w += step，上限 1
 * （保留两位小数，避免 0.1+0.2 式的浮点尾巴出现在浮字里）
 */
export function aimWeight(hits, step) {
  return Math.round(Math.min(1, hits * step) * 100) / 100;
}

/** W6 梯度冲锋的学习率衰减：lr ← max(minLr, lr·decay) */
export function decayLr(lr, decay, minLr) {
  return Math.max(minLr, Math.round(lr * decay * 1000) / 1000);
}
