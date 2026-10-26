// ============================================================
// 试炼场入口（第三章 NumPy 小游戏）：野外 / 巢穴里的「阵列石台」
// 道具 { type: 'game', game: <小游戏 id> } 由 WorldScene.spawnProp 交给 spawnGameSite：
//   石台贴图 + 名牌（徽记 · 名称 · 进度 n/m）+ 未完成时金色光晕；按 E 打开小游戏。
// 面板玩法（kind: 'panel'）在 ui/GamePanel 里开；场景玩法（kind: 'scene'，如向量风暴）切到自己的 Phaser 场景。
// 通关结算 applyLevelWin 只改状态（不依赖场景），场景玩法也调用它：
//   核心关全部通过 → 野外试炼场发 1 枚本章碎片（封印门未开且未集齐时）/ BOSS 玩法破护盾；挑战关首次通过回满爱心。
// ============================================================
import { G, cp, addShards, healHearts, updateHud } from '../core/state.js';
import { getGame } from '../games/registry.js';
import { markLevel, gameComplete, levelDone } from '../core/games.js';
import { saveGame } from '../core/save.js';
import { sfx } from '../audio/sfx.js';
import { wipeTransition } from '../ui/wipe.js';
import { GamePanel } from '../ui/GamePanel.js';

export const GAME_SITE_RADIUS = 280;
const LABEL_FONT = '"ZCOOL KuaiLe","PingFang SC",sans-serif';

/** 一个小游戏的进度：已通过的核心关数 / 核心关总数 */
function coreProgress(id) {
  const meta = getGame(id);
  const core = meta.levels.filter((l) => !l.challenge);
  return { done: core.filter((l) => levelDone(G, id, l.id)).length, total: core.length };
}

export function spawnGameSite(scene, p) {
  const meta = getGame(p.game);
  if (!meta) return;
  if (!scene.gamePanel) {
    scene.gamePanel = new GamePanel(scene);
    scene.events.once('shutdown', () => { scene.gamePanel.destroy(); scene.gamePanel = null; });
  }
  if (!scene.gameSites) {
    scene.gameSites = [];
    scene.events.once('shutdown', () => { scene.gameSites = null; });
  }
  const sprite = scene.add.image(p.x, p.y + 34, 'game_site').setOrigin(0.5, 0.92).setDisplaySize(220, 242).setDepth(p.y);
  scene.add.image(p.x, p.y + 30, 'ts_shadow').setDisplaySize(180, 84).setAlpha(0.5).setDepth(p.y - 1);
  const aura = scene.add.image(p.x, p.y - 110, 'particle').setTint(0xffd257).setAlpha(0.18).setScale(42).setDepth(p.y - 0.5);
  scene.tweens.add({ targets: aura, alpha: 0.32, scale: 50, duration: 1300, yoyo: true, repeat: -1, ease: 'sine.inout' });
  const label = scene.add.text(p.x, p.y - 236, '', {
    fontFamily: LABEL_FONT, fontSize: '50px', color: '#ffd257', stroke: '#2c2438', strokeThickness: 12, align: 'center',
  }).setOrigin(0.5, 1).setDepth(1950);
  const it = {
    kind: 'game', custom: true, radius: GAME_SITE_RADIUS, game: p.game, x: p.x, y: p.y,
    sprite, aura, label, alive: true,
  };
  it.onInteract = () => openGameSite(scene, p.game);
  it.hint = (press) => siteHint(it, press);
  scene.interactables.push(it);
  scene.gameSites.push(it);
  refreshSite(it);
}

function refreshSite(it) {
  const meta = getGame(it.game);
  const { done, total } = coreProgress(it.game);
  const complete = gameComplete(G, it.game);
  it.sprite.setTexture(complete ? 'game_site_lit' : 'game_site');
  it.aura.setTint(complete ? 0x3ddad7 : 0xffd257);
  it.label.setText(`${meta.badge} ${meta.title}${total ? `  ${done}/${total}` : ''}${complete ? ' ✓' : ''}`);
  it.label.setColor(complete ? '#9fd8c8' : '#ffd257');
}

