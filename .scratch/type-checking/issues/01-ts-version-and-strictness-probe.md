# 01: 验证 TypeScript 版本与严格程度（JSDoc 检查试跑）

Status: ready-for-agent
Type: research
Blocked by: None (can start immediately)

## 要做什么

给维护者一份对比报告，回答两个问题：用哪个 TypeScript 版本做 JSDoc 检查，以及第一阶段开哪些严格选项。在临时分支上，只对数据层（章节注册表、地图构建器、题库）试跑三种版本组合：

- TypeScript 5.9.x
- TypeScript 6.0.x
- TypeScript 7.0.x（原生实现，需核实它对 checkJs/JSDoc 的支持程度）

每个版本分两档严格程度：strictNullChecks + noImplicitAny，以及完整 strict。记录报错数量、报错类别、检查耗时，以及 7.x 是否有不支持或行为不同的 JSDoc 写法。

## 验收标准

- [ ] 报告贴在 Comments：版本 × 严格程度的矩阵（报错数、耗时、主要报错类别）
- [ ] 明确列出 7.x 与 5.9/6.0 在 JSDoc 支持上的差异（如有），并附官方说明链接
- [ ] 给出推荐的版本与第一阶段严格选项，附理由
- [ ] 不合入任何代码；试跑分支用完即删
- [ ] 维护者在 Comments 中确认采用的版本与选项（确认后把 02 的 Status 改为 ready-for-agent）

## Comments
