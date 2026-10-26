// ============================================================
// 向量风暴（第三章试炼场 · 场景玩法，key 'VectorArena'）
// 借鉴《吸血鬼幸存者》的割草 + Noita 式自编法术：
//   开战前在「备咒台」写两句 NumPy 法术（绑定 Q / R），战斗中按键释放——
//   场上存活的敌人现场组成三个数组 hp / dist / elite，法术执行后按 hp 的变化结算伤害（规则见 rules.js）。
//   挥剑仍然能用（一次一个），向量化法术一次一片：结算页对比两种击杀数。
// 入口：scenes/games.js 的 openGameSite 以 { returnKey, spawn, levelId } 启动；levelId 为空 = 下一关。
// 场景用「虚拟章节」（ch.virtual）：不改当前所在章；竞技场生命独立于世界爱心（死了本关重来）。
// 通关结算走 scenes/games.js 的 applyLevelWin（核心关全过 → 1 枚数值碎片；挑战关首次通过 → 回满爱心）。
// ============================================================
import Phaser from 'phaser';
import { G, updateHud } from '../../core/state.js';
import { getChapter } from '../../data/chapters.js';
import { WorldScene } from '../../scenes/WorldScene.js';
import { applyLevelWin } from '../../scenes/games.js';
import { nextLevel, levelUnlocked, gameData, setGameData } from '../../core/games.js';
import { saveGame } from '../../core/save.js';
import { Slime } from '../../entities/Slime.js';
import { sfx } from '../../audio/sfx.js';
import { cueFor } from '../../audio/tracks.js';
import { wipeTransition } from '../../ui/wipe.js';
import { LEVELS } from './levels.js';
import {
  evaluateSpell, buildScope, regenMana, medalFor, rng, rollHp, rollMix, waveSchedule, challengeInterval,
  sampleEnemies, tilesBetween, SPELL_COOLDOWN, TILE,
} from './rules.js';
import { buildArenaMap, drawArenaGround, spawnPoint, CENTER } from './arenaMap.js';
import { ArenaUI } from './ArenaUI.js';

export const ARENA_KEY = 'VectorArena';
const GAME_ID = 'arena';
const WAVE_BREAK_MS = 2200;
const ESTIMATE_EVERY_MS = 200;
const HP_LABEL_FONT = '"JetBrains Mono", Consolas, monospace';

export class ArenaScene extends WorldScene {
  constructor() { super(ARENA_KEY); }

  init(data) {
    this.returnData = { returnKey: 'SciField', spawn: 'game:arena', ...(data || {}) };
    const want = this.returnData.levelId;
    this.levelId = want && levelUnlocked(G, GAME_ID, want) ? want : nextLevel(G, GAME_ID);
    this.spawnKey = 'arena';
  }

