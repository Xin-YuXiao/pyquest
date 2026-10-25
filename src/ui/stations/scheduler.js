// ============================================================
// 第五章观测台「并行搬砖」：12 个耗时不同的独立任务分给 4 个 worker（Pool(4) / mpirun -np 4）
// 总耗时 = 最忙的 worker 干完的时刻；目标：不超过最优的 1.1 倍。
// 「轮转」= range(rank, nruns, size) 按编号摊派（sp7），不看任务大小；
// 「贪心」= 最长任务优先交给当前最闲的 worker（LPT，题库未覆盖，面板演示用）。
// 键盘：←/→ 选任务 · 1–4 交给 rank 0–3 · 0 撤回 · R 轮转 · G 贪心 · C 清空 · H 提示 · Esc 离开
// ============================================================
import { SCHED, makeTasks, loadsOf, makespan, roundRobin, greedyLPT } from '../../core/stations.js';
import { svgEl, fmt } from './shared.js';

const LANE_COLORS = ['#8fd6ff', '#b5e48c', '#ffd257', '#ff9db8'];
const G = { x0: 64, x1: 584, y0: 8, lane: 34, gap: 6 };   // 甘特图（viewBox 600 × 186）
const VIEW_H = 186;

export function createScheduler(ov) {
  let data = null;
  let assign = [];
  let sel = 0;
  let last = null; // 最近一次整体策略：'rr' | 'lpt' | null（手动）

  const goal = () => SCHED.load * SCHED.tolerance;
  const q = (s) => ov.bodyEl.querySelector(s);

  function drawGantt() {
    const svg = q('#st-sc-gantt');
    svg.innerHTML = '';
    const span = makespan(data.tasks, assign);
    const tMax = Math.max(40, Math.ceil(span / 4) * 4 + 4);
    const tx = (t) => G.x0 + (t / tMax) * (G.x1 - G.x0);
    const laneY = (w) => G.y0 + w * (G.lane + G.gap);
    const grid = svgEl('g', { class: 'obs-gridlines' });
    for (let t = 0; t <= tMax; t += 4) {
      grid.appendChild(svgEl('line', { x1: tx(t), x2: tx(t), y1: G.y0, y2: laneY(SCHED.workers) - G.gap }));
      const lab = svgEl('text', { x: tx(t), y: laneY(SCHED.workers) + 8, 'text-anchor': 'middle' });
      lab.textContent = String(t);
      grid.appendChild(lab);
    }
    const xl = svgEl('text', { x: G.x0 - 8, y: laneY(SCHED.workers) + 8, 'text-anchor': 'end', class: 'obs-axis' });
    xl.textContent = '秒';
    grid.appendChild(xl);
    svg.appendChild(grid);
    // 每条流水线：rank 标签 + 依次排开的任务块
    for (let w = 0; w < SCHED.workers; w++) {
      const y = laneY(w);
      const lane = svgEl('rect', {
        class: 'st-sc-lane', x: G.x0, y, width: G.x1 - G.x0, height: G.lane, 'data-worker': w,
      });
      lane.addEventListener('click', () => assignSel(w));
      svg.appendChild(lane);
      const lab = svgEl('text', { x: G.x0 - 8, y: y + G.lane / 2 + 4, 'text-anchor': 'end', class: 'st-sc-rank' });
      lab.textContent = `rank ${w}`;
      svg.appendChild(lab);
      let t = 0;
      data.tasks.forEach((task, i) => {
        if (assign[i] !== w) return;
        const block = svgEl('rect', {
          x: tx(t) + 1, y: y + 3, width: Math.max(2, tx(t + task.cost) - tx(t) - 2), height: G.lane - 6,
          rx: 4, fill: LANE_COLORS[w], class: i === sel ? 'st-sc-block sel' : 'st-sc-block',
        });
        block.addEventListener('click', (e) => { e.stopPropagation(); sel = i; render(); });
        svg.appendChild(block);
        const tl = svgEl('text', { x: tx(t + task.cost / 2), y: y + G.lane / 2 + 4, 'text-anchor': 'middle', class: 'st-sc-label' });
        tl.textContent = `T${i}·${task.cost}`;
        svg.appendChild(tl);
        t += task.cost;
      });
    }
    // 参考线：最优 / 目标 / 当前总耗时
    const yTop = G.y0 - 2, yBot = laneY(SCHED.workers) - G.gap + 2;
    svg.appendChild(svgEl('line', { class: 'st-sc-opt', x1: tx(SCHED.load), x2: tx(SCHED.load), y1: yTop, y2: yBot }));
    svg.appendChild(svgEl('line', { class: 'st-sc-goal', x1: tx(goal()), x2: tx(goal()), y1: yTop, y2: yBot }));
    if (span > 0) svg.appendChild(svgEl('line', { class: 'st-sc-span', x1: tx(span), x2: tx(span), y1: yTop, y2: yBot }));
  }

  function drawTasks() {
    const box = q('#st-sc-tasks');
    box.innerHTML = '';
    data.tasks.forEach((task, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `st-sc-task${i === sel ? ' sel' : ''}${assign[i] >= 0 ? ' done' : ''}`;
      b.dataset.task = String(i);
      if (assign[i] >= 0) b.style.background = LANE_COLORS[assign[i]];
      b.textContent = `T${i} · ${task.cost}s`;
      b.setAttribute('aria-label', `任务 ${i}，耗时 ${task.cost} 秒，${assign[i] >= 0 ? `已分给 rank ${assign[i]}` : '未分配'}`);
      b.addEventListener('click', () => { sel = i; render(); });
      box.appendChild(b);
    });
  }

  function render() {
    drawTasks();
    drawGantt();
    const span = makespan(data.tasks, assign);
    const done = assign.every((w) => w >= 0);
    const loads = loadsOf(data.tasks, assign);
    q('#st-sc-span').textContent = span ? `${span} s` : '—';
    q('#st-sc-speed').textContent = span ? `${fmt(data.serial / span, 3)}×` : '—';
    q('#st-sc-left').textContent = String(assign.filter((w) => w < 0).length);
    if (ov.solved) return;
    if (!done) {
      ov._status(`还有 ${assign.filter((w) => w < 0).length} 个任务没分配：选一个任务，再点一条流水线（或按 1–4）。`, 'far');
      return;
    }
    if (span <= goal()) {
      ov._status(
        `总耗时 ${span} 秒 ≤ 目标 ${fmt(goal(), 3)} 秒，加速比 ${fmt(data.serial / span, 3)}×（理想 4×）。`
        + '任务彼此独立、谁都不用等谁，才能这样随便摊给多核（sp12）；负载越均衡，最慢那条流水线就越早收工。',
        'ok',
      );
      ov._solve({});
      return;
    }
    const busy = loads.indexOf(Math.max(...loads));
    const idle = loads.indexOf(Math.min(...loads));
    const why = last === 'rr'
      ? `轮转只按编号摊派（range(rank, 12, 4)，sp7），不看任务大小：rank ${busy} 分到了 ${loads[busy]} 秒的活，rank ${idle} 只有 ${loads[idle]} 秒。`
      : `rank ${busy} 要干 ${loads[busy]} 秒，rank ${idle} 只有 ${loads[idle]} 秒——最慢的那条流水线决定总耗时。`;
    ov._status(`${why} 总耗时 ${span} 秒，目标 ≤ ${fmt(goal(), 3)} 秒。`, 'near');
  }

  function assignSel(w) {
    if (sel < 0 || sel >= data.tasks.length) return;
    assign[sel] = w;
    last = null;
    // 自动跳到下一个未分配的任务
    const next = assign.findIndex((x, i) => x < 0 && i > sel);
    const first = assign.findIndex((x) => x < 0);
    sel = next >= 0 ? next : first >= 0 ? first : sel;
    render();
  }

  function apply(kind) {
    assign = kind === 'rr' ? roundRobin(data.tasks) : kind === 'lpt' ? greedyLPT(data.tasks) : data.tasks.map(() => -1);
    last = kind === 'clear' ? null : kind;
    sel = 0;
    render();
  }

  return {
    hasHint: true,
    keys: '<kbd>←</kbd><kbd>→</kbd> 选任务 · <kbd>1</kbd>–<kbd>4</kbd> 分给 rank · <kbd>R</kbd> 轮转 · <kbd>G</kbd> 贪心 · <kbd>C</kbd> 清空 · <kbd>Esc</kbd> 离开',

    open() {
      data = makeTasks(ov.attempt);
      assign = data.tasks.map(() => -1);
      sel = 0;
      last = null;
      ov.bodyEl.innerHTML = `
        <div class="st-sc-tasks" id="st-sc-tasks" role="group" aria-label="待分配的任务"></div>
        <svg class="obs-plot" id="st-sc-gantt" viewBox="0 0 600 ${VIEW_H}" role="img"
          aria-label="甘特图：4 个 worker 各自的任务排程；绿线最优 24 秒，金线目标，粉线当前总耗时"></svg>
        <div class="obs-readout">
          <span>串行总耗时 Σ = <b>${data.serial} s</b></span>
          <span>并行总耗时 max = <b id="st-sc-span"></b></span>
          <span>加速比 = <b id="st-sc-speed"></b></span>
          <span>未分配 <b id="st-sc-left"></b></span>
        </div>
        <div class="st-legend" aria-hidden="true">
          <span><i class="lg-opt"></i>最优 ${SCHED.load} s（Σ/4）</span>
          <span><i class="lg-goal"></i>目标 ≤ ${fmt(goal(), 3)} s</span>
          <span><i class="lg-span"></i>当前总耗时</span>
        </div>
        <div class="st-actions">
          <button class="btn" type="button" id="st-sc-rr">轮转 range(rank, 12, 4) <kbd>R</kbd></button>
          <button class="btn" type="button" id="st-sc-lpt">贪心：长任务先给最闲的 <kbd>G</kbd></button>
          <button class="btn" type="button" id="st-sc-clear">清空 <kbd>C</kbd></button>
        </div>
        <p class="obs-hint" id="obs-hint" hidden>提示：总耗时取决于最忙的那个 worker。先把最长的几个任务分别交给不同的 rank，
          再用短任务把各条流水线补到差不多齐——Pool.map 能这样摊，是因为每个任务彼此独立（sp3 / sp12）。</p>`;
      q('#st-sc-rr').addEventListener('click', () => apply('rr'));
      q('#st-sc-lpt').addEventListener('click', () => apply('lpt'));
      q('#st-sc-clear').addEventListener('click', () => apply('clear'));
      render();
    },

    tick() {},

    key(e) {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        sel = (sel + (k === 'ArrowRight' ? 1 : -1) + data.tasks.length) % data.tasks.length;
        render();
        return true;
      }
      const w = ['1', '2', '3', '4'].indexOf(k);
      if (w >= 0) { assignSel(w); return true; }
      if (k === '0' || k === 'Backspace') { assign[sel] = -1; last = null; render(); return true; }
      if (k === 'r' || k === 'R') { apply('rr'); return true; }
      if (k === 'g' || k === 'G') { apply('lpt'); return true; }
      if (k === 'c' || k === 'C') { apply('clear'); return true; }
      return false;
    },

    snapshot() {
      return {
        costs: data.tasks.map((t) => t.cost), assign: [...assign], selected: sel,
        makespan: makespan(data.tasks, assign), optimal: data.optimal, goal: goal(),
        allAssigned: assign.every((w) => w >= 0),
      };
    },
  };
}
