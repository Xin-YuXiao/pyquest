# 02: 托管平台选型（国内可达性、预览环境、存档隔离）

Status: ready-for-human
Type: research
Blocked by: None (can start immediately)

## 要做什么

为正式版与预览版选托管平台。候选：GitHub Pages、Cloudflare Pages、国内对象存储 + CDN（需备案）、其他课程方可用的静态托管。

逐项评估并实测：

- 国内可达性：校园网与手机流量下首屏可用时间（同一个测试构建，各平台分别部署后实测；没有条件实测时注明）；
- 是否需要备案 / 自定义域名；
- 预览环境能力（每个 PR 一个预览地址？固定 staging？），以及预览与正式是否同源——同源会共享 localStorage 存档；
- 与现有 GitHub Actions CI 的集成方式、所需凭据、费用；
- 回滚方式。

## 验收标准

- [ ] 评估表（平台 × 维度）写在 `## Answer`，附实测数据或「未实测」说明
- [ ] 选定正式版平台与预览方案，记录理由
- [ ] 若预览与正式同源，确认采用存档键渠道前缀方案（spec 实现决策「存档隔离」）
- [ ] 列出部署作业需要的 CI secret 名称与用途（不写入任何真实凭据）

## Comments
