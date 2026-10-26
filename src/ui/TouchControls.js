// ============================================================
// 触控层（移动端）：浮动虚拟摇杆 + 挥剑 / 交互 / 世界地图 / 静音按钮
// - 只在触控模式显示（粗指针设备，或页面上出现过触摸）；桌面鼠标/键盘不受影响
// - 挂在 body 上、不进 #ui-scale：按钮尺寸是真实 CSS 像素，不随画布缩放变小
//   （手机横屏时画布系数仅 ~0.6，设计坐标里的 44px 只剩 26px，按不准）
// - 摇杆：左半屏任意处按下即以按下点为中心浮出，推动量写入 core/input.js，
//   由 Player 量化成 8 向；按钮发出语义动作，与键盘走同一条 act(name) 路径
// - 多点触控：摇杆按 pointerId 捕获单指，按钮各自响应，一指移动一指挥剑可同时生效
// - 答题 / 对话 / 胜利页打开时整层隐藏；世界地图打开时只留地图按钮（用来关地图）
// ============================================================
import './touch.css';
import { setStick, fireAction, isTouchMode, setTouchMode } from '../core/input.js';
// 注：本模块在游戏启动时随场景模块加载（main.js → ChapterScene → WorldScene），
// 构造函数里的触控探测因此早于标题画面，标题说明可以及时换成触屏说法
import { sfx } from '../audio/sfx.js';
import { ICON } from './icons.js';

/** 摇杆可推动半径（CSS px） */
const STICK_R = 56;
/** 按住挥剑时的连发间隔（ms；略大于 Player 挥剑冷却 340ms） */
const ATTACK_REPEAT = 360;
/** 设计坐标宽（与 main.js fitStage 的 UI_W 一致） */
const UI_W = 960;

// 像素图标（与 ui/icons.js 同族：crispEdges + 现有 token 用色）
const SWORD = `
  <svg class="pq-icon" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="9" y="1" width="2" height="2" fill="#fff3c4"/>
    <rect x="8" y="2" width="2" height="2" fill="#e8e3f5"/>
    <rect x="7" y="3" width="2" height="2" fill="#e8e3f5"/>
    <rect x="6" y="4" width="2" height="2" fill="#e8e3f5"/>
    <rect x="5" y="5" width="2" height="2" fill="#c9c2dc"/>
    <rect x="2" y="6" width="2" height="1" fill="#e0a53c"/>
    <rect x="5" y="9" width="1" height="2" fill="#e0a53c"/>
    <rect x="3" y="7" width="3" height="2" fill="#ffd257"/>
    <rect x="1" y="9" width="3" height="2" fill="#b98a4e"/>
  </svg>`;
const SPEAKER = (on) => `
  <svg class="pq-icon" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="1" y="4" width="3" height="4" fill="#fff8ea"/>
    <rect x="4" y="3" width="1" height="6" fill="#fff8ea"/>
    <rect x="5" y="2" width="1" height="8" fill="#fff8ea"/>
    ${on
      ? '<rect x="7" y="4" width="1" height="4" fill="#3ddad7"/><rect x="9" y="3" width="1" height="6" fill="#3ddad7"/>'
      : '<rect x="7" y="4" width="1" height="1" fill="#e86a6a"/><rect x="8" y="5" width="1" height="2" fill="#e86a6a"/><rect x="9" y="4" width="1" height="1" fill="#e86a6a"/><rect x="7" y="7" width="1" height="1" fill="#e86a6a"/><rect x="9" y="7" width="1" height="1" fill="#e86a6a"/>'}
  </svg>`;

