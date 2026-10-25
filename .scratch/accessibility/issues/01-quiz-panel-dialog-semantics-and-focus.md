# 01: 答题面板对话框化：角色、焦点陷阱、Esc 与结果播报

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

读屏用户与纯键盘用户能完整完成一块符文石的答题：

- 答题面板具备模态对话框语义（dialog 角色、aria-modal、以章节徽标为名称、以题干为描述）；选项组为单选组语义，选中状态可读；
- 打开时记录先前焦点并把焦点移到第一个选项；Tab / Shift+Tab 只在面板内循环；Esc 等同「先不回答」（答对后的领取阶段按 spec 待决策 1 的推荐不响应）；关闭后焦点归还游戏画布；
- 答题反馈区为 assertive live region，「咒语生效了 / 咒语失败了 生命 -1」与解析 / 提示在一次更新中整体写入；
- 修复 Tab 冲突：世界地图的 Tab 快捷键只在自由探索时阻止默认行为，答题 / 对话期间 Tab 回归焦点导航；
- 数字键 1-4 / Enter 行为不变。

## 验收标准

- [ ] E2E：打开第一章任意碎片符文，`document.activeElement` 为第一个选项；连按 Tab 若干次焦点始终在面板内
- [ ] E2E：按 Esc 关闭面板（未作答），焦点回到画布容器；再次按 E 能重新打开同一道题（抽题不变）
- [ ] E2E：答错后反馈区的可访问文本包含「生命 -1」与提示内容；答对后包含「咒语生效了」与解析
- [ ] 答题面板的可访问名称与角色可通过 Playwright 的 role 选择器定位（如 getByRole('dialog')）
- [ ] 现有 11 章 E2E 原样通过；`npm run check` 全绿

## Comments
