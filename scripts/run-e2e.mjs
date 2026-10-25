// ============================================================
// E2E 总入口（npm run test:e2e）：按章节顺序跑全部章节 E2E
//
// 开发服务器：
//   - BASE_URL（默认 http://localhost:5173/）上已有 PyQuest 在跑 → 直接复用，跑完不关；
//   - 没有服务 → 用 vite JS API 临时起一个，跑完关掉；
//   - 端口被别的程序占着（返回的不是 PyQuest 页面）→ 报错退出，不误测。
//
// 用法：
//   npm run test:e2e                # 全部章节 + 章节之外的独立 E2E
//   npm run test:e2e -- 9 10 11     # 只跑指定章节
//   npm run test:e2e -- observatory # 只跑观测站小游戏
//
// 每章（每套）作为独立子进程运行（各脚本自带退出码），一套失败不中断后续，
// 最后汇总；任一套失败 exit 1。单套超时 10 分钟强制结束（防 CI 卡死）。
// ============================================================
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { CHAPTERS } from '../src/data/chapters.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const CHAPTER_TIMEOUT_MS = 10 * 60 * 1000;
const scriptFor = (id) => (id === 1 ? 'scripts/e2e.mjs' : `scripts/e2e-ch${id}.mjs`);

// 章节之外的独立 E2E（排在全部章节之后；命令行按名字点选）
const EXTRAS = [
  { name: 'observatory', script: 'scripts/e2e-observatory.mjs', label: '观测站小游戏' },
];
const SUITES = [
  ...CHAPTERS.map((c) => ({ name: String(c.id), script: scriptFor(c.id), label: `第 ${c.id} 章` })),
  ...EXTRAS,
];

const wanted = process.argv.slice(2);
const runs = SUITES.filter((s) => !wanted.length || wanted.includes(s.name));
const unknown = wanted.filter((w) => !SUITES.some((s) => s.name === w));
if (unknown.length) {
  console.error(`未知章节 / 测试套：${unknown.join(', ')}（可选 ${SUITES.map((s) => s.name).join(' ')}）`);
  process.exit(1);
}

// ---------- 开发服务器：复用或临时启动 ----------
async function probe() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    return (await res.text()).includes('<title>PyQuest') ? 'pyquest' : 'other';
  } catch {
    return 'none';
  }
}

let server = null;
const found = await probe();
if (found === 'other') {
  console.error(`${BASE} 上有服务在跑但不是 PyQuest，请关掉它或用 BASE_URL 指向别的端口`);
  process.exit(1);
}
if (found === 'pyquest') {
  console.log(`[e2e] 复用已在运行的开发服务器 ${BASE}`);
} else {
  const port = Number(new URL(BASE).port) || 5173;
  server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
  await server.listen();
  // 预热：先请求一次页面与入口模块，触发依赖预构建，
  // 避免冷启动耗时全算在第一章 page.goto 的 30s 超时里（机器负载高时会超时）
  await fetch(BASE).then((r) => r.text());
  await fetch(new URL('src/main.js', BASE)).then((r) => r.text());
  console.log(`[e2e] 已临时启动开发服务器 ${BASE}（跑完自动关闭）`);
}

const stopServer = async () => { if (server) { await server.close(); server = null; } };
process.on('SIGINT', async () => { await stopServer(); process.exit(130); });

// ---------- 逐套运行 ----------
function runOne(suite) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [suite.script], {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: BASE },
    });
    const timer = setTimeout(() => {
      console.error(`[e2e] ${suite.label}超时（${CHAPTER_TIMEOUT_MS / 60000} 分钟），强制结束`);
      child.kill();
    }, CHAPTER_TIMEOUT_MS);
    child.on('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });
}

const results = [];
for (const suite of runs) {
  console.log(`\n========== [e2e] ${suite.label} · ${suite.script} ==========`);
  const t0 = Date.now();
  const code = await runOne(suite);
  results.push({ label: suite.label, code, secs: Math.round((Date.now() - t0) / 1000) });
}
await stopServer();

console.log('\n========== [e2e] 汇总 ==========');
for (const r of results) console.log(`  ${r.code === 0 ? '✓' : '✗'} ${r.label}（${r.secs}s）`);
const failedRuns = results.filter((r) => r.code !== 0).map((r) => r.label);
if (failedRuns.length) {
  console.log(`\n${failedRuns.length} 套失败：${failedRuns.join('、')} ✘`);
  process.exit(1);
}
console.log(`\n全部 ${results.length} 套通过 ✔`);
