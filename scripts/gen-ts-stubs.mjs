// ============================================================
// Tiny Swords 占位素材生成器（无素材环境 / CI 用）
//
// Tiny Swords 素材包（Pixel Frog）许可证禁止再分发 → 仓库不携带本体，
// 需自行下载放到 assets/TinySwordsFreePack/。没有素材时浏览器端
// BootScene 加载失败 → E2E 无法运行。本脚本按 src/assets/ts.js 清单
// 生成「尺寸合法的纯色 PNG」占位：Phaser 能正常切片/建动画，游戏逻辑
// 与 E2E 全部可跑（截图为色块，仅用于逻辑验证，不用于美术审校）。
//
// 用法：node scripts/gen-ts-stubs.mjs [--force]
//   - 检测到真实素材包（目录非空）时跳过，不会覆盖
//   - --force：无视已有文件重新生成（占位覆盖占位/真实包时慎用）
// ============================================================
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TS_SHEETS, TS_IMAGES, TS_TILESETS, TS_ANIMS } from '../src/assets/ts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = join(ROOT, 'assets', 'TinySwordsFreePack');

// ---------- 最小 PNG 编码器（RGBA8 · filter 0） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** 生成 w×h 的纯色（带 1px 深色描边便于肉眼区分占位）PNG Buffer */
function makePng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (stride + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const o = row + 1 + x * 4;
      raw[o] = edge ? Math.max(0, r - 90) : r;
      raw[o + 1] = edge ? Math.max(0, g - 90) : g;
      raw[o + 2] = edge ? Math.max(0, b - 90) : b;
      raw[o + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 按清单生成 ----------
// 每个 sheet 一组稳定色相（哈希 → HSL → RGB），肉眼可区分不同单位/物件
function hueColor(seed) {
  const hue = (seed * 137.508) % 360; // 黄金角散布
  const s = 0.55, l = 0.62;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// 静态图片的占位尺寸（真实尺寸对 gameplay 无影响，取清单注释的近似值）
const IMAGE_SIZE = {
  ts_shadow: [192, 192],
  castle: [192, 320],
  tower: [128, 256],
};
const defaultImageSize = [256, 160];
// tileset：4×4 格 × 64px（ground.js 按官方 tileset 的无缝中心格平铺）
const TILESET_SIZE = [256, 256];

const force = process.argv.includes('--force');
if (existsSync(PACK) && readdirSync(PACK).length && !force) {
  console.log('[gen-ts-stubs] 检测到已有素材包（真实包或旧占位），跳过。如需重建：--force');
  process.exit(0);
}

let n = 0;
const emit = (relPath, w, h, color) => {
  const abs = join(PACK, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, makePng(w, h, color));
  n++;
};

// spritesheet：宽度 = 帧数 × 帧宽（帧数取 TS_ANIMS 引用的最大值，兜底 8）
const sheetFrames = {};
for (const [, [sheet, frames]] of Object.entries(TS_ANIMS)) {
  sheetFrames[sheet] = Math.max(sheetFrames[sheet] || 0, frames);
}
Object.entries(TS_SHEETS).forEach(([key, [url, fw, fh]], i) => {
  const frames = sheetFrames[key] || 8;
  emit(url.replace('/TinySwordsFreePack', ''), frames * fw, fh, hueColor(i + 1));
});

// 静态图片 / tileset
Object.entries(TS_IMAGES).forEach(([key, url], i) => {
  const [w, h] = IMAGE_SIZE[key] || defaultImageSize;
  emit(url.replace('/TinySwordsFreePack', ''), w, h, hueColor(i + 40));
});
Object.entries(TS_TILESETS).forEach(([key, url], i) => {
  emit(url.replace('/TinySwordsFreePack', ''), TILESET_SIZE[0], TILESET_SIZE[1], hueColor(i + 60));
});

console.log(`[gen-ts-stubs] 生成 ${n} 个占位 PNG → ${PACK}`);
console.log('[gen-ts-stubs] ⚠️ 占位素材仅供 E2E/CI 逻辑验证；正式游玩请下载 Tiny Swords Free Pack 覆盖。');
