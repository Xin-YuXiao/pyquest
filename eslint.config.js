// ============================================================
// ESLint（flat config）：只开 recommended 规则抓真实问题，不管代码风格
// （不做格式化，避免与 upstream 产生大面积 diff 冲突）
// - src/：浏览器环境（Phaser 游戏本体）
// - scripts/ 与配置文件：Node 环境；E2E 脚本里 page.evaluate 回调跑在浏览器，
//   所以同时放开 browser globals
// ============================================================
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'assets/', '.agents/', 'scripts/shots/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      // 下划线前缀 = 有意不用的参数（Phaser 回调签名常见）
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
