# 02: 对话脚本数据契约 + smoke 图校验

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

先把「对话脚本」作为纯数据定下来，并让 smoke 能在 CI 里抓住写坏的脚本——这一步不涉及任何 UI：

- 按 spec「实现决策」的状态机形状确定字段（节点 `step` / `ai` / `ask` / `choices[{label, to, run?}]`，终点 `terminal` + `explain`）。
- smoke 对题库中所有 `kind: 'dialogue'` 的题执行图校验：
  所有 `to` 都指向存在的节点；从 `start` 至少能到达一个 `pass` 终点；每个非终点节点都能到达某个终点（无走不出的环）；
  不存在从 `start` 不可达的节点；每个终点都有 explain；每个节点选项数 2-4；`step` 取值合法。
- smoke 内置一份最小合法对话夹具和若干非法夹具（悬空跳转、无 pass 终点、死循环、孤立节点），自测校验器确实能报错。
  夹具只存在于测试内，不进题库、不进任何题池。
- GLOSSARY 新增「对话符文」「对话脚本（节点 / 选项 / 终点）」。

## 验收标准

- [ ] smoke 新增「对话脚本图校验」小节：合法夹具通过，每种非法夹具都被识别并给出可读的错误信息
- [ ] 题库目前没有对话题时，smoke 输出「0 条对话脚本」且整体通过
- [ ] 契约字段说明写进 spec「实现决策」（若与草案不同则更新）
- [ ] `npm run check` 全绿

## Comments
