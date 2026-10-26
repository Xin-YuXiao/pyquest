// ============================================================
// 外星信号 · 纯逻辑校验（不开浏览器、不跑 Python）
//   1. 关卡数据完整：7 核心 + 1 挑战、id 唯一、提示 / 参考解 / 故事齐全、比特流长度 = 行 × 列、像素取值合法
//   2. 每关参考解经 npmini 执行后与目标逐像素一致；几种等价写法也判过关
//   3. 常见错解（行列对调、忘了翻转 / 镜像 / 阈值 / 解密）判不过
//   4. 比特数只有一种「行 × 列」分解（两个质数之积或质数的平方），reshape 的答案唯一
//   5. 对拍用例里参考解那一行打印 True（与 verify-npmini 合起来 = 真 NumPy 也判一致）
// 任一失败 exit 1。
// ============================================================
import { run } from '../src/core/npmini.js';
import { LEVELS } from '../src/games/signal/levels.js';
import { VERIFY_CASES } from '../src/games/signal/verify.js';
import { makeScope, judge, valueOf, bitCount, targetShape, medalFor, feedback } from '../src/games/signal/logic.js';

let fail = 0;
let pass = 0;
const ok = (cond, label) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${label}`); }
};
const evalOn = (level, src) => {
  const scope = makeScope(level);
  const res = run(src, scope);
  return { res, j: judge(level, valueOf(res, scope)) };
};

// ---------- 1. 数据完整 ----------
const core = LEVELS.filter((l) => !l.challenge);
ok(core.length === 7, `核心关 7 关（实际 ${core.length}）`);
ok(LEVELS.filter((l) => l.challenge).length === 1, '挑战关恰好 1 关');
ok(new Set(LEVELS.map((l) => l.id)).size === LEVELS.length, '关卡 id 唯一');
for (const l of LEVELS) {
  const tag = `[${l.id}]`;
  ok(l.title && l.concept && l.story && l.meaning, `${tag} 标题 / 概念 / 故事 / 含义齐全`);
  ok(Array.isArray(l.hints) && l.hints.length === 2, `${tag} 两条提示（概念 → 关键写法）`);
  ok(typeof l.solution === 'string' && l.solution.length > 0 && Number.isInteger(l.par) && l.par >= 1, `${tag} 有参考解与 par`);
  const [R, C] = targetShape(l);
  ok(l.target.every((r) => r.length === C), `${tag} 目标图每行等长`);
  ok(l.reveal.length === R && l.reveal.every((r) => r.length === C), `${tag} 上色图与目标同尺寸`);
  const n = bitCount(l);
  ok(n === R * C, `${tag} 比特数 ${n} = ${R} × ${C}`);
  ok(Object.values(l.vars).every((v) => v.data.length === n), `${tag} 各频道等长`);
  const allowed = l.palette === 'quad' ? [0, 1, 2, 3] : [0, 1];
  ok(l.target.flat().every((v) => allowed.includes(v)), `${tag} 目标像素取值合法（${l.palette}）`);
  ok(l.target.flat().some((v) => v > 0) && l.target.flat().some((v) => v === 0), `${tag} 目标图不是全亮 / 全暗`);
  // 4. 因数分解唯一
  const pairs = [];
  for (let d = 2; d < n; d++) if (n % d === 0) pairs.push([d, n / d]);
  const expect = R === C ? 1 : 2;
  ok(pairs.length === expect && pairs.some(([a, b]) => a === R && b === C), `${tag} ${n} 只有 ${R}×${C}${R === C ? '' : ` / ${C}×${R}`} 两种排法（实际 ${pairs.map((p) => p.join('×')).join(', ')}）`);
  // 2. 参考解过关
  const sol = evalOn(l, l.solution);
  ok(sol.res.ok && sol.j.ok, `${tag} 参考解 ${l.solution} 过关（${sol.res.ok ? sol.j.kind : sol.res.error.type}）`);
}

// ---------- 2 / 3. 等价写法与常见错解 ----------
const byId = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
const accept = {
  first: ['signal.reshape(7, -1)', 'img = signal.reshape(7, 5)', 'signal.reshape((7, 5))'],
  reversed: ['signal.reshape(7, 17)[::-1, ::-1]', 's = signal[::-1]; s.reshape(7, 17)'],
  mirror: ['signal.reshape(11, 13)[:, ::-1]', 'm = signal.reshape(11, 13); m[:, ::-1]'],
  noise: ['(signal > 0.4).reshape(7, 11)', '(signal >= 0.5).reshape(7, 11)', 'np.round(signal).reshape(7, 11)', '(signal.reshape(7, 11) > 0.5)'],
  pad: ['(a ^ b).reshape(11, 11)', '(a != b).reshape(11, 11)', 'np.abs(a - b).reshape(11, 11)'],
  color: ['(2 * hi + lo).reshape(13, 17)', 'hi.reshape(13, 17) * 2 + lo.reshape(13, 17)'],
  arecibo: ['signal[::-1].reshape(31, 23)[:, ::-1]', 'signal.reshape(31, 23)[::-1, :]'],
  columns: ['signal.reshape(13, 11).T', 'np.transpose(signal.reshape(13, 11))'],
};
const reject = {
  first: ['signal.reshape(5, 7)', 'signal', 'signal.reshape(35, 1)', 'len(signal)'],
  reversed: ['signal.reshape(7, 17)', 'signal.reshape(17, 7)[::-1]', 'signal.reshape(7, 17)[::-1]', 'signal.reshape(7, 17)[:, ::-1]'],
  mirror: ['signal.reshape(11, 13)', 'signal.reshape(11, 13)[::-1]', 'signal[::-1].reshape(11, 13)', 'signal.reshape(13, 11)[:, ::-1]'],
  noise: ['signal.reshape(7, 11)', '(signal < 0.5).reshape(7, 11)', '(signal > 0.5).reshape(11, 7)'],
  pad: ['b.reshape(11, 11)', 'a.reshape(11, 11)', '(a + b).reshape(11, 11)', '(a * b).reshape(11, 11)'],
  color: ['(hi + lo).reshape(13, 17)', '(hi + lo * 2).reshape(13, 17)', 'hi.reshape(13, 17)', '(hi * 2 + lo).reshape(17, 13)'],
  arecibo: ['signal.reshape(31, 23)', 'signal[::-1].reshape(31, 23)', 'signal.reshape(23, 31)[::-1]', 'signal.reshape(31, 23)[:, ::-1]'],
  columns: ['signal.reshape(11, 13)', 'signal.reshape(13, 11)', 'signal.reshape(11, 13).T'],
};
for (const [id, list] of Object.entries(accept)) {
  for (const src of list) {
    const { res, j } = evalOn(byId[id], src);
    ok(res.ok && j.ok, `[${id}] 等价写法过关：${src}（${res.ok ? j.kind : res.error.type}）`);
  }
}
for (const [id, list] of Object.entries(reject)) {
  for (const src of list) {
    const { res, j } = evalOn(byId[id], src);
    ok(!j.ok, `[${id}] 错解不过关：${src}（${res.ok ? j.kind : res.error.type}）`);
    if (res.ok) ok(typeof feedback(byId[id], j) === 'string' && feedback(byId[id], j).length > 4, `[${id}] 错解有反馈：${src}`);
  }
}
// 行列对调的错图确实不是目标（斜条纹）
{
  const l = byId.first;
  const { j } = evalOn(l, 'signal.reshape(5, 7)');
  ok(j.kind === 'shape' && j.shape.join() === '5,7', '第一关 reshape(5, 7) 判「形状不对」');
  const r = evalOn(byId.mirror, 'signal.reshape(11, 13)');
  ok(r.j.kind === 'values' && r.j.match > 0.5 && r.j.match < 1, `镜像关未镜像：形状对、像素部分一致（${Math.round(r.j.match * 100)}%）`);
  const e = evalOn(l, 'signal.reshape(6, 6)');
  ok(!e.res.ok && e.res.error.type === 'ValueError', 'reshape(6, 6) 报 ValueError（36 ≠ 35）');
  ok(evalOn(l, 'len(signal)').j.kind === 'scalar', 'len(signal) 判为「一个数」');
  ok(evalOn(l, 'signal').j.kind === '1d', '原始信号判为一维');
}

// ---------- 奖牌 ----------
ok(medalFor(1, 1).key === 'gold' && medalFor(2, 1).key === 'silver' && medalFor(3, 1).key === 'silver' && medalFor(4, 1).key === 'bronze', '奖牌：≤par 金 / ≤par+2 银 / 其余铜');

// ---------- 5. 对拍用例里参考解打印 True ----------
for (const c of VERIFY_CASES) {
  const r = run(c.code, {}, { maxSource: 1e6 });
  ok(r.ok, `对拍用例可执行：${c.name}`);
  if (!r.ok) continue;
  if (c.name.endsWith('/solution')) ok(r.output[1] === 'True', `对拍用例 ${c.name} 打印 True`);
  if (c.name.includes('/wrong:')) ok(r.output[1] === 'False', `对拍用例 ${c.name} 打印 False`);
}

if (fail) {
  console.log(`[verify-game-signal] ✗ ${fail} 项失败（通过 ${pass} 项）`);
  process.exit(1);
}
console.log(`[verify-game-signal] ✓ ${pass} 项通过：${LEVELS.length} 关参考解、${Object.values(accept).flat().length} 种等价写法、${Object.values(reject).flat().length} 种错解、因数分解唯一、对拍用例 ${VERIFY_CASES.length} 条`);
