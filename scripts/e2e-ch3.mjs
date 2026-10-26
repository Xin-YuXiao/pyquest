// 端到端测试（第三章 · 科学计算高原）：样板章全流程 + 世界地图 + 下一章抽题
// 四座 NumPy 试炼场 → 4 枚数值碎片 → 解开封印 → 混沌巢穴 → 曲线对消破盾 → 击败魔君 → 进入第四章
// 用法: node scripts/e2e-ch3.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 碎片来自试炼场（collectGames）、BOSS 护盾是曲线对消（bossGame）、答 1 块祝福符文 + 数量断言、
// 第四章抽题检查、世界地图全套检查。各试炼场的真实玩法见 scripts/e2e-game-*.mjs。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 3,
  labels: {
    place: '高原',
    lairPlace: '巢穴',            // 祝福符文数量断言的地点词
    shard: '数值碎片',
    pool: 'NumPy',
    healPool: '祝福随机题',
    topic: 'NumPy',
    bossShort: '魔君',
    badge: '第三章',              // 题池徽标断言的章名
    gateOpen: '集齐数值碎片后封印解开',
    shieldBroken: '曲线对消四层全部通过，魔君护盾破碎',
    done: '击败混沌曲线魔君，第三章通关',
    victoryTitle: '第三章',
    stats: '3 / 11',
    statsLabel: '结算显示章节进度',
    next: '进入第四章 · 星图塔平原（占位章链路通）',
    resumeBtn: '第4章',
    resumeScene: 'C4F',
    resumeSceneLabel: '读档后落到第四章野外',
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '30-scifield' },
    { type: 'collectGames' },
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '31-scilair' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 1, checkCount: true },
    { type: 'bossGame' },
    { type: 'bossFight' },                   // 史莱姆 BOSS：一击 hp 9（原脚本此处无截图）
    { type: 'victory', shot: '32-victory3' },
    { type: 'saveCheck' },
    { type: 'nextChapter', shot: '33-c4f' },
    { type: 'sampleNextRune', pool: '天文包' },
    { type: 'worldMap', stats: '3 / 11', lockedNodeId: 5, doneNodeIds: [1, 3], hereNodeId: 4, travelToId: 1, shotOpen: '35-worldmap', shotTravel: '36-worldmap-travel' },
    { type: 'resume', shot: '34-resume-c4' },
  ],
});
