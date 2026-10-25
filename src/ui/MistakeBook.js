// ============================================================
// 错题本：世界地图（Tab）头部「错题本（N）」按钮打开的一层面板
// - 列出所有主线答错过的题（后来答对也保留），按章分组；
//   「待复习」/「已掌握」两个页签 + 章 / 符文类型 / 知识点三组筛选
// - 点「复习」用同一答题面板的复习模式作答：不扣心、不产碎片、不改主线状态；
//   复习连续答对 MASTERY_STREAK 次 = 已掌握，复习答错退回待复习（规则见 core/records.js）
// - 数据全部来自学习记录的只读视图（core/mistakes.js），不单独存储清单
// 面板 DOM 由本模块动态创建（挂在 #ui-scale，叠在世界地图之上），场景重启复用同一节点；
// 事件用 onclick / onchange 覆盖式绑定到当前场景的实例，避免监听器随场景叠加。
// ============================================================
import './mistakeBook.css';
import { G } from '../core/state.js';
import { getChapter } from '../data/chapters.js';
import { QUESTIONS } from '../data/quizBank.js';
import { buildMistakeEntries, filterMistakes, filterOptions, pendingCount, KIND_LABEL } from '../core/mistakes.js';
import { MASTERY_STREAK } from '../core/records.js';
import { sfx } from '../audio/sfx.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chapterName = (id) => (id == null ? '未知章节' : getChapter(id).title);

/** 当前存档的错题条目（世界地图按钮计数、测试接缝 mistakes() 共用） */
export function mistakeEntries() {
  return buildMistakeEntries(G.records.stats, QUESTIONS);
}

export class MistakeBook {
  /** onChange：复习结果写回后通知（世界地图刷新按钮上的待复习数） */
  constructor(scene, { onChange } = {}) {
    this.scene = scene;
    this.onChange = onChange || null;
    this.isOpen = false;
    this.filters = { tab: 'pending', ch: 'all', kind: 'all', topic: 'all' };
    this.root = document.getElementById('mistake-book') || this._build();
    this._keyHandler = (e) => {
      if (!this.isOpen || (this.scene.quiz && this.scene.quiz.isOpen)) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'mistake-book';
    el.innerHTML = `
      <div class="mb-panel" role="dialog" aria-label="错题本">
        <div class="mb-head">
          <span class="mb-title">错题本</span>
          <span class="mb-sub"></span>
          <button class="mb-close" data-act="close" aria-label="关闭错题本">✕</button>
        </div>
        <div class="mb-tabs"></div>
        <div class="mb-filters"></div>
        <div class="mb-list"></div>
        <div class="mb-foot"></div>
      </div>`;
    document.getElementById('ui-scale').appendChild(el);
    return el;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._bind();
    this.render();
    this.root.classList.add('show');
    sfx.talk();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('show');
  }

  /** 覆盖式绑定到本实例（同一 DOM 节点在场景重启后由新实例接管） */
  _bind() {
    this.root.onclick = (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || (this.scene.quiz && this.scene.quiz.isOpen)) return;
      const act = t.dataset.act;
      if (act === 'close') this.close();
      else if (act === 'tab') { this.filters.tab = t.dataset.tab; this.render(); }
      else if (act === 'review') this.review(t.dataset.qid);
    };
    this.root.onchange = (e) => {
      const key = e.target.dataset.filter;
      if (!key) return;
      this.filters[key] = e.target.value;
      this.render();
    };
  }

