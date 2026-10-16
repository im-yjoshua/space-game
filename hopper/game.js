'use strict';
/* STAR HOPPER v1 - hold-to-fly tunnel runner. Vanilla canvas, zero assets.
   Built for YouTube Playables via Playgama: no external calls except the
   Playgama Bridge SDK itself, tiny bundle, responsive, pause-aware. */

const TAU = Math.PI * 2;

/* ---------------- tuning (units: u = H/100) ---------------- */
const CFG = {
  grav: 55,         // gravity accel, u/s^2
  thrust: 130,      // jetpack accel against gravity, u/s^2
  maxFall: 42,      // max fall speed, u/s
  maxRise: 34,      // max rise speed, u/s
  dropSpeed: 70,    // sudden-drop speed, u/s
  dropLock: 0.25,   // s of ignored thrust input after a drop
  fling: 34,        // gravity-gate transition speed toward the new surface, u/s
  fuelMax: 100,
  fuelBurn: 30,     // per s while thrusting
  fuelRefill: 48,   // per s while running on the surface
  speed0: 44,       // world speed, u/s
  speedGain: 1.15,  // u/s gained per second
  speedMax: 98,
  spawn0: 1.5,      // s between patterns at t=0
  spawnMin: 0.55,
  spawnRamp: 0.02,
  hitPad: 0.8,      // player hitbox shrink factor (fairness)
  nearGap: 1.5,     // x player heights: near-miss vertical window
  comboWindow: 4,
  maxMult: 5,
  gateAt: 40,       // first gravity gate no earlier than this (s)
  gateEvery: 28,    // min gap between gates (s)
  shieldTime: 3,
};

/* ---------------- pure logic (unit-tested) ---------------- */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function circleRect(cx, cy, r, rc) {
  const nx = clamp(cx, rc.x, rc.x + rc.w);
  const ny = clamp(cy, rc.y, rc.y + rc.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
// gravity sign s: 1 = normal (floor below), -1 = flipped (floor above)
function flipSign(s) { return -s; }
// y of the player's TOP edge when standing on the current surface
function surfTop(s, groundY, ceilY, ph) { return s === 1 ? groundY - ph : ceilY; }
function burnFuel(f, dt) { return Math.max(0, f - CFG.fuelBurn * dt); }
function refillFuel(f, dt) { return Math.min(CFG.fuelMax, f + CFG.fuelRefill * dt); }
function speedAt(t) { return Math.min(CFG.speedMax, CFG.speed0 + t * CFG.speedGain); }
function spawnInterval(t) { return Math.max(CFG.spawnMin, CFG.spawn0 - t * CFG.spawnRamp); }
function comboMult(combo) { return Math.min(1 + combo * 0.1, CFG.maxMult); }
function canAfford(shards, cost) { return shards >= cost; }
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TAU, CFG, clamp, rectsOverlap, circleRect, flipSign, surfTop, burnFuel, refillFuel, speedAt, spawnInterval, comboMult, canAfford };
}
/* node-only test handle */
if (typeof module !== 'undefined' && module.exports) {
  module.exports._test = function () {
    return { G, save, CFG: CFG, startGame, drop, setHeld, die, buildCustom, update, render, PACKS, packSkin, spawnPattern, applyPow, checkMission, missionProgress, MISSIONS, POWERS, Sfx };
  };
}

/* ---------------- jetpack skins (drawn on the player's back) ---------------- */
function packBase(g, w, h, c1, c2) {
  g.fillStyle = c1;
  g.beginPath();
  if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, w * 0.25);
  else g.rect(-w / 2, -h / 2, w, h);
  g.fill();
  g.fillStyle = c2;
  g.fillRect(-w / 2, -h * 0.12, w, h * 0.24);
  g.fillStyle = '#2b2f3a';
  g.beginPath();
  g.moveTo(-w * 0.3, h / 2); g.lineTo(0, h / 2 + h * 0.28); g.lineTo(w * 0.3, h / 2);
  g.closePath(); g.fill();
}
function flame(g, w, h, t) {
  const f = 0.7 + 0.3 * Math.sin(t * 40);
  g.fillStyle = '#ffb703';
  g.beginPath();
  g.moveTo(-w * 0.22, h / 2 + h * 0.28);
  g.lineTo(0, h / 2 + h * (0.28 + 0.55 * f));
  g.lineTo(w * 0.22, h / 2 + h * 0.28);
  g.closePath(); g.fill();
  g.fillStyle = '#ffe66d';
  g.beginPath();
  g.moveTo(-w * 0.1, h / 2 + h * 0.28);
  g.lineTo(0, h / 2 + h * (0.28 + 0.32 * f));
  g.lineTo(w * 0.1, h / 2 + h * 0.28);
  g.closePath(); g.fill();
}
const PACKS = [
  { id: 'spark',   name: 'SPARK',   cost: 0,   c1: '#e63946', c2: '#ffb703' },
  { id: 'dart',    name: 'DART',    cost: 50,  c1: '#22d3ee', c2: '#a5f3fc' },
  { id: 'shuttle', name: 'SHUTTLE', cost: 150, c1: '#f97316', c2: '#fdba74' },
  { id: 'saucer',  name: 'SAUCER',  cost: 300, c1: '#a855f7', c2: '#f5d0fe' },
];

/* ---------------- save data ---------------- */
const SAVE_KEY = 'hopper_save_v1';
let save = { best: 0, shards: 0, pack: 'spark', uP: ['spark'], games: 0, mProg: { score2500: 0, shards40: 0, gates4: 0 }, mDone: [] };

/* ---------------- Playgama Bridge adapter (defensive: game runs without it) ---------------- */
let BR = null;
function bridgeReady() { return !!BR; }

async function initBridge(timeoutMs) {
  timeoutMs = timeoutMs || 2500;
  if (typeof window === 'undefined') return null;
  const t0 = Date.now();
  try {
    while (!window.bridge && Date.now() - t0 < timeoutMs) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (window.bridge && typeof window.bridge.initialize === 'function') {
      await window.bridge.initialize();
      BR = window.bridge;
    }
  } catch (e) { BR = null; }
  return BR;
}

async function loadSave() {
  let s = null;
  try {
    if (BR && BR.storage && typeof BR.storage.get === 'function') {
      const r = await BR.storage.get([SAVE_KEY], true);
      s = (r && typeof r === 'object' && SAVE_KEY in r) ? r[SAVE_KEY] : r;
      if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = null; } }
    }
  } catch (e) { /* fall through to localStorage */ }
  if (!s) {
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
  }
  if (s && typeof s === 'object') {
    if (typeof s.best === 'number') save.best = s.best;
    if (typeof s.shards === 'number') save.shards = s.shards;
    if (typeof s.pack === 'string') save.pack = s.pack;
    if (Array.isArray(s.uP)) save.uP = s.uP;
    if (typeof s.games === 'number') save.games = s.games;
    if (s.mProg && typeof s.mProg === 'object') save.mProg = Object.assign({ score2500: 0, shards40: 0, gates4: 0 }, s.mProg);
    if (Array.isArray(s.mDone)) save.mDone = s.mDone;
  }
}

