// 端到端测试（第九章 · 统计圣所 · 第二部）：全流程
// 证据碎片 ×3 → 解开封印 → 后验回廊 → 破盾 → 说服贝叶斯祭司 → 进入第十章
// 用法: node scripts/e2e-ch9.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 碎片/BOSS 谜题均有题池徽标断言；史莱姆 BOSS 一击 hp 9。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 9,
  labels: {
    place: '外庭',
    lairPlace: '回廊',
    shard: '证据碎片',
    pool: '统计',
    healPool: '祝福随机题',
    topic: '统计',
    bossShort: '祭司',
    badge: '第九章',
    gateOpen: '集齐证据碎片后封印解开',
    shieldBroken: '答对统计谜题，贝叶斯祭司护盾破碎',
    done: '击败贝叶斯祭司，第九章通关',
    victoryTitle: '第九章',
    stats: '9 / 11',
    statsLabel: '结算显示章节进度（9/11）',
    next: '通关后进入第十章 · 灵思之塔',
    resumeBtn: '第10章',
    resumeScene: 'C10F',
    resumeSceneLabel: '读档后落到第十章野外',
    resumeDone: { ids: [9], label: '读档后第九章进度保留' },
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '90-c9field' },
    { type: 'collectShards', badge: true },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '91-c9lair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossRune', badge: true },
    { type: 'bossFight', shot: '92-slime9' },
    { type: 'victory', shot: '93-victory9' },
    { type: 'saveCheck' },
    { type: 'nextChapter', shot: '94-c10f-intro' },
    { type: 'resume', shot: '95-resume-c10' },
  ],
});
