// ============================================================
// 秘藏卷轴：触碰秘藏石碑后弹出的 REPL 卷轴（纯 DOM，暂停游戏世界）
// - 展示 >>> 输入 / 输出（内容来自 data/secrets.js，已由 verify-secrets 实跑核实）
// - E / Enter / 空格 / Esc / 点击按钮 关闭；关闭后短暂冷却，防止同一次按键
//   在场景恢复后又被 Phaser 读到、立刻再次触碰石碑
// - DOM 由本模块动态创建并挂到 #ui-scale（随设计坐标系缩放），样式见 secrets.css
// ============================================================
import './secrets.css';
import { sfx } from '../audio/sfx.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** REPL 记录 → HTML：输入首行 >>>、续行 ...；输出整段（异常行标红） */
export function renderRepl(repl) {
  return repl.map(({ in: src, out }) => {
    const input = src.split('\n')
      .map((l, i) => `<span class="ps">${i ? '...' : '&gt;&gt;&gt;'}</span> ${esc(l)}`)
      .join('\n');
    if (!out) return input;
    const err = /^[A-Za-z]+(Error|Interrupt): /.test(out) || out === 'KeyboardInterrupt';
    return `${input}\n<span class="out${err ? ' err' : ''}">${esc(out)}</span>`;
  }).join('\n');
}

const CLOSE_COOLDOWN_MS = 350;

export class SecretScroll {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.cooldownUntil = 0;
    this.onClose = null;

    let el = document.getElementById('secret-backdrop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'secret-backdrop';
      el.innerHTML = `
        <div id="secret-scroll" role="dialog" aria-modal="true" aria-labelledby="secret-name">
          <div class="secret-head">
            <span class="secret-tag">秘藏</span>
            <span class="secret-name" id="secret-name"></span>
            <span class="secret-count" id="secret-count"></span>
          </div>
          <div class="code-block" id="secret-repl"></div>
          <div id="secret-lines"></div>
          <div class="secret-actions">
            <span class="secret-keys">按 <kbd>E</kbd> / <kbd>Enter</kbd> 收起</span>
            <button class="btn primary" id="secret-close">收起卷轴</button>
          </div>
        </div>`;
      (document.getElementById('ui-scale') || document.body).appendChild(el);
    }
    this.backdrop = el;
    this.nameEl = el.querySelector('#secret-name');
    this.countEl = el.querySelector('#secret-count');
    this.replEl = el.querySelector('#secret-repl');
    this.linesEl = el.querySelector('#secret-lines');
    this.closeBtn = el.querySelector('#secret-close');

    this._onClick = () => this.close();
    this.closeBtn.addEventListener('click', this._onClick);
    this._keyHandler = (e) => {
      if (!this.isOpen) return;
      if (['e', 'E', 'Enter', ' ', 'Escape'].includes(e.key)) {
        e.preventDefault();
        this.close();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  /** 冷却中（刚收起卷轴）不接受再次触碰 */
  get coolingDown() { return performance.now() < this.cooldownUntil; }

  open(secret, { isNew = false, found = 0, total = 0, onClose } = {}) {
    this.isOpen = true;
    this.onClose = onClose || null;
    this.nameEl.innerHTML = `${esc(secret.name)}${isNew ? '<span class="secret-new">新发现</span>' : ''}`;
    this.countEl.textContent = `秘藏 ${found} / ${total}`;
    this.replEl.innerHTML = renderRepl(secret.repl);
    this.linesEl.innerHTML = secret.lines.map((l) => `<p>${esc(l)}</p>`).join('');
    this.scene.scene.pause();
    this.backdrop.classList.add('show');
    sfx.talk();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.cooldownUntil = performance.now() + CLOSE_COOLDOWN_MS;
    this.backdrop.classList.remove('show');
    this.scene.scene.resume();
    if (this.onClose) { const cb = this.onClose; this.onClose = null; cb(); }
  }

  destroy() {
    document.removeEventListener('keydown', this._keyHandler);
    this.closeBtn.removeEventListener('click', this._onClick);
  }
}
