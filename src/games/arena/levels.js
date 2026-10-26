// ============================================================
// 向量风暴 · 关卡数据（纯数据，无 DOM；smoke / verify 直接导入）
// 每关：
//   id / title / concept / story / hints / solution（参考法术，Q 槽）/ solutionR（R 槽，可空）
//   sample      备咒台的「示例战场」：hp（int）/ dist（float，单位格）/ elite（bool）三个等长数组——
//               预览法术效果用，也送去和真 NumPy 对拍（verify.js）
//   mana        { max, regen（每秒回复）, start }
//   playerHp    竞技场里的生命（与世界爱心无关，归零 = 本关重来）
//   speed       史莱姆追击速度（px/s，玩家 1120）
//   waves       [{ groups: [{ n, hp: 数 | [min, max], elite? }], every（秒，逐个刷出；0 = 一齐涌出）, from: 'gates' | 'ring' }]
//   survive     挑战关：坚持多少秒（有它就不按「清场」判定）
//   spawnEvery  挑战关：刷怪间隔（秒），随时间缩短
//   par         金牌用时（秒）；银牌 ≤ par × 1.6；成绩 = 用时（挑战关 = 被击中次数）
// ============================================================

export const LEVELS = [
  {
    id: 'a1',
    title: '史莱姆潮',
    concept: '向量化：一句 hp -= 1 同时作用于每一个元素',
    story: '三十多只史莱姆一齐涌来——挥剑一次只能砍一个。场上每个敌人的血量都在数组 `hp` 里，对整个数组做一次减法，就是对全场施法。',
    hints: [
      '挥剑是「一个一个来」，NumPy 的数组运算是「一次作用于全部元素」（向量化）。',
      '让每个敌人的 hp 都减 1：数组减去一个数（广播），再写回 hp。原地运算写作 hp -= 1。',
    ],
    solution: 'hp -= 1',
    sample: {
      hp: [1, 1, 2, 1, 1, 1, 2, 1],
      dist: [5.2, 4.8, 6.1, 3.9, 5.5, 4.4, 6.8, 5.0],
      elite: [false, false, false, false, false, false, false, false],
    },
    mana: { max: 40, regen: 5, start: 40 },
    playerHp: 10,
    speed: 330,
    waves: [
      { groups: [{ n: 28, hp: 1 }, { n: 8, hp: 2 }], every: 0, from: 'ring' },
    ],
    par: 5,
  },
  {
    id: 'a2',
    title: '近身防卫',
    concept: '布尔掩膜：dist < 3 选出离你近的敌人',
    story: '三波敌人从四座门源源不断地冲进来。`hp -= 3` 对全场都扣 3，法力根本不够——只打离你不到 3 格的那些。`dist` 是每个敌人到你的距离（单位：格）。',
    hints: [
      '比较运算 dist < 3 会得到一个布尔数组：离你不到 3 格的位置是 True。',
      '把布尔数组放进方括号当掩膜，只改被选中的元素：hp[掩膜] -= 3。',
    ],
    solution: 'hp[dist < 3] -= 3',
    sample: {
      hp: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      dist: [1.5, 2.2, 6.0, 7.5, 2.8, 9.1, 4.0, 1.1, 8.3, 5.6],
      elite: [false, false, false, false, false, false, false, false, false, false],
    },
    mana: { max: 30, regen: 7, start: 30 },
    playerHp: 10,
    speed: 340,
    waves: [
      { groups: [{ n: 16, hp: 3 }], every: 0.3, from: 'gates' },
      { groups: [{ n: 18, hp: 3 }], every: 0.28, from: 'gates' },
      { groups: [{ n: 20, hp: 3 }], every: 0.25, from: 'gates' },
    ],
    par: 30,
  },
  {
    id: 'a3',
    title: '斩杀线',
    concept: '用 hp 自己做掩膜：hp[hp <= 2] = 0',
    story: '弱小的史莱姆里混着皮糙肉厚的大块头。对全场 `hp -= 2` 会把法力浪费在打不死的家伙身上——先把血量不超过 2 的一口气清掉，再用第二句法术对付靠近你的大块头。',
    hints: [
      '掩膜不一定来自别的数组：hp <= 2 选出的正是「残血」的那些敌人。',
      '对选中的元素直接赋值：hp[hp <= 2] = 0。法力只按真正扣掉的血量计算，所以斩杀很省。',
      'R 槽可以再写一句：hp[dist < 2] -= 4，专门对付贴脸的大块头。',
    ],
    solution: 'hp[hp <= 2] = 0',
    solutionR: 'hp[dist < 2] -= 4',
    sample: {
      hp: [1, 7, 2, 2, 8, 1, 6, 2, 1, 7],
      dist: [4.2, 1.6, 5.0, 3.3, 6.4, 2.5, 1.2, 7.7, 3.8, 5.9],
      elite: [false, false, false, false, false, false, false, false, false, false],
    },
    mana: { max: 32, regen: 5, start: 32 },
    playerHp: 12,
    speed: 320,
    waves: [
      { groups: [{ n: 16, hp: [1, 2] }, { n: 3, hp: [5, 6] }], every: 0, from: 'ring' },
      { groups: [{ n: 14, hp: [1, 2] }, { n: 4, hp: [5, 6] }], every: 0.45, from: 'gates' },
    ],
    par: 20,
  },
  {
    id: 'a4',
    title: '精英混编',
    concept: '布尔数组当掩膜：hp[elite] 与取反 hp[~elite]',
    story: '黑甲精英混在小兵里冲锋，撞上来扣 2 点生命。`elite` 是一个布尔数组（精英为 True）：可以只打精英，也可以用 `~` 取反，只清小兵。',
    hints: [
      'elite 本身就是布尔数组，直接当掩膜：hp[elite] -= 3 只打精英。',
      '~ 把 True/False 反过来：hp[~elite] -= 1 只清小兵，一点法力都不浪费在精英身上。',
    ],
    solution: 'hp[~elite] -= 1',
    solutionR: 'hp[elite] -= 3',
    sample: {
      hp: [1, 1, 6, 1, 1, 6, 1, 1, 1, 6],
      dist: [3.1, 5.4, 4.2, 2.0, 6.6, 7.9, 1.8, 4.9, 8.5, 2.7],
      elite: [false, false, true, false, false, true, false, false, false, true],
    },
    mana: { max: 30, regen: 5, start: 30 },
    playerHp: 12,
    speed: 330,
    waves: [
      { groups: [{ n: 18, hp: 1 }, { n: 3, hp: 6, elite: true }], every: 0, from: 'ring' },
      { groups: [{ n: 20, hp: 1 }, { n: 4, hp: 6, elite: true }], every: 0.4, from: 'gates' },
    ],
    par: 18,
  },
  {
    id: 'a5',
    title: '无尽潮',
    challenge: true,
    concept: '两句法术分工：近身清场 + 集火精英',
    story: '敌人没完没了，越来越密。坚持 90 秒！两句法术怎么分工、法力怎么省，全看你的掩膜写得准不准。成绩 = 被击中的次数（越少越好）。',
    hints: [
      '一句清理贴近你的敌人（dist < 3），一句集中打精英（elite）——或者你有更好的分工。',
      '两个条件同时成立用 &，每个条件都要加括号：例如 hp[(dist < 4) & elite] -= 3。',
    ],
    solution: 'hp[dist < 3] -= 3',
    solutionR: 'hp[elite] -= 3',
    sample: {
      hp: [1, 3, 2, 6, 1, 2, 3, 6, 1, 2],
      dist: [1.2, 2.6, 4.4, 3.0, 2.2, 6.1, 1.9, 7.3, 5.5, 2.8],
      elite: [false, false, false, true, false, false, false, true, false, false],
    },
    mana: { max: 40, regen: 6, start: 40 },
    playerHp: 12,
    speed: 340,
    waves: [],
    survive: 90,
    spawnEvery: 1.3,
    mix: [{ hp: [1, 2], w: 7 }, { hp: 3, w: 3 }, { hp: 6, elite: true, w: 1 }],
    par: 4,
  },
];
