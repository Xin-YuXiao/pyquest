// ============================================================
// BOSS 招牌机制 · 数据层（纯数据，无 Phaser 依赖，smoke 可直接导入）
// 章节配置 chapters.js 的 bossMechanic 字段：{ kind, name, tip, ...参数 }
//   kind      → 本表登记的机制种类（行为实现见 entities/bossMechanics.js，
//               加载时会校验本表每一种都有实现）
//   name/tip  → BOSS 战开场横幅的标题与一句话玩法
//   参数缺省值在 MECHANIC_KINDS[kind].defaults，章节配置只写要覆盖的项
// archetypes：该机制能挂在哪种 BOSS 原型上（依赖原型扩展点的机制只认对应原型）
// preShield：护盾期就生效（进巢穴即布置并提示），其余机制破盾才开战
// ============================================================

export const MECHANIC_KINDS = {
  // W1 列表召唤：接管召唤波次，第 k 波 append k 个帮手
  appendSummons: {
    archetypes: ['slime'],
    defaults: { waves: [{ hp: 7, n: 1 }, { hp: 4, n: 2 }, { hp: 2, n: 3 }] },
  },
  // W2 循环倒数：每断一节尾巴，浮字报出 range 剩余轮数
  rangeCountdown: {
    archetypes: ['snake'],
    defaults: {},
  },
  // W3 正弦混沌弹：弹道 = 直线推进 + 垂直方向 A·sin(ωt) 摆动
  sineBullets: {
    archetypes: ['slime', 'snake'],
    defaults: { interval: 3200, speed: 520, amp: 150, omega: 4, life: 4200, max: 6 },
  },
  // W4 单位符印：地上留下限时陷阱圈，踩中短暂减速
  unitTraps: {
    archetypes: ['slime', 'snake'],
    defaults: {
      interval: 3500, radius: 150, life: 9000, max: 5, slow: 0.45, slowMs: 1200,
      units: ['km ≠ m', 'pc ≠ AU', 'Jy ≠ erg', 'deg ≠ rad', 'mag ≠ flux'],
    },
  },
  // W5 迟缓光环：光环内玩家减速；破盾瞬间玩家获得「向量化」加速（光环暂时无效）
  slowAura: {
    archetypes: ['slime', 'snake'],
    defaults: { radius: 520, slow: 0.5, buffMs: 8000, buffMul: 1.5 },
  },
  // W6 梯度冲锋：突咬冲刺速度按学习率逐次衰减；冲刺撞墙则眩晕
  gradientCharge: {
    archetypes: ['snake'],
    defaults: { decay: 0.8, minLr: 0.45, stunMs: 2200 },
  },
  // W7 频谱分身：三个不同频率脉动的分身，须按频率从低到高击破 → 相位锁定
  fourierEchoes: {
    archetypes: ['slime', 'snake'],
    defaults: { freqs: [1, 2, 4], rx: 420, ry: 260, maxResets: 3, lockMs: 4000, respawnMs: 12000 },
  },
  // W8 暗物质引力：按 NFW 包含质量 M(<r)/r² 把玩家拉向核心
  nfwGravity: {
    archetypes: ['slime', 'snake'],
    defaults: { rs: 380, g0: 420, range: 1500 },
  },
  // W9 后验瞄准：弹幕瞄准点 = 当前位置 + w·速度·提前量，每被击中一次 w += step
  bayesianAim: {
    archetypes: ['slime', 'snake'],
    defaults: { interval: 2600, speed: 900, step: 0.2, lead: 0.6, life: 3000 },
  },
  // W10 幻觉符文：护盾期在真 BOSS 符文两侧布置假符文石；破盾后不时谎称护盾恢复
  fakeRunes: {
    archetypes: ['slime', 'snake'],
    preShield: true,
    defaults: { fakes: 2, spacing: 5.5, lieEvery: 6000 },
  },
  // W11 三途试炼：按血量依次切换三段子机制（复用上面已实现的种类）
  threePaths: {
    archetypes: ['slime', 'snake'],
    defaults: {
      phases: [
        { above: 7, kind: 'sineBullets', key: 'fit', label: '拟合之途 · 曲线弹' },
        { above: 3, kind: 'nfwGravity', key: 'simulate', label: '模拟之途 · 引力场' },
        { above: 0, kind: 'bayesianAim', key: 'learn', label: '学习之途 · 预判弹' },
      ],
    },
  },
};

/** 章节配置 + 种类缺省值 → 完整参数（章节配置优先） */
export function mechanicParams(cfg) {
  const kind = MECHANIC_KINDS[cfg.kind];
  if (!kind) throw new Error(`未知 BOSS 招牌机制: ${cfg.kind}`);
  return { ...kind.defaults, ...cfg };
}
