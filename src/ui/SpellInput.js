// ============================================================
// 咒语输入行：第三章各小游戏共用的「写一行 NumPy」组件（纯 DOM）
// - 输入时在作用域副本上实时执行（core/npmini.js），显示结果 / 报错，并回调 onPreview 让小游戏高亮选区
// - Enter / 「施放」按钮回调 onCast（小游戏在真作用域上执行并结算）
// - ↑ / ↓ 翻历史；快捷符号键（触屏 / 不熟悉键盘时用）在光标处插入
// - 按键隔离：输入框内的按键不冒泡到游戏（W/A/S/D/E/J/M/Tab 不触发移动 / 交互 / 地图），Esc 照常冒泡给面板关闭
// ============================================================
import { run, cloneScope, strValue, NONE } from '../core/npmini.js';

const DEFAULT_CHIPS = ['[', ']', ':', ',', '-', '>', '<', '==', '&', '(', ')', '=', 'np.'];

export class SpellInput {
  /**
   * @param {HTMLElement} root 挂载点
   * @param {object} opts
   * @param {() => object} opts.scope 返回当前真实作用域（预览时会被深拷贝）
   * @param {(res: object|null, src: string, scope: object) => void} [opts.onPreview]
   * @param {(src: string) => void} opts.onCast
   * @param {Array<string|{label: string, text: string}>} [opts.chips]
   * @param {string} [opts.placeholder]
   * @param {string} [opts.castLabel]
   * @param {(res: object, scope: object) => (string|null)} [opts.describe] 接管成功结果的显示文字（返回 null 用默认显示）
   * @param {string} [opts.idleText] 输入为空时输出区的说明
   */
  constructor(root, opts) {
    this.opts = opts;
    this.history = [];
    this.hIdx = -1;
    this._timer = 0;
    this.root = root;
    root.classList.add('sp-wrap');
    root.innerHTML = `
      <div class="sp-line">
        <span class="sp-prompt" aria-hidden="true">&gt;&gt;&gt;</span>
        <input class="sp-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off"
          aria-label="NumPy 咒语" />
        <button class="btn primary sp-cast" type="button"></button>
      </div>
      <div class="sp-chips" role="toolbar" aria-label="快捷符号"></div>
      <pre class="sp-out" aria-live="polite"></pre>`;
    this.input = root.querySelector('.sp-input');
    this.castBtn = root.querySelector('.sp-cast');
    this.out = root.querySelector('.sp-out');
    this.input.placeholder = opts.placeholder || '在这里写一行 NumPy，回车施放';
    this.castBtn.textContent = opts.castLabel || '施放 ⏎';
    const chips = root.querySelector('.sp-chips');
    (opts.chips || DEFAULT_CHIPS).forEach((c) => {
      const label = typeof c === 'string' ? c : c.label;
      const text = typeof c === 'string' ? c : c.text;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-chip';
      b.textContent = label;
      // pointerdown 不抢焦点：插入后光标留在输入框里
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.insert(text); });
      b.addEventListener('click', (e) => e.preventDefault());
      chips.appendChild(b);
    });
    if (!chips.children.length) chips.hidden = true;

    this.input.addEventListener('input', () => this.schedulePreview());
    this.input.addEventListener('keydown', (e) => this._onKey(e));
    this.input.addEventListener('keyup', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    this.input.addEventListener('keypress', (e) => e.stopPropagation());
    this.castBtn.addEventListener('click', () => this.cast());
  }

  get value() { return this.input.value; }
  setValue(s, { preview = true } = {}) {
    this.input.value = s;
    if (preview) this.preview();
  }
  focus() { this.input.focus({ preventScroll: true }); }
  disable(on) {
    this.input.disabled = on;
    this.castBtn.disabled = on;
  }

  insert(text) {
    const el = this.input;
    const a = el.selectionStart ?? el.value.length;
    const b = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, a) + text + el.value.slice(b);
    const caret = a + text.length;
    el.setSelectionRange(caret, caret);
    el.focus({ preventScroll: true });
    this.schedulePreview();
  }

  _onKey(e) {
    if (e.key === 'Escape') return; // 交给面板关闭
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); this.cast(); return; }
    if (e.key === 'Tab') { e.preventDefault(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!this.history.length) return;
      e.preventDefault();
      if (e.key === 'ArrowUp') this.hIdx = this.hIdx < 0 ? this.history.length - 1 : Math.max(0, this.hIdx - 1);
      else this.hIdx = this.hIdx < 0 ? -1 : this.hIdx + 1;
      if (this.hIdx >= this.history.length) this.hIdx = -1;
      this.setValue(this.hIdx < 0 ? '' : this.history[this.hIdx]);
    }
  }

  schedulePreview() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.preview(), 90);
  }

  /** 在作用域副本上试跑当前输入，显示结果并回调 onPreview */
  preview() {
    clearTimeout(this._timer);
    const src = this.input.value;
    if (!src.trim()) {
      this.showIdle();
      if (this.opts.onPreview) this.opts.onPreview(null, src, null);
      return null;
    }
    const scope = cloneScope(this.opts.scope());
    const res = run(src, scope);
    this.showResult(res, scope, { live: true });
    if (this.opts.onPreview) this.opts.onPreview(res, src, scope);
    return res;
  }

  cast() {
    clearTimeout(this._timer);
    const src = this.input.value;
    if (!src.trim()) { this.flash(); return; }
    if (this.history[this.history.length - 1] !== src) this.history.push(src);
    this.hIdx = -1;
    this.opts.onCast(src);
  }

  showIdle() {
    this.out.className = 'sp-out idle';
    this.out.textContent = this.opts.idleText || '（输入时这里实时显示结果）';
  }

  /** 把一次执行结果写进输出区：报错（类型 + 原文 + 中文解释）/ print 输出 / 表达式的值 / 被赋值变量的新值 */
  showResult(res, scope, { live = false } = {}) {
    const out = this.out;
    out.textContent = '';
    out.className = `sp-out${live ? ' live' : ''}`;
    if (!res) { this.showIdle(); return; }
    const add = (text, cls) => {
      const s = document.createElement('span');
      if (cls) s.className = cls;
      s.textContent = text;
      out.appendChild(s);
    };
    res.output.forEach((line) => add(`${line}\n`, 'sp-print'));
    if (!res.ok) {
      out.classList.add('err');
      add(`${res.error.type}`, 'sp-etype');
      add(`: ${res.error.message}\n`, 'sp-emsg');
      if (res.error.hint) add(`💡 ${res.error.hint}`, 'sp-ehint');
      return;
    }
    // 小游戏可以接管成功结果的显示（例如 100 个点的曲线只显示形状与读数）
    const custom = this.opts.describe ? this.opts.describe(res, scope) : null;
    if (typeof custom === 'string') { add(custom, 'sp-val'); return; }
    if (res.value !== NONE) {
      add(strValue(res.value), 'sp-val');
      return;
    }
    const names = [...new Set(res.usage.assigns.map((a) => a.name).filter(Boolean))];
    if (names.length && scope) {
      names.forEach((n, i) => {
        if (scope[n] === undefined) return;
        add(`${i ? '\n' : ''}${n} →\n`, 'sp-name');
        add(strValue(scope[n]), 'sp-val');
      });
      return;
    }
    if (!res.output.length) add('（这句咒语没有返回值）', 'sp-dim');
  }

  /** 输出区直接显示一段说明（小游戏的判定反馈） */
  showMessage(text, cls = '') {
    this.out.className = `sp-out msg ${cls}`.trim();
    this.out.textContent = text;
  }

  flash() {
    this.root.classList.remove('shake');
    void this.root.offsetWidth;
    this.root.classList.add('shake');
  }

  destroy() {
    clearTimeout(this._timer);
    this.root.innerHTML = '';
    this.root.classList.remove('sp-wrap');
  }
}

/**
 * 「可用变量」面板：把作用域里的数组按 print 的样子列出来（name = …）。
 * names 缺省列出全部 ndarray / 标量。返回刷新函数。
 */
export function renderVars(el, scope, names = null) {
  el.classList.add('sp-vars');
  const list = names || Object.keys(scope);
  el.innerHTML = '';
  for (const n of list) {
    const v = scope[n];
    if (v === undefined) continue;
    const row = document.createElement('div');
    row.className = 'sp-var';
    const k = document.createElement('code');
    k.className = 'sp-var-name';
    k.textContent = n;
    const val = document.createElement('pre');
    val.className = 'sp-var-val';
    val.textContent = strValue(v);
    row.append(k, val);
    el.appendChild(row);
  }
}
