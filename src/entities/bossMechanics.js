// ============================================================
// BOSS 招牌机制 · 行为层：按章节配置 bossMechanic 给 BOSS 挂上一项
// 与本章知识点呼应的招牌玩法（BossSlime / BossSnake 两种原型的基础行为不变，
// 机制只通过原型留出的扩展点叠加）。种类与参数见 data/bossMechanics.js。
//
// 生命周期（由 BOSS 实体与 LairScene 驱动）：
//   attachMechanic(boss, cfg)  BOSS 构造时挂载（章节没配置 → null）
//   onLairReady(shielded)      巢穴建好后（护盾期机制，如 W10 幻觉符文，在此布置）
//   activate(reason)           开战：破盾（shieldBroken）或带着破盾进度重进巢穴（reenter）
//   tick(now)                  BOSS 每帧调用；冻结时停摆
//   hurtHook() / segmentHook(n) / dartSpeed(v) / overridesSummons   原型扩展点
//   freeze()                   冻结（测试接缝 pinBoss）：清掉弹幕/符印等瞬态危险物，分身原地静止
//   destroy()                  BOSS 死亡：清理全部衍生物与玩家身上的速度修正
//   snapshot()                 只读 JSON 快照（测试接缝 bossMech 用）
// ============================================================
import Phaser from 'phaser';
import { damageHearts } from '../core/state.js';
import { sfx } from '../audio/sfx.js';
import { MECHANIC_KINDS, mechanicParams } from '../data/bossMechanics.js';
import { sineOffset, nfwPullSpeed, aimWeight, decayLr } from '../core/bossMath.js';

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const dist = (a, b) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

class BossMechanic {
  constructor(boss, cfg) {
    this.boss = boss;
    this.scene = boss.scene;
    this.cfg = cfg;
    this.kind = cfg.kind;
    this.active = false;
    this.frozen = false;
    this.overridesSummons = false;
    this.preShield = !!MECHANIC_KINDS[cfg.kind].preShield;
    this.hazards = [];  // 瞬态危险物（弹幕 / 符印）：freeze / destroy 时清除
    this.lastTick = 0;
  }

  get player() { return this.scene.player; }
  get now() { return this.scene.time.now; }
  playerFree() { const p = this.player; return !!(p && p.active && !p.dying); }

  activate(reason) {
    if (this.active) return;
    this.active = true;
    this.onActivate(reason);
  }

  tick(now) {
    const dt = this.lastTick ? Math.min(now - this.lastTick, 50) : 16;
    this.lastTick = now;
    if (!this.active || this.frozen || this.boss.dead) return;
    this.update(now, dt / 1000);
  }

  hurtHook() { if (this.active && !this.frozen && !this.boss.dead) this.onHurt(); }
  segmentHook(n) { if (this.active && !this.frozen) this.onSegmentLost(n); }
  dartSpeed(v) { return v; }

  freeze() { this.frozen = true; this.clearHazards(); this.onFreeze(); }
  unfreeze() { this.frozen = false; }
  clearHazards() { this.hazards.forEach((h) => h.destroy()); this.hazards = []; }
  removeHazard(h) { h.destroy(); this.hazards = this.hazards.filter((x) => x !== h); }
  destroy() { this.clearHazards(); this.onDestroy(); this.active = false; }

  snapshot() {
    return {
      kind: this.kind, name: this.cfg.name, active: this.active, frozen: this.frozen,
      playerSpeedMul: this.player ? this.player.speedMul() : 1,
      ...this.state(),
    };
  }

  // ---- 子类钩子 ----
  onLairReady() {}
  onActivate() {}
  update() {}
  onHurt() {}
  onSegmentLost() {}
  onFreeze() {}
  onDestroy() {}
  state() { return {}; }

  // ---- 工具 ----
  float(text, color, dy = -170) { this.scene.floatText(this.boss.x, this.boss.y + dy, text, color); }

