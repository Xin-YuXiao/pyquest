// ============================================================
// 秘藏石碑的场景侧行为：生成 / 触碰 / 两个会动的彩蛋特效
// - 触碰：首次发现登记 G.secrets（自动写档）+ 发现动效，然后弹出 REPL 卷轴
// - import antigravity：收起卷轴后浮空数秒（可飞越水面、免疫史莱姆碰撞），
//   时间到若仍在水面上方则继续浮空，直到回到岸上才落地——不会掉进水里卡住
// - while True：触碰即被卷进一个绕圈的「无限回廊」，按 Esc（或 Ctrl+C）发出
//   KeyboardInterrupt 跳出；不按也会在 LOOP.laps 圈后自动中断——不会困住玩家
// 数据（REPL 内容 / 选址）见 data/secrets.js；卷轴 DOM 见 ui/SecretScroll.js
// ============================================================
import { G, discoverSecret } from '../core/state.js';
import { getSecret, countFound, SECRET_TOTAL } from '../data/secrets.js';
import { T } from '../data/maps.js';
import { SecretScroll } from '../ui/SecretScroll.js';
import { sfx } from '../audio/sfx.js';

/** 秘藏石碑可交互/提示半径（px，世界坐标距离） */
export const SECRET_RADIUS = 240;

const FLOAT = { ms: 6000, lift: 28, bob: 4, rise: 300 };   // lift/bob 为帧内像素（玩家 ×2 显示）
const LOOP = { laps: 3, lapMs: 2400, r: 110, dy: 190 };      // 回廊圆心在石碑正下方 dy 处

// ---------- 生成 ----------
export function spawnSecretProp(scene, p) {
  if (!scene.secretScroll) {
    scene.secretScroll = new SecretScroll(scene);
    scene.events.once('shutdown', () => {
      scene.secretScroll.destroy();
      scene.secretScroll = null;
    });
  }
  const secret = getSecret(p.secretId);
  const sprite = scene.add.image(p.x, p.y + 24, 'secret_stone').setOrigin(0.5, 0.92).setDisplaySize(100, 140);
  sprite.setDepth(p.y);
  scene.add.image(p.x, p.y + 20, 'ts_shadow').setDisplaySize(110, 54).setAlpha(0.45).setDepth(p.y - 1);
  const it = { kind: 'secret', x: p.x, y: p.y, secretId: p.secretId, name: secret.name, sprite, alive: true };
  // 未发现：偶尔闪一下紫光（给探索者一点线索，不像符文石那样显眼）；已发现：常亮金星
  it.glow = scene.add.image(p.x, p.y - 96, 'particle').setScale(18).setDepth(p.y - 0.5);
  if (G.secrets.has(p.secretId)) markFound(scene, it);
  else {
    it.glow.setTint(0xb69cff).setAlpha(0);
    it.twinkle = scene.tweens.add({
      targets: it.glow, alpha: 0.55, scale: 24, duration: 500, yoyo: true,
      hold: 120, repeat: -1, repeatDelay: 1800, ease: 'sine.inout',
    });
  }
  scene.interactables.push(it);
  return it;
}

function markFound(scene, it) {
  if (it.twinkle) { it.twinkle.stop(); it.twinkle = null; }
  it.glow.setTint(0xffd257).setAlpha(0.3).setScale(16);
}

export function secretHint(it) {
  return G.secrets.has(it.secretId)
    ? `按 <kbd>E</kbd> 重读「${it.name}」`
    : '按 <kbd>E</kbd> 触碰神秘石碑';
}

// ---------- 触碰 ----------
export function interactSecret(scene, it) {
  const scroll = scene.secretScroll;
  if (!scroll || scroll.isOpen || scroll.coolingDown || scene.player.scripted) return;
  const secret = getSecret(it.secretId);
  const isNew = discoverSecret(secret.id);
  if (isNew) {
    markFound(scene, it);
    sfx.secret();
    scene.spawnShardFx(it.x, it.y - 80, 0xb69cff);
    scene.floatText(it.x, it.y - 260, `发现秘藏！ ${countFound(G.secrets)} / ${SECRET_TOTAL}`, '#d7c6ff');
  }
  const openScroll = () => scroll.open(secret, {
    isNew,
    found: countFound(G.secrets),
    total: SECRET_TOTAL,
    onClose: () => { if (secret.effect === 'antigravity') startFloat(scene); },
  });
  if (secret.effect === 'loop') startLoop(scene, it, openScroll);
  else openScroll();
}

// ---------- import antigravity：浮空 ----------
/** 抬升贴图但保持物理体不动：origin 与 body offset 同步平移（帧内像素） */
function setLift(pl, base, d) {
  pl.setOrigin(base.ox, base.oy + d / pl.height);
  pl.body.setOffset(base.bx, base.by + d);
}

/** 玩家物理体是否压在水面瓦片上 */
function overWater(scene) {
  const b = scene.player.body;
  const def = scene.def;
  const x0 = Math.floor(b.x / 128), x1 = Math.floor((b.x + b.width - 1) / 128);
  const y0 = Math.floor(b.y / 128), y1 = Math.floor((b.y + b.height - 1) / 128);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = def.grid[y] && def.grid[y][x];
    if (t === T.WATER || t === T.WATER2) return true;
  }
  return false;
}

