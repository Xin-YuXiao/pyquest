import { defineConfig } from 'vite';
import { createReadStream, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------- Pyodide 自托管（代码训练场） ----------
// 运行时文件来自 npm 包 pyodide（版本锁死在 package.json），不提交进 git：
// 开发 / E2E 时由中间件直接从 node_modules 提供 /pyodide/*，构建时复制到 dist/pyodide/。
// 不走 CDN：E2E 运行器会把外网请求全部回空 200，国内访问 CDN 也不稳定。
const PYODIDE_DIR = resolve('node_modules/pyodide');
const PYODIDE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const MIME = { mjs: 'text/javascript', wasm: 'application/wasm', zip: 'application/zip', json: 'application/json' };

function pyodideAssets() {
  let outDir = 'dist';
  return {
    name: 'pyquest-pyodide',
    configResolved(cfg) { outDir = resolve(cfg.root, cfg.build.outDir); },
    configureServer(server) {
      server.middlewares.use('/pyodide/', (req, res, next) => {
        const name = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        if (!PYODIDE_FILES.includes(name)) { next(); return; }
        res.setHeader('Content-Type', MIME[name.split('.').pop()]);
        createReadStream(join(PYODIDE_DIR, name)).pipe(res);
      });
    },
    closeBundle() {
      if (!existsSync(PYODIDE_DIR)) return;
      mkdirSync(join(outDir, 'pyodide'), { recursive: true });
      for (const f of PYODIDE_FILES) copyFileSync(join(PYODIDE_DIR, f), join(outDir, 'pyodide', f));
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: 'assets', // CC0 素材（/cc0/... 运行时可访问）；TinySwordsFreePack 在 .gitignore 单独排除
  plugins: [pyodideAssets()],
  server: {
    host: true,
    port: 5173,
  },
  // Pyodide Worker 以 ES 模块运行（Worker 里用 import() 加载自托管的 pyodide.mjs）
  worker: { format: 'es' },
  build: {
    // Phaser 单独成 chunk（约 1.2 MB，压缩后难以再小），阈值只为它放宽；
    // 游戏自身代码在主 chunk 里，超过 1500 kB 说明游戏代码膨胀了，需要关注
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 引擎与游戏代码分开缓存：改题库 / 玩法只让主 chunk 失效，Phaser 不用重新下载
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
});