  /** 接触伤害（Player.takeDamage 自带无敌帧判定） */
  touchPlayer(x, y, r) {
    if (!this.playerFree() || Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) > r) return false;
    this.player.takeDamage(1, x, y);
    return true;
  }

  /** 发光弹丸（核心 + 光晕的容器），作为瞬态危险物登记 */
  makeOrb(x, y, tint) {
    const halo = this.scene.add.image(0, 0, 'particle').setTint(tint).setAlpha(0.35).setDisplaySize(120, 120);
    const core = this.scene.add.image(0, 0, 'particle').setTint(0xffffff).setDisplaySize(44, 44);
    const c = this.scene.add.container(x, y, [halo, core]).setDepth(1950);
    if (!reducedMotion()) this.scene.tweens.add({ targets: halo, angle: 360, duration: 900, repeat: -1 });
    return c;
  }

  burstAt(x, y, colors, count = 10) {
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.image(x, y, 'particle').setTint(colors[i % colors.length]).setScale(4).setDepth(1900);
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 200;
      this.scene.tweens.add({
        targets: p, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp - 30,
        alpha: 0, duration: 520, onComplete: () => p.destroy(),
      });
    }
  }
}

// ------------------------------------------------------------
// W1 数据史莱姆王 · 列表召唤：第 k 波 append k 个帮手（接管原型的默认召唤）
// ------------------------------------------------------------
class AppendSummons extends BossMechanic {
  constructor(boss, cfg) {
    super(boss, cfg);
    this.overridesSummons = true;
    this.wavesDone = 0;
    this.helpers = 0;
  }

  onHurt() {
    const waves = this.cfg.waves;
    while (this.wavesDone < waves.length && this.boss.hp <= waves[this.wavesDone].hp) {
      const n = waves[this.wavesDone].n;
      this.wavesDone++;
      for (let k = 0; k < n; k++) {
        const a = Math.PI + (k / n) * Math.PI * 2; // 从左侧起绕 BOSS 均匀排开
        this.scene.spawnSlime(this.boss.x + Math.cos(a) * 300, this.boss.y + Math.sin(a) * 300);
      }
      this.helpers += n;
      this.float(`helpers.append(兵) ×${n} → len(helpers) == ${this.helpers}`, '#ff9db3');
    }
  }

  state() { return { waves: this.wavesDone, helpers: this.helpers }; }
}

// ------------------------------------------------------------
// W2 巨蟒毕森 · 循环倒数：身体是一个列表，每断一节 for 循环少迭代一轮
// ------------------------------------------------------------
class RangeCountdown extends BossMechanic {
  constructor(boss, cfg) {
    super(boss, cfg);
    this.lastCount = null;
    this.lastText = '';
  }

  onActivate() {
    const n = this.boss.segs ? this.boss.segs.length : 0;
    this.lastCount = n;
    this.lastText = `for seg in body:  # range(${n})`;
    this.float(this.lastText, '#9dff9d', -230);
  }

  onSegmentLost(n) {
    this.lastCount = n;
    this.lastText = n > 0 ? `range(${n}) → 还剩 ${n} 轮` : 'break！循环结束';
    this.float(this.lastText, '#9dff9d', -230);
  }

  state() { return { lastCount: this.lastCount, lastText: this.lastText }; }
}

// ------------------------------------------------------------
// W3 混沌曲线魔君 · 正弦混沌弹：直线推进 + 垂直方向 A·sin(ωt) 摆动
// ------------------------------------------------------------
class SineBullets extends BossMechanic {
  onActivate() { this.nextFire = this.now + 1200; }

  update(now) {
    const c = this.cfg;
    if (now >= this.nextFire && this.playerFree() && this.hazards.length < c.max) {
      this.nextFire = now + c.interval;
      this.fire(now);
    }
    for (const b of [...this.hazards]) {
      const t = (now - b.t0) / 1000;
      if (t * 1000 > c.life) { this.removeHazard(b); continue; }
      const along = c.speed * t;
      b.lat = sineOffset(t, c.amp, c.omega);
      b.orb.setPosition(b.ox + b.dx * along - b.dy * b.lat, b.oy + b.dy * along + b.dx * b.lat);
      if (this.touchPlayer(b.orb.x, b.orb.y, 110)) this.removeHazard(b);
    }
  }

  fire(now) {
    const p = this.player;
    const ox = this.boss.x, oy = this.boss.y - 120;
    const a = Phaser.Math.Angle.Between(ox, oy, p.x, p.y - 60);
    const orb = this.makeOrb(ox, oy, 0xb57ae0);
    this.hazards.push({ orb, ox, oy, dx: Math.cos(a), dy: Math.sin(a), t0: now, lat: 0, destroy: () => orb.destroy() });
    sfx.swing();
  }

