// 端到端测试（第二章）：函数之森 → 列表洞窟 → 巨蟒毕森 → 存档续玩
// 用法: node scripts/e2e-ch2.mjs（需要先 npm run dev）
// 流程与断言由 scripts/e2e/lib/runner.mjs 统一执行，本文件只声明章节差异：
// 无题池徽标断言、答 3 块祝福符文、无祝福符文数量断言、无结算统计断言。
import { runChapterE2E } from './e2e/lib/runner.mjs';

runChapterE2E({
  chapterId: 2,
  labels: {
    place: '森林',               // 碎片符文数量断言的地点词
    shard: '函数碎片',            // 碎片名
    pool: '函数题池',             // 碎片符文答题标签
    healPool: '列表题池随机题',    // 祝福符文答题标签
    topic: '列表',               // BOSS 谜题主题
    bossShort: '巨蟒',            // 命中断言的 BOSS 简称
    gateOpen: '集齐碎片后封印解开',
    shieldBroken: '答对列表谜题，巨蟒护盾破碎',
    done: '巨蟒被封印，第二章通关',
    victoryTitle: '第二章',
    next: '通关后进入第三章 · 科学计算高原',
    resumeBtn: '第3章',
    resumeScene: 'SciField',
    resumeSceneLabel: '读档后落到第三章野外',
    resumeDone: { ids: [1, 2], label: '读档后进度完整（第一、二章通关）' },
  },
  steps: [
    { type: 'newGame' },
    { type: 'gotoChapter', shot: '20-forest' },
    { type: 'collectShards' },               // 无题池徽标断言（原脚本如此）
    { type: 'sealedGate' },
    { type: 'enterLair', shot: '21-cave' },
    { type: 'bossShielded' },
    { type: 'healRunes', count: 3 },         // 答 3 块祝福符文（原脚本如此）
    { type: 'bossRune' },                    // 无 BOSS 徽标断言（原脚本如此）
    { type: 'bossFight', shot: '22-snake' },
    { type: 'victory', shot: '23-victory2' },
    { type: 'saveCheck', gateOpen: true },   // ch2 额外断言 gateOpen 已存档
    { type: 'nextChapter', shot: '23-scifield-intro' },
    { type: 'resume', newGameBtn: true, shot: '24-resume' },
  ],
});
