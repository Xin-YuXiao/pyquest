// ============================================================
// 试炼塔场景（key 'TOWER'）：同一个场景类反复重启来呈现每一层 / 休息平台
// - 楼层内容来自 core/tower.js（楼层规划 + 选题）与 data/maps.js 的 buildTowerFloor（布局）
// - 普通层：解开全部塔符文 → 北侧阶梯开启；守层者层：答对 BOSS 符文破盾、击败守层者；
//   守层者层之后是休息平台（篝火回 1 心）；西南角出塔之门随时可离开（结算本次挑战）
// - 塔用「虚拟章节」（ch.virtual）：不登记章节进度、不改当前所在章、不写 G.answered；
//   塔内答错可扣到 0 心（QuizOverlay 的 lethal），爱心归零 / 被小怪击倒 = 本次挑战结束 → 结算页
// - 世界地图在塔内不可用（离开请走出塔之门），避免绕过结算把塔内爱心带回主线
// ============================================================
import { G, updateHud, healHearts } from '../core/state.js';
import { CHAPTERS, getChapter } from '../data/chapters.js';
import { QUESTIONS } from '../data/quizBank.js';
import { buildTowerFloor } from '../data/maps.js';
import {
  TOWER_KEY, floorPlan, floorSeed, pickGuardianChapter, assignFloor, floorCleared,
  noteTowerAnswer, climb, restHeal, endRun, startRun,
} from '../core/tower.js';
import { saveGame } from '../core/save.js';
import { pressLabel } from '../core/input.js';
import { WorldScene } from './WorldScene.js';
import { showBossBanner, hideBossBanner } from '../ui/BossBanner.js';
import { TowerResult } from '../ui/TowerResult.js';
import { wipeTransition } from '../ui/wipe.js';
import { sfx } from '../audio/sfx.js';
import { cueFor } from '../audio/tracks.js';

// 塔内交互半径（px）：生成器保证符文离阶梯 / 出塔门 / 篝火 ≥ 3 格（384px），互不抢 E
const STAIRS_RADIUS = 260;
const EXIT_RADIUS = 240;
const FIRE_RADIUS = 260;
const QUIZ_DEFEAT_DELAY = 1100; // 答错把爱心扣到 0 后，留时间看清反馈再结算（ms，墙钟：场景此时暂停）

export class TowerScene extends WorldScene {
  constructor() { super(TOWER_KEY); }

  init() {
    this.spawnKey = 'fromBelow';
  }

  create() {
    // 正常入口（世界地图）先 startRun；直接启动场景（调试 / 测试）时兜底开一局
    if (!G.towerRun) startRun();
    const run = G.towerRun;
    this.run = run;
    this.plan = floorPlan(run.floor);
    this.finished = false;
    this.stairs = null;
    this.exitDoor = null;
    this.campfire = null;

    // 守层者：从已通关章节里按种子借一位 BOSS（原型与招牌机制原样沿用）
    const guardian = this.plan.guardian && !run.rest;
    const gid = guardian ? pickGuardianChapter(run.cleared, floorSeed(run.seed, run.floor)) : null;
    this.guardianCh = gid ? CHAPTERS.find((c) => c.id === gid) : null;
    this.ch = {
      id: 'tower',
      virtual: true,
      title: '试炼塔',
      shardLabel: '塔符文',
      fieldKey: TOWER_KEY,
      bossName: this.guardianCh ? `守层者 · ${this.guardianCh.bossName}之影` : '守层者',
      bossMechanic: this.guardianCh ? this.guardianCh.bossMechanic : null,
      theme: { palette: this.plan.palette === 'grass' ? 'grass' : 'dungeon' },
    };

    // 上一层的整图地面画布用完即释放（每层一张，长时间爬塔不累积显存）
    if (this._groundKey && this.textures.exists(this._groundKey)) this.textures.remove(this._groundKey);
    const def = buildTowerFloor({
      plan: this.plan,
      seed: floorSeed(run.seed, run.floor) + (run.rest ? 7 : 0),
      rest: run.rest,
      bossType: this.guardianCh ? this.guardianCh.boss : 'slime',
    });
    this._groundKey = `ground_${def.key}`;
    this.mapDef = def;

    // 本层符文选题（同层重建沿用已有分配）：塔符文 → 祝福符文 → BOSS 符文
    const runes = def.props.filter((p) => p.type === 'rune');
    assignFloor(run, {
      tower: runes.filter((p) => !p.healRune && !p.bossRune).map((p) => p.qid),
      heal: runes.filter((p) => p.healRune).map((p) => p.qid),
      boss: (runes.find((p) => p.bossRune) || {}).qid || null,
    });

    super.create();

    this.towerResult = new TowerResult(this);
    this.events.once('shutdown', () => {
      hideBossBanner();
      this.towerResult && this.towerResult.destroy();
    });

    // 已答对的符文（同层重建时）变灰
    const fs = run.floorState;
    this.interactables.forEach((it) => {
      if (it.kind === 'rune' && fs.solved.includes(it.qid)) { it.alive = false; it.sprite.setTint(0x8a8496); }
    });

    // 难度：每 3 层一档，tier ≥ 3 起小怪再加血加速
    this.slimeGroup.children.iterate((s) => {
      if (!s || s.isBoss) return;
      s.hp += this.plan.bonusHp;
      s.chaseSpeed *= this.plan.speedMul;
      s.wanderSpeed *= this.plan.speedMul;
    });

    // 守层者：护盾期机制布置 + 提示（与章节巢穴一致）
    const mech = this.boss && this.boss.mech;
    if (mech) {
      mech.onLairReady(fs.shielded);
      if (!fs.shielded) { mech.activate('reenter'); this.announceMechanic(); }
      else if (mech.preShield) this.announceMechanic();
    }
    if (fs.guardianDown && this.boss) { this.boss.destroy(); this.boss = null; }

    this.refreshStairs();
    const sp = def.spawns.fromBelow;
    this.floatText(sp.x, sp.y - 260, run.rest ? `第 ${run.floor} 层 · 休息平台` : `试炼塔 · 第 ${run.floor} 层`, '#ffd257');
    updateHud();
  }

