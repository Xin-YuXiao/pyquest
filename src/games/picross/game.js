// ============================================================
// 星图拼绘（第三章试炼场 · 面板玩法）：Picross 数织 + 切片作画 + Zachtronics 式按句数评分
// - 左：夜空画布 sky（行列游程线索、下标标号、每 5 格粗线；点格子只能打 × 笔记）
// - 右：咒语输入（实时预览：将点亮的格子金色幽灵、将擦掉的红色幽灵、纯选区青色描边）、成绩、咒语程序
// - 「咒语程序」= 已施放的有效咒语列表；成绩 = 程序里给 sky 赋值的句数。可撤销 / 重来（从初始画布重放）。
//   没解出前离开面板，程序保存在 G.games.picross.data.programs，回来接着画。
// - 画对 → 按部件上色揭晓 + 天文小知识 + 奖牌（≤ par 金 / ≤ par+2 银 / 铜），交给面板外壳记录通关。
// 规则与求解器在 logic.js（verify-game-picross.mjs 校验），接口见 ui/GamePanel.js 的 mount(ctx)。
// ============================================================
import './picross.css';
import { SpellInput } from '../../ui/SpellInput.js';
import { fromJS, strValue } from '../../core/npmini.js';
import {
  parseArt, cluesOf, clueStatus, gridsEqual, initialGrid, trySpell, replay, medalOf, previewCells,
} from './logic.js';

