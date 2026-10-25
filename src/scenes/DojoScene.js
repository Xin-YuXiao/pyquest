// ============================================================
// 代码训练场场景：写真 Python 驱动勇者过解谜小房间
//
// - 左半边（画布 x ≈ 0-940）：Phaser 画关卡网格与勇者；右半边是 DOM 面板（ui/DojoPanel.js）
// - 点「运行」：代码交给 Pyodide Worker（core/pyRuntime.js），在本关全部布局上各跑一遍；
//   Worker 只送回动作列表，这里用同一个模拟器（core/dojoSim.js）重算判定并逐帧回放
// - 通关记录 / 个人最佳 / 代码草稿写进存档 v3 的可选字段 dojo；不影响主线进度
// - 入口：第二章野外的「代码训练场」门（第一章通关后开放）；「返回森林」回到门前
// ============================================================
import Phaser from 'phaser';
import { G } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { CHAPTERS } from '../data/chapters.js';
import { DOJO_LEVELS, dojoLevel } from '../data/dojoLevels.js';
import {
  createSim, simulate, countLines, countSteps, recordClear, levelUnlocked,
} from '../core/dojoSim.js';
import { explainPyError } from '../core/dojoPrelude.js';
import { pyRuntime } from '../core/pyRuntime.js';
import { DojoPanel, esc } from '../ui/DojoPanel.js';
import { touchControls } from '../ui/TouchControls.js';
import { wipeTransition } from '../ui/wipe.js';
import { sfx } from '../audio/sfx.js';
import { music } from '../audio/music.js';

export const DOJO_KEY = 'DOJO';

// 关卡房间的绘制区（画布像素；画布 1920×1280，右侧 ~980px 被面板盖住）
const AREA = { x: 28, y: 150, w: 900, h: 1080 };
const STEP_MS = 280; // 回放每一步的基准时长（1× 速度）

