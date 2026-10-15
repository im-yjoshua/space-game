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

test('fuel burns while thrusting and refills on ground', () => {
  assert.ok(L.burnFuel(100, 1) < 100);
  assert.equal(L.burnFuel(5, 10), 0); // clamps at zero
  assert.ok(L.refillFuel(50, 1) > 50);
  assert.equal(L.refillFuel(99, 10), L.CFG.fuelMax); // clamps at max
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
