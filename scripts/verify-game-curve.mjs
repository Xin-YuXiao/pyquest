// ============================================================
// 曲线对消（第三章 BOSS 护盾）纯逻辑校验：参考解判定为对消成功；常见错解被判为残差过大；
// 不是曲线（数 / 错形状 / 不用 x）被判为 shape；报错判为 error。任一失败 exit 1。
// ============================================================
import { LEVELS } from '../src/games/curve/levels.js';
import { judge, makeScope, DEFAULT_TOL } from '../src/games/curve/rules.js';

let fail = 0;
const check = (cond, label) => { if (!cond) { fail++; console.log(`  ✗ ${label}`); } };
const scope = makeScope();
const WRONG = { c1: 'np.cos(x)', c2: 'np.sin(x)', c3: 'np.sin(2 * x)', c4: '1.5 * np.sin(2 * x)', c5: 'np.sin(x)' };
for (const l of LEVELS) {
  check(l.id && l.title && l.concept && l.story && l.target && l.solution && (l.hints || []).length === 2, `${l.id} 数据不完整`);
  const ok = judge(l, l.solution, scope);
  check(ok.status === 'hit' && ok.residual <= (l.tol ?? DEFAULT_TOL), `${l.id} 参考解 ${l.solution} 应对消成功（${ok.status} ${ok.residual}）`);
  const bad = judge(l, WRONG[l.id], scope);
  check(bad.status === 'miss', `${l.id} 错解 ${WRONG[l.id]} 应残差过大（${bad.status} ${bad.residual}）`);
  check(judge(l, `y = ${l.solution}`, scope).status === 'hit', `${l.id} 写成 y = … 也应接受`);
}
const l1 = LEVELS[0];
check(judge(l1, '5', scope).status === 'shape', '一个数应判为 shape');
check(judge(l1, 'np.sin(x[:50])', scope).status === 'shape', '少一半的点应判为 shape');
check(judge(l1, 'np.sin(np.linspace(0, 2 * np.pi, 100))', scope).status === 'shape', '不用 x 应判为 shape');
check(judge(l1, 'np.sin(', scope).status === 'error', '语法错误应判为 error');
check(judge(l1, 'np.sine(x)', scope).status === 'error', '拼错函数名应判为 error');
check(judge(l1, '', scope).status === 'empty', '空输入应判为 empty');
check(LEVELS.filter((l) => !l.challenge).length === 4 && LEVELS.filter((l) => l.challenge).length === 1, '应为 4 层核心 + 1 个挑战');
if (fail) { console.log(`[verify-game-curve] ${fail} 处失败`); process.exit(1); }
console.log(`[verify-game-curve] ✓ ${LEVELS.length} 层：参考解对消、错解残差过大、非曲线 / 报错 / 空输入判定正确`);
