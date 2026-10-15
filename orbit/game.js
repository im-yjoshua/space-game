'use strict';
/* ORBIT v1 - one-tap orbit dodge. Vanilla canvas, zero assets.
   Built for YouTube Playables via Playgama: no external calls except the
   Playgama Bridge SDK itself, tiny bundle, responsive, pause-aware. */

const TAU = Math.PI * 2;

/* ---------------- tuning ---------------- */
const CFG = {
  baseSpin: 1.15,     // rad/s at run start
  spinGain: 0.04,     // rad/s added per second survived
  maxSpin: 3.8,
  switchK: 14,        // orbit lerp rate (higher = snappier)
  hitArc: 0.17,       // radians: collision window on same orbit
  nearArc: 0.6,       // radians: near-miss window on the other orbit
  comboWindow: 4,     // s before combo decays without a near-miss
  maxMult: 5,
  debrisStart: 1.35,  // s between spawns at t=0
  debrisRamp: 0.03,   // spawn interval shrink per second survived
  debrisMin: 0.4,
  shardEvery: 2.3,
  shieldTime: 3,      // s of invulnerability after revive
  fireCooldown: 1.1,  // s between shots
  projBonus: 2.4,     // extra rad/s of projectile over rocket speed
  projRange: 7,       // radians a bolt travels before fizzling
};

