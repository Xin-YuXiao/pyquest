# 05: 彩蛋样板：`import this` 石碑 + 彩蛋记录持久化

Status: needs-info
Type: task
Blocked by: 01, ../learning-records/issues/01

## 要做什么

- 第一章村庄放一块刻有 `import this` 的小石碑；按 E → 对话框逐句展示 Python 之禅（按 grilling 结论决定是否中英对照），可随时按 E 推进/跳过，结束时浮字「你领悟了 Python 之禅」。
- 建立彩蛋通用机制：道具带 `egg` id，首次触发写入存档 v3 的 `eggs` 集合；之后可重复触发但不重复记录。
- 「新的冒险」清档时彩蛋记录一并清除；存档导出/导入（若 save-portability 已落地）随存档走。

## 验收标准

- [ ] 第一章 E2E 新增 `easterEgg` 步骤：走到石碑 → 按 E → 断言对话框出现 Python 之禅首句 → 推进到结束 → 断言测试接缝 `state()` 快照的彩蛋集合包含该 id
- [ ] 读档续玩后彩蛋记录仍在；清档后为空
- [ ] 对话框文本可被读屏读取（文本在 DOM 中，而非只在画布浮字里）
- [ ] `npm run check` 全绿

## Comments
