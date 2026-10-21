// 自动校验：用本机 python3 执行题库中「输出确定」的题目 code，比对 stdout。
// 机制：内置 { 题id: 期望stdout } 校验表——只收无填空占位符（___）、
// 输出确定的题；期望值先在本机 python 跑过确认后写死。
// 比对规则：stdout 去尾随空白后与期望全等；执行超时 10s；任一失败 exit 1。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { QUESTIONS } from '../src/data/quizData.js';

// python3 优先用 anaconda（astropy 7.2 / numpy 1.26 / scipy 1.15 / sklearn 1.9 齐备），
// 找不到则退回 PATH 中的 python3。
const ANACONDA = '/Users/uranus/Applications/anaconda3/bin/python3';
const PYTHON = existsSync(ANACONDA) ? ANACONDA : 'python3';

// { 题id: 期望 stdout }（尾随空白在比对时会被剥掉）
const CASES = {
  // ---- W1-W3 既有确定输出题（抽查）----
  v2: '10',
  v5: '3 2',
  d8: '3\n2\n1',
  f12: '7',
  np1: '4',
  np2: '[2 4 6]',
  nb1: '10',
  mp7: '2.0',
  // ---- W4-W8 本批次（结构改造 + 补空池）涉及的确定输出题 ----
  ap10: '3 (2, 2)',                       // HDUList append/insert 索引推理
  ap11: '4.0',                            // IMSEP*(ZLENS+1) 透镜几何
  ap20: '0.0 -inf',                       // log_prior 均匀先验界内/界外
  ap22: '8 2',                            // train_test_split 80/20
  sp6: '1',                               // N 奇偶陷阱
  sp7: '3',                               // mpi 任务分配 Task 7 → rank 3
  nm6: '[3.0, 1.8, 0.6, -0.6, -1.8, -3.0]', // N-body 成对差广播+矩阵乘
  nm7: '0.6667',                          // dblquad x·y² → 2/3
  nm8: '100.0 10.0',                      // np.gradient 二维双轴
  sg6: '3000 1000 500',                   // FFT 峰值幅度 A·N/2
  sg7: '[ 5.  3. -2.]',                   // solve 手算
  sg8: '80\n[ 0  6 14 24 36]',            // inner=80 vs 逐元素积
  dm6: '2.5257',                          // NFW 质量积分公式
  dm7: '8512',                            // chain shape discard/thin/flat
};

let errors = 0;
const fail = (msg) => { errors++; console.error('  ✗', msg); };
const ok = (msg) => console.log('  ✓', msg);

console.log(`[verify-quiz] python3 = ${PYTHON}`);
const trimEnd = (s) => s.replace(/\s+$/, '');

for (const [id, expected] of Object.entries(CASES)) {
  const q = QUESTIONS[id];
  if (!q) { fail(`${id} 不在题库中`); continue; }
  if (q.fill || q.code.includes('___')) { fail(`${id} 含填空占位符，不应进校验表`); continue; }
  let res;
  try {
    res = spawnSync(PYTHON, ['-c', q.code], { timeout: 10000, encoding: 'utf8' });
  } catch (e) {
    fail(`${id} 启动 python3 异常: ${e.message}`);
    continue;
  }
  if (res.error) { fail(`${id} 执行异常: ${res.error.message}`); continue; }
  const actual = trimEnd(res.stdout || '');
  if (res.status !== 0) {
    const errLine = (res.stderr || '').trim().split('\n').pop();
    fail(`${id} 执行失败（exit ${res.status}）: ${errLine}`);
  } else if (actual !== trimEnd(expected)) {
    fail(`${id} 输出不符\n    期望: ${JSON.stringify(trimEnd(expected))}\n    实际: ${JSON.stringify(actual)}`);
  } else {
    ok(`${id} → ${trimEnd(expected).replace(/\n/g, ' ⏎ ')}`);
  }
}

console.log(errors === 0 ? '\n全部通过 ✔' : `\n${errors} 个错误 ✘`);
process.exit(errors === 0 ? 0 : 1);
