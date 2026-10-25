// ============================================================
// BootScene：加载 Tiny Swords 素材（本地 assets/TinySwordsFreePack）
// + 程序化贴图（爱心/碎片等游戏专属元素）
// ============================================================
import Phaser from 'phaser';
import { generateAllTextures, createAnimations } from '../textures/pixelArt.js';
import { loadTSAssets, createTSAnimations } from '../assets/ts.js';
import { initTitle } from '../ui/modal.js';
import { resetState, furthestChapter } from '../core/state.js';
import { getChapter } from '../data/chapters.js';
import { clearSave, loadGame, armAutosave } from '../core/save.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    loadTSAssets(this);   // Tiny Swords（角色/地形/装饰）
  }

  create() {
    generateAllTextures(this);
    createAnimations(this);
    createTSAnimations(this);

    initTitle({
      onNew: () => {
        clearSave();
        resetState();
        armAutosave();
        this.scene.start('Village', { spawn: 'start' });
      },
      onContinue: () => {
        if (!loadGame()) { clearSave(); resetState(); }
        armAutosave(); // 读档完成后才允许写档（标题画面不写，防空进度覆盖存档）
        // 按存档进度决定落点：最新可推进章节的野外
        const ch = getChapter(furthestChapter());
        const spawn = ch.id === 1 ? 'start' : 'fromPrev';
        this.scene.start(ch.fieldKey, { spawn });
      },
    });
  }
}
