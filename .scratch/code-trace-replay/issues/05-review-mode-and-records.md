# 05: 复习模式入口与查看记录

Status: ready-for-agent
Type: task
Blocked by: 04, ../learning-records/issues/01

## 要做什么

- 在错题本复习模式（mistake-review）中作答后，同样提供「看它怎么跑」；若复习模式尚未落地，本条只留接口、在 Comments 说明。
- 作答记录里增加「是否打开过回放 / 看到第几步」（字段与 learning-records 的 v3 schema 协调，只存本机）。
- 学习报告（learning-report）如已落地，增加一项「主动查看执行过程的次数」；未落地则只保证记录可被其读取。

## 验收标准

- [ ] E2E：复习一道错题作答后回放按钮出现（复习模式已落地时）
- [ ] 存档 / 作答记录中能读到回放查看次数；旧存档无此字段时正常读档
- [ ] `npm run check` 全绿

## Comments
