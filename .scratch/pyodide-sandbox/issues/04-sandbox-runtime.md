# 04: 沙盒运行时：自托管 Pyodide + Web Worker 协议 + 超时恢复

Status: needs-info
Type: task
Blocked by: 03

## 要做什么

把 03 号决定的 Pyodide 版本以自托管方式接进项目，提供一个独立于答题面板的「沙盒运行时」模块，
本工单结束时可以通过测试接缝端到端验证「浏览器里跑 Python」：

- 运行时文件按锁定清单（带校验和）在构建前下载到站点静态目录，不提交进 git；dev / build / CI 用同一清单；CI 缓存。
- 专用 Web Worker：`init / run / judge` 三类消息（见 spec「实现决策」），游戏启动时**不**加载，首次调用时按需初始化并上报进度。
- 主线程计时，超时 terminate 并重建 Worker；重建后可继续运行。
- 测试接缝 `__PYQUEST__` 新增：只读查询沙盒状态（idle / loading / ready / failed）、
  语义动作「运行一段代码并返回结果」（仅测试用）、`sandboxOffline()`（让下一次初始化失败）。

## 验收标准

- [ ] 离线（E2E 运行器拦截所有外网请求）条件下，经测试接缝运行 `print(1+1)` 得到 `2`，`import numpy, scipy` 成功
- [ ] 死循环代码在设定时限后返回「超时」，随后再运行正常代码仍能成功
- [ ] 不打开代码符文时，游戏首屏网络请求中不出现运行时文件（E2E 断言或手工 Network 截图记录）
- [ ] 新增一个 E2E（或现有 E2E 的附加步骤）覆盖以上三点
- [ ] README「测试」章节说明运行时文件如何获取、CI 如何缓存
- [ ] `npm run check` 全绿（本地与 CI）

## Comments