/* ---------------- pure logic (unit-tested) ---------------- */
function normAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
}
function angDiff(a, b) { return normAngle(a - b); }
// sameOrbit: rocket radius close to debris orbit radius
function willCollide(dAng, sameOrbit, hitArc) {
  return sameOrbit && Math.abs(dAng) < hitArc;
}
// near miss: debris on the OTHER orbit sweeping past the rocket
function isNearMiss(dAng, otherOrbit, counted, nearArc) {
  return otherOrbit && !counted && Math.abs(dAng) < nearArc;
}
function comboMult(combo) { return Math.min(1 + combo * 0.1, CFG.maxMult); }
function canAfford(shards, cost) { return shards >= cost; }
function spinAt(elapsed) {
  return Math.min(CFG.maxSpin, CFG.baseSpin + elapsed * CFG.spinGain);
}
function debrisInterval(elapsed) {
  return Math.max(CFG.debrisMin, CFG.debrisStart - elapsed * CFG.debrisRamp);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TAU, CFG, normAngle, angDiff, willCollide, isNearMiss, comboMult, canAfford, spinAt, debrisInterval };
}
/* node-only test handle (lets the headless sim drive screens + internals) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports._test = function () {
    return { G, save, resetRun, startGame, toggleOrbit, fire, pauseGame, resumeGame, die, buildCustom, showOver, update, render, orbitR, rocketSkin, planetSkin, ROCKETS, PLANETS };
  };
}

/* ---------------- skins ---------------- */
// Each rocket draws itself pointing UP (+nose at -y), size s = body length.
function drawSpark(g, s) {
  const w = s * 0.42;
  g.fillStyle = '#e8ecf4';
  g.beginPath(); g.moveTo(0, -s / 2);
  g.quadraticCurveTo(w / 2, -s * 0.18, w / 2, s * 0.28);
  g.lineTo(w / 2, s * 0.34); g.lineTo(-w / 2, s * 0.34);
  g.lineTo(-w / 2, s * 0.28);
  g.quadraticCurveTo(-w / 2, -s * 0.18, 0, -s / 2); g.fill();
  g.fillStyle = '#e63946';
  g.beginPath(); g.moveTo(0, -s / 2);
  g.quadraticCurveTo(w / 2, -s * 0.3, w * 0.32, -s * 0.12);
  g.lineTo(-w * 0.32, -s * 0.12);
  g.quadraticCurveTo(-w / 2, -s * 0.3, 0, -s / 2); g.fill();
  g.fillStyle = '#e63946';
  g.beginPath(); g.moveTo(-w / 2, s * 0.1); g.lineTo(-w * 0.95, s * 0.42); g.lineTo(-w / 2, s * 0.34); g.fill();
  g.beginPath(); g.moveTo(w / 2, s * 0.1); g.lineTo(w * 0.95, s * 0.42); g.lineTo(w / 2, s * 0.34); g.fill();
  g.fillStyle = '#9fd8ff';
  g.beginPath(); g.arc(0, -s * 0.02, w * 0.22, 0, TAU); g.fill();
  g.fillStyle = '#ffb703';
  g.beginPath(); g.moveTo(-w * 0.28, s * 0.36); g.lineTo(0, s * 0.62); g.lineTo(w * 0.28, s * 0.36); g.fill();
}
function drawDart(g, s) {
  const w = s * 0.26;
  g.fillStyle = '#22d3ee';
  g.beginPath(); g.moveTo(0, -s / 2); g.lineTo(w / 2, s * 0.3); g.lineTo(-w / 2, s * 0.3); g.fill();
  g.fillStyle = '#0e7490';
  g.beginPath(); g.moveTo(0, -s / 2); g.lineTo(w * 0.18, s * 0.3); g.lineTo(-w * 0.18, s * 0.3); g.fill();
  g.fillStyle = '#a5f3fc';
  g.fillRect(-w * 0.5, s * 0.3, w, s * 0.06);
  g.fillStyle = '#f0fdff';
  g.beginPath(); g.moveTo(-w * 0.5, s * 0.36); g.lineTo(0, s * 0.58); g.lineTo(w * 0.5, s * 0.36); g.fill();
}
function drawShuttle(g, s) {
  const w = s * 0.5;
  g.fillStyle = '#f4f4f5';
  g.beginPath(); g.moveTo(0, -s / 2);
  g.quadraticCurveTo(w / 2, -s * 0.2, w * 0.42, s * 0.3);
  g.lineTo(-w * 0.42, s * 0.3);
  g.quadraticCurveTo(-w / 2, -s * 0.2, 0, -s / 2); g.fill();
  g.fillStyle = '#f97316';
  g.beginPath(); g.moveTo(-w * 0.42, s * 0.05); g.lineTo(-w * 0.85, s * 0.38); g.lineTo(-w * 0.42, s * 0.3); g.fill();
  g.beginPath(); g.moveTo(w * 0.42, s * 0.05); g.lineTo(w * 0.85, s * 0.38); g.lineTo(w * 0.42, s * 0.3); g.fill();
  g.fillStyle = '#1c1917';
  g.beginPath(); g.moveTo(-w * 0.2, -s * 0.32); g.lineTo(w * 0.2, -s * 0.32); g.lineTo(w * 0.14, -s * 0.18); g.lineTo(-w * 0.14, -s * 0.18); g.fill();
  g.fillStyle = '#fdba74';
  g.fillRect(-w * 0.3, s * 0.3, w * 0.6, s * 0.07);
}
function drawSaucer(g, s) {
  const w = s * 0.62;
  const grd = g.createLinearGradient(0, -s * 0.2, 0, s * 0.25);
  grd.addColorStop(0, '#c4b5fd'); grd.addColorStop(1, '#6d28d9');
  g.fillStyle = grd;
  g.beginPath(); g.ellipse(0, s * 0.08, w / 2, s * 0.2, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(196,181,253,.85)';
  g.beginPath(); g.arc(0, -s * 0.06, s * 0.2, Math.PI, 0); g.fill();
  g.fillStyle = '#f5d0fe';
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.arc(i * w * 0.18, s * 0.12, s * 0.035, 0, TAU); g.fill();
  }
}
const ROCKETS = [
  { id: 'spark',   name: 'SPARK',   cost: 0,   draw: drawSpark },
  { id: 'dart',    name: 'DART',    cost: 50,  draw: drawDart },
  { id: 'shuttle', name: 'SHUTTLE', cost: 150, draw: drawShuttle },
  { id: 'saucer',  name: 'SAUCER',  cost: 300, draw: drawSaucer },
];

