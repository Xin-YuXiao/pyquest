// ============================================================
// 代码训练场面板（纯 DOM，挂在 #ui-scale 设计坐标系 960×640 的右半边）
// 左半边是 Phaser 画的关卡房间（scenes/DojoScene.js），这里负责：
//   关卡页签（逐关解锁）· 目标 / 可用 API · 代码编辑器（行号、Tab 缩进、自动缩进、
//   回放时高亮当前行）· 运行 / 重置 / 提示 / 倍速 / 跳过 · 运行状态与结果输出。
// 编辑器聚焦时 Phaser 的全局按键捕获已由场景关掉（disableGlobalCapture），
// 这里再拦住按键冒泡，免得 WASD / E / J / 1-4 / Enter 被其他面板的快捷键误用。
// ============================================================
import './dojo.css';
import { DOJO_API_DOCS } from '../data/dojoLevels.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LINE_H = 19; // 编辑器行高（与 dojo.css 的 --dojo-line 一致）
const PAD = 8;     // 编辑器上内边距

export class DojoPanel {
  /**
   * @param {object} h 回调：onRun / onReset / onHint / onSelect(id) / onExit / onSpeed / onSkip / onNext
   */
  constructor(h) {
    this.h = h;
    this.root = document.createElement('div');
    this.root.id = 'dojo-panel';
    this.root.className = 'dojo-panel';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', '代码训练场');
    this.root.innerHTML = `
      <div class="dojo-head">
        <span class="dojo-badge">代码训练场</span>
        <h2 class="dojo-title" id="dojo-title"></h2>
        <button class="btn dojo-exit" id="dojo-exit" type="button">返回森林</button>
      </div>
      <div class="dojo-levels" id="dojo-levels"></div>
      <p class="dojo-blurb" id="dojo-blurb"></p>
      <p class="dojo-goal" id="dojo-goal"></p>
      <div class="dojo-api" id="dojo-api"></div>
      <div class="dojo-editor" id="dojo-editor">
        <pre class="dojo-gutter" id="dojo-gutter" aria-hidden="true"></pre>
        <div class="dojo-hl" id="dojo-hl" aria-hidden="true"></div>
        <textarea class="dojo-code" id="dojo-code" spellcheck="false" autocapitalize="off"
          autocomplete="off" autocorrect="off" wrap="off" aria-label="Python 代码编辑器"></textarea>
      </div>
      <div class="dojo-actions">
        <button class="btn primary" id="dojo-run" type="button" title="Ctrl + Enter">▶ 运行</button>
        <button class="btn" id="dojo-reset" type="button">重置代码</button>
        <button class="btn" id="dojo-hint" type="button">提示</button>
        <button class="btn" id="dojo-speed" type="button" hidden>⏩ 1×</button>
        <button class="btn" id="dojo-skip" type="button" hidden>⏭ 跳过回放</button>
        <button class="btn primary" id="dojo-next" type="button" hidden>下一关 ▶</button>
      </div>
      <div class="dojo-runtime" id="dojo-runtime" role="status" aria-live="polite"></div>
      <div class="dojo-out" id="dojo-out" role="status" aria-live="polite"></div>
      <div class="dojo-best" id="dojo-best"></div>`;
    (document.getElementById('ui-scale') || document.body).appendChild(this.root);

    const $ = (id) => this.root.querySelector(`#${id}`);
    this.titleEl = $('dojo-title');
    this.levelsEl = $('dojo-levels');
    this.blurbEl = $('dojo-blurb');
    this.goalEl = $('dojo-goal');
    this.apiEl = $('dojo-api');
    this.code = $('dojo-code');
    this.gutter = $('dojo-gutter');
    this.hl = $('dojo-hl');
    this.runBtn = $('dojo-run');
    this.resetBtn = $('dojo-reset');
    this.hintBtn = $('dojo-hint');
    this.speedBtn = $('dojo-speed');
    this.skipBtn = $('dojo-skip');
    this.nextBtn = $('dojo-next');
    this.runtimeEl = $('dojo-runtime');
    this.outEl = $('dojo-out');
    this.bestEl = $('dojo-best');

    this.runBtn.addEventListener('click', () => h.onRun());
    this.resetBtn.addEventListener('click', () => h.onReset());
    this.hintBtn.addEventListener('click', () => h.onHint());
    this.speedBtn.addEventListener('click', () => h.onSpeed());
    this.skipBtn.addEventListener('click', () => h.onSkip());
    this.nextBtn.addEventListener('click', () => h.onNext());
    $('dojo-exit').addEventListener('click', () => h.onExit());
    this.levelsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (b && !b.disabled) h.onSelect(Number(b.dataset.id));
    });

    this.code.addEventListener('input', () => this._syncGutter());
    this.code.addEventListener('scroll', () => this._syncScroll());
    this.code.addEventListener('keydown', (e) => this._onKey(e));
    // 编辑器里的按键一律不往外冒泡（WASD / E / J / 1-4 / Enter 都是别处的快捷键）
    this.code.addEventListener('keyup', (e) => e.stopPropagation());
    this.code.addEventListener('keypress', (e) => e.stopPropagation());
    this._hlLine = 0;
  }

  // ---------- 关卡 ----------

  /** levels: [{ id, concept, unlocked, cleared }]，level: 当前关卡对象 */
  showLevel(level, levels, code) {
    this.titleEl.textContent = `第 ${level.id} 关 · ${level.title}`;
    this.renderTabs(levels, level.id);
    this.blurbEl.textContent = level.blurb;
    this.goalEl.innerHTML = `<span class="dojo-goal-tag">目标</span>${esc(level.goal)}`;
    this.apiEl.innerHTML = level.api.map((n) => `<code title="${esc(DOJO_API_DOCS[n])}">${n}()</code>`).join('')
      + `<span class="dojo-api-doc">${esc(DOJO_API_DOCS[level.api[level.api.length - 1]])}</span>`;
    this.setCode(code);
    this.clearOutput();
    this.nextBtn.hidden = true;
  }

  /** 只重画关卡页签（通关后刷新解锁状态，不动编辑器与输出） */
  renderTabs(levels, currentId) {
    this.levelsEl.innerHTML = levels.map((l) => `
      <button type="button" data-id="${l.id}" class="dojo-tab${l.id === currentId ? ' on' : ''}${l.cleared ? ' done' : ''}"
        ${l.unlocked ? '' : 'disabled'} aria-label="第 ${l.id} 关 ${esc(l.concept)}${l.cleared ? '（已通关）' : l.unlocked ? '' : '（未解锁）'}">
        <b>${l.id}</b><span>${esc(l.concept)}</span>${l.cleared ? '<i>✓</i>' : l.unlocked ? '' : '<i>🔒</i>'}
      </button>`).join('');
  }

  setBest(html) { this.bestEl.innerHTML = html || ''; }

  // ---------- 编辑器 ----------

  getCode() { return this.code.value; }

  setCode(code) {
    this.code.value = code;
    this.code.scrollTop = 0;
    this._syncGutter();
    this.highlightLine(0);
  }

  focusEditor() { this.code.focus({ preventScroll: true }); }

  _syncGutter() {
    const n = this.code.value.split('\n').length;
    this.gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
    this._syncScroll();
  }

  _syncScroll() {
    this.gutter.scrollTop = this.code.scrollTop;
    this._placeHighlight();
  }

  /** 回放时高亮正在执行的行（0 = 取消高亮） */
  highlightLine(n) {
    this._hlLine = n;
    this._placeHighlight();
  }

  _placeHighlight() {
    if (!this._hlLine) { this.hl.style.display = 'none'; return; }
    this.hl.style.display = 'block';
    this.hl.style.top = `${PAD + (this._hlLine - 1) * LINE_H - this.code.scrollTop}px`;
  }

  _onKey(e) {
    e.stopPropagation();
    const ta = this.code;
    const { selectionStart: a, selectionEnd: b, value: v } = ta;
    const lineStart = v.lastIndexOf('\n', a - 1) + 1;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.h.onRun();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      this._replace(a, b, '    ');
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const lead = /^ {1,4}/.exec(v.slice(lineStart))?.[0] || '';
      if (lead) {
        ta.value = v.slice(0, lineStart) + v.slice(lineStart + lead.length);
        const p = Math.max(lineStart, a - lead.length);
        ta.setSelectionRange(p, p);
        this._syncGutter();
      }
    } else if (e.key === 'Enter' && !e.isComposing) {
      // 自动缩进：保持上一行的缩进，行尾是冒号再多缩 4 格
      e.preventDefault();
      const line = v.slice(lineStart, a);
      let indent = /^ */.exec(line)[0];
      if (/:\s*(#.*)?$/.test(line)) indent += '    ';
      this._replace(a, b, `\n${indent}`);
    } else if (e.key === 'Escape') {
      ta.blur();
    }
  }

  _replace(a, b, text) {
    const ta = this.code;
    ta.value = ta.value.slice(0, a) + text + ta.value.slice(b);
    ta.setSelectionRange(a + text.length, a + text.length);
    this._syncGutter();
  }

  // ---------- 状态 / 输出 ----------

  /** busy: false | 'running' | 'replaying' */
  setBusy(busy) {
    this.runBtn.disabled = !!busy;
    this.resetBtn.disabled = !!busy;
    this.hintBtn.disabled = !!busy;
    this.code.readOnly = !!busy;
    this.levelsEl.querySelectorAll('button').forEach((btn) => { btn.classList.toggle('busy', !!busy); });
    this.speedBtn.hidden = busy !== 'replaying';
    this.skipBtn.hidden = busy !== 'replaying';
    this.root.classList.toggle('busy', !!busy);
  }

  setSpeed(x) { this.speedBtn.textContent = `⏩ ${x}×`; }

  /** Python 运行时状态：加载进度 / 出错可重试 */
  setRuntime(info) {
    const el = this.runtimeEl;
    el.className = `dojo-runtime ${info.state}`;
    if (info.state === 'loading') {
      el.innerHTML = `<span class="dojo-spin"></span>${esc(info.stage || '正在启动 Python……')}`;
    } else if (info.state === 'error') {
      el.innerHTML = `Python 运行环境加载失败（${esc(info.error)}）。检查网络后点「▶ 运行」重试。`;
    } else if (info.state === 'ready' || info.state === 'running') {
      el.textContent = info.version ? `Python ${info.pyVersion} · Pyodide ${info.version} 已就绪` : '';
    } else {
      el.textContent = '';
    }
  }

  clearOutput() {
    this.outEl.innerHTML = '';
    this.outEl.className = 'dojo-out';
  }

  /** kind: win | fail | error | timeout | info；html 已转义 */
  showResult(kind, html) {
    this.outEl.className = `dojo-out ${kind}`;
    this.outEl.innerHTML = html;
  }

  appendOutput(html) { this.outEl.insertAdjacentHTML('beforeend', html); }

  showNext(on) { this.nextBtn.hidden = !on; }

  destroy() { this.root.remove(); }
}

export { esc };
