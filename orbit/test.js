'use strict';
// Runnable self-check for ORBIT's pure game logic. Run: node --test test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./game.js');

test('angDiff wraps around the circle', () => {
  assert.ok(Math.abs(L.angDiff(0.1, -0.1) - 0.2) < 1e-9);
  assert.ok(Math.abs(L.angDiff(Math.PI - 0.1, -Math.PI + 0.1) + 0.2) < 1e-9);
  assert.ok(Math.abs(L.angDiff(0, 0)) < 1e-9);
});

test('willCollide only on the same orbit inside the hit arc', () => {
  assert.equal(L.willCollide(0.05, true, 0.17), true);
  assert.equal(L.willCollide(0.5, true, 0.17), false);
  assert.equal(L.willCollide(0.0, false, 0.17), false);
});

test('isNearMiss only on the other orbit, once per debris', () => {
  assert.equal(L.isNearMiss(0.3, true, false, 0.6), true);
  assert.equal(L.isNearMiss(0.3, true, true, 0.6), false);   // already counted
  assert.equal(L.isNearMiss(0.3, false, false, 0.6), false); // same orbit = collision zone
  assert.equal(L.isNearMiss(1.2, true, false, 0.6), false);  // too far
});

test('comboMult scales and caps at maxMult', () => {
  assert.equal(L.comboMult(0), 1);
  assert.equal(L.comboMult(10), 2);
  assert.equal(L.comboMult(40), 5);
  assert.equal(L.comboMult(1000), L.CFG.maxMult);
});

test('canAfford gates unlocks', () => {
  assert.equal(L.canAfford(50, 50), true);
  assert.equal(L.canAfford(49, 50), false);
});

test('spinAt ramps up and caps', () => {
  assert.ok(L.spinAt(10) > L.spinAt(0));
  assert.equal(L.spinAt(10000), L.CFG.maxSpin);
});

test('debrisInterval shrinks and floors', () => {
  assert.ok(L.debrisInterval(20) < L.debrisInterval(0));
  assert.equal(L.debrisInterval(10000), L.CFG.debrisMin);
});

test('game.js loads in node without touching the DOM', () => {
  assert.equal(typeof L.angDiff, 'function');
});
