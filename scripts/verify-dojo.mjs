// ============================================================
// 代码训练场校验：用本机 CPython 实跑每关的参考解与起始代码
//
// 与游戏内完全同一套逻辑：Python 侧执行 core/dojoPrelude.js 的英雄 API 前导代码，
// 每次 API 调用经 stdin/stdout 问答交给 Node 这边的 JS 关卡模拟器（core/dojoSim.js）结算——
// 和浏览器里 Pyodide Worker 的做法一样，只是桥不同。
// 断言：参考解在全部布局上通关且不报错；起始代码至少在一个布局上不通关（否则这关没东西可学）。
// 任一失败 exit 1。python 解释器探测同 verify-quiz（anaconda → python3 → python）。
// ============================================================
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { DOJO_LEVELS } from '../src/data/dojoLevels.js';
import { createSim, apply, finish } from '../src/core/dojoSim.js';
import { HERO_PRELUDE } from '../src/core/dojoPrelude.js';

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

// CPython 侧的桥：_dojo_js.call 把调用写成一行 RPC，再阻塞读一行结果
// （玩家的 print 在 _run_hero 里被重定向到 StringIO，桥用 sys.__stdout__ 不受影响）
const BRIDGE = String.raw`
import sys, json, types
_m = types.ModuleType('_dojo_js')
def _call(op, arg, line):
    sys.__stdout__.write('RPC ' + json.dumps([op, arg, line]) + '\n')
    sys.__stdout__.flush()
    return json.loads(sys.stdin.readline())
_m.call = _call
sys.modules['_dojo_js'] = _m
`;

const RUNNER = String.raw`
import sys, json
_job = json.loads(sys.stdin.readline())
_res = _run_hero(_job['code'], json.dumps(_job['api']), json.dumps(_job['vars']))
sys.__stdout__.write('RES ' + _res + '\n')
sys.__stdout__.flush()
`;

/** 在第 variant 个布局上用 CPython 跑一段玩家代码，返回 { sim, result } */
function runOnce(level, variant, code) {
  return new Promise((resolve, reject) => {
    const sim = createSim(level, variant);
    const py = spawn(PYTHON, ['-c', BRIDGE + HERO_PRELUDE + RUNNER], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    const timer = setTimeout(() => { py.kill(); reject(new Error('python 超时 15s')); }, 15000);
    let result = null;
    let stderr = '';
    py.stderr.on('data', (d) => { stderr += d; });
    const rl = createInterface({ input: py.stdout });
    rl.on('line', (line) => {
      if (line.startsWith('RPC ')) {
        const [op, arg, ln] = JSON.parse(line.slice(4));
        py.stdin.write(JSON.stringify(apply(sim, op, arg, ln)) + '\n');
      } else if (line.startsWith('RES ')) {
        result = JSON.parse(line.slice(4));
      }
    });
    py.on('close', () => {
      clearTimeout(timer);
      if (!result) { reject(new Error(`python 没有返回结果：${stderr.trim().split('\n').pop()}`)); return; }
      resolve({ sim: finish(sim), result });
    });
    const vars = level.variants[variant].vars || {};
    py.stdin.write(JSON.stringify({ code, api: level.api, vars }) + '\n');
  });
}

let errors = 0;
const fail = (msg) => { errors++; console.error('  ✗', msg); };
const ok = (msg) => console.log('  ✓', msg);
console.log(`[verify-dojo] python = ${PYTHON}`);

for (const level of DOJO_LEVELS) {
  const n = level.variants.length;
  try {
    let wins = 0;
    for (let v = 0; v < n; v++) {
      const { sim, result } = await runOnce(level, v, level.solution);
      if (result.error) fail(`第 ${level.id} 关参考解在布局 ${v + 1} 报错：${result.error.type} ${result.error.msg}`);
      else if (sim.status !== 'win') fail(`第 ${level.id} 关参考解在布局 ${v + 1} 没有通关：${sim.reason}`);
      else wins++;
    }
    if (wins === n) ok(`第 ${level.id} 关「${level.title}」参考解在全部 ${n} 个布局上通关`);

    const starterWins = [];
    for (let v = 0; v < n; v++) {
      const { sim, result } = await runOnce(level, v, level.starter);
      if (result.error) fail(`第 ${level.id} 关起始代码报错（起始代码应能运行，只是不通关）：${result.error.type} ${result.error.msg}`);
      starterWins.push(sim.status === 'win');
    }
    if (starterWins.every(Boolean)) fail(`第 ${level.id} 关起始代码直接就通关了`);
    else ok(`第 ${level.id} 关起始代码能运行但不通关`);
  } catch (e) {
    fail(`第 ${level.id} 关校验异常：${e.message}`);
  }
}

console.log(errors ? `\n${errors} 个错误 ✘` : '\n全部通过 ✔');
process.exit(errors ? 1 : 0);
