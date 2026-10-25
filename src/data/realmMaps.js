// ============================================================
// Project 秘境地图：秘境大厅 / 外庭（课题链）/ 圣所（秘境 BOSS）
// 与章节地图同一套瓦片与道具协议（见 data/maps.js 文件头），确定性生成（固定 seed）。
//
// 标准 spawn 键：
//   大厅  RealmHall ：'fromVillage'（从村庄秘境之门进入）/ 'from_<秘境 id>'（从该秘境回来，落在对应门前）
//   外庭  field     ：'fromHall'（= 'fromPrev'，死亡重生点）/ 'fromLair'（从圣所回来）
//   圣所  lair      ：'fromField'
// 外庭布局（自西向东的「研究小径」）：西门回大厅 → 课题石碑 → 五块课题符文沿小径上下交替排开
//   （选题 → 文献 → 数据 → 分析 → 验证）→ 东门圣所（第 5 步解开前封印）
// 第 6 步「报告」是圣所正中的 BOSS 符文。
// ============================================================
import { T, lcg, px, pc, scatterSlots } from './maps.js';
import { REALMS, REALM_HALL, hallSpawnKey } from './realms.js';

/** 外庭五块课题符文的瓦片坐标（沿小径上下交替；彼此相距 ≥ 4 格，交互半径互不重叠） */
export function trialSpots(midY) {
  return [6, 10, 14, 18, 22].map((tx, i) => ({ tx, ty: i % 2 === 0 ? midY - 3 : midY + 3 }));
}

// ------------------------------------------------------------
// 秘境大厅（26 × 16）：北墙四扇课题之门，南门回村
// ------------------------------------------------------------
export const HALL_DOOR_TX = [5, 10, 16, 21];

export function buildRealmHall() {
  const w = 26, h = 16;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => T.DFLOOR));
  for (let x = 0; x < w; x++) { grid[0][x] = T.DWALL; grid[h - 1][x] = T.DWALL; }
  for (let y = 0; y < h; y++) { grid[y][0] = T.DWALL; grid[y][w - 1] = T.DWALL; }
  const midX = 13;

  const spawns = { fromVillage: { x: pc(midX), y: px(h - 3.4) } };
  const props = [];
  const portals = [];
  REALMS.forEach((realm, i) => {
    const x = pc(HALL_DOOR_TX[i]);
    spawns[hallSpawnKey(realm)] = { x, y: px(5.8) }; // 门牌（门下 3 行字）之下
    props.push({ type: 'door', x, y: px(2.8), realmId: realm.id });
    portals.push({ rect: { x: x - 100, y: 140, w: 200, h: 190 }, to: realm.fieldKey, spawn: 'fromHall', label: `${realm.project} · ${realm.title}` });
  });
  // 课题石碑（大厅正中）：讲解六步课题链与各秘境进度
  props.push({ type: 'npc', x: pc(midX), y: pc(8.5), id: 'tablet' });
  // 火炬：四角 + 门与门之间
  [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3], [7.5, 2], [18.5, 2], [13, 2]].forEach(([tx, ty]) =>
    props.push({ type: 'torch', x: pc(tx), y: pc(ty) + 32 }));
  // 回村之门（南）
  props.push({ type: 'door', x: pc(midX), y: px(h - 1.6) });
  portals.push({ rect: { x: pc(midX) - 112, y: px(h) - 220, w: 224, h: 220 }, to: 'Village', spawn: 'fromRealm', label: '诺瓦村庄' });

  return {
    key: REALM_HALL.key,
    name: REALM_HALL.name,
    w, h,
    grid,
    colliding: [T.DWALL, T.VOID],
    ambient: 0x18122a,
    spawns,
    props,
    slimes: [],
    portals,
  };
}

