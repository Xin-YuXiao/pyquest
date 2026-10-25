# 02: 导出存档文件

Status: ready-for-agent
Type: task
Blocked by: 01

## 要做什么

标题画面（有存档时）与世界地图头部出现「导出存档」：下载一个 JSON 文件，文件名形如
`pyquest-save-YYYYMMDD-HHmm.json`，内容为 spec 中的导出信封（format / formatVersion / gameVersion /
exportedAt / integrity / save）。导出前先把内存状态写一次存档，保证导出的是最新进度。

## 验收标准

- [ ] 两个入口都能导出；无存档时标题画面不显示导出按钮
- [ ] 文件内容通过 01 的校验函数且无 warnings
- [ ] E2E：第一章收集 2 枚碎片后从世界地图导出 → 下载事件触发 → 文件内 save 的第一章碎片为 2
- [ ] 不发出任何网络请求
- [ ] `npm run check` 全绿

## Comments
