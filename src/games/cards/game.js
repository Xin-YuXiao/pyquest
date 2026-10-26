// ============================================================
// 阵列牌局 · 面板玩法（ui/GamePanel 调用 mount；规则全在 battle.js，这里只管显示与交互）
//
// 布局（面板 body ≈ 890×390）：
//   上：战场（一维一排 / 二维阵型，头顶意图、血条、下标）｜ 右侧「数组视图」hp / atk 的 print 与战斗日志
//   中：勇者状态（生命 / 格挡 / 能量）｜ 咒语行 >>> hp[1:4] -= 3（自由咒语在方括号里直接打字）｜ 施放 / 结束回合
//   下：手牌（费用角标、类型色、键位数字、「新」标记）
// 交互：点选择器卡 + 点操作卡 → 咒语行实时拼出代码、战场高亮会命中谁和预计伤害 → 施放；技能卡点了立即生效。
// 键盘：1–9 / 0 选第几张牌 · Enter 或空格施放 · E 结束回合 · Backspace 清空选择（自由咒语输入框里按键不外泄）。
// ============================================================
import './cards.css';
import { getCard, cardDesc, opCost } from './cards.js';
import {
  createBattle, preview, cast, useSkill, endTurn, hpValues, atkValues, intents, idxLabel,
  rewardChoices, medal, snapshotBattle, ENERGY,
} from './battle.js';
import { spriteSVG } from './sprites.js';
import { strValue } from '../../core/npmini.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TYPE_NAME = { sel: '选择器', op: '操作', skill: '技能' };
const MAX_EXTRA = 12;

