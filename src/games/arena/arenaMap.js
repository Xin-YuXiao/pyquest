// ============================================================
// 向量风暴 · 竞技场地图（WorldScene 的 mapDef；不改 data/maps.js）
// 26 × 18 格封闭地牢：外圈墙、四面墙上各一座刷怪门（装饰）、四角与门旁火把、
// 中心十字四块水晶当掩体（绕着水晶跑能甩开一部分追兵），玩家在正中出生。
// ============================================================
import { T } from '../../data/maps.js';

export const ARENA_W = 26;
export const ARENA_H = 18;
const px = (t) => t * 128;
const pc = (t) => t * 128 + 64;

/** 四座刷怪门（格坐标，门内一格是刷怪点） */
export const GATES = [
  { tx: 13, ty: 1, inward: [0, 1] },
  { tx: 13, ty: ARENA_H - 2, inward: [0, -1] },
  { tx: 1, ty: 9, inward: [1, 0] },
  { tx: ARENA_W - 2, ty: 9, inward: [-1, 0] },
];

export const CENTER = { x: px(13), y: pc(9) };

export function buildArenaMap() {
  const w = ARENA_W, h = ARENA_H;
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (
    x === 0 || y === 0 || x === w - 1 || y === h - 1 ? T.DWALL : T.DFLOOR
  )));
  const props = [];
  // 火把：四角 + 每座门两侧
  [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].forEach(([tx, ty]) => props.push({ type: 'torch', x: pc(tx), y: pc(ty) + 32 }));
  [[11, 1], [15, 1], [11, h - 2], [15, h - 2]].forEach(([tx, ty]) => props.push({ type: 'torch', x: pc(tx), y: pc(ty) + 32 }));
  // 刷怪门（装饰用传送门）
  GATES.forEach((g) => props.push({ type: 'door', x: g.tx === 13 ? px(13) : pc(g.tx), y: g.ty === 9 ? pc(9) + 40 : pc(g.ty) + 40 }));
  // 掩体水晶
  [[7, 5], [18, 5], [7, 12], [18, 12]].forEach(([tx, ty]) => props.push({ type: 'crystal', x: pc(tx), y: pc(ty) }));
  return {
    key: 'VectorArena',
    name: '向量风暴 · 竞技场',
    w, h,
    grid,
    colliding: [T.DWALL, T.VOID],
    ambient: 0x1b1430,
    spawns: { arena: { x: CENTER.x, y: CENTER.y } },
    props,
    slimes: [],
    boss: null,
    portals: [],
  };
}

/**
 * 竞技场地面（画到 2D canvas 上，场景在 WorldScene 生成地面前先登记成 ground_VectorArena 纹理）：
 * 深紫石砖墙 + 石板地；地板上刻一张 ndarray 网格纹，中央一圈法阵（dist = 2 / 3 / 4 格的同心圆）。
 * 通用地面生成器只给 Dungeon / Cave 画石砖，其余 key 都铺草地，所以竞技场自己画。
 */
export function drawArenaGround(ctx, def) {
  const TILE = 128;
  let seed = 20261026;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < def.h; y++) {
    for (let x = 0; x < def.w; x++) {
      const dx = x * TILE, dy = y * TILE;
      if (def.grid[y][x] === T.DWALL) {
        ctx.fillStyle = '#2c2742';
        ctx.fillRect(dx, dy, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(dx, dy, TILE, 6);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        for (let r = 0; r < 4; r++) {
          const yy = dy + r * 32 + 16;
          ctx.beginPath(); ctx.moveTo(dx, yy); ctx.lineTo(dx + TILE, yy); ctx.stroke();
          const off = r % 2 ? 32 : 96;
          ctx.beginPath(); ctx.moveTo(dx + off, yy - 32); ctx.lineTo(dx + off, yy); ctx.stroke();
        }
        continue;
      }
      ctx.fillStyle = (x + y) % 2 ? '#3a3552' : '#37324e';
      ctx.fillRect(dx, dy, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(dx, dy, TILE, 3);
      ctx.fillRect(dx, dy, 3, TILE);
      if (rand() < 0.3) {
        ctx.fillStyle = 'rgba(140,130,180,0.22)';
        ctx.beginPath();
        ctx.ellipse(dx + 20 + rand() * 88, dy + 20 + rand() * 88, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // ndarray 网格纹：每 2 格一道细线
  ctx.strokeStyle = 'rgba(99,212,255,0.07)';
  ctx.lineWidth = 3;
  for (let x = 2; x < def.w - 1; x += 2) { ctx.beginPath(); ctx.moveTo(x * TILE, TILE); ctx.lineTo(x * TILE, (def.h - 1) * TILE); ctx.stroke(); }
  for (let y = 2; y < def.h - 1; y += 2) { ctx.beginPath(); ctx.moveTo(TILE, y * TILE); ctx.lineTo((def.w - 1) * TILE, y * TILE); ctx.stroke(); }
  // 中央法阵（装饰：半径刻意避开 dist = 2 / 3 / 4，免得和跟随玩家的距离环叠在一起）
  const cx = CENTER.x, cy = CENTER.y;
  [[1.1, 6, 0.2], [5.4, 7, 0.2], [5.8, 4, 0.14]].forEach(([d, w, al]) => {
    ctx.strokeStyle = `rgba(179,140,255,${al})`;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(cx, cy, d * TILE, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.strokeStyle = 'rgba(179,140,255,0.12)';
  ctx.lineWidth = 5;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * TILE * 1.1, cy + Math.sin(a) * TILE * 1.1);
    ctx.lineTo(cx + Math.cos(a) * TILE * 5.4, cy + Math.sin(a) * TILE * 5.4);
    ctx.stroke();
  }
  // 刷怪门前的紫色光斑
  GATES.forEach((g) => {
    const gx = (g.tx + g.inward[0] + 0.5) * TILE, gy = (g.ty + g.inward[1] + 0.5) * TILE;
    const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, TILE * 1.6);
    grd.addColorStop(0, 'rgba(179,140,255,0.32)');
    grd.addColorStop(1, 'rgba(179,140,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(gx - TILE * 2, gy - TILE * 2, TILE * 4, TILE * 4);
  });
}

/** 刷怪点（世界坐标）：gates = 某座门内侧，ring = 以玩家为中心的大圆（夹进场地） */
export function spawnPoint(from, rand, player) {
  if (from === 'ring' && player) {
    const a = rand() * Math.PI * 2;
    const r = px(7 + rand() * 3);
    return {
      x: Math.min(px(ARENA_W - 2), Math.max(px(2), player.x + Math.cos(a) * r)),
      y: Math.min(px(ARENA_H - 2), Math.max(px(2), player.y + Math.sin(a) * r)),
    };
  }
  const g = GATES[Math.floor(rand() * GATES.length)];
  const jitter = (rand() - 0.5) * 3;
  return {
    x: pc(g.tx + g.inward[0] + (g.inward[0] ? 0 : jitter)),
    y: pc(g.ty + g.inward[1] + (g.inward[1] ? 0 : jitter)),
  };
}
