# 01: 音频总线 + 持久化静音与音量（prefactor）

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

- 音频模块改为「主总线 → 音乐总线 + 音效总线」三级增益；现有全部音效改接到音效总线，音色与触发时机不变。
- 静音改为作用在主总线上（平滑降到 0）；静音状态、音乐音量、音效音量持久化（存储位置见 spec 待决策 2：优先与 accessibility 的设置存储共用，未落地则先用同名独立设置键）。
- M 键在任何场景都生效；标题画面增加一个可点击的静音按钮（同一状态）。
- 切到后台标签页时挂起 AudioContext，回到前台时恢复；没有 WebAudio 的环境静默降级、不报错。
- 测试接缝新增音频状态只读查询（muted、musicVolume、sfxVolume、contextState）。

## 验收标准

- [ ] E2E：在章节场景按 M → 音频状态 muted 为真；刷新页面后仍为真；标题画面的静音按钮与 M 键状态一致
- [ ] 模拟 visibilitychange 到 hidden 后 contextState 为 suspended（AudioContext 已创建的前提下），回到 visible 后恢复
- [ ] 全部章节 E2E 通过（音效接线改动不影响游戏流程，浏览器无报错断言仍通过）
- [ ] npm run check 全绿

## Comments

- 2026-10-25：已做：M 同时静音音效与音乐；N 开关音乐并持久化（pyquest:settings:music）。未做：静音状态持久化、独立音频总线。
