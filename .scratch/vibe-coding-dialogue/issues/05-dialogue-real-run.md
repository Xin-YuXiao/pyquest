# 05: 对话里的「跑测试」接入沙盒真跑（脚本结果作为降级）

Status: needs-info
Type: task
Blocked by: 03, ../pyodide-sandbox/issues/05

## 要做什么

沙盒运行时可用时，对话中选择「跑测试」会在 Pyodide 里真实执行该选项的代码并展示真实输出；
沙盒不可用 / 加载中 / 失败时，回落到脚本里写好的 `output`，玩家体验不中断。

- 真跑输出与脚本 `output` 不一致时，以真实输出为准展示，并在开发模式控制台告警（提示脚本过期）。
- 真跑不改变判定逻辑：对话的通过 / 失败仍由到达的终点决定。

## 验收标准

- [ ] E2E：沙盒可用时，「跑测试」显示真实执行输出（经测试接缝确认沙盒状态为 ready）
- [ ] E2E：`sandboxOffline()` 后同一步骤回落到脚本输出，对话可正常走完
- [ ] verify-quiz 保证脚本 `output` 与 CPython 实跑一致（防止两种模式下显示不同）
- [ ] `npm run check` 全绿

## Comments
