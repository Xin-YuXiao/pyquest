# 01: 字体本地化（去掉 Google Fonts / jsdelivr 外链）

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

学生打开游戏时，页面不再请求 fonts.googleapis.com 或 cdn.jsdelivr.net，三套字体都从游戏自己的构建产物加载：霞鹜文楷（正文）、JetBrains Mono（代码）、ZCOOL KuaiLe（标题与地名）。字体族名和回退链不变，所以开发服务器和生产构建里的视觉效果都与现在一致。

做法：

- 用 npm 依赖引入三套字体：文楷沿用同版本的 `lxgw-wenkai-webfont`；另两套用 Fontsource 分发包，只引入实际用到的字重（JetBrains Mono 400/700，ZCOOL KuaiLe 400）。
- 在游戏入口模块里 import 这些字体样式表，删除页面头部的外链与 preconnect。
- README「许可证」一节登记字体许可证。

## 验收标准

- [ ] 页面头部不再出现 fonts.googleapis.com、fonts.gstatic.com、cdn.jsdelivr.net 的任何链接或 preconnect
- [ ] `npm run build` 后 dist 中包含三套字体的 woff2 文件，文件名带内容 hash
- [ ] 开发服务器与 `npm run preview` 下，标题、题面、代码块、飘字分别显示为快乐体、文楷、等宽字体（截图对比改动前后无可见差异，截图附在 Comments）
- [ ] 浏览器字体就绪 API 报告 "LXGW WenKai"、"JetBrains Mono"、"ZCOOL KuaiLe" 三个字体族已加载（在开发服务器上手动或脚本验证一次）
- [ ] README「许可证」一节列出三套字体及其许可证，并核实文楷字体本体的许可证原文（npm 包装许可证与字体许可证分开写）
- [ ] 断网（或屏蔽外网）情况下 `npm run preview` 打开页面，三套字体仍然生效
- [ ] npm run check 全绿

## Comments
