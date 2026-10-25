// 端到端测试（学习记录 · 错题本 · 存档 v3 迁移）
// 老存档：注入 v2（旧版本真实玩出）/ v1 样本 → 继续冒险 → 进度完整、记录为空、自动升级 v3
// 错题：第九章碎片符文先真实答错一次再答对 → 学习记录 → 世界地图「错题本（1）」→
//       复习：答错不扣心 → 答对不产碎片 → 再复习答对 → 已掌握 → 刷新读档后状态保留
// 用法: node scripts/e2e-review.mjs（需要先 npm run dev；或 npm run test:e2e -- review）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明步骤。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 9,
  labels: {
    place: '外庭',
    shard: '证据碎片',
    pool: '统计',
    badge: '第九章',
    resumeBtn: '第9章',
    resumeScene: 'C9F',
    resumeSceneLabel: '读档后落到第九章野外',
    resumeDone: { ids: [8], label: '读档后前序章节进度保留' },
  },
  steps: [
    { type: 'legacyResume', version: 2 },
    { type: 'legacyResume', version: 1 },
    { type: 'newGame' },
    { type: 'gotoChapter' },
    { type: 'mistakeBookEmpty' },
    { type: 'collectShards', badge: true, wrongFirst: true },
    { type: 'mistakeBook', shot: '120-mistake-book' },
    { type: 'recordsSaved' },
    { type: 'resume', shot: '121-resume-review' },
    { type: 'reviewPersisted' },
  ],
});