  state() {
    return { bullets: this.hazards.length, lateral: this.hazards.map((b) => Math.round(b.lat)) };
  }
}

// ------------------------------------------------------------
// W4 单位术士 · 单位符印：地上留下限时陷阱圈，踩中「单位不匹配」短暂减速
// ------------------------------------------------------------
class UnitTraps extends BossMechanic {
  onActivate() {
    this.nextDrop = this.now + 1500;
    this.slowUntil = 0;
    this.warnCd = 0;
    this.dropped = 0;
  }

  update(now) {
    const c = this.cfg;
    if (now >= this.nextDrop && this.hazards.length < c.max) {
      this.nextDrop = now + c.interval;
      this.drop(now);
    }
    for (const h of [...this.hazards]) if (now - h.t0 > c.life) this.removeHazard(h);

    const p = this.player;
    if (!this.playerFree()) return;
    const hit = this.hazards.find((h) => dist(h, p) < c.radius);
    if (hit) {
      this.slowUntil = now + c.slowMs;
      if (now > this.warnCd) {
        this.warnCd = now + 1500;
        this.scene.floatText(p.x, p.y - 220, `单位不匹配！${hit.unit}`, '#ffb84d');
      }
    }
    p.setSpeedMod('unitTrap', now < this.slowUntil ? c.slow : 1);
  }

  /** 该点是否落在可行走地面上（符印落进墙里毫无意义） */
  walkable(x, y) {
    const def = this.scene.def;
    const row = def && def.grid[Math.floor(y / 128)];
    const tile = row && row[Math.floor(x / 128)];
    return tile !== undefined && !def.colliding.includes(tile);
  }

