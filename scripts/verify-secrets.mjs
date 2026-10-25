// 秘藏彩蛋自动校验：石碑上展示的 Python 输出必须是真的。
// 机制：把每块石碑的 REPL 记录（data/secrets.js 的 repl）交给本机 python，
// 在一个模拟 REPL 的驱动里逐条执行——表达式回显 repr、语句执行、异常只取
// 「类型: 信息」一行（SyntaxError 取 msg）——逐条比对 out；
// run: false 的条目不执行（死循环 / 会打开浏览器），其相关事实由 checks 另行实跑（stdout 全等）。
// pick: true 的条目只要求 out 的每一行都出现在实际输出里（如 import this 摘录 5 条）。
// 任一失败 exit 1。python 探测与 verify-quiz 一致（anaconda → python3 → python），强制 UTF-8 输出。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { SECRETS } from '../src/data/secrets.js';

const CANDIDATES = ['/Users/uranus/Applications/anaconda3/bin/python3', 'python3', 'python'];
let PYTHON = null;
for (const cand of CANDIDATES) {
  if (cand.includes('/') && !existsSync(cand)) continue;
  const probe = spawnSync(cand, ['-c', 'pass'], { timeout: 15000 });
  if (probe.status === 0) { PYTHON = cand; break; }
}
if (!PYTHON) {
  console.error('找不到可用的 python 解释器（依次尝试过 ' + CANDIDATES.join(' / ') + '）');
  process.exit(1);
}
const PY_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8' };
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

// 模拟交互式解释器：每条输入在同一个 __main__ 命名空间里执行
const DRIVER = `
import sys, json, io, contextlib
entries = json.load(sys.stdin)
ns = {'__name__': '__main__', '__builtins__': __builtins__}
res = []
for src in entries:
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            try:
                code = compile(src, '<stdin>', 'eval')
            except SyntaxError:
                code = None
            if code is not None:
                v = eval(code, ns)
                if v is not None:
                    print(repr(v))
            else:
                exec(compile(src, '<stdin>', 'exec'), ns)
    except SyntaxError as e:
        buf.write('SyntaxError: %s\\n' % e.msg)
    except Exception as e:
        buf.write('%s: %s\\n' % (type(e).__name__, e))
    res.append(buf.getvalue())
print(json.dumps(res))
`;

let errors = 0;
const fail = (msg) => { errors++; console.error('  ✗', msg); };
const ok = (msg) => console.log('  ✓', msg);

console.log(`[verify-secrets] python = ${PYTHON}`);
for (const s of SECRETS) {
  const runnable = s.repl.filter((r) => r.run !== false);
  if (runnable.length) {
    const res = spawnSync(PYTHON, ['-c', DRIVER], {
      input: JSON.stringify(runnable.map((r) => r.in)), timeout: 15000, encoding: 'utf8', env: PY_ENV,
    });
    if (res.status !== 0) {
      fail(`${s.id} 驱动执行失败（exit ${res.status}）: ${(res.stderr || '').trim().split('\n').pop()}`);
      continue;
    }
    const outs = JSON.parse(res.stdout);
    runnable.forEach((r, i) => {
      const actual = norm(outs[i]);
      const expected = norm(r.out);
      const lines = actual.split('\n');
      const pass = r.pick ? expected.split('\n').every((l) => lines.includes(l)) : actual === expected;
      if (pass) ok(`${s.id} >>> ${r.in.split('\n')[0]}${expected ? ` → ${expected.split('\n')[0]}${expected.includes('\n') ? ' …' : ''}` : ''}`);
      else fail(`${s.id} >>> ${r.in}\n    期望: ${JSON.stringify(expected)}\n    实际: ${JSON.stringify(actual)}`);
    });
  }
  for (const c of s.checks || []) {
    const res = spawnSync(PYTHON, ['-c', c.code], { timeout: 15000, encoding: 'utf8', env: PY_ENV });
    const actual = norm(res.stdout || '');
    if (res.status === 0 && actual === c.expect) ok(`${s.id} 核实：${c.code.split('\n').pop()} → ${c.expect}`);
    else fail(`${s.id} 核实失败：${c.code}\n    期望: ${JSON.stringify(c.expect)}\n    实际: ${JSON.stringify(actual)} ${(res.stderr || '').trim().split('\n').pop() || ''}`);
  }
  const skipped = s.repl.filter((r) => r.run === false);
  if (skipped.length && !(s.checks || []).length && runnable.length === 0) {
    fail(`${s.id} 全部条目都不实跑，又没有 checks 核实相关事实`);
  }
}

console.log(errors ? `\n${errors} 个错误 ✘` : '\n全部通过 ✔');
process.exit(errors ? 1 : 0);
