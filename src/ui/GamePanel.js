// ============================================================
// 小游戏面板外壳：第三章试炼场（阵列牌局 / 星图拼绘 / 外星信号 / 曲线对消）的统一 DOM 覆盖层
// 打开时暂停游戏世界、关掉 Phaser 的全局按键捕获（输入框才能正常打字），关闭时恢复。
// 外壳负责：标题与借鉴说明、关卡条（✓ 已通过 / 🔒 未解锁 / ★ 挑战关）、分级提示（概念 → 关键 → 参考解）、
//           通关浮层（成绩 / 奖励 / 下一关）；玩法本身由 src/games/<id>/game.js 的 mount(ctx) 接管 body。
//
// mount(ctx) 的 ctx：
//   root           本关的玩法区（空 div，小游戏自己填）
//   meta / level / levelIndex   登记表信息与当前关卡数据
//   data()         小游戏的持久数据（G.games[id].data 的副本）；saveData(obj) 写回并存档
//   win({ score, summary })     判定过关：score 越小越好（施法次数等，可空），summary 一句成绩说明
//   status(text, cls)           底部状态行（cls：ok / bad / '' ）
//   setKeys(html)               底部操作说明
//   sfx                         音效
// 返回控制器 { destroy(), snapshot(), onKey?(e) → 已处理返回 true }
// ============================================================
import './games.css';
import { G } from '../core/state.js';
import { getGame } from '../games/registry.js';
import { levelDone, levelUnlocked, gameState, gameData, setGameData } from '../core/games.js';
import { saveGame } from '../core/save.js';
import { sfx } from '../audio/sfx.js';
import { music } from '../audio/music.js';
import * as cards from '../games/cards/game.js';
import * as picross from '../games/picross/game.js';
import * as signal from '../games/signal/game.js';
import * as curve from '../games/curve/game.js';

