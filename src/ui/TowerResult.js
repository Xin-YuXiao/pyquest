// ============================================================
// 试炼塔结算页：沿用胜利封印页的羊皮纸证书样式（.seal-paper / .stat-seal …），
// 三枚统计印 = 到达层数 / 本次正确率 / 复习错题数，下方一行个人最佳（只比自己，不做排行榜）。
// DOM 在本模块里动态创建（挂到 #ui-scale），样式见 tower.css；按钮监听在 destroy 时随节点移除。
// ============================================================
import './tower.css';
import { ICON } from './icons.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class TowerResult {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.summary = null;
    this.root = document.createElement('div');
    this.root.id = 'tower-result';
    this.root.className = 'hidden';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'tower-result-title');
    (document.getElementById('ui-scale') || document.body).appendChild(this.root);
  }

  /** 弹出结算页；onAgain 再闯一次、onLeave 回到主线（各只触发一次） */
  show(summary, { onAgain, onLeave } = {}) {
    this.isOpen = true;
    this.summary = summary;
    const defeat = summary.reason === 'defeat';
    const acc = summary.accuracy == null ? '—' : `${summary.accuracy}%`;
    const best = summary.newBest
      ? `<b class="tr-best new">新纪录！</b>个人最佳 第 ${summary.best} 层`
      : `个人最佳 第 ${summary.best} 层`;
    this.root.innerHTML = `
      <div class="seal-paper">
        <div class="seal-band"><h1 id="tower-result-title">${defeat ? '试炼塔 · 挑战结束' : '试炼塔 · 平安出塔'}</h1></div>
        <div class="victory-stamp" aria-hidden="true">${ICON.stamp}</div>
        <p class="seal-sub">${defeat
          ? `爱心耗尽……你止步于<b>第 ${summary.floor} 层</b>。<br />错过的题已记进错题本，下次再来！`
          : `你从<b>第 ${summary.floor} 层</b>离开了试炼塔。<br />塔里练过的题都记进了学习记录。`}</p>
        <div class="seal-stats">
          <div class="stat-seal">${ICON.flag}<b class="stat-num" id="tr-floor">${summary.floor}</b><span class="stat-lbl">到达层数</span></div>
          <div class="stat-seal">${ICON.key}<b class="stat-num" id="tr-acc">${esc(acc)}</b><span class="stat-lbl">本次正确率</span></div>
          <div class="stat-seal">${ICON.hourglass}<b class="stat-num" id="tr-reviewed">${summary.reviewed}</b><span class="stat-lbl">复习错题</span></div>
        </div>
        <p class="tr-best-line" id="tr-best">${best} · 已挑战 ${summary.runs} 次 · 本次答对 ${summary.correct} / ${summary.total}</p>
        <div class="seal-actions">
          <button class="btn primary" id="tower-again">▶ 再闯一次</button>
          <button class="btn ghost" id="tower-leave">离开试炼塔</button>
        </div>
      </div>`;
    const once = (fn) => () => {
      if (!this.isOpen) return;
      this.hide();
      if (fn) fn();
    };
    this.root.querySelector('#tower-again').addEventListener('click', once(onAgain));
    this.root.querySelector('#tower-leave').addEventListener('click', once(onLeave));
    this.root.classList.remove('hidden');
    this.root.querySelector('#tower-again').focus({ preventScroll: true });
  }

  hide() {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  /** 测试接缝用的只读快照 */
  snapshot() {
    return { isOpen: this.isOpen, summary: this.summary ? { ...this.summary } : null };
  }

  destroy() {
    this.isOpen = false;
    this.root.remove();
  }
}