export function refreshGameSites(scene) {
  (scene.gameSites || []).forEach(refreshSite);
}

function siteHint(it, press) {
  const meta = getGame(it.game);
  const { done, total } = coreProgress(it.game);
  if (!total) return `${meta.title}（建设中）`;
  if (gameComplete(G, it.game)) return `${press} 再玩${meta.title}（已完成 ✓，挑战关 ★ 可回满爱心）`;
  return `${press} 进入${meta.title} · ${meta.inspired}（${done}/${total}）`;
}

/** 打开试炼场：面板玩法开 GamePanel；场景玩法切场景（levelId 可空 = 下一关） */
export function openGameSite(scene, gameId, levelId = null) {
  const meta = getGame(gameId);
  if (!meta || !meta.levels.length) {
    scene.floatText(scene.player.x, scene.player.y - 200, '这座试炼场还在建设中……', '#9fb8ff');
    return false;
  }
  if (meta.kind === 'scene') {
    if (scene.transitioning) return false;
    scene.transitioning = true;
    scene.player.setVelocity(0, 0);
    scene.player.invulUntil = Number.MAX_SAFE_INTEGER;
    saveGame();
    sfx.openGate();
    wipeTransition(() => scene.scene.start(meta.sceneKey, { returnKey: scene.scene.key, spawn: `game:${gameId}`, levelId }));
    return true;
  }
  const fx = [];
  return scene.gamePanel.open(gameId, {
    levelId,
    onWin: (lid, result) => {
      const r = applyLevelWin(gameId, lid, result, scene.ch);
      fx.push(r);
      return r;
    },
    onClose: () => {
      refreshGameSites(scene);
      // 面板打开时场景暂停，浮字 / 粒子 / 破盾特效留到关面板时补上
      const site = (scene.gameSites || []).find((s) => s.game === gameId);
      for (const r of fx) {
        if (r.shard && site) {
          scene.floatText(site.x, site.y - 330, `+1 ${scene.ch.shardLabel}`, '#ffd257');
          scene.spawnShardFx(site.x, site.y - 120);
        }
        if (r.healed && site) scene.floatText(site.x, site.y - 260, '❤ 生命回满', '#ff8aa0');
        if (r.breakShield) scene.breakBossShield();
      }
    },
  });
}

/**
 * 通关结算（纯状态，不依赖场景）：记录关卡、发奖励。返回给面板显示的 { lines, shard, healed, breakShield, completed }。
 * ch：发碎片的章节（缺省第三章）。未解锁的关卡返回空结果。
 */
export function applyLevelWin(gameId, levelId, result = {}, ch = null) {
  const meta = getGame(gameId);
  const out = { lines: [], shard: false, healed: false, breakShield: false, completed: false };
  const r = markLevel(G, gameId, levelId, typeof result.score === 'number' ? result.score : null);
  if (!r) return out;
  if (r.best && typeof result.score === 'number' && !r.first) out.lines.push(`刷新个人最佳：${result.score}`);
  if (r.challenge && r.first) {
    healHearts(G.maxHearts);
    out.healed = true;
    out.lines.push('★ 挑战关首次通过：生命回满');
  }
  if (r.completed) {
    out.completed = true;
    if (meta.boss) {
      out.breakShield = true;
      out.lines.push(`${meta.title}完成：魔君的护盾碎了！`);
    } else {
      const chId = ch ? ch.id : 3;
      const P = cp(chId);
      if (!P.gateOpen && !P.done && P.shards < P.shardsNeeded) {
        addShards(1, chId);
        out.shard = true;
        out.lines.push(`+1 ${ch ? ch.shardLabel : '数值碎片'}（${P.shards} / ${P.shardsNeeded}）`);
      }
      out.lines.push(`${meta.title}全部通过！`);
    }
  }
  updateHud();
  saveGame();
  return out;
}