// ------------------------------------------------------------
// 外庭（30 × 20）：五块课题符文 + 课题石碑 + 可选观测台 + 少量小怪
// ------------------------------------------------------------
export function buildRealmField(realm) {
  const th = realm.theme;
  const w = th.w || 30, h = th.h || 20;
  const midY = Math.floor(h / 2);
  const rand = lcg(th.seed);
  const dungeon = th.palette === 'dungeon';

  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => {
    if (dungeon) return T.DFLOOR;
    const r = rand();
    if (r < 0.06) return T.GRASS3;
    if (r < 0.18) return T.GRASS2;
    if (r < 0.23) return T.GRASS4;
    return T.GRASS;
  }));

  const forbidden = new Set();
  const block = (x, y, r = 0) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx, ty = y + dy;
        if (tx >= 0 && ty >= 0 && tx < w && ty < h) forbidden.add(`${tx},${ty}`);
      }
    }
  };

  const trees = [];
  const doorRows = (y) => y >= midY - 1 && y <= midY + 1;
  if (dungeon) {
    for (let x = 0; x < w; x++) { grid[0][x] = T.DWALL; grid[h - 1][x] = T.DWALL; }
    for (let y = 0; y < h; y++) {
      if (!doorRows(y)) { grid[y][0] = T.DWALL; grid[y][w - 1] = T.DWALL; }
    }
  } else {
    for (let i = 0; i < 14; i++) grid[Math.floor(rand() * h)][Math.floor(rand() * w)] = T.FLOWER;
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) trees.push({ tx: x, ty: y });
    for (let y = 1; y < h - 1; y++) {
      if (doorRows(y)) continue; // 东西两门留出门洞
      trees.push({ tx: 0, ty: y }); trees.push({ tx: w - 1, ty: y });
    }
  }

  // 研究小径：东西贯通的主路 + 通向每块课题符文的支路
  const spots = trialSpots(midY);
  if (!dungeon) {
    for (let x = 1; x < w - 1; x++) grid[midY][x] = T.PATH;
    spots.forEach(({ tx, ty }) => {
      const [a, b] = ty < midY ? [ty + 1, midY] : [midY, ty - 1];
      for (let y = a; y <= b; y++) grid[y][tx] = T.PATH;
    });
  }

  // 禁区：小径两侧、符文、门口、出生点、石碑
  for (let x = 0; x < w; x++) for (let y = midY - 1; y <= midY + 1; y++) block(x, y);
  spots.forEach(({ tx, ty }) => {
    block(tx, ty, 1);
    const [a, b] = ty < midY ? [ty, midY] : [midY, ty];
    for (let y = a; y <= b; y++) block(tx, y);
  });
  const tablet = { tx: 3, ty: midY + 4 };
  block(tablet.tx, tablet.ty, 2);
  block(1, midY, 2); block(w - 2, midY, 2);
  trees.forEach((t) => block(t.tx, t.ty));

  const spawns = {
    fromHall: { x: px(3.6), y: pc(midY) },
    fromLair: { x: px(w - 3.6), y: pc(midY) },
  };
  spawns.fromPrev = spawns.fromHall; // 死亡重生（Player.die 回本「章」野外的 fromPrev）落在西门口

  // 观测台（仅登记了 observatory 的秘境）：小径南侧，离任何课题符文 ≥ 4 格
  let observatory = null;
  if (realm.observatory) {
    observatory = { tx: 12, ty: h - 3 };
    block(observatory.tx, observatory.ty, 1);
  }

  // 小怪：避开出生点 4 格、符文 / 石碑 / 观测台 2 格、门口 3 格
  const keepOut = [
    { tx: 3, ty: midY, r: 4 }, { tx: w - 4, ty: midY, r: 4 },
    { tx: 1, ty: midY, r: 3 }, { tx: w - 2, ty: midY, r: 3 },
    { tx: tablet.tx, ty: tablet.ty, r: 2 },
    ...spots.map((s) => ({ tx: s.tx, ty: s.ty, r: 2 })),
    ...(observatory ? [{ tx: observatory.tx, ty: observatory.ty, r: 2 }] : []),
  ];
  const slimeSpots = scatterSlots(rand, w, h, th.slimes ?? 3, 3, forbidden, keepOut);

  const props = [];
  props.push({ type: 'npc', x: pc(tablet.tx), y: pc(tablet.ty), id: 'tablet' });
  spots.forEach((s, i) => props.push({ type: 'trial', step: i, x: pc(s.tx), y: pc(s.ty) }));
  if (observatory) props.push({ type: 'observatory', kind: realm.observatory, x: pc(observatory.tx), y: pc(observatory.ty) });
  // 西门：回秘境大厅（常开）
  props.push({ type: 'door', x: px(1.6), y: pc(midY - 0.4) });
  // 东门：圣所（第 5 步「验证」解开前封印；解开时场景当场解封，见 scenes/RealmScene.js）
  const sanctumReady = (g) => !!(g.realms && g.realms[realm.id] && g.realms[realm.id].steps >= 5);
  props.push({
    type: 'doorlink', x: px(w - 1.6), y: pc(midY - 0.4), to: realm.lairKey, spawn: 'fromField',
    label: `${realm.lairName}之门`, requires: sanctumReady,
    lockLines: [
      `${realm.lairName}之门紧闭着，门上刻着六个空槽：选题、文献、数据、分析、验证、报告。`,
      '石碑低语：「先走完前五步，再来向守护者「报告」。」',
    ],
  });

  if (dungeon) {
    [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3], [8, 2], [20, 2], [8, h - 3], [20, h - 3]].forEach(([tx, ty]) => {
      if (forbidden.has(`${tx},${ty}`)) return;
      props.push({ type: 'torch', x: pc(tx), y: pc(ty) + 32 });
      block(tx, ty);
    });
    for (let i = 0; i < 8; i++) {
      const tx = 2 + Math.floor(rand() * (w - 4)), ty = 2 + Math.floor(rand() * (h - 4));
      if (forbidden.has(`${tx},${ty}`)) continue;
      props.push({ type: 'crystal', x: pc(tx), y: pc(ty) });
      block(tx, ty, 1);
    }
  } else {
    // 林间树丛（避开小径、符文、门口与石碑）
    for (let i = 0; i < 18; i++) {
      const tx = 2 + Math.floor(rand() * (w - 4)), ty = 2 + Math.floor(rand() * (h - 4));
      if (forbidden.has(`${tx},${ty}`)) continue;
      trees.push({ tx, ty });
      block(tx, ty, 1);
    }
    for (let i = 0; i < 6; i++) {
      const tx = 2 + Math.floor(rand() * (w - 4)), ty = 2 + Math.floor(rand() * (h - 4));
      if (forbidden.has(`${tx},${ty}`)) continue;
      props.push({ type: 'bush', x: pc(tx), y: pc(ty) + 24 });
    }
    trees.forEach((t) => props.push({ type: 'tree', x: pc(t.tx), y: pc(t.ty) }));
  }

  return {
    key: realm.fieldKey,
    name: realm.fieldName,
    w, h,
    grid,
    colliding: dungeon ? [T.DWALL, T.VOID] : [T.WATER, T.WATER2],
    ambient: dungeon ? (th.ambient ?? 0x241f33) : null,
    spawns,
    props,
    slimes: slimeSpots.map((s) => ({ x: pc(s.tx), y: pc(s.ty), variant: th.slimeVariant })),
    portals: [
      { rect: { x: 0, y: pc(midY) - 200, w: 150, h: 330 }, to: REALM_HALL.key, spawn: hallSpawnKey(realm), label: REALM_HALL.name },
      { rect: { x: px(w) - 150, y: pc(midY) - 200, w: 150, h: 330 }, to: realm.lairKey, spawn: 'fromField',
        label: realm.lairName, requires: sanctumReady, lockHint: '圣所之门纹丝不动……先完成前五步课题' },
    ],
  };
}