  /** 背景音乐：守层者层 = BOSS 战；休息平台 = 安静版；普通层按地貌用野外主题 */
  musicCue() {
    if (this.guardianCh) return cueFor('lair', this.guardianCh);
    if (this.run.rest) return 'lair-calm';
    return cueFor('field', this.ch);
  }

  // ---------- 道具：阶梯 / 出塔之门 / 篝火（其余交给基类） ----------
  spawnProp(p) {
    switch (p.type) {
      case 'tower_stairs': {
        const s = this.add.image(p.x, p.y + 48, 'portal_door').setOrigin(0.5, 1).setDisplaySize(300, 300).setDepth(p.y + 4);
        const aura = this.add.image(p.x, p.y - 72, 'particle').setTint(0xffd257).setAlpha(0).setScale(40).setDepth(p.y - 2);
        this.stairs = { x: p.x, y: p.y, sprite: s, aura, open: false };
        break;
      }
      case 'tower_exit': {
        const d = this.add.image(p.x, p.y + 48, 'portal_door').setOrigin(0.5, 1).setDisplaySize(220, 220).setDepth(p.y + 4);
        d.setTint(0xb7a6d6);
        this.exitDoor = { x: p.x, y: p.y, sprite: d };
        break;
      }
      case 'tower_campfire': {
        const t = this.add.image(p.x, p.y + 80, 'torch_0').setOrigin(0.5, 0.9).setDisplaySize(112, 224).setDepth(p.y - 6);
        const fire = this.add.sprite(p.x, p.y - 60, 'fire').setDisplaySize(176, 176).setDepth(p.y - 5);
        fire.play('ts_fire');
        const glow = this.add.image(p.x, p.y - 60, 'particle').setScale(48).setAlpha(0.2).setTint(0xffb84d).setDepth(p.y - 7);
        this.tweens.add({ targets: glow, alpha: 0.32, scale: 56, duration: 620, yoyo: true, repeat: -1 });
        this.torches.push({ x: p.x, y: p.y });
        this.campfire = { x: p.x, y: p.y, sprite: t };
        break;
      }
      default: super.spawnProp(p);
    }
  }

  /** 阶梯外观随本层是否通过切换：未开启 = 灰暗；开启 = 金色光晕呼吸 */
  refreshStairs() {
    if (!this.stairs) return;
    const open = floorCleared(this.run);
    if (open === this.stairs.open && this.stairs.inited) return;
    this.stairs.inited = true;
    this.stairs.open = open;
    if (open) {
      this.stairs.sprite.clearTint();
      this.stairs.aura.setAlpha(0.18);
      this.tweens.add({ targets: this.stairs.aura, alpha: 0.32, scale: 48, duration: 900, yoyo: true, repeat: -1, ease: 'sine.inout' });
    } else {
      this.stairs.sprite.setTint(0x6f6880);
    }
  }

