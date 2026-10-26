// ============================================================
// 面板玩法（ui/GamePanel 调用 mount）——建设中的占位实现
// mount(ctx) → 控制器 { destroy(), snapshot(), onKey?(e) }；接口说明见 ui/GamePanel.js
// ============================================================
export function mount(ctx) {
  ctx.root.innerHTML = '<p class="gp-empty">这座试炼场还在建设中……</p>';
  return { destroy() {}, snapshot: () => ({ placeholder: true }) };
}