  create() {
    this.levelIndex = Math.max(0, LEVELS.findIndex((l) => l.id === this.levelId));
    this.level = LEVELS[this.levelIndex];
    this.levelId = this.level.id;
    this.home = getChapter(3);
    this.ch = {
      id: 'arena', virtual: true, title: '向量风暴', shardLabel: this.home.shardLabel,
      fieldKey: ARENA_KEY, bossName: '', theme: { palette: 'dungeon' },
    };
    this.mapDef = buildArenaMap();
    // 地面：先登记自己画的石砖 + 法阵纹理，WorldScene 的地面生成器见到同名纹理就直接用
    const gk = `ground_${this.mapDef.key}`;
    if (!this.textures.exists(gk)) {
      const canvas = document.createElement('canvas');
      canvas.width = this.mapDef.w * TILE;
      canvas.height = this.mapDef.h * TILE;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      drawArenaGround(ctx, this.mapDef);
      this.textures.addCanvas(gk, canvas);
    }
    super.create();
    this.hud.root.style.display = 'none'; // 竞技场有自己的 HUD（生命独立于世界爱心）

    const lv = this.level;
    const saved = (gameData(G, GAME_ID).spells || {})[lv.id] || ['', ''];
    this.arena = {
      phase: 'prep', waveIdx: -1, hp: lv.playerHp, maxHp: lv.playerHp, mana: lv.mana.start,
      cd: [0, 0], spells: [saved[0] || '', saved[1] || ''], casts: 0, spellKills: 0, swordKills: 0,
      hitsTaken: 0, timeMs: 0, pending: 0, estimates: [null, null], result: null, prepCount: 0,
    };
    this.enemies = [];
    this.rand = rng(1000 + this.levelIndex * 7919 + Math.floor(Math.random() * 100000));
    this._estAt = 0;
    this._nextSpawnAt = 0;
    this.ended = false;

    // 竞技场生命独立：接管玩家受伤 / 心形掉落
    this.player.takeDamage = (amount, sx, sy) => this.hurtPlayer(amount, sx, sy);

    // 距离环（dist = 2 / 3 / 4 格）：跟着玩家走，让 dist < 3 这种掩膜「看得见」
    this.rings = this.add.graphics().setDepth(2);
    this.ringLabels = [2, 3, 4].map((d) => this.add.text(0, 0, `dist ${d}`, {
      fontFamily: HP_LABEL_FONT, fontSize: '30px', color: '#9fe7ff',
    }).setOrigin(0, 0.5).setAlpha(0.5).setDepth(3));

    this.ui = new ArenaUI({
      cast: (i) => this.castSlot(i),
      openPrep: () => this.openPrep(true),
      startFight: (spells) => this.startFight(spells),
      resume: (spells) => this.resumeFight(spells),
      leave: () => this.leaveArena(),
      next: () => this.gotoLevel(nextLevel(G, GAME_ID)),
      retry: () => this.gotoLevel(this.levelId),
    });
    this.ui.setLevel(lv, this.levelIndex);
    this.events.once('shutdown', () => {
      this.ui.destroy();
      this.input.keyboard.enableGlobalCapture();
    });

    this.input.keyboard.on('keydown-Q', () => this.castSlot(0));
    this.input.keyboard.on('keydown-R', () => this.castSlot(1));
    this.input.keyboard.on('keydown-B', () => this.openPrep(true));

    this.ui.update(this.arenaState());
    this.time.delayedCall(250, () => this.openPrep(false));
  }

  musicCue() { return cueFor('lair', getChapter(3)); }

  // ---------- 备咒 ----------

  /** live = 战斗中途打开（用当前战场预览）；否则用关卡的示例战场 */
  openPrep(live) {
    if (this.ended || this.ui.prepOpen || this.transitioning) return;
    if (live && this.arena.phase === 'prep') return;
    // 中途打开用当前战场预览；场上没人（波次间隙）时退回示例战场
    const field = live ? this.fieldView() : [];
    const enemies = field.length ? field : sampleEnemies(this.level);
    this.arena.prepCount++;
    this.scene.pause();
    this.input.keyboard.disableGlobalCapture();
    this.ui.openPrep({ level: this.level, spells: this.arena.spells, enemies, live, current: field.length > 0 });
  }

  saveSpells(spells) {
    this.arena.spells = [spells[0] || '', spells[1] || ''];
    const data = gameData(G, GAME_ID);
    setGameData(G, GAME_ID, { ...data, spells: { ...(data.spells || {}), [this.level.id]: this.arena.spells } });
    saveGame();
  }

  startFight(spells) {
    this.saveSpells(spells);
    this.input.keyboard.enableGlobalCapture();
    this.scene.resume();
    this.arena.phase = 'fight';
    this.player.invulUntil = this.time.now + 600;
    sfx.openGate();
    if (this.level.survive) {
      this.ui.banner(`坚持 ${this.level.survive} 秒！`);
      this._nextSpawnAt = 0;
    } else {
      this.startWave(0);
    }
    this.ui.toast('按 Q / R 释放法术 · J / 空格挥剑 · B 改写法术', 'ok', 2600);
  }

  resumeFight(spells) {
    this.saveSpells(spells);
    this.input.keyboard.enableGlobalCapture();
    this.scene.resume();
    this.player.invulUntil = this.time.now + 500; // 刚回到战斗，给半秒喘息
    this.ui.toast('法术已更新', 'ok', 1200);
  }

  // ---------- 刷怪 ----------

  startWave(i) {
    const lv = this.level;
    this.arena.waveIdx = i;
    this.arena.phase = 'fight';
    const plan = waveSchedule(lv.waves[i], this.rand);
    this.arena.pending = plan.length;
    this.ui.banner(lv.waves.length > 1 ? `第 ${i + 1} 波 · ${plan.length} 只` : `${plan.length} 只史莱姆来袭！`);
    plan.forEach((e) => {
      this.time.delayedCall(e.t * 1000 + 200, () => {
        if (this.ended) return;
        this.spawnEnemy(e.hp, e.elite, lv.waves[i].from);
        this.arena.pending--;
      });
    });
  }