  // ---------- 交互 ----------
  _busy() {
    return this.quiz.isOpen || this.dialogue.isOpen || this.player.dying || this.transitioning
      || this.finished || (this.towerResult && this.towerResult.isOpen);
  }

  /** 玩家附近的塔专属交互物：'stairs' | 'exit' | 'campfire' | null */
  _near() {
    const d = (o) => (o ? Math.hypot(this.player.x - o.x, this.player.y - o.y) : Infinity);
    if (d(this.stairs) < STAIRS_RADIUS) return 'stairs';
    if (d(this.exitDoor) < EXIT_RADIUS) return 'exit';
    if (d(this.campfire) < FIRE_RADIUS) return 'campfire';
    return null;
  }

  tryInteract() {
    if (this._busy()) return;
    const near = this._near();
    if (near === 'stairs') { this.useStairs(); return; }
    if (near === 'exit') { this.finishRun('leave'); return; }
    if (near === 'campfire') { this.useCampfire(); return; }
    super.tryInteract();
  }

  /** 塔符文：题目来自本层分配（错题优先），答错可扣到 0 心 */
  openRuneQuiz(it) {
    const run = this.run;
    const fs = run.floorState;
    const entry = fs.assign[it.qid];
    if (!entry || !QUESTIONS[entry.qid]) {
      this.floatText(it.x, it.y - 300, '符文石沉默着……', '#9fb8ff');
      return;
    }
    const q = { id: entry.qid, ...QUESTIONS[entry.qid] };
    this.quiz.open(q, {
      slot: it.qid,
      kind: 'tower',
      lethal: true,
      onWrong: () => {
        noteTowerAnswer(run, entry, false);
        if (G.hearts <= 0) this.defeatInQuiz();
      },
      onCorrect: () => {
        noteTowerAnswer(run, entry, true);
        if (!fs.solved.includes(it.qid)) fs.solved.push(it.qid);
        it.alive = false;
        it.sprite.setTint(0x8a8496);
        sfx.pickup();
        if (it.bossRune) {
          this.breakBossShield();
        } else if (it.healRune) {
          healHearts(1);
          sfx.heal();
          this.floatText(it.x, it.y - 300, '+1 ❤ 符文祝福', '#ff8aa0');
          this.spawnShardFx(it.x, it.y - 88, 0xff8aa0);
        } else {
          const done = fs.towerSlots.filter((s) => fs.solved.includes(s)).length;
          this.floatText(it.x, it.y - 300, `塔符文 ${done} / ${fs.towerSlots.length}`, '#ffd257');
          this.spawnShardFx(it.x, it.y - 88);
          if (floorCleared(run)) this.floatText(this.stairs.x, this.stairs.y + 160, '阶梯亮起来了！', '#ffd257');
        }
        this.refreshStairs();
        updateHud();
      },
    });
  }

  /** 答错把爱心扣到 0：锁住面板、留一会儿看反馈，然后结算 */
  defeatInQuiz() {
    this.quiz.phase = 'over'; // 不再接受选项
    this.quiz.confirmBtn.disabled = true;
    window.setTimeout(() => {
      this.quiz.close(false);
      this.finishRun('defeat');
    }, QUIZ_DEFEAT_DELAY);
  }

  useStairs() {
    if (!floorCleared(this.run)) {
      const fs = this.run.floorState;
      const msg = fs.guardian
        ? '击败守层者后阶梯才会开启'
        : `阶梯还没开启：解开本层塔符文（${fs.towerSlots.filter((s) => fs.solved.includes(s)).length} / ${fs.towerSlots.length}）`;
      this.floatText(this.player.x, this.player.y - 200, msg, '#9fb8ff');
      sfx.hitEnemy();
      return;
    }
    this.transitioning = true;
    this.player.setVelocity(0, 0);
    this.player.invulUntil = Number.MAX_SAFE_INTEGER;
    sfx.openGate();
    climb(this.run);
    saveGame(); // 个人最佳随上楼即时写档
    wipeTransition(() => this.scene.start(TOWER_KEY));
  }

