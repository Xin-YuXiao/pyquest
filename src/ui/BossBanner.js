// ============================================================
// BOSS 战开场横幅：破盾（或带着破盾进度重进巢穴、或护盾期就生效的机制）时，
// 在画面上方用一句话交代本章 BOSS 的招牌玩法；数秒后自动收起，不阻塞操作。
// DOM 由本模块动态创建并挂进 #ui-scale 设计坐标系（不占 index.html），
// 样式见同目录 bossBanner.css。横幅收起后保留最后一次的文案（读屏/测试可查）。
// ============================================================
import './bossBanner.css';

let el = null;
let timer = 0;

function ensure() {
  if (el && el.isConnected) return el;
  const host = document.getElementById('ui-scale') || document.body;
  el = document.createElement('div');
  el.id = 'boss-banner';
  el.className = 'boss-banner hidden';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="bb-title"></div><div class="bb-tip"></div>';
  host.appendChild(el);
  return el;
}

/** 显示横幅：标题「BOSS 名 · 机制名」+ 一句话玩法 */
export function showBossBanner({ bossName, name, tip }, ms = 4800) {
  const e = ensure();
  e.querySelector('.bb-title').textContent = `${bossName} · ${name}`;
  e.querySelector('.bb-tip').textContent = tip;
  e.classList.remove('hidden');
  clearTimeout(timer);
  timer = setTimeout(() => e.classList.add('hidden'), ms);
}

export function hideBossBanner() {
  clearTimeout(timer);
  if (el) el.classList.add('hidden');
}
