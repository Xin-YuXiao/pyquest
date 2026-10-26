// ============================================================
// npmini：NumPy 子集解释器——第三章试炼场的「咒语」执行器（纯 JS、无 DOM）
//
// 玩家在试炼场里写的是一行（或几句用 ; 分隔的）真 NumPy 语法；这里负责：
//   词法 → 语法树 → 求值，值模型与 NumPy 1.26 一致：
//   · ndarray 三种 dtype（int / float / bool），任意维；基本切片返回共享缓冲区的视图，
//     布尔 / 花式下标返回副本；每个数组带「来源位置」prov（选中了哪个数组的哪些格子），
//     小游戏据此把选择器映射回画面上的格子。
//   · 广播、dtype 提升、Python 标量与 numpy 标量的语义差别（1/0 报错 vs 数组除零得 inf）。
//   · 打印完整复刻 numpy 1.26 的 array2string（右对齐、浮点 maxprec 8 位、小数点对齐、科学计数切换、75 字符折行）。
//   · 报错给 Python 原文（类型 + 信息）+ 中文解释。
// 不支持的语法（for / if / def / lambda …）给友好报错。与真 NumPy 的逐条对拍见 scripts/verify-npmini.mjs。
// ============================================================

export const LIMITS = { maxElems: 100000, maxSource: 800, maxDepth: 64 };

// ---------- 错误 ----------

export class PyError extends Error {
  /** type：Python 异常类名（IndexError …）；hint：中文解释（可空） */
  constructor(type, message, hint = '') {
    super(message);
    this.type = type;
    this.hint = hint;
  }
}
const err = (type, msg, hint) => new PyError(type, msg, hint);

// ---------- 值模型 ----------

/** 标量：dtype int / float / bool；np=true 表示 numpy 标量（数组元素 / 归约结果），否则是 Python 标量 */
export class Scalar {
  constructor(v, dtype, np = false, prov = null) {
    this.v = v;
    this.dtype = dtype;
    this.np = np;
    this.prov = prov;
  }
}
export const NONE = { kind: 'None' };
export class PyList { constructor(items) { this.items = items; } }
export class PyTuple { constructor(items) { this.items = items; } }
export class PyStr { constructor(s) { this.s = s; } }
export class PySlice { constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; } }
export class PyFunc {
  constructor(name, fn, extra = {}) { this.name = name; this.fn = fn; Object.assign(this, extra); }
}
export class PyModule { constructor(name, attrs) { this.name = name; this.attrs = attrs; } }
export class PyDType { constructor(dtype) { this.dtype = dtype; } }

/**
 * ndarray：store = { data: number[], dtype } 共享缓冲区；map[i] = 第 i 个逻辑元素（C 顺序）在 store.data 里的位置。
 * prov = { store, pos } 来源：视图即自身缓冲区与 map；下标副本指向原数组缓冲区与被选中的位置；新算出的数组指向自己。
 */
export class NDArray {
  constructor(shape, store, map, prov = null) {
    this.shape = shape;
    this.store = store;
    this.map = map;
    this.prov = prov || { store, pos: map };
  }
  get dtype() { return this.store.dtype; }
  get size() { return this.map.length; }
  get ndim() { return this.shape.length; }
  at(i) { return this.store.data[this.map[i]]; }
}

const prod = (shape) => shape.reduce((a, b) => a * b, 1);
const range = (n) => Array.from({ length: n }, (_, i) => i);

function checkSize(n) {
  if (!Number.isFinite(n) || n > LIMITS.maxElems) {
    throw err('MemoryError', `array of ${Number.isFinite(n) ? n : 'huge'} elements is too large`,
      `数组太大了：高原的魔法最多容纳 ${LIMITS.maxElems} 个元素。`);
  }
}

const castTo = (v, dtype) => {
  if (dtype === 'bool') return v ? 1 : 0;
  if (dtype === 'int') return Number.isFinite(v) ? Math.trunc(v) : 0;
  return v;
};

/** 用一组数（已按 dtype）新建一个独立数组 */
export function makeArray(shape, data, dtype) {
  checkSize(data.length);
  const store = { data: data.map((v) => castTo(v, dtype)), dtype };
  return new NDArray(shape.slice(), store, range(data.length));
}

const KIND = { bool: 0, int: 1, float: 2 };
const promote = (...ds) => ds.reduce((a, b) => (KIND[a] >= KIND[b] ? a : b));

const isNum = (v) => v instanceof Scalar;
const isArr = (v) => v instanceof NDArray;
const isSeq = (v) => v instanceof PyList || v instanceof PyTuple;

const pyInt = (n) => new Scalar(n, 'int');
const pyFloat = (x) => new Scalar(x, 'float');
const pyBool = (b) => new Scalar(b ? 1 : 0, 'bool');
const npScalar = (v, dtype, prov = null) => new Scalar(dtype === 'bool' ? (v ? 1 : 0) : v, dtype, true, prov);

export function typeName(v) {
  if (v === NONE) return 'NoneType';
  if (v instanceof Scalar) {
    if (v.np) return v.dtype === 'int' ? 'numpy.int64' : v.dtype === 'float' ? 'numpy.float64' : 'numpy.bool_';
    return v.dtype;
  }
  if (v instanceof NDArray) return 'numpy.ndarray';
  if (v instanceof PyList) return 'list';
  if (v instanceof PyTuple) return 'tuple';
  if (v instanceof PyStr) return 'str';
  if (v instanceof PySlice) return 'slice';
  if (v instanceof PyFunc) return 'builtin_function_or_method';
  if (v instanceof PyModule) return 'module';
  if (v instanceof PyDType) return 'numpy.dtype';
  return 'object';
}
const shortType = (v) => typeName(v).replace(/^numpy\./, '');

// ============================================================
// 打印：Python repr / numpy array2string（1.26）
// ============================================================

/** JS 最短往返数字 → { neg, digits, exp }（digits 无前导零，值 = 0.d1d2… × 10^(exp+1)） */
function shortestDigits(x) {
  const s = Math.abs(x).toExponential();
  const [m, e] = s.split('e');
  return { neg: x < 0 || Object.is(x, -0), digits: m.replace('.', ''), exp: parseInt(e, 10) };
}

