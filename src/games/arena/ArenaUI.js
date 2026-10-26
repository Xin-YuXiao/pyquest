// ============================================================
// 向量风暴 · DOM 界面（挂在 #ui-scale 设计坐标系 960×640）
// - 战斗 HUD：竞技场生命 / 波次 / 剩余敌人 / 用时；底部法力条 + Q / R 两个法术槽（可点，触屏也能放）
//   法术槽实时估算「此刻放出去要多少法力、能打中几个」，冷却用一圈遮罩表示
// - 备咒台：示例战场雷达图 + 三个数组的打印 + 两个咒语输入行（ui/SpellInput），实时预览命中 / 击杀 / 法力
// - 结算浮层：胜负、用时、施法次数、法术击杀 vs 挥剑击杀、奖牌、奖励
// ============================================================
import './arena.css';
import { SpellInput } from '../../ui/SpellInput.js';
import { strValue } from '../../core/npmini.js';
import { buildScope, evaluateSpell, SPELL_COOLDOWN, MEDAL_NAME } from './rules.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const fmtTime = (ms) => `${(ms / 1000).toFixed(1)}s`;
const SLOT_KEYS = ['Q', 'R'];
const CHIPS = ['hp', 'dist', 'elite', '[', ']', '-=', '=', '<', '<=', '>', '&', '~', '(', ')'];

