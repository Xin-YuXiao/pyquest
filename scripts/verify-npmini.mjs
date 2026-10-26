// ============================================================
// npmini 对拍：同一段咒语分别在游戏内解释器（core/npmini.js）与真 NumPy 1.26 上执行，
// 逐字比对 print 输出；抛异常的用例比对异常类型（JS 的类型名必须出现在 Python 异常的 MRO 里）。
// 另外把各小游戏每关的参考解（games/*/levels.js 导出的 VERIFY_CASES）一起送进来对拍。
// 任一不一致 exit 1。python 解释器探测同 verify-quiz（anaconda → python3 → python）。
// ============================================================
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { run } from '../src/core/npmini.js';
import { VERIFY_CASES as GAME_CASES } from '../src/games/verifyCases.js';

const CANDIDATES = ['/Users/uranus/Applications/anaconda3/bin/python3', 'python3', 'python'];
let PYTHON = null;
for (const cand of CANDIDATES) {
  if (cand.includes('/') && !existsSync(cand)) continue;
  const probe = spawnSync(cand, ['-c', 'import numpy'], { timeout: 20000 });
  if (probe.status === 0) { PYTHON = cand; break; }
}
if (!PYTHON) {
  console.error('找不到装有 numpy 的 python 解释器（依次尝试过 ' + CANDIDATES.join(' / ') + '）');
  process.exit(1);
}

