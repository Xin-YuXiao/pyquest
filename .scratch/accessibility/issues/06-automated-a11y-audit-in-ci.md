# 06: 自动化无障碍审计进 CI + 修复审计发现的问题

Status: ready-for-agent
Type: task
Blocked by: 01, 02

## 要做什么

- 引入自动无障碍审计（推荐 `@axe-core/playwright`，开发依赖；在工单 Comments 里记录版本、体积、许可证）；
- 在标题页、答题面板（作答前 / 答错后 / 答对后）、对话框、世界地图、胜利页各审计一次；
- 修复所有 serious / critical 违规：包括对比度不足、缺少名称的按钮、答对 / 答错只靠颜色区分（加图标或文字前缀）等；
- 审计接入 `npm run test:e2e` 与 CI。

## 验收标准

- [ ] 上述 7 个界面状态的审计结果 serious / critical 违规为 0；moderate / minor 违规列表记录在工单 Comments（不强制清零）
- [ ] 答对 / 答错选项在灰度截图下仍可区分（有非颜色标记）
- [ ] 审计在本地与 CI 均运行；`npm run check` 全绿，CI 绿

## Comments
