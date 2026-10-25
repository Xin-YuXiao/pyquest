// 端到端测试（第十一章 · 毕业试炼 · 全游戏终章）：全流程
// 试炼印记 ×3 → 解开封印 → 三途之门 → 破盾 → 通过三途守门人 → 全部通关 → 返回村庄
// 用法: node scripts/e2e-ch11.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 终章无下一章（结算按钮「返回村庄」→ 诺瓦村庄）、全部通关标题/统计、
// 读档后终章进度保留且落点本章野外。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 11,
  labels: {
    place: '试炼场',
    lairPlace: '三途之门',
    shard: '试炼印记',
    pool: '试炼',
    healPool: '祝福随机题',
    topic: '毕业试炼',
    bossShort: '守门人',
    badge: '第十一章',
    gateOpen: '集齐试炼印记后封印解开',
    shieldBroken: '答对毕业试炼谜题，三途守门人护盾破碎',
    done: '通过三途守门人，第十一章通关',
    victoryTitle: '全部通关',
    stats: '11 / 11',
    statsLabel: '结算显示全部章节完成',
    resumeBtn: '第11章',
    resumeScene: 'C11F',          // 全部通关后仍落点第十一章野外（可自由重访）
    resumeSceneLabel: '读档后落到第十一章野外',
    resumeDone: { ids: [11], label: '读档后终章进度保留' },
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '110-c11field' },
    { type: 'collectShards', badge: true },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '111-c11lair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossRune', badge: true },
    { type: 'bossFight', shot: '112-slime11' },
    { type: 'victory', shot: '113-final-victory', allDoneIds: [1, 4, 8, 11], stripSpaces: true },
    { type: 'saveCheck' },
    { type: 'nextChapter', village: true, shot: '114-village' },
    { type: 'resume', shot: '115-resume-c11' },
  ],
});