/** Python float repr（'r' 格式：-4 ≤ 指数 < 16 用定点，否则科学计数，指数至少两位） */
export function pyFloatRepr(x) {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const { neg, digits, exp } = shortestDigits(x);
  const sign = neg ? '-' : '';
  if (exp >= -4 && exp < 16) {
    if (exp >= 0) {
      if (digits.length <= exp + 1) return `${sign}${digits}${'0'.repeat(exp + 1 - digits.length)}.0`;
      return `${sign}${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
    }
    return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  }
  const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits[0];
  return `${sign}${mant}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
}

const scalarStr = (s) => {
  if (s.dtype === 'bool') return s.v ? 'True' : 'False';
  if (s.dtype === 'int') return String(s.v);
  return pyFloatRepr(s.v);
};

// numpy dragon4 · unique 模式 + 精度上限 8：定点写法拆成整数 / 小数两段
function positionalParts(x) {
  const neg = x < 0 || Object.is(x, -0);
  let s = Math.abs(x).toFixed(8).replace(/0+$/, '');
  const short = pyFloatRepr(Math.abs(x));
  if (!short.includes('e')) {
    const frac = short.split('.')[1];
    if (frac.length <= 8) s = short.replace(/\.0$/, '.');
  }
  const [ip, fp] = s.split('.');
  return { ip: (neg ? '-' : '') + ip, fp: fp || '' };
}

// numpy dragon4 · 科学计数 unique + 精度上限 8：{ ip, fp, exp }
function scientificParts(x) {
  const neg = x < 0 || Object.is(x, -0);
  let s = Math.abs(x).toExponential();
  let [m, e] = s.split('e');
  const frac = m.split('.')[1] || '';
  if (frac.length > 8) {
    [m, e] = Math.abs(x).toExponential(8).split('e');
    m = m.replace(/0+$/, '');
  }
  const [ip, fp] = m.split('.');
  return { ip: (neg ? '-' : '') + ip, fp: fp || '', exp: parseInt(e, 10) };
}

/** 构造一个数组的元素格式化函数（对整份数据统一宽度，复刻 numpy 的 Int/Bool/FloatingFormat） */
function elementFormatter(arr) {
  const vals = arr.map.map((p) => arr.store.data[p]);
  if (arr.dtype === 'bool') {
    const t = arr.shape.length ? ' True' : 'True';
    return (v) => (v ? t : 'False');
  }
  if (arr.dtype === 'int') {
    if (!vals.length) return (v) => String(v);
    const w = Math.max(String(Math.max(...vals)).length, String(Math.min(...vals)).length);
    return (v) => String(v).padStart(w);
  }
  const finite = vals.filter(Number.isFinite);
  const nz = finite.filter((v) => v !== 0).map(Math.abs);
  let expFormat = false;
  if (nz.length) {
    const mx = Math.max(...nz), mn = Math.min(...nz);
    if (mx >= 1e8 || mn < 0.0001 || mx / mn > 1000) expFormat = true;
  }
  let padLeft = 0, padRight = 0, precision = 0, expSize = -1;
  if (!finite.length) {
    padLeft = 0; padRight = 0;
  } else if (expFormat) {
    const parts = finite.map(scientificParts);
    const expStrs = parts.map((p) => (p.exp < 0 ? '-' : '+') + String(Math.abs(p.exp)).padStart(2, '0'));
    expSize = Math.max(...expStrs.map((s) => s.length)) - 1;
    precision = Math.max(...parts.map((p) => p.fp.length));
    padLeft = Math.max(...parts.map((p) => p.ip.length));
    padRight = expSize + 2 + precision;
  } else {
    const parts = finite.map(positionalParts);
    padLeft = Math.max(...parts.map((p) => p.ip.length));
    padRight = Math.max(...parts.map((p) => p.fp.length));
  }
  if (finite.length !== vals.length) {
    const neginf = vals.some((v) => v === -Infinity);
    const offset = padRight + 1;
    padLeft = Math.max(padLeft, 3 - offset, 3 + (neginf ? 1 : 0) - offset);
  }
  return (v) => {
    if (!Number.isFinite(v)) {
      const ret = Number.isNaN(v) ? 'nan' : v < 0 ? '-inf' : 'inf';
      return ret.padStart(padLeft + padRight + 1);
    }
    if (expFormat) {
      const p = scientificParts(v);
      // 统一精度：先按统一的小数位重排（min_digits = precision，trim='k'）
      let fp = p.fp;
      let ip = p.ip;
      let exp = p.exp;
      if (fp.length < precision) fp = fp.padEnd(precision, '0');
      const e = (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(expSize, '0');
      return `${ip.padStart(padLeft)}.${fp}e${e}`;
    }
    const p = positionalParts(v);
    return `${p.ip.padStart(padLeft)}.${p.fp.padEnd(padRight)}`;
  };
}

/** numpy _formatArray：递归排版 + 折行（linewidth 75、hanging indent 对齐 '['） */
function formatArray(arr, fmt, lineWidth, nextLinePrefix, separator) {
  const strides = [];
  let acc = 1;
  for (let i = arr.shape.length - 1; i >= 0; i--) { strides[i] = acc; acc *= arr.shape[i]; }
  const extendLine = (st, line, word, width, prefix) => {
    let needsWrap = line.length + word.length > width;
    if (line.length <= prefix.length) needsWrap = false;
    if (needsWrap) {
      st.s += line.replace(/\s+$/, '') + '\n';
      line = prefix;
    }
    return line + word;
  };
  const recurse = (offset, axis, hanging, currWidth) => {
    const axesLeft = arr.shape.length - axis;
    if (axesLeft === 0) return fmt(arr.at(offset));
    const nextHanging = hanging + ' ';
    const nextWidth = currWidth - 1;
    const n = arr.shape[axis];
    const st = { s: '' };
    if (axesLeft === 1) {
      const elemWidth = currWidth - Math.max(separator.replace(/\s+$/, '').length, 1);
      let line = hanging;
      for (let i = 0; i < n - 1; i++) {
        const word = recurse(offset + i * strides[axis], axis + 1, nextHanging, nextWidth);
        line = extendLine(st, line, word, elemWidth, hanging);
        line += separator;
      }
      if (n > 0) {
        const word = recurse(offset + (n - 1) * strides[axis], axis + 1, nextHanging, nextWidth);
        line = extendLine(st, line, word, elemWidth, hanging);
      }
      st.s += line;
    } else {
      const lineSep = separator.replace(/\s+$/, '') + '\n'.repeat(axesLeft - 1);
      for (let i = 0; i < n - 1; i++) {
        st.s += hanging + recurse(offset + i * strides[axis], axis + 1, nextHanging, nextWidth) + lineSep;
      }
      if (n > 0) st.s += hanging + recurse(offset + (n - 1) * strides[axis], axis + 1, nextHanging, nextWidth);
    }
    return '[' + st.s.slice(hanging.length) + ']';
  };
  return recurse(0, 0, nextLinePrefix, lineWidth);
}

/** str(ndarray)：print 的样子 */
export function arrayStr(arr) {
  if (arr.shape.length === 0) return scalarStr(new Scalar(arr.at(0), arr.dtype, true));
  if (arr.size === 0) return '[]';
  return formatArray(arr, elementFormatter(arr), 75, ' ', ' ');
}

/** repr(ndarray)：array([...]) */
export function arrayRepr(arr) {
  const prefix = 'array(';
  let lst;
  if (arr.size > 0 || (arr.shape.length === 1 && arr.shape[0] === 0)) {
    lst = arr.size === 0 ? '[]' : formatArray(arr, elementFormatter(arr), 75 - 1, ' '.repeat(1 + prefix.length), ', ');
  } else {
    lst = `[], shape=${reprValue(new PyTuple(arr.shape.map(pyInt)))}`;
  }
  const skipDtype = arr.size > 0;
  if (skipDtype) return `${prefix}${lst})`;
  const arrStr = `${prefix}${lst},`;
  const dtypeStr = `dtype=${dtypeName(arr.dtype)})`;
  const lastLen = arrStr.length - (arrStr.lastIndexOf('\n') + 1);
  const spacer = lastLen + dtypeStr.length + 1 > 75 ? '\n' + ' '.repeat(prefix.length) : ' ';
  return arrStr + spacer + dtypeStr;
}

const dtypeName = (d) => (d === 'int' ? 'int64' : d === 'float' ? 'float64' : 'bool');

/** str(v)：print / 控制台显示用 */
export function strValue(v) {
  if (v instanceof NDArray) return arrayStr(v);
  if (v instanceof PyStr) return v.s;
  if (v instanceof PyDType) return dtypeName(v.dtype);
  return reprValue(v);
}

/** repr(v)：容器内元素的写法 */
export function reprValue(v) {
  if (v === NONE) return 'None';
  if (v instanceof Scalar) return scalarStr(v);
  if (v instanceof NDArray) return arrayRepr(v);
  if (v instanceof PyList) return `[${v.items.map(reprValue).join(', ')}]`;
  if (v instanceof PyTuple) return v.items.length === 1 ? `(${reprValue(v.items[0])},)` : `(${v.items.map(reprValue).join(', ')})`;
  if (v instanceof PyStr) return `'${v.s}'`;
  if (v instanceof PySlice) return `slice(${[v.start, v.stop, v.step].map((x) => (x === null ? 'None' : String(x))).join(', ')})`;
  if (v instanceof PyFunc) return `<function ${v.name}>`;
  if (v instanceof PyModule) return `<module '${v.name}'>`;
  if (v instanceof PyDType) return `dtype('${dtypeName(v.dtype)}')`;
  return String(v);
}

// ============================================================
// 词法
// ============================================================

const KEYWORDS = new Set(['for', 'while', 'if', 'else', 'elif', 'def', 'return', 'lambda', 'class', 'import', 'from', 'as',
  'in', 'is', 'not', 'and', 'or', 'with', 'try', 'except', 'finally', 'pass', 'break', 'continue', 'global', 'nonlocal',
  'del', 'yield', 'assert', 'raise', 'async', 'await']);
const OPS3 = ['**=', '//=', '>>=', '<<=', '...'];
const OPS2 = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=', '<<', '>>', '->', ':='];
const OPS1 = '+-*/%&|^~<>=()[]{},:.;@';

function tokenize(src) {
  const toks = [];
  let i = 0;
  let depth = 0;
  let lineStart = true;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      if (depth === 0) { toks.push({ t: 'nl', pos: i }); lineStart = true; }
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      const st = i;
      while (i < n && (src[i] === ' ' || src[i] === '\t' || src[i] === '\r')) i++;
      if (lineStart && depth === 0 && toks.length && i < n && src[i] !== '\n' && src[i] !== '#') {
        throw err('IndentationError', 'unexpected indent', '这一行前面多了空格：一句咒语要顶格写（这里不写缩进块）。');
      }
      void st;
      continue;
    }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    lineStart = false;
    const rest = src.slice(i);
    const num = /^(?:\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+|\d+)/.exec(rest);
    if (num) {
      let text = num[0];
      i += text.length;
      if (src[i] === 'j' || src[i] === 'J') throw err('TypeError', 'complex numbers are not supported here', '高原魔法不支持复数。');
      if (/[A-Za-z_]/.test(src[i] || '')) throw err('SyntaxError', 'invalid decimal literal', '数字后面紧跟了字母：中间是不是漏了运算符？');
      const isFloat = /[.eE]/.test(text);
      if (!isFloat && text.length > 1 && text[0] === '0' && /[1-9]/.test(text)) {
        throw err('SyntaxError', 'leading zeros in decimal integer literals are not permitted', '整数不能以 0 开头（写 7 而不是 07）。');
      }
      toks.push({ t: 'num', v: Number(text), float: isFloat, pos: i - text.length });
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (name) {
      const id = name[0];
      toks.push({ t: KEYWORDS.has(id) ? 'kw' : 'name', v: id, pos: i });
      i += id.length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\' && j + 1 < n) { s += src[j + 1]; j += 2; continue; }
        s += src[j++];
      }
      if (src[j] !== c) throw err('SyntaxError', 'unterminated string literal', '字符串缺少结尾的引号。');
      toks.push({ t: 'str', v: s, pos: i });
      i = j + 1;
      continue;
    }
    const op3 = OPS3.find((o) => rest.startsWith(o));
    const op2 = !op3 && OPS2.find((o) => rest.startsWith(o));
    const op = op3 || op2 || (OPS1.includes(c) ? c : null);
    if (!op) {
      if ('，（）【】：；＝'.includes(c)) {
        throw err('SyntaxError', `invalid character '${c}' (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`,
          `「${c}」是中文全角符号：请切换到英文输入法再写。`);
      }
      throw err('SyntaxError', `invalid character '${c}'`, `出现了 Python 不认识的字符「${c}」。`);
    }
    if ('([{'.includes(op)) depth++;
    if (')]}'.includes(op)) depth = Math.max(0, depth - 1);
    toks.push({ t: 'op', v: op, pos: i });
    i += op.length;
  }
  toks.push({ t: 'eof', pos: n });
  return toks;
}

// ============================================================
// 语法
// ============================================================

const COMPARE = new Set(['<', '>', '==', '!=', '<=', '>=']);
const AUG = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=']);

class Parser {
  constructor(toks) { this.toks = toks; this.i = 0; this.depth = 0; }
  peek(k = 0) { return this.toks[this.i + k]; }
  next() { return this.toks[this.i++]; }
  isOp(v, k = 0) { const t = this.peek(k); return t.t === 'op' && t.v === v; }
  isKw(v) { const t = this.peek(); return t.t === 'kw' && t.v === v; }
  eat(v) {
    if (!this.isOp(v)) {
      const t = this.peek();
      if (t.t === 'eof') {
        const open = { ')': '(', ']': '[', '}': '{' }[v];
        throw err('SyntaxError', open ? `'${open}' was never closed` : 'unexpected EOF while parsing',
          open ? `括号「${open}」没有配对的「${v}」。` : '咒语还没写完。');
      }
      throw err('SyntaxError', 'invalid syntax', `这里应该是「${v}」。`);
    }
    return this.next();
  }
  enter() {
    if (++this.depth > LIMITS.maxDepth) throw err('RecursionError', 'expression too deeply nested', '括号嵌套太深了。');
  }
  leave() { this.depth--; }

  program() {
    const stmts = [];
    while (this.peek().t !== 'eof') {
      if (this.isOp(';') || this.peek().t === 'nl') { this.next(); continue; }
      stmts.push(this.statement());
      const t = this.peek();
      if (t.t === 'eof') break;
      if (this.isOp(';') || t.t === 'nl') { this.next(); continue; }
      throw this.unexpected(t);
    }
    return stmts;
  }

  unexpected(t) {
    if (t.t === 'op' && (t.v === ')' || t.v === ']' || t.v === '}')) {
      return err('SyntaxError', `unmatched '${t.v}'`, `多了一个「${t.v}」，找不到与它配对的左括号。`);
    }
    if (t.t === 'op' && t.v === '=') {
      return err('SyntaxError', "invalid syntax. Maybe you meant '==' or ':=' instead of '='?", '「=」是赋值；比较两个值是否相等要用「==」。');
    }
    return err('SyntaxError', 'invalid syntax', '语法错误：检查括号、逗号、冒号是否齐全，运算符之间是否漏了东西。');
  }

  statement() {
    const t = this.peek();
    if (t.t === 'kw') {
      if (t.v === 'import' || t.v === 'from') return this.importStmt();
      if (t.v === 'pass') { this.next(); return { t: 'pass' }; }
      if (['for', 'while', 'if', 'def', 'lambda', 'class', 'with', 'try', 'return', 'break', 'continue'].includes(t.v)) {
        throw err('SyntaxError', `'${t.v}' statements are not available here`,
          t.v === 'for' || t.v === 'while'
            ? '高原的魔法只认一行向量化咒语——不写循环，让整个数组一次完成运算（这正是 NumPy 的威力）。'
            : `这里只能写表达式和赋值，不能写「${t.v}」语句。`);
      }
    }
    const first = this.expr();
    if (this.isOp('=')) {
      const targets = [first];
      let value;
      while (this.isOp('=')) {
        this.next();
        value = this.expr();
        if (this.isOp('=')) targets.push(value);
      }
      targets.forEach((tg) => this.checkTarget(tg));
      return { t: 'assign', targets, value };
    }
    const nt = this.peek();
    if (nt.t === 'op' && AUG.has(nt.v)) {
      this.next();
      this.checkTarget(first);
      return { t: 'aug', target: first, op: nt.v.slice(0, -1), value: this.expr() };
    }
    if (nt.t === 'op' && nt.v === ',') {
      throw err('SyntaxError', 'tuple unpacking is not supported here', '这里一次只给一个名字赋值（不支持 a, b = …）。');
    }
    return { t: 'expr', e: first };
  }

  checkTarget(tg) {
    if (tg.t === 'name' || tg.t === 'sub') return;
    if (tg.t === 'call') {
      throw err('SyntaxError', "cannot assign to function call here. Maybe you meant '==' instead of '='?",
        '「=」左边不能是函数调用；比较相等请用「==」。');
    }
    if (tg.t === 'attr') throw err('AttributeError', 'attribute assignment is not supported here', '这里不能给属性赋值（例如 a.shape = …）；改形状请用 reshape。');
    if (tg.t === 'num' || tg.t === 'const') {
      throw err('SyntaxError', "cannot assign to literal here. Maybe you meant '==' instead of '='?", '「=」左边要写变量名；比较相等请用「==」。');
    }
    throw err('SyntaxError', "cannot assign to expression here. Maybe you meant '==' instead of '='?",
      '「=」左边只能是变量名或下标（例如 a[0] = 1）；比较相等请用「==」。');
  }

  importStmt() {
    const words = [];
    while (this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.isOp(';')) words.push(this.next().v);
    const s = words.join(' ');
    if (s === 'import numpy as np' || s === 'import numpy') return { t: 'pass', note: 'import' };
    throw err('ImportError', `cannot run '${s}' here`, '高原上已经备好了 numpy（就是 np），不需要也不能导入别的模块。');
  }

  expr() {
    this.enter();
    const t = this.peek();
    if (t.t === 'kw' && t.v === 'lambda') throw err('SyntaxError', 'lambda is not available here', '这里不能写 lambda。');
    let e = this.orExpr();
    if (this.isKw('if')) throw err('SyntaxError', 'conditional expressions are not available here', '这里不支持「x if 条件 else y」写法，试试 np.where(条件, x, y)。');
    this.leave();
    return e;
  }
  orExpr() {
    let l = this.andExpr();
    while (this.isKw('or')) { this.next(); l = { t: 'bool', op: 'or', l, r: this.andExpr() }; }
    return l;
  }
  andExpr() {
    let l = this.notExpr();
    while (this.isKw('and')) { this.next(); l = { t: 'bool', op: 'and', l, r: this.notExpr() }; }
    return l;
  }
  notExpr() {
    if (this.isKw('not')) { this.next(); return { t: 'not', e: this.notExpr() }; }
    return this.comparison();
  }
  comparison() {
    const first = this.bitOr();
    const ops = [];
    const operands = [first];
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && COMPARE.has(t.v)) { this.next(); ops.push(t.v); operands.push(this.bitOr()); continue; }
      if (t.t === 'kw' && (t.v === 'in' || t.v === 'is')) throw err('SyntaxError', `'${t.v}' is not available here`, `这里不支持「${t.v}」运算。`);
      break;
    }
    return ops.length ? { t: 'cmp', ops, operands } : first;
  }
  bitOr() { let l = this.bitXor(); while (this.isOp('|')) { this.next(); l = { t: 'bin', op: '|', l, r: this.bitXor() }; } return l; }
  bitXor() { let l = this.bitAnd(); while (this.isOp('^')) { this.next(); l = { t: 'bin', op: '^', l, r: this.bitAnd() }; } return l; }
  bitAnd() { let l = this.shift(); while (this.isOp('&')) { this.next(); l = { t: 'bin', op: '&', l, r: this.shift() }; } return l; }
  shift() {
    const l = this.arith();
    if (this.isOp('<<') || this.isOp('>>')) throw err('SyntaxError', 'shift operators are not available here', '这里不支持位移运算 << >>。');
    return l;
  }
  arith() {
    let l = this.term();
    while (this.isOp('+') || this.isOp('-')) { const op = this.next().v; l = { t: 'bin', op, l, r: this.term() }; }
    return l;
  }
  term() {
    let l = this.factor();
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%') || this.isOp('@')) {
      const op = this.next().v;
      if (op === '@') throw err('SyntaxError', "the '@' operator is not available here", '这里不支持矩阵乘法 @。');
      l = { t: 'bin', op, l, r: this.factor() };
    }
    return l;
  }
  factor() {
    if (this.isOp('-') || this.isOp('+') || this.isOp('~')) {
      const op = this.next().v;
      this.enter();
      const e = this.factor();
      this.leave();
      return { t: 'unary', op, e };
    }
    return this.power();
  }
  power() {
    const base = this.primary();
    if (this.isOp('**')) { this.next(); this.enter(); const e = this.factor(); this.leave(); return { t: 'bin', op: '**', l: base, r: e }; }
    return base;
  }
  primary() {
    let e = this.atom();
    for (;;) {
      if (this.isOp('.')) {
        this.next();
        const t = this.next();
        if (t.t !== 'name') throw err('SyntaxError', 'invalid syntax', '「.」后面应该跟属性或方法名，例如 a.sum()。');
        e = { t: 'attr', obj: e, name: t.v };
      } else if (this.isOp('(')) {
        this.next();
        const args = [];
        const kwargs = [];
        while (!this.isOp(')')) {
          if (this.peek().t === 'name' && this.isOp('=', 1)) {
            const name = this.next().v;
            this.next();
            kwargs.push({ name, value: this.expr() });
          } else {
            if (kwargs.length) throw err('SyntaxError', 'positional argument follows keyword argument', '位置参数要写在关键字参数（如 axis=0）前面。');
            if (this.isOp('*') || this.isOp('**')) throw err('SyntaxError', 'argument unpacking is not available here', '这里不支持 * 展开参数。');
            args.push(this.expr());
          }
          if (this.isOp(',')) { this.next(); continue; }
          if (!this.isOp(')')) {
            if (this.peek().t === 'eof') this.eat(')');
            throw err('SyntaxError', 'invalid syntax. Perhaps you forgot a comma?', '参数之间要用逗号隔开。');
          }
        }
        this.eat(')');
        e = { t: 'call', fn: e, args, kwargs };
      } else if (this.isOp('[')) {
        this.next();
        const items = [];
        let trailing = false;
        if (this.isOp(']')) throw err('SyntaxError', 'invalid syntax', '方括号里要写下标，例如 a[0] 或 a[1:3]。');
        while (!this.isOp(']')) {
          items.push(this.subscript());
          trailing = false;
          if (this.isOp(',')) { this.next(); trailing = true; continue; }
          if (!this.isOp(']')) {
            if (this.peek().t === 'eof') this.eat(']');
            throw err('SyntaxError', 'invalid syntax. Perhaps you forgot a comma?', '二维下标要用逗号分隔行和列，例如 a[1, 2]。');
          }
        }
        this.eat(']');
        e = { t: 'sub', obj: e, items, tuple: items.length > 1 || trailing };
      } else break;
    }
    return e;
  }
  subscript() {
    if (this.isOp('...')) { this.next(); return { t: 'ellipsis' }; }
    let start = null;
    if (!this.isOp(':')) {
      start = this.expr();
      if (!this.isOp(':')) return start;
    }
    this.eat(':');
    let stop = null;
    let step = null;
    if (!this.isOp(':') && !this.isOp(',') && !this.isOp(']')) stop = this.expr();
    if (this.isOp(':')) {
      this.next();
      if (!this.isOp(',') && !this.isOp(']')) step = this.expr();
    }
    return { t: 'slice', start, stop, step };
  }
  atom() {
    const t = this.next();
    if (t.t === 'num') return { t: 'num', v: t.v, float: t.float };
    if (t.t === 'str') return { t: 'str', v: t.v };
    if (t.t === 'name') {
      if (t.v === 'True') return { t: 'const', v: 'True' };
      if (t.v === 'False') return { t: 'const', v: 'False' };
      if (t.v === 'None') return { t: 'const', v: 'None' };
      return { t: 'name', id: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      if (this.isOp(')')) { this.next(); return { t: 'tuple', items: [] }; }
      const first = this.expr();
      if (this.isOp(')')) { this.next(); return { t: 'paren', e: first }; }
      const items = [first];
      while (this.isOp(',')) {
        this.next();
        if (this.isOp(')')) break;
        items.push(this.expr());
      }
      this.eat(')');
      return { t: 'tuple', items };
    }
    if (t.t === 'op' && t.v === '[') {
      const items = [];
      while (!this.isOp(']')) {
        items.push(this.expr());
        if (this.isOp(',')) { this.next(); continue; }
        if (!this.isOp(']')) {
          if (this.peek().t === 'eof') this.eat(']');
          throw err('SyntaxError', 'invalid syntax. Perhaps you forgot a comma?', '列表元素之间要用逗号隔开，例如 [1, 2, 3]。');
        }
      }
      this.eat(']');
      return { t: 'list', items };
    }
    if (t.t === 'op' && t.v === '{') throw err('SyntaxError', 'dict and set literals are not available here', '这里不支持字典 / 集合。');
    if (t.t === 'eof') throw err('SyntaxError', 'invalid syntax', '咒语还没写完。');
    if (t.t === 'kw') {
      if (t.v === 'not') return { t: 'not', e: this.notExpr() };
      throw err('SyntaxError', 'invalid syntax', `「${t.v}」是 Python 关键字，不能放在这里。`);
    }
    if (t.t === 'nl') throw err('SyntaxError', 'invalid syntax', '这一行还没写完就换行了。');
    this.i--;
    throw this.unexpected(t);
  }
}