  spawnEnemy(hp, elite, from = 'gates') {
    const p = spawnPoint(from, this.rand, this.player);
    const s = new Slime(this, p.x, p.y, elite ? 'crimson' : 'red');
    s.hp = hp;
    s.maxHpSeen = hp;
    s.elite = !!elite;
    s.chaseRange = 1e9;
    s.chaseSpeed = this.level.speed * (elite ? 1.15 : 1) * (0.9 + this.rand() * 0.2);
    s.wanderSpeed = s.chaseSpeed * 0.6;
    this.slimeGroup.add(s);
    // 头顶血量数字（精英金色）
    s.hpLabel = this.add.text(s.x, s.y - 150, String(hp), {
      fontFamily: HP_LABEL_FONT, fontSize: elite ? '46px' : '40px', fontStyle: 'bold',
      color: elite ? '#ffd257' : '#ffffff', stroke: '#2c2438', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(1900);
    // 被挥剑打死 / 被法术打死都走 die：统计击杀来源、收掉头顶数字
    const die = s.die.bind(s);
    s.die = () => {
      if (s.dead) return;
      if (s._bySpell) this.arena.spellKills++; else this.arena.swordKills++;
      s.hpLabel.destroy();
      die();
    };
    const hurt = s.hurt.bind(s);
    s.hurt = (dmg, fx, fy) => { hurt(dmg, fx, fy); if (!s.dead) this.refreshLabel(s); };
    // 刷出特效：紫色烟 + 由小变大
    s.setScale(0.4);
    this.tweens.add({ targets: s, scale: 2, duration: 260, ease: 'back.out' });
    for (let k = 0; k < 6; k++) {
      const q = this.add.image(p.x, p.y - 40, 'particle').setTint(0xb38cff).setScale(8).setAlpha(0.7).setDepth(1800);
      const a = (k / 6) * Math.PI * 2;
      this.tweens.add({ targets: q, x: p.x + Math.cos(a) * 120, y: p.y - 40 + Math.sin(a) * 80, alpha: 0, duration: 420, onComplete: () => q.destroy() });
    }
    this.enemies.push(s);
    return s;
  }

  refreshLabel(s) {
    if (!s.hpLabel || !s.hpLabel.active) return;
    s.hpLabel.setText(String(Math.max(0, s.hp)));
  }

  alive() {
    this.enemies = this.enemies.filter((s) => s.active && !s.dead);
    return this.enemies;
  }

  /** 此刻的战场（法术作用域的原料）：顺序 = 刷出顺序 */
  fieldView() {
    const p = this.player;
    return this.alive().map((s) => ({ hp: s.hp, dist: tilesBetween(s.x, s.y, p.x, p.y), elite: s.elite }));
  }

  // ---------- 施法 ----------

  castSlot(i) {
    const a = this.arena;
    if (this.ended || this.ui.prepOpen || (a.phase !== 'fight' && a.phase !== 'break')) return;
    const src = a.spells[i];
    if (!src) { this.ui.toast(`${i ? 'R' : 'Q'} 槽还空着——按 B 打开备咒台写一句法术`, 'bad'); return; }
    if (a.cd[i] > 0) { this.ui.toast('法术冷却中……', '', 700); return; }
    const foes = this.alive();
    if (!foes.length) { this.ui.toast('场上没有敌人', '', 900); return; }
    const view = this.fieldView();
    const r = evaluateSpell(src, view);
    if (!r.ok) {
      sfx.wrong();
      this.ui.toast(r.reason === 'error' ? `✗ ${r.message}` : `✗ ${r.message}`, 'bad', 2600);
      return;
    }
    if (!r.hits) { this.ui.toast('这句法术此刻打不中任何人', '', 1200); return; }
    if (r.cost > a.mana) {
      sfx.hitEnemy();
      this.ui.toast(`这句咒语要 ${r.cost} 点法力（现在只有 ${Math.floor(a.mana)}）${r.cost > this.level.mana.max ? '——超过上限，永远放不出来，换个掩膜！' : ''}`, 'bad', 2400);
      return;
    }
    a.mana -= r.cost;
    a.cd[i] = SPELL_COOLDOWN;
    a.casts++;
    this.ui.pulseSlot(i);
    this.applySpell(foes, r);
    this.ui.toast(`⚡ ${src}  →  命中 ${r.hits} · 击杀 ${r.kills} · −${r.cost} 法力`, 'ok', 1500);
  }

  /** 把法术结果落到场上：闪电、伤害数字、死亡；回血的敌人冒绿光 */
  applySpell(foes, r) {
    let killed = 0;
    foes.forEach((s, j) => {
      const old = s.hp;
      const nw = r.newHp[j];
      if (nw === old) return;
      if (nw < old) {
        this.strike(s, old - nw, j * 12);
        s.hp = nw;
        if (nw <= 0) {
          s._bySpell = true;
          killed++;
          this.time.delayedCall(90 + j * 12, () => { if (!s.dead) s.die(); });
        } else {
          s.setTintFill(0xbfeaff);
          this.time.delayedCall(90, () => s.dead || s.clearTint());
          this.refreshLabel(s);
        }
      } else {
        s.hp = nw;
        this.refreshLabel(s);
        this.floatNum(s.x, s.y - 200, `+${nw - old}`, '#7cf29a');
      }
    });
    const big = r.hits >= 8;
    this.cameras.main.shake(big ? 260 : 140, big ? 0.008 : 0.004);
    if (killed >= 10) {
      this.cameras.main.flash(160, 190, 230, 255);
      this.ui.banner(`⚡ 一句咒语 × ${killed} 连杀！`, 1300);
    }
    if (big) sfx.shieldBreak(); else sfx.hitEnemy();
  }

  /** 一道从天而降的闪电 + 伤害数字 */
  strike(s, dmg, delay = 0) {
    const x = s.x, y = s.y;
    this.time.delayedCall(delay, () => {
      const g = this.add.graphics().setDepth(1950);
      const pts = [];
      let cx = x + Phaser.Math.Between(-40, 40);
      for (let yy = y - 620; yy < y - 60; yy += 70) {
        pts.push([cx, yy]);
        cx += Phaser.Math.Between(-36, 36);
      }
      pts.push([x, y - 50]);
      g.lineStyle(22, 0x63d4ff, 0.45);
      g.strokePoints(pts.map(([a, b]) => new Phaser.Math.Vector2(a, b)));
      g.lineStyle(8, 0xffffff, 1);
      g.strokePoints(pts.map(([a, b]) => new Phaser.Math.Vector2(a, b)));
      this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
      const flash = this.add.image(x, y - 60, 'particle').setTint(0xbfeaff).setScale(26).setAlpha(0.7).setDepth(1949);
      this.tweens.add({ targets: flash, alpha: 0, scale: 40, duration: 240, onComplete: () => flash.destroy() });
      this.floatNum(x, y - 220, `-${dmg}`, '#bfeaff');
    });
  }

  floatNum(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontFamily: HP_LABEL_FONT, fontSize: '54px', fontStyle: 'bold', color, stroke: '#1c1430', strokeThickness: 12,
    }).setOrigin(0.5).setDepth(2000);
    this.tweens.add({ targets: t, y: y - 130, alpha: 0, duration: 800, ease: 'cubic.out', onComplete: () => t.destroy() });
  }