const COLORS = {
  floor: 0xd9c49a, floorLine: 0xbfa676, wall: 0x4b3f5e, wallTop: 0x6c5a88,
  water: 0x4a8fd6, waterHi: 0x86bdf2, trap: 0xd94b4b, trapDark: 0x7a1f2a,
  start: 0x3ddad7, flag: 0xffd257, pole: 0x6b4f2e,
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default class DojoScene extends Phaser.Scene {
  constructor() { super(DOJO_KEY); }

  init(data) {
    this.levelId = (data && data.levelId) || this._firstOpenLevel();
    this.returnKey = (data && data.returnKey) || CHAPTERS[1].fieldKey;
  }

  _firstOpenLevel() {
    const open = DOJO_LEVELS.find((l) => !(G.dojo[l.id] && G.dojo[l.id].cleared) && levelUnlocked(DOJO_LEVELS, G.dojo, l.id));
    return (open || DOJO_LEVELS[0]).id;
  }

  create() {
    this.phase = 'idle';      // idle | running | replaying | done（测试接缝读）
    this.lastRun = null;      // 最近一次运行的结果摘要（测试接缝读）
    this.speed = 1;
    this.skipping = false;
    this.sawSolution = {};    // 本次进入训练场后看过参考解的关卡
    this.hintStep = {};       // 各关提示已经点到第几级

    // 世界场景的 HUD / 提示条 / 触控层与训练场无关：收起
    this._hud = document.getElementById('hud-top');
    if (this._hud) this._hud.style.display = 'none';
    document.getElementById('hint')?.classList.add('hidden');
    touchControls.detach();
    // Phaser 会在 window 级对已登记的按键（WASD / E / J / M / 方向键）preventDefault，
    // 编辑器里就打不出这些字母——训练场期间关掉全局捕获，离开时恢复
    this.input.keyboard.disableGlobalCapture();

    this.cameras.main.setBackgroundColor('#2c2438');
    this.add.text(AREA.x + 6, 34, '代码训练场', {
      fontFamily: '"ZCOOL KuaiLe","PingFang SC",sans-serif', fontSize: '54px', color: '#ffd257',
      stroke: '#3f2631', strokeThickness: 10,
    });
    this.variantText = this.add.text(AREA.x + AREA.w - 6, 50, '', {
      fontFamily: '"ZCOOL KuaiLe","PingFang SC",sans-serif', fontSize: '40px', color: '#e8e3f5',
      stroke: '#3f2631', strokeThickness: 8,
    }).setOrigin(1, 0);
    this.room = this.add.container(0, 0);

    this.panel = new DojoPanel({
      onRun: () => this.runCode(),
      onReset: () => this.resetCode(),
      onHint: () => this.nextHint(),
      onSelect: (id) => this.loadLevel(id),
      onExit: () => this.exit(),
      onSpeed: () => { this.speed = this.speed === 1 ? 3 : 1; this.panel.setSpeed(this.speed); },
      onSkip: () => { this.skipping = true; },
      onNext: () => {
        const i = DOJO_LEVELS.findIndex((l) => l.id === this.level.id);
        if (DOJO_LEVELS[i + 1]) this.loadLevel(DOJO_LEVELS[i + 1].id);
      },
    });
    this.panel.setRuntime(pyRuntime.info());
    this._unsub = pyRuntime.onChange((info) => this.panel && this.panel.setRuntime(info));
    pyRuntime.ensure(); // 进门就开始在后台加载 Python（首次约 13 MB）

    this.events.once('shutdown', () => this._cleanup());
    music.duck(false);
    music.play('lair-calm');
    this.loadLevel(this.levelId);
    this.panel.focusEditor();
  }

  _cleanup() {
    this._saveDraft();
    this._unsub && this._unsub();
    this.panel && this.panel.destroy();
    this.panel = null;
    this.input.keyboard.enableGlobalCapture();
    if (this._hud) this._hud.style.display = '';
  }

  // ---------- 关卡 ----------

  loadLevel(id) {
    if (this.phase === 'running' || this.phase === 'replaying') return;
    this._saveDraft();
    this.level = dojoLevel(id);
    this.levelId = id;
    this.phase = 'idle';
    this.lastRun = null;
    const rec = G.dojo[id];
    this.panel.showLevel(this.level, this._levelTabs(), (rec && rec.code) || this.level.starter);
    this._renderBest();
    this.drawVariant(0);
  }

  _levelTabs() {
    return DOJO_LEVELS.map((l) => ({
      id: l.id, concept: l.concept,
      unlocked: levelUnlocked(DOJO_LEVELS, G.dojo, l.id) || l.id === this.levelId,
      cleared: !!(G.dojo[l.id] && G.dojo[l.id].cleared),
    }));
  }

  _renderBest() {
    const rec = G.dojo[this.level.id];
    const par = this.level.par && this.level.par.lines;
    if (!rec || !rec.cleared) {
      this.panel.setBest(par ? `挑战：用不超过 ${par} 行代码通关` : '');
      return;
    }
    const star = par && rec.bestLines <= par ? `<span class="star">★ 挑战达成（≤ ${par} 行）</span>` : `挑战：用不超过 ${par} 行代码通关`;
    this.panel.setBest(`个人最佳：${rec.bestLines} 行 · ${rec.bestSteps} 步${rec.sawSolution ? '（看过参考解）' : ''} · ${star}`);
  }

  _saveDraft() {
    if (!this.level || !this.panel) return;
    const code = this.panel.getCode();
    const rec = G.dojo[this.level.id] || {};
    if (code === (rec.code ?? this.level.starter)) return;
    G.dojo[this.level.id] = { ...rec, code: code.slice(0, 4000) };
    saveGame();
  }

  resetCode() {
    this.panel.setCode(this.level.starter);
    this.panel.clearOutput();
    this.drawVariant(0);
  }

  nextHint() {
    const id = this.level.id;
    const k = this.hintStep[id] || 0;
    const hints = this.level.hints;
    if (k < hints.length) {
      this.hintStep[id] = k + 1;
      this.panel.showResult('info', `<b>提示 ${k + 1} / ${hints.length}</b><pre>${esc(hints[k])}</pre>`);
      return;
    }
    this.sawSolution[id] = true;
    this.panel.showResult('info', `<b>参考解</b>（看过参考解后，本关成绩会标记「看过参考解」）<pre>${esc(this.level.solution)}</pre>`);
  }

  exit() {
    if (this.phase === 'running') return;
    this.skipping = true;
    wipeTransition(() => this.scene.start(this.returnKey, { spawn: 'fromDojo' }));
  }

  // ---------- 绘制 ----------

  /** 画第 v 个布局的初始局面（每次运行回放前也会重画） */
  drawVariant(v, sim = createSim(this.level, v)) {
    this.room.removeAll(true);
    const n = this.level.variants.length;
    this.variantText.setText(n > 1 ? `布局 ${v + 1} / ${n}` : '');
    const cell = Math.floor(Math.min(150, AREA.w / sim.w, AREA.h / sim.h));
    const ox = AREA.x + Math.floor((AREA.w - sim.w * cell) / 2);
    const oy = AREA.y + Math.floor((AREA.h - sim.h * cell) / 2);
    this.cell = cell;
    this.origin = { x: ox, y: oy };

    const g = this.add.graphics();
    this.room.add(g);
    const start = this.level.variants[v].grid.findIndex((r) => r.includes('S'));
    const startX = start >= 0 ? this.level.variants[v].grid[start].indexOf('S') : -1;
    this.items = {};
    for (let y = 0; y < sim.h; y++) {
      for (let x = 0; x < sim.w; x++) {
        const c = sim.grid[y][x];
        const px = ox + x * cell, py = oy + y * cell;
        if (c === '#') {
          g.fillStyle(COLORS.wall).fillRect(px, py, cell, cell);
          // 墙顶亮边只画在露出来的上沿（上方不是墙），否则整片墙会变成一道道横纹
          if (y === 0 || sim.grid[y - 1][x] !== '#') {
            g.fillStyle(COLORS.wallTop).fillRect(px, py, cell, Math.round(cell * 0.22));
          }
        } else if (c === '~') {
          g.fillStyle(COLORS.water).fillRect(px, py, cell, cell);
          g.fillStyle(COLORS.waterHi).fillRect(px + cell * 0.18, py + cell * 0.32, cell * 0.3, cell * 0.06);
          g.fillStyle(COLORS.waterHi).fillRect(px + cell * 0.52, py + cell * 0.64, cell * 0.28, cell * 0.06);
        } else {
          g.fillStyle(COLORS.floor).fillRect(px, py, cell, cell);
          g.lineStyle(2, COLORS.floorLine).strokeRect(px + 1, py + 1, cell - 2, cell - 2);
          if (x === startX && y === start) {
            g.lineStyle(4, COLORS.start, 0.7).strokeCircle(px + cell / 2, py + cell / 2, cell * 0.32);
          }
          if (c === '^') {
            g.fillStyle(COLORS.trapDark).fillRect(px + cell * 0.12, py + cell * 0.7, cell * 0.76, cell * 0.1);
            for (let i = 0; i < 3; i++) {
              const bx = px + cell * (0.16 + i * 0.24);
              g.fillStyle(COLORS.trap).fillTriangle(bx, py + cell * 0.72, bx + cell * 0.2, py + cell * 0.72, bx + cell * 0.1, py + cell * 0.26);
            }
          } else if (c === 'F') {
            g.fillStyle(COLORS.pole).fillRect(px + cell * 0.42, py + cell * 0.16, cell * 0.06, cell * 0.68);
            g.fillStyle(COLORS.flag).fillTriangle(px + cell * 0.48, py + cell * 0.16, px + cell * 0.84, py + cell * 0.28, px + cell * 0.48, py + cell * 0.42);
          }
        }
        const cx = px + cell / 2, cy = py + cell / 2;
        if (c === '*') {
          const s = this.add.image(cx, cy, 'shard').setDisplaySize(cell * 0.42, cell * 0.5);
          if (!reduced()) this.tweens.add({ targets: s, y: cy - cell * 0.06, duration: 700, yoyo: true, repeat: -1, ease: 'sine.inout' });
          this.room.add(s);
          this.items[`${x},${y}`] = s;
        } else if (c === 'm') {
          const m = this.add.sprite(cx, cy + cell * 0.28, 'pawn_red_idle').setOrigin(0.5, 136 / 192).setScale(cell / 112);
          m.play('ts_pawn_red_idle');
          this.room.add(m);
          this.items[`${x},${y}`] = m;
        } else if (c === 'E') {
          const e = this.add.image(cx, cy, 'portal_door').setDisplaySize(cell * 0.96, cell * 0.96);
          if (this.level.win.shards === 'all' && sim.shardsTotal > 0) e.setAlpha(0.45);
          this.room.add(e);
          this.exitSprite = e;
        }
      }
    }
    this.hero = this.add.sprite(0, 0, 'warrior_idle').setOrigin(0.5, 136 / 192).setScale(cell / 96);
    this.hero.play('ts_warrior_idle');
    this.room.add(this.hero);
    this._placeHero(sim.x, sim.y, sim.facing);
  }

  _cellCenter(x, y) {
    return { x: this.origin.x + (x + 0.5) * this.cell, y: this.origin.y + (y + 0.5) * this.cell + this.cell * 0.3 };
  }

  _placeHero(x, y, facing) {
    const p = this._cellCenter(x, y);
    this.hero.setPosition(p.x, p.y).setFlipX(facing === 'left');
  }

  // ---------- 运行 ----------

  async runCode() {
    if (this.phase === 'running' || this.phase === 'replaying') return;
    const level = this.level;
    const code = this.panel.getCode();
    this._saveDraft();
    this.phase = 'running';
    this.skipping = false;
    this.panel.setBusy('running');
    this.panel.highlightLine(0);
    this.panel.showResult('info', pyRuntime.info().state === 'ready' ? '运行中……' : 'Python 还在加载，加载好就自动运行……');
    let res;
    try {
      res = await pyRuntime.run(level.id, code);
    } catch (e) {
      res = { crashed: e.message };
    }
    if (!this.panel || this.level !== level) return; // 运行期间离开了训练场

    if (res.timedOut || res.crashed) {
      this.phase = 'done';
      this.lastRun = { result: res.timedOut ? 'timeout' : 'crashed' };
      this.panel.setBusy(false);
      this.panel.showResult(res.timedOut ? 'timeout' : 'error', res.timedOut
        ? '<b>⏱ 代码运行超时</b>（超过 4 秒还没结束——是不是写了死循环？比如 while 的条件永远成立）。正在重启 Python……'
        : `<b>Python 运行出错</b>：${esc(res.crashed)}`);
      sfx.wrong();
      return;
    }

    // 主线程按动作列表重算判定（不信任 Worker 的结论）
    const sims = res.variants.map((v, i) => simulate(level, i, v.actions));
    const firstErr = res.variants.findIndex((v) => v.error);
    const firstFail = sims.findIndex((s) => s.status !== 'win');
    const win = firstErr < 0 && firstFail < 0;
    const stdout = res.variants.map((v) => v.stdout).find((s) => s) || '';

    // 回放：全部通过就每个布局都放一遍；否则放到第一个出问题的布局为止
    this.phase = 'replaying';
    this.panel.setBusy('replaying');
    this.panel.setSpeed(this.speed);
    const stopAt = win ? sims.length - 1 : (firstErr >= 0 ? firstErr : firstFail);
    for (let i = 0; i <= stopAt && this.panel; i++) {
      this.drawVariant(i);
      await this.replay(sims[i]);
      if (i < stopAt) await this._wait(380);
    }
    if (!this.panel) return;
    this.panel.highlightLine(0);
    this.panel.setBusy(false);
    this.phase = 'done';

    const lines = countLines(code);
    const steps = countSteps(res.variants[0].actions);
    const n = sims.length;
    const out = stdout ? `<pre>print 输出：\n${esc(stdout.slice(0, 1200))}</pre>` : '';
    if (win) {
      const before = G.dojo[level.id] || {};
      G.dojo[level.id] = recordClear(before, { lines, steps, sawSolution: !!this.sawSolution[level.id], code });
      saveGame();
      this.lastRun = { result: 'win', lines, steps, variants: n };
      this.panel.showResult('win', `<b>✓ 通关！</b>${n > 1 ? `${n} 个布局全部通过 · ` : ''}代码 ${lines} 行 · 动作 ${steps} 步${out}`);
      this._renderBest();
      this.panel.renderTabs(this._levelTabs(), level.id);
      const i = DOJO_LEVELS.findIndex((l) => l.id === level.id);
      this.panel.showNext(!!DOJO_LEVELS[i + 1]);
      sfx.correct();
      this._celebrate();
    } else if (firstErr >= 0) {
      const err = res.variants[firstErr].error;
      this.lastRun = { result: 'error', error: err, variant: firstErr + 1 };
      this.panel.showResult('error', `<b>✗ 代码出错了</b>${n > 1 ? `（布局 ${firstErr + 1} / ${n}）` : ''}<br />${esc(explainPyError(err, level.api))}${out}`);
      if (err.line) this.panel.highlightLine(err.line);
      sfx.wrong();
    } else {
      const s = sims[firstFail];
      const last = s.actions[s.actions.length - 1];
      this.lastRun = { result: 'fail', reason: s.reason, variant: firstFail + 1 };
      const where = last && last.line ? `（第 ${last.line} 行）` : '';
      this.panel.showResult('fail', `<b>✗ 没有通过</b>${n > 1 ? `（布局 ${firstFail + 1} / ${n}）` : ''}：${esc(s.reason)}${where}${out}`);
      if (last && last.line) this.panel.highlightLine(last.line);
      sfx.wrong();
    }
  }

  _wait(ms) {
    if (this.skipping) return Promise.resolve();
    return new Promise((r) => this.time.delayedCall(ms / this.speed, r));
  }

  _tween(cfg) {
    if (this.skipping) {
      // 跳过回放：直接落到终点（来回晃动的撞墙动画没有终点，原地不动）
      if (!cfg.yoyo) for (const k of ['x', 'y', 'alpha']) if (typeof cfg[k] === 'number') cfg.targets[k] = cfg[k];
      return Promise.resolve();
    }
    return new Promise((r) => this.tweens.add({ ...cfg, duration: cfg.duration / this.speed, onComplete: r }));
  }

  /** 逐帧回放一次模拟（frames 由 simulate 生成） */
  async replay(sim) {
    for (const f of sim.frames) {
      if (!this.panel) return;
      this.panel.highlightLine(f.line);
      const to = this._cellCenter(f.x, f.y);
      this.hero.setFlipX(f.facing === 'left');
      if (f.event === 'move' || f.event === 'jump') {
        this.hero.play('ts_warrior_run', true);
        if (f.event === 'jump' && !this.skipping) {
          const midY = Math.min(this.hero.y, to.y) - this.cell * 0.7;
          await this._tween({ targets: this.hero, x: (this.hero.x + to.x) / 2, y: midY, duration: STEP_MS * 0.6, ease: 'sine.out' });
          await this._tween({ targets: this.hero, x: to.x, y: to.y, duration: STEP_MS * 0.6, ease: 'sine.in' });
        } else {
          await this._tween({ targets: this.hero, x: to.x, y: to.y, duration: STEP_MS });
        }
        this.hero.setPosition(to.x, to.y);
        this.hero.play('ts_warrior_idle', true);
        if (f.pickup) this._pickup(f.pickup);
      } else if (f.event === 'attack') {
        this.hero.play('ts_warrior_attack', true);
        sfx.swing();
        if (f.hit) {
          const m = this.items[`${f.hit.x},${f.hit.y}`];
          if (m) await this._tween({ targets: m, alpha: 0, duration: STEP_MS });
          if (m) m.setVisible(false);
          sfx.enemyDie();
        } else {
          await this._wait(STEP_MS);
        }
        this.hero.play('ts_warrior_idle', true);
      } else if (f.event === 'bump' || f.event === 'fall') {
        const tx = f.tx !== undefined ? this._cellCenter(f.tx, f.ty) : to;
        await this._tween({ targets: this.hero, x: (this.hero.x * 2 + tx.x) / 3, y: (this.hero.y * 2 + tx.y) / 3, duration: STEP_MS * 0.5, yoyo: f.event === 'bump' });
        if (f.event === 'fall') await this._tween({ targets: this.hero, x: tx.x, y: tx.y, alpha: 0.3, duration: STEP_MS * 0.6 });
      } else if (f.event === 'locked') {
        this._float(f.x, f.y, '传送门还没亮', '#9fb8ff');
      } else if (f.event === 'fail' || f.event === 'limit') {
        this.hero.setTint(0xff8a8a);
        if (!reduced() && !this.skipping) this.cameras.main.shake(220, 0.006);
        this._float(f.x, f.y, f.reason, '#ff9db3');
        sfx.hurt();
        await this._wait(STEP_MS * 2);
      } else if (f.event === 'win') {
        if (this.exitSprite) this.exitSprite.setAlpha(1);
        sfx.openGate();
        await this._wait(STEP_MS);
      }
    }
  }

  _pickup({ x, y }) {
    const s = this.items[`${x},${y}`];
    if (s) {
      this.tweens.killTweensOf(s);
      s.setVisible(false);
    }
    sfx.pickup();
    const shardsLeft = Object.entries(this.items).filter(([, it]) => it.texture && it.texture.key === 'shard' && it.visible).length;
    if (this.exitSprite && shardsLeft === 0) this.exitSprite.setAlpha(1);
  }

  _float(x, y, text, color) {
    const p = this._cellCenter(x, y);
    const t = this.add.text(p.x, p.y - this.cell * 1.2, text, {
      fontFamily: '"ZCOOL KuaiLe","PingFang SC",sans-serif', fontSize: '38px', color,
      stroke: '#3f2631', strokeThickness: 8, align: 'center', wordWrap: { width: AREA.w - 40 },
    }).setOrigin(0.5);
    this.room.add(t);
    if (!this.skipping) this.tweens.add({ targets: t, y: t.y - 60, alpha: 0, delay: 900, duration: 900, onComplete: () => t.destroy() });
  }

  _celebrate() {
    if (reduced()) return;
    const p = this.hero;
    for (let i = 0; i < 18; i++) {
      const s = this.add.image(p.x, p.y - this.cell * 0.6, 'particle').setTint(0xffd257).setScale(8).setDepth(10);
      this.room.add(s);
      this.tweens.add({
        targets: s,
        x: p.x + Phaser.Math.Between(-260, 260), y: p.y - Phaser.Math.Between(120, 420),
        alpha: 0, duration: 800, onComplete: () => s.destroy(),
      });
    }
  }
}
