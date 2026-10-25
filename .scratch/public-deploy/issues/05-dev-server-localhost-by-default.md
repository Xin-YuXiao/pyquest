# 05: 拍板并实施：dev server 默认只监听本机

Status: ready-for-human
Type: grilling
Blocked by: None (can start immediately)

## 要做什么

构建配置里的 dev server 监听设置让 `npm run dev` 监听所有网卡，同一局域网的人都能访问开发服务器（来源：`.scratch/part2-landing/issues/02` 第 1 条）。
vite 7.3.6 的几个高危公告正是在这种暴露下才危险（已升级到 7.3.7 修补，但默认暴露本身仍值得收紧）。

- 拍板：默认只监听本机？（推荐：是）上游作者设为对外监听，可能是为了手机真机调试——保留一个显式的局域网调试脚本即可满足；
- 若同意：默认改为本机，新增显式局域网调试脚本，README 说明用途与风险；run-e2e 的「复用 / 临时起服务」逻辑核对不受影响。

## 验收标准

- [ ] 决定与理由写在 `## Answer`
- [ ] 若实施：默认 `npm run dev` 只在 localhost 可访问；显式脚本可在局域网访问；README 已更新
- [ ] `npm run test:e2e` 的复用与临时起服务两条路径仍正常
- [ ] `npm run check` 全绿
- [ ] 同步把 `.scratch/part2-landing/issues/02` 第 1 条标注为由本工单接手

## Comments