  drop(now) {
    const c = this.cfg;
    // 蛇形 BOSS 从尾巴落印（尾巴不在地面上时改从头部），其余从脚下
    const tail = this.boss.segs && this.boss.segs.length ? this.boss.segs[this.boss.segs.length - 1] : this.boss;
    const from = this.walkable(tail.x, tail.y) ? tail : this.boss;
    const x = Math.round(from.x), y = Math.round(from.y);
    const unit = c.units[this.dropped++ % c.units.length];
    const g = this.scene.add.graphics({ x, y }).setDepth(-5);
    g.fillStyle(0xffb84d, 0.16).fillCircle(0, 0, c.radius);
    g.lineStyle(6, 0xffb84d, 0.85).strokeCircle(0, 0, c.radius);
    g.lineStyle(3, 0xffb84d, 0.5).strokeCircle(0, 0, c.radius * 0.62);
    const label = this.scene.add.text(x, y, unit, {
      fontFamily: '"JetBrains Mono", Consolas, monospace', fontSize: '40px',
      color: '#ffe2a8', stroke: '#4a3b32', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(-4);
    if (!reducedMotion()) {
      g.setScale(0.2);
      this.scene.tweens.add({ targets: g, scale: 1, duration: 260, ease: 'back.out' });
    }
    this.hazards.push({ x, y, unit, t0: now, destroy: () => { g.destroy(); label.destroy(); } });
  }

  onFreeze() { this.player?.setSpeedMod('unitTrap', 1); }
  onDestroy() { this.player?.setSpeedMod('unitTrap', 1); }

  state() {
    return {
      traps: this.hazards.length,
      trapSpots: this.hazards.map((h) => ({ x: h.x, y: h.y, unit: h.unit })),
      slowed: this.now < (this.slowUntil || 0),
    };
  }
}

// ------------------------------------------------------------
// W5 迟缓巨魔 · 迟缓光环：光环内减速；破盾瞬间玩家获得「向量化」加速（光环暂时无效）
// ------------------------------------------------------------
class SlowAura extends BossMechanic {
  onActivate(reason) {
    const c = this.cfg;
    this.inAura = false;
    this.ring = this.scene.add.graphics().setDepth(-5);
    this.ring.fillStyle(0x5d6b8a, 0.14).fillCircle(0, 0, c.radius);
    this.ring.lineStyle(5, 0x9fb8ff, 0.55).strokeCircle(0, 0, c.radius);
    this.ring.setPosition(this.boss.x, this.boss.y);
    this.buffUntil = 0;
    if (reason === 'shieldBroken' && this.player) {
      // 加速立即生效、到点自动撤销（不依赖每帧 update，冻结期间也不会残留）
      this.buffUntil = this.now + c.buffMs;
      this.player.setSpeedMod('vectorize', c.buffMul);
      this.scene.floatText(this.player.x, this.player.y - 240, `向量化加速！光环失效 ${c.buffMs / 1000} 秒`, '#3ddad7');
      this.scene.time.delayedCall(c.buffMs, () => {
        if (this.player && this.player.active) this.player.setSpeedMod('vectorize', 1);
      });
    }
  }

  update(now) {
    const c = this.cfg;
    this.ring.setPosition(this.boss.x, this.boss.y);
    const p = this.player;
    if (!this.playerFree()) return;
    const buff = now < this.buffUntil;
    this.inAura = dist(this.boss, p) < c.radius;
    p.setSpeedMod('slowAura', this.inAura && !buff ? c.slow : 1);
  }

  onFreeze() { this.player?.setSpeedMod('slowAura', 1); }
  onDestroy() {
    this.player?.setSpeedMod('slowAura', 1);
    this.player?.setSpeedMod('vectorize', 1);
    this.ring?.destroy();
  }

  state() {
    return { inAura: !!this.inAura, buffActive: this.now < (this.buffUntil || 0), radius: this.cfg.radius };
  }
}

// ------------------------------------------------------------
// W6 优化牛头怪 · 梯度冲锋：突咬冲刺速度按学习率逐次衰减；冲过头撞墙 → 眩晕
// ------------------------------------------------------------
class GradientCharge extends BossMechanic {
  constructor(boss, cfg) {
    super(boss, cfg);
    this.lr = 1;
    this.charges = 0;
    this.speeds = [];
    this.stuns = 0;
    this.stunUntil = 0;
  }

  dartSpeed(v) {
    if (!this.active || this.frozen) return v;
    const speed = Math.round(v * this.lr);
    this.charges++;
    this.speeds.push(speed);
    this.float(`冲锋！lr = ${this.lr.toFixed(2)}`, '#ffd257', -230);
    this.lr = decayLr(this.lr, this.cfg.decay, this.cfg.minLr);
    return speed;
  }

  update(now) {
    const b = this.boss;
    if (now < this.stunUntil) {
      // 眩晕期间被击中会有 220ms 击退，结束后重新钉住，直到眩晕结束
      if (now >= b.knockUntil) { b.knockUntil = this.stunUntil; b.setVelocity(0, 0); }
      if (this.stars) this.stars.setPosition(b.x, b.y - 330);
      return;
    }
    if (this.stars) { this.stars.destroy(); this.stars = null; }
    const darting = now > b.teleUntil && now < b.dartUntil;
    if (darting && !b.body.blocked.none) {
      this.stuns++;
      this.stunUntil = now + this.cfg.stunMs;
      b.dartUntil = 0;
      b.setVelocity(0, 0);
      b.knockUntil = this.stunUntil;
      this.float('冲过头撞墙了！梯度爆炸 → 眩晕', '#ffd257', -230);
      sfx.hitEnemy();
      if (!reducedMotion()) this.scene.cameras.main.shake(160, 0.004);
      this.stars = this.scene.add.text(b.x, b.y - 330, '✦ ✧ ✦', {
        fontFamily: '"ZCOOL KuaiLe", sans-serif', fontSize: '64px', color: '#ffd257',
        stroke: '#4a3b32', strokeThickness: 10,
      }).setOrigin(0.5).setDepth(2000);
    }
  }

  onDestroy() { if (this.stars) this.stars.destroy(); }

  state() {
    return {
      charges: this.charges, speeds: this.speeds.slice(), lr: this.lr,
      stuns: this.stuns, stunned: this.now < this.stunUntil,
    };
  }
}

// ------------------------------------------------------------
// W7 傅里叶魅影 · 频谱分身：三个分身以不同频率脉动，须按频率从低到高击破；
// 顺序错 → 分身复原（有上限，超过则溃散），全部按序击破 → 魅影相位锁定若干秒
// ------------------------------------------------------------
const ECHO_TINTS = [0x6fb7ff, 0xb57ae0, 0xff7ab8];

class FourierEchoes extends BossMechanic {
  constructor(boss, cfg) {
    super(boss, cfg);
    this.clones = [];
    this.resets = 0;
    this.locks = 0;
    this.lockUntil = 0;
    this.respawnAt = 0;
  }

  onActivate() { this.spawnClones(); }

  spawnClones() {
    const c = this.cfg;
    const reduce = reducedMotion();
    if (!this.clones.length) {
      c.freqs.forEach((freq, i) => {
        const spr = this.scene.add.sprite(this.boss.x, this.boss.y, 'warrior_purple_idle')
          .setOrigin(0.5, 136 / 192).setScale(2).setTint(ECHO_TINTS[i % ECHO_TINTS.length]).setAlpha(0.85);
        spr.play('ts_warrior_purple_idle');
        // 减少动态效果时不靠脉动快慢分辨，直接标出频率
        const label = reduce
          ? this.scene.add.text(spr.x, spr.y, `${freq}×`, {
            fontFamily: '"ZCOOL KuaiLe", sans-serif', fontSize: '56px', color: '#ffffff',
            stroke: '#4a3b32', strokeThickness: 10,
          }).setOrigin(0.5).setDepth(2000)
          : null;
        const clone = { spr, label, freq, alive: true, a0: -Math.PI / 2 + (i / c.freqs.length) * Math.PI * 2 };
        spr.dead = false;
        spr.hurt = () => this.hitClone(clone);
        this.scene.extraTargets.push(spr);
        this.clones.push(clone);
      });
    }
    this.clones.forEach((cl) => this.setAlive(cl, true));
    this.place(this.now);
  }

  setAlive(cl, alive) {
    cl.alive = alive;
    cl.spr.dead = !alive;
    cl.spr.setVisible(alive);
    if (cl.label) cl.label.setVisible(alive);
  }

  place(now) {
    const c = this.cfg;
    const t = now / 1000;
    for (const cl of this.clones) {
      const a = cl.a0 + now * 0.00035;
      cl.spr.setPosition(this.boss.x + Math.cos(a) * c.rx, this.boss.y + Math.sin(a) * c.ry);
      cl.spr.setDepth(cl.spr.y);
      if (!reducedMotion()) {
        const k = 1 + 0.14 * Math.sin(2 * Math.PI * cl.freq * t);
        cl.spr.setScale(2 * k);
        cl.spr.setAlpha(0.55 + 0.35 * (k - 0.86) / 0.28);
      }
      if (cl.label) cl.label.setPosition(cl.spr.x, cl.spr.y - 330);
    }
  }

  update(now) {
    const b = this.boss;
    if (now < this.lockUntil && now >= b.knockUntil) { b.knockUntil = this.lockUntil; b.setVelocity(0, 0); }
    if (this.lockUntil && now >= this.lockUntil) { this.lockUntil = 0; b.clearTint(); }
    if (!this.clones.some((cl) => cl.alive)) {
      if (this.respawnAt && now >= this.respawnAt) {
        this.respawnAt = 0;
        this.spawnClones();
        this.float('魅影又分出了频谱分身！', '#c9b8ff');
      }
      return;
    }
    this.place(now);
    for (const cl of this.clones) if (cl.alive) this.touchPlayer(cl.spr.x, cl.spr.y, 140);
  }

  hitClone(cl) {
    if (!this.active || !cl.alive) return;
    const now = this.now;
    const next = Math.min(...this.clones.filter((x) => x.alive).map((x) => x.freq));
    if (cl.freq === next) {
      this.setAlive(cl, false);
      this.burstAt(cl.spr.x, cl.spr.y - 60, [0xffffff, ECHO_TINTS[this.cfg.freqs.indexOf(cl.freq) % 3]]);
      sfx.enemyDie();
      this.scene.floatText(cl.spr.x, cl.spr.y - 260, `${cl.freq}× 分量已滤除`, '#c9b8ff');
      if (!this.clones.some((x) => x.alive)) {
        this.locks++;
        this.resets = 0;
        this.lockUntil = now + this.cfg.lockMs;
        this.respawnAt = now + this.cfg.respawnMs;
        this.boss.knockUntil = Math.max(this.boss.knockUntil, this.lockUntil);
        this.boss.setVelocity(0, 0);
        this.boss.setTint(0xffd257);
        this.float('相位锁定！魅影僵住了', '#ffd257');
        sfx.shieldBreak();
      }
      return;
    }
    this.resets++;
    sfx.wrong();
    if (this.resets <= this.cfg.maxResets) {
      this.clones.forEach((x) => this.setAlive(x, true));
      this.scene.floatText(cl.spr.x, cl.spr.y - 260, '频谱乱序！分身复原了——先打闪得最慢的', '#ff9db3');
    } else {
      // 乱序次数到上限：分身溃散（不给奖励），过一会儿重新分身，避免卡关
      this.clones.forEach((x) => this.setAlive(x, false));
      this.resets = 0;
      this.respawnAt = now + this.cfg.respawnMs;
      this.float('频谱散乱，分身溃散了……', '#c9b8ff');
    }
  }

  onDestroy() {
    for (const cl of this.clones) { cl.spr.destroy(); if (cl.label) cl.label.destroy(); }
    this.scene.extraTargets = this.scene.extraTargets.filter((t) => !this.clones.some((cl) => cl.spr === t));
    this.clones = [];
  }

  state() {
    return {
      clones: this.clones.map((cl) => ({ freq: cl.freq, alive: cl.alive, x: Math.round(cl.spr.x), y: Math.round(cl.spr.y) })),
      resets: this.resets, locks: this.locks, phaseLocked: this.now < this.lockUntil,
    };
  }
}

// ------------------------------------------------------------
// W8 NFW 幻龙 · 暗物质引力：按 NFW 包含质量把玩家拉向核心（内陡外缓）
// ------------------------------------------------------------
class NfwGravity extends BossMechanic {
  onActivate() {
    const rs = this.cfg.rs;
    this.pull = 0;
    this.halo = this.scene.add.graphics().setDepth(-5);
    [[rs * 2.4, 0.06], [rs * 1.4, 0.1], [rs * 0.7, 0.16], [rs * 0.3, 0.24]].forEach(([r, a]) => {
      this.halo.fillStyle(0x7d62b5, a).fillCircle(0, 0, r);
    });
    this.halo.setPosition(this.boss.x, this.boss.y);
  }

  update(now) {
    const c = this.cfg;
    this.halo.setPosition(this.boss.x, this.boss.y);
    const p = this.player;
    this.pull = 0;
    if (!this.playerFree() || now < p.knockUntil) return;
    const r = dist(p, this.boss);
    if (r > c.range) return;
    this.pull = nfwPullSpeed(r, c.rs, c.g0);
    const a = Phaser.Math.Angle.Between(p.x, p.y, this.boss.x, this.boss.y);
    p.body.velocity.x += Math.cos(a) * this.pull;
    p.body.velocity.y += Math.sin(a) * this.pull;
  }

  onFreeze() { this.pull = 0; }
  onDestroy() { this.halo?.destroy(); }

  state() { return { pullSpeed: Math.round(this.pull || 0), rs: this.cfg.rs }; }
}

// ------------------------------------------------------------
// W9 贝叶斯祭司 · 后验瞄准：每被击中一次更新后验，弹幕从瞄准当前位置逐步变为预判走位
// ------------------------------------------------------------
class BayesianAim extends BossMechanic {
  constructor(boss, cfg) {
    super(boss, cfg);
    this.hits = 0;
  }

  onActivate() { this.nextFire = this.now + 1500; }

  onHurt() {
    this.hits++;
    this.float(`后验更新：w = ${aimWeight(this.hits, this.cfg.step).toFixed(1)}`, '#c9b8ff', -230);
  }

  update(now) {
    const c = this.cfg;
    if (now >= this.nextFire && this.playerFree()) {
      this.nextFire = now + c.interval;
      this.fire(now);
    }
    for (const b of [...this.hazards]) {
      const t = (now - b.t0) / 1000;
      if (t * 1000 > c.life) { this.removeHazard(b); continue; }
      b.orb.setPosition(b.ox + b.dx * c.speed * t, b.oy + b.dy * c.speed * t);
      if (this.touchPlayer(b.orb.x, b.orb.y, 110)) this.removeHazard(b);
    }
  }

  fire(now) {
    const c = this.cfg;
    const p = this.player;
    const w = aimWeight(this.hits, c.step);
    // 瞄准点 = 当前位置（先验）+ w × 速度 × 提前量（后验预判）
    const tx = p.x + w * p.body.velocity.x * c.lead;
    const ty = p.y - 60 + w * p.body.velocity.y * c.lead;
    const ox = this.boss.x, oy = this.boss.y - 120;
    const a = Phaser.Math.Angle.Between(ox, oy, tx, ty);
    const orb = this.makeOrb(ox, oy, 0x8fb8ff);
    this.hazards.push({ orb, ox, oy, dx: Math.cos(a), dy: Math.sin(a), t0: now, destroy: () => orb.destroy() });
    sfx.swing();
  }

  state() {
    return { hits: this.hits, aimWeight: aimWeight(this.hits, this.cfg.step), bullets: this.hazards.length };
  }
}

// ------------------------------------------------------------
// W10 幻言魔像 · 幻觉符文：护盾期在真 BOSS 符文两侧布置假符文石（光晕闪烁、
// 头顶没有金色印记）；交互假符文 = 识破幻觉但扣 1 心（最多扣到 1 心，次数 = 假符文数）。
// 破盾后幻觉消散，魔像不时谎称「护盾已恢复」——其实照样能打。
// ------------------------------------------------------------
class FakeRunes extends BossMechanic {
  constructor(boss, cfg) {
    super(boss, cfg);
    this.fakes = [];
    this.revealed = 0;
    this.lies = 0;
  }

  onLairReady(shielded) {
    if (!shielded) return;
    const real = this.scene.interactables.find((it) => it.kind === 'rune' && it.bossRune);
    if (!real || !real.alive) return;
    const reduce = reducedMotion();
    this.realSpot = { x: real.x, y: real.y };
    // 真符文的验证标记：头顶金色印记
    this.seal = this.scene.add.image(real.x, real.y - 330, 'shard').setDisplaySize(72, 86).setDepth(real.y + 1);
    if (!reduce) this.scene.tweens.add({ targets: this.seal, y: real.y - 350, duration: 700, yoyo: true, repeat: -1, ease: 'sine.inout' });

    const offsets = [-1, 1, -2, 2].slice(0, this.cfg.fakes);
    for (const k of offsets) {
      const x = real.x + k * this.cfg.spacing * 128, y = real.y;
      const tower = this.scene.add.image(x, y + 16, 'tower').setOrigin(0.5, 0.94).setDepth(y);
      const shadow = this.scene.add.image(x, y + 4, 'ts_shadow').setDisplaySize(120, 60).setAlpha(0.5).setDepth(y - 1);
      const aura = this.scene.add.image(x, y - 130, 'particle').setTint(reduce ? 0x8ad9ff : 0x3ddad7)
        .setAlpha(0.2).setScale(44).setDepth(y - 0.5);
      // 幻觉的破绽：光晕不规则闪烁（减少动态效果时改为偏色）
      if (!reduce) this.scene.tweens.add({ targets: aura, alpha: 0.04, duration: 170, yoyo: true, repeat: -1, repeatDelay: 900 });
      const it = { kind: 'rune', x, y, fake: true, alive: true, sprite: tower, parts: [tower, shadow, aura] };
      it.onInteract = () => this.revealFake(it);
      this.scene.interactables.push(it);
      this.fakes.push(it);
    }
  }

  revealFake(it) {
    if (!it.alive) return;
    this.dropFake(it);
    this.revealed++;
    this.burstAt(it.x, it.y - 120, [0x3ddad7, 0xffffff, 0xff9db3], 14);
    this.scene.floatText(it.x, it.y - 300, '幻觉被识破！这块符文石是假的', '#ff9db3');
    damageHearts(1);
    sfx.wrong();
  }

  dropFake(it) {
    it.alive = false;
    it.parts.forEach((p) => p.destroy());
    this.scene.interactables = this.scene.interactables.filter((x) => x !== it);
  }

  onActivate(reason) {
    const left = this.fakes.filter((it) => it.alive);
    left.forEach((it) => this.dropFake(it));
    if (left.length) this.scene.floatText(left[0].x, left[0].y - 300, '幻觉随护盾一同消散', '#9fb8ff');
    if (this.seal) { this.seal.destroy(); this.seal = null; }
    this.nextLie = this.now + this.cfg.lieEvery;
    this.reason = reason;
  }

  update(now) {
    if (now < this.nextLie) return;
    this.nextLie = now + this.cfg.lieEvery;
    this.lies++;
    // 谎称护盾恢复：只是变色，攻击照样有效（先验证再信任）
    this.boss.setTint(0x7f9dff);
    this.float('护盾已恢复！……（幻言，别信）', '#9fb8ff');
    this.scene.time.delayedCall(900, () => { if (!this.boss.dead && this.boss.active) this.boss.clearTint(); });
  }

  onDestroy() {
    this.fakes.filter((it) => it.alive).forEach((it) => this.dropFake(it));
    if (this.seal) { this.seal.destroy(); this.seal = null; }
  }

  state() {
    return {
      fakes: this.fakes.filter((it) => it.alive).length,
      fakeSpots: this.fakes.filter((it) => it.alive).map((it) => ({ x: it.x, y: it.y })),
      realRune: this.realSpot || null,
      revealed: this.revealed, lies: this.lies,
    };
  }
}

// ------------------------------------------------------------
// W11 三途守门人 · 三途试炼：按血量依次切换三段子机制
//   拟合之途（正弦曲线弹）→ 模拟之途（NFW 引力场）→ 学习之途（后验预判弹）
// ------------------------------------------------------------
class ThreePaths extends BossMechanic {
  constructor(boss, cfg) {
    super(boss, cfg);
    this.phases = cfg.phases.map((ph) => ({
      ...ph,
      mech: createMechanic(boss, { kind: ph.kind, name: ph.label, tip: '', ...(ph.params || {}) }),
    }));
    this.idx = -1;
  }

  get sub() { return this.idx >= 0 ? this.phases[this.idx].mech : null; }

  phaseFor(hp) {
    const i = this.phases.findIndex((ph) => hp > ph.above);
    return i < 0 ? this.phases.length - 1 : i;
  }

  enterPhase(i) {
    if (i === this.idx) return;
    if (this.sub) this.sub.destroy();
    this.idx = i;
    this.sub.activate('phase');
    this.float(`第${['一', '二', '三'][i] || i + 1}途 · ${this.phases[i].label}`, '#ffd257', -260);
  }

  onActivate() { this.enterPhase(this.phaseFor(this.boss.hp)); }

  update(now, dt) {
    const sub = this.sub;
    if (sub) { sub.lastTick = now; sub.update(now, dt); }
  }

  onHurt() {
    this.enterPhase(this.phaseFor(this.boss.hp));
    this.sub?.onHurt();
  }

  onFreeze() { if (this.sub) { this.sub.clearHazards(); this.sub.onFreeze(); } }
  onDestroy() { this.phases.forEach((ph) => ph.mech.destroy()); }

  state() {
    const ph = this.phases[this.idx];
    return { phase: ph ? ph.key : null, phaseLabel: ph ? ph.label : null, sub: this.sub ? this.sub.state() : null };
  }
}

// ------------------------------------------------------------
// 注册表
// ------------------------------------------------------------
const IMPL = {
  appendSummons: AppendSummons,
  rangeCountdown: RangeCountdown,
  sineBullets: SineBullets,
  unitTraps: UnitTraps,
  slowAura: SlowAura,
  gradientCharge: GradientCharge,
  fourierEchoes: FourierEchoes,
  nfwGravity: NfwGravity,
  bayesianAim: BayesianAim,
  fakeRunes: FakeRunes,
  threePaths: ThreePaths,
};
for (const kind of Object.keys(MECHANIC_KINDS)) {
  if (!IMPL[kind]) throw new Error(`BOSS 招牌机制 ${kind} 缺少行为实现`);
}

function createMechanic(boss, cfg) {
  return new IMPL[cfg.kind](boss, mechanicParams(cfg));
}

/** BOSS 构造时调用：按章节配置挂载招牌机制（无配置返回 null，原型行为照旧） */
export function attachMechanic(boss, cfg) {
  return cfg ? createMechanic(boss, cfg) : null;
}
