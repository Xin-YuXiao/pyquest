# 02: 过场系统 + 序章样板（可跳过、只播一次、存档记录）

Status: needs-info
Type: task
Blocked by: 01, ../learning-records/issues/01

## 要做什么

- 新增剧情数据模块（过场按 id 组织），录入序章台词。
- 过场播放复用对话框模块（打字机、键帽标记），新增「跳过」按钮与 Esc 跳过；支持可选的淡入淡出（减少动态效果时关闭）。
- 「开始冒险」（新游戏）后、勇者可操作之前播放序章；播完或跳过后把 `prologue` 写入存档 v3 字段 `story.seen`；读档续玩不重播；「新的冒险」清档后重新播放。
- 测试接缝新增 `markStorySeen('all' | id[])` 与只读 `storyInfo()`；E2E 运行器 `newGame` 步骤缺省调用 `markStorySeen('all')`。

## 验收标准

- [ ] 新增 E2E：新游戏 → 断言序章出现 → 点击跳过 → 断言可操作且 `storyInfo().seen` 含 `prologue` → 刷新读档 → 断言不重播 → 清档新游戏 → 断言再次播放
- [ ] 现有 11 章 E2E 在 `newGame` 缺省跳过后全部通过
- [ ] smoke：剧情数据表存在 `prologue`，每行长度不超过对话框单行上限
- [ ] 过场文字在 DOM 中可被读屏读取
- [ ] `npm run check` 全绿

## Comments
