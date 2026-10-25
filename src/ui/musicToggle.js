// ============================================================
// 标题画面右上角的背景音乐开关（与游戏内 N 键同一个设置，持久化见 audio/music.js）
// 点击本身也算一次用户交互：开着音乐时会顺带解锁 AudioContext、响起标题主题
// ============================================================
import './music-toggle.css';
import { music } from '../audio/music.js';

export function mountMusicToggle(container) {
  if (container.querySelector('#music-toggle')) return; // 幂等：只挂一次
  const btn = document.createElement('button');
  btn.id = 'music-toggle';
  btn.type = 'button';
  btn.className = 'music-toggle';
  container.appendChild(btn);

  const render = () => {
    const on = music.state().musicOn;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', `背景音乐：${on ? '开' : '关'}（游戏中按 N 开关）`);
    btn.title = '背景音乐开关（游戏中按 N；按 M 静音全部声音）';
    btn.innerHTML = `<span class="mt-note" aria-hidden="true">♪</span>音乐 ${on ? '开' : '关'}<kbd>N</kbd>`;
  };
  btn.addEventListener('click', () => music.toggle());
  document.addEventListener('pyquest:music', render);
  render();
}
