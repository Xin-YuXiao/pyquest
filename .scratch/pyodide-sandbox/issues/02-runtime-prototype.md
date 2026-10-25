# 02: 运行时实测：Pyodide 体积、加载耗时、内置包版本与国内可达性

Status: resolved
Type: prototype
Blocked by: None (can start immediately)

## 要做什么

用一个一次性原型页面（不进主游戏）实测 Pyodide 在本项目场景下的真实成本，产出一份报告（写在本 effort 目录下），
作为 03 号 grilling 的决策依据：

- 候选 2-3 个 Pyodide 版本：核心文件 + numpy + scipy 的下载体积（压缩前 / 后）、各版本内置的 numpy / scipy 版本号。
- 冷启动（无缓存）与热启动（有 HTTP 缓存）到「可运行 `import numpy, scipy`」的耗时；桌面 Chromium 实测，
  手机 / 平板列出待人工补测项。
- 在 Web Worker 中运行一段死循环，验证「主线程 terminate + 重建」的恢复耗时。
- 自托管可行性：从发布包中抽取所需文件的清单与总大小；与 vite 静态目录 / 构建产物的配合方式。
- 国内可达性：默认 CDN 的可达性需要在国内网络下人工测试——报告里列出测试步骤，结果由维护者补填。
- 把一道 verify-quiz 已收录的确定输出题（建议 W6 的 dblquad 手算 2/3）分别用 CPython 和 Pyodide 跑，比对输出是否一致。

## 验收标准

- [ ] 报告包含：各候选版本体积表、内置 numpy/scipy 版本、冷/热启动耗时、超时恢复耗时、自托管文件清单与总大小
- [ ] 报告给出推荐版本与理由（对齐 numpy 1.x 课程环境的取舍写清楚）
- [ ] 国内可达性测试步骤写清楚，结果栏标「待人工补测」
- [ ] 原型代码不进入主游戏构建、不影响 `npm run check`

## Comments

- 2026-10-25：feat/code-dojo 实测：Pyodide 314.0.7 自托管，下载 13.53 MB（仅首次进训练场时），首次加载本机约 3.9 s，单次运行约 0.1 s，死循环 4 s 截停后 Worker 约 3.3 s 重建。
