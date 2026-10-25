# 向 upstream（linan7788626/pyquest）提 PR 的建议

Status: 待你决定（没有开任何 PR）

两个分支在 fork 上是叠起来的：
`upstream/main (44628f4)` → `feat/part2-ch9-11`（4 个提交）→ `chore/quality-baseline`（5 个提交）。
建议拆成下面几个小 PR，按顺序提，每个都能单独审、单独合：

| 顺序 | PR | 提交 | 依赖 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 工具：跨平台兼容 + 无素材占位图 | d9adeda | 无 | Windows 跑通 verify-quiz、.gitattributes、gen-ts-stubs。风险最低，最好先合 |
| 2 | 修复：史莱姆出生禁入区 | c707542 | 无 | 独立 bug 修复；会改变 W3+ 野外的史莱姆落点（玩法相关，作者可能想过目） |
| 3 | 内容：第二部 W9-W11 + README | 7e30e1c、2c63755 | 1、2 | 主体。建议先处理 `issues/01` 的讲解文本问题再提，或在 PR 描述里列出待确认项 |
| 4 | 依赖：vite 安全补丁 | 8b42962 | 无 | 只改锁文件，可以随时单独提 |
| 5 | 质量地基：ESLint + npm scripts + CI | 30ae0fc、a7b0670、5966a58、a4f81fa | 3 | CI 跑全 11 章 E2E，所以要在第二部合进去之后提 |

- 1、2、4 都直接基于 upstream/main，可以各开一个分支 cherry-pick 后提 PR。
- upstream 的 Actions 第一次运行可能需要作者在仓库里批准（外部贡献者的 workflow 默认要审批）。
- 本机没有 gh CLI：可以在 GitHub 网页上从 fork 的分支点 “Compare & pull request”，
  或装 gh 后由我来开（开之前会先问你）。
