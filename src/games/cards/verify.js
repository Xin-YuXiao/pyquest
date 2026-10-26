// ============================================================
// 阵列牌局送去与真 NumPy 对拍的用例（scripts/verify-npmini.mjs 汇总）：每条 { name, code }
// 每关用自动打法（autoplay.js，首次尝试的种子）打完一整场，把战斗里在作用域上执行过的每一行
// （玩家的 hp[1:4] -= 3、清零 hp[hp < 0] = 0、敌人的 atk[hp > 0].sum() 与 hp[hp > 0] += 2）
// 连同游戏直接写入的 atk 意图，原样转成一段 Python：每行之后 print(hp)，真 NumPy 与 npmini 逐字比对。
// 另附每关的「参考解」在开局局面上执行一次。
// ============================================================
import { LEVELS } from './levels.js';
import { createBattle, shapeOf } from './battle.js';
import { autoBattle } from './autoplay.js';

const arr = (values, shape) => (shape.length === 1
  ? `np.array([${values.join(', ')}])`
  : `np.array([${values.join(', ')}]).reshape(${shape.join(', ')})`);

function traceToPython(st) {
  const lines = [];
  for (const t of st.trace) {
    if (t.set) lines.push(`${t.set} = ${arr(t.values, st.shape)}`);
    else if (t.expr) lines.push(`print(${t.code})`);
    else { lines.push(t.code); lines.push('print(hp)'); }
  }
  return lines.join('\n');
}

function build() {
  const out = [];
  for (const lv of LEVELS) {
    const st = createBattle(lv, { attempt: 0 });
    autoBattle(st);
    out.push({ name: `阵列牌局 ${lv.id} 自动打法全程`, code: traceToPython(st) });
    const shape = shapeOf(lv);
    const hp = (lv.grid ? lv.grid.flat() : lv.row).map((e) => e.hp);
    out.push({ name: `阵列牌局 ${lv.id} 参考解`, code: `hp = ${arr(hp, shape)}\n${lv.solution}\nprint(hp)` });
  }
  // 自由咒语里常见的写法：二维掩膜、用另一个数组做掩膜、负步长、整行整列
  out.push({
    name: '阵列牌局 选择器写法',
    code: [
      'hp = np.array([[12, 5, 12, 5], [5, 9, 5, 12]])',
      'atk = np.array([[3, 2, 0, 2], [2, 0, 2, 3]])',
      'print(hp[atk > 2])', 'print(hp[hp > 6])', 'print(hp[1, 1])', 'print(hp[:, -1])', 'print(hp[0, ::2])',
      'hp[atk > 2] -= 5', 'print(hp)', 'hp[hp > 6] //= 2', 'print(hp)', 'hp[1] -= 3', 'print(hp)',
      'hp[hp < 0] = 0', 'print(hp)', 'print(atk[hp > 0].sum())', 'hp[hp > 0] += 2', 'print(hp)',
    ].join('\n'),
  });
  return out;
}

export const VERIFY_CASES = build();