export function parse(src, maxSource = LIMITS.maxSource) {
  if (src.length > maxSource) throw err('SyntaxError', 'spell too long', `咒语太长了（上限 ${maxSource} 字符）。`);
  return new Parser(tokenize(src)).program();
}

// ============================================================
// 转换 / 构造
// ============================================================

/** 嵌套 list / tuple / 标量 / ndarray → ndarray（np.array 语义：总是复制） */
function arrayFromValue(v, dtypeOverride = null) {
  if (v instanceof NDArray) {
    const d = dtypeOverride || v.dtype;
    return makeArray(v.shape, v.map.map((p) => v.store.data[p]), d);
  }
  if (v instanceof Scalar) return makeArray([], [v.v], dtypeOverride || v.dtype);
  if (v instanceof PyStr) throw err('TypeError', 'string arrays are not supported here', '高原魔法只处理数字数组。');
  if (v === NONE) throw err('TypeError', 'None arrays are not supported here', '数组里不能放 None。');
  if (!isSeq(v)) throw err('TypeError', `cannot convert ${typeName(v)} to array`, '这个东西不能变成数组。');
  const shapeOf = (x) => {
    if (x instanceof NDArray) return x.shape.slice();
    if (isSeq(x)) {
      if (!x.items.length) return [0];
      const subs = x.items.map(shapeOf);
      const s0 = JSON.stringify(subs[0]);
      if (subs.some((s) => JSON.stringify(s) !== s0)) return null;
      return subs[0] === null ? null : [x.items.length, ...subs[0]];
    }
    if (x instanceof Scalar) return [];
    throw err('TypeError', `cannot put ${typeName(x)} into an array`, '数组元素只能是数字、True/False 或列表。');
  };
  const shape = shapeOf(v);
  if (!shape) {
    const outer = v.items.length;
    throw err('ValueError',
      `setting an array element with a sequence. The requested array has an inhomogeneous shape after 1 dimensions. The detected shape was (${outer},) + inhomogeneous part.`,
      '每一行的元素个数必须相同——数组必须是规整的方阵。');
  }
  const flat = [];
  let dtype = 'bool';
  const walk = (x) => {
    if (x instanceof NDArray) { for (let i = 0; i < x.size; i++) flat.push(x.at(i)); dtype = promote(dtype, x.dtype); return; }
    if (isSeq(x)) { x.items.forEach(walk); return; }
    flat.push(x.v);
    dtype = promote(dtype, x.dtype);
  };
  walk(v);
  if (!flat.length) dtype = 'float';
  return makeArray(shape, flat, dtypeOverride || dtype);
}

/** 运算用：不复制已有数组 */
function asArray(v) {
  if (v instanceof NDArray) return v;
  return arrayFromValue(v);
}

function broadcastShapes(a, b, what = 'operands') {
  const n = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const da = a[a.length - n + i] ?? 1;
    const db = b[b.length - n + i] ?? 1;
    if (da !== db && da !== 1 && db !== 1) {
      if (what === 'operands') {
        throw err('ValueError', `operands could not be broadcast together with shapes ${fmtShape(a)} ${fmtShape(b)} `,
          `形状 ${fmtShape(a)} 和 ${fmtShape(b)} 对不上，没法广播：从最后一维往前比，每一维要么相等、要么其中一个是 1。`);
      }
      return null;
    }
    out.push(da === 1 ? db : da);
  }
  return out;
}

const fmtShape = (s) => (s.length === 1 ? `(${s[0]},)` : `(${s.join(', ')})`);
const fmtShapeTight = (s) => (s.length === 1 ? `(${s[0]},)` : `(${s.join(',')})`);

/** 返回：输出平铺下标 → 输入平铺下标（逻辑 C 顺序）的映射函数 */
function broadcastIndexer(inShape, outShape) {
  const n = outShape.length;
  const off = n - inShape.length;
  const inStrides = [];
  let acc = 1;
  for (let i = inShape.length - 1; i >= 0; i--) { inStrides[i] = acc; acc *= inShape[i]; }
  if (inShape.length === n && inShape.every((d, i) => d === outShape[i])) return (k) => k;
  return (k) => {
    let rem = k;
    let idx = 0;
    for (let ax = n - 1; ax >= 0; ax--) {
      const d = outShape[ax];
      const c = rem % d;
      rem = (rem - c) / d;
      const ia = ax - off;
      if (ia >= 0 && inShape[ia] !== 1) idx += c * inStrides[ia];
    }
    return idx;
  };
}

function shapeArg(v, fname) {
  if (v instanceof Scalar && v.dtype !== 'float') return [v.v];
  if (isSeq(v)) {
    return v.items.map((x) => {
      if (!(x instanceof Scalar) || x.dtype === 'float') throw err('TypeError', `'${shortType(x)}' object cannot be interpreted as an integer`, `${fname} 的形状要用整数。`);
      return x.v;
    });
  }
  if (v instanceof Scalar) throw err('TypeError', "'float' object cannot be interpreted as an integer", `${fname} 的形状要用整数，例如 (2, 3)。`);
  throw err('TypeError', `expected a shape like (2, 3), got ${shortType(v)}`, `${fname} 的形状写成整数或元组，例如 (2, 3)。`);
}

function dtypeArg(v) {
  if (v === undefined || v === NONE) return null;
  if (v instanceof PyFunc && v.dtypeName) return v.dtypeName;
  if (v instanceof PyDType) return v.dtype;
  if (v instanceof PyStr) {
    const s = v.s;
    if (/^(int|int64|int32|i8|i4|long)$/.test(s)) return 'int';
    if (/^(float|float64|float32|f8|f4|double)$/.test(s)) return 'float';
    if (/^(bool|bool_|\?)$/.test(s)) return 'bool';
  }
  throw err('TypeError', `data type '${strValue(v)}' not understood`, 'dtype 只支持 int / float / bool。');
}

const toInt = (v, what = 'index') => {
  if (v instanceof Scalar && v.dtype !== 'float') return v.v;
  if (v instanceof NDArray && v.size === 1 && v.dtype !== 'float' && v.shape.length === 0) return v.at(0);
  throw err('TypeError', `'${shortType(v)}' object cannot be interpreted as an integer`, `${what}要用整数。`);
};

// ============================================================
// 元素级运算
// ============================================================

const pyMod = (a, b) => { const m = a % b; return m !== 0 && (m < 0) !== (b < 0) ? m + b : m; };

/** numpy 元素级二元运算；返回 { dtype, f } 或抛错 */
function npBinarySpec(op, da, db) {
  const dk = promote(da, db);
  switch (op) {
    case '+':
      if (dk === 'bool') return { dtype: 'bool', f: (a, b) => (a || b ? 1 : 0) };
      return { dtype: dk, f: (a, b) => a + b };
    case '*':
      if (dk === 'bool') return { dtype: 'bool', f: (a, b) => (a && b ? 1 : 0) };
      return { dtype: dk, f: (a, b) => a * b };
    case '-':
      if (dk === 'bool') {
        throw err('TypeError', 'numpy boolean subtract, the `-` operator, is not supported, use the bitwise_xor, the `^` operator, or the logical_xor function instead.',
          '布尔数组不能相减：想要「异或」用 ^，想把 True/False 当 1/0 相减先 .astype(int)。');
      }
      return { dtype: dk, f: (a, b) => a - b };
    case '/':
      return { dtype: 'float', f: (a, b) => a / b };
    case '//':
      if (dk === 'float') return { dtype: 'float', f: (a, b) => (b === 0 ? a / b : Math.floor(a / b)) };
      return { dtype: dk === 'bool' ? 'int' : dk, f: (a, b) => (b === 0 ? 0 : Math.floor(a / b)) };
    case '%':
      if (dk === 'float') return { dtype: 'float', f: (a, b) => (b === 0 ? NaN : pyMod(a, b)) };
      return { dtype: dk === 'bool' ? 'int' : dk, f: (a, b) => (b === 0 ? 0 : pyMod(a, b)) };
    case '**':
      if (dk === 'float') return { dtype: 'float', f: (a, b) => a ** b };
      return {
        dtype: dk === 'bool' ? 'int' : dk,
        f: (a, b) => {
          if (b < 0) throw err('ValueError', 'Integers to negative integer powers are not allowed.', '整数数组不能做负整数次幂：先写成浮点数，例如 a ** -1.0 或 1 / a。');
          return a ** b;
        },
      };
    case '&': case '|': case '^': {
      if (dk === 'float') {
        const name = { '&': 'bitwise_and', '|': 'bitwise_or', '^': 'bitwise_xor' }[op];
        throw err('TypeError', `ufunc '${name}' not supported for the input types, and the inputs could not be safely coerced to any supported types according to the casting rule ''safe''`,
          op === '&' || op === '|'
            ? '& 和 | 只能连接布尔数组（条件）。多个条件请各自加括号：(a > 2) & (a < 4)——& 比 > 优先级高，不加括号会先算 2 & a。'
            : '^ 只能用于整数或布尔数组。');
      }
      const fb = { '&': (a, b) => a & b, '|': (a, b) => a | b, '^': (a, b) => a ^ b }[op];
      return { dtype: dk, f: fb };
    }
    case '<': return { dtype: 'bool', f: (a, b) => (a < b ? 1 : 0) };
    case '>': return { dtype: 'bool', f: (a, b) => (a > b ? 1 : 0) };
    case '<=': return { dtype: 'bool', f: (a, b) => (a <= b ? 1 : 0) };
    case '>=': return { dtype: 'bool', f: (a, b) => (a >= b ? 1 : 0) };
    case '==': return { dtype: 'bool', f: (a, b) => (a === b ? 1 : 0) };
    case '!=': return { dtype: 'bool', f: (a, b) => (a !== b ? 1 : 0) };
    default: throw err('TypeError', `unsupported operator ${op}`);
  }
}

