# 01: 引入单元测试层（vitest）并接入 npm test

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

维护者运行 `npm test` 时，在 smoke 之后自动运行单元测试，几秒内给出结果。CI 不改工作流也会执行它。第一批测试覆盖章内阶段，作为这一层的样板：

- 五个阶段的判定：新来、收集碎片、集齐未开门、门开未通关、已通关
- NPC 台词选择规则：门开阶段回退到收集台词；跨章问候优先于阶段表；章节自管台词函数优先于一切；阶段表缺项时回退到新来台词；函数型台词能拿到本章进度

要点：

- 引入 vitest 和 happy-dom 两个开发依赖。纯逻辑测试跑 node 环境，需要 document 或 localStorage 的跑 happy-dom 环境。
- 每个测试前重置全局状态，测试之间互不污染。
- 测试文件纳入 ESLint，显式导入断言函数，不用全局注入。
- `npm test` 的顺序为 smoke →（题库 lint，如已存在）→ 单元测试 → verify-quiz。
- README「测试」一节写明 smoke、单元测试、E2E 的分工。

## 验收标准

- [ ] `npm test` 包含单元测试步骤；单元测试失败时 `npm test` 以非零码退出
- [ ] 章内阶段五个取值各至少一个用例，台词选择的四条规则各至少一个用例
- [ ] 人为把阶段判定里「门开」与「集齐」的判断顺序对调，至少一个用例失败（验证后撤回，记在 Comments）
- [ ] 单元测试总耗时（不含依赖安装）在本机低于 10 秒
- [ ] `npm run lint` 覆盖测试文件且通过
- [ ] CI 日志中能看到单元测试的用例名和通过数
- [ ] README「测试」一节写明三层测试的分工和新增测试的放置约定
- [ ] npm run check 全绿

## Comments