async function persist() {
  try {
    if (BR && BR.storage && typeof BR.storage.set === 'function') {
      try { await BR.storage.set([SAVE_KEY], [save]); }
      catch (e) { await BR.storage.set({ [SAVE_KEY]: save }); }
    }
  } catch (e) { /* fall through */ }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* blocked */ }
}

/* ---------------- ads (only at natural pauses, fully guarded) ---------------- */
function adsOn() { return !!(BR && BR.advertisement); }
async function showInterstitial(placement) {
  if (!adsOn()) return false;
  try {
    const f = BR.advertisement.showInterstitial;
    if (typeof f === 'function') { await f.call(BR.advertisement, placement); return true; }
  } catch (e) { /* ad failed: game continues */ }
  return false;
}
async function showRewarded(placement) {
  if (!adsOn()) return false;
  try {
    const f = BR.advertisement.showRewarded;
    if (typeof f === 'function') { await f.call(BR.advertisement, placement); return true; }
  } catch (e) { /* ad failed */ }
  return false;
}
function gameReady() {
  try {
    if (BR && BR.platform && typeof BR.platform.sendMessage === 'function') {
      BR.platform.sendMessage('game_ready');
    }
  } catch (e) { /* ignore */ }
}
function watchHostLifecycle(onPause) {
  try {
    if (BR && BR.EVENT_NAME && BR.platform && typeof BR.platform.on === 'function') {
      BR.platform.on(BR.EVENT_NAME.PAUSE_STATE_CHANGED, function (paused) { if (paused) onPause(); });
      BR.platform.on(BR.EVENT_NAME.AUDIO_STATE_CHANGED, function (enabled) { Sfx.setMuted(!enabled); refreshSoundBtn(); });
    }
  } catch (e) { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) onPause();
    });
  }
}

/* ---------------- audio: synthesized SFX + music, zero assets ---------------- */
const Sfx = {
  ctx: null, master: null, musicBus: null, noiseBuf: null,
  muted: false, thrust: null, musicTimer: null, mStep: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.13;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
  },
  get ok() { return !!(this.ctx && !this.muted); },
  tone(o) {
    if (!this.ok) return;
    try {
      const t0 = this.ctx.currentTime + (o.delay || 0);
      const osc = this.ctx.createOscillator(), gn = this.ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t0);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.linearRampToValueAtTime(o.vol || 0.3, t0 + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      osc.connect(gn); gn.connect(o.bus || this.master);
      osc.start(t0); osc.stop(t0 + o.dur + 0.05);
    } catch (e) { /* audio is best-effort */ }
  },
  noise(o) {
    if (!this.ok || !this.noiseBuf) return;
    try {
      const t0 = this.ctx.currentTime + (o.delay || 0);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const flt = this.ctx.createBiquadFilter();
      flt.type = o.type || 'lowpass';
      flt.frequency.setValueAtTime(o.freq || 800, t0);
      flt.Q.value = o.q || 0.8;
      if (o.slideTo) flt.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + o.dur);
      const gn = this.ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.linearRampToValueAtTime(o.vol || 0.3, t0 + 0.015);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      src.connect(flt); flt.connect(gn); gn.connect(this.master);
      src.start(t0); src.stop(t0 + o.dur + 0.05);
    } catch (e) { /* audio is best-effort */ }
  },
  click()   { this.tone({ f: 660, f2: 440, dur: 0.07, type: 'square', vol: 0.1 }); },
  pickup()  { this.tone({ f: 880, dur: 0.09, vol: 0.2 }); this.tone({ f: 1320, dur: 0.12, vol: 0.18, delay: 0.06 }); },
  nearMiss(){ this.tone({ f: 1760, dur: 0.08, vol: 0.12 }); },
  dropSfx() { this.noise({ dur: 0.25, vol: 0.22, freq: 3000, slideTo: 300, type: 'highpass' }); },
  thud()    { this.noise({ dur: 0.12, vol: 0.13, freq: 350 }); },
  explosion(){ this.noise({ dur: 0.5, vol: 0.45, freq: 900, slideTo: 80 }); this.tone({ f: 160, f2: 40, dur: 0.5, type: 'sawtooth', vol: 0.28 }); },
  gate()    { this.tone({ f: 220, f2: 880, dur: 0.35, type: 'sawtooth', vol: 0.18 }); this.tone({ f: 440, f2: 1760, dur: 0.35, vol: 0.1, delay: 0.05 }); },
  over()    { [392, 330, 262, 196].forEach((f, i) => this.tone({ f, dur: 0.22, type: 'triangle', vol: 0.22, delay: 0.15 + i * 0.16 })); },
  revive()  { [262, 392, 523, 784].forEach((f, i) => this.tone({ f, dur: 0.15, vol: 0.18, delay: i * 0.08 })); },
  power()   { this.tone({ f: 523, f2: 1046, dur: 0.25, vol: 0.2 }); },
  thrustStart() {
    if (!this.ok || this.thrust) return;
    try {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const flt = this.ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 420; flt.Q.value = 0.6;
      const gn = this.ctx.createGain(); gn.gain.value = 0.0001;
      gn.gain.setTargetAtTime(0.15, this.ctx.currentTime, 0.06);
      src.connect(flt); flt.connect(gn); gn.connect(this.master); src.start();
      this.thrust = { src, gn };
    } catch (e) { /* ignore */ }
  },
  thrustStop() {
    if (!this.thrust || !this.ctx) { this.thrust = null; return; }
    const th = this.thrust; this.thrust = null;
    try {
      th.gn.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      setTimeout(() => { try { th.src.stop(); } catch (e) {} }, 220);
    } catch (e) { /* ignore */ }
  },
  musicStart() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [110, 0, 110, 0, 130.8, 0, 98, 0, 110, 0, 110, 0, 146.8, 0, 130.8, 98];
    const arp = [220, 261.6, 329.6, 261.6, 220, 329.6, 392, 329.6, 220, 261.6, 329.6, 440, 392, 329.6, 261.6, 220];
    this.musicTimer = setInterval(() => {
      if (!this.ok) return;
      const i = this.mStep % 16; this.mStep++;
      if (bass[i]) this.tone({ f: bass[i], dur: 0.22, type: 'triangle', vol: 0.5, bus: this.musicBus });
      if (i % 2 === 0) this.tone({ f: arp[i], dur: 0.18, vol: 0.2, bus: this.musicBus });
      if (i % 4 === 2) this.noise({ dur: 0.03, vol: 0.04, freq: 6000, type: 'highpass' });
    }, 230);
  },
};