function arrayBinary(op, a, b) {
  const A = asArray(a), B = asArray(b);
  const spec = npBinarySpec(op, A.dtype, B.dtype);
  const shape = broadcastShapes(A.shape, B.shape);
  const n = prod(shape);
  checkSize(n);
  const ia = broadcastIndexer(A.shape, shape);
  const ib = broadcastIndexer(B.shape, shape);
  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = spec.f(A.at(ia(k)), B.at(ib(k)));
  return makeArray(shape, out, spec.dtype);
}

/** 0 维结果转 numpy 标量 */
const squeeze0 = (arr) => (arr.shape.length === 0 ? npScalar(arr.at(0), arr.dtype) : arr);

function pyScalarBinary(op, a, b) {
  const isF = a.dtype === 'float' || b.dtype === 'float';
  const x = a.v, y = b.v;
  const bothBool = a.dtype === 'bool' && b.dtype === 'bool';
  switch (op) {
    case '+': return isF ? pyFloat(x + y) : pyInt(x + y);
    case '-': return isF ? pyFloat(x - y) : pyInt(x - y);
    case '*': return isF ? pyFloat(x * y) : pyInt(x * y);
    case '/':
      if (y === 0) throw err('ZeroDivisionError', isF ? 'float division by zero' : 'division by zero', '除数是 0。');
      return pyFloat(x / y);
    case '//':
      if (y === 0) throw err('ZeroDivisionError', isF ? 'float floor division by zero' : 'integer division or modulo by zero', '除数是 0。');
      return isF ? pyFloat(Math.floor(x / y)) : pyInt(Math.floor(x / y));
    case '%':
      if (y === 0) throw err('ZeroDivisionError', isF ? 'float modulo' : 'integer division or modulo by zero', '除数是 0。');
      return isF ? pyFloat(pyMod(x, y)) : pyInt(pyMod(x, y));
    case '**':
      if (!isF && y >= 0) return pyInt(x ** y);
      if (x === 0 && y < 0) throw err('ZeroDivisionError', '0.0 cannot be raised to a negative power', '0 不能做负数次幂。');
      if (x < 0 && !Number.isInteger(y)) throw err('ValueError', 'complex result', '负数的小数次幂是复数，高原魔法不支持。');
      return pyFloat(x ** y);
    case '&': case '|': case '^': {
      if (isF) {
        throw err('TypeError', `unsupported operand type(s) for ${op}: '${shortType(a)}' and '${shortType(b)}'`,
          '& | ^ 不能用于小数；连接两个条件时请写 (a > 2) & (a < 4)。');
      }
      const r = op === '&' ? x & y : op === '|' ? x | y : x ^ y;
      return bothBool ? pyBool(r) : pyInt(r);
    }
    case '<': return pyBool(x < y);
    case '>': return pyBool(x > y);
    case '<=': return pyBool(x <= y);
    case '>=': return pyBool(x >= y);
    case '==': return pyBool(x === y);
    case '!=': return pyBool(x !== y);
    default: throw err('TypeError', `unsupported operator ${op}`);
  }
}

