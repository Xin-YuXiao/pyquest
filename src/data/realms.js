// ============================================================
// Project 秘境注册表：课程八个 Project 的通关后隐藏关卡（纯数据，无 Phaser 依赖）
// upstream 路线图原名「毕业试炼」隐藏关卡；为避免与第十一章「毕业试炼」撞名，
// 对玩家统一叫「Project 秘境」（规格见 .scratch/graduation-trials/spec.md）。
//
// 与章节注册表 CHAPTERS 平行、互不混用：CHAPTERS.length 在结算页 / 世界地图 /
// HUD / E2E 里都表示「总章数 11」，秘境不进入其中。
//
// 每个秘境 = 外庭（前 5 步课题符文）+ 圣所（第 6 步「报告」= BOSS 符文 + 秘境 BOSS）。
// 课题链固定六步：选题 → 文献 → 数据 → 分析 → 验证 → 报告，必须按序解锁。
//
// 题目来源（ADR-0001）：每块课题符文只引用题库里已有的题（已对齐讲义，多数经
// verify-quiz 实跑校验），不新增、不改写任何题面；每一步选这道题的理由写在注释里。
// 秘境里允许出现主线答过的题——同一知识点隔一段时间换个情境再答，正是间隔复习。
// ============================================================

/** 课题链的六步（顺序即解锁顺序） */
export const REALM_STEPS = ['选题', '文献', '数据', '分析', '验证', '报告'];

/** 秘境之门的开启条件：第一部（第八章）通关 */
export const REALM_UNLOCK_CHAPTER = 8;

/** 秘境之门是否已开启（传送门 / 封印门的 requires 谓词，也供 HUD / 世界地图 / 测试接缝复用） */
export function realmsUnlocked(g) {
  const p = g && g.progress && g.progress[REALM_UNLOCK_CHAPTER];
  return !!(p && p.done);
}

/** 秘境大厅（诺瓦村庄「秘境之门」之后，四扇课题之门） */
export const REALM_HALL = { key: 'RealmHall', name: '秘境大厅' };