export function mount(ctx) {
  const level = ctx.level;
  const data = ctx.data();
  data.extra = Array.isArray(data.extra) ? data.extra.filter(getCard) : [];
  data.attempts = data.attempts && typeof data.attempts === 'object' && !Array.isArray(data.attempts) ? data.attempts : {};
  let attempt = Number(data.attempts[level.id]) || 0;

  const root = ctx.root;
  root.innerHTML = `
    <div class="cb">
      <div class="cb-top">
        <div class="cb-field"></div>
        <div class="cb-side">
          <div class="cb-arrays">
            <div class="cb-arr"><code class="cb-arr-name">hp</code><pre class="cb-arr-val" data-arr="hp"></pre></div>
            <div class="cb-arr"><code class="cb-arr-name">atk</code><pre class="cb-arr-val" data-arr="atk"></pre></div>
          </div>
          <div class="cb-log" aria-live="polite"></div>
        </div>
      </div>
      <div class="cb-bar">
        <div class="cb-player">
          <span class="cb-heart">❤</span>
          <div class="cb-hpbar"><i></i><span></span></div>
          <span class="cb-block" title="格挡：本回合抵挡的伤害">🛡 <b>0</b></span>
          <span class="cb-energy" title="能量：每回合 3 点"></span>
        </div>
        <div class="cb-line"><span class="cb-prompt">&gt;&gt;&gt;</span><span class="cb-code"></span></div>
        <div class="cb-btns">
          <button class="btn primary cb-cast" type="button">施放 ⏎</button>
          <button class="btn cb-end" type="button">结束回合 <kbd>E</kbd></button>
          <button class="btn cb-restart" type="button" title="重新开战（换一手牌）">↺</button>
        </div>
      </div>
      <div class="cb-hand-wrap">
        <span class="cb-pile cb-draw" title="抽牌堆"></span>
        <div class="cb-hand"></div>
        <span class="cb-pile cb-disc" title="弃牌堆"></span>
      </div>
      <div class="cb-banner" hidden></div>
      <div class="cb-overlay" hidden></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const el = {
    wrap: $('.cb'), field: $('.cb-field'), log: $('.cb-log'), hpArr: $('[data-arr="hp"]'), atkArr: $('[data-arr="atk"]'),
    hpbar: $('.cb-hpbar i'), hptext: $('.cb-hpbar span'), player: $('.cb-player'), block: $('.cb-block b'),
    energy: $('.cb-energy'), code: $('.cb-code'), line: $('.cb-line'), castBtn: $('.cb-cast'), endBtn: $('.cb-end'),
    restartBtn: $('.cb-restart'), hand: $('.cb-hand'), draw: $('.cb-draw'), disc: $('.cb-disc'),
    banner: $('.cb-banner'), overlay: $('.cb-overlay'),
  };
  // 自由咒语的输入框只建一次：重排咒语行时搬来搬去会丢焦点
  const freeInput = document.createElement('input');
  freeInput.className = 'cb-free';
  freeInput.type = 'text';
  freeInput.spellcheck = false;
  freeInput.autocomplete = 'off';
  freeInput.setAttribute('autocapitalize', 'off');
  freeInput.placeholder = '在这里写下标';
  freeInput.setAttribute('aria-label', '自由咒语：方括号里的下标');

  let st = null;
  let sel = null;
  let op = null;
  let free = '';
  let phase = 'battle';
  let busy = false;
  let last = null;
  let rewardOpts = [];
  let enemyEls = [];
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  ctx.setKeys('<kbd>1</kbd>–<kbd>9</kbd> 选牌 · <kbd>Enter</kbd> 施放 · <kbd>E</kbd> 结束回合 · <kbd>⌫</kbd> 取消选择');

  // ---------------------------------------------------------- 战斗开始
  function startBattle() {
    st = createBattle(level, { attempt, extra: data.extra });
    sel = null; op = null; free = ''; freeInput.value = '';
    phase = 'battle'; busy = false; last = null;
    el.overlay.hidden = true;
    buildField();
    renderAll();
    flashBanner(`第 1 回合 · ${level.title}`);
  }

  function buildField() {
    const shape = st.shape;
    el.field.innerHTML = '';
    el.field.dataset.ndim = String(st.ndim);
    enemyEls = [];
    // 一维：敌人少就画大一点（3 个 72px … 8 个 48px）；二维阵型两行 44px、三行 34px
    const n = shape[0];
    const spritePx = st.ndim === 2 ? (n <= 2 ? 44 : 34) : n <= 3 ? 72 : n <= 5 ? 60 : n <= 6 ? 54 : 48;
    el.field.style.setProperty('--cell', `${st.ndim === 2 ? (n <= 2 ? 100 : 84) : n <= 3 ? 104 : n <= 5 ? 92 : n <= 6 ? 84 : 72}px`);
    const cell = (i) => {
      const e = st.enemies[i];
      const d = document.createElement('div');
      d.className = `cb-enemy k-${e.kind}`;
      d.dataset.i = String(i);
      d.innerHTML = `
        ${st.ndim === 1 ? `<div class="cb-idx">[${i}]</div>` : ''}
        <div class="cb-intent"></div>
        <div class="cb-body">${spriteSVG(e.kind, spritePx)}<div class="cb-ghost"></div></div>
        <div class="cb-hp"><i></i><b></b></div>`;
      d.addEventListener('mouseenter', () => d.classList.add('hover'));
      d.addEventListener('mouseleave', () => d.classList.remove('hover'));
      enemyEls[i] = d;
      return d;
    };
    if (st.ndim === 1) {
      const row = document.createElement('div');
      row.className = 'cb-row';
      for (let i = 0; i < shape[0]; i++) row.appendChild(cell(i));
      el.field.appendChild(row);
    } else {
      const [R, C] = shape;
      const grid = document.createElement('div');
      grid.className = 'cb-grid';
      grid.style.gridTemplateColumns = `22px repeat(${C}, 1fr)`;
      grid.appendChild(Object.assign(document.createElement('span'), { className: 'cb-axis corner', textContent: '' }));
      for (let c = 0; c < C; c++) {
        grid.appendChild(Object.assign(document.createElement('span'), { className: 'cb-axis col', textContent: String(c), title: `第 ${c} 列：hp[:, ${c}]` }));
      }
      for (let r = 0; r < R; r++) {
        grid.appendChild(Object.assign(document.createElement('span'), { className: 'cb-axis row', textContent: String(r), title: `第 ${r} 行：hp[${r}]` }));
        for (let c = 0; c < C; c++) grid.appendChild(cell(r * C + c));
      }
      el.field.appendChild(grid);
    }
  }

  // ---------------------------------------------------------- 渲染
  function renderAll() {
    renderEnemies();
    renderSide();
    renderPlayer();
    renderLine();
    renderHand();
    updatePreview();
  }

  function intentHTML(a) {
    if (!a) return '';
    if (a.t === 'a') return `<span class="it atk">⚔ ${a.v}</span>`;
    if (a.t === 'h') return `<span class="it heal">✚ ${a.v}</span>`;
    if (a.t === 'g') return `<span class="it grow">▲ ${a.v}</span>`;
    if (a.t === 'u') return `<span class="it undying">☠ +${a.v}</span>`;
    return '<span class="it wait">…</span>';
  }
  const intentTitle = (a) => (!a ? '' : a.t === 'a' ? `下回合攻击 ${a.v}`
    : a.t === 'h' ? `为全体回血：hp[hp > 0] += ${a.v}` : a.t === 'g' ? `自己生命 +${a.v}`
      : a.t === 'u' ? `不死：hp[hp > 0] += ${a.v}` : '蓄势中');

  function renderEnemies() {
    const hp = hpValues(st);
    const acts = intents(st);
    hp.forEach((v, i) => {
      const d = enemyEls[i];
      if (!d) return;
      const e = st.enemies[i];
      d.classList.toggle('dead', v <= 0);
      d.querySelector('.cb-intent').innerHTML = intentHTML(acts[i]);
      d.querySelector('.cb-hp i').style.width = `${Math.max(0, Math.min(100, (v / e.maxHp) * 100))}%`;
      d.querySelector('.cb-hp b').textContent = v > 0 ? String(v) : '✝';
      d.title = `${e.name} · hp[${idxLabel(st.shape, i)}] = ${v}${acts[i] ? ` · ${intentTitle(acts[i])}` : ''}`;
    });
  }

  function renderSide() {
    el.hpArr.textContent = strValue(st.scope.hp);
    el.atkArr.textContent = strValue(st.scope.atk);
    const tip = st.log.filter((l) => l.code).length ? ''
      : '<div class="cb-log-tip">你打出的每一行咒语、敌人的每一步，都会用 NumPy 记在这里。</div>';
    el.log.innerHTML = tip + st.log.slice(-14).map((l) => {
      if (l.who === 'sys' && !l.code) return `<div class="cb-log-l sys">— ${esc(l.note)} —</div>`;
      const pr = l.who === 'player' ? '&gt;&gt;&gt;' : l.who === 'enemy' ? '👾' : '⚙';
      return `<div class="cb-log-l who-${l.who}"><span class="pr">${pr}</span><code>${esc(l.code)}</code>${l.note ? `<span class="note"># ${esc(l.note)}</span>` : ''}</div>`;
    }).join('');
    el.log.scrollTop = el.log.scrollHeight;
  }

  function renderPlayer() {
    const p = st.player;
    el.hpbar.style.width = `${(p.hp / p.maxHp) * 100}%`;
    el.hptext.textContent = `${p.hp} / ${p.maxHp}`;
    el.block.textContent = String(p.block);
    el.block.parentElement.classList.toggle('on', p.block > 0);
    el.energy.innerHTML = Array.from({ length: Math.max(ENERGY, p.energy) }, (_, k) => `<i class="${k < p.energy ? 'full' : ''}"></i>`).join('')
      + `<b>${p.energy}</b>`;
    el.draw.textContent = `抽 ${st.drawPile.length}`;
    el.disc.textContent = `弃 ${st.discard.length}`;
  }

  const cardOf = (uid) => st.hand.find((c) => c.uid === uid) || null;

  function renderLine() {
    const sc = sel !== null && cardOf(sel) ? getCard(cardOf(sel).id) : null;
    const oc = op !== null && cardOf(op) ? getCard(cardOf(op).id) : null;
    el.code.innerHTML = '';
    const add = (cls, text) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      el.code.appendChild(s);
      return s;
    };
    if (!sc && !oc) {
      add('seg hint', '点一张选择器卡（打谁）+ 一张操作卡（怎么打）');
      return;
    }
    add('seg var', 'hp');
    if (sc && sc.free) {
      add('seg sel', '[');
      el.code.appendChild(freeInput);
      add('seg sel', ']');
      el.line.classList.add('free');
    } else {
      el.line.classList.remove('free');
      if (sc) add('seg sel', sc.code);
    }
    add('seg sp', ' ');
    if (oc) add('seg op', oc.code);
    else add('seg ghost', '□ 再选一张操作卡');
    if (oc && !sc) add('seg tag', `整个数组 · ${opCost(oc, true)}⚡`);
  }

  function renderHand() {
    el.hand.innerHTML = '';
    const newSet = new Set(level.newCards || []);
    st.hand.forEach((c, k) => {
      const def = getCard(c.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `cb-card k-${def.kind}${def.free ? ' k-free' : ''}`;
      b.dataset.uid = String(c.uid);
      b.dataset.card = c.id;
      const armed = c.uid === sel || c.uid === op;
      if (armed) b.classList.add('armed');
      const cost = def.cost;
      if (def.kind !== 'sel' && cost > st.player.energy) b.classList.add('poor');
      b.innerHTML = `
        <span class="cb-cost">${cost}</span>
        <span class="cb-type">${def.free ? '自由咒语' : TYPE_NAME[def.kind]}</span>
        <span class="cb-ccode${def.code.length > 7 ? ' long' : ''}">${esc(def.code)}</span>
        <span class="cb-cdesc">${esc(def.name ? `${def.name}：${cardDesc(def, st.ndim)}` : cardDesc(def, st.ndim))}</span>
        <span class="cb-key">${k < 9 ? k + 1 : k === 9 ? 0 : ''}</span>
        ${newSet.has(c.id) ? '<span class="cb-new">新</span>' : ''}`;
      b.style.setProperty('--fan', String(k - (st.hand.length - 1) / 2));
      b.addEventListener('click', () => clickCard(c.uid));
      el.hand.appendChild(b);
    });
    el.hand.classList.toggle('crowded', st.hand.length > 8);
  }

  // ---------------------------------------------------------- 预览
  function updatePreview() {
    enemyEls.forEach((d) => {
      d.classList.remove('targeted', 'will-die', 'dim');
      d.querySelector('.cb-ghost').textContent = '';
    });
    const canAct = phase === 'battle' && !busy && !st.over;
    el.endBtn.disabled = !canAct;
    el.restartBtn.disabled = busy;
    if (op === null) {
      last = null;
      el.castBtn.disabled = true;
      if (canAct) {
        ctx.status(sel !== null
          ? '再选一张操作卡（-= 3、//= 2 …），拼成一行咒语'
          : '选择器决定「打谁」，操作决定「怎么打」；只打操作卡 = 整个数组一起算', '');
      }
      // 只选了选择器时也预览一下它会选中谁
      if (sel !== null) {
        const opCard = st.hand.find((c) => getCard(c.id).kind === 'op');
        const probe = opCard ? preview(st, { sel, op: opCard.uid, free }) : null;
        if (probe && probe.selection) highlight(probe.selection, null);
        if (probe && !probe.ok && probe.error && probe.error.type) showError(probe.error);
      }
      return;
    }
    const p = preview(st, { sel, op, free });
    last = p;
    if (!p.ok) {
      el.castBtn.disabled = true;
      if (p.selection) highlight(p.selection, null);
      if (p.error) showError(p.error);
      return;
    }
    highlight(p.selection, p.hits);
    const parts = [`命中 ${p.aliveHit} 个`];
    if (p.kills) parts.push(`击倒 ${p.kills} 个`);
    parts.push(`费用 ${p.cost}⚡${p.whole ? '（整个数组 +1）' : ''}`);
    if (!p.aliveHit) {
      ctx.status(p.warn, 'bad');
      el.castBtn.disabled = true;
    } else if (!p.affordable) {
      ctx.status(`${parts.join(' · ')} —— 能量不够（还剩 ${st.player.energy}）`, 'bad');
      el.castBtn.disabled = true;
    } else {
      ctx.status(`${p.line}  →  ${parts.join(' · ')}`, 'ok');
      el.castBtn.disabled = !canAct;
    }
  }

  function showError(e) {
    ctx.status(`${e.type ? `${e.type}: ` : ''}${e.message}${e.hint ? ` —— ${e.hint}` : ''}`, 'bad');
  }

  function highlight(selection, hits) {
    const s = new Set(selection || []);
    const hp = hpValues(st);
    enemyEls.forEach((d, i) => {
      if (s.has(i)) d.classList.add('targeted');
      else if (s.size && hp[i] > 0) d.classList.add('dim');
    });
    (hits || []).forEach((h) => {
      const d = enemyEls[h.i];
      if (!d) return;
      d.querySelector('.cb-ghost').textContent = h.after === 0 ? '✝' : `−${h.before - h.after}`;
      if (h.after === 0) d.classList.add('will-die');
    });
  }

  // ---------------------------------------------------------- 交互
  function clickCard(uid) {
    if (phase !== 'battle' || busy || st.over) return;
    const c = cardOf(uid);
    if (!c) return;
    const def = getCard(c.id);
    if (def.kind === 'skill') {
      const r = useSkill(st, uid);
      if (!r.ok) { ctx.status(r.error.message, 'bad'); shake(el.hand.querySelector(`[data-uid="${uid}"]`)); return; }
      ctx.sfx.pickup();
      if (sel === uid) sel = null;
      if (op === uid) op = null;
      if (def.block) floatOn(el.player, `🛡 +${def.block}`, 'blk');
      renderAll();
      return;
    }
    if (def.kind === 'sel') {
      sel = sel === uid ? null : uid;
      // 换了选择器 / 取消选择：方括号清空，下一次自由咒语从头写
      free = '';
      freeInput.value = '';
    } else op = op === uid ? null : uid;
    ctx.sfx.talk();
    renderLine();
    renderHand();
    // 自由咒语：两张卡都选好了才把焦点交给方括号（否则键盘选操作卡的数字会被打进输入框）
    if (sel !== null && op !== null && getCard(cardOf(sel).id).free) setTimeout(() => freeInput.focus({ preventScroll: true }), 0);
    updatePreview();
  }

  function doCast() {
    if (phase !== 'battle' || busy || st.over || op === null) return;
    const usedEls = [sel, op].filter((u) => u !== null).map((u) => el.hand.querySelector(`[data-uid="${u}"]`)).filter(Boolean);
    const r = cast(st, { sel, op, free });
    if (!r.ok) {
      if (r.error) showError(r.error);
      ctx.sfx.hitEnemy();
      shake(el.line);
      return;
    }
    usedEls.forEach(flyCard);
    ctx.sfx.pickup();
    el.line.classList.remove('cast');
    void el.line.offsetWidth;
    el.line.classList.add('cast');
    // 伤害飘字 + 受击
    r.hits.forEach((h, k) => {
      const d = enemyEls[h.i];
      later(() => {
        d.classList.remove('hit');
        void d.offsetWidth;
        d.classList.add('hit');
        floatOn(d, h.after === 0 ? `−${h.before} ✝` : `−${h.before - h.after}`, h.after === 0 ? 'kill' : 'dmg');
      }, 60 + k * 45);
    });
    if (r.kills) later(() => ctx.sfx.hitEnemy(), 120);
    sel = null; op = null; free = ''; freeInput.value = '';
    renderSide();
    renderPlayer();
    renderLine();
    renderHand();
    later(() => { renderEnemies(); updatePreview(); }, 120 + r.hits.length * 45);
    if (st.over === 'win') {
      busy = true;
      later(showVictory, 700 + r.hits.length * 45);
    } else updatePreview();
  }

  function doEndTurn() {
    if (phase !== 'battle' || busy || st.over) return;
    busy = true;
    phase = 'enemy';
    sel = null; op = null; free = ''; freeInput.value = '';
    renderLine();
    updatePreview();
    // 手牌飞走
    el.hand.querySelectorAll('.cb-card').forEach((c) => c.classList.add('discarding'));
    flashBanner('敌人的回合');
    later(() => {
      const res = endTurn(st);
      const attacks = res.events.filter((e) => e.type === 'attack');
      attacks.forEach((ev, k) => later(() => {
        const d = enemyEls[ev.i];
        d.classList.remove('lunge');
        void d.offsetWidth;
        d.classList.add('lunge');
      }, k * 110));
      const tHurt = attacks.length * 110 + 160;
      later(() => {
        const hurt = res.events.find((e) => e.type === 'hurt');
        if (hurt) {
          if (hurt.v > 0) {
            el.player.classList.remove('hurt');
            void el.player.offsetWidth;
            el.player.classList.add('hurt');
            floatOn(el.player, `−${hurt.v}`, 'dmg');
            ctx.sfx.hitEnemy();
          } else floatOn(el.player, '格挡！', 'blk');
        }
        res.events.filter((e) => e.type !== 'attack' && e.type !== 'hurt').forEach((ev) => {
          const targets = ev.type === 'grow' ? [ev.i] : hpValues(st).map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
          targets.forEach((i) => floatOn(enemyEls[i], `+${ev.v}`, 'heal'));
        });
        renderPlayer();
        renderSide();
      }, tHurt);
      later(() => {
        if (res.lost) { showDefeat(); return; }
        phase = 'battle';
        busy = false;
        renderAll();
        flashBanner(`第 ${st.turn} 回合`);
      }, tHurt + 520);
    }, 420);
  }

  // ---------------------------------------------------------- 结算
  function showVictory() {
    phase = 'reward';
    const turns = st.turn;
    const m = medal(turns, level.par);
    const summary = `用了 ${turns} 回合 · ${m.icon} ${m.name}（标准 ${level.par} 回合）· 打出 ${st.stats.spells} 行咒语`;
    rewardOpts = level.challenge ? [] : rewardChoices(level, attempt);
    const finish = (pick) => {
      if (pick) {
        data.extra = [...data.extra, pick].slice(-MAX_EXTRA);
      }
      data.attempts[level.id] = attempt + 1;
      ctx.saveData(data);
      el.overlay.hidden = true;
      phase = 'won';
      ctx.win({ score: turns, summary: pick ? `${summary}\n新卡「${getCard(pick).code}」已加入牌组` : summary, delay: 150 });
    };
    el.overlay.hidden = false;
    el.overlay.className = 'cb-overlay win';
    el.overlay.innerHTML = `
      <div class="cb-ov-card">
        <div class="cb-ov-title">胜利！</div>
        <div class="cb-ov-medal m-${m.key}">${m.icon}</div>
        <div class="cb-ov-sub">${esc(summary)}</div>
        ${rewardOpts.length ? `<div class="cb-ov-pick">选一张卡加入你的牌组（之后每场战斗都带着它）</div>
          <div class="cb-rewards">${rewardOpts.map((id) => rewardCard(id)).join('')}</div>
          <button class="btn cb-skip" type="button">跳过</button>`
    : '<button class="btn primary cb-continue" type="button">继续 ▶</button>'}
      </div>`;
    el.overlay.querySelectorAll('.cb-reward').forEach((b) => b.addEventListener('click', () => finish(b.dataset.card)));
    const skip = el.overlay.querySelector('.cb-skip');
    if (skip) skip.addEventListener('click', () => finish(null));
    const cont = el.overlay.querySelector('.cb-continue');
    if (cont) { cont.addEventListener('click', () => finish(null)); cont.focus({ preventScroll: true }); }
    ctx.status(summary, 'ok');
  }

  function rewardCard(id) {
    const def = getCard(id);
    return `<button class="cb-card cb-reward k-${def.kind}${def.free ? ' k-free' : ''}" type="button" data-card="${esc(id)}">
      <span class="cb-cost">${def.cost}</span><span class="cb-type">${def.free ? '自由咒语' : TYPE_NAME[def.kind]}</span>
      <span class="cb-ccode${def.code.length > 9 ? ' long' : ''}">${esc(def.code)}</span>
      <span class="cb-cdesc">${esc(def.name ? `${def.name}：${def.d1 || def.d2}` : def.d1 || def.d2)}</span></button>`;
  }

  function showDefeat() {
    phase = 'defeat';
    busy = false;
    const left = hpValues(st).filter((v) => v > 0).length;
    el.overlay.hidden = false;
    el.overlay.className = 'cb-overlay lose';
    el.overlay.innerHTML = `
      <div class="cb-ov-card">
        <div class="cb-ov-title">勇者倒下了……</div>
        <div class="cb-ov-sub">还剩 ${left} 个敌人 · 你打出了 ${st.stats.spells} 行咒语。输了不扣世界里的爱心，换一手牌再来！</div>
        <button class="btn primary cb-retry" type="button">再战一次 ↺</button>
      </div>`;
    const b = el.overlay.querySelector('.cb-retry');
    b.addEventListener('click', restart);
    b.focus({ preventScroll: true });
    ctx.status('提示：先看头顶的 ⚔，优先放倒最凶的敌人；打不完时用格挡。', 'bad');
  }

  function restart() {
    attempt += 1;
    data.attempts[level.id] = attempt;
    ctx.saveData(data);
    timers.forEach(clearTimeout);
    timers.clear();
    startBattle();
  }

  // ---------------------------------------------------------- 小特效
  function floatOn(host, text, cls) {
    const f = document.createElement('span');
    f.className = `cb-float ${cls}`;
    f.textContent = text;
    host.appendChild(f);
    later(() => f.remove(), 900);
  }

  function flyCard(card) {
    const r0 = el.wrap.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const t = el.line.getBoundingClientRect();
    const scale = r0.width / el.wrap.offsetWidth || 1; // #ui-scale 整体缩放
    const ghost = card.cloneNode(true);
    ghost.classList.add('cb-fly');
    ghost.style.left = `${(r.left - r0.left) / scale}px`;
    ghost.style.top = `${(r.top - r0.top) / scale}px`;
    ghost.style.setProperty('--dx', `${(t.left + t.width / 2 - r.left - r.width / 2) / scale}px`);
    ghost.style.setProperty('--dy', `${(t.top - r.top) / scale}px`);
    el.wrap.appendChild(ghost);
    later(() => ghost.remove(), 420);
  }

  function shake(node) {
    if (!node) return;
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
  }

  function flashBanner(text) {
    el.banner.textContent = text;
    el.banner.hidden = false;
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    later(() => { el.banner.hidden = true; }, 1100);
  }

  // ---------------------------------------------------------- 事件
  el.castBtn.addEventListener('click', doCast);
  el.endBtn.addEventListener('click', doEndTurn);
  el.restartBtn.addEventListener('click', () => { if (!busy) restart(); });
  freeInput.addEventListener('input', () => { free = freeInput.value; updatePreview(); });
  freeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return; // 交给面板关闭
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); doCast(); }
    if (e.key === 'Tab') e.preventDefault();
  });
  freeInput.addEventListener('keyup', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  freeInput.addEventListener('keypress', (e) => e.stopPropagation());

  function onKey(e) {
    if (e.target === freeInput) return false;
    if (phase === 'reward') {
      const k = Number(e.key);
      if (k >= 1 && k <= rewardOpts.length) { el.overlay.querySelectorAll('.cb-reward')[k - 1].click(); return true; }
      return false;
    }
    if (phase === 'defeat') {
      if (e.key === 'Enter' || e.key === ' ') { restart(); return true; }
      return false;
    }
    if (phase !== 'battle' || busy) return false;
    if (/^[0-9]$/.test(e.key)) {
      const k = e.key === '0' ? 9 : Number(e.key) - 1;
      const c = st.hand[k];
      if (c) clickCard(c.uid);
      return true;
    }
    if (e.key === 'Enter' || e.key === ' ') { doCast(); return true; }
    if (e.key === 'e' || e.key === 'E') { doEndTurn(); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      sel = null; op = null; free = ''; freeInput.value = '';
      renderLine(); renderHand(); updatePreview();
      return true;
    }
    return false;
  }

  startBattle();

  return {
    onKey,
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
      root.innerHTML = '';
    },
    snapshot() {
      const b = snapshotBattle(st);
      return {
        levelId: level.id,
        phase,
        busy,
        attempt,
        ...b,
        handCodes: st.hand.map((c) => getCard(c.id).code),
        armed: { sel, op, free },
        line: last && last.line ? last.line : null,
        preview: last ? { ok: !!last.ok, selection: last.selection || null, kills: last.kills || 0, cost: last.cost ?? null } : null,
        extra: data.extra.slice(),
        rewards: rewardOpts.slice(),
        atkValues: atkValues(st),
      };
    },
  };
}
