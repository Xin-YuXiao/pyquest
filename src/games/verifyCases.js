// ============================================================
// 各小游戏送去与真 NumPy 对拍的用例汇总（scripts/verify-npmini.mjs 读取）
// 每个小游戏在自己的 verify.js 里导出 VERIFY_CASES：[{ name, code }]，code 是一段用 print 输出的 Python
// ============================================================
import { VERIFY_CASES as cards } from './cards/verify.js';
import { VERIFY_CASES as picross } from './picross/verify.js';
import { VERIFY_CASES as arena } from './arena/verify.js';
import { VERIFY_CASES as signal } from './signal/verify.js';
import { VERIFY_CASES as curve } from './curve/verify.js';

export const VERIFY_CASES = [...cards, ...picross, ...arena, ...signal, ...curve];
