# 01: 导入用的存档校验与清理（纯函数）

Status: ready-for-agent
Type: task
Blocked by: ../learning-records/issues/01

## 要做什么

在 learning-records 拆出的迁移/校验纯函数之上，实现「任意外部输入 → 可安全写入的 v3 存档」：
识别导出信封或裸存档（v1/v2/v3），拒绝非存档 / 未来版本 / 超大输入 / 学习报告 JSON，
对越界与已不存在的引用做范围清理并产生 warnings，校验 integrity（不匹配只警告）。
返回 `{ ok, save, warnings, errors }`。本工单无界面，用单元测试证明行为。

## 验收标准

- [ ] 识别带信封与不带信封两种输入；学习报告 JSON 被识别并给出「这是学习报告，不是存档」错误
- [ ] v1/v2/v3 均迁移为 v3；`v` 大于当前版本 → 错误「请更新游戏」；缺 `v` / 非对象 / 非 JSON → 错误
- [ ] 范围清理：未知章节进度丢弃、碎片数截断、当前章节截断、不存在的槽位/题目 id 丢弃，每类各一条 warning
- [ ] integrity 不匹配 → warning（不是 error）
- [ ] 输入 > 5 MB → 错误且不解析
- [ ] 单元测试覆盖以上全部分支，并用 learning-records 的 v1/v2 固定样本做输入
- [ ] `npm run check` 全绿

## Comments