  render() {
    const all = mistakeEntries();
    const opts = filterOptions(all);
    // 筛选值在新数据里已不存在时回到「全部」（例如最后一道该章错题已掌握）
    if (this.filters.ch !== 'all' && !opts.chapters.includes(Number(this.filters.ch))) this.filters.ch = 'all';
    if (this.filters.kind !== 'all' && !opts.kinds.includes(this.filters.kind)) this.filters.kind = 'all';
    if (this.filters.topic !== 'all' && !opts.topics.includes(this.filters.topic)) this.filters.topic = 'all';

    const pendingN = pendingCount(all);
    const masteredN = all.filter((e) => e.mastered && !e.missing).length;
    const f = this.filters;
    const $ = (sel) => this.root.querySelector(sel);

    $('.mb-sub').innerHTML = `待复习 <b>${pendingN}</b> 道 · 已掌握 <b>${masteredN}</b> 道`;
    $('.mb-tabs').innerHTML = [
      ['pending', `待复习（${pendingN}）`],
      ['mastered', `已掌握（${masteredN}）`],
    ].map(([tab, label]) => `<button class="mb-tab${f.tab === tab ? ' on' : ''}" data-act="tab" data-tab="${tab}">${label}</button>`).join('');

    const select = (key, allLabel, values, labelOf) => `
      <select data-filter="${key}" aria-label="${allLabel}">
        <option value="all">${allLabel}</option>
        ${values.map((v) => `<option value="${esc(v)}"${String(f[key]) === String(v) ? ' selected' : ''}>${esc(labelOf(v))}</option>`).join('')}
      </select>`;
    $('.mb-filters').innerHTML =
      select('ch', '全部章节', opts.chapters, chapterName) +
      select('kind', '全部符文', opts.kinds, (k) => `${KIND_LABEL[k] || k}符文`) +
      select('topic', '全部知识点', opts.topics, (t) => t);

    const list = filterMistakes(all, f);
    const listEl = $('.mb-list');
    if (!list.length) {
      let tip;
      if (!all.length) tip = '还没有错题。答错过的题会自动收录在这里——即使后来答对了也会留着，方便回头复习。';
      else if (f.tab === 'mastered' && !masteredN) tip = `还没有已掌握的题：复习时连续答对 ${MASTERY_STREAK} 次即可掌握。`;
      else if (f.tab === 'pending' && !pendingN && f.ch === 'all' && f.kind === 'all' && f.topic === 'all') tip = '待复习的题都已掌握，太棒了！';
      else tip = '当前筛选下没有题目。';
      listEl.innerHTML = `<div class="mb-empty">${tip}</div>`;
    } else {
      let html = '';
      let lastCh;
      for (const e of list) {
        if (e.ch !== lastCh) {
          html += `<div class="mb-group">${esc(chapterName(e.ch))}</div>`;
          lastCh = e.ch;
        }
        const filled = e.mastered ? MASTERY_STREAK : Math.min(e.streak, MASTERY_STREAK);
        const dots = '●'.repeat(filled) + '○'.repeat(MASTERY_STREAK - filled);
        const last = e.lastOk == null ? '' : e.lastOk ? '<span class="mb-ok">最近 ✓</span>' : '<span class="mb-bad">最近 ✗</span>';
        html += `
          <div class="mb-row${e.missing ? ' missing' : ''}" data-qid="${esc(e.qid)}" data-streak="${e.streak}" data-mastered="${e.mastered}">
            <div class="mb-main">
              <div class="mb-tags">
                ${e.topic ? `<span class="mb-topic">${esc(e.topic)}</span>` : ''}
                ${e.kind ? `<span class="mb-kind">${esc(KIND_LABEL[e.kind] || e.kind)}</span>` : ''}
              </div>
              <div class="mb-sum">${esc(e.summary)}</div>
              <div class="mb-meta">错 ${e.wrong} 次 ${last}
                <span class="mb-dots" title="复习连续答对 ${MASTERY_STREAK} 次即掌握">复习 ${dots}</span></div>
            </div>
            ${e.missing
              ? '<button class="btn mb-review" disabled>题目已更新</button>'
              : `<button class="btn primary mb-review" data-act="review" data-qid="${esc(e.qid)}">${e.mastered ? '再练' : '复习'}</button>`}
          </div>`;
      }
      listEl.innerHTML = html;
    }
    $('.mb-foot').textContent = `复习不扣心、不产碎片、不改变符文石；连续答对 ${MASTERY_STREAK} 次即「已掌握」，复习答错会退回待复习。`;
  }

  /** 复习一道错题：同一答题面板的复习模式，作答结果写回学习记录后刷新列表 */
  review(qid) {
    if (!QUESTIONS[qid] || !this.scene.quiz || this.scene.quiz.isOpen) return;
    this.scene.quiz.open({ id: qid, ...QUESTIONS[qid] }, {
      mode: 'review',
      onDone: () => {
        if (this.isOpen) this.render();
        if (this.onChange) this.onChange();
      },
    });
  }

  destroy() {
    document.removeEventListener('keydown', this._keyHandler);
    this.close();
  }
}
