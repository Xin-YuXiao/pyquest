// 端到端测试（第四章 · 天文包星图塔）：全流程
// 星图碎片 ×3 → 解开封印 → FITS 神殿 → 破盾 → 制服单位术士 → 进入第五章
// 用法: node scripts/e2e-ch4.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 碎片/BOSS 谜题均有题池徽标断言；蛇形 BOSS 两击断尾。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 4,
  labels: {
    place: '平原',
    lairPlace: '神殿',
    shard: '星图碎片',
    pool: '天文包',
    healPool: '祝福随机题',
    topic: '天文包',
    bossShort: '术士',
    badge: '第四章',
    gateOpen: '集齐星图碎片后封印解开',
    shieldBroken: '答对天文包谜题，单位术士护盾破碎',
    done: '击败单位术士，第四章通关',
    victoryTitle: '第四章',
    stats: '4 / 11',
    statsLabel: '结算显示章节进度',
    next: '通关后进入第五章 · 加速熔炉',
    resumeBtn: '第5章',
    resumeScene: 'C5F',
    resumeSceneLabel: '读档后落到第五章野外',
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '40-c4field' },
    { type: 'collectShards', badge: true },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '41-c4lair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossRune', badge: true },
    { type: 'bossFight', shot: '42-snake4' },
    { type: 'victory', shot: '43-victory4' },
    { type: 'saveCheck' },
    { type: 'nextChapter', shot: '44-c5f-intro' },
    { type: 'resume', shot: '45-resume-c5' },
  ],
});
