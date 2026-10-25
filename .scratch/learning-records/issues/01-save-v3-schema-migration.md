# 01: 存档 v3 schema + v2→v3 迁移（含作答记录字段）

Status: resolved
Type: task
Blocked by: ../core-unit-tests/issues/01

## 要做什么

把存档升级到 v3，让老玩家无感升级：任何 v1/v2 存档读档后进度完全不变，下一次自动存档写成 v3。
本工单只建立结构与迁移，不产生任何新记录（`records` 为空、章节时间点为 null、`playMs` 为 0），
游戏行为对玩家零变化。

先做 prefactor：把存档模块拆成「序列化 / 水合 / 迁移 / 校验」四个纯函数 + 一层薄的 localStorage 读写，
行为不变地先落一次（现有 E2E 全绿），再加 v3。

## 验收标准

- [ ] 改动存档代码之前，用当前版本真实玩出一份 v2 存档、构造一份 v1 存档，作为测试样本入库
- [ ] 存档模块对外行为不变的前提下拆出四个纯函数；拆分后（加 v3 之前）`npm run check` 全绿
- [ ] v3 写入 `pyquest:save:v3`，形状与 spec「存档 v3 形状」一致（含空 `records`、`playMs`、
      各章 `enteredAt/gateOpenedAt/doneAt` = null）
- [ ] 读档顺序 v3 → v2 → v1；迁移链 v1→v2→v3 逐级执行；首次成功写入 v3 后删除旧键
- [ ] 「有存档」「存档落点章节」「清档」三处识别全部三个键
- [ ] 存档损坏（非法 JSON、未知版本号）时当作无存档、不覆盖原始数据、不抛异常
- [ ] 单元测试：v1 样本→v3、v2 样本→v3 进度逐字段一致；v3 往返不变；损坏/未知版本；缺字段补默认值
- [ ] 测试接缝 `state()` 快照新增 `records`、`playMs`、章节时间点
- [ ] E2E 的「进度已自动存档」断言改为检查 v3 键与 `records` 结构存在（runner 与第一章脚本两处）
- [ ] E2E：注入一份 v2 存档后刷新，「继续冒险」落点章节与进度正确、随后存档为 v3
- [ ] `npm run check` 全绿

## Comments

- 2026-10-25：feat/mistake-book 实现：存档 v3 + v1→v2→v3 纯函数迁移，真实 v1/v2 样本 fixtures。偏离规格：迁移测试写在 smoke 第 9 节（vitest 尚未引入），等 core-unit-tests/01 落地后可迁移。集成时 secrets / observatory 两个可选字段已并入 v3。
