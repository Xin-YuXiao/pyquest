// 端到端测试（第七章 · 信号圣殿）：全流程
// 频谱碎片 ×3 → 解开封印 → 频域回廊 → 破盾 → 驱散傅里叶魅影 → 进入第八章
// 用法: node scripts/e2e-ch7.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 碎片/BOSS 谜题均有题池徽标断言；史莱姆 BOSS 一击 hp 9。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 7,
  labels: {
    place: '平原',
    lairPlace: '回廊',
    shard: '频谱碎片',
    pool: '信号',
    healPool: '祝福随机题',
    topic: '信号',
    bossShort: '魅影',
    badge: '第七章',
    gateOpen: '集齐频谱碎片后封印解开',
    shieldBroken: '答对信号谜题，傅里叶魅影护盾破碎',
    done: '击败傅里叶魅影，第七章通关',
    victoryTitle: '第七章',
    stats: '7 / 11',
    statsLabel: '结算显示章节进度',
    next: '通关后进入第八章 · 深空晕环',
    resumeBtn: '第8章',
    resumeScene: 'C8F',
    resumeSceneLabel: '读档后落到第八章野外',
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '70-c7field' },
    { type: 'collectShards', badge: true },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '71-c7lair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossRune', badge: true },
    { type: 'bossFight', shot: '72-slime7' },
    { type: 'victory', shot: '73-victory7' },
    { type: 'saveCheck' },
    { type: 'nextChapter', shot: '74-c8f-intro' },
    { type: 'resume', shot: '75-resume-c8' },
  ],
});
