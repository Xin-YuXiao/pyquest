// ============================================================
// 观测站面板：野外「观测台」的可选小游戏覆盖层（纯 DOM，打开时暂停游戏世界）
// - nfw    NFW 拟合台：log-log 数据点 + 模型曲线，ρ₀ / Rₛ 两个对数滑块，χ²/dof 实时反馈
// - tuning 频率调谐台：时域波形 + 迷雾频谱，调谐滑块扫频，在尖峰上停留即锁定
// - 第二批观测台（蒙特卡洛 / 并行搬砖 / 引力沙盒 / 贝叶斯硬币 / 星系分类）各自是 ui/stations/ 下的
//   控制器（open / tick / key / snapshot / close），本面板只负责外壳、通用按键与完成回调
// 数学全部在 core/observatory.js（纯函数，smoke 校验）；这里只管交互与绘制。
// 键盘：↑/↓ 切换滑块 · ←/→ 微调（Shift 大步）· H 提示 · Esc 关闭 · Enter 完成后关闭。
// Phaser 对方向键做了 preventDefault，range 原生键盘调节失效，所以由本面板自己接管。
// DOM 在构造时动态挂到 #ui-scale（与答题面板同一设计坐标系），场景关闭时整体移除。
// ============================================================
import './observatory.css';
import {
  OBSERVATORIES, NFW, TUNING,
  makeNfwData, nfwDensity, nfwChi2, nfwChi2dof, fitGrade,
  makeTuningSignal, makeTuner, findPeaks, tuningGrid, readoutMagnitude, amplitudeOf,
} from '../core/observatory.js';
import { sfx } from '../audio/sfx.js';
import { STATIONS } from './stations/index.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LOG_R = [Math.log10(NFW.rMin), Math.log10(NFW.rMax)]; // x 轴（log r）
const NFW_BOX = { x0: 54, x1: 548, y0: 10, y1: 170 };       // 拟合图绘图区（viewBox 560×204）
const SPEC_BOX = { x0: 40, x1: 548, y0: 14, y1: 118 };      // 频谱图绘图区（viewBox 560×152）
const WAVE_BOX = { x0: 40, x1: 548, y0: 6, y1: 78 };        // 波形图绘图区（viewBox 560×88）
const AMP_MAX = 3.4;                                         // 频谱纵轴上限（最强尖峰振幅 3）

const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
const fmt = (v, digits = 3) => (Math.abs(v) >= 100 ? v.toFixed(1) : Number(v.toPrecision(digits)).toString());
const el = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

export class ObservatoryOverlay {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.kind = null;
    this._raf = 0;

    this.root = document.createElement('div');
    this.root.id = 'obs-backdrop';
    this.root.className = 'obs-backdrop';
    this.root.innerHTML = `
      <div class="obs-panel" id="obs-panel" role="dialog" aria-modal="true" aria-labelledby="obs-title" tabindex="-1">
        <div class="obs-head">
          <span class="obs-badge" id="obs-badge"></span>
          <h2 class="obs-title" id="obs-title"></h2>
        </div>
        <p class="obs-blurb" id="obs-blurb"></p>
        <div class="obs-body" id="obs-body"></div>
        <div class="obs-status" id="obs-status" role="status" aria-live="polite"></div>
        <div class="obs-foot">
          <span class="obs-keys" id="obs-keys"></span>
          <span class="obs-actions">
            <button class="btn" id="obs-hint-btn" type="button">提示</button>
            <button class="btn" id="obs-close" type="button">离开观测台</button>
          </span>
        </div>
      </div>`;
    (document.getElementById('ui-scale') || document.body).appendChild(this.root);
    this.panel = this.root.querySelector('#obs-panel');
    this.bodyEl = this.root.querySelector('#obs-body');
    this.statusEl = this.root.querySelector('#obs-status');
    this.hintBtn = this.root.querySelector('#obs-hint-btn');
    this.closeBtn = this.root.querySelector('#obs-close');
    this.closeBtn.addEventListener('click', () => this.close());
    this.hintBtn.addEventListener('click', () => this.toggleHint());

