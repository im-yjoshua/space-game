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

  // jump: rises ballistically, then lands
  const y0 = G.py;
  T.jump();
  pump(20);
  assert(G.py < y0, 'jump should lift the hopper');
  pump(120);
  assert(G.onGround, 'hopper should land after a jump');

  // down in mid-air slams down (dino-style fast fall)
  T.jump(); pump(10);
  T.setDuck(true);
  assert(G.vy > 0, 'ducking mid-air should slam downward, vy=' + G.vy);
  pump(60);
  T.setDuck(false);
  assert(G.onGround, 'hopper should land after a fast fall');

  // ducking on the ground bows down (smaller hitbox)
  T.setDuck(true);
  assert(G.ducking === true, 'ducking state should engage on ground');
  T.setDuck(false);

  // rock bar: standing into it kills, ducking under it survives
  T.startGame(); pump(10);
  G.shieldT = 9999;
  G.obs.push({ type: 'bar', x: G.px + 5, y: G.groundY - 12 * G.u, w: 12 * G.u, h: 4.5 * G.u, counted: false, seed: 1 });
  G.shieldT = 0;
  pump(10);
  assert(G.screen === 'over', 'running into a rock bar should kill');
  T.startGame(); pump(10);
  T.setDuck(true); pump(5);
  G.obs.push({ type: 'bar', x: G.px + 5, y: G.groundY - 12 * G.u, w: 12 * G.u, h: 4.5 * G.u, counted: false, seed: 1 });
  G.shieldT = 0; // no shield: only the duck saves us
  pump(10);
  assert(G.screen === 'play', 'ducking under a rock bar should survive');
  T.setDuck(false);
  G.shieldT = 9999;

  // shard collection
  const shardsBefore = G.runShards;
  G.obs.push({ type: 'shard', x: G.px, y: G.py + G.ph / 2, r: 3.2 * G.u, taken: false, seed: 1 });
  pump(5);
  assert(G.runShards > shardsBefore, 'flying through a shard should collect it');

  // power-up orb pickup applies its effect
  T.startGame(); pump(30);
  G.shieldT = 0;
  G.obs.push({ type: 'pow', kind: 'shield', x: G.px, y: G.py + G.ph / 2, r: 4.5 * G.u, taken: false, seed: 1 });
  pump(5);
  assert(G.shieldT > 0, 'flying through a shield orb should grant shield');

  // obstacles scroll left at world speed
  const obx = G.px + 400;
  G.obs.push({ type: 'spike', side: 'floor', x: obx, w: 3 * G.u, h: 5 * G.u, counted: false });
  const ob = G.obs[G.obs.length - 1];
  const oxBefore = ob.x;
  pump(60);
  assert(ob.x < oxBefore - 10, 'obstacles should scroll left with the world');

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

  // customize screen: render all suit previews, then equip the priciest
  T.buildCustom();
  T.save.shards = 10000;
  T.save.uP.push('saucer'); T.save.pack = 'saucer';
  assert(T.suitSkin().id === 'saucer', 'skin equip works');
  T.startGame(); pump(120); // render a while with saucer equipped

  // persistence round-trip
  const saved = JSON.parse(store['hopper_save_v1'] || 'null');
  assert(saved && typeof saved.best === 'number', 'save persisted');

  // long soak: auto-jump to survive
  T.startGame();
  for (let s = 0; s < 20; s++) {
    if (G.onGround && G.screen === 'play') T.jump();
    pump(30);
    if (G.screen !== 'play') break;
  }

  // attract mode: world drifts behind the game-over screen without errors
  T.die();
  pump(150);
  assert(G.attract === true, 'attract mode should engage on menu-family screens');

  console.log('SIM OK: jump/duck/fastfall/bar/shards/death/revive/ads/save - no exceptions.');
  console.log('ad calls:', JSON.stringify(adCalls));
  process.exit(0);
})().catch(e => { console.error('SIM THREW:', e); process.exit(1); });