export class ArenaUI {
  /**
   * @param {object} h 场景回调：{ cast(i), openPrep(), startFight(spells), resume(spells), leave(), next(), retry() }
   */
  constructor(h) {
    this.h = h;
    this.prepOpen = false;
    this.root = document.createElement('div');
    this.root.className = 'ar-root';
    this.root.innerHTML = `
      <div class="ar-hud">
        <div class="ar-tl">
          <div class="ar-title" data-k="title"></div>
          <div class="ar-hp"><div class="ar-hp-bar"><i data-k="hpfill"></i></div><span data-k="hptext"></span></div>
          <div class="ar-live" data-k="live"></div>
        </div>
        <div class="ar-tr">
          <span data-k="wave"></span><span data-k="alive"></span><span data-k="time"></span>
        </div>
        <div class="ar-toast" data-k="toast" role="status" aria-live="polite"></div>
        <div class="ar-banner" data-k="banner"></div>
        <div class="ar-bottom">
          <div class="ar-mana">
            <div class="ar-mana-bar"><i data-k="manafill"></i><em data-k="manacost"></em></div>
            <span data-k="manatext"></span>
          </div>
          <div class="ar-slots">
            ${SLOT_KEYS.map((k, i) => `
              <button class="ar-slot" type="button" data-slot="${i}">
                <span class="ar-key">${k}</span>
                <code class="ar-code" data-k="code${i}"></code>
                <span class="ar-est" data-k="est${i}"></span>
                <span class="ar-cd" data-k="cd${i}"></span>
              </button>`).join('')}
            <button class="ar-slot ar-prepbtn" type="button" data-k="prepbtn"><span class="ar-key">B</span><span>备咒</span></button>
          </div>
        </div>
      </div>
      <div class="ar-prep" data-k="prep" hidden>
        <div class="ar-prep-panel" role="dialog" aria-modal="true" aria-label="备咒台">
          <div class="ar-prep-head">
            <span class="ar-badge">⚡</span>
            <div class="ar-prep-titles">
              <h2 data-k="ptitle"></h2>
              <span class="ar-concept" data-k="pconcept"></span>
            </div>
            <span class="ar-prep-mode" data-k="pmode"></span>
          </div>
          <p class="ar-story" data-k="pstory"></p>
          <div class="ar-prep-main">
            <div class="ar-field">
              <div class="ar-field-head" data-k="fieldhead"></div>
              <svg class="ar-radar" data-k="radar" viewBox="0 0 260 260" aria-hidden="true"></svg>
              <div class="ar-radar-note" data-k="radarnote"></div>
              <div class="ar-rules" data-k="rules"></div>
            </div>
            <div class="ar-spells">
              <div class="ar-arrays" data-k="arrays"></div>
              ${SLOT_KEYS.map((k, i) => `
                <div class="ar-spell" data-spell="${i}">
                  <div class="ar-spell-head"><span class="ar-key">${k}</span> 法术槽 ${k}${i ? '（可空）' : ''}</div>
                  <div data-k="input${i}"></div>
                  <div class="ar-effect" data-k="effect${i}"></div>
                </div>`).join('')}
              <div class="ar-hints" data-k="hints" hidden></div>
            </div>
          </div>
          <div class="ar-prep-foot">
            <button class="btn" type="button" data-k="hintbtn">💡 提示</button>
            <span class="ar-grow"></span>
            <button class="btn" type="button" data-k="leave">返回高原</button>
            <button class="btn primary" type="button" data-k="go">开战 ▶</button>
          </div>
        </div>
      </div>
      <div class="ar-result" data-k="result" hidden>
        <div class="ar-result-card">
          <div class="ar-result-title" data-k="rtitle"></div>
          <div class="ar-medal" data-k="rmedal"></div>
          <table class="ar-stats" data-k="rstats"></table>
          <ul class="ar-rewards" data-k="rrewards"></ul>
          <div class="ar-result-actions">
            <button class="btn" type="button" data-k="rleave">返回高原</button>
            <button class="btn" type="button" data-k="rretry">再来一次</button>
            <button class="btn primary" type="button" data-k="rnext">下一关 ▶</button>
          </div>
        </div>
      </div>`;
    (document.getElementById('ui-scale') || document.body).appendChild(this.root);
    this.k = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.k[n.dataset.k] = n; });
    this.root.querySelectorAll('.ar-slot[data-slot]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.h.cast(Number(b.dataset.slot)); });
    });
    this.k.prepbtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.h.openPrep(); });
    this.k.go.addEventListener('click', () => this.submitPrep());
    this.k.leave.addEventListener('click', () => this.h.leave());
    this.k.hintbtn.addEventListener('click', () => this.nextHint());
    this.k.rleave.addEventListener('click', () => this.h.leave());
    this.k.rretry.addEventListener('click', () => this.h.retry());
    this.k.rnext.addEventListener('click', () => this.h.next());
    this._key = (e) => this._onKey(e);
    document.addEventListener('keydown', this._key);
    this._toastT = 0;
    this._bannerT = 0;

    // 触屏：摇杆区占左半屏、会截走底部法术槽的点击，所以在右侧挥剑按钮上方另放一组 Q / R / B
    // （和 ui/TouchControls 一样挂在 body 上、用真实 CSS 像素，不随画布缩小）
    this.touch = document.createElement('div');
    this.touch.id = 'ar-touch';
    this.touch.innerHTML = `
      <button class="ar-tbtn" data-tslot="0" type="button" aria-label="施放 Q 槽法术"><b>Q</b><i></i></button>
      <button class="ar-tbtn" data-tslot="1" type="button" aria-label="施放 R 槽法术"><b>R</b><i></i></button>
      <button class="ar-tbtn ar-tprep" type="button" aria-label="打开备咒台"><b>备咒</b></button>`;
    document.body.appendChild(this.touch);
    this.touch.querySelectorAll('[data-tslot]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.h.cast(Number(b.dataset.tslot)); });
    });
    this.touch.querySelector('.ar-tprep').addEventListener('pointerdown', (e) => { e.preventDefault(); this.h.openPrep(); });
    this.touch.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- 战斗 HUD ----------

  setLevel(level, index) {
    this.level = level;
    this.k.title.textContent = `⚡ 向量风暴 · ${level.challenge ? '★ 挑战' : `第 ${index + 1} 关`} ${level.title}`;
  }

  /** 每帧刷新：s = 场景的竞技场状态 */
  update(s) {
    const lv = this.level;
    this.k.hpfill.style.width = `${(Math.max(0, s.hp) / s.maxHp) * 100}%`;
    this.k.hptext.textContent = `生命 ${Math.max(0, s.hp)} / ${s.maxHp}`;
    this.k.wave.textContent = lv.survive
      ? `坚持 ${Math.max(0, lv.survive - s.timeMs / 1000).toFixed(0)} 秒`
      : `第 ${Math.max(1, s.waveIdx + 1)} / ${lv.waves.length} 波`;
    this.k.alive.textContent = `敌人 ${s.alive}`;
    this.k.time.textContent = `⏱ ${fmtTime(s.timeMs)}`;
    this.k.manafill.style.width = `${(s.mana / lv.mana.max) * 100}%`;
    this.k.manatext.textContent = `法力 ${Math.floor(s.mana)} / ${lv.mana.max} · 每秒 +${lv.mana.regen}`;
    for (let i = 0; i < 2; i++) {
      const code = s.spells[i] || '';
      this.k[`code${i}`].textContent = code || '（空）';
      const est = s.estimates[i];
      const btn = this.k[`code${i}`].parentElement;
      btn.classList.toggle('empty', !code);
      let estText = '';
      let poor = false;
      if (code && est) {
        if (!est.ok) { estText = est.reason === 'error' ? '⚠ 报错' : '⚠ 不改 hp'; poor = true; }
        else if (!est.hits) estText = '打不中任何人';
        else { estText = `${est.cost} 法力 · 命中 ${est.hits}`; poor = est.cost > s.mana; }
      }
      this.k[`est${i}`].textContent = estText;
      btn.classList.toggle('poor', poor);
      const cd = s.cd[i] / SPELL_COOLDOWN;
      this.k[`cd${i}`].style.setProperty('--cd', `${Math.max(0, Math.min(1, cd)) * 360}deg`);
      this.k[`cd${i}`].style.opacity = cd > 0 ? '1' : '0';
    }
    // 触屏法术按钮：战斗中且没开面板时显示，冷却遮罩同步
    const fighting = (s.phase === 'fight' || s.phase === 'break') && !this.prepOpen && this.k.result.hidden;
    this.touch.dataset.on = fighting ? '1' : '0';
    this.touch.querySelectorAll('[data-tslot]').forEach((b) => {
      const i = Number(b.dataset.tslot);
      const cd = s.cd[i] / SPELL_COOLDOWN;
      b.querySelector('i').style.setProperty('--cd', `${Math.max(0, Math.min(1, cd)) * 360}deg`);
      b.classList.toggle('empty', !s.spells[i]);
    });
    // 法力条上标出 Q 的消耗
    const e0 = s.estimates[0];
    if (e0 && e0.ok && e0.hits) {
      this.k.manacost.style.left = `${Math.min(100, (e0.cost / lv.mana.max) * 100)}%`;
      this.k.manacost.style.opacity = '1';
    } else this.k.manacost.style.opacity = '0';
  }

  /** 战斗中实时显示法术作用的数组（print 的样子，超出宽度截断） */
  showLive(scope, n) {
    if (!scope) { this.k.live.textContent = ''; return; }
    this.k.live.innerHTML = ['hp', 'dist']
      .map((k) => `<div><b>${k}</b> = <span>${esc(strValue(scope[k]).replace(/\n\s*/g, ' '))}</span></div>`).join('')
      + `<div class="ar-live-n">（${n} 个敌人 · 下标 = 刷出顺序）</div>`;
  }

  toast(text, cls = '', ms = 1800) {
    const t = this.k.toast;
    t.textContent = text;
    t.className = `ar-toast show ${cls}`.trim();
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.className = 'ar-toast'; }, ms);
  }

  banner(text, ms = 1600) {
    const b = this.k.banner;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), ms);
  }

  pulseSlot(i) {
    const btn = this.root.querySelector(`.ar-slot[data-slot="${i}"]`);
    btn.classList.remove('fire');
    void btn.offsetWidth;
    btn.classList.add('fire');
  }

  // ---------- 备咒台 ----------

  /**
   * opts: { level, spells: [q, r], enemies（预览用的战场）, live（战斗中途打开）, hintStep }
   */
  openPrep({ level, spells, enemies, live, current = false }) {
    this.prepOpen = true;
    this.live = live;
    this.enemies = enemies;
    this.k.prep.hidden = false;
    this.k.ptitle.textContent = `备咒台 · ${level.challenge ? '★ 挑战' : ''}${level.title}`;
    this.k.pconcept.textContent = level.concept;
    this.k.pmode.textContent = live ? '⏸ 战斗已暂停（Esc 继续）' : '开战前';
    this.k.pstory.innerHTML = md(level.story);
    this.k.fieldhead.innerHTML = current
      ? `<b>当前战场</b> · 场上 ${enemies.length} 个敌人（数组顺序 = 刷出顺序）`
      : '<b>示例战场</b> · 战斗中按 Q / R 时，数组按当时场上的敌人现场生成';
    this.k.go.textContent = live ? '继续战斗 ▶' : '开战 ▶';
    this.k.rules.innerHTML = `<b>法力</b>：消耗 = 这句咒语让 hp <b>减少</b>的总量（含过量伤害，hp -= 100 很贵）<br>上限 <b>${level.mana.max}</b> · 每秒回 <b>${level.mana.regen}</b> · 每句冷却 ${SPELL_COOLDOWN} 秒`;
    this.hintStep = this.hintStep || 0;
    this._eff = [null, null];
    this._focus = 0;
    this.renderHints(level);
    this.renderArrays();
    this.inputs = [0, 1].map((i) => {
      const host = this.k[`input${i}`];
      host.innerHTML = '';
      const inp = new SpellInput(host, {
        scope: () => buildScope(this.enemies),
        chips: CHIPS,
        placeholder: i === 0 ? '例如 hp -= 1' : '第二句法术（可空）',
        castLabel: i === 0 ? '下一句 ⏎' : (live ? '继续 ⏎' : '开战 ⏎'),
        idleText: '（输入时这里实时显示执行后的 hp）',
        onPreview: (res, src) => this.previewSlot(i, src),
        onCast: () => {
          if (i === 0) this.inputs[1].focus();
          else this.submitPrep();
        },
      });
      inp.setValue(spells[i] || '');
      host.addEventListener('focusin', () => { this._focus = i; this.drawRadar(this._eff[i]); });
      return inp;
    });
    this.previewSlot(0, spells[0] || '');
    this.previewSlot(1, spells[1] || '');
    setTimeout(() => this.inputs && this.inputs[0].focus(), 30);
  }

  closePrep() {
    if (!this.prepOpen) return;
    this.prepOpen = false;
    this.k.prep.hidden = true;
    if (this.inputs) this.inputs.forEach((i) => i.destroy());
    this.inputs = null;
  }

  submitPrep() {
    if (!this.prepOpen) return;
    const spells = this.inputs.map((i) => i.value.trim());
    if (!spells[0] && !spells[1]) {
      this.inputs[0].flash();
      this.inputs[0].showMessage('至少写一句法术再开战——不然只能挥剑一个一个砍了。', 'bad');
      return;
    }
    const live = this.live;
    this.closePrep();
    if (live) this.h.resume(spells);
    else this.h.startFight(spells);
  }

  renderHints(level) {
    const hints = [...(level.hints || [])];
    const sol = [level.solution, level.solutionR].filter(Boolean).map((s) => `\`${s}\``).join(' ／ ');
    if (sol) hints.push(`参考法术：${sol}`);
    this.allHints = hints;
    const shown = hints.slice(0, this.hintStep);
    this.k.hints.hidden = !shown.length;
    this.k.hints.innerHTML = shown.map((h, i) => `<p><b>${i === hints.length - 1 ? '参考' : `提示 ${i + 1}`}</b> ${md(h.replace(/^参考法术：/, ''))}</p>`).join('');
    this.k.hintbtn.textContent = this.hintStep >= hints.length ? '💡 已全部显示' : `💡 提示${this.hintStep ? `（${this.hintStep}/${hints.length}）` : ''}`;
  }

  nextHint() {
    if (!this.allHints) return;
    this.hintStep = Math.min(this.allHints.length, (this.hintStep || 0) + 1);
    this.renderHints(this.level);
  }

  renderArrays() {
    const scope = buildScope(this.enemies);
    this.k.arrays.innerHTML = '';
    for (const name of ['hp', 'dist', 'elite']) {
      const row = document.createElement('div');
      row.className = 'ar-arr';
      const k = document.createElement('code');
      k.className = 'ar-arr-name';
      k.textContent = name;
      const v = document.createElement('pre');
      v.className = 'ar-arr-val';
      v.textContent = strValue(scope[name]);
      row.append(k, v);
      this.k.arrays.appendChild(row);
    }
  }

  /** 一个法术槽的效果预览：雷达图高亮 + 文字（命中 / 击杀 / 法力 / 拒绝原因） */
  previewSlot(i, src) {
    const eff = this.k[`effect${i}`];
    const r = src && src.trim() ? evaluateSpell(src, this.enemies) : null;
    if (!r) {
      eff.className = 'ar-effect';
      eff.textContent = i ? '（R 槽可以留空）' : '';
    } else if (!r.ok) {
      eff.className = 'ar-effect bad';
      eff.textContent = r.reason === 'error' ? `✗ 这句咒语会报错（见上方）` : `✗ ${r.message}${r.hint ? ` ${r.hint}` : ''}`;
    } else {
      const over = r.cost > this.level.mana.max;
      eff.className = `ar-effect ${over ? 'bad' : r.hits ? 'ok' : ''}`.trim();
      const parts = [`命中 ${r.hits} 个`, `击杀 ${r.kills} 个`, `消耗 ${r.cost} 法力`];
      if (r.healed) parts.push(`⚠ 给 ${r.healed} 个敌人回了血`);
      eff.textContent = (r.hits ? '⚡ ' : '') + parts.join(' · ')
        + (over ? `（超过法力上限 ${this.level.mana.max}，放不出来！）` : r.hits ? '' : '——这句打不中任何人');
    }
    // 雷达图跟着正在编辑（聚焦）的那一句走
    this._eff = this._eff || [null, null];
    this._eff[i] = r && r.ok ? r : null;
    if (i === (this._focus ?? 0)) this.drawRadar(this._eff[i]);
  }

  /** 雷达图：玩家在中心，敌人按 dist 摆在同心圆上（角度只是为了摊开，不代表真实方位） */
  drawRadar(effect = null) {
    const el = this.k.radar;
    el.innerHTML = '';
    const C = 130, R = 118, MAX = 10;
    const rad = (d) => (Math.min(d, MAX) / MAX) * R;
    // 刻度沿右下 35° 方向错开摆，靠近中心的 2 / 3 / 4 不挤在一起
    const ang = (35 * Math.PI) / 180;
    for (const d of [2, 3, 4, 6, 8]) {
      el.appendChild(svg('circle', { cx: C, cy: C, r: rad(d), class: `ar-ring${d <= 4 ? ' near' : ''}${d === 3 ? ' three' : ''}` }));
      if (d === 3) continue; // 3 格那圈加亮不标数，免得 2 / 3 / 4 的刻度挤在一起
      const t = svg('text', { x: C + Math.cos(ang) * rad(d) + 2, y: C + Math.sin(ang) * rad(d) + 9, class: 'ar-ring-label' });
      t.textContent = `${d}`;
      el.appendChild(t);
    }
    const lbl = svg('text', { x: C, y: 12, class: 'ar-ring-label', 'text-anchor': 'middle' });
    lbl.textContent = 'dist（格）';
    el.appendChild(lbl);
    el.appendChild(svg('circle', { cx: C, cy: C, r: 7, class: 'ar-me' }));
    const GOLD = Math.PI * (3 - Math.sqrt(5));
    this.enemies.forEach((e, i) => {
      const a = i * GOLD - Math.PI / 2;
      const x = C + Math.cos(a) * rad(e.dist), y = C + Math.sin(a) * rad(e.dist);
      const hit = effect && effect.damage[i] > 0;
      const killed = effect && effect.newHp[i] <= 0;
      const g = svg('g', { class: `ar-foe${e.elite ? ' elite' : ''}${hit ? ' hit' : ''}${killed ? ' killed' : ''}` });
      g.appendChild(svg('circle', { cx: x, cy: y, r: e.elite ? 11 : 9 }));
      const t = svg('text', { x, y: y + 4, 'text-anchor': 'middle' });
      t.textContent = killed ? '✕' : String(effect ? effect.newHp[i] : e.hp);
      g.appendChild(t);
      const idx = svg('text', { x: x + (e.elite ? 12 : 10), y: y - 7, class: 'ar-idx' });
      idx.textContent = i;
      g.appendChild(idx);
      el.appendChild(g);
    });
    const slot = SLOT_KEYS[this._focus ?? 0];
    this.k.radarnote.textContent = effect
      ? `${slot} 槽：蓝圈 = 命中，✕ = 击杀；数字 = 执行后的 hp，角标 = 数组下标`
      : `${slot} 槽的法术会在这里预览；数字 = hp，角标 = 数组下标`;
  }

  // ---------- 结算 ----------

  /** r: { won, title, medal, stats: [[k, v]], rewards: [], hasNext } */
  showResult(r) {
    this.k.result.hidden = false;
    this.k.result.classList.toggle('lost', !r.won);
    this.k.rtitle.textContent = r.title;
    this.k.rmedal.textContent = r.medal ? `🏅 ${MEDAL_NAME[r.medal]}` : '';
    this.k.rmedal.className = `ar-medal ${r.medal || ''}`;
    this.k.rstats.innerHTML = r.stats.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    this.k.rrewards.innerHTML = (r.rewards || []).map((l) => `<li>${esc(l)}</li>`).join('');
    this.k.rnext.hidden = !r.hasNext;
    (r.hasNext ? this.k.rnext : this.k.rretry).focus({ preventScroll: true });
  }

  hideResult() { this.k.result.hidden = true; }

  _onKey(e) {
    if (this.prepOpen) {
      if (e.key === 'Escape' && this.live) { e.preventDefault(); this.submitPrep(); }
      if (e.key === 'Tab') e.preventDefault();
      return;
    }
    if (!this.k.result.hidden && e.key === 'Enter') {
      e.preventDefault();
      if (!this.k.rnext.hidden) this.h.next(); else this.h.retry();
    }
  }

  destroy() {
    clearTimeout(this._toastT);
    clearTimeout(this._bannerT);
    this.closePrep();
    document.removeEventListener('keydown', this._key);
    this.root.remove();
    this.touch.remove();
  }
}