    this._keyHandler = (e) => this._onKey(e);
    document.addEventListener('keydown', this._keyHandler);
  }

  // ---------- 打开 / 关闭 ----------

  /** open('nfw' | 'tuning', { attempt, onSolved({ seconds, chi2dof? }), onClose }) */
  open(kind, { attempt = 0, onSolved, onClose } = {}) {
    const cfg = OBSERVATORIES[kind];
    if (!cfg || this.isOpen) return;
    this.isOpen = true;
    this.kind = kind;
    this.attempt = attempt;
    this.solved = false;
    this.hint = false;
    this.onSolved = onSolved || null;
    this.onClose = onClose || null;
    this.openedAt = performance.now();
    this._prevFocus = document.activeElement;

    this.scene.scene.pause();
    this.root.querySelector('#obs-badge').textContent = cfg.badge;
    this.root.querySelector('#obs-title').textContent = cfg.title;
    this.root.querySelector('#obs-blurb').textContent = cfg.blurb;
    this.closeBtn.textContent = '离开观测台';
    this.closeBtn.classList.remove('primary');
    this.panel.classList.remove('solved');
    this.statusEl.textContent = '';
    this.statusEl.className = 'obs-status';

    this.ctrl = null;
    if (kind === 'nfw') this._openNfw();
    else if (kind === 'tuning') this._openTuning();
    else this._openStation(kind);

    this.root.classList.add('show');
    sfx.talk();
    (this.root.querySelector('input[type="range"]') || this.panel).focus({ preventScroll: true });
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    cancelAnimationFrame(this._raf);
    if (this.ctrl && this.ctrl.close) this.ctrl.close();
    this.root.classList.remove('show');
    this.scene.scene.resume();
    if (this._prevFocus && this._prevFocus.isConnected && this._prevFocus.focus) this._prevFocus.focus({ preventScroll: true });
    const cb = this.onClose;
    this.onClose = null;
    if (cb) cb();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    document.removeEventListener('keydown', this._keyHandler);
    this.root.remove();
  }

  /** 测试接缝只读快照（seam.observatory()） */
  snapshot() {
    const base = { isOpen: this.isOpen, kind: this.kind, attempt: this.attempt, solved: !!this.solved };
    if (this.kind === 'nfw' && this.data) {
      base.nfw = {
        logRho0: this.params.logRho0, logRs: this.params.logRs,
        chi2dof: this.chi2dof, selected: this.sel, hint: this.hint,
        truth: { ...this.data.truth },
      };
    }
    if (this.ctrl) base.station = this.ctrl.snapshot();
    if (this.kind === 'tuning' && this.peaks) {
      base.tuning = {
        f: this.f, locked: [...this.locked], peaks: this.peaks.map((p) => p.f), visited: this.visited.size,
      };
    }
    return base;
  }

  // ---------- 键盘 ----------

  _onKey(e) {
    if (!this.isOpen) return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); this.close(); return; }
    if (k === 'Enter' && this.solved) { e.preventDefault(); this.close(); return; }
    if (k === 'Tab') { e.preventDefault(); return; } // 面板内无需 Tab 巡航；也挡住世界地图
    if (k === 'h' || k === 'H') { e.preventDefault(); this.toggleHint(); return; }
    if (this.ctrl) { if (this.ctrl.key(e)) e.preventDefault(); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      if (this.kind === 'nfw') this._select(this.sel === 0 ? 1 : 0);
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const dir = k === 'ArrowRight' ? 1 : -1;
      if (this.kind === 'nfw') {
        const key = this.sel === 0 ? 'logRho0' : 'logRs';
        this._setNfw(key, this.params[key] + dir * NFW.step * (e.shiftKey ? 5 : 1));
      } else {
        this._setTune(this.f + dir * TUNING.step * (e.shiftKey ? 10 : 1));
      }
    }
  }

  toggleHint() {
    if (!this.isOpen || this.hintBtn.hidden) return;
    this.hint = !this.hint;
    this.hintBtn.classList.toggle('on', this.hint);
    this.hintBtn.setAttribute('aria-pressed', String(this.hint));
    const h = this.root.querySelector('#obs-hint');
    if (h) h.hidden = !this.hint;
    if (this.kind === 'nfw') this._drawNfwModel();
    if (this.ctrl && this.ctrl.onHint) this.ctrl.onHint(this.hint);
  }

  // ---------- 每帧：停留判定 ----------

  _tick(now) {
    if (!this.isOpen) return;
    if (this.ctrl) this.ctrl.tick(now); // 控制器自己管完成后的动画（例如卫星继续绕行）
    else if (!this.solved) {
      if (this.kind === 'nfw') this._tickNfw(now);
      else this._tickTuning(now);
    }
    this._raf = requestAnimationFrame(this._tick);
  }

  _solve(result) {
    this.solved = true;
    this.panel.classList.add('solved');
    this.closeBtn.textContent = '完成';
    this.closeBtn.classList.add('primary');
    sfx.correct();
    const cb = this.onSolved;
    this.onSolved = null;
    if (cb) cb({ seconds: Math.round((performance.now() - this.openedAt) / 100) / 10, ...result });
  }

  _status(text, cls = '') {
    if (this.statusEl.textContent !== text) this.statusEl.textContent = text;
    this.statusEl.className = `obs-status ${cls}`.trim();
  }

  // ============================================================
  // 第二批观测台：交给 ui/stations/ 的控制器
  // ============================================================

  _openStation(kind) {
    this.ctrl = STATIONS[kind](this);
    this.hintBtn.hidden = !this.ctrl.hasHint;
    this.hintBtn.classList.remove('on');
    this.hintBtn.setAttribute('aria-pressed', 'false');
    this.root.querySelector('#obs-keys').innerHTML = this.ctrl.keys;
    this.ctrl.open();
  }

  // ============================================================
  // NFW 拟合台
  // ============================================================

  _openNfw() {
    this.data = makeNfwData(this.attempt);
    this.params = { logRho0: NFW.logRho0.start, logRs: NFW.logRs.start };
    this.sel = 0;
    this.passSince = null;
    // 纵轴范围按数据定（整数个数量级，打开后不随拖动跳变）
    const logs = this.data.points.map((p) => Math.log10(p.rho));
    this.logRho = [Math.floor(Math.min(...logs) - 0.4), Math.ceil(Math.max(...logs) + 0.4)];
    this.hintBtn.hidden = false;
    this.hintBtn.classList.remove('on');
    this.hintBtn.setAttribute('aria-pressed', 'false');
    this.root.querySelector('#obs-keys').innerHTML =
      '<kbd>↑</kbd><kbd>↓</kbd> 选滑块 · <kbd>←</kbd><kbd>→</kbd> 微调（<kbd>Shift</kbd> 大步）· <kbd>H</kbd> 提示 · <kbd>Esc</kbd> 离开';

    this.bodyEl.innerHTML = `
      <svg class="obs-plot" id="obs-nfw-plot" viewBox="0 0 560 204" role="img" aria-label="密度轮廓 log ρ – log r：数据点与 NFW 模型曲线"></svg>
      <div class="obs-readout">
        <span>χ² = <b id="obs-chi2"></b></span>
        <span>dof = ${this.data.points.length} − 2 = ${this.data.points.length - 2}</span>
        <span>χ²/dof = <b id="obs-chi2dof" class="obs-grade"></b></span>
        <span class="obs-meter" aria-hidden="true"><i id="obs-meter-fill"></i><em style="left:${this._meterPos(NFW.passChi2dof) * 100}%"></em></span>
      </div>
      <div class="obs-sliders">
        <label class="obs-slider" data-idx="0">
          <span class="obs-slider-name">ρ₀</span>
          <input type="range" id="obs-s0" min="${NFW.logRho0.min}" max="${NFW.logRho0.max}" step="${NFW.step}"
            value="${this.params.logRho0}" aria-label="特征密度 ρ₀（对数刻度）" />
          <output id="obs-v0"></output>
        </label>
        <label class="obs-slider" data-idx="1">
          <span class="obs-slider-name">Rₛ</span>
          <input type="range" id="obs-s1" min="${NFW.logRs.min}" max="${NFW.logRs.max}" step="${NFW.step}"
            value="${this.params.logRs}" aria-label="特征半径 Rₛ（对数刻度）" />
          <output id="obs-v1"></output>
        </label>
      </div>
      <p class="obs-hint" id="obs-hint" hidden>提示：r = Rₛ 处 ρ = ρ₀/4（金圈）；外区 ρ ∝ r⁻³（虚斜线）。先拿外区斜率对准 Rₛ，再上下平移对准 ρ₀。</p>`;

    const s0 = this.bodyEl.querySelector('#obs-s0');
    const s1 = this.bodyEl.querySelector('#obs-s1');
    s0.addEventListener('input', () => this._setNfw('logRho0', s0.valueAsNumber));
    s1.addEventListener('input', () => this._setNfw('logRs', s1.valueAsNumber));
    this.bodyEl.querySelectorAll('.obs-slider').forEach((lab) => {
      lab.addEventListener('pointerdown', () => this._select(Number(lab.dataset.idx)));
    });
    s0.addEventListener('focus', () => this._select(0));
    s1.addEventListener('focus', () => this._select(1));

    this._drawNfwStatic();
    this._select(0);
    this._updateNfw();
  }

  _select(i) {
    this.sel = i;
    this.bodyEl.querySelectorAll('.obs-slider').forEach((lab) => {
      lab.classList.toggle('active', Number(lab.dataset.idx) === i);
    });
  }

  /** 设定一个对数参数：夹在范围内并对齐步长网格（与 range 的 step 吸附一致） */
  _setNfw(key, v) {
    const spec = key === 'logRho0' ? NFW.logRho0 : NFW.logRs;
    const snapped = spec.min + Math.round((v - spec.min) / NFW.step) * NFW.step;
    this.params[key] = +Math.min(spec.max, Math.max(spec.min, snapped)).toFixed(4);
    const input = this.bodyEl.querySelector(key === 'logRho0' ? '#obs-s0' : '#obs-s1');
    if (input && Math.abs(input.valueAsNumber - this.params[key]) > 1e-9) input.value = String(this.params[key]);
    this._updateNfw();
  }

  _rho0() { return 10 ** this.params.logRho0; }
  _rs() { return 10 ** this.params.logRs; }

  _updateNfw() {
    const chi2 = nfwChi2(this.data.points, this._rho0(), this._rs());
    this.chi2dof = nfwChi2dof(this.data.points, this._rho0(), this._rs());
    this.bodyEl.querySelector('#obs-chi2').textContent = fmt(chi2, 3);
    const gradeEl = this.bodyEl.querySelector('#obs-chi2dof');
    gradeEl.textContent = fmt(this.chi2dof, 3);
    gradeEl.dataset.grade = fitGrade(this.chi2dof);
    this.bodyEl.querySelector('#obs-meter-fill').style.width = `${this._meterPos(this.chi2dof) * 100}%`;
    this.bodyEl.querySelector('#obs-meter-fill').dataset.grade = fitGrade(this.chi2dof);
    this.bodyEl.querySelector('#obs-v0').textContent = `ρ₀ = ${fmt(this._rho0())}`;
    this.bodyEl.querySelector('#obs-v1').textContent = `Rₛ = ${fmt(this._rs())}`;
    this._drawNfwModel();
  }

  /** χ²/dof → 拟合度表的填充比例（对数刻度：100 → 0，0.5 → 1） */
  _meterPos(v) {
    const t = (Math.log10(100) - Math.log10(Math.max(v, 1e-3))) / (Math.log10(100) - Math.log10(0.5));
    return Math.min(1, Math.max(0, t));
  }

  _nx(logr) { return NFW_BOX.x0 + ((logr - LOG_R[0]) / (LOG_R[1] - LOG_R[0])) * (NFW_BOX.x1 - NFW_BOX.x0); }
  _ny(logrho) {
    const [lo, hi] = this.logRho;
    const t = (logrho - lo) / (hi - lo);
    return NFW_BOX.y1 - Math.min(1.05, Math.max(-0.05, t)) * (NFW_BOX.y1 - NFW_BOX.y0);
  }

  _drawNfwStatic() {
    const svg = this.bodyEl.querySelector('#obs-nfw-plot');
    svg.innerHTML = '';
    const grid = el('g', { class: 'obs-gridlines' });
    for (let d = Math.ceil(LOG_R[0]); d <= LOG_R[1]; d++) {
      const x = this._nx(d);
      grid.appendChild(el('line', { x1: x, x2: x, y1: NFW_BOX.y0, y2: NFW_BOX.y1 }));
      const t = el('text', { x, y: NFW_BOX.y1 + 16, 'text-anchor': 'middle' });
      t.textContent = `10${sup(d)}`;
      grid.appendChild(t);
    }
    for (let d = this.logRho[0]; d <= this.logRho[1]; d++) {
      const y = this._ny(d);
      grid.appendChild(el('line', { x1: NFW_BOX.x0, x2: NFW_BOX.x1, y1: y, y2: y }));
      const t = el('text', { x: NFW_BOX.x0 - 6, y: y + 4, 'text-anchor': 'end' });
      t.textContent = `10${sup(d)}`;
      grid.appendChild(t);
    }
    const xl = el('text', { x: NFW_BOX.x1, y: NFW_BOX.y1 + 30, 'text-anchor': 'end', class: 'obs-axis' });
    xl.textContent = '半径 r（模拟单位）';
    const yl = el('text', { x: 6, y: NFW_BOX.y0 + 2, class: 'obs-axis' });
    yl.textContent = 'ρ';
    grid.append(xl, yl);
    svg.appendChild(grid);

    // 数据点 + 误差棒（log 空间 ±σ）
    const pts = el('g', { class: 'obs-points' });
    for (const p of this.data.points) {
      const x = this._nx(Math.log10(p.r));
      const ly = Math.log10(p.rho);
      pts.appendChild(el('line', { x1: x, x2: x, y1: this._ny(ly + p.sigmaLog), y2: this._ny(ly - p.sigmaLog) }));
      pts.appendChild(el('circle', { cx: x, cy: this._ny(ly), r: 3.6 }));
    }
    svg.appendChild(pts);
    svg.appendChild(el('path', { id: 'obs-truth', class: 'obs-truth', d: this._curve(this.data.truth.rho0, this.data.truth.rs) }));
    svg.appendChild(el('path', { id: 'obs-slope3', class: 'obs-slope3' }));
    svg.appendChild(el('line', { id: 'obs-rs-line', class: 'obs-rs-line' }));
    svg.appendChild(el('path', { id: 'obs-model', class: 'obs-model' }));
    svg.appendChild(el('circle', { id: 'obs-rs-dot', class: 'obs-rs-dot', r: 6 }));
  }

  /** NFW 曲线的 SVG path（log-log 均匀采样 120 点） */
  _curve(rho0, rs) {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const lr = LOG_R[0] + (i / 120) * (LOG_R[1] - LOG_R[0]);
      d += `${i ? 'L' : 'M'}${this._nx(lr).toFixed(1)},${this._ny(Math.log10(nfwDensity(10 ** lr, rho0, rs))).toFixed(1)}`;
    }
    return d;
  }

  _drawNfwModel() {
    const svg = this.bodyEl.querySelector('#obs-nfw-plot');
    if (!svg) return;
    const rho0 = this._rho0(), rs = this._rs();
    svg.querySelector('#obs-model').setAttribute('d', this._curve(rho0, rs));
    svg.querySelector('#obs-truth').classList.toggle('show', !!this.solved);

    // 提示层：r = Rₛ 处 ρ = ρ₀/4（dm8）；外区斜率 −3 参考线（dm9）
    const show = this.hint && !this.solved;
    const lrs = Math.log10(rs);
    const inView = lrs >= LOG_R[0] && lrs <= LOG_R[1];
    const line = svg.querySelector('#obs-rs-line');
    const dot = svg.querySelector('#obs-rs-dot');
    const slope = svg.querySelector('#obs-slope3');
    [line, dot, slope].forEach((n) => n.classList.toggle('show', show && inView));
    if (!inView) return;
    const x = this._nx(lrs);
    const yq = this._ny(Math.log10(rho0 / 4));
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    line.setAttribute('y1', NFW_BOX.y0); line.setAttribute('y2', NFW_BOX.y1);
    dot.setAttribute('cx', x); dot.setAttribute('cy', yq);
    // 斜率 −3 参考线：从 10·Rₛ 处的模型值出发向外画一个数量级
    const a = Math.min(LOG_R[1] - 0.6, lrs + 1);
    const ya = Math.log10(nfwDensity(10 ** a, rho0, rs));
    slope.setAttribute('d', `M${this._nx(a - 0.5)},${this._ny(ya + 1.5)} L${this._nx(a + 0.6)},${this._ny(ya - 1.8)}`);
  }

  _tickNfw(now) {
    if (this.chi2dof < NFW.passChi2dof) {
      if (this.passSince == null) this.passSince = now;
      const left = Math.max(0, NFW.holdMs - (now - this.passSince));
      if (left === 0) {
        const t = this.data.truth;
        this.solved = true; // 先置位，_drawNfwModel 才会亮出真值曲线
        this._drawNfwModel();
        this._status(
          `拟合成功！χ²/dof = ${fmt(this.chi2dof, 3)}（≈ 1：残差与误差棒同量级）。`
          + `真值 ρ₀ = ${fmt(t.rho0)}、Rₛ = ${fmt(t.rs)}；你的结果 ρ₀ = ${fmt(this._rho0())}、Rₛ = ${fmt(this._rs())}。`,
          'ok',
        );
        this._solve({ chi2dof: +this.chi2dof.toFixed(3) });
      } else {
        this._status(`χ²/dof < ${NFW.passChi2dof}，稳住……`, 'near');
      }
    } else {
      this.passSince = null;
      const g = fitGrade(this.chi2dof);
      this._status(g === 'close' ? '很接近了：模型和数据的偏差还比误差棒大一截。' : '曲线离数据点还很远——先看外区的斜率。', g);
    }
  }

  // ============================================================
  // 频率调谐台
  // ============================================================

  _openTuning() {
    this.tuner = makeTuner();
    this.peaks = findPeaks(this.tuner);
    this.grid = tuningGrid();
    this.wave = makeTuningSignal(TUNING.readoutDuration);
    this.f = TUNING.start;
    this.visited = new Set();
    this.locked = [];
    this.dwell = null;
    this.hintBtn.hidden = true;
    this.root.querySelector('#obs-keys').innerHTML =
      '<kbd>←</kbd><kbd>→</kbd> 调谐（<kbd>Shift</kbd> 大步）· 在尖峰上停留即锁定 · <kbd>Esc</kbd> 离开';

    this.bodyEl.innerHTML = `
      <svg class="obs-plot obs-wave" id="obs-wave" viewBox="0 0 560 88" role="img" aria-label="时域波形（1 秒）与当前调谐频率的探测正弦"></svg>
      <svg class="obs-plot obs-spec" id="obs-spec" viewBox="0 0 560 152" role="img" aria-label="频谱：扫过的频率逐步显现"></svg>
      <div class="obs-readout">
        <span>调谐 f = <b id="obs-f"></b></span>
        <span>调谐表 ≈ <b id="obs-amp"></b></span>
        <span>已锁定 <b id="obs-locked"></b></span>
      </div>
      <div class="obs-sliders">
        <label class="obs-slider active" data-idx="0">
          <span class="obs-slider-name">f</span>
          <input type="range" id="obs-sf" min="${TUNING.fMin}" max="${TUNING.fMax}" step="${TUNING.step}"
            value="${this.f}" aria-label="调谐频率（Hz）" />
          <output id="obs-vf"></output>
        </label>
      </div>
      <ul class="obs-peaks" id="obs-peaks" aria-label="已锁定的尖峰"></ul>`;
    const sf = this.bodyEl.querySelector('#obs-sf');
    sf.addEventListener('input', () => this._setTune(sf.valueAsNumber));

    this._drawSpecStatic();
    this._drawWave();
    this._visit(this.f, this.f);
    this._updateTune();
  }

  _setTune(v) {
    const prev = this.f;
    const snapped = TUNING.fMin + Math.round((v - TUNING.fMin) / TUNING.step) * TUNING.step;
    this.f = +Math.min(TUNING.fMax, Math.max(TUNING.fMin, snapped)).toFixed(4);
    const input = this.bodyEl.querySelector('#obs-sf');
    if (input && Math.abs(input.valueAsNumber - this.f) > 1e-9) input.value = String(this.f);
    this._visit(prev, this.f);
    this._updateTune();
  }

  /** 标记从 a 扫到 b 经过的网格频点为「已探测」（拖得再快频谱也连续显现） */
  _visit(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    this.grid.forEach((f, i) => {
      if (f >= lo - 1e-9 && f <= hi + 1e-9 && !this.visited.has(i)) {
        this.visited.add(i);
        this._drawSpecBar(i);
      }
    });
  }

  _sx(f) { return SPEC_BOX.x0 + ((f - TUNING.fMin) / (TUNING.fMax - TUNING.fMin)) * (SPEC_BOX.x1 - SPEC_BOX.x0); }
  _sy(a) { return SPEC_BOX.y1 - Math.min(1, a / AMP_MAX) * (SPEC_BOX.y1 - SPEC_BOX.y0); }

  _drawSpecStatic() {
    const svg = this.bodyEl.querySelector('#obs-spec');
    svg.innerHTML = '';
    svg.appendChild(el('rect', {
      class: 'obs-fog', x: SPEC_BOX.x0, y: SPEC_BOX.y0, width: SPEC_BOX.x1 - SPEC_BOX.x0, height: SPEC_BOX.y1 - SPEC_BOX.y0,
    }));
    const axis = el('g', { class: 'obs-gridlines' });
    for (let f = 0; f <= 10; f++) {
      const x = this._sx(f);
      axis.appendChild(el('line', { x1: x, x2: x, y1: SPEC_BOX.y1, y2: SPEC_BOX.y1 + 4 }));
      const t = el('text', { x, y: SPEC_BOX.y1 + 16, 'text-anchor': 'middle' });
      t.textContent = String(f);
      axis.appendChild(t);
    }
    const xl = el('text', { x: SPEC_BOX.x1, y: SPEC_BOX.y1 + 30, 'text-anchor': 'end', class: 'obs-axis' });
    xl.textContent = '频率 f（Hz）';
    axis.appendChild(xl);
    axis.appendChild(el('line', { x1: SPEC_BOX.x0, x2: SPEC_BOX.x1, y1: SPEC_BOX.y1, y2: SPEC_BOX.y1 }));
    svg.appendChild(axis);
    svg.appendChild(el('g', { id: 'obs-bars', class: 'obs-bars' }));
    svg.appendChild(el('g', { id: 'obs-marks', class: 'obs-marks' }));
    svg.appendChild(el('line', { id: 'obs-needle', class: 'obs-needle', y1: SPEC_BOX.y0 - 6, y2: SPEC_BOX.y1 }));
    svg.appendChild(el('rect', { id: 'obs-dwell', class: 'obs-dwell', y: SPEC_BOX.y0 - 12, height: 4, width: 0 }));
  }

  _drawSpecBar(i) {
    const f = this.grid[i];
    const a = this.tuner(f);
    const bars = this.bodyEl.querySelector('#obs-bars');
    const w = ((SPEC_BOX.x1 - SPEC_BOX.x0) / (this.grid.length - 1)) * 0.9;
    bars.appendChild(el('rect', {
      x: (this._sx(f) - w / 2).toFixed(2), y: this._sy(a).toFixed(2), width: w.toFixed(2),
      height: (SPEC_BOX.y1 - this._sy(a)).toFixed(2),
    }));
  }

  _drawWave() {
    const svg = this.bodyEl.querySelector('#obs-wave');
    svg.innerHTML = '';
    const n = this.wave.length;
    const ymax = 4.6; // 三纯音叠加的峰值约 ±4.4
    const wy = (v) => (WAVE_BOX.y0 + WAVE_BOX.y1) / 2 - (v / ymax) * ((WAVE_BOX.y1 - WAVE_BOX.y0) / 2);
    const wx = (i) => WAVE_BOX.x0 + (i / (n - 1)) * (WAVE_BOX.x1 - WAVE_BOX.x0);
    let d = '';
    for (let i = 0; i < n; i += 5) d += `${i ? 'L' : 'M'}${wx(i).toFixed(1)},${wy(this.wave[i]).toFixed(1)}`;
    svg.appendChild(el('line', { class: 'obs-zero', x1: WAVE_BOX.x0, x2: WAVE_BOX.x1, y1: wy(0), y2: wy(0) }));
    svg.appendChild(el('path', { class: 'obs-signal', d }));
    svg.appendChild(el('path', { id: 'obs-probe', class: 'obs-probe' }));
    const t = el('text', { x: WAVE_BOX.x1, y: WAVE_BOX.y1 + 6, 'text-anchor': 'end', class: 'obs-axis' });
    t.textContent = '时间 0 → 1 s';
    svg.appendChild(t);
    this._waveXY = { wx, wy, n };
  }

  _updateTune() {
    const a = this.tuner(this.f);
    this.bodyEl.querySelector('#obs-f').textContent = `${this.f.toFixed(2)} Hz`;
    this.bodyEl.querySelector('#obs-vf').textContent = `${this.f.toFixed(2)} Hz`;
    this.bodyEl.querySelector('#obs-amp').textContent = a.toFixed(2);
    this.bodyEl.querySelector('#obs-locked').textContent = `${this.locked.length} / ${this.peaks.length}`;
    const needle = this.bodyEl.querySelector('#obs-needle');
    needle.setAttribute('x1', this._sx(this.f));
    needle.setAttribute('x2', this._sx(this.f));
    // 探测正弦：当前调谐频率的单频波，画在时域波形上（尖峰处与信号分量同频）
    const { wx, wy, n } = this._waveXY;
    let d = '';
    for (let i = 0; i < n; i += 10) d += `${i ? 'L' : 'M'}${wx(i).toFixed(1)},${wy(1.6 * Math.sin((2 * Math.PI * this.f * i) / TUNING.sr)).toFixed(1)}`;
    this.bodyEl.querySelector('#obs-probe').setAttribute('d', d);
  }

  _tickTuning(now) {
    const near = this.peaks.find((p) => !this.locked.includes(p.f) && Math.abs(this.f - p.f) <= TUNING.lockTol + 1e-9);
    const bar = this.bodyEl.querySelector('#obs-dwell');
    if (!near) {
      this.dwell = null;
      bar.setAttribute('width', 0);
      if (!this.locked.length) this._status('慢慢扫：调谐表突然抬头的地方就是尖峰。', 'far');
      return;
    }
    if (!this.dwell || this.dwell.f !== near.f) this.dwell = { f: near.f, since: now };
    const t = Math.min(1, (now - this.dwell.since) / TUNING.holdMs);
    bar.setAttribute('x', this._sx(near.f) - 24);
    bar.setAttribute('width', 48 * t);
    this._status(`捕捉到尖峰信号，稳住…… ${Math.round(t * 100)}%`, 'near');
    if (t < 1) return;
    this._lockPeak(near);
  }

  _lockPeak(peak) {
    this.locked.push(peak.f);
    this.dwell = null;
    this.bodyEl.querySelector('#obs-dwell').setAttribute('width', 0);
    sfx.pickup();
    // 读数：sg6 原题的 1 秒记录（N = 2000）在该频点上的 |X| 与反推振幅 A = 2|X|/N
    const n = TUNING.sr * TUNING.readoutDuration;
    const mag = readoutMagnitude(peak.f);
    const amp = amplitudeOf(mag, n);
    const marks = this.bodyEl.querySelector('#obs-marks');
    marks.appendChild(el('circle', { cx: this._sx(peak.f), cy: this._sy(peak.amp), r: 6 }));
    const lab = el('text', { x: this._sx(peak.f) + 8, y: this._sy(peak.amp) + 4 });
    lab.textContent = `${peak.f} Hz`;
    marks.appendChild(lab);
    const li = document.createElement('li');
    li.dataset.f = String(peak.f);
    li.innerHTML = `<b>${peak.f} Hz</b>：|X| = ${Math.round(mag)}（N = ${n}）→ 振幅 A = 2|X|/N = <b>${fmt(amp)}</b>`;
    this.bodyEl.querySelector('#obs-peaks').appendChild(li);
    this._updateTune();
    if (this.locked.length < this.peaks.length) {
      this._status(`锁定 ${peak.f} Hz！还剩 ${this.peaks.length - this.locked.length} 根尖峰。`, 'near');
      return;
    }
    const freqs = [...this.peaks].map((p) => p.f).join(' / ');
    const amps = [...this.peaks].map((p) => fmt(amplitudeOf(readoutMagnitude(p.f), n))).join(' / ');
    this._status(`全部 ${this.peaks.length} 根尖峰锁定！魅影的咆哮 = ${freqs} Hz 三个纯音，振幅 ${amps}。`, 'ok');
    this._solve({});
  }
}
