# 07: 实现批次 B：W6 数值方法 + W7 信号 + W8 暗物质

Status: needs-info
Type: task
Blocked by: 03, 05

## 要做什么

按确认后的提纲把 W6、W7、W8 的新增题录入题库（路线图点名的 NFW 拟合数值题、emcee 漫步在本批）：

- 新题 id 沿用 nm / sg / dm 前缀往后编号，加入对应三池，tier 与池一致；老题不动。
- 所有标注「可执行」的题进 verify-quiz 校验表并实跑通过。
- smoke 按章目标表把三章的题量下限收紧到实际题量。
- 题面全部满足长度护栏。

## 验收标准

- [ ] W6、W7、W8 题量达到 02 号目标表，三池分布一致
- [ ] verify-quiz 覆盖三章全部可执行题并通过
- [ ] smoke 下限已收紧，老题 id 全部保留
- [ ] W6、W7、W8 的 E2E 连续跑两遍均通过
- [ ] README「知识点覆盖」表更新三章的题量与知识点；README 顶部总题量同步
- [ ] `npm run check` 全绿

## Comments