// Each planet draws itself centered at (0,0) with radius r. t = time for shimmer.
function pTerra(g, r) {
  const grd = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  grd.addColorStop(0, '#4f9cf7'); grd.addColorStop(1, '#1d4ed8');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.fillStyle = '#34d399';
  g.beginPath(); g.ellipse(-r * 0.3, -r * 0.1, r * 0.32, r * 0.2, 0.5, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(r * 0.35, r * 0.3, r * 0.22, r * 0.14, -0.4, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath(); g.ellipse(0, -r * 0.82, r * 0.5, r * 0.2, 0, 0, TAU); g.fill();
}
function pEmber(g, r, t) {
  const grd = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  grd.addColorStop(0, '#7c2d12'); grd.addColorStop(1, '#431407');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.strokeStyle = '#fb923c'; g.lineWidth = r * 0.05; g.lineCap = 'round';
  const wob = Math.sin(t * 2) * 0.08;
  g.beginPath(); g.moveTo(-r * 0.7, -r * 0.2 + wob * r);
  g.quadraticCurveTo(-r * 0.2, r * 0.1, r * 0.3, -r * 0.35 + wob * r); g.stroke();
  g.beginPath(); g.moveTo(-r * 0.1, r * 0.6);
  g.quadraticCurveTo(r * 0.3, r * 0.3, r * 0.65, r * 0.05 - wob * r); g.stroke();
  g.fillStyle = '#fdba74';
  g.beginPath(); g.arc(r * 0.3, -r * 0.35 + wob * r, r * 0.09, 0, TAU); g.fill();
}
function pJade(g, r, t) {
  const grd = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  grd.addColorStop(0, '#2dd4bf'); grd.addColorStop(1, '#065f46');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(167,243,208,.75)'; g.lineWidth = r * 0.07; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a0 = t * 0.4 + i * 2.1;
    g.beginPath(); g.arc(0, 0, r * (0.35 + i * 0.18), a0, a0 + 1.6); g.stroke();
  }
}
function pVoid(g, r, t) {
  const grd = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  grd.addColorStop(0, '#4c1d95'); grd.addColorStop(1, '#0b0620');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.fillStyle = '#e9d5ff';
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4 + 0.7, rr = r * (0.25 + 0.6 * ((i * 37 % 10) / 10));
    g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i);
    g.fillRect(Math.cos(a) * rr - 1, Math.sin(a) * rr - 1, 2, 2);
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(196,181,253,.8)'; g.lineWidth = r * 0.07;
  g.beginPath(); g.ellipse(0, 0, r * 1.45, r * 0.42, -0.35, 0, TAU); g.stroke();
}
const PLANETS = [
  { id: 'terra', name: 'TERRA', cost: 0,   draw: pTerra },
  { id: 'ember', name: 'EMBER', cost: 50,  draw: pEmber },
  { id: 'jade',  name: 'JADE',  cost: 150, draw: pJade },
  { id: 'void',  name: 'VOID',  cost: 300, draw: pVoid },
];

/* ---------------- save data ---------------- */
const SAVE_KEY = 'orbit_save_v1';
let save = { best: 0, shards: 0, rocket: 'spark', planet: 'terra', uR: ['spark'], uP: ['terra'], games: 0 };

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
    if (typeof s.rocket === 'string') save.rocket = s.rocket;
    if (typeof s.planet === 'string') save.planet = s.planet;
    if (Array.isArray(s.uR)) save.uR = s.uR;
    if (Array.isArray(s.uP)) save.uP = s.uP;
    if (typeof s.games === 'number') save.games = s.games;
  }
}

async function persist() {
  try {
    if (BR && BR.storage && typeof BR.storage.set === 'function') {
      try { await BR.storage.set([SAVE_KEY], [save]); }
      catch (e) { await BR.storage.set({ [SAVE_KEY]: save }); }
    }
  } catch (e) { /* fall through */ }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage full/blocked */ }
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
    }
  } catch (e) { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) onPause();
    });
  }
}

/* ---------------- game state (browser only below) ---------------- */
const G = {
  screen: 'boot', // menu | play | over | custom | paused
  paused: false,
  // run state
  theta: 0, orbit: 0, radius: 0, targetOrbit: 0,
  elapsed: 0, score: 0, combo: 0, comboT: 0, runShards: 0,
  debris: [], shards: [], parts: [], projectiles: [],
  spawnT: 0, shardT: 0, shieldT: 0, fireT: 0, usedRevive: false,
  // layout
  W: 0, H: 0, cx: 0, cy: 0, baseR: 0, gapR: 0,
  stars: [],
  prevScreen: 'menu',
};

function orbitR(i) { return G.baseR + i * G.gapR; }
function rocketSkin() { return ROCKETS.find(r => r.id === save.rocket) || ROCKETS[0]; }
function planetSkin() { return PLANETS.find(p => p.id === save.planet) || PLANETS[0]; }

