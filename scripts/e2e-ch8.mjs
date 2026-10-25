// 端到端测试（第八章 · 深空晕环 · 第一部终章）：全流程
// 暗物质碎片 ×3 → 解开封印 → 暗物质核心 → 破盾 → 封印 NFW 幻龙 → 衔接第二部第九章
// 用法: node scripts/e2e-ch8.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 第八章已非全游戏终章（终章=第十一章），通关后进入「统计圣所」。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 8,
  labels: {
    place: '晕环',
    lairPlace: '核心',
    shard: '暗物质碎片',
    pool: '暗物质',
    healPool: '祝福随机题',
    topic: '暗物质',
    bossShort: '幻龙',
    badge: '第八章',
    gateOpen: '集齐暗物质碎片后封印解开',
    shieldBroken: '答对暗物质谜题，NFW 幻龙护盾破碎',
    done: '封印NFW 幻龙，第八章通关',
    victoryTitle: '第八章',
    stats: '8 / 11',
    statsLabel: '结算显示章节进度（第一部 8/11）',
    next: '通关后进入第九章 · 统计圣所（第二部）',
    resumeBtn: '第9章',
    resumeScene: 'C9F',
    resumeSceneLabel: '读档后落到第九章野外',
    resumeDone: { ids: [8], label: '读档后第八章进度保留' },
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '80-c8field' },
    { type: 'collectShards', badge: true },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '81-c8lair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossRune', badge: true },
    { type: 'bossFight', shot: '82-snake8' },
    { type: 'victory', shot: '83-victory8' },
    { type: 'saveCheck' },
    { type: 'nextChapter', shot: '84-c9f-intro' },
    { type: 'resume', shot: '85-resume-c9' },
  ],
});
