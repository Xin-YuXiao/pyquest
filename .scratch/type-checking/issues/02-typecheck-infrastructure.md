# 02: 类型检查基建（expand：空检查范围接入 CI）

Status: needs-info
Type: task
Blocked by: 01

## 要做什么

维护者能运行 `npm run typecheck`，它也包含在 `npm run check` 与 CI 中。初始检查范围为空，所以零报错。同时建好共享类型模块的骨架，后续各批都往这里补 typedef。

- 按 01 确认的版本，把 TypeScript 作为开发依赖并锁定版本；检查配置为 noEmit、allowJs、checkJs，严格选项按 01 的结论。
- 检查范围用显式包含列表，初始为空（或只含共享类型模块本身），后续每批往里加一层。
- 共享类型模块按领域放 JSDoc typedef 骨架：题目、题池、章节配置、地图定义与道具、可交互对象、章进度、全局状态、存档 v2。先把字段列全，标注可在各批补细。
- 「期望出错」类忽略注释必须附原因，由 lint 规则或检查脚本强制。

## 验收标准

- [ ] `npm run typecheck` 存在且通过；`npm run check` 与 CI 工作流都包含它
- [ ] TypeScript 版本在 package.json 中锁定为 01 确认的版本
- [ ] 共享类型模块存在，含上述 8 个领域类型的骨架，每个类型都有一句中文说明
- [ ] 不附原因的忽略注释会导致 lint 或检查失败（临时注入验证，记在 Comments）
- [ ] README「测试」一节说明类型检查的范围和分批计划
- [ ] npm run check 全绿

## Comments