// ---------- 用例：每条是一段 Python（可多句），用 print 输出 ----------
const P = (expr) => `print(${expr})`;
const CASES = [
  // --- 打印：整数 / 布尔 ---
  P('np.array([1, 2, 3])'),
  P('np.array([1, 10, -3])'),
  P('np.array([-100, 5, 7])'),
  P('np.array([True, False, True])'),
  P('np.array([True, True])'),
  P('np.array([[1, 2, 3], [4, 5, 6]])'),
  P('np.array([[1, 20], [300, 4]])'),
  P('np.arange(12).reshape(2, 2, 3)'),
  P('np.arange(30)'),
  P('np.arange(100)'),
  P('np.arange(50).reshape(5, 10)'),
  P('np.arange(-20, 20, 3)'),
  P('np.array([], dtype=int)'),
  P('np.zeros((0, 3))'),
  // --- 打印：浮点 ---
  P('np.array([1.0, 2.5, 3.0])'),
  P('np.array([0.1, 0.2, 0.3])'),
  P('np.array([0.1 + 0.2])'),
  P('np.linspace(0, 1, 5)'),
  P('np.linspace(0, 1, 11)'),
  P('np.linspace(0, 1, 20)'),
  P('np.linspace(0, 2 * np.pi, 9)'),
  P('np.linspace(-1, 1, 7)'),
  P('np.array([1/3, 2/3, 1.0])'),
  P('np.array([-1.5, 2.0])'),
  P('np.array([1e-5, 1.0])'),
  P('np.array([1.5e-5, 1.0])'),
  P('np.array([0.001, 2.0])'),
  P('np.array([1e8, 1.0])'),
  P('np.array([123456789.0])'),
  P('np.array([12345678.9])'),
  P('np.array([0.0001, 0.1])'),
  P('np.array([0.00009, 0.1])'),
  P('np.array([1.0, 1000.0])'),
  P('np.array([1.0, 1001.0])'),
  P('np.array([0.0, 0.0])'),
  P('np.array([-0.0, 1.0])'),
  P('np.array([np.nan, 1.0])'),
  P('np.array([np.inf, -np.inf, 1.5])'),
  P('np.array([np.nan, np.inf])'),
  P('np.array([1.0, 2.0]) / 0'),
  P('np.array([0.0, 1.0]) / 0'),
  P('np.zeros((2, 3))'),
  P('np.ones((3, 3)) * 7'),
  P('np.array([[1.5, 2.25], [3.0, 4.125]])'),
  P('np.sin(np.linspace(0, np.pi, 5))'),
  P('np.sqrt(np.arange(6))'),
  P('np.array([1.000000001, 2.0])'),
  P('np.array([2/3, 1e-3, 5.0])'),
  P('np.array([100.5, -7.25, 3.0])'),
  P('np.full((2, 2), 7)'),
  P('np.full((2, 2), 7.0)'),
  P('np.full((2, 3), True)'),
  // --- 打印：标量 / 容器 ---
  P('np.array([1, 2, 3]).sum()'),
  P('np.array([1, 2, 3, 4]).mean()'),
  P('np.array([1.0, 2.0]).sum()'),
  P('np.array([3, 9, 5]).argmax()'),
  P('np.array([[1, 2], [3, 4]]).shape'),
  P('np.zeros(5).shape'),
  P('np.array(5)'),
  P('np.array(3.0)'),
  P('np.array(True)'),
  P('repr(np.array(3.0))'),
  P('repr(np.array([1, 2]))'),
  P('repr(np.array([1.0, 2.5]))'),
  P('repr(np.linspace(0, 1, 20))'),
  P('repr(np.array([], dtype=float))'),
  P('[np.array([1, 2]), 3]'),
  P('(np.array([True]),)'),
  P('np.where(np.array([1, 0, 3]) > 0)[0]'),
  P('1e16'), P('1e15'), P('0.0001'), P('0.00001'), P('1.5e-7'), P('123456789012345678.0'),
  P('2.0 ** 0.5'), P('7 / 2'), P('7 // 2'), P('-7 // 2'), P('-7 % 3'), P('7 % -3'), P('2 ** -1'), P('2 ** 10'),
  P('True + True'), P('True & False'), P('3 == 3.0'), P('0.1 + 0.2'), P('round(2.5)'), P('round(3.5)'), P('round(2.675, 2)'), P('round(0.125, 2)'),
  P('abs(-3)'), P('int(3.9)'), P('int(-3.9)'), P('float(2)'), P('len([1, 2, 3])'),
  P('[1, 2] + [3]'), P('[1, 2] * 2'), P('(1, 2) + (3,)'),
  P('np.array([1, 2, 3]).tolist()'),
  P('type(np.array([1]))'),
  P('np.pi'), P('np.e'),
  // --- 一维下标与切片 ---
  'a = np.array([10, 20, 30, 40, 50])\n' + [
    'a[0]', 'a[-1]', 'a[-2]', 'a[1:3]', 'a[:3]', 'a[2:]', 'a[::2]', 'a[1::2]', 'a[::-1]', 'a[-3:]', 'a[:-1]',
    'a[4:1:-1]', 'a[10:]', 'a[-10:2]', 'a[3:1]', 'a[[0, 2]]', 'a[[True, False, True, False, True]]', 'a[a > 25]',
    'a[(a > 15) & (a < 45)]', 'a[(a < 15) | (a > 45)]', 'a[~(a > 25)]', 'a > 25', 'a == 30', 'a[np.array([4, 0, 0])]',
  ].map(P).join('\n'),
  'a = np.array([10, 20, 30])\n' + P('a[5]'),
  'a = np.array([10, 20, 30])\n' + P('a[-4]'),
  'a = np.array([10, 20, 30])\n' + P('a[1, 2]'),
  'a = np.array([10, 20, 30])\n' + P('a[1.0]'),
  'a = np.array([10, 20, 30])\n' + P('a[[True, False]]'),
  'a = np.array([10, 20, 30])\n' + P('a[::0]'),
  'a = np.array([10, 20, 30])\n' + P('a[1.5:]'),
  // --- 二维下标 ---
  'm = np.arange(1, 13).reshape(3, 4)\n' + [
    'm', 'm[1]', 'm[1, 2]', 'm[1][2]', 'm[:, 0]', 'm[:, -1]', 'm[0:2, 1:3]', 'm[::2, ::2]', 'm[1:, ::-1]', 'm[-1, :]',
    'm[m > 6]', 'm[m % 2 == 0]', 'm[[0, 2]]', 'm[[0, 2], [1, 3]]', 'm[1, [0, 3]]', 'm[:, [0, 3]]', 'm[[0, 2], 1:3]',
    'm[m[:, 0] > 2]', 'm[None, 0]', 'm[:, None, 0]', 'm[..., 1]', 'm.T', 'm.T[0]', 'm.shape', 'm.ndim', 'm.size',
    'm.sum()', 'm.sum(axis=0)', 'm.sum(axis=1)', 'm.mean(axis=0)', 'm.max(axis=1)', 'm.min()', 'm.argmax()',
    'm.argmax(axis=0)', 'm.argmin(axis=1)', 'm.std()', 'm.sum(axis=-1)', 'm.reshape(4, 3)', 'm.reshape(2, -1)',
    'm.reshape(-1)', 'm.flatten()', 'm.ravel()', 'np.sum(m, axis=0)', 'np.mean(m)', 'np.max(m)', 'len(m)',
    'm * 2', 'm + np.array([1, 2, 3, 4])', 'm + np.array([[10], [20], [30]])', 'm > 5', '(m > 5).sum()',
    'np.count_nonzero(m > 5)', 'm.any()', '(m > 20).any()', '(m > 0).all()', 'm[1:3, 1:3].sum()',
  ].map(P).join('\n'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m[3]'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m[1, 4]'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m[1, 2, 3]'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m.sum(axis=2)'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m[m > 5, 1]'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m[np.array([True, False])]'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m.reshape(5, 2)'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m.reshape(5, -1)'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m + np.array([1, 2, 3])'),
  'm = np.arange(12).reshape(3, 4)\n' + P('m[[0, 1], [0, 1, 2]]'),
  // --- 赋值 / 视图语义 ---
  'a = np.arange(6)\nb = a[1:4]\nb[0] = 99\nprint(a)',
  'a = np.arange(6)\nb = a[[1, 2]]\nb[0] = 99\nprint(a)',
  'a = np.arange(6)\nb = a\nb += 1\nprint(a)',
  'a = np.arange(6)\nb = a\nb = b + 1\nprint(a)\nprint(b)',
  'a = np.arange(6)\na[a > 2] = 0\nprint(a)',
  'a = np.arange(6)\na[a > 2] = np.array([7, 8, 9])\nprint(a)',
  'a = np.arange(6)\na[a > 2] = [7, 8]\nprint(a)',
  'a = np.arange(6)\na[1:3] = [7, 8]\nprint(a)',
  'a = np.arange(6)\na[1:3] = [7, 8, 9]\nprint(a)',
  'a = np.arange(6)\na[[0, 0, 1]] = [5, 6, 7]\nprint(a)',
  'a = np.arange(6)\na[[0, 0]] += 1\nprint(a)',
  'a = np.arange(6)\na[::2] = -1\nprint(a)',
  'a = np.arange(6)\na[0] = 2.7\nprint(a)',
  'a = np.arange(6)\na[0] = -2.7\nprint(a)',
  'a = np.zeros(3)\na[1] = 5\nprint(a)',
  'a = np.array([True, False])\na[1] = 5\nprint(a)',
  'a = np.arange(6)\na += 1.5\nprint(a)',
  'a = np.arange(6)\na /= 2\nprint(a)',
  'a = np.arange(6)\na //= 2\nprint(a)',
  'a = np.arange(6.0)\na /= 2\nprint(a)',
  'a = np.arange(6)\na = a / 2\nprint(a)',
  'a = np.arange(6)\na -= np.array([1, 2])\nprint(a)',
  'a = np.arange(6)\na[1:4] -= 10\nprint(a)',
  'a = np.arange(6)\na[1:4] *= np.array([1, 2, 3])\nprint(a)',
  'a = np.array([5, 3, 8])\na[a > 4] -= 4\nprint(a)',
  'a = np.array([5, 3, 8])\na[a > 4] //= 2\nprint(a)',
  'a = np.array([5, 3, 8])\na[0] += 1.5\nprint(a)',
  'a = np.array([5, 3, 8])\na[1:] += 1.5\nprint(a)',
  'm = np.zeros((3, 4), dtype=int)\nm[1] = 1\nm[:, 2] = 2\nprint(m)',
  'm = np.zeros((3, 4), dtype=int)\nm[0:2, 1:3] = 5\nprint(m)',
  'm = np.zeros((3, 4), dtype=int)\nm[:] = 1\nm[1:-1, 1:-1] = 0\nprint(m)',
  'm = np.zeros((4, 4), dtype=int)\nm[::2, ::2] = 1\nm[1::2, 1::2] = 1\nprint(m)',
  'm = np.zeros((3, 4), dtype=int)\nm[1] = [1, 2, 3, 4]\nprint(m)',
  'm = np.zeros((3, 4), dtype=int)\nm[:, 0] = [7, 8, 9]\nprint(m)',
  'm = np.zeros((3, 4), dtype=int)\nm[1] = [1, 2, 3]\nprint(m)',
  'm = np.arange(12).reshape(3, 4)\nm[m > 5] = 0\nprint(m)',
  'm = np.arange(12).reshape(3, 4)\nm.T[0] = 100\nprint(m)',
  'm = np.arange(12).reshape(3, 4)\nr = m.reshape(4, 3)\nr[0, 0] = -1\nprint(m)',
  'm = np.arange(12).reshape(3, 4)\nm = 1 - m\nprint(m)',
  'x = 5\nx += 2\nprint(x)',
  'x = 5\nx /= 2\nprint(x)',
  'a = b = np.arange(3)\na[0] = 9\nprint(b)',
  // --- 运算 / 广播 / dtype ---
  ...[
    'np.array([1, 2, 3]) + 2', 'np.array([1, 2, 3]) * 2.5', 'np.array([1, 2, 3]) / 2', 'np.array([1, 2, 3]) // 2',
    'np.array([7, -7]) % 3', 'np.array([7.5, -7.5]) % 2', 'np.array([1, 2, 3]) ** 2', 'np.array([1.0, 2.0]) ** -1',
    'np.array([4, 9]) ** 0.5', 'np.array([1, 2]) * np.array([3, 4])', 'np.array([1, 2]) - np.array([[1], [2]])',
    'np.array([True, False]) + 1', 'np.array([True, False]) + np.array([True, True])', 'np.array([True, False]) * np.array([True, True])',
    'np.array([True, False]) & np.array([True, True])', 'np.array([True, False]) | np.array([False, False])',
    'np.array([True, False]) ^ np.array([True, True])', '~np.array([True, False])', '~np.array([1, 2])', '-np.array([1, 2])',
    'np.array([1, 2]) & 1', 'np.array([5, 6]) | 1', 'np.array([1, 2]) == np.array([1, 3])', 'np.array([1, 2]) != 1',
    'np.array([1, 2, 3]) >= 2', '5 - np.array([1, 2])', '1 / np.array([1, 2, 4])', '2 ** np.array([1, 2, 3])',
    'np.array([1, 2]) + [10, 20]', '[10, 20] + np.array([1, 2])', 'np.array([1, 2]) + True',
    'np.array([1, 2, 3])[0] + 0.5', 'np.array([1, 2, 3])[0] / 0', 'np.array([1.0])[0] / 0', 'np.array([1, 2, 3]).sum() * 1.5',
    'np.array([1, 2]) // 0', 'np.array([1, 2]) % 0', 'np.array([1.0, -1.0, 0.0]) // 0', 'np.array([0, 1]) / 0',
    'np.abs(np.array([-1, 2, -3]))', 'np.abs(np.array([-1.5, 2.0]))', 'abs(np.array([-1, 2]))',
    'np.floor(np.array([1.5, -1.5]))', 'np.ceil(np.array([1.2, -1.2]))', 'np.floor(np.array([1, 2]))',
    'np.round(np.array([0.5, 1.5, 2.5, -0.5]))', 'np.round(np.array([2.675, 1.005]), 2)', 'np.round(np.array([123, 456]), -1)',
    'np.round(np.array([1234.5]), -2)', 'np.exp(np.array([0, 1]))', 'np.log(np.array([1, np.e]))', 'np.log10(np.array([1, 10, 1000]))',
    'np.cos(np.array([0.0, np.pi]))', 'np.sin(np.pi)', 'np.sqrt(2)', 'np.sqrt(np.array([-1.0]))',
    'np.maximum(np.array([1, 5]), np.array([3, 2]))', 'np.minimum(np.array([1, 5]), 3)',
    'np.where(np.array([1, 5, 3]) > 2, 1, 0)', 'np.where(np.array([1, 5, 3]) > 2, np.array([10, 20, 30]), -1)',
    'np.sort(np.array([3, 1, 2]))', 'np.sort(np.array([[3, 1], [0, 2]]))', 'np.sort(np.array([[3, 1], [0, 2]]), axis=0)',
    'np.array([1, 2, 3]).cumsum()', 'np.array([1.5, 2.5]).cumsum()', 'np.array([3, 1, 2]).astype(float)', 'np.array([1.7, -1.7]).astype(int)',
    'np.array([0, 2]).astype(bool)', 'np.array([1, 2, 3, 4]).std()', 'np.array([1, 2, 3, 4]).var()', 'np.array([2, 3, 4]).prod()',
    'np.arange(5)', 'np.arange(2, 11, 2)', 'np.arange(10, 0, -3)', 'np.arange(0, 1, 0.1)', 'np.arange(0.5, 3)',
    'np.arange(0, 1, 0.25)', 'np.arange(1, 2, 0.3)', 'np.arange(5.0)', 'np.arange(3, dtype=float)',
    'np.linspace(0, 10, 5)', 'np.linspace(0, 1, 5, endpoint=False)', 'np.linspace(1, 1, 3)', 'np.linspace(0, 1, 1)',
    'np.linspace(0, 1, num=3)', 'np.zeros(3, dtype=int)', 'np.zeros((2, 2), dtype=bool)', 'np.ones(4)', 'np.zeros_like(np.arange(3))',
    'np.array([[1, 2], [3, 4]]) * np.array([10, 100])', 'np.array([1, 2, 3]).reshape(3, 1) * np.array([1, 10])',
    'np.arange(1, 4).reshape(3, 1) * np.arange(1, 5)', 'np.array([1, 2, 3])[:, None] + np.array([10, 20])',
    'np.array([1, 2.5, True])', 'np.array([True, 2])', 'np.array([[1, 2], [3, 4]], dtype=float)', 'np.array((1, 2))',
    'np.array([np.array([1, 2]), np.array([3, 4])])', 'np.array([1, 2, 3], dtype=bool)', 'np.array(np.arange(3))',
    'sum(np.array([1, 2, 3]))', 'max(np.array([1, 5, 3]))', 'min([4, 2, 8])', 'np.mean([1, 2, 3, 4])', 'np.sum([[1, 2], [3, 4]], axis=1)',
    'np.max(np.array([1.5, np.nan]))', 'np.array([1, np.nan, 3]).argmax()', 'np.argmin(np.array([4, 1, 1]))',
    'np.array([1, 2, 3]).mean() > 1.5', '(np.array([1, 2, 3]) > 1).sum()', 'len(np.array([1, 2, 3])[np.array([1, 2, 3]) > 1])',
    'np.array([3, 1, 2]) < 2.5', '2 < np.array([1, 3])', 'np.array([1, 2, 3]) * 0.1', 'np.array([0.1, 0.2]) * 3',
    'np.array([-40, 0, 37, 100]) * 9 / 5 + 32', '(np.array([2.0, 4.0, 6.0]) - 2) / (6 - 2)', '0.5 * np.array([2, 4]) * np.array([3, 1]) ** 2',
    '10 ** (-0.4 * np.array([0.0, 1.0, 2.5, 5.0]))',
  ].map(P),
  // --- 报错 ---
  ...[
    'np.array([1, 2, 3]) + np.array([1, 2])', 'np.array([1, 2]) ** -1', 'np.array([True]) - np.array([True])', '-np.array([True])',
    'np.array([1.5]) & np.array([1.0])', '~np.array([1.5])', 'np.array([1, 2]) > 1 and True', 'bool(np.array([1, 2]))',
    'np.zeros((2, 2)).reshape(3, 2)', 'np.array([[1, 2], [3]])', 'np.array([1, 2])[0][0]', '[1, 2, 3] - 1', '[1, 2] < 3',
    'np.arange()', 'np.arange(5).max(axis=1)', 'np.array([]).max()', 'len(np.array(5))', '1 / 0', '1 // 0', '1.0 / 0', '5 % 0',
    'undefined_name', 'np.foo', 'np.array([1]).foo', '[1, 2].foo', 'np.arange(5)(1)', 'np.zeros(2.5)', 'np.arange(0, 1, 0)',
    'np.array([1, 2])[np.array([0.5])]', '(1, 2)[5]', 'int(np.array([1, 2]))',
  ].map(P),
  'a = np.arange(5)\nprint(a[a > 1 & a < 4])',
  'a = np.arange(5.0)\nprint(a[a > 1 & a < 4])',
  'a = np.arange(5)\nprint(1 < a < 4)',
  'a = np.arange(5)\nprint(a[(a > 1) and (a < 4)])',
  'a = np.arange(6)\na[a > 2] = [1, 2]',
  'a = np.arange(6)\na[[0, 1, 2]] = [1, 2]',
  'a = np.arange(6)\na[1:3] = [7, 8, 9]',
  'a = np.arange(6)\na += np.ones((2, 6))',
  'a = np.arange(6)\na = a ++ 1\nprint(a)',
  'print(np.array([1, 2, 3]',
  'print(np.array([1, 2, 3]]))',
  'a = np.arange(5)\nprint(a[1:3:])',
  'a = np.arange(5)\nprint(a[:])',
  'a = np.arange(5)\nprint(a[::])',
  'a = np.arange(6).reshape(2, 3)\nprint(a[:, ::-1])',
  'a = np.arange(6).reshape(2, 3)\nprint(a[::-1])',
  'a = np.arange(6).reshape(2, 3)\nprint(a[::-1, ::-1].T)',
  'a = np.arange(6).reshape(2, 3)\nprint(a.T.reshape(-1))',
  'a = np.arange(6).reshape(2, 3)\nprint(a.T.reshape(2, 3))',
];

const ALL = [...CASES, ...GAME_CASES.map((c) => c.code)];

// ---------- 真 NumPy ----------
const PY = String.raw`
import sys, json, io, contextlib, warnings
import numpy as np
warnings.filterwarnings('ignore')
cases = json.loads(sys.stdin.read())
res = []
for c in cases:
    buf = io.StringIO()
    g = {'np': np, 'numpy': np}
    try:
        with contextlib.redirect_stdout(buf):
            exec(c, g)
        res.append({'out': buf.getvalue(), 'err': None})
    except BaseException as e:
        res.append({'out': buf.getvalue(), 'err': type(e).__name__, 'mro': [k.__name__ for k in type(e).__mro__], 'msg': str(e)})
sys.stdout.write(json.dumps(res))
`;
const py = spawnSync(PYTHON, ['-c', PY], {
  input: JSON.stringify(ALL), encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});
if (py.status !== 0) {
  console.error('python 运行失败：', py.stderr);
  process.exit(1);
}
const expected = JSON.parse(py.stdout);

// ---------- 比对 ----------
// Windows 上 numpy<2 的默认整型是 int32，dtype 名会出现在少数报错信息里；只比异常类型即可
const ERR_ALIASES = { UFuncTypeError: ['UFuncTypeError', '_UFuncOutputCastingError', 'TypeError'] };
let fail = 0;
ALL.forEach((code, i) => {
  const r = run(code, {}, { maxSource: 1e6 });
  const got = { out: r.output.map((l) => l + '\n').join(''), err: r.ok ? null : r.error.type };
  const exp = expected[i];
  let ok = got.out === exp.out;
  if (exp.err || got.err) {
    const aliases = ERR_ALIASES[got.err] || [got.err];
    ok = ok && !!exp.err && !!got.err && aliases.some((a) => exp.mro.includes(a));
  }
  if (!ok) {
    fail++;
    console.log(`✗ #${i}\n--- 代码\n${code}\n--- 真 NumPy\n${exp.out}${exp.err ? `!! ${exp.err}: ${exp.msg}\n` : ''}--- npmini\n${got.out}${got.err ? `!! ${got.err}: ${r.error.message}\n` : ''}`);
  }
});
const gameN = GAME_CASES.length;
if (fail) {
  console.log(`\n[verify-npmini] ${fail} / ${ALL.length} 条与真 NumPy 不一致`);
  process.exit(1);
}
console.log(`[verify-npmini] ✓ ${ALL.length} 条（其中小游戏参考解 ${gameN} 条）与真 NumPy ${'1.26'} 输出一致（${PYTHON}）`);