const MODULES = { cards, picross, signal, curve };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class GamePanel {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.ctrl = null;
    this.root = document.createElement('div');
    this.root.className = 'gp-backdrop';
    this.root.innerHTML = `
      <div class="gp-panel" role="dialog" aria-modal="true" aria-labelledby="gp-title" tabindex="-1">
        <div class="gp-head">
          <span class="gp-badge" id="gp-badge"></span>
          <div class="gp-titles">
            <h2 class="gp-title" id="gp-title"></h2>
            <div class="gp-sub" id="gp-sub"></div>
          </div>
          <div class="gp-levels" id="gp-levels" role="tablist" aria-label="关卡"></div>
          <button class="gp-x" id="gp-x" type="button" aria-label="离开">✕</button>
        </div>
        <div class="gp-level-head">
          <span class="gp-level-name" id="gp-level-name"></span>
          <span class="gp-level-concept" id="gp-level-concept"></span>
        </div>
        <div class="gp-story" id="gp-story"></div>
        <div class="gp-body" id="gp-body"></div>
        <div class="gp-hint" id="gp-hint" hidden></div>
        <div class="gp-foot">
          <span class="gp-status" id="gp-status" role="status" aria-live="polite"></span>
          <span class="gp-keys" id="gp-keys"></span>
          <span class="gp-actions">
            <button class="btn" id="gp-hint-btn" type="button">💡 提示</button>
            <button class="btn" id="gp-close" type="button">离开</button>
          </span>
        </div>
        <div class="gp-win" id="gp-win" hidden>
          <div class="gp-win-card">
            <div class="gp-win-title" id="gp-win-title">✓ 关卡完成</div>
            <div class="gp-win-summary" id="gp-win-summary"></div>
            <ul class="gp-win-rewards" id="gp-win-rewards"></ul>
            <div class="gp-win-actions">
              <button class="btn" id="gp-retry" type="button">再玩一次</button>
              <button class="btn primary" id="gp-next" type="button">下一关 ▶</button>
            </div>
          </div>
        </div>
      </div>`;
    (document.getElementById('ui-scale') || document.body).appendChild(this.root);
    const $ = (id) => this.root.querySelector(`#${id}`);
    this.el = {
      panel: this.root.querySelector('.gp-panel'), badge: $('gp-badge'), title: $('gp-title'), sub: $('gp-sub'),
      levels: $('gp-levels'), levelName: $('gp-level-name'), concept: $('gp-level-concept'), story: $('gp-story'),
      body: $('gp-body'), hint: $('gp-hint'), status: $('gp-status'), keys: $('gp-keys'), hintBtn: $('gp-hint-btn'),
      win: $('gp-win'), winTitle: $('gp-win-title'), winSummary: $('gp-win-summary'), winRewards: $('gp-win-rewards'),
      next: $('gp-next'), retry: $('gp-retry'),
    };
    $('gp-x').addEventListener('click', () => this.close());
    $('gp-close').addEventListener('click', () => this.close());
    this.el.hintBtn.addEventListener('click', () => this.nextHint());
    this.el.next.addEventListener('click', () => this.goNext());
    this.el.retry.addEventListener('click', () => this.loadLevel(this.levelId));
    this._key = (e) => this._onKey(e);
    document.addEventListener('keydown', this._key);
  }

  /** open(gameId, { levelId, onWin(levelId, result) → { lines: string[] }, onClose }) */
  open(gameId, { levelId = null, onWin = null, onClose = null } = {}) {
    const meta = getGame(gameId);
    if (!meta || this.isOpen || !MODULES[gameId]) return false;
    this.meta = meta;
    this.gameId = gameId;
    this.onWin = onWin;
    this.onClose = onClose;
    this.isOpen = true;
    this._prevFocus = document.activeElement;
    this.scene.scene.pause();
    this.scene.input.keyboard.disableGlobalCapture();
    music.duck(true);
    this.el.badge.textContent = meta.badge;
    this.el.title.textContent = meta.title;
    this.el.sub.textContent = `${meta.inspired} · ${meta.concept}`;
    this.root.classList.add('show');
    sfx.talk();
    const first = levelId && levelUnlocked(G, gameId, levelId) ? levelId : this.defaultLevel();
    this.loadLevel(first);
    return true;
  }

  defaultLevel() {
    const lv = this.meta.levels;
    const open = lv.find((l) => !levelDone(G, this.gameId, l.id) && levelUnlocked(G, this.gameId, l.id));
    return (open || lv[0]).id;
  }

  renderLevelStrip() {
    const strip = this.el.levels;
    strip.innerHTML = '';
    this.meta.levels.forEach((l, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gp-lv';
      b.setAttribute('role', 'tab');
      const done = levelDone(G, this.gameId, l.id);
      const unlocked = levelUnlocked(G, this.gameId, l.id);
      if (done) b.classList.add('done');
      if (!unlocked) b.classList.add('locked');
      if (l.challenge) b.classList.add('challenge');
      if (l.id === this.levelId) { b.classList.add('cur'); b.setAttribute('aria-selected', 'true'); }
      b.textContent = l.challenge ? '★' : String(i + 1);
      b.title = `${l.title}${done ? '（已通过）' : unlocked ? '' : '（未解锁）'}`;
      b.disabled = !unlocked;
      b.addEventListener('click', () => { if (unlocked) this.loadLevel(l.id); });
      strip.appendChild(b);
    });
  }

  loadLevel(levelId) {
    if (this.ctrl) { this.ctrl.destroy(); this.ctrl = null; }
    const idx = this.meta.levels.findIndex((l) => l.id === levelId);
    const level = this.meta.levels[idx];
    this.levelId = levelId;
    this.level = level;
    this.won = false;
    this.hintStep = 0;
    this.el.win.hidden = true;
    this.el.hint.hidden = true;
    this.el.hint.innerHTML = '';
    this.el.panel.classList.remove('won');
    this.el.levelName.textContent = `${level.challenge ? '★ 挑战' : `第 ${idx + 1} 关`} · ${level.title}`;
    this.el.concept.textContent = level.concept || '';
    this.el.story.innerHTML = level.story ? esc(level.story).replace(/`([^`]+)`/g, '<code>$1</code>') : '';
    this.el.story.hidden = !level.story;
    this.el.status.textContent = '';
    this.el.status.className = 'gp-status';
    this.el.keys.innerHTML = '';
    const hints = this.hints();
    this.el.hintBtn.hidden = !hints.length;
    this.el.hintBtn.textContent = '💡 提示';
    this.renderLevelStrip();
    this.el.body.innerHTML = '';
    const body = document.createElement('div');
    body.className = `gp-game gp-game-${this.gameId}`;
    this.el.body.appendChild(body);
    const ctx = {
      root: body,
      meta: this.meta,
      level,
      levelIndex: idx,
      data: () => JSON.parse(JSON.stringify(gameData(G, this.gameId))),
      saveData: (obj) => { setGameData(G, this.gameId, obj); saveGame(); },
      win: (result = {}) => this.win(result),
      status: (text, cls = '') => {
        this.el.status.textContent = text;
        this.el.status.className = `gp-status ${cls}`.trim();
      },
      setKeys: (html) => { this.el.keys.innerHTML = html; },
      sfx,
      bestScore: () => {
        const rec = gameState(G, this.gameId).levels[levelId];
        return rec ? rec.best : null;
      },
    };
    this.ctrl = MODULES[this.gameId].mount(ctx);
    const focusable = body.querySelector('input.sp-input, input, button');
    (focusable || this.el.panel).focus({ preventScroll: true });
  }

  /** 分级提示：关卡数据的 hints[] 逐条揭示，最后一条是参考解 */
  hints() {
    const lv = this.level;
    const out = [...(lv.hints || [])];
    if (lv.solution) out.push(`参考解：\`${lv.solution}\``);
    return out;
  }

  nextHint() {
    const hints = this.hints();
    if (!hints.length) return;
    this.hintStep = Math.min(hints.length, this.hintStep + 1);
    this.el.hint.hidden = false;
    this.el.hint.innerHTML = hints.slice(0, this.hintStep)
      .map((h, i) => `<p><b>${i === hints.length - 1 && this.level.solution ? '参考解' : `提示 ${i + 1}`}</b> ${esc(h.replace(/^参考解：/, '')).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`)
      .join('');
    this.el.hintBtn.textContent = this.hintStep >= hints.length ? '💡 已全部显示' : `💡 下一条提示（${this.hintStep}/${hints.length}）`;
    if (this.ctrl && this.ctrl.onHint) this.ctrl.onHint(this.hintStep);
  }

  /** 小游戏判定过关：记录进度、发奖励（回调给场景）、显示通关浮层 */
  win(result = {}) {
    if (this.won || !this.isOpen) return;
    this.won = true;
    sfx.correct();
    this.el.panel.classList.add('won');
    const reward = this.onWin ? this.onWin(this.levelId, { ...result, hintsUsed: this.hintStep }) : { lines: [] };
    this.el.winTitle.textContent = this.level.challenge ? '★ 挑战完成！' : '✓ 关卡完成';
    this.el.winSummary.textContent = result.summary || '';
    this.el.winRewards.innerHTML = (reward.lines || []).map((l) => `<li>${esc(l)}</li>`).join('');
    const nxt = this.nextId();
    this.el.next.hidden = !nxt;
    this.el.next.textContent = nxt ? '下一关 ▶' : '';
    this.el.retry.textContent = '再玩一次';
    this.renderLevelStrip();
    setTimeout(() => {
      if (!this.won || !this.isOpen) return;
      this.el.win.hidden = false;
      (nxt ? this.el.next : this.el.retry).focus({ preventScroll: true });
    }, result.delay ?? 650);
  }

  nextId() {
    const lv = this.meta.levels;
    const i = lv.findIndex((l) => l.id === this.levelId);
    for (let k = i + 1; k < lv.length; k++) if (levelUnlocked(G, this.gameId, lv[k].id)) return lv[k].id;
    return null;
  }

  goNext() {
    const n = this.nextId();
    if (n) this.loadLevel(n);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.ctrl) { this.ctrl.destroy(); this.ctrl = null; }
    this.root.classList.remove('show');
    this.scene.input.keyboard.enableGlobalCapture();
    this.scene.scene.resume();
    music.duck(false);
    if (this._prevFocus && this._prevFocus.isConnected && this._prevFocus.focus) this._prevFocus.focus({ preventScroll: true });
    const cb = this.onClose;
    this.onClose = null;
    if (cb) cb();
  }

  _onKey(e) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if (!this.el.win.hidden && e.key === 'Enter') { e.preventDefault(); if (this.nextId()) this.goNext(); else this.loadLevel(this.levelId); return; }
    if (e.key === 'Tab') { e.preventDefault(); return; } // 挡住世界地图
    if (this.ctrl && this.ctrl.onKey && this.ctrl.onKey(e)) e.preventDefault();
  }

  snapshot() {
    return {
      isOpen: this.isOpen,
      gameId: this.isOpen ? this.gameId : null,
      levelId: this.isOpen ? this.levelId : null,
      won: !!this.won,
      winShown: !this.el.win.hidden,
      hintStep: this.hintStep || 0,
      game: this.isOpen && this.ctrl && this.ctrl.snapshot ? this.ctrl.snapshot() : null,
    };
  }

  destroy() {
    if (this.ctrl) this.ctrl.destroy();
    document.removeEventListener('keydown', this._key);
    this.root.remove();
  }
}