function resetRun() {
  G.theta = -Math.PI / 2;
  G.orbit = 0; G.targetOrbit = 0;
  G.radius = orbitR(0);
  G.elapsed = 0; G.score = 0; G.combo = 0; G.comboT = 0; G.runShards = 0;
  G.debris = []; G.shards = []; G.parts = []; G.projectiles = [];
  G.spawnT = 1.4; G.shardT = 1.6; G.shieldT = 0; G.fireT = 0; G.usedRevive = false;
  G.paused = false;
}

function spawnDebris() {
  if (G.debris.length > 42) return;
  const orbit = Math.random() < 0.5 ? 0 : 1;
  const dir = 1; // rocket travels counterclockwise (+theta)
  G.debris.push({
    angle: G.theta + dir * (1.7 + Math.random() * 2.6),
    orbit: orbit,
    // drift: slower same-direction, or head-on opposite direction
    vel: (Math.random() < 0.4 ? -1 : 1) * (0.3 + Math.random() * 0.9),
    size: 9 + Math.random() * 10,
    spin: Math.random() * TAU,
    counted: false,
    seed: Math.random() * 100,
  });
}
function spawnShard() {
  G.shards.push({
    angle: G.theta + (1.2 + Math.random() * 2.2),
    orbit: Math.random() < 0.5 ? 0 : 1,
    taken: false,
    seed: Math.random() * 100,
  });
}
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = speed * (0.4 + Math.random());
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, t: 0, color, r: 2 + Math.random() * 3 });
  }
}
function rocketXY() {
  return { x: G.cx + Math.cos(G.theta) * G.radius, y: G.cy + Math.sin(G.theta) * G.radius };
}

function update(dt) {
  G.elapsed += dt;
  const omega = spinAt(G.elapsed);
  G.theta = normAngle(G.theta + omega * dt);

  // smooth orbit switching
  const target = orbitR(G.targetOrbit);
  G.radius += (target - G.radius) * Math.min(1, dt * CFG.switchK);
  G.orbit = G.targetOrbit;

  if (G.shieldT > 0) G.shieldT -= dt;
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }

  const mult = comboMult(G.combo);
  G.score += dt * 10 * mult;

  // spawns
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    spawnDebris();
    G.spawnT = debrisInterval(G.elapsed) * (0.7 + Math.random() * 0.6);
  }
  G.shardT -= dt;
  if (G.shardT <= 0) { spawnShard(); G.shardT = CFG.shardEvery * (0.8 + Math.random() * 0.5); }

  // projectiles
  updateProjectiles(dt, omega);

  // debris
  for (let i = G.debris.length - 1; i >= 0; i--) {
    const d = G.debris[i];
    d.angle = normAngle(d.angle + d.vel * dt);
    d.spin += dt * 2;
    const sameOrbit = Math.abs(G.radius - orbitR(d.orbit)) < G.gapR * 0.35;
    const dAng = angDiff(d.angle, G.theta);
    if (willCollide(dAng, sameOrbit, CFG.hitArc) && G.shieldT <= 0) {
      die();
      return;
    }
    if (isNearMiss(dAng, !sameOrbit, d.counted, CFG.nearArc)) {
      d.counted = true;
      G.combo++;
      G.comboT = CFG.comboWindow;
      G.score += 15 * comboMult(G.combo);
      const p = rocketXY();
      burst(p.x, p.y, '#ffd54a', 8, 120);
    }
    // cull far-behind debris to bound the array
    if (G.debris.length > 60) G.debris.splice(0, G.debris.length - 60);
  }

  // shards
  for (let i = G.shards.length - 1; i >= 0; i--) {
    const s = G.shards[i];
    const sameOrbit = Math.abs(G.radius - orbitR(s.orbit)) < G.gapR * 0.45;
    if (sameOrbit && Math.abs(angDiff(s.angle, G.theta)) < 0.24 && !s.taken) {
      s.taken = true;
      G.runShards++;
      G.score += 25;
      const p = rocketXY();
      burst(p.x, p.y, '#7df9ff', 10, 140);
      G.shards.splice(i, 1);
    } else if (Math.abs(angDiff(s.angle, G.theta)) > 2.6) {
      G.shards.splice(i, 1); // missed, fell behind
    }
  }

  // particles
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.98; p.vy *= 0.98;
    if (p.t >= p.life) G.parts.splice(i, 1);
  }
}

