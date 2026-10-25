# 07: 收口（contract）：全局开启类型检查

Status: ready-for-agent
Type: task
Blocked by: 06

## 要做什么

把检查范围从显式包含列表改为整个 src 目录，删掉分批过程中的过渡配置。以后新增的任何源文件默认就被检查，不会漏网。

## 验收标准

- [ ] 检查配置覆盖整个 src，不再有逐层包含列表
- [ ] 新建一个空 JS 文件并在其中写一处类型错误，typecheck 失败（验证后删除）
- [ ] 全仓库忽略注释的数量和原因汇总在 Comments
- [ ] 在 Comments 中评估是否要从第一阶段严格选项升级到完整 strict；如要升级，新建后续工单
- [ ] README「测试」一节更新为最终状态
- [ ] npm run check 全绿

## Comments
