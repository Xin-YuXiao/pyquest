// ============================================================
// 章节注册表：P4A@UCAS 64 学时课程 → 十一章关卡（数据驱动）
// 每章 = 野外（field：碎片符文 + 引导 NPC + 封印门）+ 巢穴（lair：BOSS）
// W1-W2 复用手工地图（村庄/地牢/森林/洞窟，已按周次重对齐题池），
// W3 为完整样板章，W4-W8 由通用生成器按主题生成；
// 第二部 W9-W11（统计圣所/灵思之塔/毕业试炼）同为通用生成器关卡。
// ============================================================

import {
  buildVillage, buildDungeon, buildForest, buildCave,
  buildField, buildLair,
} from './maps.js';

export const CHAPTERS = [
  // ------------------------------------------------------------
  // 第一章 · Week 1：变量、运算符、字符串、列表、元组、集合
  // ------------------------------------------------------------
  {
    id: 1, week: 1,
    title: '第一章 · 基础村',
    subtitle: 'Week 1 · Python 基础 I',
    shardLabel: '代码碎片',
    shardsNeeded: 5,
    fieldKey: 'Village', lairKey: 'Dungeon',
    fieldName: '诺瓦村庄', lairName: '数据地牢',
    buildField: buildVillage, buildLair: buildDungeon,
    boss: 'slime', bossName: '数据史莱姆王',
    npcKind: 'elder', npcName: '长老 賽璐',
    pools: { shard: 'w1field', heal: 'w1lair', lair: 'w1lair', boss: 'w1boss' },
    // 引导台词：按章内阶段查表（core/phase.js）；跨章问候走 extraGreets
    extraGreets: (G) => {
      if (G.progress[11] && G.progress[11].done) {
        return [
          '从变量到毕业试炼……第一部与第二部的旅程你已全部走完！',
          '这片大陆的每一块符文石都记得你的名字，勇者。',
        ];
      }
      if (G.progress[2].done) {
        return [
          '函数、控制流……连巨蟒毕森都被你封印了！',
          '东侧的传送门通往科学计算高原——那里的一切由 NumPy 驱动。',
        ];
      }
      return null;
    },
    npcLines: {
      new: ({ cp }) => [
        '欢迎来到诺瓦村庄，勇者！这片大陆的魔法，全靠「Python 咒语」驱动。',
        '用【方向键】或【WASD】移动，按【J】或【空格】挥剑，靠近发光的东西按【E】互动。',
        '村庄里散落着 5 块符文石，答对它们提出的 Python 问题，就能获得代码碎片。',
        `集齐 ${cp.shardsNeeded} 枚碎片，北边的石门就会打开。地牢深处住着数据史莱姆王……去吧！`,
      ],
      collecting: ({ cp }) => [
        `干得漂亮！已经拿到 ${cp.shards} / ${cp.shardsNeeded} 枚碎片了。`,
        '村庄里共有 5 块符文石，东边、池塘边和东北角还有没解读的。',
      ],
      ready: ({ cp }) => [
        `你已经收集了 ${cp.shards} 枚代码碎片！`,
        '去北边的石门那里吧，门会为你打开。',
        '地牢深处的符文石记载着列表与元组的咒语，读懂它们再挑战史莱姆王！',
      ],
      open: [
        '地牢就在北边。里面的符文石会教你列表、元组和集合的用法。',
        '数据史莱姆王的护盾，只有答对「数据结构」的谜题才能打破。',
        '记住：生命值见底时回村喘口气，被我打败的史莱姆还会再出现。',
      ],
      done: [
        '恭喜你击败了数据史莱姆王！',
        '村庄东边的传送门已经开启——穿过它，进入「函数之森」。',
        '森林的石碑会告诉你 def、参数和 return 的奥秘。',
      ],
    },
    victory: {
      title: '🎉 第一章 完成！',
      text: '你击败了数据史莱姆王，<br />掌握了变量、运算符、字符串、列表与元组的基础咒语！',
      next: '▶ 进入第二章 · 函数之森',
    },
  },

  // ------------------------------------------------------------
  // 第二章 · Week 2：字典、控制流（条件/循环/异常）、函数
  // ------------------------------------------------------------
  {
    id: 2, week: 2,
    title: '第二章 · 函数之森',
    subtitle: 'Week 2 · Python 基础 II',
    shardLabel: '函数碎片',
    shardsNeeded: 5,
    fieldKey: 'Forest', lairKey: 'Cave',
    fieldName: '函数之森', lairName: '控制流洞窟',
    buildField: buildForest, buildLair: buildCave,
    boss: 'snake', bossName: '巨蟒毕森',
    npcKind: 'tablet', npcName: '函数石碑',
    pools: { shard: 'w2field', heal: 'w2heal', lair: 'w2lair', boss: 'w2boss' },
    // 引导台词：按章内阶段查表（core/phase.js）；门开后无专属词条，
    // 回退沿用收集进度台词（与原 if-梯子行为一致）
    extraGreets: (G) => {
      if (G.progress[11] && G.progress[11].done) {
        return ['石碑上的符文已全部亮起——你完成了整段旅程。'];
      }
      if (G.progress[3] && G.progress[3].done) {
        return ['混沌曲线魔君也败在你手下……东边的传送门通往天文包星图塔。'];
      }
      return null;
    },
    npcLines: {
      new: ({ cp }) => [
        '旅行者……我是函数之森的引导石碑。',
        '「函数」是可以反复念的咒语卷轴：用 def 定义它，用参数传递材料，用 return 回传宝物。',
        '森林里发光的符文石在等你。答对它们的问题，就能收集函数碎片。',
        `集齐 ${cp.shardsNeeded} 枚碎片，北方的洞窟封印就会打开。那里……有什么东西在蠕动。`,
      ],
      collecting: ({ cp }) => [
        `已经拿到 ${cp.shards} / ${cp.shardsNeeded} 枚函数碎片了，加油。`,
        '森林里的符文石在湖畔、东部林地和南边林间，仔细找找。',
      ],
      ready: ({ cp }) => [
        `你已收集了 ${cp.shards} 枚函数碎片！`,
        '北方的封印已经松动，去洞窟之门那里吧。',
        '洞窟深处盘踞着巨蟒毕森——先解开控制流的谜题，再挑战它！',
      ],
      done: [
        '巨蟒毕森被封印了……你用函数与控制流的知识看穿了一切。',
        '森林恢复了平静。东侧的传送门通往「科学计算高原」。',
      ],
    },
    victory: {
      title: '👑 第二章 完成！',
      text: '你封印了巨蟒「毕森」，<br />函数、字典与控制流的咒语也已尽收囊中！',
      next: '▶ 进入第三章 · 科学计算高原',
    },
  },

  // ------------------------------------------------------------
  // 第三章 · Week 3：NumPy / SciPy / Matplotlib 科学计算（样板章）
  // ------------------------------------------------------------
  {
    id: 3, week: 3,
    title: '第三章 · 科学计算高原',
    subtitle: 'Week 3 · Scientific Computing',
    shardLabel: '数值碎片',
    shardsNeeded: 5,
    fieldKey: 'SciField', lairKey: 'SciLair',
    fieldName: '科学计算高原', lairName: '混沌巢穴',
    buildField: buildField, buildLair: buildLair,
    boss: 'slime', bossName: '混沌曲线魔君',
    npcKind: 'tablet', npcName: '科学石碑',
    pools: { shard: 'w3shard', heal: 'w3heal', lair: 'w3heal', boss: 'w3boss' },
    theme: {
      palette: 'grass', seed: 20260301, w: 34, h: 26,
      healRunes: 2, slimeVariant: 'red', slimes: 5,
      lairHealRunes: 3, lairAmbient: 0x1a1430,
    },
    extraGreets: (G) => {
      if (G.progress[11] && G.progress[11].done) {
        return ['高原的风依旧——而你已把整门课程装进了行囊。'];
      }
      return null;
    },
    npcLines: {
      new: ({ cp }) => [
        '旅行者……欢迎来到科学计算高原。这里的魔法由 NumPy 驱动。',
        '「ndarray」是装满同种材料的魔法方阵：一次施法（向量化），整列数据同时变化，比 for 循环快上百倍。',
        '高原上的符文石记载着数组、索引、广播与绘图的咒语——答对它们，收集数值碎片。',
        `集齐 ${cp.shardsNeeded} 枚碎片，北方的混沌巢穴封印就会打开。魔君的护盾，唯有 NumPy 的真谛可以击碎。`,
      ],
      collecting: ({ cp }) => [
        `已收集 ${cp.shards} / ${cp.shardsNeeded} 枚数值碎片。`,
        '提示：NumPy 数组的索引和切片规则，与列表一脉相承。',
      ],
      ready: ['数值碎片已集齐！北方的巢穴封印正在瓦解……'],
      done: ['混沌曲线魔君已被你击败！东侧传送门通往「天文包星图塔」。'],
    },
    victory: {
      title: '⚡ 第三章 完成！',
      text: '你击败了混沌曲线魔君，<br />NumPy / SciPy / Matplotlib 的科学计算之门已为你敞开！',
      next: '▶ 进入第四章 · 天文包星图塔',
    },
  },

  // ------------------------------------------------------------
  // 第四章 · Week 4：FITS / Astropy / Healpy / EMCEE / Sklearn
  // ------------------------------------------------------------
  {
    id: 4, week: 4,
    title: '第四章 · 天文包星图塔',
    subtitle: 'Week 4 · Packages for Astronomy',
    shardLabel: '星图碎片',
    shardsNeeded: 3,
    fieldKey: 'C4F', lairKey: 'C4L',
    fieldName: '星图塔平原', lairName: 'FITS 神殿',
    buildField, buildLair,
    boss: 'snake', bossName: '单位术士',
    npcKind: 'tablet', npcName: '星图石碑',
    pools: { shard: 'w4shard', heal: 'w4lair', lair: 'w4lair', boss: 'w4boss' },
    theme: {
      palette: 'grass', seed: 20260401, w: 32, h: 24,
      healRunes: 2, slimeVariant: 'crimson', slimes: 5,
      lairHealRunes: 3, lairAmbient: 0x0f1a26,
    },
    npcLines: {
      new: ({ cp }) => [
        '这里是星图塔平原——天文学家的大本营。',
        '天文数据住在 FITS 文件里：头文件（header）记录坐标与单位，数据体记录星光的数值。',
        'Astropy 赋予你单位（Quantity）、坐标（SkyCoord）与时间（Time）的咒语。',
        `收集 ${cp.shardsNeeded} 枚星图碎片，解开封印，制服盘踞在 FITS 神殿的单位术士。`,
      ],
      collecting: ({ cp }) => [`已收集 ${cp.shards} / ${cp.shardsNeeded} 枚星图碎片。FITS 文件的头文件里藏着天文数据的坐标与单位。`],
      ready: ['星图碎片集齐了！北方的 FITS 神殿之门正在开启……'],
      done: ['单位术士已被制服！东侧传送门通往「加速熔炉」。'],
    },
    victory: {
      title: '🔭 第四章 完成！',
      text: '你制服了单位术士，<br />FITS 文件与 Astropy 天文数据咒语已收入囊中！',
      next: '▶ 进入第五章 · 加速熔炉',
    },
  },

  // ------------------------------------------------------------
  // 第五章 · Week 5：代码加速（numba / cython / 并行）
  // ------------------------------------------------------------
  {
    id: 5, week: 5,
    title: '第五章 · 加速熔炉',
    subtitle: 'Week 5 · Speed up Your Code',
    shardLabel: '引擎碎片',
    shardsNeeded: 3,
    fieldKey: 'C5F', lairKey: 'C5L',
    fieldName: '加速熔炉', lairName: '迟缓深渊',
    buildField, buildLair,
    boss: 'slime', bossName: '迟缓巨魔',
    npcKind: 'tablet', npcName: '熔炉石碑',
    pools: { shard: 'w5shard', heal: 'w5lair', lair: 'w5lair', boss: 'w5boss' },
    theme: {
      palette: 'dungeon', seed: 20260501, w: 30, h: 24,
      healRunes: 2, slimeVariant: 'crimson', slimes: 4,
      lairHealRunes: 3, lairAmbient: 0x26160e,
    },
    npcLines: {
      new: ({ cp }) => [
        '轰鸣的熔炉之下，时间就是算力。',
        '加速的第一咒语是「向量化」：能用 NumPy 就不用 for 循环。',
        '第二咒语是 numba 的 @jit：让 Python 咒语即时编译成机器语言。',
        `收集 ${cp.shardsNeeded} 枚引擎碎片，唤醒熔炉，把迟缓巨魔赶出深渊。`,
      ],
      collecting: ({ cp }) => [`已收集 ${cp.shards} / ${cp.shardsNeeded} 枚引擎碎片。记住 KISS 法则：先写对，再写快。`],
      ready: ['引擎碎片集齐！北方深渊的封印正在瓦解……'],
      done: ['迟缓巨魔已被熔炉之火净化！东侧传送门通往「数值方法神殿」。'],
    },
    victory: {
      title: '🔥 第五章 完成！',
      text: '迟缓巨魔臣服于你，<br />向量化、即时编译与并行的加速秘诀已刻入卷轴！',
      next: '▶ 进入第六章 · 数值方法神殿',
    },
  },

  // ------------------------------------------------------------
  // 第六章 · Week 6：数值方法（积分/ODE/优化/拟合/插值）
  // ------------------------------------------------------------
  {
    id: 6, week: 6,
    title: '第六章 · 数值方法神殿',
    subtitle: 'Week 6 · Numerical Methods I',
    shardLabel: '数值碎片',
    shardsNeeded: 3,
    fieldKey: 'C6F', lairKey: 'C6L',
    fieldName: '数值神殿外庭', lairName: '优化迷宫',
    buildField, buildLair,
    boss: 'snake', bossName: '优化牛头怪',
    npcKind: 'tablet', npcName: '神殿石碑',
    pools: { shard: 'w6shard', heal: 'w6lair', lair: 'w6lair', boss: 'w6boss' },
    theme: {
      palette: 'dungeon', seed: 20260601, w: 30, h: 24,
      healRunes: 2, slimeVariant: 'crimson', slimes: 4,
      lairHealRunes: 3, lairAmbient: 0x101a12,
    },
    npcLines: {
      new: ({ cp }) => [
        '这里是数值方法神殿——科学问题在此化作数字。',
        'scipy 的咒语包罗万象：quad 积分、solve_ivp 解微分方程、curve_fit 拟合曲线、brentq 求根。',
        '彗星的轨道、恒星的光变——世间万物皆可化作方程。',
        `收集 ${cp.shardsNeeded} 枚数值碎片，走进优化迷宫，解开牛头怪的谜题。`,
      ],
      collecting: ({ cp }) => [`已收集 ${cp.shards} / ${cp.shardsNeeded} 枚数值碎片。curve_fit 的本质：让模型曲线尽量贴近数据点。`],
      ready: ['碎片集齐！优化迷宫的大门正在开启……'],
      done: ['优化牛头怪已低头！东侧传送门通往「信号圣殿」。'],
    },
    victory: {
      title: '🧮 第六章 完成！',
      text: '优化迷宫被你解开，<br />积分、微分方程与曲线拟合的数值咒语全部到手！',
      next: '▶ 进入第七章 · 信号圣殿',
    },
  },

  // ------------------------------------------------------------
  // 第七章 · Week 7：线性代数 / FFT / 卷积 / 统计 / 机器学习
  // ------------------------------------------------------------
  {
    id: 7, week: 7,
    title: '第七章 · 信号圣殿',
    subtitle: 'Week 7 · Numerical Methods II & ML',
    shardLabel: '频谱碎片',
    shardsNeeded: 3,
    fieldKey: 'C7F', lairKey: 'C7L',
    fieldName: '信号圣殿平原', lairName: '频域回廊',
    buildField, buildLair,
    boss: 'slime', bossName: '傅里叶魅影',
    npcKind: 'tablet', npcName: '信号石碑',
    pools: { shard: 'w7shard', heal: 'w7lair', lair: 'w7lair', boss: 'w7boss' },
    theme: {
      palette: 'grass', seed: 20270701, w: 32, h: 24,
      healRunes: 2, slimeVariant: 'crimson', slimes: 5,
      lairHealRunes: 3, lairAmbient: 0x141026,
    },
    npcLines: {
      new: ({ cp }) => [
        '这里是信号圣殿——时间与频率在此互换。',
        'np.linalg 掌管矩阵的特征值与协方差；np.fft 把时域信号拆解成频率的分量。',
        '卷积是望远镜的瞳孔，相关函数是星系的指纹；机器学习则让数据自己开口说话。',
        `收集 ${cp.shardsNeeded} 枚频谱碎片，进入频域回廊，直面傅里叶魅影。`,
      ],
      collecting: ({ cp }) => [`已收集 ${cp.shards} / ${cp.shardsNeeded} 枚频谱碎片。任何信号都是不同频率正弦波的叠加。`],
      ready: ['频谱碎片集齐！频域回廊的封印正在瓦解……'],
      done: ['傅里叶魅影已消散！东侧传送门通往「深空晕环」。'],
    },
    victory: {
      title: '📡 第七章 完成！',
      text: '傅里叶魅影消散于<br />线性代数与频域的光辉之下！',
      next: '▶ 进入第八章 · 深空晕环',
    },
  },

  // ------------------------------------------------------------
  // 第八章 · Week 8：宇宙学 N-body 与暗物质晕 NFW 轮廓（第一部终章）
  // ------------------------------------------------------------
  {
    id: 8, week: 8,
    title: '第八章 · 深空晕环',
    subtitle: 'Week 8 · Dark Matter Halo',
    shardLabel: '暗物质碎片',
    shardsNeeded: 3,
    fieldKey: 'C8F', lairKey: 'C8L',
    fieldName: '深空晕环', lairName: '暗物质核心',
    buildField, buildLair,
    boss: 'snake', bossName: 'NFW 幻龙',
    npcKind: 'tablet', npcName: '深空石碑',
    pools: { shard: 'w8shard', heal: 'w8lair', lair: 'w8lair', boss: 'w8boss' },
    theme: {
      palette: 'dungeon', seed: 20280801, w: 32, h: 24,
      healRunes: 2, slimeVariant: 'crimson', slimes: 4,
      lairHealRunes: 3, lairAmbient: 0x0a0a1e,
    },
    npcLines: {
      new: ({ cp }) => [
        '欢迎来到宇宙的尽头——暗物质晕的深处。',
        '引力把万亿粒子聚成晕；NFW 轮廓刻画着它们的密度分布。',
        '在半径 r 处把密度积分到 200 倍临界密度，就得到晕的质量；用 curve_fit 拟合模拟数据，便能看到暗物质的真容。',
        `收集 ${cp.shardsNeeded} 枚暗物质碎片，进入核心，直面 NFW 幻龙！`,
      ],
      collecting: ({ cp }) => [`已收集 ${cp.shards} / ${cp.shardsNeeded} 枚暗物质碎片。NFW 轮廓：ρ(r) ∝ 1 / [r(1+r/rs)²]。`],
      ready: ['暗物质碎片集齐！核心之门正在开启……幻龙在等你。'],
      done: ['NFW 幻龙已被封印。第一部的旅程到此圆满——但传说，深空之后还有「第二部」的大陆。'],
    },
    victory: {
      title: '🌌 第八章 完成！',
      text: '你击败了 NFW 幻龙，测出了暗物质晕的密度轮廓！<br />第一部「八周课程」圆满！<br />深空的尽头，第二部的大陆正在浮现……',
      next: '▶ 进入第九章 · 统计圣所（第二部）',
    },
  },

  // ------------------------------------------------------------
  // 第九章 · Part II：天文学中的统计学基础（到 MCMC 后验分布为止）
  // 与 W8 的分工：本章讲「为什么」（原理），W8 emcee 题讲「怎么用」（应用）
  // ------------------------------------------------------------
  {
    id: 9, week: 9,
    title: '第九章 · 统计圣所',
    subtitle: 'Part II · Statistics for Astronomy',
    shardLabel: '证据碎片',
    shardsNeeded: 3,
    fieldKey: 'C9F', lairKey: 'C9L',
    fieldName: '圣所外庭', lairName: '后验回廊',
    buildField, buildLair,
    boss: 'slime', bossName: '贝叶斯祭司',
    npcKind: 'tablet', npcName: '统计石碑',
    pools: { shard: 'w9shard', heal: 'w9lair', lair: 'w9lair', boss: 'w9boss' },
    theme: {
      palette: 'grass', seed: 20260901, w: 32, h: 24,
      healRunes: 2, slimeVariant: 'crimson', slimes: 4,
      lairHealRunes: 3, lairAmbient: 0x0f2420,
    },
    npcLines: {
      new: ({ cp }) => [
        '第二部的大陆欢迎你——这里是统计圣所，一切测量的良心。',
        '没有误差的数字只是传闻：泊松涨落、误差传播、置信区间，才是观测的舌头。',
        '似然与先验在祭坛上结合，产出后验；χ² 与 AIC 在回廊里审判模型。',
        `收集 ${cp.shardsNeeded} 枚证据碎片，深入后验回廊，直面贝叶斯祭司。`,
      ],
      collecting: ({ cp }) => [`已收集 ${cp.shards} / ${cp.shardsNeeded} 枚证据碎片。计数涨落 σ=√N：1000 个光子计数也有 ±31.6 的呼吸。`],
      ready: ['证据碎片集齐！后验回廊的封印正在瓦解……'],
      done: ['贝叶斯祭司已俯首！东侧传送门通往第二部的「灵思之塔」。'],
    },
    victory: {
      title: '📊 第九章 完成！',
      text: '你说服了贝叶斯祭司，<br />误差传播、似然、假设检验与 MCMC 诊断的圣所之钥已入手！',
      next: '▶ 进入第十章 · 灵思之塔',
    },
  },

  // ------------------------------------------------------------
  // 第十章 · Part II：Vibe Coding 工具方法论（正确性验证 workflow 为成体系考点）
  // ------------------------------------------------------------
  {
    id: 10, week: 10,
    title: '第十章 · 灵思之塔',
    subtitle: 'Part II · Vibe Coding',
    shardLabel: '灵感碎片',
    shardsNeeded: 3,
    fieldKey: 'C10F', lairKey: 'C10L',
    fieldName: '灵思之塔底层', lairName: '验证回廊',
    buildField, buildLair,
    boss: 'snake', bossName: '幻言魔像',
    npcKind: 'tablet', npcName: '灵思石碑',
    pools: { shard: 'w10shard', heal: 'w10lair', lair: 'w10lair', boss: 'w10boss' },
    theme: {
      palette: 'dungeon', seed: 20261001, w: 30, h: 24,
      healRunes: 2, slimeVariant: 'crimson', slimes: 4,
      lairHealRunes: 3, lairAmbient: 0x1f1030,
    },
    npcLines: {
      new: ({ cp }) => [
        '灵思之塔——与 AI 对话就能筑起代码之塔的地方。',
        '但塔砖会撒谎：AI 按统计规律生成「看起来对」的代码，幻觉藏在常数与 API 名里。',
        '塔的守护法则是「先验证、再信任」：测试先行、小步迭代、回归检查。',
        `收集 ${cp.shardsNeeded} 枚灵感碎片，登上验证回廊，看穿幻言魔像的每一句花言巧语。`,
      ],
      collecting: ({ cp }) => [`已收集 ${cp.shards} / ${cp.shardsNeeded} 枚灵感碎片。口诀：需求说清楚、测试先写好、一次只生成一小步。`],
      ready: ['灵感碎片集齐！验证回廊的大门正在开启……'],
      done: ['幻言魔像已被拆穿！塔顶的传送门通往最后的「毕业试炼」。'],
    },
    victory: {
      title: '🪄 第十章 完成！',
      text: '你看穿了幻言魔像的每一句幻觉，<br />vibe coding 的验证法则——测试先行、小步迭代、回归检查——已刻上塔壁！',
      next: '▶ 进入第十一章 · 毕业试炼',
    },
  },

  // ------------------------------------------------------------
  // 第十一章 · Part II：Project-driven Study 毕业试炼（全课程终章）
  // 三类标准 workflow：数据拟合（Project-2/4）/ 模拟（Project-1/3）/ 机器学习（Project-5/6/7）
  // ------------------------------------------------------------
  {
    id: 11, week: 11,
    title: '第十一章 · 毕业试炼',
    subtitle: 'Part II · Project-driven Study',
    shardLabel: '试炼印记',
    shardsNeeded: 3,
    fieldKey: 'C11F', lairKey: 'C11L',
    fieldName: '毕业试炼场', lairName: '三途之门',
    buildField, buildLair,
    boss: 'slime', bossName: '三途守门人',
    npcKind: 'tablet', npcName: '试炼石碑',
    pools: { shard: 'w11shard', heal: 'w11lair', lair: 'w11lair', boss: 'w11boss' },
    final: true,
    theme: {
      palette: 'dungeon', seed: 20261101, w: 32, h: 24,
      healRunes: 2, slimeVariant: 'crimson', slimes: 4,
      lairHealRunes: 3, lairAmbient: 0x241a08,
    },
    npcLines: {
      new: ({ cp }) => [
        '毕业试炼场——三个方向的守门人在三途之门后等你。',
        '数据拟合之途：建模 → 拟合 → 参数 → 不确定度；模拟之途：物理模型 → 模拟 → 观测效应 → 分析。',
        '机器学习之途：数据 → 特征 → 训练 → 评估 → 泛化。三途同源：选题 → 文献 → 数据 → 分析 → 验证 → 报告。',
        `收集 ${cp.shardsNeeded} 枚试炼印记，推开三途之门，通过最后的守门人！`,
      ],
      collecting: ({ cp }) => [`已收集 ${cp.shards} / ${cp.shardsNeeded} 枚试炼印记。记住：没有不确定度的参数、没有泛化的模型，都过不了守门人的眼。`],
      ready: ['试炼印记集齐！三途之门正在开启……'],
      done: ['三途守门人已向你低头。全部课程，至此圆满。'],
    },
    victory: {
      title: '🎓 全 部 通 关 ！',
      text: '你通过了三途守门人的毕业试炼！<br />从变量到宇宙学，从统计到 vibe coding——<br />64 学时的完整旅程，你已是独当一面的 Python 天文勇者！',
      next: '返回村庄 · 自由探索',
    },
  },
];

// ------------------------------------------------------------
// 附加相邻章节信息（地图传送门接线用；避免 maps→chapters 循环依赖）
// ------------------------------------------------------------
CHAPTERS.forEach((ch, i) => {
  ch.nextKey = i < CHAPTERS.length - 1 ? CHAPTERS[i + 1].fieldKey : null;
  ch.prevKey = i > 0 ? CHAPTERS[i - 1].fieldKey : null;
});

export function getChapter(id) {
  return CHAPTERS.find((c) => c.id === id) || CHAPTERS[0];
}
