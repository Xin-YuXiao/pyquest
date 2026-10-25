# 06: W6-W8 代码符文首批内容（出题提纲 → grilling → 实现）

Status: needs-info
Type: task
Blocked by: 05

## 要做什么

按 ADR-0001 的内容流程，为 W6、W7、W8 各上线 1-2 道代码符文：

1. **出题提纲**（agent 起草）：沿用 docs 下出题提纲的表格格式，每题注明讲义来源（优先改编 verify-quiz 已收录的确定输出题：
   W6 nm7 dblquad 手算 / nm8 `np.gradient` 双轴梯度、W7 sg6 三纯音 FFT 峰值 / sg7 3×3 线性方程组、W8 dm8 ρ(Rₛ)=ρ₀/4 / dm6 NFW 质量积分），
   给出起始代码挖空位置、判分方式（asserts + 容差）与四选一降级版本。
2. **grilling**：维护者确认提纲（记录在本工单 Comments）。
3. **实现**：录入题库、放置槽位、verify-quiz 全部覆盖。

## 验收标准

- [ ] 提纲文档入库，每题标注讲义出处与「可执行」，并经维护者确认（Comments 有记录）
- [ ] W6 / W7 / W8 各至少 1 道代码题上线，每题都有四选一降级版本
- [ ] verify-quiz：每道代码题参考解通过、起始代码不通过
- [ ] smoke 通过；W6-W8 的 E2E 各新增或复用 `codeRune` 步骤覆盖本章至少 1 道代码题
- [ ] `npm run check` 全绿（本地与 CI）

## Comments