  // ---------- 玩家受伤 / 掉落 ----------

  hurtPlayer(amount, sx, sy) {
    const p = this.player;
    const now = this.time.now;
    if (p.dying || now < p.invulUntil || this.ended) return;
    // 精英撞上来扣 2：按撞击来源的坐标找到是谁
    const src = this.enemies.find((s) => s.active && s.x === sx && s.y === sy);
    const dmg = src && src.elite ? 2 : amount;
    this.arena.hp -= dmg;
    this.arena.hitsTaken++;
    sfx.hurt();
    this.cameras.main.shake(120, 0.005);
    const angle = Phaser.Math.Angle.Between(sx, sy, p.x, p.y);
    p.knockUntil = now + 140;
    p.setVelocity(Math.cos(angle) * 1520, Math.sin(angle) * 1520);
    this.time.delayedCall(140, () => { if (!p.dying) p.setVelocity(0, 0); });
    p.invulUntil = now + 900;
    p.setTint(0xff8a8a);
    this.tweens.add({ targets: p, alpha: 0.25, duration: 90, yoyo: true, repeat: 4, onComplete: () => { p.clearTint(); p.setAlpha(1); } });
    this.floatNum(p.x, p.y - 220, `-${dmg}`, '#ff9db3');
    if (this.arena.hp <= 0) this.lose();
  }

