# 01: 构建体积报告与 CI 预算检查

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

维护者每次构建后都能看到一张体积表：各 chunk、样式与页面、静态素材总量、产物总量，分别给出原始大小和 gzip 大小。CI 在构建之后对照预算配置检查，超出即失败，并指出是哪一组超了多少。

预算初始值取当前实测基线加 10% 余量，配置里注明测量日期和环境。此时还没拆包，基线按现状的单 chunk 记录；02 拆包后再更新预算。

## 验收标准

- [ ] `npm run build` 之后打印体积表（或单独一条 npm 脚本，并在 check 中紧跟 build 执行）
- [ ] 预算配置存在，含各组预算值、测量日期、余量说明
- [ ] CI 在构建之后运行预算检查
- [ ] 临时把某组预算调到实测值以下，检查失败，并打印组名、实测值、预算值（验证后恢复，记在 Comments）
- [ ] 当前基线数值记在 Comments
- [ ] npm run check 全绿

## Comments
