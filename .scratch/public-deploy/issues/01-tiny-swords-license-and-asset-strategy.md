# 01: 核实 Tiny Swords 许可证，选定公开部署的素材方案

Status: ready-for-human
Type: research
Blocked by: None (can start immediately)

## 要做什么

公开部署前必须回答：把 Tiny Swords（Pixel Frog · Free Pack）素材打进公开部署的游戏构建、让浏览器下载这些 PNG，是否被许可证允许？

- 找到并存档许可证原文（itch.io 页面与素材包内的许可文件），摘录与「在项目中使用」「再分发」相关的条款；
- 判断方案 A（素材只进构建、不进仓库，存 CI 私有存储）是否合规；原文含糊时写信询问作者并保留回复；
- 若 A 不可行，评估方案 B（改用仓库已有的 CC0 素材：0x72 DungeonTileset、Kenney Tiny Town / Tiny Dungeon）：
  列出游戏实际用到的每类素材（勇者 / 长老 / 小怪 / BOSS 的待机、奔跑、攻击帧，地形 tileset，树、灌木、云、建筑、尘土 / 火焰特效），逐项找替代并估算工作量，核实 0x72 素材的许可证原文；
- 方案 C（只部署占位图）不可接受，记录理由即可；
- 把结论写成 ADR（docs/adr 下新增一篇），状态「已接受」。

## 验收标准

- [ ] 许可证原文要点与来源链接、查阅日期记录在 `## Answer`
- [ ] 明确结论：A 可行 / 不可行（附依据）；若不可行，B 的素材替代清单与工作量估算
- [ ] 新增 ADR，并在 spec 的实现决策中标注采用的方案
- [ ] 若选 B，另开一个「素材替换」effort（本工单只做评估）

## Comments