  /** 史莱姆掉落的心：回竞技场生命（大规模清场时掉落率再打折，免得满地都是心） */
  spawnHeartDrop(x, y) {
    if (Math.random() > 0.35) return;
    const h = this.physics.add.staticImage(x, y, 'heart_full').setDisplaySize(96, 84).setDepth(1500);
    this.tweens.add({ targets: h, y: h.y - 28, duration: 520, yoyo: true, repeat: -1 });
    this.physics.add.overlap(this.player, h, () => {
      if (this.arena.hp >= this.arena.maxHp) return;
      this.arena.hp += 1;
      sfx.heal();
      this.floatNum(h.x, h.y - 100, '+1', '#ff9db3');
      h.destroy();
    });
    this.time.delayedCall(9000, () => h.active && h.destroy());
  }

  // ---------- 每帧 ----------

  update(time, delta) {
    super.update(time, delta);
    const a = this.arena;
    if (!a) return;
    const p = this.player;
    // 头顶数字跟随
    for (const s of this.enemies) if (s.active && !s.dead && s.hpLabel) s.hpLabel.setPosition(s.x, s.y - 150);
    // 距离环
    this.rings.clear();
    [2, 3, 4].forEach((d, k) => {
      this.rings.lineStyle(k === 1 ? 5 : 3, 0x63d4ff, k === 1 ? 0.28 : 0.16);
      this.rings.strokeCircle(p.x, p.y, d * TILE);
      // 刻度错开角度摆在右上方，三个标签不挤在一行
      const ang = (-18 - k * 16) * (Math.PI / 180);
      this.ringLabels[k].setPosition(p.x + Math.cos(ang) * d * TILE + 8, p.y + Math.sin(ang) * d * TILE);
    });
    if (a.phase !== 'fight' && a.phase !== 'break') { this.ui.update(this.arenaState()); return; }
    const dt = delta / 1000;
    a.timeMs += delta;
    a.mana = regenMana(a.mana, dt, this.level);
    a.cd = a.cd.map((c) => Math.max(0, c - dt));
    if (time >= this._estAt) {
      this._estAt = time + ESTIMATE_EVERY_MS;
      const view = this.fieldView();
      a.estimates = a.spells.map((src) => (src && view.length ? evaluateSpell(src, view) : null));
      this.ui.showLive(view.length ? buildScope(view) : null, view.length);
    }
    this.tickProgress(time);
    this.ui.update(this.arenaState());
  }

  tickProgress(time) {
    const a = this.arena;
    const lv = this.level;
    if (lv.survive) {
      if (time >= this._nextSpawnAt) {
        const t = a.timeMs / 1000;
        const n = 1 + (this.rand() < Math.min(0.7, t / 90) ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const m = rollMix(lv.mix, this.rand);
          this.spawnEnemy(rollHp(m.hp, this.rand), !!m.elite, 'gates');
        }
        this._nextSpawnAt = time + challengeInterval(lv, t) * 1000;
      }
      if (a.timeMs >= lv.survive * 1000) this.win();
      return;
    }
    if (a.phase === 'fight' && a.pending <= 0 && !this.alive().length) {
      if (a.waveIdx + 1 < lv.waves.length) {
        a.phase = 'break';
        const next = a.waveIdx + 1;
        this.ui.banner(`第 ${a.waveIdx + 1} 波清空！`);
        this.ui.toast('喘口气——想改法术就按 B', 'ok', 2000);
        this.time.delayedCall(WAVE_BREAK_MS, () => { if (!this.ended) this.startWave(next); });
      } else {
        this.win();
      }
    }
  }

  // ---------- 胜负 ----------

  win() {
    if (this.ended) return;
    this.ended = true;
    const a = this.arena;
    a.phase = 'won';
    this.player.invulUntil = Number.MAX_SAFE_INTEGER;
    this.player.setVelocity(0, 0);
    const lv = this.level;
    const time = Math.round(a.timeMs / 100) / 10;
    const score = lv.survive ? a.hitsTaken : time;
    // 挑战关：剩下的敌人一起化成光点
    this.alive().forEach((s, j) => { s._bySpell = true; this.strike(s, s.hp, j * 15); this.time.delayedCall(100 + j * 15, () => s.dead || s.die()); });
    const reward = applyLevelWin(GAME_ID, lv.id, { score }, this.home);
    const medal = medalFor(lv, score);
    a.result = { won: true, score, medal, reward: reward.lines };
    sfx.correct();
    this.ui.banner(lv.survive ? '坚持住了！' : '全部清场！', 1400);
    const hasNext = !!this.nextLevelId();
    this.time.delayedCall(900, () => {
      this.ui.showResult({
        won: true,
        title: lv.survive ? '★ 挑战完成！' : '✓ 清场！',
        medal,
        stats: [
          [lv.survive ? '被击中' : '用时', lv.survive ? `${a.hitsTaken} 次` : `${time} 秒（金牌 ≤ ${lv.par} 秒）`],
          ['施法次数', `${a.casts} 次`],
          ['法术击杀 / 挥剑击杀', `${a.spellKills} / ${a.swordKills}`],
          ['剩余生命', `${Math.max(0, a.hp)} / ${a.maxHp}`],
        ],
        rewards: reward.lines || [],
        hasNext,
      });
      this.scene.pause();
    });
    updateHud();
  }