/* ---------------- missions ---------------- */
const MISSIONS = [
  { id: 'score2500', name: 'Score 2,500 in one run', target: 2500, reward: 60 },
  { id: 'shards40', name: 'Collect 40 shards', target: 40, reward: 50 },
  { id: 'gates4', name: 'Pass 4 gravity gates', target: 4, reward: 70 },
];
function missionProgress(id) {
  return Math.floor((save.mProg && save.mProg[id]) || 0);
}
function checkMission(id) {
  const m = MISSIONS.find(x => x.id === id);
  if (!m || (save.mDone || []).includes(id)) return false;
  if (missionProgress(id) >= m.target) {
    save.mDone.push(id);
    save.shards += m.reward;
    persist();
    Sfx.power();
    showToast('MISSION COMPLETE  +' + m.reward + ' SHARDS');
    return true;
  }
  return false;
}
let toastTimer = null;
function showToast(text) {
  if (typeof document === 'undefined') return;
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
}

/* ---------------- power-ups ---------------- */
const POWERS = [
  { kind: 'shield', label: 'SHD', color: '#7df9ff', name: 'SHIELD' },
  { kind: 'magnet', label: 'MAG', color: '#f9a8d4', name: 'MAGNET' },
  { kind: 'x2', label: '2X', color: '#ffe66d', name: 'DOUBLE SCORE' },
];
function applyPow(kind) {
  if (kind === 'shield') G.shieldT = 12;
  else if (kind === 'magnet') G.magnetT = 10;
  else if (kind === 'x2') G.x2T = 12;
  Sfx.power();
  const p = POWERS.find(x => x.kind === kind);
  showToast((p ? p.name : 'POWER') + ' UP!');
}
function scoreMult() { return comboMult(G.combo) * (G.x2T > 0 ? 2 : 1); }

/* ---------------- game state ---------------- */
const G = {
  screen: 'boot', // menu | play | over | custom | paused
  paused: false,
  // run state (positions in px)
  px: 0, py: 0, vy: 0, pw: 0, ph: 0,
  s: 1,                 // gravity sign: 1 normal, -1 flipped
  fuel: 100, held: false, dropT: 0, onGround: true, thrusting: false,
  elapsed: 0, speed: 0, score: 0, combo: 0, comboT: 0, runShards: 0,
  obs: [], parts: [],
  spawnT: 0, lastGate: -99, shieldT: 0, usedRevive: false,
  hitStop: 0, shake: 0, squashT: 0, prevGround: true,
  magnetT: 0, x2T: 0,
  // layout
  W: 0, H: 0, u: 8, groundY: 0, ceilY: 0,
  stars: [], hillOff: 0, bgFarOff: 0, attract: false,
  prevScreen: 'menu',
};

function packSkin() { return PACKS.find(p => p.id === save.pack) || PACKS[0]; }
function playerBox() {
  const pad = (1 - CFG.hitPad) / 2;
  return { x: G.px + G.pw * pad, y: G.py + G.ph * pad, w: G.pw * (1 - 2 * pad), h: G.ph * (1 - 2 * pad) };
}

function resetRun() {
  layout();
  G.s = 1;
  G.px = Math.min(G.W * 0.3, 45 * G.u);
  G.pw = 6 * G.u; G.ph = 9 * G.u;
  G.py = surfTop(1, G.groundY, G.ceilY, G.ph);
  G.vy = 0; G.fuel = CFG.fuelMax; G.held = false; G.dropT = 0;
  G.onGround = true; G.thrusting = false;
  G.elapsed = 0; G.speed = CFG.speed0 * G.u; G.score = 0;
  G.combo = 0; G.comboT = 0; G.runShards = 0;
  G.obs = []; G.parts = [];
  G.spawnT = 1.2; G.lastGate = -99; G.shieldT = 0; G.usedRevive = false;
  G.hitStop = 0; G.shake = 0; G.squashT = 0; G.prevGround = true;
  G.magnetT = 0; G.x2T = 0;
  G.paused = false;
}

/* ---------------- spawning ---------------- */
function spawnPattern() {
  const u = G.u, X = G.W + 60;
  const t = G.elapsed;
  const roll = Math.random();
  // gravity gate: rare, only after gateAt, spaced out
  if (t > CFG.gateAt && t - G.lastGate > CFG.gateEvery * (0.8 + Math.random() * 0.6) && roll < 0.18) {
    G.obs.push({ type: 'gate', x: X, w: 6 * u, passed: false });
    G.lastGate = t;
    return;
  }
  if (roll < 0.30) {
    // floor spikes
    const n = 1 + Math.floor(Math.random() * (t > 30 ? 3 : 2));
    for (let i = 0; i < n; i++) {
      const w = 6 * u, h = (6 + Math.random() * 3) * u;
      G.obs.push({ type: 'spike', side: 'floor', x: X + i * 16 * u, w, h, counted: false });
    }
  } else if (roll < 0.55) {
    // ceiling spikes
    const n = 1 + Math.floor(Math.random() * (t > 30 ? 3 : 2));
    for (let i = 0; i < n; i++) {
      const w = 6 * u, h = (6 + Math.random() * 3) * u;
      G.obs.push({ type: 'spike', side: 'ceil', x: X + i * 16 * u, w, h, counted: false });
    }
  } else if (roll < 0.78) {
    // mines at staggered heights, some drifting
    const n = 2 + Math.floor(Math.random() * 2);
    let y = G.ceilY + (12 + Math.random() * 20) * u;
    for (let i = 0; i < n; i++) {
      y = clamp(y + (Math.random() - 0.5) * 30 * u, G.ceilY + 10 * u, G.groundY - 10 * u);
      const drift = t > 25 && Math.random() < 0.45;
      G.obs.push({ type: 'mine', x: X + i * 24 * u, y, baseY: y, drift, amp: (5 + Math.random() * 6) * u, r: 4.2 * u, counted: false, seed: Math.random() * 10 });
    }
  } else {
    // shard arc (breather)
    const midY = (G.ceilY + G.groundY) / 2;
    for (let i = 0; i < 6; i++) {
      G.obs.push({ type: 'shard', x: X + i * 8 * u, y: midY + Math.sin((i / 5) * Math.PI) * -12 * u, r: 3.2 * u, taken: false, seed: Math.random() * 10 });
    }
  }
  // occasional power-up orb in a safe spot
  if (t > 20 && Math.random() < 0.14) {
    const kind = POWERS[Math.floor(Math.random() * POWERS.length)].kind;
    G.obs.push({ type: 'pow', kind, x: X + 30 * u, y: (G.ceilY + G.groundY) / 2, r: 4.5 * u, taken: false, seed: Math.random() * 10 });
  }
}

