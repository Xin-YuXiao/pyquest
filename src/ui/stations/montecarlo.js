// ============================================================
// 第三章观测台「蒙特卡洛估 π」：往单位正方形里撒随机点，数落进四分之一圆的点
// π̂ = 4M/N（mp5）；随机点 = 两个 [0, 1) 均匀随机数（mp6）；
// 右图 |π̂ − π| 随 N 的变化与 1σ ≈ 4√(p(1−p)/N) 参考线（均值标准误 σ/√N，st5 / st14）。
// 键盘：1 / 2 / 3 撒 10 / 100 / 1000 点 · 按住「连续撒点」按钮持续撒 · H 提示 · Esc 离开
// ============================================================
import { MC, makeMonteCarlo, piEstimate, mcSigma } from '../../core/stations.js';
import { svgEl, fmt, sup } from './shared.js';

const PLOT = { x0: 46, x1: 318, y0: 10, y1: 214 };   // 误差图绘图区（viewBox 330×248）
const LOG_N = [1, Math.log10(MC.maxN)];             // 横轴 log10 N：10 → 5 万
const LOG_E = [-4, 0];                              // 纵轴 log10 |π̂ − π|：1e-4 → 1
const SPRAY_PER_FRAME = 40;

export function createMonteCarlo(ov) {
  let mc = null;
  let dirty = true;
  let holding = false;

  const nx = (n) => PLOT.x0 + ((Math.log10(n) - LOG_N[0]) / (LOG_N[1] - LOG_N[0])) * (PLOT.x1 - PLOT.x0);
  const ny = (e) => {
    const t = (Math.log10(Math.max(e, 1e-4)) - LOG_E[0]) / (LOG_E[1] - LOG_E[0]);
    return PLOT.y1 - Math.min(1, Math.max(0, t)) * (PLOT.y1 - PLOT.y0);
  };

  function drawStatic() {
    const svg = ov.bodyEl.querySelector('#st-mc-plot');
    svg.innerHTML = '';
    const g = svgEl('g', { class: 'obs-gridlines' });
    for (let d = LOG_N[0]; d <= Math.floor(LOG_N[1]); d++) {
      g.appendChild(svgEl('line', { x1: nx(10 ** d), x2: nx(10 ** d), y1: PLOT.y0, y2: PLOT.y1 }));
      const t = svgEl('text', { x: nx(10 ** d), y: PLOT.y1 + 14, 'text-anchor': 'middle' });
      t.textContent = `10${sup(d)}`;
      g.appendChild(t);
    }
    for (let d = LOG_E[0]; d <= LOG_E[1]; d++) {
      g.appendChild(svgEl('line', { x1: PLOT.x0, x2: PLOT.x1, y1: ny(10 ** d), y2: ny(10 ** d) }));
      const t = svgEl('text', { x: PLOT.x0 - 4, y: ny(10 ** d) + 4, 'text-anchor': 'end' });
      t.textContent = `10${sup(d)}`;
      g.appendChild(t);
    }
    const xl = svgEl('text', { x: PLOT.x1, y: PLOT.y1 + 30, 'text-anchor': 'end', class: 'obs-axis' });
    xl.textContent = '撒点数 N（对数）';
    const yl = svgEl('text', { x: PLOT.x0 + 6, y: PLOT.y0 + 14, class: 'obs-axis' });
    yl.textContent = '|π̂−π|';
    g.append(xl, yl);
    svg.appendChild(g);
    // 1σ 参考线：σ(π̂) = 4√(p(1−p)/N)，斜率 −1/2（点数 ×100，误差 ÷10）
    let d = '';
    for (let i = 0; i <= 60; i++) {
      const n = 10 ** (LOG_N[0] + (i / 60) * (LOG_N[1] - LOG_N[0]));
      d += `${i ? 'L' : 'M'}${nx(n).toFixed(1)},${ny(mcSigma(n)).toFixed(1)}`;
    }
    svg.appendChild(svgEl('path', { class: 'st-mc-sigma', d }));
    svg.appendChild(svgEl('line', { class: 'st-mc-tol', x1: nx(MC.minN), x2: PLOT.x1, y1: ny(MC.tol), y2: ny(MC.tol) }));
    svg.appendChild(svgEl('line', { class: 'st-mc-tol', x1: nx(MC.minN), x2: nx(MC.minN), y1: ny(MC.tol), y2: PLOT.y1 }));
    svg.appendChild(svgEl('path', { id: 'st-mc-err', class: 'st-mc-err' }));
  }

  function drawCanvas() {
    const cv = ov.bodyEl.querySelector('#st-mc-canvas');
    const ctx = cv.getContext('2d');
    const S = cv.width;
    ctx.fillStyle = '#2f2a3d';
    ctx.fillRect(0, 0, S, S);
    // 四分之一圆（圆心在左下角）
    ctx.strokeStyle = 'rgba(255,210,87,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, S, S, -Math.PI / 2, 0);
    ctx.stroke();
    for (const p of mc.state.recent) {
      ctx.fillStyle = p.hit ? '#3ddad7' : '#ff8aa0';
      ctx.fillRect(p.x * S - 1, S - p.y * S - 1, 2.4, 2.4);
    }
  }

  function update() {
    const s = mc.state;
    const piHat = piEstimate(s.inside, s.n);
    const err = Math.abs(piHat - Math.PI);
    const q = (sel) => ov.bodyEl.querySelector(sel);
    q('#st-mc-n').textContent = String(s.n);
    q('#st-mc-m').textContent = String(s.inside);
    q('#st-mc-pi').textContent = s.n ? piHat.toFixed(4) : '—';
    q('#st-mc-errv').textContent = s.n ? err.toFixed(4) : '—';
    q('#st-mc-sig').textContent = s.n ? mcSigma(s.n).toFixed(4) : '—';
    let d = '';
    s.history.forEach((h, i) => { d += `${i ? 'L' : 'M'}${nx(h.n).toFixed(1)},${ny(h.err).toFixed(1)}`; });
    q('#st-mc-err').setAttribute('d', d);
    drawCanvas();
    dirty = false;

    if (ov.solved) return;
    if (s.solvedAt != null) {
      ov._status(
        `估到了！撒到第 ${s.solvedAt} 点时 |π̂ − π| = ${fmt(s.solvedErr, 2)} < ${MC.tol}。`
        + `点数越多误差越小，但只按 1/√N 缩小：想把误差再减半，得撒 4 倍的点。`,
        'ok',
      );
      ov._solve({});
    } else if (s.n >= MC.maxN) {
      ov._status('点撒满了。离开再进来会换一组随机点重新挑战。', 'far');
    } else if (s.n < MC.minN) {
      ov._status(`先撒够 ${MC.minN} 个点：点太少时 π̂ 会大起大落（看右图左侧）。`, 'far');
    } else {
      ov._status(`继续撒：|π̂ − π| 要压到 ${MC.tol} 以下。1σ 统计误差现在约 ${mcSigma(s.n).toFixed(4)}。`, 'near');
    }
  }

  function spray(k) {
    if (ov.solved && mc.state.n >= MC.maxN) return;
    if (mc.throw(k)) dirty = true;
  }

  return {
    hasHint: true,
    keys: '<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 撒点 · 按住连续撒 · <kbd>H</kbd> 提示 · <kbd>Esc</kbd> 离开',

    open() {
      mc = makeMonteCarlo(ov.attempt);
      ov.bodyEl.innerHTML = `
        <div class="st-row">
          <canvas class="st-mc-canvas" id="st-mc-canvas" width="248" height="248" role="img"
            aria-label="单位正方形里的随机点：青色落在四分之一圆内，粉色落在圆外"></canvas>
          <svg class="obs-plot st-mc-plot" id="st-mc-plot" viewBox="0 0 330 248" role="img"
            aria-label="误差 |π̂ − π| 随撒点数 N 的变化，虚线为 1σ 参考线"></svg>
        </div>
        <div class="obs-readout">
          <span>N = <b id="st-mc-n"></b></span>
          <span>圆内 M = <b id="st-mc-m"></b></span>
          <span>π̂ = 4M/N = <b id="st-mc-pi"></b></span>
          <span>|π̂ − π| = <b id="st-mc-errv"></b></span>
          <span>1σ ≈ <b id="st-mc-sig"></b></span>
        </div>
        <div class="st-actions">
          ${MC.batches.map((b, i) => `<button class="btn" type="button" data-batch="${b}">撒 ${b} 点 <kbd>${i + 1}</kbd></button>`).join('')}
          <button class="btn" type="button" id="st-mc-hold">按住连续撒点</button>
        </div>
        <p class="obs-hint" id="obs-hint" hidden>提示：四分之一圆面积 / 正方形面积 = π/4，所以 π ≈ 4M/N（mp5）。
          每个点是一次独立的伯努利试验，π̂ 的统计误差 1σ ≈ 4√(p(1−p)/N)，p = π/4——和均值的标准误 σ/√N 同一个道理（st14）。
          蒙特卡洛的每次抽样互不相干，所以天生适合并行（sp12）。</p>`;
      ov.bodyEl.querySelectorAll('[data-batch]').forEach((b) => {
        b.addEventListener('click', () => spray(Number(b.dataset.batch)));
      });
      const hold = ov.bodyEl.querySelector('#st-mc-hold');
      const stop = () => { holding = false; hold.classList.remove('on'); };
      hold.addEventListener('pointerdown', (e) => { e.preventDefault(); holding = true; hold.classList.add('on'); });
      hold.addEventListener('pointerup', stop);
      hold.addEventListener('pointerleave', stop);
      hold.addEventListener('pointercancel', stop);
      drawStatic();
      dirty = true;
      update();
    },

    tick() {
      if (holding) spray(SPRAY_PER_FRAME);
      if (dirty) update();
    },

    key(e) {
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0) { spray(MC.batches[i]); return true; }
      return false;
    },

    close() { holding = false; },

    snapshot() {
      const s = mc.state;
      return {
        n: s.n, inside: s.inside, piHat: piEstimate(s.inside, s.n),
        err: Math.abs(piEstimate(s.inside, s.n) - Math.PI), solvedAt: s.solvedAt,
      };
    },
  };
}
