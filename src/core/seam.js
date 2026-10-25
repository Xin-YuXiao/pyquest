// ============================================================
// 测试接缝（test seam）：window.__PYQUEST__ 的语义化实现
//
// 只暴露两类入口，不再直接暴露可写的全局状态 G：
//   只读查询 —— scene(key) / active() / state() / audio() / observatory() / secrets()
//     · state() 返回纯数据快照（Set → 数组、progress 深拷贝），
//       可安全跨 Playwright evaluate 序列化
//     · secrets() 返回秘藏快照（已发现 / 总数 / 本场景石碑位置 / 特效状态）
//   语义动作 —— teleport / godmode / clearMinions / pinBoss /
//     slayBoss / gotoChapter / setShards / setHearts / applyTestState
//     每个动作一个明确语义，脚本侧无法绕过它们直接改写进度。
//
// 正常游戏路径完全不经过本模块（仅 main.js 启动时挂载一次）；
// 场景 / 实体 / 数据层逻辑零改动。
// ============================================================
import { G, updateHud } from './state.js';
import { CHAPTERS, getChapter } from '../data/chapters.js';
import { music } from '../audio/music.js';
import { SECRET_TOTAL } from '../data/secrets.js';

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
      secrets: [...G.secrets],
      progress: JSON.parse(JSON.stringify(G.progress)),
      observatory: JSON.parse(JSON.stringify(G.observatory)),
    };
  }

  /** 背景音乐状态快照：{ track, ducked, musicOn, muted, started, playing, layers }
   *  （只读逻辑状态，不涉及声音本身；无 WebAudio 的环境 started=false） */
  const audio = () => music.state();
  /** 观测台面板快照（只读）：是否打开、哪座观测台、当前参数 / 判定（未打开返回 null） */
  function observatory() {
    const s = active();
    return s && s.observatory ? s.observatory.snapshot() : null;
  }
  /** 秘藏快照：已发现 id、总数、本场景石碑（无则 null）、玩家秘藏特效状态
   *  （floatDue：浮空时长已到——按游戏时钟判断，负载高时游戏时钟会慢于墙钟） */
  function secrets() {
    const s = active();
    const it = s && s.interactables && s.interactables.find((i) => i.kind === 'secret');
    const p = s && s.player;
    return {
      found: [...G.secrets],
      total: SECRET_TOTAL,
      here: it ? { id: it.secretId, x: it.x, y: it.y } : null,
      fx: p ? {
        floating: !!p.floating,
        floatDue: !!p.floating && s.time.now >= (p.floatUntil || 0),
        scripted: !!p.scripted,
      } : null,
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
    s.slimeGroup.children.iterate((sl) => {
      if (sl && !sl.isBoss) { sl.dead = true; sl.destroy(); }
    });
  }

  /** 冻结 BOSS AI；给坐标则同时钉回原位（保证挥剑命中确定性） */
  function pinBoss(sceneKey, x, y) {
    const b = scene(sceneKey).boss;
    if (!b) return;
    b.setVelocity(0, 0);
    b.knockUntil = 1e12;
    if (typeof x === 'number' && typeof y === 'number') {
      b.setPosition(x, y);
      b.body.reset(x, y);
    }
  }

  /** 补刀击杀 BOSS：走 hurt → die → onBossDefeated 真实通关链路 */
  function slayBoss(sceneKey) {
    const b = scene(sceneKey).boss;
    if (!b) return;
    b.hp = 1;
    b.hurt(1, b.x, b.y + 224);
  }

  /** 跳章：把第 1..id-1 章标记为完整通关（含符文槽破解），落到第 id 章野外 */
  function gotoChapter(id) {
    const target = getChapter(id);
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
    G.current = target.id;
    active().scene.start(target.fieldKey, { spawn: 'fromPrev' });
  }

  /** 授予/扣减某章碎片计数（封印门测试用：不足 → 集齐两个状态） */
  function setShards(chapterId, n) {
    G.progress[chapterId].shards = n;
    updateHud();
  }

  /** 设定当前生命值（夹在 1..maxHearts；观测台「回满爱心」奖励测试用） */
  function setHearts(n) {
    G.hearts = Math.max(1, Math.min(G.maxHearts, n));
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
    scene, active, state, audio, observatory, secrets,
    teleport, godmode, clearMinions, pinBoss, slayBoss,
    gotoChapter, setShards, setHearts, applyTestState,
  };
}
