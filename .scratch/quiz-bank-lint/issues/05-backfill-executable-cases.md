# 05: 补齐可执行题的 python 实跑校验

Status: ready-for-agent
Type: task
Blocked by: 04

## 要做什么

把 04 归为「可执行未校验」的题全部补进 verify-quiz 校验表，覆盖率下限随之上调。期望输出以本机 python 实跑结果为准，并必须通过 03 的答案键核对。这只是补充校验数据，不改动任何题面；如果实跑结果与正确选项不一致，说明题目本身可能有错，按 ADR-0001 登记，不改题。

## 验收标准

- [ ] 「可执行未校验」类清零：全部进入校验表，或说明理由后改归「不可执行」
- [ ] 新增条目全部通过运行比对和答案键核对
- [ ] 若有题目实跑结果与正确选项矛盾：在 `.scratch/quiz-bank-lint/issues/` 新建 ready-for-human 工单登记，该题暂不进校验表
- [ ] 覆盖率下限上调到新的实测值
- [ ] CI 上 verify-quiz 通过（numpy 1.x 环境）
- [ ] npm run check 全绿

## Comments