export const REALMS = [
  // ------------------------------------------------------------
  // Project-4 · 重建暗物质晕密度轮廓（emcee 拟合 NFW）——与第八章直接相关
  // ------------------------------------------------------------
  {
    id: 'p4',
    project: 'Project-4',
    title: '暗晕重建',
    en: 'Reconstructing Dark Matter Halo Density Profile',
    fieldKey: 'Realm4', lairKey: 'Realm4Core',
    fieldName: '暗晕前哨', lairName: '暗晕之心',
    badge: '暗晕徽章',
    music: 'deepspace',
    theme: { palette: 'dungeon', seed: 20270401, w: 30, h: 20, ambient: 0x120e22, lairAmbient: 0x0e0a1c, slimes: 3, slimeVariant: 'crimson' },
    observatory: 'nfw', // 外庭放一座 NFW 拟合台（复用第八章观测台，观测日志共用）
    boss: 'snake', bossName: '暗晕吞噬者',
    bossMechanic: {
      kind: 'nfwGravity', name: '暗晕引力',
      tip: '吞噬者的暗物质晕把你往核心拉：离核心越近引力越强（NFW 内陡外缓）——保持移动，绕着它打！',
    },
    intro: [
      'Project-4：用 N-body 模拟的粒子重建暗物质晕的密度轮廓，再用 emcee 拟合 NFW 参数。',
      '六块课题符文按科研顺序排开：选题 → 文献 → 数据 → 分析 → 验证 → 报告，前一步解开下一步才会亮。',
      '外庭东边有一座 NFW 拟合台，先亲手调一调 ρ₀ 与 Rₛ，再去圣所向「暗晕吞噬者」汇报你的结果。',
    ],
    steps: [
      // 选题 · dm1（W8）：课题要重建的物理量就是「晕的密度随半径的分布」——先把研究对象说清楚
      { qid: 'dm1', task: '确定研究对象：暗物质晕的密度轮廓' },
      // 文献 · dm15（W8）：NFW 轮廓的出处——在宇宙学 N-body 模拟里发现的普适形状，是课题的理论起点
      { qid: 'dm15', task: '读文献：NFW 轮廓从何而来' },
      // 数据 · dm16（W8）：Project-4 先用 interp1d 反转累积质量 CDF，逆变换采样造出模拟粒子
      { qid: 'dm16', task: '造数据：逆变换采样生成模拟粒子' },
      // 分析 · dm14（W8）：讲义里 Project-4 的衔接招式——先 minimize 找 ML 解，再在其附近撒 walkers 跑 emcee
      { qid: 'dm14', task: '做分析：ML 起点 + emcee 采样' },
      // 验证 · pj18（W11 BOSS）：密度轮廓与累积质量双轨拟合互为对照，一致才说明结论对分箱稳健
      { qid: 'pj18', task: '做验证：密度与质量双轨对照' },
      // 报告 · st17（W9，BOSS 符文）：用 16/50/84 分位报告「中位数 ± 1σ」——参数必须带不确定度
      { qid: 'st17', task: '写报告：参数 + 不确定度' },
    ],
    victory: {
      title: '🌌 课题封印 · 暗晕重建',
      text: '你从模拟粒子出发，用 emcee 重建了暗物质晕的 NFW 轮廓，<br />并用双轨拟合守住了结论——暗晕徽章到手！',
      next: '返回秘境大厅',
    },
  },

  // ------------------------------------------------------------
  // Project-1 · 为 CSST 模拟双爱因斯坦环（模拟类：物理模型 → 模拟 → 观测效应 → 分析）
  // ------------------------------------------------------------
  {
    id: 'p1',
    project: 'Project-1',
    title: '双爱因斯坦环',
    en: 'Simulating Double Einstein Rings for CSST',
    fieldKey: 'Realm1', lairKey: 'Realm1Core',
    fieldName: '透镜花园', lairName: '双环之镜',
    badge: '双环徽章',
    music: 'signal',
    theme: { palette: 'grass', seed: 20270101, w: 30, h: 20, slimes: 3, slimeVariant: 'crimson', lairAmbient: 0x16122c },
    boss: 'slime', bossName: '双环守望者',
    bossMechanic: {
      kind: 'fourierEchoes', name: '多重像分身',
      tip: '强透镜把守望者成了三个像，各以不同频率闪烁：按频率从低到高（先打闪得最慢的）逐个击破，真身才会现形！',
    },
    intro: [
      'Project-1：为中国空间站望远镜（CSST）模拟双爱因斯坦环——这是一个「模拟类」课题。',
      '模拟类的链条是：物理模型 → 模拟 → 观测效应（PSF、噪声）→ 分析；少了观测效应，模拟就没法和真实数据比。',
      '按顺序解开五块课题符文，再去「双环之镜」向守望者汇报。',
    ],
    steps: [
      // 选题 · pj3（W11）：先判断课题属于哪一类、数据从哪来——模拟类的数据由物理模型自己生成
      { qid: 'pj3', task: '定类型：模拟类课题的数据从哪来' },
      // 文献 · sg4（W7）：模拟「真实观测」的物理背景——望远镜把星光涂抹成 PSF 斑，数学上就是卷积
      { qid: 'sg4', task: '读背景：PSF 涂抹 = 卷积' },
      // 数据 · ap13（W4）：模拟出的图像与星表要存成 FITS，先弄清三类 HDU 各装什么
      { qid: 'ap13', task: '存数据：FITS 的三类 HDU' },
      // 分析 · pj13（W11，可执行）：点源经 3×3 均匀 PSF 卷积后的像素值——亲手算一遍观测效应
      { qid: 'pj13', task: '做模拟：点源 ⊗ PSF' },
      // 验证 · pj17（W11）：先在退化情形上对答案（零透镜质量时像必须还原源像）
      { qid: 'pj17', task: '做验证：解析极限 sanity check' },
      // 报告 · pj5（W11，BOSS 符文）：把整条模拟链讲清楚——观测效应这一环为什么不能省
      { qid: 'pj5', task: '写报告：完整的模拟链条' },
    ],
    victory: {
      title: '💍 课题封印 · 双爱因斯坦环',
      text: '你的模拟穿过了 PSF 与解析极限的检验，<br />双环守望者认可了你的观测预言——双环徽章到手！',
      next: '返回秘境大厅',
    },
  },

  // ------------------------------------------------------------
  // Project-2 · 星系-星系强透镜系统建模（拟合类：建模 → 拟合 → 参数 → 不确定度）
  // ------------------------------------------------------------
  {
    id: 'p2',
    project: 'Project-2',
    title: '透镜建模',
    en: 'Modeling Galaxy-Galaxy Strong Lensing System',
    fieldKey: 'Realm2', lairKey: 'Realm2Core',
    fieldName: '残差迷宫', lairName: '模型审判庭',
    badge: '建模徽章',
    music: 'temple',
    theme: { palette: 'dungeon', seed: 20270201, w: 30, h: 20, ambient: 0x1d1630, lairAmbient: 0x170f28, slimes: 3, slimeVariant: 'crimson' },
    boss: 'snake', bossName: '残差巨蟒',
    bossMechanic: {
      kind: 'gradientCharge', name: '梯度冲锋',
      tip: '残差巨蟒按梯度下降朝你冲锋，学习率一次比一次小；步子太大冲过头撞墙就会眩晕——引它撞墙再集火！',
    },
    intro: [
      'Project-2：给一个星系-星系强透镜系统建模——这是一个「拟合类」课题。',
      '拟合类的链条是：建模 → 拟合 → 参数 → 不确定度；残差图和模型比较会告诉你模型是不是真的对。',
      '按顺序解开五块课题符文，再去「模型审判庭」接受残差巨蟒的审判。',
    ],
    steps: [
      // 选题 · pj4（W11）：拟合类课题的完整流程链——缺了不确定度这一环，结果就不完整
      { qid: 'pj4', task: '定路线：拟合类课题的完整链条' },
      // 文献 · nm14（W6）：拟合的理论基础——极大似然在数值上就是最小化负对数似然
      { qid: 'nm14', task: '读理论：MLE 与负对数似然' },
      // 数据 · ap9（W4，填空）：从透镜星表里用布尔掩膜挑出成双像（NIMG == 2）的系统作为样本
      { qid: 'ap9', task: '选样本：掩膜挑出双像透镜' },
      // 分析 · nm17（W6，可执行）：curve_fit 带 bounds 拟合——先验知识约束参数范围
      { qid: 'nm17', task: '做拟合：curve_fit + bounds' },
      // 验证 · pj19（W11 BOSS）：残差始终很大时的排查顺序——先查实现，再查观测效应，最后才调参
      { qid: 'pj19', task: '做验证：残差排查链' },
      // 报告 · st20（W9 BOSS，BOSS 符文）：用 AIC 惩罚自由度做模型比较，报告证据更强的模型
      { qid: 'st20', task: '写报告：AIC 模型比较' },
    ],
    victory: {
      title: '🔭 课题封印 · 透镜建模',
      text: '你的透镜模型扛住了残差排查与模型比较，<br />残差巨蟒再也找不到破绽——建模徽章到手！',
      next: '返回秘境大厅',
    },
  },

  // ------------------------------------------------------------
  // Project-5/7 · 用机器学习给星系形态 / 光谱分类（ML 类：数据 → 特征 → 训练 → 评估 → 泛化）
  // ------------------------------------------------------------
  {
    id: 'p5',
    project: 'Project-5/7',
    title: '星系与光谱分类',
    en: 'Classifying Galaxy Morphology & Spectra with ML',
    fieldKey: 'Realm5', lairKey: 'Realm5Core',
    fieldName: '分类森林', lairName: '泛化之门',
    badge: '分类徽章',
    music: 'sanctum',
    theme: { palette: 'grass', seed: 20270501, w: 30, h: 20, slimes: 3, slimeVariant: 'crimson', lairAmbient: 0x1a1430 },
    boss: 'slime', bossName: '过拟合魔像',
    bossMechanic: {
      kind: 'bayesianAim', name: '训练集预判',
      tip: '魔像每被你击中一次就「训练」一次，越来越会预判你的走位——可它只记住了训练集：频繁变向，它就泛化失败！',
    },
    intro: [
      'Project-5 与 Project-7：用机器学习给星系形态、天体光谱分类——这是一个「机器学习类」课题。',
      '机器学习类的链条是：数据 → 特征 → 训练 → 评估 → 泛化；终点是没见过的数据上的表现，不是训练集准确率。',
      '按顺序解开五块课题符文，再去「泛化之门」挑战过拟合魔像。',
    ],
    steps: [
      // 选题 · pj6（W11）：ML 类课题的流程链——先认清终点是泛化
      { qid: 'pj6', task: '定路线：ML 流程链的终点是泛化' },
      // 文献 · sg5（W7）：scikit-learn 的标准使用流程（实例化 → fit → predict），课题的方法基础
      { qid: 'sg5', task: '学方法：sklearn 的 fit / predict' },
      // 数据 · pj7（W11）：train / validation / test 三个集合各司其职，test 只上一次考场
      { qid: 'pj7', task: '分数据：train / validation / test' },
      // 分析 · pj8（W11）：训练过程中盯住两条曲线，在验证精度的拐点早停，识别过拟合
      { qid: 'pj8', task: '做训练：识别过拟合并早停' },
      // 验证 · pj16（W11）：稀有类只占 1% 时，99% 准确率可能是哑模型——要看混淆矩阵与每类指标
      { qid: 'pj16', task: '做评估：类别不平衡下看混淆矩阵' },
      // 报告 · pj20（W11 BOSS，BOSS 符文）：换一台巡天就掉到 60%——报告要诚实交代泛化能力与分布泄漏
      { qid: 'pj20', task: '写报告：跨巡天泛化' },
    ],
    victory: {
      title: '🌀 课题封印 · 星系与光谱分类',
      text: '你的分类器没有被训练集骗过，<br />过拟合魔像在独立巡天的数据前现了原形——分类徽章到手！',
      next: '返回秘境大厅',
    },
  },
];

/** 按 id 取秘境（未知 id 返回 undefined） */
export function getRealm(id) {
  return REALMS.find((r) => r.id === id);
}

/** 课题符文的槽位 id（学习记录用；不进入主线的 SLOT_POOL，也不写 G.answered） */
export function realmSlot(realm, stepIndex) {
  return `r${realm.id}s${stepIndex + 1}`;
}

/** 大厅里每扇课题之门对应的回程出生点 key（从该秘境回大厅时落在门前） */
export function hallSpawnKey(realm) {
  return `from_${realm.id}`;
}
