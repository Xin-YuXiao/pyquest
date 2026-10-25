# 01: 轨迹生成器与入库数据（共享确定性题目清单 + CI 同步检查）

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

先把「真实 Python 跑出的逐步轨迹」这条数据链路做出来，可独立验证，UI 下一张工单接。

- prefactor：把 verify-quiz 里的「题 id → 期望输出」表移到独立的数据模块，verify-quiz 改为从该模块读取，行为不变
  （若 quiz-bank-lint 03/04 号已先改造 verify-quiz，则在其基础上做，不重复搬家）。
- 新增构建期生成器：复用 verify-quiz 的 python 探测与 UTF-8 设置，在单个 python 进程内对清单中「只依赖标准库或 numpy、无随机数」的题
  用 `sys.settrace` 只追踪题目代码自身的帧，记录 line / call / return / exception 事件的行号、可见变量短 repr（过滤模块、
  内置函数、下划线名字，超 60 字符截断）、累计 stdout；步数超过上限（建议 80）截断并标记。
- 输出入库数据文件（spec「数据形状」）和报告（可回放题数、被排除的题与原因、每题步数、总体积）。
- 新增 npm 脚本；CI 在 `npm test` 中重新生成并比对，有差异即失败。
- 本工单 `label` 字段可先留空，03 号补齐。

## 验收标准

- [ ] verify-quiz 改为读共享清单后输出与改造前逐字一致（56 道全过）
- [ ] 每条轨迹最后一步的累计输出 == 清单期望输出（交叉校验，生成器内置）
- [ ] 报告列出全部 56 道题的去留；被排除者有原因（依赖库 / 超长 / 随机数）
- [ ] 入库数据总体积写进报告且 ≤ 300 KB（超出则在 Comments 说明并提出截断策略）
- [ ] 本机与 CI 生成结果一致；临时改一道题的代码时 CI 同步检查失败（Comments 贴验证记录）
- [ ] `npm run check` 全绿

## Comments