function binary(op, a, b) {
  const unsupported = () => err('TypeError', `unsupported operand type(s) for ${op}: '${shortType(a)}' and '${shortType(b)}'`,
    a instanceof PyList || b instanceof PyList
      ? 'Python 列表不会逐元素运算：先用 np.array(...) 把它变成数组。'
      : `「${shortType(a)}」和「${shortType(b)}」之间不能做 ${op} 运算。`);
  if (isArr(a) || isArr(b)) {
    const ok = (v) => isArr(v) || isNum(v) || isSeq(v);
    if (!ok(a) || !ok(b)) throw unsupported();
    return squeeze0(arrayBinary(op, a, b));
  }
  if (isNum(a) && isNum(b)) {
    if (a.np || b.np) return squeeze0(arrayBinary(op, a, b));
    return pyScalarBinary(op, a, b);
  }
  // Python 列表语义（学生常以为列表会逐元素运算）
  if (op === '+' && a instanceof PyList && b instanceof PyList) return new PyList([...a.items, ...b.items]);
  if (op === '+' && a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
  if (op === '*' && isSeq(a) && isNum(b) && b.dtype !== 'float') return repeatSeq(a, b.v);
  if (op === '*' && isNum(a) && a.dtype !== 'float' && isSeq(b)) return repeatSeq(b, a.v);
  if (op === '==' || op === '!=') {
    const eq = reprValue(a) === reprValue(b) && typeName(a) === typeName(b);
    return pyBool(op === '==' ? eq : !eq);
  }
  if (COMPARE.has(op) && (isSeq(a) || isSeq(b))) {
    throw err('TypeError', `'${op}' not supported between instances of '${shortType(a)}' and '${shortType(b)}'`,
      'Python 列表不会逐元素比较：先用 np.array(...) 变成数组。');
  }
  throw unsupported();
}

function repeatSeq(s, n) {
  const items = [];
  for (let i = 0; i < Math.max(0, n); i++) items.push(...s.items);
  checkSize(items.length);
  return s instanceof PyList ? new PyList(items) : new PyTuple(items);
}

function unary(op, v) {
  if (isNum(v) && !v.np) {
    if (op === '-') return v.dtype === 'float' ? pyFloat(-v.v) : pyInt(-v.v);
    if (op === '+') return v.dtype === 'float' ? pyFloat(v.v) : pyInt(v.v);
    if (v.dtype === 'float') throw err('TypeError', "bad operand type for unary ~: 'float'", '~ 只能用于整数或布尔数组。');
    return pyInt(~v.v);
  }
  if (isNum(v) || isArr(v)) {
    const A = asArray(v);
    let f, dtype = A.dtype;
    if (op === '-') {
      if (A.dtype === 'bool') {
        throw err('TypeError', 'The numpy boolean negative, the `-` operator, is not supported, use the `~` operator or the logical_not function instead.',
          '布尔数组取反请用 ~（例如 ~mask），不能用负号。');
      }
      f = (x) => -x;
    } else if (op === '+') {
      f = (x) => x;
    } else {
      if (A.dtype === 'float') {
        throw err('TypeError', "ufunc 'invert' not supported for the input types, and the inputs could not be safely coerced to any supported types according to the casting rule ''safe''",
          '~ 只能用于布尔数组（取反条件）或整数数组。');
      }
      f = A.dtype === 'bool' ? (x) => (x ? 0 : 1) : (x) => ~x;
    }
    const out = [];
    for (let i = 0; i < A.size; i++) out.push(f(A.at(i)));
    return squeeze0(makeArray(A.shape, out, dtype));
  }
  throw err('TypeError', `bad operand type for unary ${op}: '${shortType(v)}'`, `「${shortType(v)}」不能取 ${op}。`);
}

function truth(v) {
  if (v === NONE) return false;
  if (v instanceof Scalar) return v.v !== 0; // NaN 为真（与 Python 一致）
  if (isSeq(v)) return v.items.length > 0;
  if (v instanceof PyStr) return v.s.length > 0;
  if (v instanceof NDArray) {
    if (v.size === 1) return v.at(0) !== 0;
    if (v.size === 0) return false;
    throw err('ValueError', 'The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()',
      '数组不能直接当作「真 / 假」：组合两个条件请用 & 或 |，并给每个条件加括号，例如 (a > 2) & (a < 4)；也不要写 2 < a < 4 这种连续比较。');
  }
  return true;
}

// ============================================================
// 下标
// ============================================================

/** Python 切片 → 下标列表 */
function sliceIndices(sl, n) {
  const step = sl.step === null ? 1 : sl.step;
  if (step === 0) throw err('ValueError', 'slice step cannot be zero', '切片步长不能是 0。');
  let start, stop;
  if (step > 0) {
    start = sl.start === null ? 0 : sl.start < 0 ? Math.max(0, sl.start + n) : Math.min(sl.start, n);
    stop = sl.stop === null ? n : sl.stop < 0 ? Math.max(0, sl.stop + n) : Math.min(sl.stop, n);
  } else {
    start = sl.start === null ? n - 1 : sl.start < 0 ? Math.max(-1, sl.start + n) : Math.min(sl.start, n - 1);
    stop = sl.stop === null ? -1 : sl.stop < 0 ? Math.max(-1, sl.stop + n) : Math.min(sl.stop, n - 1);
  }
  const out = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
  else for (let i = start; i > stop; i += step) out.push(i);
  return out;
}

function stridesOf(shape) {
  const st = [];
  let acc = 1;
  for (let i = shape.length - 1; i >= 0; i--) { st[i] = acc; acc *= shape[i]; }
  return st;
}

/**
 * 解析下标 → { shape, logical: 选中元素在 arr 逻辑顺序里的下标列表, view: 是否视图, scalar: 是否标量结果, usage }
 * items：已求值的下标项（Scalar / PySlice / NONE / NDArray / PyList …），或 'ellipsis'
 */
function resolveIndex(arr, rawItems, usage) {
  const items = [];
  let ellipsis = 0;
  for (const it of rawItems) {
    if (it === 'ellipsis') { ellipsis++; items.push('ellipsis'); continue; }
    if (it instanceof PyList || it instanceof PyTuple) {
      const a = arrayFromValue(it);
      if (a.dtype === 'float') throw err('IndexError', 'arrays used as indices must be of integer (or boolean) type', '用作下标的数组必须是整数或布尔数组。');
      items.push(a);
      continue;
    }
    items.push(it);
  }
  if (ellipsis > 1) throw err('IndexError', "an index can only have a single ellipsis ('...')", '下标里只能有一个 ...');
  let sawMask = false;
  // 布尔数组展开成每一维的整数下标（nonzero）
  const expanded = [];
  let axis = 0;
  const consumes = (it) => (it === NONE || it === 'ellipsis' ? 0 : it instanceof NDArray && it.dtype === 'bool' ? Math.max(1, it.ndim) : 1);
  const totalConsume = items.reduce((s, it) => s + consumes(it), 0);
  for (const it of items) {
    if (it === 'ellipsis') {
      const fill = arr.ndim - totalConsume;
      for (let k = 0; k < fill; k++) { expanded.push(new PySlice(null, null, null)); axis++; }
      continue;
    }
    if (it instanceof NDArray && it.dtype === 'bool') {
      usage.mask = (usage.mask || 0) + 1;
      sawMask = true;
      if (it.ndim === 0) throw err('IndexError', 'boolean scalar indices are not supported here', '不支持用单个 True/False 当下标。');
      for (let d = 0; d < it.ndim; d++) {
        const dim = arr.shape[axis + d];
        if (dim === undefined) {
          throw err('IndexError', `too many indices for array: array is ${arr.ndim}-dimensional, but ${totalConsume} were indexed`, '下标的维数比数组多了。');
        }
        if (it.shape[d] !== dim) {
          throw err('IndexError', `boolean index did not match indexed array along dimension ${axis + d}; dimension is ${dim} but corresponding boolean dimension is ${it.shape[d]}`,
            `布尔掩膜的形状要和数组一致：第 ${axis + d} 维数组有 ${dim} 个，掩膜却有 ${it.shape[d]} 个。`);
        }
      }
      const st = stridesOf(it.shape);
      const idxLists = range(it.ndim).map(() => []);
      for (let k = 0; k < it.size; k++) {
        if (!it.at(k)) continue;
        let rem = k;
        for (let d = 0; d < it.ndim; d++) { const q = Math.floor(rem / st[d]); rem -= q * st[d]; idxLists[d].push(q); }
      }
      idxLists.forEach((l) => expanded.push(makeArray([l.length], l, 'int')));
      axis += it.ndim;
      continue;
    }
    if (it instanceof NDArray) {
      if (it.dtype === 'float') throw err('IndexError', 'arrays used as indices must be of integer (or boolean) type', '用作下标的数组必须是整数或布尔数组。');
      usage.fancy = (usage.fancy || 0) + 1;
      expanded.push(it);
      axis++;
      continue;
    }
    if (it instanceof PySlice) {
      expanded.push(it);
      usage.slice = (usage.slice || 0) + 1;
      if (it.step !== null && it.step !== 1) usage.step = (usage.step || 0) + 1;
      if ((it.start ?? 0) < 0 || (it.stop ?? 0) < 0 || (it.step ?? 1) < 0) usage.negative = (usage.negative || 0) + 1;
      axis++;
      continue;
    }
    if (it === NONE) { expanded.push(NONE); usage.newaxis = (usage.newaxis || 0) + 1; continue; }
    if (it instanceof Scalar) {
      if (it.dtype === 'float') {
        throw err('IndexError', 'only integers, slices (`:`), ellipsis (`...`), numpy.newaxis (`None`) and integer or boolean arrays are valid indices',
          '下标必须是整数（不能是小数，例如 a[2] 而不是 a[2.0]）。');
      }
      if (it.dtype === 'bool') throw err('IndexError', 'boolean scalar indices are not supported here', '不支持用单个 True/False 当下标。');
      usage.int = (usage.int || 0) + 1;
      if (it.v < 0) usage.negative = (usage.negative || 0) + 1;
      expanded.push(it);
      axis++;
      continue;
    }
    throw err('IndexError', 'only integers, slices (`:`), ellipsis (`...`), numpy.newaxis (`None`) and integer or boolean arrays are valid indices',
      '下标只能是整数、切片、布尔掩膜或整数数组。');
  }
  const used = expanded.filter((it) => it !== NONE).length;
  if (used > arr.ndim) {
    throw err('IndexError', `too many indices for array: array is ${arr.ndim}-dimensional, but ${used} were indexed`,
      arr.ndim === 1 ? '这是一维数组，只能写一个下标（例如 a[2]），不能写 a[1, 2]。' : `这是 ${arr.ndim} 维数组，下标最多写 ${arr.ndim} 个。`);
  }
  while (expanded.filter((it) => it !== NONE).length < arr.ndim) expanded.push(new PySlice(null, null, null));

  const strides = stridesOf(arr.shape);
  const hasAdvanced = expanded.some((it) => it instanceof NDArray);
  if (!hasAdvanced) {
    // 基本下标 → 视图
    const dims = []; // { list, keep }
    let ax = 0;
    for (const it of expanded) {
      if (it === NONE) { dims.push({ list: [0], stride: 0, keep: true }); continue; }
      const n = arr.shape[ax];
      if (it instanceof Scalar) {
        let i = it.v;
        if (i < -n || i >= n) {
          throw err('IndexError', `index ${i} is out of bounds for axis ${ax} with size ${n}`,
            `下标越界：第 ${ax} 维只有 ${n} 个元素，下标只能是 0 ~ ${n - 1}（或 -1 ~ -${n}）。`);
        }
        if (i < 0) i += n;
        dims.push({ list: [i], stride: strides[ax], keep: false });
      } else {
        dims.push({ list: sliceIndices(it, n), stride: strides[ax], keep: true });
      }
      ax++;
    }
    const shape = dims.filter((d) => d.keep).map((d) => d.list.length);
    const logical = [];
    const rec = (k, base) => {
      if (k === dims.length) { logical.push(base); return; }
      for (const i of dims[k].list) rec(k + 1, base + i * dims[k].stride);
    };
    rec(0, 0);
    return { shape, logical, view: true, scalar: shape.length === 0 && !dims.some((d) => d.keep) };
  }

  // 高级下标：整数标量也算高级下标，广播所有高级下标的形状
  if (expanded.some((it) => it === NONE)) throw err('IndexError', 'mixing None with array indices is not supported here', '这里不支持把 None 和数组下标混用。');
  const advPos = [];
  const advArrays = [];
  expanded.forEach((it, k) => {
    if (it instanceof NDArray || it instanceof Scalar) { advPos.push(k); advArrays.push(asArray(it)); }
  });
  let bshape = [];
  for (const a of advArrays) {
    const s = broadcastShapes(bshape, a.shape, 'index');
    if (!s) {
      throw err('IndexError', `shape mismatch: indexing arrays could not be broadcast together with shapes ${advArrays.map((x) => fmtShapeTight(x.shape)).join(' ')} `,
        '几个下标数组的长度对不上。');
    }
    bshape = s;
  }
  const bn = prod(bshape);
  const advIdx = advArrays.map((a, j) => {
    const ax = advPos[j];
    const n = arr.shape[ax];
    const ix = broadcastIndexer(a.shape, bshape);
    return range(bn).map((k) => {
      let i = a.at(ix(k));
      if (i < -n || i >= n) {
        throw err('IndexError', `index ${i} is out of bounds for axis ${ax} with size ${n}`,
          `下标越界：第 ${ax} 维只有 ${n} 个元素，下标只能是 0 ~ ${n - 1}（或 -1 ~ -${n}）。`);
      }
      return i < 0 ? i + n : i;
    });
  });
  const contiguous = advPos.every((p, j) => j === 0 || p === advPos[j - 1] + 1);
  const sliceDims = [];
  expanded.forEach((it, k) => {
    if (it instanceof PySlice) sliceDims.push({ k, list: sliceIndices(it, arr.shape[k]), stride: strides[k] });
  });
  const before = contiguous ? sliceDims.filter((d) => d.k < advPos[0]) : [];
  const after = contiguous ? sliceDims.filter((d) => d.k > advPos[0]) : sliceDims;
  const shape = [...before.map((d) => d.list.length), ...bshape, ...after.map((d) => d.list.length)];
  checkSize(prod(shape));
  const logical = [];
  const advOffset = (b) => advIdx.reduce((s, list, j) => s + list[b] * strides[advPos[j]], 0);
  const recDims = (dims, k, base, cb) => {
    if (k === dims.length) { cb(base); return; }
    for (const i of dims[k].list) recDims(dims, k + 1, base + i * dims[k].stride, cb);
  };
  recDims(before, 0, 0, (b0) => {
    for (let b = 0; b < bn; b++) {
      recDims(after, 0, b0 + advOffset(b), (off) => logical.push(off));
    }
  });
  return { shape, logical, view: false, scalar: false, mask: sawMask };
}

/** 逻辑下标列表 → 来源（沿 obj.prov 追溯到最初的数组） */
const provOf = (obj, logical) => ({ store: obj.prov.store, pos: logical.map((l) => obj.prov.pos[l]) });

function getItem(obj, items, usage) {
  if (obj instanceof NDArray) {
    if (obj.ndim === 0) throw err('IndexError', 'too many indices for array: array is 0-dimensional, but 1 were indexed', '这是一个单独的数，不能再取下标。');
    const r = resolveIndex(obj, items, usage);
    const pos = r.logical.map((l) => obj.map[l]);
    const prov = provOf(obj, r.logical);
    if (r.scalar) return npScalar(obj.store.data[pos[0]], obj.dtype, prov);
    if (r.view) return new NDArray(r.shape, obj.store, pos, prov);
    const data = pos.map((p) => obj.store.data[p]);
    const out = makeArray(r.shape, data, obj.dtype);
    out.prov = prov;
    return out;
  }
  if (obj instanceof PyList || obj instanceof PyTuple) {
    if (items.length !== 1) {
      throw err('TypeError', `${shortType(obj)} indices must be integers or slices, not tuple`,
        'Python 列表不支持 a[1, 2] 这种二维下标：先用 np.array(...) 变成数组，或写 a[1][2]。');
    }
    const it = items[0];
    const n = obj.items.length;
    if (it instanceof Scalar && it.dtype !== 'float') {
      let i = it.v;
      if (i < -n || i >= n) throw err('IndexError', `${shortType(obj)} index out of range`, `下标越界：列表只有 ${n} 个元素。`);
      if (i < 0) i += n;
      return obj.items[i];
    }
    if (it instanceof PySlice) {
      const sel = sliceIndices(it, n).map((i) => obj.items[i]);
      return obj instanceof PyList ? new PyList(sel) : new PyTuple(sel);
    }
    throw err('TypeError', `${shortType(obj)} indices must be integers or slices, not ${shortType(it)}`,
      'Python 列表不支持布尔掩膜：先用 np.array(...) 变成数组。');
  }
  if (obj instanceof Scalar && obj.np) throw err('IndexError', 'invalid index to scalar variable.', '这已经是一个数了，不能再取下标（下标是不是多写了一层？）。');
  if (obj instanceof Scalar) throw err('TypeError', `'${shortType(obj)}' object is not subscriptable`, '这是一个数，不能再取下标。');
  throw err('TypeError', `'${shortType(obj)}' object is not subscriptable`, `「${shortType(obj)}」不能用方括号取下标。`);
}

function setItem(obj, items, value, usage) {
  if (obj instanceof NDArray) {
    if (obj.ndim === 0) throw err('IndexError', 'too many indices for array', '这是一个单独的数，不能再取下标。');
    const r = resolveIndex(obj, items, usage);
    const pos = r.logical.map((l) => obj.map[l]);
    if (!(value instanceof NDArray || value instanceof Scalar || isSeq(value))) {
      throw err('TypeError', `cannot assign ${shortType(value)} to array elements`, '数组元素只能赋值为数字或数组。');
    }
    const V = asArray(value);
    let vs = V.shape;
    while (vs.length > r.shape.length && vs[0] === 1) vs = vs.slice(1); // numpy 允许去掉多余的前导 1 维
    const bs = broadcastShapes(vs, r.shape, 'assign');
    if (!bs || bs.join() !== r.shape.join()) {
      if (r.view) {
        throw err('ValueError', `could not broadcast input array from shape ${fmtShapeTight(V.shape)} into shape ${fmtShapeTight(r.shape)}`,
          `右边的形状 ${fmtShape(V.shape)} 放不进左边选中的形状 ${fmtShape(r.shape)}。`);
      }
      if (r.mask) {
        throw err('ValueError', `NumPy boolean array indexing assignment cannot assign ${V.size} input values to the ${pos.length} output values where the mask is true`,
          `左边的掩膜选中了 ${pos.length} 个位置，右边却给了 ${V.size} 个值。`);
      }
      throw err('ValueError', `shape mismatch: value array of shape ${fmtShapeTight(V.shape)} could not be broadcast to indexing result of shape ${fmtShapeTight(r.shape)}`,
        `左边选中了 ${pos.length} 个位置，右边的形状 ${fmtShape(V.shape)} 对不上。`);
    }
    const ix = broadcastIndexer(vs, r.shape);
    const d = obj.store.data;
    for (let k = 0; k < pos.length; k++) d[pos[k]] = castTo(V.at(ix(k)), obj.dtype);
    return;
  }
  if (obj instanceof PyList) {
    const it = items[0];
    if (items.length === 1 && it instanceof Scalar && it.dtype !== 'float') {
      const n = obj.items.length;
      let i = it.v;
      if (i < -n || i >= n) throw err('IndexError', 'list assignment index out of range', `下标越界：列表只有 ${n} 个元素。`);
      if (i < 0) i += n;
      obj.items[i] = value;
      return;
    }
    throw err('TypeError', 'list indices must be integers here', 'Python 列表不支持这种下标赋值：先用 np.array(...) 变成数组。');
  }
  throw err('TypeError', `'${shortType(obj)}' object does not support item assignment`, `「${shortType(obj)}」不能给下标赋值。`);
}

/** 原地运算（a += b 且 a 是数组）：结果写回 a 的缓冲区，按 same_kind 规则检查 dtype */
function inplace(op, A, b) {
  const B = asArray(b);
  const spec = npBinarySpec(op, A.dtype, B.dtype);
  if (KIND[spec.dtype] > KIND[A.dtype]) {
    const name = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '//': 'floor_divide', '%': 'remainder', '**': 'power', '&': 'bitwise_and', '|': 'bitwise_or', '^': 'bitwise_xor' }[op];
    throw err('UFuncTypeError', `Cannot cast ufunc '${name}' output from dtype('${dtypeName(spec.dtype)}') to dtype('${dtypeName(A.dtype)}') with casting rule 'same_kind'`,
      op === '/'
        ? `整数数组不能原地做除法（结果是小数，放不回整数数组）：用 //= 做整除，或写成 a = a / ${'…'}。`
        : `结果是 ${dtypeName(spec.dtype)}，放不回 ${dtypeName(A.dtype)} 数组：可以写成 a = a ${op} …（生成新数组）。`);
  }
  const shape = broadcastShapes(A.shape, B.shape);
  if (shape.join() !== A.shape.join()) {
    throw err('ValueError', `non-broadcastable output operand with shape ${fmtShapeTight(A.shape)} doesn't match the broadcast shape ${fmtShapeTight(shape)}`,
      `右边的形状 ${fmtShape(B.shape)} 会把结果变成 ${fmtShape(shape)}，放不回原来 ${fmtShape(A.shape)} 的数组。`);
  }
  const ib = broadcastIndexer(B.shape, shape);
  const vals = [];
  for (let k = 0; k < A.size; k++) vals.push(spec.f(A.at(k), B.at(ib(k))));
  for (let k = 0; k < A.size; k++) A.store.data[A.map[k]] = castTo(vals[k], A.dtype);
  return A;
}

// ============================================================
// 归约 / 方法 / 函数
// ============================================================

function normAxis(axis, ndim) {
  if (axis === undefined || axis === NONE) return null;
  const a = toInt(axis, 'axis ');
  if (a < -ndim || a >= ndim) {
    throw err('AxisError', `axis ${a} is out of bounds for array of dimension ${ndim}`,
      `axis 只能是 0 ~ ${ndim - 1}：${ndim === 1 ? '一维数组只有 axis=0' : 'axis=0 沿着行方向（按列汇总），axis=1 沿着列方向（按行汇总）'}。`);
  }
  return a < 0 ? a + ndim : a;
}

const REDUCE = {
  sum: { dtype: (d) => (d === 'float' ? 'float' : 'int'), f: (xs) => xs.reduce((a, b) => a + b, 0) },
  prod: { dtype: (d) => (d === 'float' ? 'float' : 'int'), f: (xs) => xs.reduce((a, b) => a * b, 1) },
  mean: { dtype: () => 'float', f: (xs) => (xs.length ? pairwiseSum(xs) / xs.length : NaN) },
  max: { dtype: (d) => d, empty: 'maximum', f: (xs) => (xs.some(Number.isNaN) ? NaN : Math.max(...xs)) },
  min: { dtype: (d) => d, empty: 'minimum', f: (xs) => (xs.some(Number.isNaN) ? NaN : Math.min(...xs)) },
  argmax: { dtype: () => 'int', empty: 'argmax', f: (xs) => argBest(xs, (a, b) => a > b) },
  argmin: { dtype: () => 'int', empty: 'argmin', f: (xs) => argBest(xs, (a, b) => a < b) },
  std: { dtype: () => 'float', f: (xs) => Math.sqrt(variance(xs)) },
  var: { dtype: () => 'float', f: variance },
  any: { dtype: () => 'bool', f: (xs) => (xs.some((x) => x !== 0) ? 1 : 0) },
  all: { dtype: () => 'bool', f: (xs) => (xs.every((x) => x !== 0) ? 1 : 0) },
};