  lose() {
    if (this.ended) return;
    this.ended = true;
    const a = this.arena;
    a.phase = 'lost';
    a.result = { won: false };
    this.player.dying = true;
    this.player.setVelocity(0, 0);
    this.player.setTint(0x888888);
    sfx.die();
    this.time.delayedCall(700, () => {
      this.ui.showResult({
        won: false,
        title: '被史莱姆淹没了……',
        stats: [
          ['坚持了', `${(a.timeMs / 1000).toFixed(1)} 秒`],
          ['施法次数', `${a.casts} 次`],
          ['法术击杀 / 挥剑击杀', `${a.spellKills} / ${a.swordKills}`],
        ],
        rewards: ['竞技场的伤不会带回高原——改改法术再来！'],
        hasNext: false,
      });
      this.scene.pause();
    });
  }

  nextLevelId() {
    const i = LEVELS.findIndex((l) => l.id === this.levelId);
    for (let k = i + 1; k < LEVELS.length; k++) if (levelUnlocked(G, GAME_ID, LEVELS[k].id)) return LEVELS[k].id;
    return null;
  }

  gotoLevel(id) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.ui.hideResult();
    this.scene.resume();
    wipeTransition(() => this.scene.restart({ ...this.returnData, levelId: id || this.levelId }));
  }

  leaveArena() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.ui.closePrep();
    this.ui.hideResult();
    this.input.keyboard.enableGlobalCapture();
    this.scene.resume();
    this.player.invulUntil = Number.MAX_SAFE_INTEGER;
    saveGame();
    const { returnKey, spawn } = this.returnData;
    wipeTransition(() => this.scene.start(returnKey, { spawn }));
  }

  /** Player.die 的接管钩子（竞技场里不会走到：受伤已被 hurtPlayer 接管） */
  onPlayerDefeated() { this.lose(); }

  /** 竞技场里不开世界地图（离开请用「返回高原」） */
  blockWorldMap() {
    this.flashHint('竞技场里打不开世界地图——按 B 打开备咒台，点「返回高原」离开', 1800);
    return true;
  }

  act(name) {
    if (name === 'map') { this.blockWorldMap(); return; }
    super.act(name);
  }

  /** 触控层收起：备咒台 / 结算页打开时摇杆区不能截走面板上的点击（ui/TouchControls 的 _mode 读它） */
  touchBlocked() {
    return !!(this.ui && (this.ui.prepOpen || !this.ui.k.result.hidden));
  }

  updateInteractHint() {
    if (this.flashUntil && this.time.now < this.flashUntil) return;
    this.interactReady = false;
    this.hud.hint(null);
  }

  // ---------- 状态 / 测试接缝 ----------

  arenaState() {
    const a = this.arena;
    return { ...a, alive: this.enemies ? this.enemies.filter((s) => s.active && !s.dead).length : 0 };
  }

  /** seam.games().arena：只读快照 */
  arenaSnapshot() {
    const a = this.arena;
    if (!a) return null;
    const view = this.fieldView();
    return {
      levelId: this.levelId,
      phase: a.phase,
      wave: a.waveIdx + 1,
      waves: this.level.waves.length,
      alive: view.length,
      pending: a.pending,
      hp: view.map((e) => e.hp),
      dist: view.map((e) => e.dist),
      elite: view.map((e) => e.elite),
      mana: Math.round(a.mana * 10) / 10,
      manaMax: this.level.mana.max,
      spells: a.spells.slice(),
      cooldown: a.cd.map((c) => Math.round(c * 100) / 100),
      casts: a.casts,
      spellKills: a.spellKills,
      swordKills: a.swordKills,
      playerHp: a.hp,
      hitsTaken: a.hitsTaken,
      timeMs: Math.round(a.timeMs),
      prepOpen: !!(this.ui && this.ui.prepOpen),
      won: a.phase === 'won',
      lost: a.phase === 'lost',
      result: a.result,
      center: CENTER,
    };
  }
}