function die() {
  const p = rocketXY();
  burst(p.x, p.y, '#ff6b6b', 26, 260);
  burst(p.x, p.y, '#ffd54a', 14, 180);
  const finalScore = Math.floor(G.score);
  const isBest = finalScore > save.best;
  if (isBest) save.best = finalScore;
  save.shards += G.runShards;
  save.games++;
  persist();
  showOver(finalScore, isBest, G.runShards);
  // interstitial every 3rd game over, only at this natural pause
  if (save.games % 3 === 0) showInterstitial('game_over');
}

function toggleOrbit() {
  if (G.screen !== 'play' || G.paused) return;
  G.targetOrbit = 1 - G.targetOrbit;
}

// Fire a bolt forward along the current orbit. Destroys the first debris it reaches.
function fire() {
  if (G.screen !== 'play' || G.paused || G.fireT > 0) return;
  G.fireT = CFG.fireCooldown;
  G.projectiles.push({ angle: G.theta, r: G.radius, travel: 0 });
  const p = rocketXY();
  burst(p.x, p.y, '#ffe66d', 4, 80);
}

function updateProjectiles(dt, omega) {
  if (G.fireT > 0) G.fireT -= dt;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    const step = (omega + CFG.projBonus) * dt;
    pr.angle = normAngle(pr.angle + step);
    pr.travel += step;
    let hit = false;
    for (let j = G.debris.length - 1; j >= 0; j--) {
      const d = G.debris[j];
      const sameOrbit = Math.abs(pr.r - orbitR(d.orbit)) < G.gapR * 0.35;
      if (willCollide(angDiff(d.angle, pr.angle), sameOrbit, CFG.hitArc * 1.3)) {
        const x = G.cx + Math.cos(d.angle) * orbitR(d.orbit);
        const y = G.cy + Math.sin(d.angle) * orbitR(d.orbit);
        burst(x, y, '#ff9f1c', 16, 200);
        G.score += 50;
        G.debris.splice(j, 1);
        hit = true;
        break;
      }
    }
    if (hit || pr.travel > CFG.projRange) G.projectiles.splice(i, 1);
  }
}

/* ---------------- rendering + DOM (browser only) ---------------- */
let cv, g;
const $ = id => document.getElementById(id);

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  G.W = window.innerWidth; G.H = window.innerHeight;
  cv.width = Math.floor(G.W * dpr); cv.height = Math.floor(G.H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  G.cx = G.W / 2; G.cy = G.H / 2;
  const m = Math.min(G.W, G.H);
  G.baseR = m * 0.20;
  G.gapR = m * 0.115;
  if (G.screen === 'play') G.radius = orbitR(G.targetOrbit);
  // starfield
  G.stars = [];
  for (let i = 0; i < 130; i++) {
    G.stars.push({ x: Math.random() * G.W, y: Math.random() * G.H, r: Math.random() * 1.6 + 0.4, tw: Math.random() * TAU });
  }
}

function drawDebris(d, t) {
  const x = G.cx + Math.cos(d.angle) * orbitR(d.orbit);
  const y = G.cy + Math.sin(d.angle) * orbitR(d.orbit);
  g.save(); g.translate(x, y); g.rotate(d.spin);
  g.fillStyle = '#8b93a7';
  g.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = d.size * (0.75 + 0.25 * Math.sin(d.seed + i * 2.3));
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
  g.fillStyle = '#5b6272';
  g.beginPath(); g.arc(-d.size * 0.25, -d.size * 0.15, d.size * 0.22, 0, TAU); g.fill();
  g.restore();
}

