'use strict';
// Headless smoke sim for STAR HOPPER: stubs DOM/canvas/bridge, boots the game,
// flies, drops, flips gravity, dies, revives, and customizes - fails loudly.
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
    style: {}, dataset: {}, _oc: null, _listeners: {},
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    appendChild: noop, removeEventListener: noop,
    addEventListener: function (ev, f) { this._listeners[ev] = f; },
    getContext: () => ctxStub(),
    click: noop, focus: noop, blur: noop,
  };
  Object.defineProperty(el, 'onclick', { get() { return this._oc; }, set(f) { this._oc = f; }, configurable: true });
  return el;
}

const elements = {};
const rafQueue = [];
let simTime = 0;
const store = {};
const adCalls = [];

global.window = {
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 1,
  addEventListener: noop, removeEventListener: noop,
  requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
  bridge: {
    initialize: async () => {},
    platform: { sendMessage: noop, on: noop, isPaused: false, language: 'en' },
    storage: { get: async () => null, set: async () => {} },
    advertisement: {
      showInterstitial: async p => { adCalls.push(['interstitial', p]); },
      showRewarded: async p => { adCalls.push(['rewarded', p]); },
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
    simTime += 16.7;
    const cbs = rafQueue.splice(0, rafQueue.length);
    for (const cb of cbs) cb(simTime);
  }
}
function assert(c, msg) { if (!c) { console.error('FAIL:', msg); process.exit(1); } }

(async () => {
  await new Promise(r => setTimeout(r, 50));
  assert(G.screen === 'play', 'demo=1 should auto-start, got ' + G.screen);
  assert(G.onGround, 'run should start on the ground');
  G.shieldT = 9999; // shielded for the physics tests so stray obstacles can't kill mid-test

  // run a bit, score accrues, obstacles spawn
  pump(120);
  assert(G.score > 0, 'score should accrue, got ' + G.score);
  assert(G.obs.length > 0, 'obstacles should have spawned');

  // hold to fly: rises + burns fuel
  const y0 = G.py, f0 = G.fuel;
  T.setHeld(true);
  pump(45);
  T.setHeld(false);
  assert(G.py < y0, 'holding should make the hopper rise');
  assert(G.fuel < f0, 'thrusting should burn fuel, ' + f0 + ' -> ' + G.fuel);

  // sudden drop slams down
  T.setHeld(true); pump(20); T.setHeld(false);
  const vyBefore = G.vy;
  T.drop();
  assert(G.vy > Math.max(0, vyBefore), 'drop should slam downward');
  pump(90);
  assert(G.onGround, 'hopper should land after a drop');

  // fuel refills on ground
  const f1 = G.fuel;
  pump(60);
  assert(G.fuel >= f1, 'fuel should refill on ground');

  // gravity gate flips the world
  G.obs.push({ type: 'gate', x: G.px + 10, w: 6 * G.u, passed: false });
  pump(10);
  assert(G.s === -1, 'passing a gate should flip gravity, s=' + G.s);
  pump(120);
  assert(G.onGround, 'hopper should land on the ceiling when flipped');

  // shard collection
  const shardsBefore = G.runShards;
  G.obs.push({ type: 'shard', x: G.px, y: G.py + G.ph / 2, r: 3.2 * G.u, taken: false, seed: 1 });
  pump(5);
  assert(G.runShards > shardsBefore, 'flying through a shard should collect it');

  // death -> game over -> revive via rewarded ad
  G.shieldT = 0;
  T.die();
  assert(G.screen === 'over', 'die() should show game over, got ' + G.screen);
  const reviveBtn = elements['reviveBtn'];
  assert(typeof reviveBtn._oc === 'function', 'revive button wired');
  await reviveBtn._oc();
  assert(G.screen === 'play', 'revive should resume play, got ' + G.screen);
  assert(G.shieldT > 0, 'revive should grant shield');
  assert(adCalls.some(c => c[0] === 'rewarded'), 'revive should call rewarded ad');

  // interstitial cadence: every 3rd game over
  T.save.games = 2;
  T.die();
  assert(adCalls.some(c => c[0] === 'interstitial' && c[1] === 'game_over'), '3rd game over should attempt interstitial');

  // customize screen: render all jetpack previews, then equip the priciest
  T.buildCustom();
  T.save.shards = 10000;
  T.save.uP.push('saucer'); T.save.pack = 'saucer';
  assert(T.packSkin().id === 'saucer', 'skin equip works');
  T.startGame(); pump(120); // render a while with saucer equipped

  // persistence round-trip
  const saved = JSON.parse(store['hopper_save_v1'] || 'null');
  assert(saved && typeof saved.best === 'number', 'save persisted');

  // long soak
  T.startGame();
  T.setHeld(true);
  pump(300);
  T.setHeld(false);
  pump(300);

  console.log('SIM OK: fly/drop/flip/shards/death/revive/ads/save - no exceptions.');
  console.log('ad calls:', JSON.stringify(adCalls));
  process.exit(0);
})().catch(e => { console.error('SIM THREW:', e); process.exit(1); });