const CHIPS = [
  { label: 'sky[', text: 'sky[' }, ']', ':', { label: ',', text: ', ' }, '-1', '::2',
  { label: '= 1', text: ' = 1' }, { label: '= 0', text: ' = 0' }, { label: '1 - sky', text: '1 - sky' }, { label: ';', text: '; ' },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const code = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

export function mount(ctx) {
  const { level, root } = ctx;
  const { rows: R, cols: C, target, parts } = parseArt(level.art);
  const clues = cluesOf(target);
  const best = ctx.bestScore();

  // ---------- 状态 ----------
  const data = ctx.data();
  const saved = (data.programs && data.programs[level.id]) || [];
  let program = [];
  let grid = initialGrid(level);
  let count = 0;
  try {
    const rp = replay(level, saved);
    program = saved.slice();
    grid = rp.grid;
    count = rp.count;
  } catch { /* 关卡数据改过、旧程序重放不了：从头开始 */ }
  let solved = false;
  let preview = { on: new Set(), off: new Set(), selected: new Set(), kind: null };
  const notes = new Set();
  let sumsShown = false;
  let animate = new Set();

  const persist = () => {
    const d = ctx.data();
    d.programs = { ...(d.programs || {}) };
    if (program.length && !solved) d.programs[level.id] = program.slice();
    else delete d.programs[level.id];
    ctx.saveData(d);
  };

  // ---------- 布局 ----------
  root.innerHTML = `
    <div class="pc-wrap">
      <div class="pc-left">
        <div class="pc-board" role="grid" aria-label="夜空画布 sky"></div>
      </div>
      <div class="pc-right">
        <div class="pc-score">
          <span class="pc-score-main">施法 <b class="pc-count">0</b> 句</span>
          <span class="pc-par">参考解 ${level.par} 句</span>
          <span class="pc-medals">🥇 ≤ ${level.par} · 🥈 ≤ ${level.par + 2} · 🥉 画出即可</span>
          <span class="pc-best">${best !== null ? `个人最佳 ${best} 句` : ''}</span>
        </div>
        <div class="pc-shape">sky.shape = (${R}, ${C}) · 行下标 0 ~ ${R - 1}，列下标 0 ~ ${C - 1}</div>
        <div class="pc-spell"></div>
        <div class="pc-preview" aria-live="polite"></div>
        <div class="pc-sums" hidden></div>
        <div class="pc-reveal" hidden></div>
        <div class="pc-prog-head">
          <span>咒语程序</span>
          <span class="pc-prog-n"></span>
          <button class="btn pc-undo" type="button" title="撤销最后一次施法">↶ 撤销</button>
          <button class="btn pc-reset" type="button" title="清空程序，回到初始画布">⟲ 重来</button>
        </div>
        <ol class="pc-prog"></ol>
      </div>
    </div>`;
  const $ = (sel) => root.querySelector(sel);
  const boardEl = $('.pc-board');
  const sumsEl = $('.pc-sums');
  const revealEl = $('.pc-reveal');
  const progEl = $('.pc-prog');
  const undoBtn = $('.pc-undo');
  const resetBtn = $('.pc-reset');
  const previewEl = $('.pc-preview');

  // 格子尺寸：按玩法区当前可用空间与线索长度算（打开提示框后玩法区变矮，onHint 里重算）
  const maxRowClue = Math.max(1, ...clues.rows.map((c) => c.length));
  const maxColClue = Math.max(1, ...clues.cols.map((c) => c.length));
  const clueW = maxRowClue * 15 + 10;
  const clueH = maxColClue * 15 + 6;
  const IDX = 18;
  const FRAME = 24; // 画布内边距 + 边框 + 外框粗线
  let cell = 0;
  function layout() {
    const availW = 540;
    const availH = Math.max(240, root.clientHeight || 440);
    cell = Math.max(20, Math.min(58, Math.floor(Math.min((availW - clueW - IDX - FRAME) / C, (availH - clueH - IDX - FRAME) / R))));
    boardEl.style.setProperty('--cell', `${cell}px`);
    boardEl.style.gridTemplateColumns = `${clueW}px ${IDX}px repeat(${C}, ${cell}px)`;
    boardEl.style.gridTemplateRows = `${clueH}px ${IDX}px repeat(${R}, ${cell}px)`;
  }
  layout();

  // 线索、下标、格子一次性建好，之后只改 class
  const colClueEls = [];
  const rowClueEls = [];
  const colIdxEls = [];
  const rowIdxEls = [];
  const cellEls = [];
  const add = (cls, r, c, html = '') => {
    const d = document.createElement('div');
    d.className = cls;
    d.style.gridRow = String(r);
    d.style.gridColumn = String(c);
    d.innerHTML = html;
    boardEl.appendChild(d);
    return d;
  };
  add('pc-corner', 1, 1, `<span>${R}×${C}</span>`);
  add('pc-corner pc-corner-idx', 2, 2, '');
  for (let j = 0; j < C; j++) {
    colClueEls.push(add('pc-clue pc-clue-col', 1, j + 3, (clues.cols[j].length ? clues.cols[j] : [0]).map((n) => `<i>${n}</i>`).join('')));
    colIdxEls.push(add(`pc-idx pc-idx-col${(j + 1) % 5 === 0 && j < C - 1 ? ' b5' : ''}`, 2, j + 3, String(j)));
  }
  for (let i = 0; i < R; i++) {
    rowClueEls.push(add('pc-clue pc-clue-row', i + 3, 1, (clues.rows[i].length ? clues.rows[i] : [0]).map((n) => `<i>${n}</i>`).join('')));
    rowIdxEls.push(add(`pc-idx pc-idx-row${(i + 1) % 5 === 0 && i < R - 1 ? ' b5' : ''}`, i + 3, 2, String(i)));
    const rowEls = [];
    for (let j = 0; j < C; j++) {
      const thick = `${(j + 1) % 5 === 0 && j < C - 1 ? ' br5' : ''}${(i + 1) % 5 === 0 && i < R - 1 ? ' bb5' : ''}`;
      const el = add(`pc-cell${thick}`, i + 3, j + 3);
      el.dataset.r = String(i);
      el.dataset.c = String(j);
      el.title = `sky[${i}, ${j}]（倒数：sky[${i - R}, ${j - C}]）`;
      el.setAttribute('role', 'gridcell');
      rowEls.push(el);
    }
    cellEls.push(rowEls);
  }

  // 悬停：高亮这一格的行列下标；点击：× 笔记（不算作画）
  boardEl.addEventListener('pointerover', (e) => {
    const el = e.target.closest('.pc-cell');
    rowIdxEls.forEach((x, i) => x.classList.toggle('hot', !!el && Number(el.dataset.r) === i));
    colIdxEls.forEach((x, j) => x.classList.toggle('hot', !!el && Number(el.dataset.c) === j));
  });
  boardEl.addEventListener('pointerleave', () => {
    rowIdxEls.forEach((x) => x.classList.remove('hot'));
    colIdxEls.forEach((x) => x.classList.remove('hot'));
  });
  boardEl.addEventListener('click', (e) => {
    const el = e.target.closest('.pc-cell');
    if (!el || solved) return;
    const k = `${el.dataset.r},${el.dataset.c}`;
    if (notes.has(k)) notes.delete(k); else notes.add(k);
    render();
  });

  // ---------- 绘制 ----------
  function render() {
    const st = clueStatus(grid, clues);
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < C; j++) {
        const el = cellEls[i][j];
        const k = `${i},${j}`;
        const on = !!grid[i][j];
        el.classList.toggle('on', on);
        el.classList.toggle('g-on', preview.on.has(k));
        el.classList.toggle('g-off', preview.off.has(k));
        el.classList.toggle('sel', preview.selected.has(k));
        el.classList.toggle('note', notes.has(k) && !on);
        el.classList.toggle('pop', animate.has(k));
      }
      rowClueEls[i].classList.toggle('ok', st.rows[i]);
    }
    st.cols.forEach((v, j) => colClueEls[j].classList.toggle('ok', v));
    animate = new Set();
    $('.pc-count').textContent = String(count);
    $('.pc-prog-n').textContent = program.length ? `（${program.length} 次施放 · ${count} 句）` : '（还没有施法）';
    progEl.innerHTML = program.length
      ? program.map((s) => `<li><code>${esc(s)}</code></li>`).join('')
      : '<li class="pc-prog-empty">施放成功的咒语会按顺序记在这里——这就是你的「程序」。</li>';
    progEl.scrollTop = progEl.scrollHeight;
    undoBtn.disabled = solved || !program.length;
    resetBtn.disabled = solved || !program.length;
    if (sumsShown) renderSums();
  }

  function renderSums() {
    const fmt = (rowsArr) => strValue(fromJS(rowsArr, 'int'));
    const now = { r: grid.map((r) => r.reduce((a, b) => a + b, 0)), c: grid[0].map((_, j) => grid.reduce((a, r) => a + r[j], 0)) };
    const goal = { r: target.map((r) => r.reduce((a, b) => a + b, 0)), c: target[0].map((_, j) => target.reduce((a, r) => a + r[j], 0)) };
    const line = (label, a, b) => {
      const same = a.every((v, i) => v === b[i]);
      return `<div class="pc-sum${same ? ' ok' : ''}"><code>${label}</code><span>${esc(fmt(a))}</span></div>
        <div class="pc-sum pc-sum-goal${same ? ' ok' : ''}"><em>目标</em><span>${esc(fmt(b))}</span>${same ? '<b>✓</b>' : ''}</div>`;
    };
    sumsEl.innerHTML = `<div class="pc-sums-title">每行 / 每列亮了几格：axis=1 按行求和，axis=0 按列求和</div>${
      line('sky.sum(axis=1)', now.r, goal.r)}${line('sky.sum(axis=0)', now.c, goal.c)}`;
  }

  function showPreviewText() {
    if (preview.kind === 'paint') {
      previewEl.className = 'pc-preview live';
      previewEl.textContent = `预览：将点亮 ${preview.on.size} 格${preview.off.size ? `、擦掉 ${preview.off.size} 格` : ''}（回车施放）`;
    } else if (preview.kind === 'query' && preview.selected.size) {
      previewEl.className = 'pc-preview sel';
      previewEl.textContent = `这个切片选中了 ${preview.selected.size} 格（青色框）——加上「= 1」才会作画`;
    } else if (preview.kind === 'noop') {
      previewEl.className = 'pc-preview';
      previewEl.textContent = '这句咒语不会改变画布';
    } else {
      previewEl.className = 'pc-preview';
      previewEl.textContent = '';
    }
  }

  // ---------- 咒语 ----------
  const spell = new SpellInput($('.pc-spell'), {
    scope: () => ({ sky: fromJS(grid, 'int') }),
    chips: CHIPS,
    placeholder: '例如 sky[2] = 1',
    idleText: '输入咒语时，左边的画布会实时预览：金色 = 将点亮，红色 = 将擦掉，青框 = 选中的切片。',
    onPreview: (res, src) => {
      preview = solved || !src.trim() ? { on: new Set(), off: new Set(), selected: new Set(), kind: null } : previewCells(grid, src);
      showPreviewText();
      render();
    },
    onCast: (src) => cast(src),
  });
  spell.showIdle();

  function cast(src) {
    if (solved) return;
    const r = trySpell(grid, src);
    preview = { on: new Set(), off: new Set(), selected: new Set(), kind: null };
    showPreviewText();
    if (r.kind === 'error') {
      spell.showResult(r.res, null);
      spell.flash();
      ctx.sfx.wrong();
      ctx.status('咒语报错了——看看输入框下面的说明。这一句不计入施法次数。', 'bad');
      render();
      return;
    }
    if (r.kind === 'reject') {
      spell.showMessage(r.reason, 'bad');
      spell.flash();
      ctx.sfx.wrong();
      ctx.status('这句咒语不符合星图拼绘的规则，没有计入。', 'bad');
      render();
      return;
    }
    if (r.kind === 'query') {
      spell.showResult(r.res, { sky: fromJS(grid, 'int') });
      ctx.status('查询不改变画布，也不计入施法次数。', '');
      render();
      return;
    }
    if (r.kind === 'noop') {
      spell.showMessage('画布没有任何变化，这句不计入。', 'bad');
      ctx.status('', '');
      render();
      return;
    }
    // 有效作画
    r.grid.forEach((row, i) => row.forEach((v, j) => { if (v !== grid[i][j]) animate.add(`${i},${j}`); }));
    grid = r.grid;
    count += r.count;
    program.push(src.trim());
    ctx.sfx.pickup();
    spell.setValue('', { preview: false });
    spell.showMessage(`第 ${program.length} 次施法（${r.count} 句）：点亮 ${r.lit} 格${r.erased ? `、擦掉 ${r.erased} 格` : ''}`, 'ok');
    ctx.status(`已施法 ${count} 句`, '');
    if (gridsEqual(grid, target)) {
      solve();
      return;
    }
    persist();
    render();
  }

  function undo() {
    if (solved || !program.length) return;
    program.pop();
    const rp = replay(level, program);
    grid = rp.grid;
    count = rp.count;
    persist();
    spell.showMessage(program.length ? `撤销了一次施法，回到第 ${program.length} 次施法后的画布。` : '撤销完了：回到初始画布。');
    ctx.status('', '');
    spell.preview();
    render();
  }
  function reset() {
    if (solved || !program.length) return;
    program = [];
    grid = initialGrid(level);
    count = 0;
    persist();
    spell.showMessage('清空了咒语程序，回到初始画布。');
    ctx.status('', '');
    spell.preview();
    render();
  }
  undoBtn.addEventListener('click', undo);
  resetBtn.addEventListener('click', reset);

  // ---------- 揭晓 ----------
  function solve() {
    solved = true;
    notes.clear();
    spell.disable(true);
    render();
    boardEl.classList.add('solved');
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < C; j++) {
        const ch = parts[i][j];
        const el = cellEls[i][j];
        if (ch === '.') continue;
        el.style.setProperty('--part', (level.parts[ch] || {}).color || '#ffd257');
        el.style.setProperty('--d', `${(i + j) * 45}ms`);
        el.classList.add('rv');
      }
    }
    const medal = medalOf(count, level.par);
    const legend = Object.values(level.parts).map((p) => `<span><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('');
    revealEl.hidden = false;
    revealEl.innerHTML = `<div class="pc-reveal-title">✦ ${esc(level.title)} <b>${medal.icon} ${medal.name}</b></div>
      <div class="pc-reveal-legend">${legend}</div>
      <div class="pc-reveal-fact">${code(level.fact)}</div>`;
    sumsEl.hidden = true;
    persist();
    const vsPar = count < level.par ? `比参考解还少 ${level.par - count} 句！` : count === level.par ? '与参考解一样精炼。' : `参考解只要 ${level.par} 句——试试再优化？`;
    ctx.status(`画出了「${level.title}」！${vsPar}`, 'ok');
    ctx.win({ score: count, summary: `「${level.title}」 · 施法 ${count} 句（参考解 ${level.par} 句）· ${medal.icon} ${medal.name}。${vsPar}`, delay: 2600 });
  }

  ctx.setKeys('<kbd>Enter</kbd> 施放 · <kbd>↑</kbd><kbd>↓</kbd> 历史咒语 · 点格子打 × 笔记');
  render();
  if (program.length) ctx.status(`接着上次的进度：已施法 ${count} 句。`, '');

  return {
    destroy() { spell.destroy(); root.innerHTML = ''; },
    /** 提示第 1 级起开放「行列求和」读数（把 sum(axis=…) 带进来） */
    onHint(step) {
      if (step >= 1 && !solved) {
        sumsShown = true;
        sumsEl.hidden = false;
        renderSums();
      }
      layout(); // 提示框占了高度，画布跟着缩
    },
    snapshot() {
      const st = clueStatus(grid, clues);
      return {
        level: level.id,
        rows: R,
        cols: C,
        sky: grid.map((r) => r.slice()),
        casts: count,
        program: program.slice(),
        par: level.par,
        solved,
        medal: solved ? medalOf(count, level.par).id : null,
        rowsOk: st.rows,
        colsOk: st.cols,
        preview: { on: preview.on.size, off: preview.off.size, selected: preview.selected.size, kind: preview.kind },
        changes: preview.on.size + preview.off.size,
        notes: notes.size,
        sumsShown,
        input: spell.value,
      };
    },
  };
}

