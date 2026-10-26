// ============================================================
// 阵列牌局 · 敌人像素精灵（12×12，SVG 输出；风格对齐 textures/pixelArt.js：平涂色块 + #3f2631 深紫描边）
// 每个精灵是 12 行字符串，字符查调色板；'.' 透明。同一行连续同色像素合并成一个 rect。
// ============================================================

const O = '#3f2631';
const EYE = '#2c2438';

const SPRITES = {
  slime: {
    pal: { o: O, b: '#7ccf5a', l: '#b6ec8c', d: '#4c9a3a', w: '#ffffff', e: EYE },
    map: [
      '............',
      '....oooo....',
      '..oollbboo..',
      '.olbbbbbbbo.',
      '.obwebbwebo.',
      'obbeebbeebbo',
      'obbbbbbbbbbo',
      'obbbbddbbbbo',
      'obbbbbbbbbbo',
      '.odbbbbbbdo.',
      '..oooooooo..',
      '............',
    ],
  },
  imp: {
    pal: { o: O, b: '#f2737a', l: '#ffb3b8', d: '#b23a48', w: '#ffffff', e: EYE, h: '#ffd257' },
    map: [
      '............',
      '..o......o..',
      '..oho..oho..',
      '...oooooo...',
      '..olbbbbbo..',
      '.obwebbwebo.',
      '.obeebbeebo.',
      '.obbbbbbbbo.',
      '.obbddddbbo.',
      '..odbbbbdo..',
      '...oo..oo...',
      '............',
    ],
  },
  assassin: {
    pal: { o: O, b: '#5b4b8a', l: '#7a68b0', d: '#2f2752', y: '#ffd257', s: '#d8dde8' },
    map: [
      '....oooo....',
      '...olbbbo...',
      '..olbbbbbo..',
      '..obddddbo..',
      '..odyddydo..',
      '..obddddbo..',
      '.olbbbbbbbo.',
      'olbbbbbbbbos',
      'obbbbbbbbbos',
      '.obbbbbbbbo.',
      '..oo....oo..',
      '............',
    ],
  },
  knight: {
    pal: { o: O, s: '#9aa3b5', l: '#d0d6e2', d: '#5d6475', a: '#4a7bd1', c: '#8fb4f0', e: EYE },
    map: [
      '....oooo....',
      '...ollllo...',
      '..olsssslo..',
      '..oseeeeso..',
      '..osssssso..',
      'ooo.osso....',
      'oaco.ssssso.',
      'oaaosssssdo.',
      'oaaossssdso.',
      '.oo.ossssdo.',
      '....oo..oo..',
      '............',
    ],
  },
  archer: {
    pal: { o: O, b: '#3f8f5a', l: '#6cc287', d: '#28603b', k: '#f2c79a', e: EYE, w: '#a0703a', t: '#e8e3d3' },
    map: [
      '....oooo....',
      '...olbbbo...',
      '..olbbbbbo..',
      '..obkkkkbo.w',
      '..okekkeko.w',
      '..obkkkkbo.w',
      '.olbbbbbbotw',
      '.obbbbbbbo.w',
      '.obbddbbbo.w',
      '..obbbbbo..w',
      '...oo.oo....',
      '............',
    ],
  },
  healer: {
    pal: { o: O, b: '#f5f0ff', l: '#ffffff', d: '#c9c2d6', k: '#f2c79a', e: EYE, p: '#ff8aa0' },
    map: [
      '.....pp.....',
      '....oppo....',
      '...olbbbo...',
      '..obkkkkbo..',
      '..okekkeko..',
      '..obkkkkbo..',
      '.olbbppbbbo.',
      '.obppppppbo.',
      '.obbbppbbbo.',
      '.odbbppbbdo.',
      '..oooooooo..',
      '............',
    ],
  },
  skeleton: {
    pal: { o: O, b: '#e8e3d3', l: '#ffffff', d: '#9c967f', e: EYE, r: '#ff5a6a' },
    map: [
      '....oooo....',
      '...olbbbo...',
      '..olbbbbbo..',
      '..oerbbreo..',
      '..oeebbeeo..',
      '..obbddbbo..',
      '...obdbdo...',
      '..o.obbo.o..',
      '.obooddoobo.',
      '..o.obbo.o..',
      '...oo..oo...',
      '............',
    ],
  },
  golem: {
    pal: { o: O, b: '#a89f91', l: '#cfc7b8', d: '#6e665b', g: '#57d9d0', m: '#7cb36a' },
    map: [
      '...oooooo...',
      '..ollllbbo..',
      '..obbmbbbo..',
      '..ogdbbdgo..',
      '..obbbbbbo..',
      'oooddddddooo',
      'olbbbbbbbbbo',
      'obbdbbbbdbbo',
      'obbbbmbbbbbo',
      'oddbbbbbbddo',
      '.ooo.oo.ooo.',
      '............',
    ],
  },
  lich: {
    pal: { o: O, b: '#7b5ea7', l: '#a387d1', d: '#4b3570', c: '#ffd257', f: '#e8e3d3', g: '#7cf29a' },
    map: [
      '..c.c..c.c..',
      '..cccccccc..',
      '..offffffo..',
      '..ogffffgo..',
      '..offddffo..',
      '...offffo...',
      '.olbbbbbblo.',
      'olbbbddbbblo',
      'obbbbddbbbbo',
      'obbbbbbbbbbo',
      '.odbbbbbbdo.',
      '..oooooooo..',
    ],
  },
};

const cache = new Map();

/** 精灵 SVG 字符串（px：显示边长） */
export function spriteSVG(kind, px = 48) {
  const key = `${kind}:${px}`;
  if (cache.has(key)) return cache.get(key);
  const sp = SPRITES[kind] || SPRITES.slime;
  let rects = '';
  sp.map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !sp.pal[ch]) { x++; continue; }
      let w = 1;
      while (row[x + w] === ch) w++;
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${sp.pal[ch]}"/>`;
      x += w;
    }
  });
  const svg = `<svg class="cb-sprite" viewBox="0 0 12 12" width="${px}" height="${px}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  cache.set(key, svg);
  return svg;
}

export const SPRITE_KINDS = Object.keys(SPRITES);