/* ---------------- physics + gameplay ---------------- */
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = speed * (0.4 + Math.random());
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, t: 0, color, r: 2 + Math.random() * 3 });
  }
}

function update(dt) {
  const u = G.u;
  G.elapsed += dt;
  G.speed = Math.min(CFG.speedMax * u, (CFG.speed0 + G.elapsed * CFG.speedGain) * u);
  const mult = scoreMult();
  G.score += G.speed * dt * 0.06 * mult;

  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  if (G.shieldT > 0) G.shieldT -= dt;
  if (G.magnetT > 0) G.magnetT -= dt;
  if (G.x2T > 0) G.x2T -= dt;
  if (G.dropT > 0) G.dropT -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 46);

  // thrust
  G.thrusting = false;
  if (G.dropT <= 0 && G.held && G.fuel > 0) {
    G.vy -= CFG.thrust * u * G.s * dt;
    G.fuel = burnFuel(G.fuel, dt);
    G.thrusting = true;
  }
  // gravity
  G.vy += CFG.grav * u * G.s * dt;
  G.vy = clamp(G.vy, -CFG.maxRise * u, CFG.maxFall * u);
  G.py += G.vy * dt;

  // surfaces
  const s = G.s;
  const vyBeforeSurf = G.vy;
  G.onGround = false;
  if (s === 1) {
    if (G.py + G.ph >= G.groundY) { G.py = G.groundY - G.ph; if (G.vy > 0) G.vy = 0; G.onGround = true; }
    if (G.py < G.ceilY - G.ph) { G.py = G.ceilY - G.ph; if (G.vy < 0) G.vy = 0; }
  } else {
    if (G.py <= G.ceilY) { G.py = G.ceilY; if (G.vy < 0) G.vy = 0; G.onGround = true; }
    if (G.py + G.ph > G.groundY) { G.py = G.groundY - G.ph; if (G.vy > 0) G.vy = 0; }
  }
  if (G.onGround && !G.prevGround) {
    const impact = Math.abs(vyBeforeSurf);
    if (impact > 16 * u) {
      G.squashT = 0.16;
      const fx = G.px + G.pw / 2;
      const fy = G.s === 1 ? G.groundY : G.ceilY;
      for (let i = 0; i < 10; i++) {
        G.parts.push({ x: fx + (Math.random() - 0.5) * G.pw, y: fy, vx: (Math.random() - 0.5) * 170, vy: -Math.random() * 130 * G.s, life: 0.45, t: 0, color: '#b8b2a7', r: 2 + Math.random() * 2.5 });
      }
      Sfx.thud();
    }
  }
  G.prevGround = G.onGround;
  if (G.squashT > 0) G.squashT -= dt;
  if (G.onGround && !G.thrusting) G.fuel = refillFuel(G.fuel, dt);

  // spawn
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    spawnPattern();
    G.spawnT = spawnInterval(G.elapsed) * (0.8 + Math.random() * 0.4);
  }

  // thrust flame particles
  if (G.thrusting && Math.random() < 0.6) {
    const bx = G.px - 2 * u, by = G.py + G.ph * 0.55;
    G.parts.push({ x: bx, y: by, vx: -G.speed * 0.4, vy: (Math.random() - 0.5) * 40, life: 0.3, t: 0, color: '#ffb703', r: 2.5 });
  }

  // move + interact obstacles
  const pb = playerBox();
  const pcx = pb.x + pb.w / 2, pcy = pb.y + pb.h / 2;
  for (let i = G.obs.length - 1; i >= 0; i--) {
    const ob = G.obs[i];
    const prevX = ob.x;
    ob.x -= G.speed * dt;
    if (ob.type === 'mine' && ob.drift) {
      ob.y = clamp(ob.baseY + Math.sin(G.elapsed * 2.2 + ob.seed) * ob.amp, G.ceilY + 6 * u, G.groundY - 6 * u);
    }

    if (ob.type === 'gate') {
      if (!ob.passed && prevX >= G.px && ob.x < G.px) {
        ob.passed = true;
        G.s = flipSign(G.s);
        G.vy = CFG.fling * G.u * G.s; // fling toward the new surface
        G.onGround = false;
        save.mProg.gates4++;
        checkMission('gates4');
        Sfx.gate();
        G.shake = Math.max(G.shake, 7);
        burst(G.px + G.pw / 2, (G.ceilY + G.groundY) / 2, '#c4b5fd', 24, 220);
      }
      if (ob.x < -60) G.obs.splice(i, 1);
      continue;
    }
    if (ob.type === 'shard') {
      if (!ob.taken) {
        if (G.magnetT > 0) {
          const mdx = pcx - ob.x, mdy = pcy - ob.y;
          const md = Math.hypot(mdx, mdy) || 1;
          if (md < 34 * u) { const pull = 48 * u * dt / md; ob.x += mdx * pull; ob.y += mdy * pull; }
        }
        const dx = ob.x - pcx, dy = ob.y - pcy;
        if (dx * dx + dy * dy < Math.pow(ob.r + G.pw * 0.5, 2)) {
          ob.taken = true;
          G.runShards++;
          save.mProg.shards40++;
          checkMission('shards40');
          G.score += 25 * (G.x2T > 0 ? 2 : 1);
          Sfx.pickup();
          burst(ob.x, ob.y, '#7df9ff', 8, 120);
          G.obs.splice(i, 1);
          continue;
        }
      }
      if (ob.x < -60) G.obs.splice(i, 1);
      continue;
    }
    if (ob.type === 'pow') {
      if (!ob.taken) {
        const dx = ob.x - pcx, dy = ob.y - pcy;
        if (dx * dx + dy * dy < Math.pow(ob.r + G.pw * 0.6, 2)) {
          ob.taken = true;
          applyPow(ob.kind);
          burst(ob.x, ob.y, '#ffffff', 12, 170);
          G.obs.splice(i, 1);
          continue;
        }
      }
      if (ob.x < -60) G.obs.splice(i, 1);
      continue;
    }

    // deadly: spike or mine
    let hit = false;
    if (ob.type === 'spike') {
      const r = ob.side === 'floor'
        ? { x: ob.x, y: G.groundY - ob.h, w: ob.w, h: ob.h }
        : { x: ob.x, y: G.ceilY, w: ob.w, h: ob.h };
      hit = rectsOverlap(pb, r);
      ob._cx = ob.x + ob.w / 2; ob._cy = r.y + r.h / 2; ob._hw = ob.w / 2; ob._hh = r.h / 2;
    } else { // mine
      hit = circleRect(ob.x, ob.y, ob.r, pb);
      ob._cx = ob.x; ob._cy = ob.y; ob._hw = ob.r; ob._hh = ob.r;
    }
    if (hit && G.shieldT <= 0) { die(); return; }

    // near-miss: fully passed us, close vertical gap, never touched
    if (!ob.counted && ob.x + (ob.w || ob.r * 2) < G.px) {
      ob.counted = true;
      const gap = Math.abs(pcy - ob._cy) - (pb.h / 2 + ob._hh);
      if (gap < CFG.nearGap * G.ph && gap > -G.ph * 0.2) {
        G.combo++;
        G.comboT = CFG.comboWindow;
        G.score += 15 * scoreMult();
        Sfx.nearMiss();
        G.shake = Math.max(G.shake, 4);
        burst(pcx, pcy, '#ffe66d', 6, 100);
      }
    }
    if (ob.x < -80) G.obs.splice(i, 1);
  }

  // particles
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.98; p.vy *= 0.98;
    if (p.t >= p.life) G.parts.splice(i, 1);
  }

  // parallax
  G.hillOff = (G.hillOff + G.speed * dt * 0.3) % (80 * u);
  G.bgFarOff += G.speed * dt * 0.06;
}

