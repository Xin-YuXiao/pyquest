# 01: 获取并登记课程素材（P4A@UCAS-latest 讲义与 Project）

Status: ready-for-human
Type: research
Blocked by: None (can start immediately)

## 要做什么

ADR-0001 规定题面以 2026 版讲义为唯一权威源，但素材目录在原作者的 Mac 上（`/Users/uranus/Desktop/P4A@UCAS`，见 docs/course-materials.md），
讲义剥离版缓存在系统临时目录、很可能已失效。新维护者需要先拿到素材，所有内容类工作（本 effort、graduation-trials、
pyodide-sandbox 的新代码题）才能开展。

需要人工完成：

1. 向原作者 / 课程方获取 `P4A@UCAS-latest/`（至少 Notebooks/ 与 Projects/）的副本，确认版本日期（2026 春）。
2. 确认素材的使用许可：能否在本仓库引用讲义代码片段作为题面（现有题库已在这样做）、能否把剥离版提交进仓库（推荐**不**提交，只提交生成脚本）。
3. 在 docs/course-materials.md 登记：新维护者本机的素材路径（或获取方式）、版本日期、许可结论。
4. 把「讲义 → 只含 markdown + code 的剥离版」预处理做成一个可重复运行的脚本（输入素材目录，输出到本机临时目录），替代已失效的临时缓存。

## 验收标准

- [ ] 维护者本机有完整的 P4A@UCAS-latest/Notebooks 与 Projects 副本
- [ ] docs/course-materials.md 记录了获取方式、版本日期与许可结论（Comments 附与原作者 / 课程方的确认记录）
- [ ] 剥离版生成脚本入库并可运行（素材本体不入库）；脚本对缺失素材目录给出清楚的提示
- [ ] 若许可不允许引用，Comments 记录结论并把本 effort 与 graduation-trials 标为阻塞

## Comments
