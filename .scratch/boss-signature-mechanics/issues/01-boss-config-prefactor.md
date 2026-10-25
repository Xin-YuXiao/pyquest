# 01: BOSS 配置对象化 + 浮字改用本章 BOSS 名（prefactor，零玩法变化）

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

为后续招牌机制铺路，但玩家能感知到的唯一变化是修掉错名 bug：

- 章节注册表的 `boss` 字段同时接受旧字符串写法（`'slime' | 'snake'`）和新对象写法（`{ base, hp?, signature?, phase2?, lines? }`），统一归一化后交给场景创建 BOSS。
- 两个 BOSS 原型不再写死「循环之王」「巨蟒」浮字：从配置的 `lines` 读取，缺省按本章 `bossName` 生成（如「贝叶斯祭司召唤了帮手！」「NFW 幻龙的体节断了一节！」）。第一、二章把现有文案显式写进各自的 `lines`，玩家看到的内容不变。
- 原型在每帧更新、受击前、受击后、被冻结四个位置预留机制钩子调用（本工单没有任何机制注册，钩子为空操作）。
- 测试接缝新增只读 `bossInfo(sceneKey)`（hp、原型、机制 id、阶段、护盾状态、targets 空数组）。
- E2E 运行器的 bossFight 期望值（史莱姆一击 hp 9；巨蟒两击 hp 11/10、体节 6→5）改为读取各章声明里的 `hits` 序列，缺省值等于现状，11 章声明不需要逐个改。

## 验收标准

- [ ] 11 章全部仍用旧字符串写法时，游戏行为与现状完全一致（11 章 E2E 全过）
- [ ] 任意一章改用对象写法 `{ base: 'slime' }` 后行为不变（至少在一章上验证）
- [ ] 第三章及以后 BOSS 召唤/断尾的浮字显示本章 BOSS 名；第一、二章浮字文字不变
- [ ] smoke 新增：所有章节 BOSS 配置可归一化、`base` 合法；第三章及以后的生效文案不含「循环之王」「巨蟒」
- [ ] `bossInfo` 在 E2E 中可读，返回值可序列化
- [ ] 运行器 bossFight 步骤不再按原型硬编码期望 hp，期望值来自章节声明（缺省等于现状）
- [ ] `npm run check` 全绿

## Comments
