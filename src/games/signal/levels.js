// ============================================================
// 外星信号 · 关卡数据（纯数据，无 DOM；smoke / verify 直接导入）
// 每关：{ id, title, challenge?, concept, story, hints, solution, par,
//         vars: { 变量名: { data: 一维数组, dtype } }（学生拿到的比特流）,
//         target: 二维数组（解码后应得的图像，判定用）, palette: 'bin' | 'quad',
//         reveal: 字符画（解码成功后上色展示）, meaning: 图案含义, chips: 快捷符号 }
// 比特流全部由图案按「发送方式」生成：逐行 / 倒序 / 镜像 / 噪声 / 加密 / 双比特平面 / 自下而上 / 按列。
// 图案尺寸都是两个质数之积，reshape 的行列数只有一种排法能显出图像。
// ============================================================
import { parseArt, ALIEN, YEAR, NP, SATURN, SMILE, SYSTEM, ARECIBO, PY } from './art.js';

// ---------- 发送方式（全部是纯函数，数据只在模块加载时生成一次） ----------
const bin = (g) => g.map((r) => r.map((v) => (v > 0 ? 1 : 0)));
const flat = (g) => g.flat();
const mirror = (g) => g.map((r) => r.slice().reverse());
const flipRows = (g) => g.slice().reverse();
const transpose = (g) => g[0].map((_, j) => g.map((r) => r[j]));

/** 确定性伪随机（LCG），噪声与密钥每次加载都一样，参考解与对拍才稳定 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 模拟信号：1 → 0.62 ~ 0.97，0 → 0.03 ~ 0.38（两位小数，阈值 0.5 两边各留余量） */
function analog(bits, seed) {
  const r = lcg(seed);
  return bits.map((b) => {
    const u = Math.round((0.03 + r() * 0.35) * 100) / 100;
    return b ? Math.round((1 - u) * 100) / 100 : u;
  });
}

function keyBits(n, seed) {
  const r = lcg(seed);
  return Array.from({ length: n }, () => (r() < 0.5 ? 1 : 0));
}

// ---------- 图案 ----------
const A = {
  alien: parseArt(ALIEN), year: parseArt(YEAR), np: parseArt(NP), saturn: parseArt(SATURN),
  smile: parseArt(SMILE), system: parseArt(SYSTEM), arecibo: parseArt(ARECIBO), py: parseArt(PY),
};

const smileBits = flat(bin(A.smile));
const padKey = keyBits(smileBits.length, 20261026);
const sys = A.system;

const BASE_CHIPS = ['signal', '.reshape(', ',', ')', '[::-1]', '[:, ::-1]', 'len(signal)'];

