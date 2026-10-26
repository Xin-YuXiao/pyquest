// ============================================================
// 向量风暴（第三章试炼场 · 场景玩法）——建设中的占位场景
// 入口：scenes/games.js 的 openGameSite 以 { returnKey, spawn, levelId } 启动本场景
// ============================================================
import Phaser from 'phaser';

export const ARENA_KEY = 'VectorArena';

export class ArenaScene extends Phaser.Scene {
  constructor() { super(ARENA_KEY); }
  init(data) { this.returnData = data || {}; }
  create() {
    const { returnKey, spawn } = this.returnData;
    this.add.text(960, 640, '向量风暴还在建设中……', { fontSize: '64px', color: '#ffd257' }).setOrigin(0.5);
    this.time.delayedCall(1200, () => this.scene.start(returnKey || 'SciField', { spawn }));
  }
}