/** numpy 的 sum 对浮点数用成对求和（pairwise，块大小 8）；整数无所谓，这里统一用它让浮点结果逐位一致 */
function pairwiseSum(xs, lo = 0, hi = xs.length) {
  const n = hi - lo;
  if (n < 8) { let s = 0; for (let i = lo; i < hi; i++) s += xs[i]; return s; }
  if (n <= 128) {
    const r = [xs[lo], xs[lo + 1], xs[lo + 2], xs[lo + 3], xs[lo + 4], xs[lo + 5], xs[lo + 6], xs[lo + 7]];
    let i = lo + 8;
    for (; i < hi - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += xs[i + j];
    let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
    for (; i < hi; i++) res += xs[i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum(xs, lo, lo + n2) + pairwiseSum(xs, lo + n2, hi);
}

function variance(xs) {
  if (!xs.length) return NaN;
  const m = pairwiseSum(xs) / xs.length;
  return pairwiseSum(xs.map((x) => (x - m) * (x - m))) / xs.length;
}

function argBest(xs, better) {
  let bi = 0;
  for (let i = 0; i < xs.length; i++) {
    if (Number.isNaN(xs[i])) return i;
    if (better(xs[i], xs[bi])) bi = i;
  }
  return bi;
}

function reduce(name, v, axisArg) {
  const A = asArray(v);
  const spec = REDUCE[name];
  const axis = normAxis(axisArg, Math.max(A.ndim, 1));
  const sumLike = name === 'sum' || name === 'prod';
  const fRaw = (xs) => {
    if (!xs.length && spec.empty) {
      throw err('ValueError', name.startsWith('arg') ? `attempt to get ${name} of an empty sequence` : `zero-size array to reduction operation ${spec.empty} which has no identity`,
        '空数组没有最大 / 最小值。');
    }
    if (sumLike && A.dtype === 'float') return name === 'sum' ? pairwiseSum(xs) : spec.f(xs);
    return spec.f(xs);
  };
  const outDtype = spec.dtype(A.dtype);
  if (axis === null || A.ndim <= 1) {
    if (axis !== null && A.ndim === 0) throw err('AxisError', `axis ${axis} is out of bounds for array of dimension 0`, '单个数没有 axis。');
    const xs = [];
    for (let i = 0; i < A.size; i++) xs.push(A.at(i));
    return npScalar(fRaw(xs), outDtype);
  }
  const outShape = A.shape.filter((_, i) => i !== axis);
  const st = stridesOf(A.shape);
  const n = A.shape[axis];
  const out = [];
  const outStrides = stridesOf(outShape);
  for (let k = 0; k < prod(outShape); k++) {
    let rem = k;
    let base = 0;
    let oi = 0;
    for (let ax = 0; ax < A.ndim; ax++) {
      if (ax === axis) continue;
      const q = Math.floor(rem / outStrides[oi]);
      rem -= q * outStrides[oi];
      base += q * st[ax];
      oi++;
    }
    const xs = [];
    for (let j = 0; j < n; j++) xs.push(A.at(base + j * st[axis]));
    out.push(fRaw(xs));
  }
  return makeArray(outShape, out, outDtype);
}

function reshapeArr(A, args, fname = 'reshape') {
  let shape;
  if (args.length === 1 && isSeq(args[0])) shape = shapeArg(args[0], fname);
  else shape = args.map((a) => toInt(a, '形状'));
  const neg = shape.filter((d) => d === -1).length;
  if (neg > 1) throw err('ValueError', 'can only specify one unknown dimension', 'reshape 里最多只能有一个 -1。');
  const known = prod(shape.filter((d) => d !== -1));
  let resolved = shape.slice();
  if (neg) {
    if (known === 0 || A.size % known !== 0) {
      throw err('ValueError', `cannot reshape array of size ${A.size} into shape ${fmtShapeTight(shape.map((d) => (d === -1 ? 'newaxis' : d)))}`,
        `${A.size} 个元素没法排成这个形状。`);
    }
    resolved = shape.map((d) => (d === -1 ? A.size / known : d));
  }
  if (resolved.some((d) => d < 0) || prod(resolved) !== A.size) {
    throw err('ValueError', `cannot reshape array of size ${A.size} into shape ${fmtShapeTight(shape.map((d) => (d === -1 ? 'newaxis' : d)))}`,
      `reshape 前后元素个数必须相同：原来有 ${A.size} 个，${fmtShape(resolved)} 却需要 ${prod(resolved)} 个。`);
  }
  return new NDArray(resolved, A.store, A.map.slice(), { store: A.prov.store, pos: A.prov.pos.slice() });
}

function transposeArr(A) {
  if (A.ndim < 2) return new NDArray(A.shape.slice(), A.store, A.map.slice(), { store: A.prov.store, pos: A.prov.pos.slice() });
  const shape = A.shape.slice().reverse();
  const st = stridesOf(A.shape);
  const ost = stridesOf(shape);
  const logical = [];
  for (let k = 0; k < A.size; k++) {
    let rem = k;
    let src = 0;
    for (let ax = 0; ax < shape.length; ax++) {
      const q = Math.floor(rem / ost[ax]);
      rem -= q * ost[ax];
      src += q * st[A.ndim - 1 - ax];
    }
    logical.push(src);
  }
  return new NDArray(shape, A.store, logical.map((l) => A.map[l]), provOf(A, logical));
}

function ufunc1(name, v, f, outFloat = true) {
  if (!(isArr(v) || isNum(v) || isSeq(v))) throw err('TypeError', `ufunc '${name}' not supported for the input types`, `${name} 需要数字或数组。`);
  const A = asArray(v);
  const dtype = outFloat ? 'float' : A.dtype === 'bool' ? 'bool' : A.dtype;
  const out = [];
  for (let i = 0; i < A.size; i++) out.push(f(A.at(i)));
  return squeeze0(makeArray(A.shape, out, dtype));
}

const rint = (x) => {
  if (!Number.isFinite(x)) return x;
  const f = Math.floor(x);
  const d = x - f;
  const r = d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
  return r === 0 && (x < 0 || Object.is(x, -0)) ? -0 : r; // 负数舍入到 0 保留符号（numpy 打印 -0.）
};

function npRound(v, decimals = 0) {
  const A = asArray(v);
  if (A.dtype !== 'float' && decimals >= 0) return squeeze0(makeArray(A.shape, A.map.map((p) => A.store.data[p]), A.dtype));
  const out = [];
  const scale = 10 ** Math.abs(decimals);
  for (let i = 0; i < A.size; i++) {
    const x = A.at(i);
    out.push(decimals >= 0 ? rint(x * scale) / scale : rint(x / scale) * scale);
  }
  return squeeze0(makeArray(A.shape, out, A.dtype === 'float' ? 'float' : 'int'));
}

/** Python round(x, n)：精确值上的四舍六入五成双 */
function pyRound(x, n) {
  if (n === null) {
    if (!Number.isFinite(x)) throw err('OverflowError', 'cannot convert float infinity to integer', '无穷大不能取整。');
    return pyInt(rint(x));
  }
  if (!Number.isFinite(x)) return pyFloat(x);
  if (n > 20 || Math.abs(x) >= 1e21) return pyFloat(x);
  let s = x.toFixed(n);
  const exact = Math.abs(x).toFixed(Math.min(100, n + 30));
  const tail = exact.split('.')[1]?.slice(n) || '';
  if (/^50*$/.test(tail)) {
    // 恰好在中点：取偶数
    const down = (x < 0 ? -1 : 1) * Math.floor(Math.abs(x) * 10 ** n) / 10 ** n;
    const lastDigit = Math.floor(Math.abs(x) * 10 ** n) % 10;
    s = lastDigit % 2 === 0 ? down.toFixed(n) : s;
  }
  return pyFloat(Number(s));
}

function iterItems(v) {
  if (isSeq(v)) return v.items;
  if (v instanceof NDArray) {
    if (v.ndim === 0) throw err('TypeError', 'iteration over a 0-d array', '单个数不能逐个取元素。');
    const out = [];
    for (let i = 0; i < v.shape[0]; i++) out.push(getItem(v, [pyInt(i)], {}));
    return out;
  }
  throw err('TypeError', `'${shortType(v)}' object is not iterable`, `「${shortType(v)}」不能逐个取元素。`);
}

function arangeFn(args, kw) {
  if (!args.length) throw err('TypeError', 'arange() requires stop to be specified.', 'np.arange 至少要写终点，例如 np.arange(5)。');
  if (args.length > 3) throw err('TypeError', 'arange() takes at most 3 positional arguments', 'np.arange 最多三个参数：起点、终点、步长。');
  args.forEach((a) => { if (!isNum(a)) throw err('TypeError', `unsupported type for arange: ${shortType(a)}`, 'np.arange 的参数要是数字。'); });
  let start = 0, stop, step = 1;
  if (args.length === 1) [stop] = args.map((a) => a.v);
  else [start, stop, step = 1] = args.map((a) => a.v);
  if (step === 0) throw err('ZeroDivisionError', 'division by zero', 'np.arange 的步长不能是 0。');
  const isF = args.some((a) => a.dtype === 'float');
  const n = Math.max(0, Math.ceil((stop - start) / step));
  checkSize(n);
  // 与 numpy 的 fill 一致：先算前两个值，之后用 start + i * (第二个 − 第一个)
  const out = [];
  const d = n > 1 ? (start + step) - start : step;
  for (let i = 0; i < n; i++) out.push(i === 1 ? start + step : start + i * d);
  return makeArray([n], out, dtypeArg(kw.dtype) || (isF ? 'float' : 'int'));
}

function linspaceFn(args, kw) {
  const get = (i, name, def) => (args[i] !== undefined ? args[i] : kw[name] !== undefined ? kw[name] : def);
  const start = get(0, 'start');
  const stop = get(1, 'stop');
  if (!start || !stop) throw err('TypeError', "linspace() missing required argument 'stop'", 'np.linspace(起点, 终点, 个数)。');
  const numV = get(2, 'num', pyInt(50));
  const endpoint = truth(get(3, 'endpoint', pyBool(true)));
  const num = toInt(numV, 'np.linspace 的个数');
  if (num < 0) throw err('ValueError', `Number of samples, ${num}, must be non-negative.`, '个数不能是负数。');
  checkSize(num);
  const a = start.v, b = stop.v;
  const div = endpoint ? num - 1 : num;
  const delta = b - a;
  const out = [];
  const step = div > 0 ? delta / div : NaN;
  for (let i = 0; i < num; i++) {
    let y;
    if (div > 0) y = step === 0 ? (i / div) * delta + a : i * step + a;
    else y = i * delta + a;
    out.push(y);
  }
  if (endpoint && num > 1) out[num - 1] = b;
  return makeArray([num], out, dtypeArg(kw.dtype) || 'float');
}

function whereFn(args) {
  if (args.length === 1) {
    const A = asArray(args[0]);
    const st = stridesOf(A.shape);
    const lists = range(Math.max(1, A.ndim)).map(() => []);
    for (let k = 0; k < A.size; k++) {
      if (!A.at(k)) continue;
      let rem = k;
      for (let d = 0; d < A.ndim; d++) { const q = Math.floor(rem / st[d]); rem -= q * st[d]; lists[d].push(q); }
    }
    return new PyTuple(lists.slice(0, Math.max(1, A.ndim)).map((l) => makeArray([l.length], l, 'int')));
  }
  if (args.length !== 3) throw err('TypeError', 'where() takes 1 or 3 positional arguments', 'np.where(条件, 成立时的值, 不成立时的值)。');
  const C = asArray(args[0]), X = asArray(args[1]), Y = asArray(args[2]);
  const shape = broadcastShapes(broadcastShapes(C.shape, X.shape), Y.shape);
  const ic = broadcastIndexer(C.shape, shape), ix = broadcastIndexer(X.shape, shape), iy = broadcastIndexer(Y.shape, shape);
  const out = [];
  for (let k = 0; k < prod(shape); k++) out.push(C.at(ic(k)) ? X.at(ix(k)) : Y.at(iy(k)));
  return squeeze0(makeArray(shape, out, promote(X.dtype, Y.dtype)));
}

function sortFn(v, axisArg) {
  const A = arrayFromValue(asArray(v));
  if (A.ndim === 0) throw err('AxisError', 'axis -1 is out of bounds for array of dimension 0', '单个数不能排序。');
  const axis = axisArg === undefined ? A.ndim - 1 : normAxis(axisArg, A.ndim);
  if (axis === null) {
    const xs = A.store.data.slice().sort((a, b) => (Number.isNaN(a) ? 1 : Number.isNaN(b) ? -1 : a - b));
    return makeArray([xs.length], xs, A.dtype);
  }
  const st = stridesOf(A.shape);
  const n = A.shape[axis];
  const d = A.store.data;
  for (let base = 0; base < A.size; base++) {
    // 只从每条线的起点出发
    if (Math.floor(base / st[axis]) % n !== 0) continue;
    const idx = range(n).map((j) => base + j * st[axis]);
    const xs = idx.map((p) => d[p]).sort((a, b) => (Number.isNaN(a) ? 1 : Number.isNaN(b) ? -1 : a - b));
    idx.forEach((p, j) => { d[p] = xs[j]; });
  }
  return A;
}

function kwOnly(kw, allowed, fname) {
  for (const k of Object.keys(kw)) {
    if (!allowed.includes(k)) throw err('TypeError', `${fname}() got an unexpected keyword argument '${k}'`, `${fname} 没有名为 ${k} 的参数。`);
  }
}

function filled(shape, fill, dtype) {
  const n = prod(shape);
  checkSize(n);
  return makeArray(shape, new Array(n).fill(fill), dtype);
}

function makeNumpy() {
  const f = (name, fn, extra) => new PyFunc(`np.${name}`, fn, extra);
  const r = (name) => f(name, (args, kw) => {
    kwOnly(kw, ['axis'], `np.${name}`);
    if (!args.length) throw err('TypeError', `${name}() missing required argument`, `np.${name}(数组)。`);
    return reduce(name, args[0], kw.axis ?? args[1]);
  });
  const u = (name, fn, outFloat = true) => f(name, (args) => {
    if (args.length !== 1) throw err('TypeError', `${name}() takes 1 positional argument`, `np.${name}(数组)。`);
    return ufunc1(name, args[0], fn, outFloat);
  });
  const attrs = {
    array: f('array', (args, kw) => {
      kwOnly(kw, ['dtype'], 'np.array');
      if (args.length < 1) throw err('TypeError', "array() missing required argument 'object' (pos 0)", 'np.array([...])。');
      return arrayFromValue(args[0], dtypeArg(kw.dtype ?? args[1]));
    }),
    asarray: f('asarray', (args, kw) => {
      const d = dtypeArg(kw.dtype);
      return isArr(args[0]) && (!d || d === args[0].dtype) ? args[0] : arrayFromValue(args[0], d);
    }),
    arange: f('arange', arangeFn),
    zeros: f('zeros', (args, kw) => { kwOnly(kw, ['dtype'], 'np.zeros'); return filled(shapeArg(args[0], 'np.zeros'), 0, dtypeArg(kw.dtype ?? args[1]) || 'float'); }),
    ones: f('ones', (args, kw) => { kwOnly(kw, ['dtype'], 'np.ones'); return filled(shapeArg(args[0], 'np.ones'), 1, dtypeArg(kw.dtype ?? args[1]) || 'float'); }),
    full: f('full', (args, kw) => {
      kwOnly(kw, ['dtype', 'fill_value'], 'np.full');
      const fv = args[1] ?? kw.fill_value;
      if (!isNum(fv)) throw err('TypeError', 'full() fill_value must be a number here', 'np.full(形状, 填充值)。');
      return filled(shapeArg(args[0], 'np.full'), fv.v, dtypeArg(kw.dtype) || fv.dtype);
    }),
    zeros_like: f('zeros_like', (args) => { const A = asArray(args[0]); return filled(A.shape, 0, A.dtype); }),
    ones_like: f('ones_like', (args) => { const A = asArray(args[0]); return filled(A.shape, 1, A.dtype); }),
    linspace: f('linspace', linspaceFn),
    sum: r('sum'), mean: r('mean'), max: r('max'), min: r('min'), argmax: r('argmax'), argmin: r('argmin'),
    std: r('std'), var: r('var'), prod: r('prod'), any: r('any'), all: r('all'),
    amax: r('max'), amin: r('min'),
    sqrt: u('sqrt', Math.sqrt), sin: u('sin', Math.sin), cos: u('cos', Math.cos), tan: u('tan', Math.tan),
    exp: u('exp', Math.exp), log: u('log', Math.log), log10: u('log10', Math.log10), log2: u('log2', Math.log2),
    abs: u('abs', Math.abs, false), absolute: u('absolute', Math.abs, false),
    floor: u('floor', Math.floor), ceil: u('ceil', Math.ceil),
    round: f('round', (args, kw) => npRound(args[0], kw.decimals !== undefined ? toInt(kw.decimals) : args[1] ? toInt(args[1]) : 0)),
    around: f('around', (args, kw) => npRound(args[0], kw.decimals !== undefined ? toInt(kw.decimals) : args[1] ? toInt(args[1]) : 0)),
    where: f('where', (args) => whereFn(args)),
    sort: f('sort', (args, kw) => sortFn(args[0], kw.axis ?? args[1])),
    count_nonzero: f('count_nonzero', (args, kw) => {
      const A = asArray(args[0]);
      if (kw.axis !== undefined) return reduce('sum', arrayBinary('!=', A, pyInt(0)), kw.axis);
      let c = 0;
      for (let i = 0; i < A.size; i++) if (A.at(i) !== 0) c++;
      return pyInt(c);
    }),
    maximum: f('maximum', (args) => {
      const A = asArray(args[0]), B = asArray(args[1]);
      const shape = broadcastShapes(A.shape, B.shape);
      const ia = broadcastIndexer(A.shape, shape), ib = broadcastIndexer(B.shape, shape);
      return squeeze0(makeArray(shape, range(prod(shape)).map((k) => Math.max(A.at(ia(k)), B.at(ib(k)))), promote(A.dtype, B.dtype)));
    }),
    minimum: f('minimum', (args) => {
      const A = asArray(args[0]), B = asArray(args[1]);
      const shape = broadcastShapes(A.shape, B.shape);
      const ia = broadcastIndexer(A.shape, shape), ib = broadcastIndexer(B.shape, shape);
      return squeeze0(makeArray(shape, range(prod(shape)).map((k) => Math.min(A.at(ia(k)), B.at(ib(k)))), promote(A.dtype, B.dtype)));
    }),
    reshape: f('reshape', (args) => reshapeArr(asArray(args[0]), args.slice(1))),
    transpose: f('transpose', (args) => transposeArr(asArray(args[0]))),
    shape: f('shape', (args) => new PyTuple(asArray(args[0]).shape.map(pyInt))),
    size: f('size', (args) => pyInt(asArray(args[0]).size)),
    ndim: f('ndim', (args) => pyInt(asArray(args[0]).ndim)),
    copy: f('copy', (args) => arrayFromValue(args[0])),
    pi: pyFloat(Math.PI),
    e: pyFloat(Math.E),
    inf: pyFloat(Infinity),
    nan: pyFloat(NaN),
    newaxis: NONE,
    int64: new PyFunc('np.int64', (args) => npScalar(Math.trunc(args[0].v), 'int'), { dtypeName: 'int' }),
    float64: new PyFunc('np.float64', (args) => npScalar(args[0].v, 'float'), { dtypeName: 'float' }),
    bool_: new PyFunc('np.bool_', (args) => npScalar(truth(args[0]) ? 1 : 0, 'bool'), { dtypeName: 'bool' }),
  };
  attrs.int_ = attrs.int64;
  attrs.float_ = attrs.float64;
  return new PyModule('numpy', attrs);
}

const NUMPY = makeNumpy();
const RANDOM_MSG = () => err('AttributeError', "module 'numpy' has no attribute 'random' here",
  '这座试炼场里不用随机数（想玩随机，去高原上的蒙特卡洛观测台）。');

function arrayAttr(A, name, usage) {
  const m = (fname, fn) => new PyFunc(`ndarray.${fname}`, (args, kw) => { usage.calls.add(`.${fname}`); return fn(args, kw); });
  const red = (fname) => m(fname, (args, kw) => { kwOnly(kw, ['axis'], fname); return reduce(fname, A, kw.axis ?? args[0]); });
  switch (name) {
    case 'shape': return new PyTuple(A.shape.map(pyInt));
    case 'ndim': return pyInt(A.ndim);
    case 'size': return pyInt(A.size);
    case 'dtype': return new PyDType(A.dtype);
    case 'T': usage.calls.add('.T'); return transposeArr(A);
    case 'sum': case 'mean': case 'max': case 'min': case 'argmax': case 'argmin': case 'std': case 'var':
    case 'prod': case 'any': case 'all':
      return red(name);
    case 'reshape': return m('reshape', (args) => reshapeArr(A, args));
    case 'flatten': return m('flatten', () => makeArray([A.size], A.map.map((p) => A.store.data[p]), A.dtype));
    case 'ravel': return m('ravel', () => new NDArray([A.size], A.store, A.map.slice(), { store: A.prov.store, pos: A.prov.pos.slice() }));
    case 'copy': return m('copy', () => arrayFromValue(A));
    case 'transpose': return m('transpose', () => transposeArr(A));
    case 'astype': return m('astype', (args) => arrayFromValue(A, dtypeArg(args[0])));
    case 'round': return m('round', (args, kw) => npRound(A, kw.decimals !== undefined ? toInt(kw.decimals) : args[0] ? toInt(args[0]) : 0));
    case 'cumsum': return m('cumsum', () => {
      const out = [];
      let s = 0;
      for (let i = 0; i < A.size; i++) { s += A.at(i); out.push(s); }
      return makeArray([A.size], out, A.dtype === 'float' ? 'float' : 'int');
    });
    case 'tolist': return m('tolist', () => toPyList(A));
    case 'fill': return m('fill', (args) => { for (let i = 0; i < A.size; i++) A.store.data[A.map[i]] = castTo(args[0].v, A.dtype); return NONE; });
    case 'sort': return m('sort', () => { const s = sortFn(A); for (let i = 0; i < A.size; i++) A.store.data[A.map[i]] = s.at(i); return NONE; });
    case 'item': return m('item', () => {
      if (A.size !== 1) throw err('ValueError', 'can only convert an array of size 1 to a Python scalar', '只有一个元素的数组才能 .item()。');
      return new Scalar(A.at(0), A.dtype);
    });
    default:
      throw err('AttributeError', `'numpy.ndarray' object has no attribute '${name}'`, `数组没有「${name}」这个属性或方法——检查一下拼写。`);
  }
}

function toPyList(A) {
  const rec = (offset, axis, st) => {
    if (axis === A.ndim) return new Scalar(A.at(offset), A.dtype);
    return new PyList(range(A.shape[axis]).map((i) => rec(offset + i * st[axis], axis + 1, st)));
  };
  return rec(0, 0, stridesOf(A.shape));
}

// ============================================================
// 求值
// ============================================================

function makeBuiltins(ctx) {
  const b = (name, fn) => new PyFunc(name, fn);
  return {
    np: NUMPY,
    numpy: NUMPY,
    print: b('print', (args, kw) => {
      kwOnly(kw, ['sep', 'end'], 'print');
      const sep = kw.sep instanceof PyStr ? kw.sep.s : ' ';
      ctx.out.push(args.map(strValue).join(sep));
      return NONE;
    }),
    len: b('len', (args) => {
      const v = args[0];
      if (v instanceof NDArray) {
        if (v.ndim === 0) throw err('TypeError', 'len() of unsized object', '单个数没有长度。');
        return pyInt(v.shape[0]);
      }
      if (isSeq(v)) return pyInt(v.items.length);
      if (v instanceof PyStr) return pyInt(v.s.length);
      throw err('TypeError', `object of type '${shortType(v)}' has no len()`, `「${shortType(v)}」没有长度。`);
    }),
    abs: b('abs', (args) => {
      const v = args[0];
      if (isNum(v) && !v.np) return v.dtype === 'float' ? pyFloat(Math.abs(v.v)) : pyInt(Math.abs(v.v));
      return ufunc1('absolute', v, Math.abs, false);
    }),
    int: new PyFunc('int', (args) => {
      const v = args[0] ?? pyInt(0);
      if (v instanceof NDArray) {
        if (v.size !== 1) throw err('TypeError', 'only length-1 arrays can be converted to Python scalars', '只有一个元素的数组才能转成整数。');
        return pyInt(Math.trunc(v.at(0)));
      }
      if (v instanceof PyStr && /^\s*[-+]?\d+\s*$/.test(v.s)) return pyInt(parseInt(v.s, 10));
      if (!isNum(v)) throw err('TypeError', `int() argument must be a number, not '${shortType(v)}'`);
      if (!Number.isFinite(v.v)) throw err('ValueError', 'cannot convert float NaN to integer');
      return pyInt(Math.trunc(v.v));
    }, { dtypeName: 'int' }),
    float: new PyFunc('float', (args) => {
      const v = args[0] ?? pyFloat(0);
      if (v instanceof NDArray) {
        if (v.size !== 1) throw err('TypeError', 'only length-1 arrays can be converted to Python scalars', '只有一个元素的数组才能转成小数。');
        return pyFloat(v.at(0));
      }
      if (v instanceof PyStr) {
        const s = v.s.trim().toLowerCase();
        if (s === 'inf') return pyFloat(Infinity);
        if (s === 'nan') return pyFloat(NaN);
        if (!Number.isNaN(Number(s)) && s) return pyFloat(Number(s));
        throw err('ValueError', `could not convert string to float: '${v.s}'`);
      }
      if (!isNum(v)) throw err('TypeError', `float() argument must be a string or a real number, not '${shortType(v)}'`);
      return pyFloat(v.v);
    }, { dtypeName: 'float' }),
    bool: new PyFunc('bool', (args) => pyBool(args.length ? truth(args[0]) : false), { dtypeName: 'bool' }),
    round: b('round', (args) => {
      const v = args[0];
      const n = args[1] === undefined || args[1] === NONE ? null : toInt(args[1]);
      if (isNum(v) && !v.np) {
        if (v.dtype !== 'float') return pyInt(v.v);
        return pyRound(v.v, n);
      }
      if (isNum(v)) return n === null ? pyInt(rint(v.v)) : npRound(v, n);
      return npRound(v, n ?? 0);
    }),
    min: b('min', (args) => builtinBest(args, (a, c) => truth(binary('<', a, c)))),
    max: b('max', (args) => builtinBest(args, (a, c) => truth(binary('>', a, c)))),
    sum: b('sum', (args) => {
      let acc = args[1] ?? pyInt(0);
      for (const it of iterItems(args[0])) acc = binary('+', acc, it);
      return acc;
    }),
    list: b('list', (args) => new PyList(args.length ? iterItems(args[0]).slice() : [])),
    tuple: b('tuple', (args) => new PyTuple(args.length ? iterItems(args[0]).slice() : [])),
    range: b('range', (args) => {
      const ns = args.map((a) => toInt(a, 'range 的参数'));
      let [start, stop, step] = ns.length === 1 ? [0, ns[0], 1] : [ns[0], ns[1], ns[2] ?? 1];
      if (step === 0) throw err('ValueError', 'range() arg 3 must not be zero');
      const out = [];
      for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(pyInt(i));
      checkSize(out.length);
      return new PyList(out);
    }),
    type: b('type', (args) => new PyStr(`<class '${typeName(args[0])}'>`)),
    repr: b('repr', (args) => new PyStr(reprValue(args[0]))),
    str: b('str', (args) => new PyStr(args.length ? strValue(args[0]) : '')),
  };
}

function builtinBest(args, better) {
  const items = args.length === 1 ? iterItems(args[0]) : args;
  if (!items.length) throw err('ValueError', 'min() arg is an empty sequence', '空序列没有最值。');
  let best = items[0];
  for (const it of items.slice(1)) if (better(it, best)) best = it;
  return best;
}

class Interp {
  constructor(scope, usage) {
    this.scope = scope;
    this.usage = usage;
    this.out = [];
    this.builtins = makeBuiltins(this);
    this.steps = 0;
  }
  tick() {
    if (++this.steps > 20000) throw err('RuntimeError', 'spell too complex', '这句咒语太复杂了。');
  }
  lookup(id) {
    this.usage.names.add(id);
    if (Object.prototype.hasOwnProperty.call(this.scope, id)) return this.scope[id];
    if (Object.prototype.hasOwnProperty.call(this.builtins, id)) return this.builtins[id];
    const near = suggestName(id, [...Object.keys(this.scope), ...Object.keys(this.builtins)]);
    throw err('NameError', `name '${id}' is not defined${near ? `. Did you mean: '${near}'?` : ''}`,
      near ? `没有叫「${id}」的变量——你是不是想写「${near}」？` : `没有叫「${id}」的变量或函数：检查拼写，或看看「可用变量」里有哪些名字。`);
  }
  eval(n) {
    this.tick();
    switch (n.t) {
      case 'num':
        this.usage.numbers.push(n.v);
        return n.float ? pyFloat(n.v) : pyInt(n.v);
      case 'str': return new PyStr(n.v);
      case 'const': return n.v === 'True' ? pyBool(true) : n.v === 'False' ? pyBool(false) : NONE;
      case 'name': return this.lookup(n.id);
      case 'paren': return this.eval(n.e);
      case 'list':
        this.usage.listMax = Math.max(this.usage.listMax, n.items.length);
        this.usage.lists++;
        return new PyList(n.items.map((e) => this.eval(e)));
      case 'tuple': return new PyTuple(n.items.map((e) => this.eval(e)));
      case 'unary':
        this.usage.ops.add(`u${n.op}`);
        this.usage.opCount++;
        return unary(n.op, this.eval(n.e));
      case 'bin': {
        this.usage.ops.add(n.op);
        this.usage.opCount++;
        return binary(n.op, this.eval(n.l), this.eval(n.r));
      }
      case 'cmp': {
        let left = this.eval(n.operands[0]);
        let result = null;
        for (let k = 0; k < n.ops.length; k++) {
          this.usage.ops.add(n.ops[k]);
          this.usage.opCount++;
          const right = this.eval(n.operands[k + 1]);
          result = binary(n.ops[k], left, right);
          if (k < n.ops.length - 1 && !truth(result)) return result;
          left = right;
        }
        return result;
      }
      case 'bool': {
        const l = this.eval(n.l);
        if (n.op === 'and') return truth(l) ? this.eval(n.r) : l;
        return truth(l) ? l : this.eval(n.r);
      }
      case 'not': return pyBool(!truth(this.eval(n.e)));
      case 'attr': return this.getAttr(this.eval(n.obj), n.name, n.obj);
      case 'call': {
        const fn = this.eval(n.fn);
        if (!(fn instanceof PyFunc)) {
          throw err('TypeError', `'${shortType(fn)}' object is not callable`,
            fn instanceof PyTuple ? 'shape 是属性不是方法：写 a.shape，不要加括号。' : `「${shortType(fn)}」不能加括号调用。`);
        }
        if (!fn.name.startsWith('ndarray.')) this.usage.calls.add(fn.name);
        this.usage.opCount++;
        const args = n.args.map((a) => this.eval(a));
        const kw = {};
        for (const k of n.kwargs) kw[k.name] = this.eval(k.value);
        return fn.fn(args, kw, this);
      }
      case 'sub': {
        const obj = this.eval(n.obj);
        this.usage.opCount++;
        this.usage.subscripts++;
        return getItem(obj, this.indexItems(n), this.usage.index);
      }
      case 'slice': throw err('SyntaxError', 'invalid syntax', '冒号切片只能写在方括号里。');
      case 'ellipsis': throw err('SyntaxError', 'invalid syntax');
      default: throw err('SyntaxError', 'invalid syntax');
    }
  }
  indexItems(n) {
    return n.items.map((it) => {
      if (it.t === 'slice') {
        const part = (e) => {
          if (!e) return null;
          const v = this.eval(e);
          if (v === NONE) return null;
          if (!(v instanceof Scalar) || v.dtype === 'float') {
            throw err('TypeError', 'slice indices must be integers or None or have an __index__ method', '切片的起点、终点、步长都要是整数。');
          }
          return v.v;
        };
        return new PySlice(part(it.start), part(it.stop), part(it.step));
      }
      if (it.t === 'ellipsis') return 'ellipsis';
      return this.eval(it);
    });
  }
  getAttr(obj, name, node) {
    if (obj instanceof PyModule) {
      if (name === 'random') throw RANDOM_MSG();
      if (!Object.prototype.hasOwnProperty.call(obj.attrs, name)) {
        throw err('AttributeError', `module 'numpy' has no attribute '${name}'`, `np 里没有「${name}」——检查拼写；高原魔法只收录了常用的 numpy 函数。`);
      }
      this.usage.npAttrs.add(name);
      return obj.attrs[name];
    }
    if (obj instanceof NDArray) return arrayAttr(obj, name, this.usage);
    if (obj instanceof PyDType && name === 'name') return new PyStr(dtypeName(obj.dtype));
    if (obj instanceof Scalar && obj.np) {
      if (['shape', 'ndim', 'size', 'dtype', 'sum', 'mean', 'max', 'min', 'item', 'round', 'astype'].includes(name)) {
        return arrayAttr(makeArray([], [obj.v], obj.dtype), name, this.usage);
      }
    }
    void node;
    throw err('AttributeError', `'${shortType(obj)}' object has no attribute '${name}'`,
      obj instanceof PyList ? 'Python 列表没有这个方法：先用 np.array(...) 把它变成数组。' : `「${shortType(obj)}」没有「${name}」这个属性。`);
  }
  exec(stmt) {
    switch (stmt.t) {
      case 'pass': return { value: NONE, note: stmt.note };
      case 'expr': return { value: this.eval(stmt.e) };
      case 'assign': {
        const value = this.eval(stmt.value);
        for (const tg of stmt.targets) this.assignTo(tg, value);
        return { value: NONE, assigned: stmt.targets.map((t) => (t.t === 'name' ? t.id : this.baseName(t))) };
      }
      case 'aug': {
        const tg = stmt.target;
        this.usage.ops.add(`${stmt.op}=`);
        this.usage.opCount++;
        const rhs = this.eval(stmt.value);
        this.usage.assigns.push({ name: this.baseName(tg), sub: tg.t === 'sub', op: stmt.op });
        if (tg.t === 'name') {
          const cur = this.lookup(tg.id);
          if (cur instanceof NDArray) inplace(stmt.op, cur, rhs);
          else this.scope[tg.id] = binary(stmt.op, cur, rhs);
          return { value: NONE, assigned: [tg.id] };
        }
        const obj = this.eval(tg.obj);
        const items = this.indexItems(tg);
        const cur = getItem(obj, items, this.usage.index);
        const res = cur instanceof NDArray ? inplace(stmt.op, cur, rhs) : binary(stmt.op, cur, rhs);
        setItem(obj, items, res, {});
        return { value: NONE, assigned: [this.baseName(tg)] };
      }
      default: throw err('SyntaxError', 'invalid syntax');
    }
  }
  baseName(tg) {
    let t = tg;
    while (t.t === 'sub' || t.t === 'attr') t = t.obj;
    return t.t === 'name' ? t.id : null;
  }
  assignTo(tg, value) {
    if (tg.t === 'name') {
      if (Object.prototype.hasOwnProperty.call(this.builtins, tg.id) && tg.id === 'np') {
        throw err('NameError', "refusing to overwrite 'np'", '别覆盖 np——后面的咒语还要用它。');
      }
      this.scope[tg.id] = value;
      this.usage.assigns.push({ name: tg.id, sub: false, op: '=' });
      return;
    }
    const obj = this.eval(tg.obj);
    this.usage.subscripts++;
    this.usage.assigns.push({ name: this.baseName(tg), sub: true, op: '=' });
    setItem(obj, this.indexItems(tg), value, this.usage.index);
  }
}

function suggestName(id, names) {
  let best = null, bd = Infinity;
  for (const nm of names) {
    if (nm === id) continue;
    const d = levenshtein(id.toLowerCase(), nm.toLowerCase());
    const limit = Math.max(1, Math.floor((Math.max(id.length, nm.length) + 2) / 3));
    if (d <= limit && d < bd) { bd = d; best = nm; }
  }
  return best;
}

function levenshtein(a, b) {
  const dp = range(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function freshUsage() {
  return {
    names: new Set(), calls: new Set(), npAttrs: new Set(), ops: new Set(), numbers: [],
    index: {}, listMax: 0, lists: 0, assigns: [], opCount: 0, subscripts: 0,
  };
}

/**
 * 执行一段咒语。scope 被原地修改（赋值 / 原地运算）。
 * 返回 { ok, value（最后一个表达式语句的值，没有则 None）, output（print 行）, error, usage, statements }
 * error = { type, message, hint }
 */
export function run(source, scope = {}, { maxSource = LIMITS.maxSource } = {}) {
  const usage = freshUsage();
  const ip = new Interp(scope, usage);
  let value = NONE;
  let statements = 0;
  let lastKind = null;
  try {
    const prog = parse(String(source).trim(), maxSource);
    for (const st of prog) {
      const r = ip.exec(st);
      statements++;
      lastKind = st.t;
      value = st.t === 'expr' ? r.value : NONE;
    }
    return { ok: true, value, output: ip.out, error: null, usage, statements, lastKind };
  } catch (e) {
    if (!(e instanceof PyError)) {
      if (e instanceof RangeError) {
        return { ok: false, value: NONE, output: ip.out, error: { type: 'RecursionError', message: 'maximum recursion depth exceeded', hint: '这句咒语太复杂了。' }, usage, statements };
      }
      throw e;
    }
    return { ok: false, value: NONE, output: ip.out, error: { type: e.type, message: e.message, hint: e.hint }, usage, statements };
  }
}

// ============================================================
// 给小游戏用的工具
// ============================================================

/** JS 嵌套数组 → ndarray（dtype 缺省按内容推断） */
export function fromJS(nested, dtype = null) {
  const toVal = (x) => {
    if (Array.isArray(x)) return new PyList(x.map(toVal));
    if (typeof x === 'boolean') return pyBool(x);
    return Number.isInteger(x) && dtype !== 'float' ? pyInt(x) : pyFloat(x);
  };
  return arrayFromValue(toVal(nested), dtype);
}

/** ndarray / 标量 → JS 嵌套数组 / 数字（bool → true/false） */
export function toJS(v) {
  if (v instanceof Scalar) return v.dtype === 'bool' ? !!v.v : v.v;
  if (v instanceof NDArray) {
    const st = stridesOf(v.shape);
    const rec = (offset, axis) => {
      if (axis === v.ndim) { const x = v.at(offset); return v.dtype === 'bool' ? !!x : x; }
      return range(v.shape[axis]).map((i) => rec(offset + i * st[axis], axis + 1));
    };
    return rec(0, 0);
  }
  if (isSeq(v)) return v.items.map(toJS);
  if (v === NONE) return null;
  return undefined;
}

/** 深拷贝作用域（保持数组之间共享缓冲区的关系），实时预览在副本上跑 */
export function cloneScope(scope) {
  const stores = new Map();
  const cs = (s) => {
    if (!stores.has(s)) stores.set(s, { data: s.data.slice(), dtype: s.dtype });
    return stores.get(s);
  };
  const out = {};
  for (const [k, v] of Object.entries(scope)) {
    if (v instanceof NDArray) {
      const a = new NDArray(v.shape.slice(), cs(v.store), v.map.slice());
      a.prov = { store: cs(v.prov.store), pos: v.prov.pos.slice() };
      out[k] = a;
    } else out[k] = v;
  }
  return out;
}

/** 结果 v 选中了数组 arr 的哪些格子（逻辑下标集合）；不是从 arr 取出来的返回 null */
export function selectionOf(v, arr) {
  if (!(arr instanceof NDArray) || !v || !v.prov || v.prov.store !== arr.store) return null;
  const inv = new Map(arr.map.map((p, i) => [p, i]));
  const sel = new Set();
  for (const p of v.prov.pos) if (inv.has(p)) sel.add(inv.get(p));
  return sel;
}

/** 两个值是否「同形状、同 dtype 类别、数值相等（浮点容差）」 */
export function sameArray(a, b, { tol = 1e-9, checkDtype = true } = {}) {
  if (!(a instanceof NDArray) || !(b instanceof NDArray)) return false;
  if (a.shape.join() !== b.shape.join()) return false;
  if (checkDtype && a.dtype !== b.dtype) return false;
  for (let i = 0; i < a.size; i++) {
    const x = a.at(i), y = b.at(i);
    if (Number.isNaN(x) && Number.isNaN(y)) continue;
    if (Math.abs(x - y) > tol * Math.max(1, Math.abs(y))) return false;
  }
  return true;
}

export const isNDArray = isArr;
export const isScalar = isNum;
export { arrayFromValue, typeName as pyTypeName };
