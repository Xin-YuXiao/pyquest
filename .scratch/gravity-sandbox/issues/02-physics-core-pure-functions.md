# 02: 物理核心：固定步长积分、softening 与能量（纯函数）

Status: resolved
Type: task
Blocked by: None (can start immediately)

## 要做什么

建立沙盒的纯函数物理核心（二维、G=1、无量纲），不含界面：

- 状态结构 `{ bodies: [{ x, y, vx, vy, m, fixed? }], t }`；`step(state, dt, eps)` 返回新状态；
- 两两求和只遍历 i<j（每一对只算一次，与 nm19 一致），软化力律按 m/(r²+ε²)（与 nm20 同式），`fixed` 天体不移动；
- 固定步长辛积分（蛙跳 kick-drift-kick）；`energy(state, eps)` 返回动能、软化势能、总能量；
- 挑战判定纯函数：`orbitsCompleted`（累计转角）、`escaped`、`collided`、`deltaVUsed`；
- 场景序列化/反序列化（分享码用）：字段与长度校验，非法输入抛出可读错误。

注意势能必须与所选力律严格对应，否则能量曲线会出现「假漂移」：对 nm20 的力律 1/(r²+ε²)，成对势能为
−(m₁m₂/ε)·(π/2 − arctan(r/ε))（无穷远处为 0）；若改用 Plummer 形式（力 ∝ r/(r²+ε²)^{3/2}、势 −m₁m₂/√(r²+ε²)），力与势要一起换，
并在讲解里说明与 nm20 的写法差异。两粒子完全重合（r=0）时方向未定义，加速度取 0 向量。

## 验收标准

- [ ] smoke：ε=0.5 时软化因子在 r=0 为 4.0、r=1 为 0.8（与 nm20 一致）
- [ ] smoke：N 个天体每步计算 N(N−1)/2 对
- [ ] smoke：两体圆轨道在推荐步长下 10 圈后能量与半径相对漂移 < 1%；步长 ×10 时漂移显著增大
- [ ] smoke：ε=0 近距离擦肩出现能量断崖，合理 ε 不出现
- [ ] smoke：同输入同步数结果逐位相同；分享码往返一致、非法输入报错
- [ ] 代码注释标注对应题目 id（nm19 / nm20 / nm6 / dm4）
- [ ] `npm run check` 全绿

## Comments

- 2026-10-25：feat/more-stations 实现：core/stations.js 固定步长积分、softening 力律 g=GM/(r²+ε²) 与配对势能、能量误差。
