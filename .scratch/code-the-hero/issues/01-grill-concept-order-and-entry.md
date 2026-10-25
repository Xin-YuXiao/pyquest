# 01: 拍板：关卡概念顺序（对齐讲义）、入口与英雄 API 形态

Status: ready-for-human
Type: grilling
Blocked by: None (can start immediately)

## 要做什么

与助教对照讲义 W1–W2（权威源见 docs/course-materials.md §1，ADR-0001）确认，结论写入 `## Answer` 并回写 spec「待决策」：

- 关卡清单与概念顺序（spec 推荐 8 关：顺序执行 → 列表索引 → for+range → if/elif/else → while → break → def → 遍历列表收集）；每关只引入一个新概念，概念出现顺序不得早于讲义；
- 每关的一句话提示用语（只用课上术语）；
- 入口位置与是否计入进度（推荐第一章通关后村庄「训练场之门」，完全可选）；
- 英雄 API 形态：`hero_hp()` 函数还是 `hero.hp` 属性（推荐函数，W1–W2 未讲类）、`look()` 返回值的中文还是英文字符串；
- 成绩维度（行数 / 步数）与「看过参考解」的标记规则；沙盒不可用时的降级方式。

## 验收标准

- [ ] 关卡清单逐关写明：新概念、目标、可用 API、起始代码草案、提示文案
- [ ] 概念顺序已对照讲义确认（附讲义章节位置）
- [ ] 其余各项有明确结论

## Comments
