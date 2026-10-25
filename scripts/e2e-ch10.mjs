// 端到端测试（第十章 · 灵思之塔 · 第二部）：全流程
// 灵感碎片 ×3 → 解开封印 → 验证回廊 → 破盾 → 拆穿幻言魔像 → 进入第十一章
// 用法: node scripts/e2e-ch10.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 蛇型 BOSS 两击 hp 11/10 + 断尾 6→5 节。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 10,
  labels: {
    place: '塔底',
    lairPlace: '回廊',
    shard: '灵感碎片',
    pool: '灵思',
    healPool: '祝福随机题',
    topic: 'vibe coding',
    bossShort: '魔像',
    badge: '第十章',
    gateOpen: '集齐灵感碎片后封印解开',
    shieldBroken: '答对 vibe coding 谜题，幻言魔像护盾破碎',
    done: '拆穿幻言魔像，第十章通关',
    victoryTitle: '第十章',
    stats: '10 / 11',
    statsLabel: '结算显示章节进度（10/11）',
    next: '通关后进入第十一章 · 毕业试炼',
    resumeBtn: '第11章',
    resumeScene: 'C11F',
    resumeSceneLabel: '读档后落到第十一章野外',
    resumeDone: { ids: [10], label: '读档后第十章进度保留' },
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '100-c10field' },
    { type: 'collectShards', badge: true },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '101-c10lair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossRune', badge: true },
    { type: 'bossFight', shot: '102-snake10' },
    { type: 'victory', shot: '103-victory10' },
    { type: 'saveCheck' },
    { type: 'nextChapter', shot: '104-c11f-intro' },
    { type: 'resume', shot: '105-resume-c11' },
  ],
});
