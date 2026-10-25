// ============================================================
// 第六章观测台「引力沙盒」：中心星 + 卫星，固定步长积分，实时轨迹 + 能量误差曲线
// 挑战：卫星绕行 3 圈，不坠毁也不逃逸。
// 破坏实验：「近心掠过」让卫星擦过中心星——softening ε = 0 时近距离引力暴涨、步长跟不上，
// 能量突变、卫星被甩飞；把 ε 调大（nm20 的软化长度）后轨道保住。
// 力律只用题库 nm20 的 g(r) = GM/(r² + ε²)；积分器（leapfrog）与对应势能为题库未覆盖的演示内容。
// 键盘：↑/↓ 选滑块 · ←/→ 微调（Shift 大步）· 空格 发射 · P 近心掠过 · R 重置 · H 提示 · Esc 离开
// 鼠标 / 触屏：在卫星出发点上拖出速度箭头
// ============================================================
import {
  GRAV, PLUNGE, launchOrbit, stepOrbit, circularSpeed, softPotential,
} from '../../core/stations.js';
import { SliderGroup, svgEl, fmt } from './shared.js';

const CV = 280;                 // 画布边长（px）
const SCALE = CV / 4.6;         // 世界坐标 ±2.3 → 画布
const TRAIL = 1600;             // 轨迹保留点数
const ARROW = 0.7;              // 速度箭头：每单位速度画 0.7 个世界单位长
const EPLOT = { x0: 42, x1: 286, y0: 10, y1: 128 }; // 能量误差图（viewBox 296×150）