function die() {
  const pb = playerBox();
  burst(pb.x + pb.w / 2, pb.y + pb.h / 2, '#ff6b6b', 26, 260);
  burst(pb.x + pb.w / 2, pb.y + pb.h / 2, '#ffe66d', 14, 180);
  Sfx.explosion();
  Sfx.over();
  G.hitStop = 0.09; // brief freeze on death (juice)
  G.shake = 16;
  const finalScore = Math.floor(G.score);
  const isBest = finalScore > save.best;
  if (isBest) save.best = finalScore;
  save.mProg.score2500 = Math.max(save.mProg.score2500, finalScore);
  checkMission('score2500');
  save.shards += G.runShards;
  save.games++;
  persist();
  showOver(finalScore, isBest, G.runShards);
  if (save.games % 3 === 0) showInterstitial('game_over');
}

function drop() {
  if (G.screen !== 'play' || G.paused) return;
  G.vy = CFG.dropSpeed * G.u * G.s;
  G.dropT = CFG.dropLock;
  G.held = false;
  Sfx.dropSfx();
}
function setHeld(v) {
  if (G.screen !== 'play' || G.paused) return;
  if (v && G.dropT > 0) return;
  G.held = !!v;
}

/* ---------------- rendering + DOM (browser only) ---------------- */
let cv, g;
const $ = id => document.getElementById(id);

function layout() {
  const u = G.u;
  G.groundY = 82 * u;
  G.ceilY = 18 * u;
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  G.W = window.innerWidth; G.H = window.innerHeight;
  cv.width = Math.floor(G.W * dpr); cv.height = Math.floor(G.H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  G.u = G.H / 100;
  layout();
  if (G.screen === 'play') {
    G.px = Math.min(G.W * 0.3, 45 * G.u);
    G.pw = 6 * G.u; G.ph = 9 * G.u;
  }
  G.stars = [];
  for (let i = 0; i < 110; i++) {
    G.stars.push({ x: Math.random() * G.W, y: Math.random() * G.H, r: Math.random() * 1.6 + 0.4, tw: Math.random() * TAU, par: 0.1 + Math.random() * 0.25 });
  }
}

function drawPlayer(t) {
  const u = G.u, x = G.px, y = G.py, w = G.pw, h = G.ph;
  const skin = packSkin();
  const sq = G.squashT > 0 ? G.squashT / 0.16 : 0; // landing squash 1..0
  g.save();
  g.translate(x + w / 2, y + h / 2);
  if (G.s === -1) g.rotate(Math.PI);
  g.scale(1 + 0.26 * sq, 1 - 0.26 * sq);
  g.rotate(clamp(G.vy * 0.00035, -0.22, 0.22) * G.s); // lean into motion
  const hw = w / 2, hh = h / 2;

  // scarf fluttering behind
  g.fillStyle = skin.c1;
  for (let i = 0; i < 3; i++) {
    const wob = Math.sin(t * 11 - i * 0.9);
    g.save();
    g.translate(-hw * 1.05 - i * w * 0.24, -hh * 0.5 + wob * h * 0.05 - i * h * 0.015);
    g.rotate(wob * 0.4);
    g.fillRect(-w * 0.24, -h * 0.035, w * 0.26, h * 0.07);
    g.restore();
  }

  // jetpack on the back
  g.save();
  g.translate(-hw * 0.85, -hh * 0.1);
  packBase(g, w * 0.55, h * 0.72, skin.c1, skin.c2);
  if (G.thrusting) flame(g, w * 0.55, h * 0.72, t);
  g.restore();

  // legs: run cycle on ground, tucked in flight
  function leg(hx, swing) {
    const kx = hx + swing * w * 0.3, ky = hh * 0.6;
    const fx = hx + swing * w * 0.42, fy = hh * 0.96;
    g.strokeStyle = '#cbd5e1'; g.lineWidth = w * 0.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx, hh * 0.32); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
    g.fillStyle = '#475569';
    g.fillRect(fx - w * 0.15, fy - h * 0.035, w * 0.3, h * 0.07);
  }
  if (G.onGround) {
    const bob = Math.abs(Math.sin(t * 16)) * h * 0.03;
    g.translate(0, -bob);
    leg(-w * 0.14, Math.sin(t * 16));
    leg(w * 0.14, Math.sin(t * 16 + Math.PI));
  } else {
    leg(-w * 0.16, -0.5);
    leg(w * 0.1, 0.35);
  }

  // torso suit with shading
  g.fillStyle = '#e8eef5';
  g.beginPath();
  if (g.roundRect) g.roundRect(-w * 0.34, -hh * 0.62, w * 0.68, h * 0.66, w * 0.22);
  else g.rect(-w * 0.34, -hh * 0.62, w * 0.68, h * 0.66);
  g.fill();
  g.fillStyle = 'rgba(148,163,184,.45)';
  g.fillRect(w * 0.1, -hh * 0.62, w * 0.24, h * 0.66);
  // backpack straps
  g.strokeStyle = '#475569'; g.lineWidth = Math.max(1.5, w * 0.06);
  g.beginPath(); g.moveTo(-w * 0.3, -hh * 0.6); g.lineTo(-w * 0.12, hh * 0.04); g.stroke();
  g.beginPath(); g.moveTo(w * 0.3, -hh * 0.6); g.lineTo(w * 0.12, hh * 0.04); g.stroke();
  // chest light
  g.fillStyle = skin.c2;
  g.beginPath(); g.arc(-w * 0.1, -hh * 0.25, w * 0.07, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath(); g.arc(-w * 0.1, -hh * 0.25, w * 0.028, 0, TAU); g.fill();

  // arm: swings while running, swept back while flying
  g.strokeStyle = '#dbe4ee'; g.lineWidth = w * 0.16; g.lineCap = 'round';
  const armSw = G.onGround ? Math.sin(t * 16 + Math.PI) * 0.5 : -0.9;
  g.beginPath();
  g.moveTo(w * 0.28, -hh * 0.4);
  g.lineTo(w * 0.28 + armSw * w * 0.3, hh * 0.1);
  g.stroke();

  // helmet
  g.fillStyle = '#eef2f7';
  g.beginPath(); g.arc(w * 0.06, -hh * 0.78, w * 0.36, 0, TAU); g.fill();
  g.fillStyle = 'rgba(148,163,184,.5)';
  g.beginPath(); g.arc(w * 0.06, -hh * 0.78, w * 0.36, 0.6, 2.2); g.fill();
  g.fillStyle = '#eef2f7';
  g.beginPath(); g.arc(w * 0.06, -hh * 0.78, w * 0.3, 0, TAU); g.fill();
  // visor
  g.fillStyle = '#0ea5e9';
  g.beginPath(); g.arc(w * 0.16, -hh * 0.78, w * 0.21, -1.05, 1.05); g.fill();
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.beginPath(); g.arc(w * 0.22, -hh * 0.92, w * 0.06, -1.05, 1.05); g.fill();
  // antenna with blinking tip
  g.strokeStyle = '#94a3b8'; g.lineWidth = Math.max(1.5, w * 0.05);
  g.beginPath(); g.moveTo(-w * 0.2, -hh * 1.05); g.lineTo(-w * 0.32, -hh * 1.35); g.stroke();
  g.fillStyle = (Math.floor(t * 2) % 2 === 0) ? '#f43f5e' : '#7f1d1d';
  g.beginPath(); g.arc(-w * 0.32, -hh * 1.35, w * 0.05, 0, TAU); g.fill();

  g.restore();

  // shield ring
  if (G.shieldT > 0) {
    g.strokeStyle = 'rgba(125,249,255,' + (0.4 + 0.3 * Math.sin(t * 10)) + ')';
    g.lineWidth = 3;
    g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.max(w, h) * 0.85, 0, TAU); g.stroke();
  }
}

