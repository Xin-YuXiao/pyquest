// 端到端测试（第六章 · 数值方法神殿）：全流程
// 数值碎片 ×3 → 解开封印 → 优化迷宫 → 破盾 → 制服优化牛头怪 → 进入第七章
// 用法: node scripts/e2e-ch6.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 碎片/BOSS 谜题均有题池徽标断言；蛇形 BOSS 两击断尾。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 6,
  labels: {
    place: '外庭',
    lairPlace: '迷宫',
    shard: '数值碎片',
    pool: '数值方法',
    healPool: '祝福随机题',
    topic: '数值方法',
    bossShort: '牛头怪',
    badge: '第六章',
    gateOpen: '集齐数值碎片后封印解开',
    shieldBroken: '答对数值方法谜题，优化牛头怪护盾破碎',
    done: '击败优化牛头怪，第六章通关',
    victoryTitle: '第六章',
    stats: '6 / 8',
    statsLabel: '结算显示章节进度',
    next: '通关后进入第七章 · 信号圣殿',
    resumeBtn: '第7章',
    resumeScene: 'C7F',
    resumeSceneLabel: '读档后落到第七章野外',
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '60-c6field' },
    { type: 'collectShards', badge: true },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '61-c6lair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossRune', badge: true },
    { type: 'bossFight', shot: '62-snake6' },
    { type: 'victory', shot: '63-victory6' },
    { type: 'saveCheck' },
    { type: 'nextChapter', shot: '64-c7f-intro' },
    { type: 'resume', shot: '65-resume-c7' },
  ],
});
