# 02: Phaser 拆为独立 vendor chunk，恢复默认体积警告

Status: ready-for-agent
Type: task
Blocked by: 01

## 要做什么

回访的学生在游戏只改了题库或界面时，不必重新下载 Phaser 引擎：构建产出独立的 Phaser vendor chunk 和业务 chunk，两者各自带内容 hash，只改业务代码时 vendor chunk 的文件名不变。

同时删除构建配置里被调大到 1500 KB 的体积警告阈值，恢复 Vite 默认值。如果拆分后业务 chunk 仍超过默认阈值，在 Comments 说明原因，并给出最小的、有依据的阈值，不要直接回到 1500。

## 验收标准

- [ ] 构建产物中有独立的 Phaser chunk 和业务 chunk
- [ ] 只改一道题的文案后重新构建，Phaser chunk 文件名不变、业务 chunk 文件名改变（验证后撤回改动，记在 Comments）
- [ ] 构建配置不再把 chunk 警告阈值调到 1500；构建过程无体积警告（或按上面的要求说明并取最小阈值）
- [ ] 按新的拆分更新 01 的预算配置
- [ ] 11 章 E2E 通过（拆包不影响运行）
- [ ] npm run check 全绿

## Comments
