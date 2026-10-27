// ============================================================
// BootScene：加载 Tiny Swords 素材（本地 assets/TinySwordsFreePack）
// + 程序化贴图（爱心/碎片等游戏专属元素）
// ============================================================
import Phaser from 'phaser';
import { generateAllTextures, createAnimations } from '../textures/pixelArt.js';
import { loadTSAssets, createTSAnimations } from '../assets/ts.js';
import { initTitle } from '../ui/modal.js';
import { G, cp, updateHud, resetState, furthestChapter, completeChaptersBefore } from '../core/state.js';
import { getGame } from '../games/registry.js';
import { markLevel } from '../core/games.js';
import { getChapter } from '../data/chapters.js';
import { clearSave, loadGame, armAutosave } from '../core/save.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  /** 课堂演示：新存档，第一、二章记为已通关；allCleared 时第三章的五个小游戏全部通关 */
  startDemo(allCleared) {
    clearSave();
    resetState();
    armAutosave();
    const ch = getChapter(3);
    completeChaptersBefore(ch);
    G.current = ch.id;
    if (allCleared) {
      for (const id of [...ch.games, ch.bossGame]) {
        for (const lv of getGame(id).levels) markLevel(G, id, lv.id);
      }
      const P = cp(ch.id);
      P.shards = P.shardsNeeded;
      P.gateOpen = true;
      P.bossShielded = false;
    }
    updateHud();
    this.scene.start(ch.fieldKey, { spawn: 'fromPrev' });
  }

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
      // 第三章演示（标题画面 ?demo）：新存档，第一、二章记为已通关，从高原入口开始
      onDemo: () => this.startDemo(false),
      // 全部关卡已通关：五个小游戏每一关（含挑战关）都记为通过 → 碎片集齐、封印已开、魔君护盾已破（魔君仍在，可演示 BOSS 战）
      onDemoAll: () => this.startDemo(true),
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
