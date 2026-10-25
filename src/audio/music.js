// ============================================================
// 程序化 chiptune 背景音乐：WebAudio 小型音序器（零音频素材、零许可证问题）
// - 曲目数据与章节映射在 audio/tracks.js（纯数据，Node 里可校验）
// - lookahead 调度：定时器每 25ms 醒一次，把未来 120ms 内的音符按
//   AudioContext 时间轴预排——主线程偶发卡顿不影响节拍，不漂移
// - 增益链：曲目淡入淡出增益 → 音乐总线（开关 / 静音）→ 压低总线 → 输出；
//   切曲交叉淡化（旧曲淡出后立即断开），不叠音
// - 答题面板打开时压低音乐（教学游戏：答题不分心），关闭后平滑恢复
// - 自动播放策略：首次用户交互（pointerdown / keydown / touchstart）后才启动；
//   切后台挂起 AudioContext、回前台恢复；无 WebAudio 的环境静默降级
//   （逻辑状态照常维护，测试接缝仍可读）
// - 开关：M = 音乐与音效一起静音（不持久化，与旧行为一致）；
//   N / 标题页图标 = 只开关音乐（持久化到独立设置键，不进游戏存档）
// ============================================================
import { audioContext } from './sfx.js';
import { compileTrack } from './tracks.js';

const PREF_KEY = 'pyquest:settings:music';
const LOOKAHEAD = 0.12;  // 预排窗口（秒）
const TICK_MS = 25;      // 调度器唤醒间隔
const FADE = 0.6;        // 切曲 / 开关的淡入淡出（秒）
const BUS_LEVEL = 0.55;  // 音乐总线电平：压在音效之下
const DUCK_LEVEL = 0.15; // 答题时压低到原音量的 15%

function loadPref() {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}
function savePref(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* 隐私模式：仅本次有效 */ }
}

const st = { track: null, ducked: false, musicOn: loadPref(), muted: false, started: false };
let ctx = null;
let bus = null;       // 音乐总线
let duckBus = null;   // 压低总线
let player = null;    // 当前曲目播放器
let oneShotDone = false; // 不循环的曲目（胜利号角）放完后不再自动重播
const fading = new Set(); // 正在淡出、尚未断开的旧播放器
const compiled = new Map();
const waveCache = new Map();
let noiseBuf = null;

const getTrack = (id) => {
  if (!compiled.has(id)) compiled.set(id, compileTrack(id));
  return compiled.get(id);
};

function emit() {
  document.dispatchEvent(new CustomEvent('pyquest:music', { detail: state() }));
}

// ---------- 合成：音符与鼓 ----------
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** 脉冲波（占空比 duty）的傅里叶系数 → PeriodicWave（经典 8-bit 音色） */
function pulseWave(duty) {
  if (!waveCache.has(duty)) {
    const N = 32;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    waveCache.set(duty, ctx.createPeriodicWave(real, imag));
  }
  return waveCache.get(duty);
}

function playNote(wave, midi, t, dur, vol, dest) {
  const osc = ctx.createOscillator();
  if (wave === 'pulse25') osc.setPeriodicWave(pulseWave(0.25));
  else if (wave === 'pulse12') osc.setPeriodicWave(pulseWave(0.125));
  else osc.type = wave;
  osc.frequency.setValueAtTime(midiHz(midi), t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);       // 起音
  g.gain.setTargetAtTime(vol * 0.6, t + 0.02, 0.08);    // 衰减到持续电平
  g.gain.setTargetAtTime(0.0001, t + dur, 0.025);       // 释音
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.15);
}

function noise(t, dur, vol, filterType, freq, dest) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5, dur + 0.02);
}

function playDrum(kind, t, vol, dest) {
  if (kind === 'kick') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(vol * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.16);
  } else if (kind === 'snare') {
    noise(t, 0.12, vol * 0.45, 'bandpass', 1800, dest);
    playNote('triangle', 54, t, 0.04, vol * 0.25, dest);
  } else if (kind === 'hat') {
    noise(t, 0.035, vol * 0.22, 'highpass', 7000, dest);
  } else if (kind === 'openhat') {
    noise(t, 0.14, vol * 0.2, 'highpass', 6000, dest);
  }
}

