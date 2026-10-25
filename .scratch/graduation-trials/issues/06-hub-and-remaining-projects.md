# 06: 秘境大厅与其余 Project 的批次规划

Status: needs-info
Type: task
Blocked by: 05

## 要做什么

Project-4 样板跑通后，为扩展到八个 Project 做好容器和计划：

- 秘境大厅场景：村庄传送门改为通往大厅，大厅里 8 个入口（已上线的可进入，未上线的显示「敬请期待」，已完成的带徽章标记）。
- 把剩余 7 个 Project 拆成后续批次（建议：模拟类 Project-1/3、拟合类 Project-2、ML 类 Project-5/6/7、自选 Project-8），
  为每个批次在本 effort 的 issues 目录下新建工单（提纲 → grilling → 实现，与 04 / 05 同构），并标注各自依赖
  （例如需要代码符文的步骤依赖 pyodide-sandbox）。

## 验收标准

- [ ] E2E：大厅显示 8 个入口，Project-4 可进入并带完成标记，未上线入口不可进入
- [ ] 剩余 Project 的后续工单已创建，编号顺延、依赖边写明
- [ ] smoke：大厅入口与秘境注册表一一对应
- [ ] `npm run check` 全绿

## Comments
