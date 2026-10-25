# 质量地基落地后的工程遗留项

Status: needs-triage
Type: task
Blocked by: None (can start immediately)

都不阻塞当前两个分支，按优先级排。带「需拍板」的要先决定再动。

## 1. dev server 默认暴露到局域网（需拍板，中）

- `vite.config.js` 里 `server.host: true` 让 `npm run dev` 监听 0.0.0.0，同一局域网的人都能访问。
  vite 7.3.6 的几个高危公告（跨源脚本执行、fs.allow 绕过）正是在这种暴露下才危险；
  已在 chore/quality-baseline 升到 7.3.7 修补。
- 若没有手机/局域网真机调试的需求，建议改成默认只监听 localhost，需要时 `npm run dev -- --host`。
  这是上游作者的设定，所以没擅自改。

## 2. E2E 进度分母是写死的字面量（低）

- e2e-ch3 ~ ch11 的 `stats: 'N / 11'` 是字面量。这次第二部把章节数 8 → 11 时，
  原改动漏改了 ch3-7，导致 E2E 失败（已在 feat/part2-ch9-11 修正）。
- 以后再加章节还要逐个改。可以改成在 runner 里拼 `${id} / ${CHAPTERS.length}`，
  代价是这条断言就不再独立核对章节总数了。保持现状也行，只是加章时要记得改。

## 3. 打包体积（低）

- 生产包单个 JS 1.49 MB（gzip 438 KB），主体是 Phaser；`chunkSizeWarningLimit: 1500` 把警告压掉了。
- 可选：把 Phaser 拆成独立 chunk（`build.rollupOptions.output.manualChunks`），
  利于缓存（改题库时用户不必重新下载 Phaser）。

## 4. git 作者邮箱（低，需你确认）

- 本仓库本地 git 身份设为 `Xinyu Xiao <Xinyu.Xiao@mbzuai.ac.ae>`。
  若这个邮箱没绑定你的 GitHub 账号，提交在 GitHub 上不会关联到你的头像/主页；
  改法：`git config user.email <你 GitHub 账号上的邮箱>`（只影响之后的提交）。

## 5. 未纳入 CI 的脚本（备忘）

- `scripts/design-audit*.mjs`、`shots-b*.mjs` 是视觉审计/截图复现脚本，依赖真实素材和人工看图，
  不适合进 CI，保持手动运行。

## Comments
