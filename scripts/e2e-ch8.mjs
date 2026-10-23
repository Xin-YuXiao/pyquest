// 端到端测试（第八章 · 深空晕环 · 终章）：全流程
// 暗物质碎片 ×3 → 解开封印 → 暗物质核心 → 破盾 → 封印 NFW 幻龙 → 全部通关 → 返回村庄
// 用法: node scripts/e2e-ch8.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 终章无下一章（结算按钮「返回村庄」→ 诺瓦村庄）、全部通关标题/统计、
// 读档后终章进度保留且落点本章野外。
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
    victoryTitle: '全部通关',
    stats: '8 / 8',
    statsLabel: '结算显示全部章节完成',
    resumeBtn: '第8章',
    resumeScene: 'C8F',            // 全部通关后仍落点第八章野外（可自由重访）
    resumeSceneLabel: '读档后落到第八章野外',
    resumeDone: { ids: [8], label: '读档后终章进度保留' },
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
    { type: 'victory', shot: '83-final-victory', allDoneIds: [1, 4, 8], stripSpaces: true },
    { type: 'saveCheck' },
    { type: 'nextChapter', village: true, shot: '84-village' },
    { type: 'resume', shot: '85-resume-c8' },
  ],
});
