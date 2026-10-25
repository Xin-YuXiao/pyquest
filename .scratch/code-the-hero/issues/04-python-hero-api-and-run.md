# 04: Python 英雄 API + 编辑器 + 运行 → 回放

Status: resolved
Type: task
Blocked by: 03, ../pyodide-sandbox/issues/01

## 要做什么

让玩家真正写 Python：编辑器可编辑（复用 pyodide-sandbox 的编辑器方案与按键隔离）→「运行」→ 代码在沙盒 Worker 中执行，
注入的 `move / attack / look`（及 01 号决定的英雄状态函数）同步调用 Worker 内的关卡模拟器并记录动作与行号 →
返回 `{ actions, lineNumbers, stdout, error }` → 主线程用 `simulate` 重算并回放 → 判定过关，显示行数/步数。
报错显示 Python 错误信息与行号；步数上限与超时（复用沙盒的超时中断）各有提示。

依赖说明：除 01 号题型分派/按键隔离外，还需要 pyodide-sandbox 的「沙盒运行时：自托管 + Worker + 超时恢复」工单（其 04 号）落地；在此之前本工单保持 needs-info。

## 验收标准

- [ ] 编辑器内可正常输入 w/a/s/d/e/j/m、空格、方向键、Tab 缩进、Enter 换行，不触发游戏快捷键
- [ ] 主线程只消费结构化动作记录，逐条校验类型与参数；伪造/非法动作被丢弃并报错
- [ ] 死循环几秒内中断并提示，训练场可继续使用；超过步数上限判「步数用尽」
- [ ] 每关参考解经 CPython 桩运行得到的动作序列与关卡数据中的参考动作一致（数据层实跑校验，做法在本工单确定并写进 smoke 或 verify-quiz）
- [ ] E2E：用真实键盘输入样板关卡参考解 → 运行 → 断言过关与成绩；再输入死循环 → 断言超时提示；`sandboxOffline()` 下断言降级说明
- [ ] `npm run check` 全绿

## Comments

- 2026-10-25：feat/code-dojo 实现：Python 英雄 API（move / look / jump / attack）经 Pyodide Worker 同步调用模拟器产出动作轨迹；中文报错带行号。
