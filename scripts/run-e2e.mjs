// ============================================================
// E2E 总入口（npm run test:e2e）：按章节顺序跑全部章节 E2E，再跑功能 E2E
//
// 开发服务器：
//   - BASE_URL（默认 http://localhost:5173/）上已有 PyQuest 在跑 → 直接复用，跑完不关；
//   - 没有服务 → 用 vite JS API 临时起一个，跑完关掉；
//   - 端口被别的程序占着（返回的不是 PyQuest 页面）→ 报错退出，不误测。
//
// 用法：
//   npm run test:e2e              # 全部章节 + 全部功能脚本
//   npm run test:e2e -- 9 10 11   # 只跑指定章节
//   npm run test:e2e -- music     # 只跑指定功能脚本（scripts/e2e-music.mjs）
//
// 功能脚本自动发现：scripts/e2e-<功能名>.mjs（章节脚本 e2e.mjs / e2e-chN.mjs 除外），
// 新功能加脚本即可被收录，不用改本文件。
// 每个脚本作为独立子进程运行（自带退出码），一个失败不中断后续，
// 最后汇总；任一失败 exit 1。单个脚本超时 10 分钟强制结束（防 CI 卡死）。
// ============================================================
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer } from 'vite';
import { CHAPTERS } from '../src/data/chapters.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const scriptFor = (id) => (id === 1 ? 'scripts/e2e.mjs' : `scripts/e2e-ch${id}.mjs`);
const FEATURES = readdirSync('scripts')
  .map((f) => /^e2e-(?!ch\d+\.mjs$)([\w-]+)\.mjs$/.exec(f))
  .filter(Boolean)
  .map((m) => m[1])
  .sort();

const args = process.argv.slice(2);
const wantedIds = args.filter((a) => /^\d+$/.test(a)).map(Number);
const wantedFeatures = args.filter((a) => !/^\d+$/.test(a));
const unknown = [
  ...wantedIds.filter((id) => !CHAPTERS.some((c) => c.id === id)),
  ...wantedFeatures.filter((f) => !FEATURES.includes(f)),
];
if (unknown.length) {
  console.error(`未知章节 / 功能：${unknown.join(', ')}（章节 ${CHAPTERS.map((c) => c.id).join(' ')}；功能 ${FEATURES.join(' ') || '无'}）`);
  process.exit(1);
}
const all = !args.length;
const jobs = [
  ...CHAPTERS.filter((c) => all || wantedIds.includes(c.id))
    .map((c) => ({ label: `第 ${c.id} 章`, script: scriptFor(c.id) })),
  ...FEATURES.filter((f) => all || wantedFeatures.includes(f))
    .map((f) => ({ label: `功能 ${f}`, script: `scripts/e2e-${f}.mjs` })),
];

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

// ---------- 逐个运行 ----------
function runOne(job) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [job.script], {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: BASE },
    });
    const timer = setTimeout(() => {
      console.error(`[e2e] ${job.label}超时（${JOB_TIMEOUT_MS / 60000} 分钟），强制结束`);
      child.kill();
    }, JOB_TIMEOUT_MS);
    child.on('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });
}

const results = [];
for (const job of jobs) {
  console.log(`\n========== [e2e] ${job.label} · ${job.script} ==========`);
  const t0 = Date.now();
  const code = await runOne(job);
  results.push({ ...job, code, secs: Math.round((Date.now() - t0) / 1000) });
}
await stopServer();

console.log('\n========== [e2e] 汇总 ==========');
for (const r of results) console.log(`  ${r.code === 0 ? '✓' : '✗'} ${r.label}（${r.secs}s）`);
const failed = results.filter((r) => r.code !== 0).map((r) => r.label);
if (failed.length) {
  console.log(`\n${failed.length} 项失败：${failed.join('、')} ✘`);
  process.exit(1);
}
console.log(`\n全部 ${results.length} 项通过 ✔`);