// ------------------------------------------------------------
// 圣所（24 × 18）：第 6 步「报告」= BOSS 符文，秘境 BOSS 守在北端
// ------------------------------------------------------------
export function buildRealmSanctum(realm) {
  const th = realm.theme;
  const w = 24, h = 18;
  const midX = 12;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => T.DFLOOR));
  for (let x = 0; x < w; x++) { grid[0][x] = T.DWALL; grid[h - 1][x] = T.DWALL; }
  for (let y = 0; y < h; y++) { grid[y][0] = T.DWALL; grid[y][w - 1] = T.DWALL; }

  const props = [
    ...[[3, 2], [w - 4, 2], [3, h - 3], [w - 4, h - 3], [midX, 2], [4, 9], [w - 5, 9]]
      .map(([tx, ty]) => ({ type: 'torch', x: pc(tx), y: pc(ty) + 32 })),
    // 第 6 步「报告」：BOSS 符文（答对破盾）
    { type: 'trial', step: 5, x: pc(midX + 0.5), y: pc(9), bossRune: true },
    { type: 'door', x: pc(midX + 0.5), y: px(h - 1.6) },
  ];

  return {
    key: realm.lairKey,
    name: realm.lairName,
    w, h,
    grid,
    colliding: [T.DWALL, T.VOID],
    ambient: th.lairAmbient ?? 0x1c1730,
    spawns: { fromField: { x: pc(midX + 0.5), y: px(h - 3.2) } },
    props,
    slimes: [
      { x: pc(midX - 5), y: pc(12), variant: th.slimeVariant },
      { x: pc(midX + 5), y: pc(12), variant: th.slimeVariant },
    ],
    boss: { type: realm.boss, x: pc(midX + 0.5), y: pc(4) },
    portals: [
      { rect: { x: pc(midX + 0.5) - 112, y: px(h) - 220, w: 224, h: 220 }, to: realm.fieldKey, spawn: 'fromLair', label: realm.fieldName },
    ],
  };
}
