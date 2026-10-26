// ============================================================
// 曲线对消（第三章 BOSS 护盾）· 面板玩法（ui/GamePanel 调用 mount）
// 示波器：红色 = 魔君的混沌曲线（表达式对学生隐藏），青色 = 学生咒语算出的曲线（输入时实时重画），
// 金色带 = 两条曲线之间的残差；残差处处小于容差 → 施放后这层护盾被对消（曲线压平、护盾碎裂）。
// 判定规则在 ./rules.js（纯函数）；这里只管绘制与动画。
// ============================================================
import './curve.css';
import { G } from '../../core/state.js';
import { levelDone } from '../../core/games.js';
import { SpellInput } from '../../ui/SpellInput.js';
import { makeScope, targetCurve, judge, readout, DEFAULT_TOL } from './rules.js';
import { LEVELS } from './levels.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 880, H = 236;
const BOX = { x0: 52, x1: 866, y0: 12, y1: 210 };
const Y_RANGE = [-3, 3];
const X_MAX = 2 * Math.PI;
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const fmt = (v) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2)).replace('-', '−');

export function mount(ctx) {
  const level = ctx.level;
  const tol = level.tol ?? DEFAULT_TOL;
  const scope = makeScope();
  const xs = Array.from({ length: scope.x.size }, (_, i) => scope.x.at(i));
  const target = targetCurve(level, scope);
  let casts = 0;
  let solved = false;
  let last = null; // 最近一次预览的判定
  let animating = false;

  const sx = (x) => BOX.x0 + (x / X_MAX) * (BOX.x1 - BOX.x0);
  const sy = (y) => {
    const t = (y - Y_RANGE[0]) / (Y_RANGE[1] - Y_RANGE[0]);
    return BOX.y1 - Math.max(-0.05, Math.min(1.05, t)) * (BOX.y1 - BOX.y0);
  };
  const pathOf = (ys) => ys.map((y, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(Number.isFinite(y) ? y : 0).toFixed(1)}`).join('');

  // ---------- DOM ----------
  const core = LEVELS.filter((l) => !l.challenge);
  ctx.root.innerHTML = `
    <div class="cv-top">
      <div class="cv-shield" aria-label="魔君护盾"></div>
      <div class="cv-meter" title="最大残差 |魔君 − 你的曲线|">
        <span class="cv-meter-label">最大残差</span>
        <span class="cv-meter-bar"><i></i><em></em></span>
        <b class="cv-meter-val">—</b>
      </div>
    </div>
    <svg class="cv-scope" viewBox="0 0 ${W} ${H}" role="img" aria-label="示波器：魔君的混沌曲线与你的曲线"></svg>
    <div class="cv-legend">
      <span class="cv-l boss">━ 魔君的混沌曲线</span>
      <span class="cv-l mine">━ 你的曲线</span>
      <span class="cv-l res">▒ 残差（要处处小于 ${tol}）</span>
      <span class="cv-stats"></span>
    </div>
    <div class="cv-input"></div>`;
  const svg = ctx.root.querySelector('.cv-scope');
  const shieldEl = ctx.root.querySelector('.cv-shield');
  const meterBar = ctx.root.querySelector('.cv-meter-bar i');
  const meterTol = ctx.root.querySelector('.cv-meter-bar em');
  const meterVal = ctx.root.querySelector('.cv-meter-val');
  const statsEl = ctx.root.querySelector('.cv-stats');

  // 护盾层（4 层核心）：已对消的层显示碎裂；挑战关显示「本体」
  function drawShield() {
    shieldEl.innerHTML = '';
    if (level.challenge) {
      shieldEl.innerHTML = '<span class="cv-core">魔君本体 · 两条波叠加</span>';
      return;
    }
    core.forEach((l) => {
      const pip = document.createElement('span');
      pip.className = 'cv-pip';
      if (levelDone(G, ctx.meta.id, l.id) || (solved && l.id === level.id)) pip.classList.add('broken');
      if (l.id === level.id) pip.classList.add('cur');
      pip.title = l.title;
      shieldEl.appendChild(pip);
    });
    const left = core.filter((l) => !levelDone(G, ctx.meta.id, l.id) && !(solved && l.id === level.id)).length;
    const lab = document.createElement('span');
    lab.className = 'cv-shield-label';
    lab.textContent = left ? `护盾剩余 ${left} 层` : '护盾已全部对消！';
    shieldEl.appendChild(lab);
  }

  // 坐标轴与网格（静态）
  const grid = svgEl('g', { class: 'cv-grid' });
  for (let y = Y_RANGE[0]; y <= Y_RANGE[1]; y++) {
    grid.appendChild(svgEl('line', { x1: BOX.x0, x2: BOX.x1, y1: sy(y), y2: sy(y), class: y === 0 ? 'zero' : '' }));
    const t = svgEl('text', { x: BOX.x0 - 8, y: sy(y) + 4, 'text-anchor': 'end' });
    t.textContent = String(y).replace('-', '−');
    grid.appendChild(t);
  }
  [['0', 0], ['π/2', Math.PI / 2], ['π', Math.PI], ['3π/2', 1.5 * Math.PI], ['2π', 2 * Math.PI]].forEach(([lab, x]) => {
    grid.appendChild(svgEl('line', { x1: sx(x), x2: sx(x), y1: BOX.y0, y2: BOX.y1 }));
    const t = svgEl('text', { x: sx(x), y: BOX.y1 + 18, 'text-anchor': 'middle' });
    t.textContent = lab;
    grid.appendChild(t);
  });
  const xl = svgEl('text', { x: BOX.x1, y: BOX.y0 + 12, 'text-anchor': 'end', class: 'cv-axis' });
  xl.textContent = 'x = np.linspace(0, 2 * np.pi, 100)';
  grid.appendChild(xl);
  svg.appendChild(grid);

  const resPath = svgEl('path', { class: 'cv-res' });
  const bossGlow = svgEl('path', { class: 'cv-boss-glow', d: pathOf(target) });
  const bossPath = svgEl('path', { class: 'cv-boss', d: pathOf(target) });
  const minePath = svgEl('path', { class: 'cv-mine' });
  const worstLine = svgEl('line', { class: 'cv-worst', y1: BOX.y0, y2: BOX.y1 });
  const worstText = svgEl('text', { class: 'cv-worst-t', 'text-anchor': 'middle' });
  const sweep = svgEl('rect', { class: 'cv-sweep', x: BOX.x0, y: BOX.y0, width: 0, height: BOX.y1 - BOX.y0 });
  svg.append(resPath, bossGlow, bossPath, minePath, worstLine, worstText, sweep);
  const sparks = svgEl('g', { class: 'cv-sparks' });
  svg.appendChild(sparks);

  function drawMine(j) {
    last = j;
    const ok = j && j.y;
    minePath.setAttribute('d', ok ? pathOf(j.y) : '');
    resPath.setAttribute('d', ok
      ? `${pathOf(target)}${j.y.map((_, k) => {
        const i = j.y.length - 1 - k;
        return `L${sx(xs[i]).toFixed(1)},${sy(j.y[i]).toFixed(1)}`;
      }).join('')}Z`
      : '');
    if (ok && j.residual > tol) {
      worstLine.setAttribute('x1', sx(xs[j.worst]));
      worstLine.setAttribute('x2', sx(xs[j.worst]));
      worstText.setAttribute('x', sx(xs[j.worst]));
      worstText.setAttribute('y', BOX.y0 + 12);
      worstText.textContent = `差 ${fmt(j.residual)}`;
      worstLine.style.display = '';
      worstText.style.display = '';
    } else {
      worstLine.style.display = 'none';
      worstText.style.display = 'none';
    }
    // 读数
    const r = ok ? j.residual : null;
    const frac = r === null ? 0 : Math.min(1, r / 2);
    meterBar.style.width = `${frac * 100}%`;
    meterBar.dataset.ok = r !== null && r <= tol ? '1' : '';
    meterTol.style.left = `${(tol / 2) * 100}%`;
    meterVal.textContent = r === null ? '—' : Number.isFinite(r) ? fmt(r) : '∞';
    if (ok) {
      const ro = readout(j.y);
      statsEl.textContent = `你的曲线：最高 ${fmt(ro.max)} · 最低 ${fmt(ro.min)} · 中线 ${fmt(ro.mid)}`;
    } else statsEl.textContent = '';
  }

  // ---------- 输入 ----------
  const inputRoot = ctx.root.querySelector('.cv-input');
  const spell = new SpellInput(inputRoot, {
    scope: () => scope,
    placeholder: '写一个关于 x 的表达式，例如 np.sin(x)，回车施放',
    idleText: '输入时，示波器上实时画出你的曲线（青色）。',
    chips: ['x', 'np.sin(', 'np.cos(', '*', '+', '-', '(', ')', '0.5', '1.5', '2', '3', 'np.pi'],
    castLabel: '对消 ⏎',
    describe: (res, s) => {
      const j = judge(level, spell.value, scope);
      if (j.status === 'shape') return j.message;
      if (j.status === 'hit') return `✓ 和魔君的曲线处处吻合（最大残差 ${fmt(j.residual)}）——回车施放！`;
      if (j.status === 'miss') return `形状 (${s.x.size},) ✓ · 最大残差 ${Number.isFinite(j.residual) ? fmt(j.residual) : '∞'}（要小于 ${tol}）`;
      return null;
    },
    onPreview: () => {
      if (animating || solved) return;
      drawMine(judge(level, spell.value, scope));
    },
    onCast: (src) => cast(src),
  });
  ctx.setKeys('<kbd>Enter</kbd> 对消 · <kbd>↑</kbd><kbd>↓</kbd> 历史');

  function burst(color) {
    for (let k = 0; k < 26; k++) {
      const i = Math.floor((k / 26) * xs.length);
      const c = svgEl('circle', { cx: sx(xs[i]), cy: sy(target[i]), r: 3, fill: color, class: 'cv-spark' });
      c.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
      c.style.setProperty('--dy', `${(Math.random() - 0.5) * 70}px`);
      sparks.appendChild(c);
      setTimeout(() => c.remove(), 900);
    }
  }

  /** 把魔君曲线在 ms 内插值压平到 0 */
  function flatten(ms) {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const ys = target.map((y) => y * (1 - t) * (1 - t));
      bossPath.setAttribute('d', pathOf(ys));
      bossGlow.setAttribute('d', pathOf(ys));
      if (t < 1 && ctx.root.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function cast(src) {
    if (solved || animating) return;
    const j = judge(level, src, scope);
    if (j.status === 'error' || j.status === 'shape' || j.status === 'empty') {
      spell.flash();
      ctx.status(j.status === 'shape' ? j.message : '咒语报错了：看看下面的提示。', 'bad');
      ctx.sfx.wrong && ctx.sfx.wrong();
      return;
    }
    casts++;
    drawMine(j);
    animating = true;
    sweep.setAttribute('width', 0);
    sweep.classList.remove('go');
    void sweep.getBBox();
    sweep.classList.add('go');
    setTimeout(() => {
      animating = false;
      sweep.classList.remove('go');
      if (j.status === 'hit') {
        solved = true;
        svg.classList.add('cancelled');
        flatten(520);
        burst('#ffd257');
        ctx.status(`对消成功！${level.challenge ? '魔君本体被看穿了。' : '这一层护盾碎了。'}`, 'ok');
        drawShield();
        spell.disable(true);
        ctx.win({
          score: casts,
          summary: `${level.title}：${casts === 1 ? '一次施法就对消成功' : `第 ${casts} 次施法对消成功`}（最大残差 ${fmt(j.residual)}）`,
          delay: 900,
        });
      } else {
        svg.classList.remove('miss');
        void svg.getBBox();
        svg.classList.add('miss');
        burst('#ff6b81');
        ctx.status(`没能对消：最大残差 ${Number.isFinite(j.residual) ? fmt(j.residual) : '∞'}，护盾反弹了。对照红线，看看哪里不一样。`, 'bad');
      }
    }, 620);
  }

  drawShield();
  drawMine(null);
  spell.showIdle();

  return {
    destroy() { spell.destroy(); },
    snapshot: () => ({
      level: level.id, casts, solved,
      residual: last && Number.isFinite(last.residual) ? last.residual : null,
      status: last ? last.status : 'empty',
    }),
  };
}
