# 04: core 层开启类型检查（状态、存档、章内阶段、抽题、测试接缝）

Status: ready-for-agent
Type: task
Blocked by: 03

## 要做什么

core 层被纳入类型检查。全局状态 G、章进度、存档 v2 的 JSON 结构、测试接缝的查询与动作都有类型。存档 v3（`learning-records`）改动存档结构时，编译器能指出全部受影响的读写点。

- 补全共享类型模块中的全局状态（集合字段、抽题记录、章进度表）、章进度、存档 v2（含 v1 旧字段的迁移输入类型）。
- 测试接缝的状态快照与语义动作参数都带类型。
- core 层模块加入检查范围，修掉报错，重点是 DOM 与 localStorage 可能为空或抛异常的位置。

## 验收标准

- [ ] core 层全部模块在检查范围内，零报错
- [ ] 存档 v2 类型与存档模块实际写出的字段逐一对应（在 Comments 附字段对照表）
- [ ] 人为在存档写入里漏掉一个字段，或拼错字段名，typecheck 失败（验证后撤回）
- [ ] 若 `learning-records/issues/01`（存档 v3）已在进行中，在其 Comments 告知存档类型的位置
- [ ] npm run check 全绿

## Comments