function drawObstacle(ob, t) {
  const u = G.u;
  if (ob.type === 'spike') {
    const y0 = ob.side === 'floor' ? G.groundY : G.ceilY;
    const dir = ob.side === 'floor' ? -1 : 1;
    g.fillStyle = '#94a3b8';
    g.beginPath();
    g.moveTo(ob.x, y0);
    g.lineTo(ob.x + ob.w / 2, y0 + dir * ob.h);
    g.lineTo(ob.x + ob.w, y0);
    g.closePath(); g.fill();
    g.fillStyle = '#cbd5e1';
    g.beginPath();
    g.moveTo(ob.x + ob.w * 0.3, y0);
    g.lineTo(ob.x + ob.w / 2, y0 + dir * ob.h * 0.55);
    g.lineTo(ob.x + ob.w * 0.7, y0);
    g.closePath(); g.fill();
  } else if (ob.type === 'mine') {
    const pulse = 1 + 0.08 * Math.sin(t * 6 + ob.seed);
    g.save(); g.translate(ob.x, ob.y); g.rotate(t * 1.5 + ob.seed);
    g.fillStyle = '#f43f5e';
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4);
      g.fillRect(-ob.r * 0.12, -ob.r * 1.25 * pulse, ob.r * 0.24, ob.r * 0.5);
    }
    g.fillStyle = '#881337';
    g.beginPath(); g.arc(0, 0, ob.r * 0.8 * pulse, 0, TAU); g.fill();
    g.fillStyle = '#fda4af';
    g.beginPath(); g.arc(-ob.r * 0.25, -ob.r * 0.25, ob.r * 0.25, 0, TAU); g.fill();
    g.restore();
  } else if (ob.type === 'gate') {
    const midY = (G.ceilY + G.groundY) / 2, gh = (G.groundY - G.ceilY) / 2;
    const glow = 0.55 + 0.35 * Math.sin(t * 5);
    g.strokeStyle = 'rgba(196,181,253,' + glow + ')';
    g.lineWidth = 5;
    g.beginPath(); g.ellipse(ob.x, midY, 9 * u, gh * 0.92, 0, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(233,213,255,' + (glow * 0.7) + ')';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(ob.x, midY, 6 * u, gh * 0.7, 0, 0, TAU); g.stroke();
  } else if (ob.type === 'shard' && !ob.taken) {
    const bob = Math.sin(t * 4 + ob.seed) * 2;
    g.save(); g.translate(ob.x, ob.y + bob); g.rotate(Math.PI / 4);
    g.fillStyle = '#7df9ff';
    const r = ob.r;
    g.fillRect(-r / 2, -r / 2, r, r);
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillRect(-r / 4, -r / 4, r / 2, r / 2);
    g.restore();
  } else if (ob.type === 'pow' && !ob.taken) {
    const p = POWERS.find(x => x.kind === ob.kind) || POWERS[0];
    const pulse = 1 + 0.15 * Math.sin(t * 5 + ob.seed);
    const bob = Math.sin(t * 3 + ob.seed) * 3;
    g.save();
    g.translate(ob.x, ob.y + bob);
    g.shadowColor = p.color; g.shadowBlur = 16;
    g.fillStyle = 'rgba(8,8,20,.88)';
    g.beginPath(); g.arc(0, 0, ob.r * pulse, 0, TAU); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = p.color; g.lineWidth = 2.5;
    g.beginPath(); g.arc(0, 0, ob.r * pulse, 0, TAU); g.stroke();
    g.fillStyle = p.color;
    g.font = 'bold ' + Math.max(10, Math.round(ob.r * 1.05)) + 'px system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.label, 0, 1);
    g.restore();
  }
}

