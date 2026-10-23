// 端到端测试（第五章 · 加速熔炉）：全流程
// 引擎碎片 ×3 → 解开封印 → 迟缓深渊 → 破盾 → 净化迟缓巨魔 → 进入第六章
// 用法: node scripts/e2e-ch5.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 碎片/BOSS 谜题均有题池徽标断言；史莱姆 BOSS 一击 hp 9。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 5,
  labels: {
    place: '熔炉',
    lairPlace: '深渊',
    shard: '引擎碎片',
    pool: '加速',
    healPool: '祝福随机题',
    topic: '加速',
    bossShort: '巨魔',
    badge: '第五章',
    gateOpen: '集齐引擎碎片后封印解开',
    shieldBroken: '答对加速谜题，迟缓巨魔护盾破碎',
    done: '击败迟缓巨魔，第五章通关',
    victoryTitle: '第五章',
    stats: '5 / 8',
    statsLabel: '结算显示章节进度',
    next: '通关后进入第六章 · 数值方法神殿',
    resumeBtn: '第6章',
    resumeScene: 'C6F',
    resumeSceneLabel: '读档后落到第六章野外',
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '50-c5field' },
    { type: 'collectShards', badge: true },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '51-c5lair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossRune', badge: true },
    { type: 'bossFight', shot: '52-slime5' },
    { type: 'victory', shot: '53-victory5' },
    { type: 'saveCheck' },
    { type: 'nextChapter', shot: '54-c6f-intro' },
    { type: 'resume', shot: '55-resume-c6' },
  ],
});