function render(t) {
  // background
  const bg = g.createLinearGradient(0, 0, 0, G.H);
  bg.addColorStop(0, '#070b18'); bg.addColorStop(1, '#0d1030');
  g.fillStyle = bg; g.fillRect(0, 0, G.W, G.H);
  for (const s of G.stars) {
    g.globalAlpha = 0.35 + 0.4 * Math.sin(t * 1.5 + s.tw);
    g.fillStyle = '#cfe4ff';
    g.fillRect(s.x, s.y, s.r, s.r);
  }
  g.globalAlpha = 1;

  // orbit rings
  g.strokeStyle = 'rgba(140,170,255,.22)'; g.lineWidth = 2;
  g.beginPath(); g.arc(G.cx, G.cy, orbitR(0), 0, TAU); g.stroke();
  g.beginPath(); g.arc(G.cx, G.cy, orbitR(1), 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(140,170,255,.5)';
  g.beginPath(); g.arc(G.cx, G.cy, orbitR(G.targetOrbit), 0, TAU); g.stroke();

  // planet
  const pr = Math.min(G.W, G.H) * 0.105;
  g.save(); g.translate(G.cx, G.cy);
  planetSkin().draw(g, pr, t);
  g.restore();

  // shards
  for (const s of G.shards) {
    const x = G.cx + Math.cos(s.angle) * orbitR(s.orbit);
    const y = G.cy + Math.sin(s.angle) * orbitR(s.orbit);
    const bob = Math.sin(t * 4 + s.seed) * 2;
    g.save(); g.translate(x, y + bob); g.rotate(Math.PI / 4);
    g.fillStyle = '#7df9ff';
    const r = 7;
    g.fillRect(-r / 2, -r / 2, r, r);
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillRect(-r / 4, -r / 4, r / 2, r / 2);
    g.restore();
  }

  // debris
  for (const d of G.debris) drawDebris(d, t);

  // projectiles: glowing bolts flying forward along the orbit
  for (const pr of G.projectiles) {
    const x = G.cx + Math.cos(pr.angle) * pr.r;
    const y = G.cy + Math.sin(pr.angle) * pr.r;
    const tx = -Math.sin(pr.angle), ty = Math.cos(pr.angle); // travel direction
    g.strokeStyle = '#ffe66d'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - tx * 11, y - ty * 11);
    g.lineTo(x + tx * 11, y + ty * 11);
    g.stroke();
    g.fillStyle = '#fff7cc';
    g.beginPath(); g.arc(x + tx * 11, y + ty * 11, 3.5, 0, TAU); g.fill();
  }

  // rocket (hidden on death frame; explosion covers it)
  if (G.screen === 'play') {
    const p = rocketXY();
    g.save(); g.translate(p.x, p.y);
    // skins draw nose-up (-y); rotate(theta + PI) aims the nose along travel
    g.rotate(G.theta + Math.PI);
    rocketSkin().draw(g, 30);
    g.restore();
    if (G.shieldT > 0) {
      g.strokeStyle = 'rgba(125,249,255,' + (0.4 + 0.3 * Math.sin(t * 10)) + ')';
      g.lineWidth = 3;
      g.beginPath(); g.arc(p.x, p.y, 26, 0, TAU); g.stroke();
    }
  }

  // particles
  for (const p of G.parts) {
    g.globalAlpha = Math.max(0, 1 - p.t / p.life);
    g.fillStyle = p.color;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
}

/* ---------------- HUD + screens ---------------- */
function setScreen(name) {
  G.screen = name;
  ['menu', 'over', 'custom', 'paused'].forEach(s => $('' + s).classList.toggle('hidden', s !== name));
  const inGame = name === 'play';
  $('hud').classList.toggle('hidden', !inGame);
  $('pauseBtn').classList.toggle('hidden', !inGame);
  $('fireBtn').classList.toggle('hidden', !inGame);
}
function refreshMenu() {
  $('mBest').textContent = save.best;
  $('mShards').textContent = save.shards;
}
function showOver(score, isBest, shardsEarned) {
  setScreen('over');
  $('scoreBig').textContent = score;
  $('oBest').textContent = save.best;
  $('oShards').textContent = shardsEarned;
  $('newBest').classList.toggle('hidden', !isBest);
  $('reviveBtn').disabled = !(adsOn() && !G.usedRevive);
  $('reviveBtn').style.display = adsOn() ? '' : 'none';
  refreshMenu();
}
function startGame() {
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
function skinPreview(canvas, kind, skin) {
  const c = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 64 * dpr; canvas.height = 64 * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, 64, 64);
  c.save(); c.translate(32, 32);
  if (kind === 'rocket') skin.draw(c, 44);
  else skin.draw(c, 26, 0);
  c.restore();
}
function buildCustom() {
  $('cShards').textContent = save.shards;
  const rr = $('rocketRow'); rr.innerHTML = '';
  ROCKETS.forEach(r => {
    const unlocked = save.uR.includes(r.id);
    const el = document.createElement('div');
    el.className = 'pick' + (save.rocket === r.id ? ' sel' : '');
    const c = document.createElement('canvas');
    el.appendChild(c);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = r.name; el.appendChild(nm);
    const cost = document.createElement('div'); cost.className = 'cost';
    cost.textContent = unlocked ? (save.rocket === r.id ? 'EQUIPPED' : 'TAP TO USE') : '◆ ' + r.cost;
    el.appendChild(cost);
    el.onclick = () => {
      if (save.uR.includes(r.id)) { save.rocket = r.id; }
      else if (canAfford(save.shards, r.cost)) { save.shards -= r.cost; save.uR.push(r.id); save.rocket = r.id; }
      else return;
      persist(); buildCustom();
    };
    rr.appendChild(el);
    skinPreview(c, 'rocket', r);
  });
  const pr = $('planetRow'); pr.innerHTML = '';
  PLANETS.forEach(p => {
    const unlocked = save.uP.includes(p.id);
    const el = document.createElement('div');
    el.className = 'pick' + (save.planet === p.id ? ' sel' : '');
    const c = document.createElement('canvas');
    el.appendChild(c);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = p.name; el.appendChild(nm);
    const cost = document.createElement('div'); cost.className = 'cost';
    cost.textContent = unlocked ? (save.planet === p.id ? 'EQUIPPED' : 'TAP TO USE') : '◆ ' + p.cost;
    el.appendChild(cost);
    el.onclick = () => {
      if (save.uP.includes(p.id)) { save.planet = p.id; }
      else if (canAfford(save.shards, p.cost)) { save.shards -= p.cost; save.uP.push(p.id); save.planet = p.id; }
      else return;
      persist(); buildCustom();
    };
    pr.appendChild(el);
    skinPreview(c, 'planet', p);
  });
}

/* ---------------- boot ---------------- */
let lastT = 0, readySent = false, rafId = 0;
function loop(ts) {
  rafId = requestAnimationFrame(loop);
  const t = ts / 1000;
  let dt = Math.max(0, Math.min(0.05, t - (lastT || t)));
  lastT = t;
  if (G.screen === 'play' && !G.paused) {
    update(dt);
    const mult = comboMult(G.combo);
    $('hScore').textContent = Math.floor(G.score);
    $('hCombo').textContent = G.combo > 1 ? 'x' + mult.toFixed(1) : '';
    $('hShards').textContent = '◆ ' + (save.shards + G.runShards);
  }
  render(t);
  if (!readySent) { readySent = true; gameReady(); }
}

function bindUI() {
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
  $('quitBtn').onclick = () => { G.paused = false; refreshMenu(); setScreen('menu'); };
  $('reviveBtn').onclick = async () => {
    if (G.usedRevive) return;
    const ok = await showRewarded('revive');
    if (ok) {
      G.usedRevive = true;
      G.shieldT = CFG.shieldTime;
      // clear nearby debris so revive is fair
      G.debris = G.debris.filter(d => Math.abs(angDiff(d.angle, G.theta)) > 1.2);
      setScreen('play');
    }
  };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); toggleOrbit(); });
  $('fireBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fire(); });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); toggleOrbit(); }
    if (e.code === 'KeyF') { e.preventDefault(); fire(); }
    if (e.code === 'Escape') {
      if (G.screen === 'custom') $('customBackBtn').click();
      else if (G.screen === 'paused') resumeGame();
      else if (G.screen === 'play') pauseGame();
    }
    if ((e.code === 'KeyP') && G.screen === 'play') pauseGame();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('contextmenu', e => e.preventDefault());
}

async function boot() {
  cv = $('c'); g = cv.getContext('2d');
  resize();
  bindUI();
  await initBridge();
  await loadSave();
  watchHostLifecycle(pauseGame);
  // honor host pause/mute state at startup
  try {
    if (BR && BR.platform && BR.platform.isPaused) { /* will pause on first play */ }
  } catch (e) { /* ignore */ }
  refreshMenu();
  const q = new URLSearchParams(location.search);
  if (q.get('demo') === '1') { startGame(); }
  else if (q.get('screen') === 'custom') { G.prevScreen = 'menu'; buildCustom(); setScreen('custom'); }
  else setScreen('menu');
  rafId = requestAnimationFrame(loop);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
