// ============================================================
// 外星信号（第三章试炼场 · 面板玩法）：射电望远镜收到一串比特流，写一行 NumPy 把它解码成图
//   上：示波器条带——原始的一维比特流（短信号逐位显示 0/1，长信号画成方波；模拟信号画波形），扫描线循环扫过
//   左：解码屏——输入时实时预览：二维数组画成像素图（形状不对就是斜条纹）、一维画成一条、一个数显示数值、报错显示雪花
//   右：频道信息 / 施法次数与 par / 本次判定
//   下：咒语输入行（ui/SpellInput）
// 施法（回车）才判定：得到数组才算一次解码尝试（报错、只算出一个数都不计）；与目标图逐像素一致即过关，
// 按原版配色逐行点亮图像并揭示含义。成绩 = 施法次数（≤ par 金、≤ par + 2 银、其余铜）。
// 判定 / 评分在 logic.js（纯函数，scripts/verify-game-signal.mjs 校验）。
// ============================================================
import './signal.css';
import { SpellInput } from '../../ui/SpellInput.js';
import { run, cloneScope, strValue, toJS, isNDArray, isScalar } from '../../core/npmini.js';
import { makeScope, valueOf, judge, feedback, medalFor, bitCount } from './logic.js';

const COLORS = ['#1d1830', '#3ddad7', '#ff8aa0', '#ffd257'];
const GLOW = ['', 'rgba(61,218,215,.55)', 'rgba(255,138,160,.5)', 'rgba(255,210,87,.6)'];
const SWEEP_MS = 2600;
const REVEAL_MS = 1100;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 让 canvas 的像素缓冲与屏幕尺寸一致（#ui-scale 有缩放），之后按 CSS 像素作画 */
function fitCanvas(cv) {
  const rect = cv.getBoundingClientRect();
  const w = cv.clientWidth || 1;
  const h = cv.clientHeight || 1;
  const k = Math.max(1, ((rect.width / w) || 1) * (window.devicePixelRatio || 1));
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  const g = cv.getContext('2d');
  g.setTransform(k, 0, 0, k, 0, 0);
  g.imageSmoothingEnabled = false;
  return { g, w, h };
}

