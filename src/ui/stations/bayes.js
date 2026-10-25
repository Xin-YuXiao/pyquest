// ============================================================
// 第九章观测台「贝叶斯硬币」：一枚可能偏心的硬币，一次次抛，看后验分布怎样收窄
// 先验 × 似然 → 后验（st8）；Beta 先验 + h 次正面 t 次反面 → Beta(a+h, b+t)，众数 (a−1)/(a+b−2)（st18）；
// 可切换「均匀先验」与「有信息先验」，体会数据多了以后先验被淹没（st11）。
// 后验 95% 区间宽度 < 0.2 后才能下结论：0.5 不在区间里 → 偏心；在区间里 → 与公平相容。
// 键盘：1 / 2 抛 1 / 10 次 · U / I 切换先验 · B 判定偏心 · F 判定公平 · H 提示 · Esc 离开
// ============================================================
import {
  COIN, makeCoin, posterior, betaMode, betaMean, betaPdf, betaInterval, coinVerdict,
} from '../../core/stations.js';
import { svgEl, fmt } from './shared.js';

const PLOT = { x0: 40, x1: 588, y0: 10, y1: 150 };   // viewBox 600 × 178
const GRID_N = 200;

export function createBayes(ov) {
  let coin = null;
  let prior = 'flat';
  let feedback = null;   // 最近一次判定错误时的说明

  const q = (s) => ov.bodyEl.querySelector(s);
  const px = (p) => PLOT.x0 + p * (PLOT.x1 - PLOT.x0);

  function current() {
    const pr = COIN.priors[prior];
    const { heads, tails } = coin.state;
    const post = posterior(pr, heads, tails);
    const interval = betaInterval(post.a, post.b);
    return { pr, heads, tails, post, interval, width: interval[1] - interval[0] };
  }

  function curve(fn, yMax) {
    let d = '';
    for (let i = 0; i <= GRID_N; i++) {
      const p = Math.min(1 - 1e-6, Math.max(1e-6, i / GRID_N));
      const y = PLOT.y1 - (Math.min(fn(p), yMax * 1.05) / yMax) * (PLOT.y1 - PLOT.y0);
      d += `${i ? 'L' : 'M'}${px(p).toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  }

  function drawPlot(c) {
    const svg = q('#st-by-plot');
    svg.innerHTML = '';
    const { pr, heads, tails, post, interval } = c;
    const fPrior = (p) => betaPdf(p, pr.a, pr.b);
    const fLike = (p) => betaPdf(p, heads + 1, tails + 1);    // 似然 p^h (1−p)^t，归一化后画
    const fPost = (p) => betaPdf(p, post.a, post.b);
    let yMax = 1;
    for (let i = 1; i < GRID_N; i++) {
      const p = i / GRID_N;
      yMax = Math.max(yMax, fPrior(p), fPost(p), heads + tails ? fLike(p) : 0);
    }
    // 95% 区间带
    svg.appendChild(svgEl('rect', {
      class: 'st-by-band', x: px(interval[0]), y: PLOT.y0, width: Math.max(1, px(interval[1]) - px(interval[0])), height: PLOT.y1 - PLOT.y0,
    }));
    const grid = svgEl('g', { class: 'obs-gridlines' });
    for (let k = 0; k <= 10; k++) {
      const p = k / 10;
      grid.appendChild(svgEl('line', { x1: px(p), x2: px(p), y1: PLOT.y1, y2: PLOT.y1 + 4 }));
      const t = svgEl('text', { x: px(p), y: PLOT.y1 + 16, 'text-anchor': 'middle' });
      t.textContent = p.toFixed(1);
      grid.appendChild(t);
    }
    grid.appendChild(svgEl('line', { x1: PLOT.x0, x2: PLOT.x1, y1: PLOT.y1, y2: PLOT.y1 }));
    const xl = svgEl('text', { x: PLOT.x1, y: PLOT.y0 + 10, 'text-anchor': 'end', class: 'obs-axis' });
    xl.textContent = '正面概率 p';
    grid.appendChild(xl);
    svg.appendChild(grid);
    svg.appendChild(svgEl('line', { class: 'st-by-fair', x1: px(0.5), x2: px(0.5), y1: PLOT.y0, y2: PLOT.y1 }));
    svg.appendChild(svgEl('path', { class: 'st-by-prior', d: curve(fPrior, yMax) }));
    if (heads + tails) svg.appendChild(svgEl('path', { class: 'st-by-like', d: curve(fLike, yMax) }));
    svg.appendChild(svgEl('path', { class: 'st-by-post', d: curve(fPost, yMax) }));
    if (ov.solved) {
      svg.appendChild(svgEl('line', { class: 'st-by-truth', x1: px(coin.state.p), x2: px(coin.state.p), y1: PLOT.y0, y2: PLOT.y1 }));
    }
  }

  function render() {
    const c = current();
    drawPlot(c);
    const { heads, tails, post, interval, width } = c;
    q('#st-by-h').textContent = String(heads);
    q('#st-by-t').textContent = String(tails);
    q('#st-by-post').textContent = `Beta(${post.a}, ${post.b})`;
    const mode = betaMode(post.a, post.b);
    q('#st-by-mode').textContent = mode == null ? '—' : fmt(mode, 3);
    q('#st-by-mean').textContent = fmt(betaMean(post.a, post.b), 3);
    q('#st-by-ci').textContent = `[${interval[0].toFixed(3)}, ${interval[1].toFixed(3)}]`;
    q('#st-by-w').textContent = width.toFixed(3);
    q('#st-by-w').dataset.ok = String(width < COIN.widthGoal);
    q('#st-by-flips').textContent = coin.state.flips.slice(-40).map((f) => (f ? '正' : '反')).join(' ') || '还没抛';
    ['flat', 'informed'].forEach((k) => q(`[data-prior="${k}"]`).setAttribute('aria-pressed', String(prior === k)));
    const canDecide = width < COIN.widthGoal;
    q('#st-by-biased').disabled = !canDecide || ov.solved;
    q('#st-by-fair').disabled = !canDecide || ov.solved;
    if (ov.solved) return;
    if (feedback) { ov._status(feedback, 'near'); return; }
    if (!canDecide) {
      ov._status(heads + tails === 0
        ? '先抛几次收集数据。现在的曲线就是先验：还没见过数据时你对 p 的信念。'
        : `后验 95% 区间宽 ${width.toFixed(3)}，还太宽（要 < ${COIN.widthGoal}）——再抛几次，让数据说话。`, 'far');
    } else {
      ov._status(`区间宽 ${width.toFixed(3)} < ${COIN.widthGoal}，可以下结论了：0.5 落在 95% 区间里吗？`, 'near');
    }
  }

  function toss(k) {
    if (ov.solved) return;
    coin.flip(k);
    feedback = null;
    render();
  }

  function setPrior(k) {
    prior = k;
    feedback = null;
    render();
  }

  function decide(claim) {
    const c = current();
    if (c.width >= COIN.widthGoal || ov.solved) return;
    const verdict = coinVerdict(c.interval);
    const inside = verdict === 'fair';
    if (claim !== verdict) {
      feedback = inside
        ? `0.5 还在 95% 区间 [${c.interval[0].toFixed(3)}, ${c.interval[1].toFixed(3)}] 里：数据和一枚公平硬币是相容的，不能断言它偏心。`
        : `0.5 已经不在 95% 区间 [${c.interval[0].toFixed(3)}, ${c.interval[1].toFixed(3)}] 里：数据不支持「公平」，再看看曲线。`;
      render();
      return;
    }
    const p = coin.state.p;
    const truthWord = p === 0.5 ? '这是一枚公平硬币' : `它确实偏心（偏向${p > 0.5 ? '正面' : '反面'}）`;
    // 真值落在区间外也会发生（约 5% 的时候）：如实说明，区间不是保证
    const missed = p < c.interval[0] || p > c.interval[1]
      ? '注意：真值落在了 95% 区间外——手气不好时就会这样（大约每 20 次碰上 1 次），区间给的是置信度，不是保证。'
      : '';
    ov.solved = true; // 先置位，画图时亮出真值竖线
    render();
    ov._status(
      `判定正确！抛了 ${c.heads + c.tails} 次，后验 Beta(${c.post.a}, ${c.post.b}) 的 95% 区间是 [${c.interval[0].toFixed(3)}, ${c.interval[1].toFixed(3)}]。`
      + `揭晓：真实 p = ${p}，${truthWord}。${missed}后验 ∝ 先验 × 似然——数据越多，曲线越窄、先验的话越轻。`,
      'ok',
    );
    ov._solve({});
  }

  return {
    hasHint: true,
    keys: '<kbd>1</kbd><kbd>2</kbd> 抛 1 / 10 次 · <kbd>U</kbd><kbd>I</kbd> 换先验 · <kbd>B</kbd> 偏心 · <kbd>F</kbd> 公平 · <kbd>Esc</kbd> 离开',

    open() {
      coin = makeCoin(ov.attempt);
      prior = 'flat';
      feedback = null;
      ov.bodyEl.innerHTML = `
        <svg class="obs-plot" id="st-by-plot" viewBox="0 0 600 178" role="img"
          aria-label="先验（虚线）、似然（点线）与后验（实线）分布，金色带为后验 95% 区间，竖线为公平硬币 p = 0.5"></svg>
        <div class="st-legend" aria-hidden="true">
          <span><i class="lg-prior"></i>先验</span><span><i class="lg-like"></i>似然（归一化）</span>
          <span><i class="lg-post"></i>后验</span><span><i class="lg-band"></i>后验 95% 区间</span>
          <span><i class="lg-fair"></i>公平 p = 0.5</span>
        </div>
        <div class="obs-readout">
          <span>正面 <b id="st-by-h"></b> · 反面 <b id="st-by-t"></b></span>
          <span>后验 <b id="st-by-post"></b></span>
          <span>众数 <b id="st-by-mode"></b></span>
          <span>均值 <b id="st-by-mean"></b></span>
          <span>95% 区间 <b id="st-by-ci"></b> 宽 <b id="st-by-w" class="st-by-w"></b></span>
        </div>
        <p class="st-by-flips" id="st-by-flips" aria-label="最近的抛掷结果"></p>
        <div class="st-actions">
          <button class="btn" type="button" id="st-by-1">抛 1 次 <kbd>1</kbd></button>
          <button class="btn" type="button" id="st-by-10">抛 10 次 <kbd>2</kbd></button>
          <button class="btn" type="button" data-prior="flat" title="${COIN.priors.flat.name}">均匀 Beta(1,1) <kbd>U</kbd></button>
          <button class="btn" type="button" data-prior="informed" title="${COIN.priors.informed.name}：以往见过的硬币大多公平">有信息 Beta(10,10) <kbd>I</kbd></button>
        </div>
        <div class="st-actions">
          <button class="btn" type="button" id="st-by-biased">判定：偏心 <kbd>B</kbd></button>
          <button class="btn" type="button" id="st-by-fair">判定：公平 <kbd>F</kbd></button>
        </div>
        <p class="obs-hint" id="obs-hint" hidden>提示：后验 ∝ 先验 × 似然（st8）。均匀先验 Beta(1, 1) 抛出 h 次正面、t 次反面，
          后验就是 Beta(1 + h, 1 + t)，众数 (a−1)/(a+b−2) 回到频率估计 h/(h+t)（st18：3 正 2 反 → 0.6）。
          有信息先验 Beta(10, 10) 相当于「以前见过 20 次、正反各半」：数据少时它把估计往 0.5 拉，
          数据多了就被淹没——切换两种先验对比一下（st11 的先验敏感性）。</p>`;
      q('#st-by-1').addEventListener('click', () => toss(1));
      q('#st-by-10').addEventListener('click', () => toss(10));
      ov.bodyEl.querySelectorAll('[data-prior]').forEach((b) => b.addEventListener('click', () => setPrior(b.dataset.prior)));
      q('#st-by-biased').addEventListener('click', () => decide('biased'));
      q('#st-by-fair').addEventListener('click', () => decide('fair'));
      render();
    },

    tick() {},

    key(e) {
      const k = e.key;
      if (k === '1') { toss(1); return true; }
      if (k === '2') { toss(10); return true; }
      if (k === 'u' || k === 'U') { setPrior('flat'); return true; }
      if (k === 'i' || k === 'I') { setPrior('informed'); return true; }
      if (k === 'b' || k === 'B') { decide('biased'); return true; }
      if (k === 'f' || k === 'F') { decide('fair'); return true; }
      return false;
    },

    snapshot() {
      const c = current();
      return {
        prior, heads: c.heads, tails: c.tails, a: c.post.a, b: c.post.b,
        interval: c.interval, width: c.width, canDecide: c.width < COIN.widthGoal,
        verdict: coinVerdict(c.interval), feedback,
        truth: ov.solved ? coin.state.p : null,
      };
    },
  };
}