/* ---------------- parallax background art ---------------- */
const BG = { far: null, mid: null };
function loadBackgrounds() {
  if (BG.far || BG.mid || typeof Image === 'undefined') return;
  try {
    const far = new Image(); far.src = 'assets/bg-far.webp';
    far.onload = () => { BG.far = far; };
    const mid = new Image(); mid.src = 'assets/bg-mid.webp';
    mid.onload = () => { BG.mid = mid; };
  } catch (e) { /* images are decoration; game runs without them */ }
}
// cover-fit draw; scrollX=0 centers a single copy, otherwise tiles horizontally
function drawCover(img, scrollX, yBob) {
  const s = Math.max(G.W / img.width, G.H / img.height);
  const w = img.width * s, h = img.height * s;
  const y = (G.H - h) / 2 + yBob;
  if (!scrollX) { g.drawImage(img, (G.W - w) / 2, y, w, h); return; }
  let x0 = -(scrollX % w);
  if (x0 > 0) x0 -= w;
  for (let x = x0; x < G.W; x += w) g.drawImage(img, x, y, w, h);
}
function render(t) {
  const u = G.u;
  g.save();
  if (G.shake > 0) g.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  // sky base (also the fallback before art loads)
  const bg = g.createLinearGradient(0, 0, 0, G.H);
  bg.addColorStop(0, '#0b0620'); bg.addColorStop(0.5, '#131033'); bg.addColorStop(1, '#1b1040');
  g.fillStyle = bg; g.fillRect(-24, -24, G.W + 48, G.H + 48);
  // parallax art
  if (BG.far) drawCover(BG.far, G.bgFarOff, 0);
  // sparse twinkling stars for depth
  for (const s of G.stars) {
    const sx = ((s.x - G.hillOff * s.par * 4) % G.W + G.W) % G.W;
    g.globalAlpha = 0.25 + 0.35 * Math.sin(t * 1.5 + s.tw);
    g.fillStyle = '#cfe4ff';
    g.fillRect(sx, s.y, s.r, s.r);
  }
  g.globalAlpha = 1;
  if (BG.mid) drawCover(BG.mid, 0, Math.sin(t * 0.4) * 8);
  // tunnel surfaces
  const surfGrad = g.createLinearGradient(0, G.groundY - 10 * u, 0, G.H);
  surfGrad.addColorStop(0, '#4a4270'); surfGrad.addColorStop(1, '#241d3f');
  g.fillStyle = surfGrad;
  g.fillRect(-24, G.groundY, G.W + 48, G.H - G.groundY + 24);
  const ceilGrad = g.createLinearGradient(0, 0, 0, G.ceilY + 10 * u);
  ceilGrad.addColorStop(0, '#1c1733'); ceilGrad.addColorStop(1, '#4a4270');
  g.fillStyle = ceilGrad;
  g.fillRect(-24, -24, G.W + 48, G.ceilY + 24);
  // glowing surface edges
  g.fillStyle = G.s === 1 ? 'rgba(255,230,109,.35)' : 'rgba(255,230,109,.12)';
  g.fillRect(-24, G.groundY, G.W + 48, 3);
  g.fillStyle = G.s === -1 ? 'rgba(196,181,253,.4)' : 'rgba(196,181,253,.14)';
  g.fillRect(-24, G.ceilY - 3, G.W + 48, 3);
  // scrolling surface ticks
  g.fillStyle = 'rgba(255,255,255,.07)';
  const tickGap = 24 * u;
  const off = G.hillOff % tickGap;
  for (let x = -off - 24; x < G.W + 24; x += tickGap) {
    g.fillRect(x, G.groundY + 8 * u, 3, 6 * u);
    g.fillRect(x + tickGap / 2, G.ceilY - 14 * u, 3, 6 * u);
  }

  // obstacles, player, particles
  for (const ob of G.obs) drawObstacle(ob, t);
  if (G.screen === 'play' || G.screen === 'paused' || G.attract) drawPlayer(t);
  for (const p of G.parts) {
    g.globalAlpha = Math.max(0, 1 - p.t / p.life);
    g.fillStyle = p.color;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;

  // speed lines when fast
  if (G.screen === 'play' && G.speed > 70 * u) {
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = ((i * 197 + t * 900) % G.H);
      const x0 = G.W - ((t * 1400 + i * 331) % (G.W * 1.2));
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 60, y); g.stroke();
    }
  }
  g.restore();
}

/* ---------------- attract mode: living world behind menus ---------------- */
function attractUpdate(dt) {
  const u = G.u;
  G.elapsed += dt;
  G.speed = Math.min(CFG.speedMax * u, (CFG.speed0 + G.elapsed * CFG.speedGain) * u);
  G.hillOff = (G.hillOff + G.speed * dt * 0.3) % (80 * u);
  G.bgFarOff += G.speed * dt * 0.06;
  // gentle autopilot hover
  const midY = (G.ceilY + G.groundY) / 2;
  const targetY = midY + Math.sin(G.elapsed * 0.7) * 50;
  G.py += clamp(targetY - (G.py + G.ph / 2), -1, 1) * G.speed * dt * 0.5;
  G.vy = 0;
  G.onGround = false; // flight pose while hovering
  for (let i = G.obs.length - 1; i >= 0; i--) {
    const ob = G.obs[i];
    ob.x -= G.speed * dt;
    if (ob.x < -80) G.obs.splice(i, 1);
  }
  G.spawnT -= dt;
  if (G.spawnT <= 0) { spawnPattern(); G.spawnT = spawnInterval(G.elapsed) * (0.8 + Math.random() * 0.4); }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t >= p.life) G.parts.splice(i, 1);
  }
}
/* ---------------- HUD + screens ---------------- */
function setScreen(name) {
  G.screen = name;
  if (name !== 'play') Sfx.thrustStop();
  ['menu', 'over', 'custom', 'paused'].forEach(s => $('' + s).classList.toggle('hidden', s !== name));
  const inGame = name === 'play';
  $('hud').classList.toggle('hidden', !inGame);
  $('pauseBtn').classList.toggle('hidden', !inGame);
  $('dropBtn').classList.toggle('hidden', !inGame);
}
function refreshSoundBtn() {
  const b = $('soundBtn');
  if (b) b.textContent = Sfx.muted ? 'SOUND: OFF' : 'SOUND: ON';
}
function refreshMenu() {
  $('mBest').textContent = save.best;
  $('mShards').textContent = save.shards;
  renderMissions();
}
function renderMissions() {
  const box = $('missions');
  if (!box) return;
  box.innerHTML = '';
  MISSIONS.forEach(m => {
    const done = (save.mDone || []).includes(m.id);
    const prog = Math.min(missionProgress(m.id), m.target);
    const d = document.createElement('div');
    d.className = 'mission' + (done ? ' done' : '');
    d.textContent = (done ? 'DONE  ' : '') + m.name + '  ' + prog + '/' + m.target + '  (+' + m.reward + ')';
    box.appendChild(d);
  });
}
function showOver(score, isBest, shardsEarned) {
  setScreen('over');
  // score count-up
  const el = $('scoreBig');
  const t0 = Date.now();
  (function tick() {
    const k = Math.min(1, (Date.now() - t0) / 800);
    el.textContent = Math.floor(score * (1 - Math.pow(1 - k, 3)));
    if (k < 1 && G.screen === 'over') requestAnimationFrame(tick);
  })();
  $('oBest').textContent = save.best;
  $('oShards').textContent = shardsEarned;
  $('newBest').classList.toggle('hidden', !isBest);
  $('reviveBtn').disabled = !(adsOn() && !G.usedRevive);
  $('reviveBtn').style.display = adsOn() ? '' : 'none';
  refreshMenu();
}
function startGame() {
  G.attract = false;
  resetRun();
  setScreen('play');
}
function pauseGame() {
  if (G.screen !== 'play' || G.paused) return;
  G.paused = true;
  G.prevScreen = 'play';
  setScreen('paused');
}
function resumeGame() {
  G.paused = false;
  setScreen('play');
}