export function createGravity(ov) {
  let sliders = null;
  let orbit = null;           // 当前飞行中的轨道（launchOrbit 状态）
  let trail = [];
  let energy = [];            // [{ t, drift }]
  let dragging = false;
  let reported = null;        // 已经处理过的终局状态（避免每帧重复写状态行）

  const q = (s) => ov.bodyEl.querySelector(s);
  const v = () => sliders.values;
  const toPx = (x, y) => [CV / 2 + x * SCALE, CV / 2 - y * SCALE];

  function draw() {
    const cv = q('#st-gr-canvas');
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1f1b2b';
    ctx.fillRect(0, 0, CV, CV);
    // 出发半径参考圈 + 逃逸边界提示
    ctx.strokeStyle = 'rgba(232,227,245,.12)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.arc(CV / 2, CV / 2, GRAV.r0 * SCALE, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // softening 尺度：半径 ε 的淡圈（ε 以内引力被抹平）
    if (v().eps > 0) {
      ctx.fillStyle = 'rgba(143,214,255,.12)';
      ctx.beginPath(); ctx.arc(CV / 2, CV / 2, Math.max(2, v().eps * SCALE), 0, Math.PI * 2); ctx.fill();
    }
    // 中心星
    const g = ctx.createRadialGradient(CV / 2, CV / 2, 0, CV / 2, CV / 2, 12);
    g.addColorStop(0, '#fff7d6'); g.addColorStop(0.5, '#ffd257'); g.addColorStop(1, 'rgba(255,210,87,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CV / 2, CV / 2, 12, 0, Math.PI * 2); ctx.fill();
    // 轨迹
    if (trail.length > 1) {
      ctx.strokeStyle = '#8fd6ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      trail.forEach(([x, y], i) => { const [px, py] = toPx(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.stroke();
    }
    // 卫星 / 发射箭头
    if (orbit) {
      const [px, py] = toPx(orbit.x, orbit.y);
      ctx.fillStyle = orbit.status === 'crashed' ? '#ff6b81' : orbit.status === 'escaped' ? '#ff9db8' : '#3ddad7';
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    if (!orbit || orbit.status !== 'flying') {
      const a = (v().angle * Math.PI) / 180;
      const [sx, sy] = toPx(GRAV.r0, 0);
      const [ex, ey] = toPx(GRAV.r0 + Math.cos(a) * v().speed * ARROW, Math.sin(a) * v().speed * ARROW);
      ctx.strokeStyle = '#ffd257'; ctx.fillStyle = '#ffd257'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      const ang = Math.atan2(ey - sy, ex - sx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 9 * Math.cos(ang - 0.4), ey - 9 * Math.sin(ang - 0.4));
      ctx.lineTo(ex - 9 * Math.cos(ang + 0.4), ey - 9 * Math.sin(ang + 0.4));
      ctx.fill();
      ctx.fillStyle = '#3ddad7';
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawEnergy() {
    const svg = q('#st-gr-energy');
    svg.innerHTML = '';
    const tMax = Math.max(20, orbit ? Math.ceil(orbit.t / 10) * 10 : 20);
    const peak = Math.max(0.01, ...energy.map((e) => Math.abs(e.drift)));
    const yMax = peak > 1 ? Math.min(20, Math.ceil(peak)) : peak > 0.1 ? 1 : peak > 0.01 ? 0.1 : 0.01;
    const tx = (t) => EPLOT.x0 + (t / tMax) * (EPLOT.x1 - EPLOT.x0);
    const ty = (d) => (EPLOT.y0 + EPLOT.y1) / 2 - (Math.max(-yMax, Math.min(yMax, d)) / yMax) * ((EPLOT.y1 - EPLOT.y0) / 2);
    const grid = svgEl('g', { class: 'obs-gridlines' });
    [-yMax, 0, yMax].forEach((d) => {
      grid.appendChild(svgEl('line', { x1: EPLOT.x0, x2: EPLOT.x1, y1: ty(d), y2: ty(d) }));
      const t = svgEl('text', { x: EPLOT.x0 - 4, y: ty(d) + 4, 'text-anchor': 'end' });
      t.textContent = d === 0 ? '0' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), 2)}`;
      grid.appendChild(t);
    });
    const xl = svgEl('text', { x: EPLOT.x1, y: EPLOT.y1 + 16, 'text-anchor': 'end', class: 'obs-axis' });
    xl.textContent = `时间 0 → ${tMax}`;
    const yl = svgEl('text', { x: EPLOT.x0, y: EPLOT.y1 + 16, class: 'obs-axis' });
    yl.textContent = '能量误差 ΔE / |E₀|';
    grid.append(xl, yl);
    svg.appendChild(grid);
    if (energy.length > 1) {
      let d = '';
      energy.forEach((e, i) => { d += `${i ? 'L' : 'M'}${tx(e.t).toFixed(1)},${ty(e.drift).toFixed(1)}`; });
      svg.appendChild(svgEl('path', { class: 'st-gr-eline', d }));
    }
  }

  function readout() {
    const o = orbit;
    q('#st-gr-orbits').textContent = o ? o.orbits.toFixed(2) : '0';
    q('#st-gr-r').textContent = o ? fmt(Math.hypot(o.x, o.y), 3) : fmt(GRAV.r0, 3);
    q('#st-gr-drift').textContent = o ? `${fmt(o.maxDrift * 100, 2)}%` : '—';
    q('#st-gr-vc').textContent = fmt(circularSpeed(GRAV.r0, v().eps), 3);
  }

  function updateHint() {
    const h = q('#obs-hint');
    if (!h) return;
    const vc = circularSpeed(GRAV.r0, v().eps);
    const vesc = Math.sqrt(2 * Math.abs(softPotential(GRAV.r0, v().eps)));
    h.textContent = `提示：切向发射（θ = 90°）时，圆轨道速度 v_c = √(r·g(r)) ≈ ${fmt(vc, 3)}，`
      + `逃逸速度 ≈ √(2|Φ(r₀)|) ≈ ${fmt(vesc, 3)}——速度落在两者之间就会绕着走。`
      + 'ε 是 softening 软化长度（nm20：g = GM/(r² + ε²)，r ≫ ε 时与 1/r² 几乎一样）。'
      + '按 P 做「近心掠过」实验：ε = 0 时卫星擦过中心星、引力暴涨、步长跟不上，能量突变被甩飞；把 ε 调到 0.1 再试一次。';
  }

  function launch(preset = null) {
    if (preset) {
      sliders.set('speed', preset.speed, { silent: true });
      sliders.set('angle', preset.angle, { silent: true });
      sliders.set('dt', preset.dt, { silent: true });
    }
    orbit = launchOrbit({ speed: v().speed, angle: v().angle, eps: v().eps, dt: v().dt });
    trail = [[orbit.x, orbit.y]];
    energy = [{ t: 0, drift: 0 }];
    reported = null;
    if (!ov.solved) ov._status(`发射！速度 ${fmt(v().speed, 3)}、θ = ${v().angle}°、ε = ${v().eps}、dt = ${v().dt}。`, 'near');
    draw(); drawEnergy(); readout();
  }

  function reset() {
    orbit = null;
    trail = [];
    energy = [];
    reported = null;
    if (!ov.solved) ov._status('调好速度与方向，按空格发射。目标：绕中心星 3 圈，不坠毁也不逃逸。', 'far');
    draw(); drawEnergy(); readout();
  }

  function report(o) {
    if (reported === o.status) return;
    reported = o.status;
    const drift = `${fmt(o.maxDrift * 100, 2)}%`;
    if (o.status === 'won') {
      if (ov.solved) { ov._status(`又绕了 3 圈！能量误差最大 ${drift}。`, 'ok'); return; }
      ov._status(
        `绕行 3 圈！能量误差最大 ${drift}：固定步长的 leapfrog 积分器让能量误差有界、不会一路漂走。`
        + '再按 P 试试「近心掠过」，看看 ε 和 dt 有多重要。',
        'ok',
      );
      ov._solve({});
    } else if (o.status === 'escaped') {
      ov._status(o.maxDrift > 0.5
        ? `被甩飞了！近心处距离只有 ${fmt(o.minR, 2)}，引力暴涨、步长 dt 跟不上，能量凭空多出 ${drift}——`
          + '这是数值误差，不是物理。把 ε 调大（softening）或把 dt 调小再试。'
        : '逃逸：速度太大，超过了逃逸速度，卫星一去不回。把速度调小一点。', 'far');
    } else if (o.status === 'crashed') {
      ov._status('坠毁：近心点撞上了中心星——速度太小或方向太偏向中心。', 'far');
    } else if (o.status === 'timeout') {
      ov._status('飞了很久还没绕满 3 圈：轨道太大太扁了，试试更接近圆轨道的速度。', 'far');
    }
  }

  function onPointer(e) {
    const cv = q('#st-gr-canvas');
    const rect = cv.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * CV;
    const py = ((e.clientY - rect.top) / rect.height) * CV;
    const wx = (px - CV / 2) / SCALE - GRAV.r0;
    const wy = (CV / 2 - py) / SCALE;
    const speed = Math.hypot(wx, wy) / ARROW;
    const angle = Math.abs((Math.atan2(wy, wx) * 180) / Math.PI);
    sliders.set('speed', speed);
    sliders.set('angle', angle);
  }

  return {
    hasHint: true,
    keys: '<kbd>↑</kbd><kbd>↓</kbd> 选滑块 · <kbd>←</kbd><kbd>→</kbd> 微调 · <kbd>空格</kbd> 发射 · <kbd>P</kbd> 近心掠过 · <kbd>R</kbd> 重置 · <kbd>Esc</kbd> 离开',

    open() {
      orbit = null; trail = []; energy = []; reported = null;
      ov.bodyEl.innerHTML = `
        <div class="st-row">
          <canvas class="st-gr-canvas" id="st-gr-canvas" width="${CV}" height="${CV}" role="img"
            aria-label="引力沙盒：中心星、卫星轨迹与发射箭头（可拖动箭头设定速度）"></canvas>
          <div class="st-gr-side">
            <svg class="obs-plot" id="st-gr-energy" viewBox="0 0 296 150" role="img" aria-label="能量误差 ΔE/|E₀| 随时间的变化"></svg>
            <div class="obs-readout st-gr-readout">
              <span>已绕行 <b id="st-gr-orbits"></b> / ${GRAV.orbitsToWin} 圈</span>
              <span>r = <b id="st-gr-r"></b></span>
              <span>最大能量误差 <b id="st-gr-drift"></b></span>
              <span>圆轨道速度 v_c ≈ <b id="st-gr-vc"></b></span>
            </div>
            <div class="st-actions">
              <button class="btn primary" type="button" id="st-gr-launch">发射 <kbd>空格</kbd></button>
              <button class="btn" type="button" id="st-gr-plunge">近心掠过 <kbd>P</kbd></button>
              <button class="btn" type="button" id="st-gr-reset">重置 <kbd>R</kbd></button>
            </div>
          </div>
        </div>
        <div class="obs-sliders st-gr-sliders" id="st-gr-sliders"></div>
        <p class="obs-hint" id="obs-hint" hidden></p>`;
      sliders = new SliderGroup(q('#st-gr-sliders'), [
        { key: 'speed', name: 'v', label: '发射速度', ...GRAV.speed, value: GRAV.speed.start, format: (x) => `v = ${x.toFixed(2)}` },
        { key: 'angle', name: 'θ', label: '发射角（与半径方向的夹角，90° 为切向）', ...GRAV.angle, value: GRAV.angle.start, format: (x) => `θ = ${x}°` },
        { key: 'eps', name: 'ε', label: 'softening 软化长度 ε', ...GRAV.eps, value: GRAV.eps.start, format: (x) => `ε = ${x.toFixed(2)}` },
        { key: 'dt', name: 'dt', label: '积分步长 dt', ...GRAV.dt, value: GRAV.dt.start, format: (x) => `dt = ${x.toFixed(3)}` },
      ], () => { updateHint(); readout(); if (!orbit || orbit.status !== 'flying') draw(); });
      q('#st-gr-launch').addEventListener('click', () => launch());
      q('#st-gr-plunge').addEventListener('click', () => launch(PLUNGE));
      q('#st-gr-reset').addEventListener('click', reset);
      const cv = q('#st-gr-canvas');
      cv.addEventListener('pointerdown', (e) => {
        if (orbit && orbit.status === 'flying') return;
        dragging = true;
        cv.setPointerCapture(e.pointerId);
        onPointer(e);
      });
      cv.addEventListener('pointermove', (e) => { if (dragging) onPointer(e); });
      cv.addEventListener('pointerup', () => { dragging = false; });
      cv.addEventListener('pointercancel', () => { dragging = false; });
      updateHint();
      reset();
    },

    tick() {
      if (!orbit || orbit.status !== 'flying') return;
      stepOrbit(orbit, GRAV.stepsPerFrame);
      trail.push([orbit.x, orbit.y]);
      if (trail.length > TRAIL) trail.shift();
      energy.push({ t: orbit.t, drift: (orbit.energy - orbit.e0) / Math.abs(orbit.e0) });
      if (energy.length > 900) energy = energy.filter((_, i) => i % 2 === 0);
      draw(); drawEnergy(); readout();
      if (orbit.status !== 'flying') report(orbit);
      else if (!ov.solved) ov._status(`已绕行 ${orbit.orbits.toFixed(2)} 圈 · 最大能量误差 ${fmt(orbit.maxDrift * 100, 2)}%`, 'near');
    },

    key(e) {
      if (sliders.key(e)) return true;
      if (e.key === ' ') { launch(); return true; }
      if (e.key === 'p' || e.key === 'P') { launch(PLUNGE); return true; }
      if (e.key === 'r' || e.key === 'R') { reset(); return true; }
      return false;
    },

    snapshot() {
      return {
        ...sliders.values, selected: sliders.sel,
        launched: !!orbit, status: orbit ? orbit.status : 'idle',
        orbits: orbit ? orbit.orbits : 0, maxDrift: orbit ? orbit.maxDrift : 0,
        minR: orbit ? orbit.minR : null, t: orbit ? orbit.t : 0,
      };
    },
  };
}