export const LEVELS = [
  {
    id: 'first',
    title: '第一声',
    concept: 'reshape · 行优先排列',
    story: '观测日志 #1：高原射电望远镜收到一串脉冲——开、关、开……35 个比特排成了一行（一维数组）。把它们排成方阵，也许能看出是什么。',
    hints: [
      '图像是一行一行发出来的：35 个比特要排成「行 × 列」的方阵，行数 × 列数 = len(signal) = 35 = 5 × 7。',
      '写 `signal.reshape(行数, 列数)`：(5, 7) 和 (7, 5) 都试试，哪个排出来不是斜条纹？',
    ],
    solution: 'signal.reshape(7, 5)',
    par: 1,
    vars: { signal: { data: flat(bin(A.alien)), dtype: 'int' } },
    target: bin(A.alien),
    palette: 'bin',
    reveal: A.alien,
    meaning: '一个挥手的小外星人——第一次接触！',
    chips: BASE_CHIPS,
  },
  {
    id: 'reversed',
    title: '倒着来的信号',
    concept: '切片步长 -1 · 翻转',
    story: '观测日志 #2：这段 119 比特的信号是从「最后一个比特」开始倒着传来的。先把顺序翻回来，再排成图。',
    hints: [
      '切片 `[::-1]` 的步长是 -1：从最后一个元素往前取，整个数组倒过来。119 = 7 × 17。',
      '先翻转、再排形状：`signal[::-1].reshape(行数, 列数)`（排好之后再写 `[::-1, ::-1]` 两个方向都倒过来也行）。',
    ],
    solution: 'signal[::-1].reshape(7, 17)',
    par: 1,
    vars: { signal: { data: flat(bin(A.year)).reverse(), dtype: 'int' } },
    target: bin(A.year),
    palette: 'bin',
    reveal: A.year,
    meaning: '1974——人类用阿雷西博射电望远镜向 M13 星团发出信息的那一年。他们收到了！',
    chips: BASE_CHIPS,
  },
  {
    id: 'mirror',
    title: '镜中的字',
    concept: '二维切片 [:, ::-1] · 左右镜像',
    story: '观测日志 #3：这台望远镜靠反射镜聚焦——镜子会把画面左右颠倒。排出图像后，让每一行都倒过来。',
    hints: [
      '二维数组写 `a[:, ::-1]`：逗号前的 `:` 表示行全要，逗号后的 `::-1` 让列倒过来——就是左右镜像。143 = 11 × 13。',
      '`signal.reshape(11, 13)[:, ::-1]`',
    ],
    solution: 'signal.reshape(11, 13)[:, ::-1]',
    par: 1,
    vars: { signal: { data: flat(mirror(bin(A.np))), dtype: 'int' } },
    target: bin(A.np),
    palette: 'bin',
    reveal: A.np,
    meaning: 'N P —— NumPy！看来外星人也用 NumPy 处理观测数据。',
    chips: BASE_CHIPS,
  },
  {
    id: 'noise',
    title: '噪声里的行星',
    concept: '比较运算 · 布尔数组',
    story: '观测日志 #4：宇宙噪声把干净的方波糊成了 0 到 1 之间的小数。先用比较运算把它变回 0 / 1，再排成图。',
    hints: [
      '比较运算对数组逐元素生效：`signal > 0.5` 得到布尔数组——大于 0.5 的是 True（当作 1），其余是 False（当作 0）。77 = 7 × 11。',
      '给比较加上括号再 reshape：`(signal > 0.5).reshape(7, 11)`',
    ],
    solution: '(signal > 0.5).reshape(7, 11)',
    par: 1,
    vars: { signal: { data: analog(flat(bin(A.saturn)), 77), dtype: 'float' } },
    target: bin(A.saturn),
    palette: 'bin',
    reveal: A.saturn,
    meaning: '一颗戴着光环的行星——他们的星系里也有一颗「土星」。',
    chips: ['signal', '>', '0.5', '(', ')', '.reshape(', ','],
  },
  {
    id: 'pad',
    title: '一次性密钥',
    concept: '逐元素运算 · 向量化解密',
    story: '观测日志 #5：回信加了密！频道 a 是一串随机的「密钥」，频道 b 是「明文 + 密钥」再对 2 取余。两路逐元素相加、再对 2 取余，密钥就抵消了。',
    hints: [
      '数组之间的运算逐元素进行（向量化）：`(a + b) % 2` 一句话处理全部 121 个比特。121 = 11 × 11。',
      '`((a + b) % 2).reshape(11, 11)`（用异或 `a ^ b` 也可以）',
    ],
    solution: '((a + b) % 2).reshape(11, 11)',
    par: 1,
    vars: {
      a: { data: padKey, dtype: 'int' },
      b: { data: smileBits.map((m, i) => (m + padKey[i]) % 2), dtype: 'int' },
    },
    target: bin(A.smile),
    palette: 'bin',
    reveal: A.smile,
    meaning: '一张笑脸——外星人回信了！',
    chips: ['a', 'b', '+', '%', '2', '(', ')', '.reshape(', ','],
  },
  {
    id: 'color',
    title: '四色星系',
    concept: '数组算术 · 双通道合成',
    story: '观测日志 #6：这次有两个频道 hi 和 lo，每个像素用两个比特表示 0–3 四种颜色：颜色编号 = hi × 2 + lo。',
    hints: [
      '颜色编号 = `hi * 2 + lo`（二进制的「高位 × 2 + 低位」），数组运算一次算完全部像素。221 = 13 × 17。',
      '`(hi * 2 + lo).reshape(13, 17)`',
    ],
    solution: '(hi * 2 + lo).reshape(13, 17)',
    par: 1,
    vars: {
      hi: { data: flat(sys).map((v) => v >> 1), dtype: 'int' },
      lo: { data: flat(sys).map((v) => v & 1), dtype: 'int' },
    },
    target: sys,
    palette: 'quad',
    reveal: sys,
    meaning: '一颗恒星、两颗行星、一条轨道，还有一颗方形的卫星——他们的恒星系全家福。',
    chips: ['hi', 'lo', '*', '+', '2', '(', ')', '.reshape(', ','],
  },
  {
    id: 'arecibo',
    title: '迷你阿雷西博',
    concept: 'reshape + 行翻转 · 综合',
    story: '观测日志 #7：一段 713 比特的长信号——和 1974 年的阿雷西博信息一样，长度是两个质数的乘积。可这台望远镜是从图像底部开始一行一行扫描的……',
    hints: [
      '713 = 23 × 31，原版阿雷西博信息每行 23 个比特。底部那一行最先发出：排好形状后，把「行」的顺序倒过来（`[::-1]` 作用在第一维）。',
      '`signal.reshape(31, 23)[::-1]`',
    ],
    solution: 'signal.reshape(31, 23)[::-1]',
    par: 2,
    vars: { signal: { data: flat(flipRows(bin(A.arecibo))), dtype: 'int' } },
    target: bin(A.arecibo),
    palette: 'bin',
    reveal: A.arecibo,
    meaning: '二进制数字 1–8、双螺旋、人形、太阳系（地球被抬高了一格）和一架射电望远镜——这是对 1974 年阿雷西博信息的回应！',
    chips: BASE_CHIPS,
  },
  {
    id: 'columns',
    title: '一列一列的信号',
    challenge: true,
    concept: '.T 转置 · 列优先（W3 讲义外的拓展）',
    story: '观测日志 #8：一台老式发射机是「一列一列」发送图像的，按行排出来全是乱码。先按列排，再转置——.T 会把行和列互换。',
    hints: [
      '按列发送：先 `reshape(列数, 行数)` 把每一列排成一行，再 `.T` 把行和列互换。143 = 11 × 13，图像有 11 行 13 列。',
      '`signal.reshape(13, 11).T`',
    ],
    solution: 'signal.reshape(13, 11).T',
    par: 1,
    vars: { signal: { data: flat(transpose(bin(A.py))), dtype: 'int' } },
    target: bin(A.py),
    palette: 'bin',
    reveal: A.py,
    meaning: 'Py——外星人在说 Python！',
    chips: [...BASE_CHIPS, '.T'],
  },
];