class TouchControls {
  constructor() {
    this.scene = null;     // 当前世界场景（场景 create 时 attach）
    this.root = null;
    this.stickId = null;   // 正在控制摇杆的 pointerId
    this.origin = null;    // 摇杆中心（按下点）
    this._repeatT = 0;
    this._muted = null;
    this._toastShown = false;

    // 触控模式探测：粗指针设备直接开启；否则等第一次真实触摸（捕获阶段，
    // 标题画面上点「开始冒险」也算），开启后整局保持
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) this._enable();
    window.addEventListener('touchstart', () => {
      if (!isTouchMode()) this._enable();
      this._layout();
    }, { once: true, passive: true, capture: true });
  }

  _enable() {
    setTouchMode(true);
    // 标题画面的操作说明第一行是键盘键位：触控模式换成触屏说法
    const keys = document.querySelector('#title .keys');
    if (keys && keys.innerHTML.includes('WASD')) {
      const rest = keys.innerHTML.split(/<br\s*\/?>/).slice(1);
      keys.innerHTML = [
        '左半屏拖动 移动 &nbsp;·&nbsp; <kbd>挥剑</kbd> 攻击 &nbsp;·&nbsp; <kbd>交互</kbd> 符文 / 对话 &nbsp;·&nbsp; 右上角 世界地图',
        ...rest,
      ].join('<br />');
    }
  }

  /** 世界场景 create 时调用：首次建 DOM，之后只换绑当前场景 */
  attach(scene) {
    this.scene = scene;
    if (!this.root) this._build();
    this._layout();
  }

  /** 进入非世界场景（如代码训练场）时解绑：没有当前场景 → 显示模式 off */
  detach() {
    this.scene = null;
  }

  // ---------- DOM ----------
  _build() {
    const root = document.createElement('div');
    root.id = 'touch-layer';
    root.dataset.mode = 'off';
    root.innerHTML = `
      <div class="tc-zone" aria-hidden="true"></div>
      <div class="tc-stick idle" aria-hidden="true"><div class="tc-knob"></div></div>
      <button class="tc-btn tc-interact" data-action="interact" tabindex="-1" aria-label="交互（E）">
        <span class="tc-cap">E</span><span class="tc-lbl">交互</span>
      </button>
      <button class="tc-btn tc-attack" data-action="attack" tabindex="-1" aria-label="挥剑（J）">
        ${SWORD}<span class="tc-lbl">挥剑</span>
      </button>
      <button class="tc-btn tc-small tc-map" data-action="map" tabindex="-1" aria-label="世界地图（Tab）">${ICON.map}</button>
      <button class="tc-btn tc-small tc-mute" data-action="mute" tabindex="-1" aria-label="静音（M）"></button>
      <div class="tc-toast" role="status"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.zone = root.querySelector('.tc-zone');
    this.stickEl = root.querySelector('.tc-stick');
    this.knob = root.querySelector('.tc-knob');
    this.interactBtn = root.querySelector('.tc-interact');
    this.muteBtn = root.querySelector('.tc-mute');
    this.toastEl = root.querySelector('.tc-toast');

    this._bindStick();
    this._bindButtons();
    root.addEventListener('contextmenu', (e) => e.preventDefault()); // 长按不弹系统菜单
    window.addEventListener('resize', () => this._layout());
    window.addEventListener('orientationchange', () => this._layout());
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  // ---------- 摇杆 ----------
  _bindStick() {
    const zone = this.zone;
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return; // 已有一指在控制摇杆，其余手指交给按钮
      e.preventDefault();
      this.stickId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* 合成事件无捕获 */ }
      // 中心夹在屏内：贴边按下时整个摇杆仍完整可见
      const m = STICK_R + 8;
      this.origin = {
        x: Math.min(Math.max(e.clientX, m), window.innerWidth - m),
        y: Math.min(Math.max(e.clientY, m), window.innerHeight - m),
      };
      this.stickEl.style.left = `${this.origin.x}px`;
      this.stickEl.style.top = `${this.origin.y}px`;
      this.stickEl.classList.remove('idle');
      this._moveStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this._moveStick(e.clientX, e.clientY);
    });
    const end = (e) => { if (e.pointerId === this.stickId) this._releaseStick(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  _moveStick(x, y) {
    let dx = x - this.origin.x;
    let dy = y - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) { dx = (dx / len) * STICK_R; dy = (dy / len) * STICK_R; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    setStick(dx / STICK_R, dy / STICK_R);
  }

  /** 松手 / 层被隐藏：摇杆归零并退回左下角的待机位 */
  _releaseStick() {
    this.stickId = null;
    setStick(0, 0);
    if (!this.stickEl) return;
    this.knob.style.transform = '';
    this.stickEl.style.left = '';
    this.stickEl.style.top = '';
    this.stickEl.classList.add('idle');
  }

  // ---------- 按钮 ----------
  _bindButtons() {
    for (const btn of this.root.querySelectorAll('.tc-btn')) {
      const name = btn.dataset.action;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // 不触发后续的兼容鼠标事件 / 300ms 点击延迟
        btn.classList.add('pressed');
        fireAction(name);
        if (name === 'attack') {
          clearInterval(this._repeatT);
          this._repeatT = setInterval(() => fireAction('attack'), ATTACK_REPEAT);
        }
      });
      const up = () => {
        btn.classList.remove('pressed');
        if (name === 'attack') clearInterval(this._repeatT);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }
  }

  // ---------- 布局 ----------
  /** 写入 --ui-k（画布缩放系数，触控排版用来换算「真实 44px」）并摆放右上小按钮 */
  _layout() {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const k = r.width / UI_W;
    document.documentElement.style.setProperty('--ui-k', k.toFixed(4));
    if (!this.root) return;
    // 右上小按钮（地图 / 静音，各 48px）都不能压到 HUD 的碎片胶囊：
    //   右侧黑边 ≥ 128px → 横排放进黑边角落；
    //   右侧黑边 60~128px（如 740×360 小屏横屏）→ 在黑边里竖排；
    //   上方黑边 ≥ 64px（竖屏）→ 横排放进顶部黑边；
    //   画布顶满屏（平板）→ 横排退到 HUD 目标行下方（设计坐标约 92px）
    const sideBar = window.innerWidth - r.right;
    let mapTop = 12, muteTop = 12, mapRight = 72, muteRight = 16;
    if (sideBar < 128 && sideBar >= 60) {
      mapRight = muteRight = Math.round((sideBar - 48) / 2);
      muteTop = mapTop + 56;
    } else if (sideBar < 60 && r.top < 64) {
      mapTop = muteTop = Math.round(r.top + 92 * k);
    }
    const set = (name, v) => this.root.style.setProperty(name, `${v}px`);
    set('--tc-map-top', mapTop);
    set('--tc-mute-top', muteTop);
    set('--tc-map-right', mapRight);
    set('--tc-mute-right', muteRight);
  }

  // ---------- 每帧：按游戏状态切换显示模式 ----------
  _mode() {
    const s = this.scene;
    if (!s || !s.quiz) return 'off';
    const hidden = (id) => {
      const el = document.getElementById(id);
      return !el || el.classList.contains('hidden');
    };
    if (!hidden('title') || !hidden('victory')) return 'off';
    if (s.quiz.isOpen || (s.dialogue && s.dialogue.isOpen)) return 'off';
    // 其他全屏面板（观测台 / 秘藏卷轴）打开时同样收起：触控层不在 #ui-scale 里、叠在面板之上，
    // 不收起的话左半屏的摇杆区会截走拟合台滑块的拖动
    if ((s.observatory && s.observatory.isOpen) || (s.secretScroll && s.secretScroll.isOpen)) return 'off';
    if (s.towerResult && s.towerResult.isOpen) return 'off'; // 试炼塔结算页
    if (s.gamePanel && s.gamePanel.isOpen) return 'off'; // 第三章试炼场的小游戏面板（输入框 / 卡牌 / 画布要能点到）
    if (s.touchBlocked && s.touchBlocked()) return 'off'; // 场景自管的全屏面板（如向量风暴的备咒台 / 结算页）
    if (s.worldmap && s.worldmap.isOpen) return s.worldmap.book && s.worldmap.book.isOpen ? 'off' : 'map';
    return 'play';
  }

  _tick() {
    requestAnimationFrame(this._tick);
    if (!isTouchMode()) return;
    const mode = this._mode();
    if (mode !== this.root.dataset.mode) {
      this.root.dataset.mode = mode;
      if (mode !== 'play') {
        this._releaseStick(); // 弹出答题/对话时手指还按着：避免关面板后角色自己走
        clearInterval(this._repeatT);
      } else {
        this._maybeToastPortrait();
      }
    }
    const ready = mode === 'play' && !!(this.scene && this.scene.interactReady);
    this.interactBtn.classList.toggle('ready', ready);
    const muted = sfx.isMuted();
    if (muted !== this._muted) {
      this._muted = muted;
      this.muteBtn.innerHTML = SPEAKER(!muted);
      this.muteBtn.classList.toggle('off', muted);
    }
  }

  /** 竖屏也能玩（摇杆与按钮落在画布下方的黑边里），但横屏画面更大：提示一次 */
  _maybeToastPortrait() {
    if (this._toastShown || !document.body.classList.contains('portrait')) return;
    this._toastShown = true;
    this.toastEl.textContent = '横屏游玩，画面更大';
    this.toastEl.classList.add('show');
    setTimeout(() => this.toastEl.classList.remove('show'), 3000);
  }
}

export const touchControls = new TouchControls();
