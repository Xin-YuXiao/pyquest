// ============================================================
// 测试接缝（test seam）：window.__PYQUEST__ 的语义化实现
//
// 只暴露两类入口，不再直接暴露可写的全局状态 G：
//   只读查询 —— scene(key) / active() / state() / bossMech(key)
//     · state() 返回纯数据快照（Set → 数组、progress 深拷贝），
//       可安全跨 Playwright evaluate 序列化
//     · bossMech() 返回 BOSS 招牌机制的 JSON 快照（entities/bossMechanics.js）
//   语义动作 —— teleport / godmode / clearMinions / pinBoss / hitBoss /
//     breakBossShield / slayBoss / gotoChapter / gotoLair / setShards / applyTestState
//     每个动作一个明确语义，脚本侧无法绕过它们直接改写进度。
//
// 正常游戏路径完全不经过本模块（仅 main.js 启动时挂载一次）；
// 场景 / 实体 / 数据层逻辑零改动。
// ============================================================
import { G, updateHud } from './state.js';
import { CHAPTERS, getChapter } from '../data/chapters.js';

export function buildSeam(game, sceneKeys) {
  // ---------- 只读查询 ----------
  const scene = (key) => game.scene.getScene(key);
  const active = () => sceneKeys
    .map((k) => game.scene.getScene(k))
    .find((s) => s && (s.scene.isActive() || s.scene.isPaused()));

  /** 全局状态快照（纯 JSON 数据，evaluate 返回值可序列化） */
  function state() {
    return {
      hearts: G.hearts,
      maxHearts: G.maxHearts,
      current: G.current,
      answered: [...G.answered],
      qAnswered: [...G.qAnswered],
      runeRolls: { ...G.runeRolls },
      progress: JSON.parse(JSON.stringify(G.progress)),
    };
  }

  // ---------- 语义动作（测试专用作弊指令） ----------

  /** 把玩家传送到当前场景指定坐标（清速度/复位物理体，防漂移） */
  function teleport(x, y) {
    const s = active();
    s.player.setPosition(x, y);
    s.player.body.reset(x, y);
  }

  /** 玩家免伤免击退（测试期间不受干扰） */
  function godmode() {
    active().player.invulUntil = 1e12;
  }

  /** 清空指定场景的小怪（保留 BOSS），保证答题环节确定性 */
  function clearMinions(sceneKey) {
    const s = scene(sceneKey);
    // 先拷贝再销毁：destroy 会把成员移出组，边遍历边删会跳过相邻的小怪
    s.slimeGroup.getChildren().slice().forEach((sl) => {
      if (sl && !sl.isBoss) { sl.dead = true; sl.destroy(); }
    });
  }

  /** BOSS 招牌机制快照（无 BOSS / 无机制返回 null；BOSS 死后仍可查，bossDead 标明） */
  function bossMech(sceneKey) {
    const b = scene(sceneKey) && scene(sceneKey).boss;
    if (!b || !b.mech) return null;
    return { ...b.mech.snapshot(), bossDead: !!b.dead };
  }

  /**
   * 冻结 BOSS AI；给坐标则同时钉回原位（保证挥剑命中确定性）。
   * 招牌机制默认一并冻结（弹幕/符印清空、分身原地静止）；
   * keepMechanic: true 时只钉住 BOSS 本体、机制照常运转（机制专项测试用）
   */
  function pinBoss(sceneKey, x, y, { keepMechanic = false } = {}) {
    const b = scene(sceneKey).boss;
    if (!b) return;
    b.setVelocity(0, 0);
    b.knockUntil = 1e12;
    if (typeof x === 'number' && typeof y === 'number') {
      b.setPosition(x, y);
      b.body.reset(x, y);
    }
    if (b.mech) {
      if (keepMechanic) b.mech.unfreeze();
      else b.mech.freeze();
    }
  }

  /** 对 BOSS 造成 times 次真实受击（绕过受击冷却，走 hurt 全链路；护盾期照样被护盾抵消） */
  function hitBoss(sceneKey, times = 1) {
    const b = scene(sceneKey).boss;
    if (!b) return;
    for (let i = 0; i < times && !b.dead; i++) {
      b.hurtCdUntil = 0;
      b.hurt(1, b.x, b.y + 224);
    }
  }

  /** 破除 BOSS 护盾（等价于答对 BOSS 符文后的结算，不经答题面板） */
  function breakBossShield(sceneKey) {
    scene(sceneKey).breakBossShield();
  }

  /** 补刀击杀 BOSS：走 hurt → die → onBossDefeated 真实通关链路 */
  function slayBoss(sceneKey) {
    const b = scene(sceneKey).boss;
    if (!b) return;
    b.hp = 1;
    b.hurtCdUntil = 0; // 清受击冷却：紧跟在上一击之后补刀时（机器负载高、游戏时钟走得慢）不会被吞掉
    b.hurt(1, b.x, b.y + 224);
  }

  /** 把第 1..target-1 章标记为完整通关（含符文槽破解） */
  function completeChaptersBefore(target) {
    for (const ch of CHAPTERS) {
      if (ch.id >= target.id) break;
      const p = G.progress[ch.id];
      p.shards = p.shardsNeeded;
      p.gateOpen = true;
      p.bossShielded = false;
      p.bossDefeated = true;
      p.done = true;
      // 该章全部符文槽标记为已破解（符文石变灰，不再可交互）
      for (const prop of [...ch.buildField(ch).props, ...ch.buildLair(ch).props]) {
        if (prop.type === 'rune') G.answered.add(prop.qid);
      }
    }
  }

  /** 跳章：把第 1..id-1 章标记为完整通关（含符文槽破解），落到第 id 章野外 */
  function gotoChapter(id) {
    const target = getChapter(id);
    completeChaptersBefore(target);
    G.current = target.id;
    active().scene.start(target.fieldKey, { spawn: 'fromPrev' });
  }

  /**
   * 直达第 id 章巢穴：前序章节同 gotoChapter 标记通关，本章碎片集齐、封印门已开；
   * shielded: false 时 BOSS 护盾视为已破（招牌机制进巢穴即开战）
   */
  function gotoLair(id, { shielded = true } = {}) {
    const target = getChapter(id);
    completeChaptersBefore(target);
    const p = G.progress[target.id];
    p.shards = p.shardsNeeded;
    p.gateOpen = true;
    p.bossShielded = shielded;
    G.current = target.id;
    active().scene.start(target.lairKey, { spawn: 'fromField' });
  }

  /** 授予/扣减某章碎片计数（封印门测试用：不足 → 集齐两个状态） */
  function setShards(chapterId, n) {
    G.progress[chapterId].shards = n;
    updateHud();
  }

  /** 兼容旧脚本的低层进度注入（新脚本一律用上面的语义动作） */
  function applyTestState({ current, answered, progress } = {}) {
    if (typeof current === 'number') G.current = current;
    if (Array.isArray(answered)) {
      for (const id of answered) G.answered.add(id);
    }
    if (progress) {
      for (const [id, patch] of Object.entries(progress)) {
        Object.assign(G.progress[id], patch);
      }
    }
    updateHud();
  }

  return {
    scene, active, state, bossMech,
    teleport, godmode, clearMinions, pinBoss, hitBoss, breakBossShield, slayBoss,
    gotoChapter, gotoLair, setShards, applyTestState,
  };
}