export function startFloat(scene) {
  const pl = scene.player;
  if (!pl || pl.floating || pl.dying) return;
  pl.floating = true;
  pl.floatUntil = scene.time.now + FLOAT.ms; // 到点后若仍在水面上方，继续浮空直到上岸
  const base = { ox: pl.originX, oy: pl.originY, bx: pl.body.offset.x, by: pl.body.offset.y };
  const shadow = { w: pl.shadow.displayWidth, h: pl.shadow.displayHeight, a: pl.shadow.alpha };
  pl.shadow.setDisplaySize(shadow.w * 0.7, shadow.h * 0.7).setAlpha(shadow.a * 0.6);
  sfx.heal();
  scene.floatText(pl.x, pl.y - 260, '反重力！', '#d7c6ff');

  const lift = { d: 0 };
  const apply = () => setLift(pl, base, lift.d);
  const tweens = [];
  tweens.push(scene.tweens.add({
    targets: lift, d: FLOAT.lift, duration: FLOAT.rise, ease: 'sine.out', onUpdate: apply,
    onComplete: () => tweens.push(scene.tweens.add({
      targets: lift, d: FLOAT.lift - FLOAT.bob, duration: 520, yoyo: true, repeat: -1,
      ease: 'sine.inout', onUpdate: apply,
    })),
  }));
  // 脚下紫色星尘拖尾
  const trail = scene.time.addEvent({
    delay: 160, loop: true,
    callback: () => {
      const p = scene.add.image(pl.x, pl.y, 'particle').setTint(0xb69cff).setScale(8).setAlpha(0.6).setDepth(pl.y - 1);
      scene.tweens.add({ targets: p, alpha: 0, scale: 3, duration: 600, onComplete: () => p.destroy() });
    },
  });

  let warned = false;
  const tryLand = () => {
    if (!pl.active || pl.dying) return;
    if (overWater(scene)) {
      if (!warned) { warned = true; scene.floatText(pl.x, pl.y - 220, '先飞回岸边再落地', '#9fb8ff'); }
      scene.time.delayedCall(200, tryLand);
      return;
    }
    tweens.forEach((t) => t.stop());
    trail.remove();
    scene.tweens.add({
      targets: lift, d: 0, duration: 260, ease: 'sine.in', onUpdate: apply,
      onComplete: () => {
        setLift(pl, base, 0);
        pl.shadow.setDisplaySize(shadow.w, shadow.h).setAlpha(shadow.a);
        pl.floating = false;
      },
    });
  };
  scene.time.delayedCall(FLOAT.ms, tryLand);
}

// ---------- while True：无限回廊 ----------
export function startLoop(scene, it, onBreak) {
  const pl = scene.player;
  if (!pl || pl.scripted || pl.dying) return;
  pl.scripted = true;
  pl.scriptedHint = '无限回廊！按 <kbd>Esc</kbd> 发送 KeyboardInterrupt（Ctrl+C）';
  pl.setVelocity(0, 0);
  const invulBefore = pl.invulUntil;
  pl.invulUntil = Number.MAX_SAFE_INTEGER;

  const cx = it.x, cy = it.y + LOOP.dy;
  const a0 = -Math.PI / 2; // 从圆的最上方（石碑脚下）开始
  const place = (x, y) => {
    if (x !== pl.x) pl.setFlipX(x < pl.x);
    pl.setPosition(x, y);
    pl.body.reset(x, y);
    pl.setDepth(pl.y);
    pl.shadow.setPosition(pl.x, pl.y + 4).setDepth(pl.y - 0.5);
  };
  pl.anims.play('ts_warrior_run', true);

  let done = false;
  let tween = null;
  const kb = scene.input.keyboard;
  const onEsc = () => stop(false);
  const onC = (e) => { if (e.ctrlKey || e.metaKey) stop(false); };
  kb.on('keydown-ESC', onEsc);
  kb.on('keydown-C', onC);

  // 先小跑到圆上的起点，再开始绕圈
  const start = { x: pl.x, y: pl.y };
  const entry = scene.tweens.add({
    targets: start, x: cx + Math.cos(a0) * LOOP.r, y: cy + Math.sin(a0) * LOOP.r,
    duration: 300, onUpdate: () => place(start.x, start.y),
    onComplete: () => {
      if (done) return;
      const s = { a: a0 };
      tween = scene.tweens.add({
        targets: s, a: a0 + Math.PI * 2 * LOOP.laps, duration: LOOP.lapMs * LOOP.laps, ease: 'Linear',
        onUpdate: () => place(cx + Math.cos(s.a) * LOOP.r, cy + Math.sin(s.a) * LOOP.r),
        onComplete: () => stop(true),
      });
    },
  });

  function stop(auto) {
    if (done) return;
    done = true;
    entry.stop();
    if (tween) tween.stop();
    kb.off('keydown-ESC', onEsc);
    kb.off('keydown-C', onC);
    pl.scripted = false;
    pl.scriptedHint = null;
    pl.setVelocity(0, 0);
    pl.invulUntil = Math.max(invulBefore, scene.time.now + 800); // 跳出后短暂无敌缓冲
    pl.anims.play('ts_warrior_idle', true);
    sfx.hitEnemy();
    scene.cameras.main.shake(120, 0.003);
    scene.floatText(pl.x, pl.y - 220, 'KeyboardInterrupt', '#ff9db3');
    if (auto) scene.time.delayedCall(500, () => scene.floatText(pl.x, pl.y - 120, '（解释器替你按下了 Ctrl+C）', '#d7c6ff'));
    scene.time.delayedCall(auto ? 1200 : 700, onBreak);
  }
}
