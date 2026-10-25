import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'assets', // CC0 素材（/cc0/... 运行时可访问）；TinySwordsFreePack 在 .gitignore 单独排除
  server: {
    host: true,
    port: 5173,
  },
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