// ---------- 曲目播放器（lookahead 调度） ----------
class TrackPlayer {
  constructor(id) {
    this.id = id;
    this.t = getTrack(id);
    this.stepDur = 60 / this.t.bpm / 4;
    this.step = 0;
    const now = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(1, now + FADE);
    this.out.connect(bus);
    this.next = now + 0.05;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  tick() {
    const now = ctx.currentTime;
    // 定时器被浏览器节流而落后：跳过已错过的格子，不在过去时刻补排一串音
    if (this.next < now - 0.05) {
      const missed = Math.ceil((now - this.next) / this.stepDur);
      this.step += missed;
      this.next += missed * this.stepDur;
    }
    while (this.next < now + LOOKAHEAD) {
      if (!this.t.loop && this.step >= this.t.length) { this.finish(); return; }
      this.schedule(this.step % this.t.length, this.next);
      this.step++;
      this.next += this.stepDur;
    }
  }

  schedule(i, time) {
    const t = time + (i % 2 ? this.t.swing * this.stepDur : 0); // 摇摆：反拍略微推后
    for (const v of this.t.voices) {
      for (const ev of v.byStep[i]) playNote(v.wave, ev.midi, t, ev.len * this.stepDur * 0.92, v.vol, this.out);
    }
    if (this.t.drums) for (const ev of this.t.drums.byStep[i]) playDrum(ev.kind, t, this.t.drums.vol, this.out);
  }

  /** 不循环的曲目排完最后一格：等余音结束后断开，并标记「已放完」 */
  finish() {
    clearInterval(this.timer);
    const tail = Math.max(0, this.next - ctx.currentTime) + 0.4;
    setTimeout(() => {
      this.dispose();
      if (player === this) { player = null; oneShotDone = true; emit(); }
    }, tail * 1000);
  }

  /** 淡出后断开（交叉淡化 / 关音乐） */
  stop() {
    clearInterval(this.timer);
    const g = this.out.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE);
    fading.add(this);
    setTimeout(() => { this.dispose(); fading.delete(this); emit(); }, (FADE + LOOKAHEAD) * 1000 + 100);
  }

  dispose() {
    clearInterval(this.timer);
    try { this.out.disconnect(); } catch { /* 已断开 */ }
  }
}

// ---------- 状态同步 ----------
function wantedTrack() {
  if (!st.started || !st.musicOn || st.muted || !st.track) return null;
  if (!getTrack(st.track).loop && oneShotDone) return null;
  return st.track;
}

function sync() {
  if (!ctx) return;
  const want = wantedTrack();
  if (player && player.id === want) return;
  if (player) { player.stop(); player = null; }
  if (want) player = new TrackPlayer(want);
}

function applyDuck() {
  if (!duckBus) return;
  duckBus.gain.setTargetAtTime(st.ducked ? DUCK_LEVEL : 1, ctx.currentTime, 0.12);
}

/** 首次用户交互：建立（或复用音效模块的）AudioContext 与总线，开始播放 */
function unlock() {
  if (st.started) return;
  removeUnlockListeners();
  const c = audioContext();
  if (!c) return; // 无 WebAudio：静默降级
  ctx = c;
  bus = ctx.createGain();
  bus.gain.value = BUS_LEVEL;
  duckBus = ctx.createGain();
  duckBus.gain.value = st.ducked ? DUCK_LEVEL : 1;
  bus.connect(duckBus).connect(ctx.destination);
  st.started = true;
  sync();
  emit();
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'];
function removeUnlockListeners() {
  UNLOCK_EVENTS.forEach((ev) => window.removeEventListener(ev, unlock, true));
}

if (typeof window !== 'undefined') {
  UNLOCK_EVENTS.forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  // 切后台挂起整个音频时钟（调度器随之停排），回前台恢复
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });
}

// ---------- 对外接口 ----------
/** 只读状态快照（测试接缝 audio() 直接返回它） */
export function state() {
  return { ...st, playing: !!player, layers: (player ? 1 : 0) + fading.size };
}

export const music = {
  /** 切到某首曲目（同一首正在放时不重启：死亡重生 / 场景重启保持连贯） */
  play(id) {
    if (id === st.track && player && player.id === id) return;
    st.track = id;
    oneShotDone = false;
    sync();
    emit();
  },
  /** 答题面板压低 / 恢复 */
  duck(on) {
    if (st.ducked === !!on) return;
    st.ducked = !!on;
    applyDuck();
    emit();
  },
  /** 只开关音乐（持久化）；返回开关后的状态 */
  toggle() {
    st.musicOn = !st.musicOn;
    savePref(st.musicOn);
    sync();
    emit();
    return st.musicOn;
  },
  /** 与音效静音（M 键）同步 */
  setMuted(m) {
    if (st.muted === !!m) return;
    st.muted = !!m;
    sync();
    emit();
  },
  state,
};
