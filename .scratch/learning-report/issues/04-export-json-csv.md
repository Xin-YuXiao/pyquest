# 04: 导出报告 JSON 与 CSV

Status: needs-info
Type: task
Blocked by: 01, 03

## 要做什么

报告页提供「下载 JSON」「下载 CSV」：JSON 按 spec 的版本化契约（format / reportVersion / student /
summary / chapters / weakSpots / attempts / integrity）；CSV 两份（分章汇总、作答明细），
UTF-8 带 BOM、中文表头，Excel 直接打开不乱码。integrity 是内容摘要，仅用于发现意外损坏，
报告页注明它不是防作弊手段。

## 验收标准

- [ ] JSON 字段与 spec 契约一致，`reportVersion` = 1
- [ ] 修改 JSON 任一字段后重新校验，integrity 不通过（单元测试）
- [ ] CSV 带 BOM；含逗号、引号、换行的题面摘要被正确转义（单元测试）
- [ ] E2E：点击下载触发浏览器下载事件，文件名含日期，内容可解析且与报告页数字一致
- [ ] `npm run check` 全绿

## Comments
