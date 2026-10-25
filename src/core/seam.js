// ============================================================
// 测试接缝（test seam）：window.__PYQUEST__ 的语义化实现
//
// 只暴露两类入口，不再直接暴露可写的全局状态 G：
//   只读查询 —— scene(key) / active() / state() / audio() / observatory() / secrets() / bossMech(key) /
//     mistakes() / quizInfo() / input() / dojo() / tower() / realms()
//     · state() 返回纯数据快照（Set → 数组、progress / 学习记录深拷贝），
//       可安全跨 Playwright evaluate 序列化
//     · secrets() 返回秘藏快照（已发现 / 总数 / 本场景石碑位置 / 特效状态）
//     · bossMech() 返回 BOSS 招牌机制的 JSON 快照（entities/bossMechanics.js）
//     · mistakes() 错题本视图；quizInfo() 答题面板模式与正确项展示下标
//     · tower() 试炼塔快照（是否开放 / 累计战绩 / 进行中的挑战 / 本层符文与阶梯位置 / 结算页）
//     · realms() Project 秘境快照（是否开启 / 各秘境进度 / 所在秘境 / 本场景课题符文状态）
//   语义动作 —— teleport / godmode / clearMinions / pinBoss / hitBoss /
//     breakBossShield / slayBoss / gotoChapter / gotoLair / setShards / setHearts / applyTestState /
//     openDojo / towerJump / unlockRealms / gotoRealm
//     （openDojo 直达代码训练场；dojo() 返回训练场关卡 / 运行阶段 / 结果 / Python 运行时 / 进度）
//     每个动作一个明确语义，脚本侧无法绕过它们直接改写进度。
//
// 正常游戏路径完全不经过本模块（仅 main.js 启动时挂载一次）；
// 场景 / 实体 / 数据层逻辑零改动。
// ============================================================
import { G, updateHud } from './state.js';
import { CHAPTERS, getChapter } from '../data/chapters.js';
import { music } from '../audio/music.js';
import { SECRET_TOTAL } from '../data/secrets.js';
import { QUESTIONS } from '../data/quizBank.js';
import { buildMistakeEntries, pendingCount } from './mistakes.js';
import { isTouchMode, getStick, moveDir } from './input.js';
import { pyRuntime } from './pyRuntime.js';
import { DOJO_KEY } from '../scenes/DojoScene.js';
import { TOWER_KEY, towerUnlocked, floorCleared } from './tower.js';
import { REALMS, REALM_HALL, REALM_UNLOCK_CHAPTER, getRealm, realmsUnlocked } from '../data/realms.js';
import { realmState, badgeCount } from './realms.js';

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
      playMs: G.playMs,
      records: JSON.parse(JSON.stringify(G.records)),
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

  /** 错题本视图快照：{ pending: 待复习数, entries: 条目列表 }（与错题本界面同一份视图函数） */
  function mistakes() {
    const entries = buildMistakeEntries(G.records.stats, QUESTIONS);
    return { pending: pendingCount(entries), entries };
  }

  /** 试炼塔快照（纯 JSON）：塔场景不在前台时 floor / result 为 null */
  function tower() {
    const run = G.towerRun;
    const s = active();
    const ts = s && s.scene.key === TOWER_KEY ? s : null;
    const pos = (o) => (o ? { x: o.x, y: o.y } : null);
    return {
      unlocked: towerUnlocked(G.progress),
      stats: { ...G.tower },
      run: run ? {
        floor: run.floor,
        rest: run.rest,
        correct: run.correct,
        total: run.total,
        reviewed: run.reviewed.slice(),
        mainHearts: run.main.hearts,
        cleared: floorCleared(run),
        shielded: !!(run.floorState && run.floorState.shielded),
        guardianDown: !!(run.floorState && run.floorState.guardianDown),
        rested: !!(run.floorState && run.floorState.rested),
        assign: run.floorState ? JSON.parse(JSON.stringify(run.floorState.assign)) : {},
        solved: run.floorState ? run.floorState.solved.slice() : [],
      } : null,
      floor: ts && ts.interactables ? {
        runes: ts.interactables.filter((it) => it.kind === 'rune').map((it) => ({
          slot: it.qid, x: it.x, y: it.y, alive: it.alive, bossRune: it.bossRune, healRune: it.healRune,
        })),
        stairs: pos(ts.stairs),
        exit: pos(ts.exitDoor),
        campfire: pos(ts.campfire),
        guardian: !!ts.boss,
      } : null,
      result: ts && ts.towerResult ? ts.towerResult.snapshot() : null,
    };
  }

  /** 当前场景答题面板的只读状态：模式、题目、正确项的展示下标（复习模式选项被打乱） */
  function quizInfo() {
    const s = active();
    const q = s && s.quiz;
    if (!q || !q.q) return { isOpen: false };
    return {
      isOpen: q.isOpen,
      mode: q.mode,
      qid: q.q.id,
      phase: q.phase,
      attempts: q.attempts,
      answerAt: q.order.indexOf(q.q.answer),
      optionCount: q.order.length,
    };
  }

  /** 输入快照：是否触控模式、摇杆模拟量、合并键盘后的当前 8 向方向 */
  function input() {
    const s = active();
    return {
      touch: isTouchMode(),
      stick: getStick(),
      dir: moveDir(s && s.keys),
    };
  }

  /** 代码训练场快照：open / levelId / phase（idle|running|replaying|done）/ last / runtime / progress */
  function dojo() {
    const d = game.scene.getScene(DOJO_KEY);
    const open = !!d && d.scene.isActive();
    return {
      open,
      levelId: open ? d.levelId : null,
      phase: open ? d.phase : null,
      last: open ? d.lastRun : null,
      runtime: pyRuntime.info(),
      progress: JSON.parse(JSON.stringify(G.dojo)),
    };
  }

  /** Project 秘境快照：开启状态、徽章数、各秘境进度、所在秘境，以及当前场景课题符文（坐标 + 状态） */
  function realms() {
    const s = active();
    return {
      unlocked: realmsUnlocked(G),
      badges: badgeCount(G),
      list: REALMS.map((r) => ({ id: r.id, ...realmState(G, r.id) })),
      here: G.realm,
      trials: s && s.trials ? s.trials.map((t) => ({ step: t.step, state: t.state, x: t.x, y: t.y, bossRune: t.bossRune })) : [],
    };
  }

  // ---------- 语义动作（测试专用作弊指令） ----------

  /** 直接进入代码训练场的第 levelId 关（E2E 直达，跳过森林里走到门前） */
  function openDojo(levelId = 1) {
    const s = active();
    const data = { levelId, returnKey: s ? s.scene.key : CHAPTERS[1].fieldKey };
    if (s) s.scene.start(DOJO_KEY, data);
    else game.scene.start(DOJO_KEY, data);
  }

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

  /** 开启 Project 秘境：把第一部（第 1..8 章）标记为完整通关（不切场景；村庄的门在下次进场时按新状态生成） */
  function unlockRealms() {
    completeChaptersBefore(getChapter(REALM_UNLOCK_CHAPTER + 1));
    updateHud();
  }

  /** 直达秘境：where = 'field' 外庭 / 'sanctum' 圣所；id 为 'hall' 时去秘境大厅（不改任何进度） */
  function gotoRealm(id, { where = 'field' } = {}) {
    if (id === 'hall') { active().scene.start(REALM_HALL.key, { spawn: 'fromVillage' }); return; }
    const realm = getRealm(id);
    if (!realm) throw new Error(`未知秘境: ${id}`);
    if (where === 'sanctum') active().scene.start(realm.lairKey, { spawn: 'fromField' });
    else active().scene.start(realm.fieldKey, { spawn: 'fromHall' });
  }

  /** 授予/扣减某章碎片计数（封印门测试用：不足 → 集齐两个状态） */
  function setShards(chapterId, n) {
    G.progress[chapterId].shards = n;
    updateHud();
  }

  /** 设定当前生命值（夹在 1..maxHearts；观测台「回满爱心」奖励测试用） */
  /** 试炼塔：直接跳到第 floor 层（需在塔内、挑战进行中；同 gotoChapter 的跳关作弊，不刷新个人最佳） */
  function towerJump(floor) {
    const run = G.towerRun;
    const s = scene(TOWER_KEY);
    if (!run || !s || !s.sys.isActive()) return false;
    run.floor = floor;
    run.rest = false;
    run.floorState = null;
    s.scene.restart();
    return true;
  }

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
    scene, active, state, audio, observatory, secrets, bossMech, mistakes, quizInfo, input, dojo, tower, realms,
    teleport, godmode, clearMinions, pinBoss, hitBoss, breakBossShield, slayBoss,
    gotoChapter, gotoLair, setShards, setHearts, applyTestState, openDojo, towerJump, unlockRealms, gotoRealm,
  };
}
