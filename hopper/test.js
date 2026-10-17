'use strict';
// Runnable self-check for STAR HOPPER's pure game logic. Run: node --test test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./game.js');

test('rectsOverlap detects box collisions', () => {
  assert.equal(L.rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(L.rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 10, h: 10 }), false);
  assert.equal(L.rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false); // touching edges
});

test('circleRect detects circle vs box', () => {
  assert.equal(L.circleRect(5, 5, 3, { x: 0, y: 0, w: 10, h: 10 }), true);
  assert.equal(L.circleRect(20, 20, 3, { x: 0, y: 0, w: 10, h: 10 }), false);
  assert.equal(L.circleRect(12, 5, 3, { x: 0, y: 0, w: 10, h: 10 }), true); // overlapping edge
});

test('gravity flip swaps the running surface', () => {
  assert.equal(L.flipSign(1), -1);
  assert.equal(L.flipSign(-1), 1);
  assert.equal(L.surfTop(1, 820, 180, 90), 730);  // standing on floor
  assert.equal(L.surfTop(-1, 820, 180, 90), 180); // standing on ceiling
});

test('jump launches upward only when grounded', () => {
  const T = L._test();
  const G = T.G;
  G.screen = 'play'; G.paused = false;
  G.u = 8; G.s = 1; G.onGround = true; G.vy = 0;
  T.jump();
  assert.ok(G.vy < 0, 'jump should set upward velocity, got ' + G.vy);
  assert.equal(G.onGround, false);
  const vy = G.vy;
  T.jump(); // mid-air: no double jump
  assert.equal(G.vy, vy);
});

test('jump feels like the dino: ~0.58s airtime, ~2 body heights', () => {
  const airtime = 2 * L.CFG.jumpV / L.CFG.grav;
  assert.ok(airtime > 0.5 && airtime < 0.7, 'airtime should be dino-like, got ' + airtime.toFixed(2) + 's');
  const heightU = L.CFG.jumpV * L.CFG.jumpV / (2 * L.CFG.grav);
  assert.ok(heightU > 14 && heightU < 22, 'jump height should clear tall spikes with margin, got ' + heightU.toFixed(1) + 'u');
});

test('ducking shrinks the hitbox with feet planted', () => {
  const T = L._test();
  const G = T.G;
  G.px = 100; G.py = 700; G.pw = 48; G.ph = 72;
  G.duckHeld = false; G.ducking = false; G.onGround = true;
  const full = T.playerBox();
  G.duckHeld = true; G.ducking = true;
  const ducked = T.playerBox();
  assert.ok(ducked.h < full.h * 0.7, 'ducked height should shrink');
  assert.ok(Math.abs((ducked.y + ducked.h) - (full.y + full.h)) < 0.01, 'feet stay planted');
});

test('speed ramps up and caps; spawns get denser and floor', () => {
  assert.ok(L.speedAt(30) > L.speedAt(0));
  assert.equal(L.speedAt(100000), L.CFG.speedMax);
  assert.ok(L.spawnInterval(30) < L.spawnInterval(0));
  assert.equal(L.spawnInterval(100000), L.CFG.spawnMin);
});

test('comboMult scales and caps', () => {
  assert.equal(L.comboMult(0), 1);
  assert.equal(L.comboMult(40), 5);
  assert.equal(L.comboMult(1000), L.CFG.maxMult);
});

test('canAfford gates unlocks', () => {
  assert.equal(L.canAfford(50, 50), true);
  assert.equal(L.canAfford(49, 50), false);
});

test('missions complete once and pay out', () => {
  const T = L._test();
  T.save.mDone = [];
  T.save.mProg = { score2500: 0, shards40: 0, survive90: 0 };
  const before = T.save.shards;
  T.save.mProg.shards40 = 40;
  assert.equal(T.checkMission('shards40'), true);
  assert.ok(T.save.shards > before);
  assert.equal(T.checkMission('shards40'), false); // no double payout
  assert.equal(T.checkMission('nope'), false);
});

test('power-ups set their timers', () => {
  const T = L._test();
  T.G.shieldT = 0; T.G.magnetT = 0; T.G.x2T = 0;
  T.applyPow('shield'); assert.ok(T.G.shieldT > 0);
  T.applyPow('magnet'); assert.ok(T.G.magnetT > 0);
  T.applyPow('x2'); assert.ok(T.G.x2T > 0);
});
