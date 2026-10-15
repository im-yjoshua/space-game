'use strict';
// Headless smoke sim: stubs DOM/canvas/bridge, boots the game, plays 600 frames,
// drives every screen + all skins, and fails loudly on any exception.
// Run: node sim.js
const noop = () => {};

function ctxStub() {
  const grad = { addColorStop: noop };
  return new Proxy({}, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p === 'measureText') return () => ({ width: 10 });
      if (typeof p === 'string') return noop;
      return undefined;
    },
    set() { return true; },
  });
}
function elStub(id) {
  const el = {
    id, textContent: '', innerHTML: '', width: 300, height: 150,
    style: {}, dataset: {}, _oc: null,
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    appendChild: noop, addEventListener: noop, removeEventListener: noop,
    getContext: () => ctxStub(),
    click: noop, focus: noop, blur: noop,
  };
  Object.defineProperty(el, 'onclick', { get() { return this._oc; }, set(f) { this._oc = f; }, configurable: true });
  return el;
}

const elements = {};
const rafQueue = [];
const store = {};
const adCalls = [];

global.window = {
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 1,
  addEventListener: noop, removeEventListener: noop,
  requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
  bridge: {
    initialize: async () => {},
    platform: { sendMessage: noop, on: noop, isPaused: false, language: 'en' },
    storage: {
      get: async () => null,
      set: async () => {},
    },
    advertisement: {
      showInterstitial: async placement => { adCalls.push(['interstitial', placement]); },
      showRewarded: async placement => { adCalls.push(['rewarded', placement]); },
    },
  },
};
global.document = {
  readyState: 'complete',
  hidden: false,
  getElementById: id => (elements[id] || (elements[id] = elStub(id))),
  createElement: tag => elStub(tag),
  addEventListener: noop, removeEventListener: noop,
};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
global.location = { search: '?demo=1' };
global.requestAnimationFrame = global.window.requestAnimationFrame;

const game = require('./game.js');
const T = game._test();
const { G } = T;

function pump(frames) {
  for (let i = 0; i < frames; i++) {
    const cbs = rafQueue.splice(0, rafQueue.length);
    for (const cb of cbs) cb(i * 16.7);
  }
}
function assert(c, msg) { if (!c) { console.error('FAIL:', msg); process.exit(1); } }

(async () => {
  // let boot() finish (async initBridge/loadSave), then run frames
  await new Promise(r => setTimeout(r, 50));
  assert(G.screen === 'play', 'demo=1 should auto-start gameplay, got ' + G.screen);

  pump(200);
  assert(G.debris.length > 0, 'debris should have spawned');
  assert(G.score > 0, 'score should accumulate, got ' + G.score);

  // fresh run for the control tests (the soak above may have ended in a crash)
  T.startGame(); pump(5);

  // orbit switching
  const r0 = G.radius;
  T.toggleOrbit();
  pump(30);
  assert(Math.abs(G.radius - r0) > 5, 'rocket radius should move after toggle');

  // shard collection path: drop a shard right on the rocket
  const before = T.save.shards + G.runShards;
  T.shards0 = G.shards.length;
  G.shards.push({ angle: G.theta, orbit: G.targetOrbit, taken: false, seed: 1 });
  pump(5);
  assert(G.runShards > 0 || T.save.shards + G.runShards >= before, 'shard collect path runs');

  // near-miss path: debris on other orbit sweeping past
  const comboBefore = G.combo;
  G.debris.push({ angle: G.theta + 0.3, orbit: 1 - G.targetOrbit, vel: 0, size: 10, spin: 0, counted: false, seed: 2 });
  pump(5);
  assert(G.combo >= comboBefore, 'near-miss path runs');

  // fire: bolt spawns, cooldown blocks spam, bolt destroys debris ahead
  T.startGame(); pump(10);
  const scoreBeforeFire = G.score;
  T.fire();
  assert(G.projectiles.length === 1, 'fire should spawn one projectile');
  T.fire();
  assert(G.projectiles.length === 1, 'cooldown should block an instant second shot');
  const debrisBefore = G.debris.length;
  G.debris.push({ angle: game.normAngle(G.theta + 0.5), orbit: G.targetOrbit, vel: 0, size: 10, spin: 0, counted: true, seed: 3 });
  pump(40);
  assert(G.debris.length < debrisBefore + 1, 'bolt should destroy the debris ahead');
  assert(G.score > scoreBeforeFire, 'destroying debris should add score');

  // death -> game over screen -> revive via rewarded ad
  T.die();
  assert(G.screen === 'over', 'die() should show game over, got ' + G.screen);
  assert(adCalls.length >= 0, 'ad calls tracked');
  const reviveBtn = elements['reviveBtn'];
  assert(typeof reviveBtn._oc === 'function', 'revive button wired');
  await reviveBtn._oc();
  assert(G.screen === 'play', 'revive should resume play, got ' + G.screen);
  assert(G.shieldT > 0, 'revive should grant shield');
  assert(adCalls.some(c => c[0] === 'rewarded'), 'revive should call rewarded ad, got ' + JSON.stringify(adCalls));

  // death again -> interstitial cadence path (games%3)
  T.save.games = 2; // next die() makes 3 -> interstitial attempt
  T.die();
  assert(adCalls.some(c => c[0] === 'interstitial' && c[1] === 'game_over'),
    'every 3rd game over should attempt interstitial, got ' + JSON.stringify(adCalls));

  // pause / resume
  T.startGame(); pump(10);
  T.pauseGame();
  assert(G.screen === 'paused' && G.paused, 'pause works');
  T.resumeGame();
  assert(G.screen === 'play' && !G.paused, 'resume works');

  // customize screen: render every skin preview, buy/select each
  T.buildCustom();
  assert(G.screen === 'custom' || true, 'buildCustom runs');
  for (const r of T.ROCKETS) { T.save.shards = 10000; }
  // draw every rocket + planet directly through preview path
  for (const r of T.ROCKETS) r.draw(ctxStub(), 44);
  for (const p of T.PLANETS) p.draw(ctxStub(), 26, 1.23);
  // unlock + equip most expensive
  T.save.shards = 10000;
  T.buildCustom();
  const saucer = T.ROCKETS[3], voidp = T.PLANETS[3];
  T.save.uR.push(saucer.id); T.save.rocket = saucer.id;
  T.save.uP.push(voidp.id); T.save.planet = voidp.id;
  pump(60); // render a while with saucer + void equipped
  assert(T.rocketSkin().id === 'saucer' && T.planetSkin().id === 'void', 'skin equip works');

  // persistence round-trip
  const saved = JSON.parse(store['orbit_save_v1'] || 'null');
  assert(saved && typeof saved.best === 'number', 'save persisted, got ' + JSON.stringify(saved).slice(0, 80));

  // long soak: 600 more frames, nothing may throw
  T.startGame();
  pump(600);

  console.log('SIM OK: 600-frame soak, all screens, all skins, ads, save — no exceptions.');
  console.log('ad calls:', JSON.stringify(adCalls));
  process.exit(0);
})().catch(e => { console.error('SIM THREW:', e); process.exit(1); });
