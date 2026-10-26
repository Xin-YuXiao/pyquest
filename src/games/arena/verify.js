// 本小游戏送去与真 NumPy 对拍的用例（scripts/verify-npmini.mjs 汇总）：每条 { name, code }，code 用 print 输出
// 每关的示例战场（levels.js 的 sample）上执行参考法术与几句常见写法，打印执行后的 hp 和法力消耗
// （法力消耗 = (旧 hp − 新 hp) 正数部分之和，与 rules.js 的 evaluateSpell 同一口径）
import { LEVELS } from './levels.js';

const pyList = (xs) => `[${xs.map((x) => (typeof x === 'boolean' ? (x ? 'True' : 'False') : String(x))).join(', ')}]`;

/** 各关额外送检的写法（含学生常写错的：漏括号、hp - 1 不写回、浮点原地运算） */
const EXTRA = {
  a1: ['hp -= 2', 'hp = hp - 1', 'hp[:] = 0', 'hp - 1'],
  a2: ['hp -= 3', 'hp[dist <= 3] -= 3', 'hp[dist < 3] = 0', 'hp[dist < 3] -= 1.5'],
  a3: ['hp -= 2', 'hp[hp < 3] = 0', 'hp[(hp <= 2) | (dist < 2)] = 0', 'hp = hp[hp > 2]'],
  a4: ['hp[elite] -= 3', 'hp -= 1', 'hp[elite == False] -= 1', 'hp[~elite] = 0'],
  a5: ['hp[(dist < 3) & (hp <= 2)] = 0', 'hp[dist < 3 & hp <= 2] = 0', 'hp[(dist < 4) & elite] -= 3', 'hp //= 2'],
};

export const VERIFY_CASES = LEVELS.flatMap((lv) => {
  const s = lv.sample;
  const setup = `hp = np.array(${pyList(s.hp)})\ndist = np.array(${pyList(s.dist)})\nelite = np.array(${pyList(s.elite)})\nold = hp.copy()`;
  const spells = [lv.solution, lv.solutionR, ...(EXTRA[lv.id] || [])].filter(Boolean);
  return spells.map((spell) => ({
    name: `arena ${lv.id}: ${spell}`,
    code: `${setup}\n${spell}\nprint(hp)\nprint(np.maximum(old - hp, 0).sum())`,
  }));
});