/* ---------------- customize screen ---------------- */
function packPreview(canvasEl, pack) {
  const c = canvasEl.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvasEl.width = 64 * dpr; canvasEl.height = 64 * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, 64, 64);
  c.save(); c.translate(32, 30);
  packBase(c, 30, 40, pack.c1, pack.c2);
  c.fillStyle = '#e2e8f0';
  c.beginPath(); c.arc(16, -12, 10, 0, TAU); c.fill();
  c.fillStyle = '#7dd3fc';
  c.beginPath(); c.arc(19, -12, 6, -1.1, 1.1); c.fill();
  c.restore();
}
function buildCustom() {
  $('cShards').textContent = save.shards;
  const row = $('packRow'); row.innerHTML = '';
  PACKS.forEach(p => {
    const unlocked = save.uP.includes(p.id);
    const el = document.createElement('div');
    el.className = 'pick' + (save.pack === p.id ? ' sel' : '');
    const c = document.createElement('canvas');
    el.appendChild(c);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = p.name; el.appendChild(nm);
    const cost = document.createElement('div'); cost.className = 'cost';
    cost.textContent = unlocked ? (save.pack === p.id ? 'EQUIPPED' : 'TAP TO USE') : '◆ ' + p.cost;
    el.appendChild(cost);
    el.onclick = () => {
      if (save.uP.includes(p.id)) { save.pack = p.id; }
      else if (canAfford(save.shards, p.cost)) { save.shards -= p.cost; save.uP.push(p.id); save.pack = p.id; }
      else return;
      persist(); buildCustom();
    };
    row.appendChild(el);
    packPreview(c, p);
  });
}

/* ---------------- boot ---------------- */
let lastT = 0, readySent = false, wasThrust = false;
function loop(ts) {
  requestAnimationFrame(loop);
  const t = ts / 1000;
  const dt = Math.max(0, Math.min(0.05, t - (lastT || t)));
  lastT = t;
  if (G.screen === 'play' && !G.paused) {
    if (G.hitStop > 0) G.hitStop -= dt;
    update(G.hitStop > 0 ? 0 : dt);
    if (G.thrusting && !wasThrust) Sfx.thrustStart();
    if (!G.thrusting && wasThrust) Sfx.thrustStop();
    wasThrust = G.thrusting;
    const mult = comboMult(G.combo);
    $('hScore').textContent = Math.floor(G.score);
    $('hCombo').textContent = G.combo > 1 ? 'x' + mult.toFixed(1) : '';
    $('hShards').textContent = '◆ ' + (save.shards + G.runShards);
    $('fuelFill').style.width = Math.max(0, G.fuel) + '%';
    $('fuelFill').style.background = G.fuel < 25 ? '#f43f5e' : '';
    const pw = [];
    if (G.shieldT > 0) pw.push('SHD ' + Math.ceil(G.shieldT));
    if (G.magnetT > 0) pw.push('MAG ' + Math.ceil(G.magnetT));
    if (G.x2T > 0) pw.push('2X ' + Math.ceil(G.x2T));
    $('hPow').textContent = pw.join('  ');
  } else if (!G.paused && (G.screen === 'menu' || G.screen === 'custom' || G.screen === 'over')) {
    if (!G.attract) { G.attract = true; resetRun(); }
    attractUpdate(dt);
  }
  render(t);
  if (!readySent) { readySent = true; gameReady(); }
}

function bindUI() {
  const initAudio = () => { Sfx.init(); Sfx.musicStart(); };
  window.addEventListener('pointerdown', initAudio);
  window.addEventListener('keydown', initAudio);
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('.btn')) Sfx.click();
  });
  $('playBtn').onclick = startGame;
  $('againBtn').onclick = startGame;
  $('customBtn').onclick = () => { G.prevScreen = 'menu'; buildCustom(); setScreen('custom'); };
  $('overCustomBtn').onclick = () => { G.prevScreen = 'over'; buildCustom(); setScreen('custom'); };
  $('menuBtn').onclick = () => { refreshMenu(); setScreen('menu'); };
  $('customBackBtn').onclick = () => {
    if (G.prevScreen === 'over') showOver(Math.floor(G.score), false, G.runShards);
    else { refreshMenu(); setScreen('menu'); }
  };
  $('pauseBtn').onclick = pauseGame;
  $('resumeBtn').onclick = resumeGame;
  $('restartBtn').onclick = () => { G.paused = false; startGame(); };
  $('soundBtn').onclick = () => { Sfx.init(); Sfx.setMuted(!Sfx.muted); refreshSoundBtn(); };
  $('quitBtn').onclick = () => { G.paused = false; refreshMenu(); setScreen('menu'); };
  $('reviveBtn').onclick = async () => {
    if (G.usedRevive) return;
    const ok = await showRewarded('revive');
    if (ok) {
      G.usedRevive = true;
      G.shieldT = CFG.shieldTime;
      Sfx.revive();
      G.obs = G.obs.filter(o => (o.x === undefined || o.x > G.px + 30 * G.u || o.type === 'shard' || o.type === 'gate'));
      setScreen('play');
    }
  };
  // hold-to-fly: press anywhere on the canvas
  cv.addEventListener('pointerdown', e => { e.preventDefault(); setHeld(true); });
  window.addEventListener('pointerup', () => setHeld(false));
  window.addEventListener('pointercancel', () => setHeld(false));
  $('dropBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); drop(); });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); if (!e.repeat) setHeld(true); }
    if (e.code === 'ArrowDown') { e.preventDefault(); if (!e.repeat) drop(); }
    if (e.code === 'KeyM') { Sfx.init(); Sfx.setMuted(!Sfx.muted); refreshSoundBtn(); }
    if (e.code === 'Escape') {
      if (G.screen === 'custom') $('customBackBtn').click();
      else if (G.screen === 'paused') resumeGame();
      else if (G.screen === 'play') pauseGame();
    }
    if (e.code === 'KeyP' && G.screen === 'play') pauseGame();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') setHeld(false);
  });
  window.addEventListener('resize', resize);
  window.addEventListener('contextmenu', e => e.preventDefault());
}

async function boot() {
  cv = $('c'); g = cv.getContext('2d');
  resize();
  bindUI();
  loadBackgrounds();
  await initBridge();
  await loadSave();
  watchHostLifecycle(pauseGame);
  refreshMenu();
  const q = new URLSearchParams(location.search);
  if (q.get('demo') === '1') { startGame(); }
  else if (q.get('screen') === 'custom') { G.prevScreen = 'menu'; buildCustom(); setScreen('custom'); }
  else setScreen('menu');
  requestAnimationFrame(loop);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
