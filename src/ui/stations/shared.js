// ============================================================
// 第二批观测台的共用小工具：SVG 元素、数字格式、对数滑块（与 NFW 拟合台同一手感）
// 各观测台控制器（ui/stations/*.js）只拿 ObservatoryOverlay 实例 ov 读写面板：
//   ov.bodyEl 面板主体 · ov._status(text, cls) 状态行 · ov._solve(result) 完成回调
// ============================================================

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

/** 数字显示：保留 digits 位有效数字，大数保留 1 位小数 */
export const fmt = (v, digits = 3) => (Math.abs(v) >= 100 ? v.toFixed(1) : Number(v.toPrecision(digits)).toString());

export const pct = (v) => `${Math.round(v * 100)}%`;

/** 上标数字（坐标轴 10ⁿ 刻度） */
export const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);

/**
 * 一组滑块（↑/↓ 选中、←/→ 微调、Shift 大步），与 NFW 拟合台同一套交互：
 * Phaser 对方向键做了 preventDefault，range 原生键盘调节失效，所以由控制器接管。
 * specs: [{ key, name, min, max, step, value, label, format }]
 */
export class SliderGroup {
  constructor(root, specs, onChange) {
    this.root = root;
    this.specs = specs;
    this.onChange = onChange;
    this.sel = 0;
    this.values = Object.fromEntries(specs.map((s) => [s.key, s.value]));
    root.innerHTML = specs.map((s, i) => `
      <label class="obs-slider" data-idx="${i}">
        <span class="obs-slider-name">${s.name}</span>
        <input type="range" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}" aria-label="${s.label}" />
        <output data-out="${s.key}"></output>
      </label>`).join('');
    root.querySelectorAll('input[type="range"]').forEach((input, i) => {
      input.addEventListener('input', () => this.set(input.dataset.key, input.valueAsNumber));
      input.addEventListener('focus', () => this.select(i));
    });
    root.querySelectorAll('.obs-slider').forEach((lab) => {
      lab.addEventListener('pointerdown', () => this.select(Number(lab.dataset.idx)));
    });
    this.select(0);
    specs.forEach((s) => this._show(s.key));
  }

  select(i) {
    this.sel = (i + this.specs.length) % this.specs.length;
    this.root.querySelectorAll('.obs-slider').forEach((lab) => {
      lab.classList.toggle('active', Number(lab.dataset.idx) === this.sel);
    });
  }

  /** 设定一个值：夹在范围内并吸附到步长网格（与 range 的 step 一致） */
  set(key, v, { silent = false } = {}) {
    const s = this.specs.find((x) => x.key === key);
    const snapped = s.min + Math.round((v - s.min) / s.step) * s.step;
    this.values[key] = +Math.min(s.max, Math.max(s.min, snapped)).toFixed(6);
    const input = this.root.querySelector(`input[data-key="${key}"]`);
    if (input && Math.abs(input.valueAsNumber - this.values[key]) > 1e-9) input.value = String(this.values[key]);
    this._show(key);
    if (!silent && this.onChange) this.onChange(key, this.values[key]);
  }

  _show(key) {
    const s = this.specs.find((x) => x.key === key);
    const out = this.root.querySelector(`output[data-out="${key}"]`);
    if (out) out.textContent = s.format ? s.format(this.values[key]) : String(this.values[key]);
  }

  /** 方向键：返回 true 表示已处理 */
  key(e) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      this.select(this.sel + (e.key === 'ArrowDown' ? 1 : -1));
      return true;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const s = this.specs[this.sel];
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      this.set(s.key, this.values[s.key] + dir * s.step * (e.shiftKey ? 5 : 1));
      return true;
    }
    return false;
  }
}

/** 混淆矩阵表格（行 = 真实、列 = 预测，对角线高亮；sg18） */
export function matrixTable(matrix, names, { caption = '' } = {}) {
  const head = names.map((n) => `<th scope="col">${n}</th>`).join('');
  const rows = matrix.map((row, i) => `<tr><th scope="row">${names[i]}</th>${
    row.map((v, j) => `<td class="${i === j ? 'diag' : v ? 'off' : ''}">${v}</td>`).join('')}</tr>`).join('');
  return `<table class="st-matrix">${caption ? `<caption>${caption}</caption>` : ''}
    <thead><tr><th class="corner">真实 ＼ 预测</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}
