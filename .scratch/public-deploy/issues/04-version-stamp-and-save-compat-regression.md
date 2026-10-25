# 04: 版本标识 + 存档跨版本兼容回归

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

- 构建时注入版本号（package.json version）与短提交哈希，标题页角落以小字显示（如「v0.1.0 · a4f81fa」）；开发模式显示「dev」；
- 建立「历史存档样本」集：v1 存档、v2 存档（第一部中途 / 第一部通关 / 第二部中途），之后每次存档 schema 变更追加样本（如 `learning-records` 的 v3）；
- 每次构建跑读档回归：注入样本 → 刷新 → 断言「继续冒险 · 第 N 章」落点与各章进度符合样本预期、浏览器无报错。

## 验收标准

- [ ] E2E：标题页显示的版本串与构建注入值一致
- [ ] 至少 4 个历史存档样本（含 v1 迁移路径），读档回归全部通过并接入 `npm run test:e2e`
- [ ] 样本的预期结果写在样本旁（可读的说明），新增 schema 版本时有明确的「追加样本」步骤写进 README 测试章节
- [ ] `npm run check` 全绿

## Comments
