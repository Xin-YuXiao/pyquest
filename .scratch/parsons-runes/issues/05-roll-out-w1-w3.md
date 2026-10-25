# 05: 铺开到 W1 与 W3

Status: needs-info
Type: task
Blocked by: 03

## 要做什么

按 02 号确定的范围，把拼图符文铺到第一章与第三章：

- 从 01 号报告中选题（W1 多为顺序题、几乎无缩进；W3 为 numpy 题，需构建环境有 numpy，与 verify-quiz 同一环境）；
  每章题池题量 ≥ 该章拼图槽位数 × 2（保证抽题不撞题）。
- W3 的 numpy 题输出格式按 numpy 1.x（与 scripts/requirements-verify.txt 的 numpy<2 一致），生成器报告中标注。
- 世界地图 / HUD 不需要改动（拼图符文是普通符文槽）。

## 验收标准

- [ ] 第一章、第三章 E2E 各接入一次 `parsonsRune` 步骤并通过
- [ ] 生成器 CI 同步检查覆盖新增题目；报告里三章拼图题数一览
- [ ] smoke 题量阈值：每个拼图题池题量 ≥ 槽位数 × 2
- [ ] `npm run check` 全绿

## Comments
