// ============================================================
// 外星信号 · 送去与真 NumPy 对拍的用例（scripts/verify-npmini.mjs 汇总）：每条 { name, code }，code 用 print 输出
// 每关：参考解 → 打印 shape、与目标是否逐像素一致、完整结果；再加几条常见错解（换了行列 / 忘了翻转），
// 确认它们在真 NumPy 上同样排不出目标图。verify-game-signal.mjs 另外断言参考解那一行输出 True。
// ============================================================
import { LEVELS } from './levels.js';

const pyArr = (data) => `np.array(${JSON.stringify(data)})`;

function setup(level) {
  const lines = Object.entries(level.vars).map(([name, v]) => `${name} = ${pyArr(v.data)}`);
  lines.push(`target = ${pyArr(level.target)}`);
  return lines.join('\n');
}

/** 常见错解：行列对调（与形状相同的布尔比较会因形状不同而报错，所以只比 shape 与像素） */
function wrongs(level) {
  const [R, C] = [level.target.length, level.target[0].length];
  const first = Object.keys(level.vars)[0];
  const out = [];
  if (R !== C) out.push(`${first}.reshape(${C}, ${R})`);
  // 「直接按目标形状排、忘了翻转 / 镜像」——只对需要额外一步的关卡算错解
  const plain = `signal.reshape(${R}, ${C})`;
  if (first === 'signal' && level.vars.signal.dtype === 'int' && level.solution !== plain) out.push(plain);
  return out;
}

export const VERIFY_CASES = LEVELS.flatMap((level) => {
  const base = setup(level);
  const cases = [{
    name: `signal/${level.id}/solution`,
    code: `${base}\nres = ${level.solution}\nprint(res.shape)\nprint((res == target).all())\nprint(res)`,
  }];
  for (const w of wrongs(level)) {
    cases.push({
      name: `signal/${level.id}/wrong:${w}`,
      code: `${base}\nres = ${w}\nprint(res.shape)\nprint(res.shape == target.shape and bool((res == target).all()))\nprint(res)`,
    });
  }
  cases.push({ name: `signal/${level.id}/len`, code: `${base}\nprint(len(${Object.keys(level.vars)[0]}))\nprint(${Object.keys(level.vars)[0]}[:12])` });
  return cases;
});
