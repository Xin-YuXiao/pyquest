// ============================================================
// 输入抽象：键盘 + 触控（虚拟摇杆 / 触控按钮）合并成同一份输入
// - 方向：moveDir(keys) 合并方向键/WASD 与摇杆模拟量，量化成离散 8 向
//   （与键盘手感一致：Player 按 dx/dy ∈ {-1,0,1} × speed 设速度，斜向不归一化）
// - 动作：交互 / 挥剑 / 世界地图 / 静音 统一为「语义动作」——键盘与触控按钮
//   都经 fireAction → 'pyquest:action' 事件 → 当前场景 act(name) 执行，
//   两条输入路径共用同一段游戏逻辑
// - 触控模式：首次触摸或粗指针设备（pointer: coarse）开启，body 挂 .touch，
//   触控层与触控专属排版（答题面板放大、可滚动）都只在该模式下生效
// ============================================================

/** 语义动作事件名（detail: { name: 'interact' | 'attack' | 'map' | 'mute' }） */
export const ACTION_EVENT = 'pyquest:action';

/** 摇杆死区：推动幅度不足时视为无输入（防手指轻颤带动角色） */
export const STICK_DEADZONE = 0.28;

/** 触控摇杆模拟量（-1..1，未触摸为 0），由触控层写入 */
const stick = { x: 0, y: 0 };
let touchMode = false;

export function setStick(x, y) {
  stick.x = x;
  stick.y = y;
}

export function getStick() {
  return { x: stick.x, y: stick.y };
}

/** 摇杆模拟量 → 离散 8 向（每 45° 一个扇区；死区内为 0） */
export function stickDir(x, y) {
  if (Math.hypot(x, y) < STICK_DEADZONE) return { dx: 0, dy: 0 };
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
  // `|| 0` 把 Math.round 可能产生的 -0 归一成 0
  return { dx: Math.round(Math.cos(a)) || 0, dy: Math.round(Math.sin(a)) || 0 };
}

/** 合并方向：任一方向键按下时以键盘为准，否则读摇杆 */
export function moveDir(keys) {
  let dx = 0, dy = 0;
  if (keys) {
    if (keys.left.isDown || keys.a.isDown) dx = -1;
    else if (keys.right.isDown || keys.d.isDown) dx = 1;
    if (keys.up.isDown || keys.w.isDown) dy = -1;
    else if (keys.down.isDown || keys.s.isDown) dy = 1;
  }
  if (dx || dy) return { dx, dy };
  return stickDir(stick.x, stick.y);
}

/** 触发一个语义动作（键盘与触控按钮共用入口） */
export function fireAction(name) {
  document.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: { name } }));
}

export function isTouchMode() {
  return touchMode;
}

export function setTouchMode(on) {
  touchMode = !!on;
  document.body.classList.toggle('touch', touchMode);
}

/** 交互提示前缀：键盘「按 E」/ 触控「点 交互」 */
export function pressLabel() {
  return touchMode ? '点 <kbd>交互</kbd>' : '按 <kbd>E</kbd>';
}