  useCampfire() {
    if (restHeal(this.run)) {
      sfx.heal();
      this.floatText(this.campfire.x, this.campfire.y - 260, '+1 ❤ 篝火旁歇了歇脚', '#ff8aa0');
    } else {
      this.floatText(this.campfire.x, this.campfire.y - 260, '已经歇过了，继续上楼吧', '#9fb8ff');
    }
  }

  /** 结束本次挑战：还原主线爱心、写档、弹结算页（再闯一次 / 离开试炼塔） */
  finishRun(reason) {
    if (this.finished) return;
    this.finished = true;
    const summary = endRun(reason);
    saveGame();
    if (this.player && !this.player.dying) {
      this.player.setVelocity(0, 0);
      this.player.invulUntil = Number.MAX_SAFE_INTEGER;
    }
    hideBossBanner();
    this.hud.hint(null); // 场景暂停后提示条不再刷新，先清掉残留的交互提示
    this.scene.pause();
    this.towerResult.show(summary, {
      onAgain: () => {
        startRun();
        wipeTransition(() => this.scene.start(TOWER_KEY));
      },
      onLeave: () => {
        const ch = getChapter(G.current);
        wipeTransition(() => this.scene.start(ch.fieldKey, { spawn: ch.id === 1 ? 'start' : 'fromPrev' }));
      },
    });
  }

  /** 被小怪击倒（Player.die 的接管钩子）：直接结算，不回主线重生 */
  onPlayerDefeated() {
    this.finishRun('defeat');
  }

  // ---------- 守层者 ----------
  bossShielded() {
    return !!(this.run && this.run.floorState && this.run.floorState.shielded);
  }

  announceMechanic() {
    const m = this.ch.bossMechanic;
    if (m) showBossBanner({ bossName: this.ch.bossName, name: m.name, tip: m.tip });
  }

  breakBossShield() {
    this.run.floorState.shielded = false;
    updateHud();
    if (!this.boss || !this.boss.active) return;
    sfx.shieldBreak();
    this.boss.clearTint();
    this.cameras.main.flash(300);
    this.cameras.main.shake(300, 0.006);
    this.floatText(this.boss.x, this.boss.y - 32, '守层者的护盾碎了！', '#ff9db3');
    if (this.boss.mech) {
      this.boss.mech.activate('shieldBroken');
      this.announceMechanic();
    }
  }

  onBossDefeated() {
    this.run.floorState.guardianDown = true;
    this.boss = null;
    hideBossBanner();
    this.refreshStairs();
    updateHud();
    if (this.stairs) this.floatText(this.stairs.x, this.stairs.y + 160, '守层者倒下了！阶梯开启', '#ffd257');
  }

  // ---------- 世界地图与提示 ----------
  /** 塔内不开世界地图（WorldMap.open 的守卫与 act('map') 共用） */
  blockWorldMap() {
    this.flashHint('试炼塔里打不开世界地图——从西南角的出塔之门离开（会结算本次挑战）', 1800);
    return true;
  }

  act(name) {
    if (name === 'map') { this.blockWorldMap(); return; }
    super.act(name);
  }

  updateInteractHint() {
    if (this.flashUntil && this.time.now < this.flashUntil) return;
    // 上楼 / 出塔的转场期间旧场景还在跑，但本层状态已交给下一站（climb 清空了 floorState）
    if (this.transitioning || this.finished || !this.run.floorState) return;
    const near = this._near();
    const press = pressLabel();
    let hint = null;
    if (near === 'stairs') {
      const fs = this.run.floorState;
      if (floorCleared(this.run)) hint = `${press} 登上阶梯`;
      else if (fs.guardian) hint = '击败守层者后阶梯开启';
      else hint = `阶梯未开启：先解开本层塔符文（${fs.towerSlots.filter((s) => fs.solved.includes(s)).length} / ${fs.towerSlots.length}）`;
    } else if (near === 'exit') {
      hint = `${press} 离开试炼塔（结算本次挑战）`;
    } else if (near === 'campfire') {
      hint = this.run.floorState.rested ? '篝火已经歇过了' : `${press} 在篝火旁休息（回 1 心）`;
    }
    if (hint) {
      this.interactReady = true;
      this.hud.hint(hint);
      return;
    }
    super.updateInteractHint();
  }
}