/** 像素颜色：整数 / 布尔按调色板，浮点按亮度（暗 → 青），越界值标成亮白 / 红 */
function cellColor(v, dtype) {
  if (dtype === 'float') {
    if (!Number.isFinite(v)) return '#f25670';
    const t = Math.max(0, Math.min(1, v));
    const mix = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${mix(29, 61)}, ${mix(24, 218)}, ${mix(48, 215)})`;
  }
  if (v >= 0 && v <= 3 && Number.isInteger(v)) return COLORS[v];
  return v < 0 ? '#f25670' : '#f4efff';
}

export function mount(ctx) {
  const { level, root } = ctx;
  const n = bitCount(level);
  const chans = Object.keys(level.vars);
  let scope = makeScope(level);
  let casts = 0;
  let solved = false;
  let preview = null;   // 实时预览的判定
  let lastCast = null;  // 最近一次施法的判定
  let screen = { mode: 'idle' };
  let reveal = null;    // { t0 }
  let raf = 0;
  let alive = true;

  root.innerHTML = `
    <div class="sg">
      <div class="sg-scope">
        <canvas class="sg-scope-cv" aria-hidden="true"></canvas>
        <div class="sg-scope-tag"><span class="sg-dot"></span><span class="sg-scope-text"></span></div>
      </div>
      <div class="sg-main">
        <div class="sg-screen" role="img" aria-label="解码屏">
          <canvas class="sg-screen-cv"></canvas>
          <div class="sg-screen-tag"></div>
          <div class="sg-reveal" hidden>✓ 解码成功</div>
        </div>
        <div class="sg-side">
          <div class="sg-side-title">📡 接收频道</div>
          <div class="sg-vars"></div>
          <div class="sg-score"></div>
          <div class="sg-verdict" aria-live="polite"></div>
          <button class="btn sg-reset" type="button" title="把变量恢复成刚收到的样子">↺ 重置信号</button>
        </div>
      </div>
      <div class="sg-spell"></div>
    </div>`;
  const $ = (sel) => root.querySelector(sel);
  const scopeCv = $('.sg-scope-cv');
  const screenCv = $('.sg-screen-cv');
  const screenTag = $('.sg-screen-tag');
  const revealEl = $('.sg-reveal');
  const varsEl = $('.sg-vars');
  const scoreEl = $('.sg-score');
  const verdictEl = $('.sg-verdict');
  $('.sg-scope-text').textContent = chans.length === 1
    ? `接收到 ${n} 个比特 · ${chans[0]}${level.vars[chans[0]].dtype === 'float' ? '（模拟信号）' : ''}`
    : `${chans.length} 个频道 ${chans.join(' / ')} · 各 ${n} 个比特`;

  let S = fitCanvas(scopeCv);
  let D = fitCanvas(screenCv);

  // ---------- 右侧：频道信息 / 成绩 / 判定 ----------
  function renderVars() {
    varsEl.innerHTML = '';
    for (const name of chans) {
      const v = scope[name];
      const row = document.createElement('div');
      row.className = 'sg-var';
      let head = '';
      let meta = '';
      if (isNDArray(v)) {
        const r = run(`${name}[:10]`, cloneScope(scope));
        head = r.ok ? strValue(r.value).replace(/\]$/, v.size > 10 ? ' …]' : ']') : '';
        meta = `shape (${v.shape.join(', ')}${v.ndim === 1 ? ',' : ''}) · ${v.dtype === 'int' ? 'int64' : v.dtype === 'float' ? 'float64' : 'bool'}`;
      } else if (v !== undefined) {
        head = strValue(v);
        meta = '（已被改写）';
      }
      row.innerHTML = `<code class="sg-var-name">${esc(name)}</code><span class="sg-var-meta">${esc(meta)}</span><pre class="sg-var-head">${esc(head)}</pre>`;
      varsEl.appendChild(row);
    }
  }

  function renderScore() {
    const best = ctx.bestScore();
    const m = medalFor(Math.max(casts, 1), level.par);
    scoreEl.innerHTML = `
      <div class="sg-casts"><b>${casts}</b> 次施法 <span class="sg-par">par ${level.par}</span></div>
      <div class="sg-medals"><span class="${casts && m.key === 'gold' ? 'on' : ''}">🥇 ≤ ${level.par}</span>
        <span>🥈 ≤ ${level.par + 2}</span><span>🥉 更多</span></div>
      ${best !== null ? `<div class="sg-best">个人最佳：${best} 次</div>` : ''}`;
  }

  function setVerdict(text, cls = '') {
    verdictEl.className = `sg-verdict ${cls}`.trim();
    verdictEl.textContent = text;
  }

  // ---------- 示波器条带 ----------
  function drawScope(t) {
    const { g, w, h } = S;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#151225';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(232,227,245,.06)';
    g.lineWidth = 1;
    for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
    const sweep = solved ? -1 : ((t % SWEEP_MS) / SWEEP_MS) * w;
    const TAG = 14; // 顶部留给右上角的标签
    const band = (h - TAG) / chans.length;
    const left = chans.length > 1 ? 22 : 6;
    const right = w - 6;
    chans.forEach((name, ci) => {
      const data = level.vars[name].data;
      const isFloat = level.vars[name].dtype === 'float';
      const top = TAG + ci * band;
      const step = (right - left) / data.length;
      if (chans.length > 1) {
        g.fillStyle = 'rgba(124,242,154,.85)';
        g.font = 'bold 11px "JetBrains Mono", Consolas, monospace';
        g.fillText(name, 5, top + band / 2 + 4);
      }
      if (!isFloat && data.length <= 64 && chans.length === 1) {
        // 短信号：逐位显示 0 / 1
        g.font = `${Math.min(13, step * 0.7)}px "JetBrains Mono", Consolas, monospace`;
        g.textAlign = 'center';
        data.forEach((b, i) => {
          const x = left + i * step;
          const hot = sweep >= x && sweep < x + step;
          g.fillStyle = b ? (hot ? '#bdf7ef' : '#3ddad7') : (hot ? '#4b4362' : '#2a2440');
          g.fillRect(x + 1, top + 1, step - 2, band - 16);
          g.fillStyle = b ? '#8ff5f1' : 'rgba(232,227,245,.42)';
          g.fillText(String(b), x + step / 2, top + band - 3);
        });
        g.textAlign = 'left';
      } else {
        const y0 = top + band - 4;
        const y1 = top + 3;
        g.beginPath();
        data.forEach((v, i) => {
          const x = left + i * step;
          if (isFloat) {
            // 模拟信号：折线连起每个采样点
            const y = y0 - (y0 - y1) * v;
            if (i === 0) g.moveTo(x + step / 2, y); else g.lineTo(x + step / 2, y);
            return;
          }
          // 方波：每一位画一段水平线，相邻两位不同则在边界竖直跳变
          const y = v ? y1 : y0;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
          g.lineTo(x + step, y);
        });
        g.strokeStyle = '#3ddad7';
        g.lineWidth = 1.4;
        g.shadowColor = 'rgba(61,218,215,.6)';
        g.shadowBlur = 4;
        g.stroke();
        g.shadowBlur = 0;
        if (isFloat) {
          const yc = y0 - (y0 - y1) * 0.5;
          g.setLineDash([3, 4]);
          g.strokeStyle = 'rgba(255,210,87,.35)';
          g.beginPath(); g.moveTo(left, yc); g.lineTo(right, yc); g.stroke();
          g.setLineDash([]);
        }
      }
    });
    if (sweep >= 0) {
      const grd = g.createLinearGradient(sweep - 40, 0, sweep + 4, 0);
      grd.addColorStop(0, 'rgba(61,218,215,0)');
      grd.addColorStop(1, 'rgba(189,247,239,.35)');
      g.fillStyle = grd;
      g.fillRect(sweep - 40, 0, 44, h);
    }
  }

  // ---------- 解码屏 ----------
  function layoutGrid(rows, cols, w, h, pad = 12) {
    const cell = Math.max(1, Math.min(28, Math.floor(Math.min((w - pad * 2) / cols, (h - pad * 2 - 12) / rows))));
    const gap = cell >= 7 ? 1 : 0;
    return { cell, gap, x0: Math.round((w - cols * cell) / 2), y0: Math.round((h - rows * cell) / 2) + 6 };
  }

  function drawFrame() {
    const { g, w, h } = D;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#120f1f';
    g.fillRect(0, 0, w, h);
  }

  function drawGrid(grid, dtype, { upto = Infinity, gold = false } = {}) {
    const { g, w, h } = D;
    const rows = grid.length;
    const cols = grid[0].length;
    const L = layoutGrid(rows, cols, w, h);
    g.fillStyle = gold ? 'rgba(255,210,87,.08)' : 'rgba(61,218,215,.05)';
    g.fillRect(L.x0 - 4, L.y0 - 4, cols * L.cell + 8, rows * L.cell + 8);
    for (let i = 0; i < Math.min(rows, upto); i++) {
      for (let j = 0; j < cols; j++) {
        const v = Number(grid[i][j]);
        const c = cellColor(v, dtype);
        const x = L.x0 + j * L.cell;
        const y = L.y0 + i * L.cell;
        const lit = dtype !== 'float' && v > 0;
        if (lit && L.cell >= 5) { g.shadowColor = GLOW[v] || 'rgba(244,239,255,.5)'; g.shadowBlur = L.cell * 0.6; }
        g.fillStyle = c;
        g.fillRect(x, y, L.cell - L.gap, L.cell - L.gap);
        g.shadowBlur = 0;
      }
    }
  }

  function drawStrip(values, dtype) {
    const { g, w, h } = D;
    const cell = Math.max(1, Math.min(18, (w - 24) / values.length));
    const x0 = (w - cell * values.length) / 2;
    const y = h / 2 - cell / 2;
    values.forEach((v, i) => {
      g.fillStyle = cellColor(Number(v), dtype);
      g.fillRect(x0 + i * cell, y, Math.max(1, cell - (cell >= 6 ? 1 : 0)), Math.max(cell, 10));
    });
  }

  function drawText(lines, color = 'rgba(232,227,245,.7)', size = 15) {
    const { g, w, h } = D;
    g.fillStyle = color;
    g.textAlign = 'center';
    lines.forEach((ln, i) => {
      g.font = i === 0 ? `bold ${size + 6}px "JetBrains Mono", Consolas, monospace` : `${size}px "LXGW WenKai", "KaiTi", serif`;
      g.fillText(ln, w / 2, h / 2 - (lines.length - 1) * 14 + i * 28);
    });
    g.textAlign = 'left';
  }

  function drawStatic() {
    const { g, w, h } = D;
    const s = 6;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const k = Math.random();
        g.fillStyle = `rgba(${150 + k * 90}, ${150 + k * 90}, ${170 + k * 80}, ${0.08 + k * 0.22})`;
        g.fillRect(x, y, s, s);
      }
    }
    g.fillStyle = 'rgba(18,15,31,.7)';
    g.fillRect(w / 2 - 120, h / 2 - 22, 240, 40);
    g.fillStyle = '#ff8aa0';
    g.font = 'bold 16px "LXGW WenKai", "KaiTi", serif';
    g.textAlign = 'center';
    g.fillText('信号失真：咒语出错了', w / 2, h / 2 + 4);
    g.textAlign = 'left';
  }

  /** 画出一个值；from = 'preview' | 'cast' */
  function showValue(v, from) {
    drawFrame();
    const tagFrom = from === 'cast' ? `第 ${casts} 次施法` : '实时预览';
    if (isNDArray(v) && v.ndim === 2) {
      screen = { mode: 'image' };
      drawGrid(toJS(v), v.dtype);
      screenTag.textContent = `${tagFrom} · shape (${v.shape.join(', ')})`;
    } else if (isNDArray(v) && v.ndim === 1) {
      screen = { mode: 'strip' };
      drawStrip(toJS(v), v.dtype);
      drawText(['', '', '', '还是一维：一整行比特'], 'rgba(232,227,245,.55)', 14);
      screenTag.textContent = `${tagFrom} · shape (${v.shape[0]},)`;
    } else if (isNDArray(v)) {
      screen = { mode: 'nd' };
      drawText([`shape (${v.shape.join(', ')})`, '这是 3 维以上的数组——图像只要两维'], '#ffd257');
      screenTag.textContent = tagFrom;
    } else if (isScalar(v)) {
      screen = { mode: 'number' };
      drawText([strValue(v), '一个数（不是图像）'], '#ffd257', 15);
      screenTag.textContent = tagFrom;
    } else {
      screen = { mode: 'idle' };
      drawText(['等待解码……', '在下方写一行 NumPy，把比特流排成图像'], 'rgba(232,227,245,.6)', 15);
      screenTag.textContent = '';
    }
  }

  function showError(from) {
    drawFrame();
    screen = { mode: 'error' };
    drawStatic();
    screenTag.textContent = from === 'cast' ? '施法失败' : '实时预览';
  }

  // ---------- 输入 ----------
  const input = new SpellInput($('.sg-spell'), {
    scope: () => scope,
    chips: level.chips,
    placeholder: chans.length === 1 ? `${chans[0]}.reshape(行数, 列数)   ——  回车施放` : '写一行 NumPy 解码，回车施放',
    idleText: '输入时这里实时显示结果，上面的解码屏同步预览图像。',
    onPreview: (res, src, sc) => {
      if (solved) return;
      if (!res) { preview = null; showValue(null, 'preview'); return; }
      if (!res.ok) { preview = { kind: 'error', ok: false }; showError('preview'); return; }
      const v = valueOf(res, sc);
      const j = judge(level, v);
      preview = { kind: j.kind, shape: j.shape || null, ok: j.ok };
      showValue(v, 'preview');
    },
    onCast: (src) => cast(src),
  });
  input.showIdle();

  function cast(src) {
    if (solved) return;
    const res = run(src, scope);
    input.showResult(res, scope);
    renderVars();
    if (!res.ok) {
      showError('cast');
      input.flash();
      ctx.sfx.wrong();
      setVerdict(`✗ ${res.error.type}：咒语出错了（看下方提示）——这次不算施法。`, 'bad');
      ctx.status('报错不计入施法次数，改好再试。', 'bad');
      return;
    }
    const v = valueOf(res, scope);
    const j = judge(level, v);
    if (!isNDArray(v)) {
      showValue(v, 'preview');
      setVerdict(`${feedback(level, j)}（只是计算，不算解码尝试）`, 'info');
      return;
    }
    casts++;
    lastCast = { kind: j.kind, shape: j.shape || null, ok: j.ok };
    renderScore();
    showValue(v, 'cast');
    if (j.ok) { win(); return; }
    ctx.sfx.wrong();
    input.flash();
    setVerdict(`✗ ${feedback(level, j)}`, 'bad');
    ctx.status(`第 ${casts} 次施法没解出来——观察解码屏上的图案，再调整咒语。`, 'bad');
  }

  function win() {
    solved = true;
    input.disable(true);
    const medal = medalFor(casts, level.par);
    setVerdict(`✓ 解码成功！${medal.icon} ${medal.label}
${level.meaning}`, 'ok');
    ctx.status(`第 ${casts} 次施法解码成功！`, 'ok');
    ctx.sfx.pickup();
    reveal = { t0: performance.now() };
    root.querySelector('.sg-reset').hidden = true; // 解开了就不用重置，把空间让给图案含义
    screenTag.textContent = `shape (${level.target.length}, ${level.target[0].length})`;
    setTimeout(() => { if (alive) revealEl.hidden = false; }, REVEAL_MS);
    ctx.win({
      score: casts,
      summary: `第 ${casts} 次施法解码成功 · ${medal.icon} ${medal.label}（par ${level.par}）`,
      delay: REVEAL_MS + 1500,
    });
  }

  $('.sg-reset').addEventListener('click', () => {
    if (solved) return;
    scope = makeScope(level);
    renderVars();
    setVerdict('信号已重置为刚收到的样子。', 'info');
    input.preview();
    input.focus();
  });

  // ---------- 动画循环：示波器扫描 / 雪花 / 解码揭示 ----------
  function tick(t) {
    if (!alive) return;
    drawScope(t);
    if (reveal) {
      const p = Math.min(1, (t - reveal.t0) / REVEAL_MS);
      drawFrame();
      drawGrid(level.reveal, 'int', { upto: Math.ceil(p * level.reveal.length), gold: true });
      if (p >= 1) { screen = { mode: 'reveal' }; reveal = null; }
    } else if (screen.mode === 'error' && Math.floor(t / 90) !== Math.floor((t - 16) / 90)) {
      drawFrame();
      drawStatic();
    }
    raf = requestAnimationFrame(tick);
  }

  renderVars();
  renderScore();
  setVerdict(level.challenge ? '★ 挑战关：先观察信号是怎么发出来的。' : '回车施放后才判定——先看清解码屏上的图案。', 'info');
  ctx.setKeys('<kbd>Enter</kbd> 施放 · <kbd>↑</kbd><kbd>↓</kbd> 历史 · <kbd>Esc</kbd> 离开');
  showValue(null, 'preview');
  raf = requestAnimationFrame(tick);
  // 面板刚打开时缩放可能还没稳定：下一帧按实际尺寸重新取一次画布
  requestAnimationFrame(() => {
    if (!alive) return;
    S = fitCanvas(scopeCv);
    D = fitCanvas(screenCv);
    if (screen.mode === 'idle') showValue(null, 'preview');
  });

  return {
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      input.destroy();
    },
    snapshot: () => ({
      levelId: level.id,
      bits: n,
      channels: chans,
      casts,
      solved,
      screen: screen.mode,
      preview,
      lastCast,
      input: input.value,
    }),
  };
}
