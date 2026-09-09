import assert from 'node:assert/strict';
import test from 'node:test';
import { PondWaves } from '../src/scene/waves';
import { POND } from '../src/scene/common';

test('a water impulse displaces vertices, propagates outward, and loses energy', () => {
  const waves = new PondWaves();
  const energy = () => waves.heights.reduce((sum, h) => sum + h * h, 0);
  assert.equal(energy(), 0);
  waves.impulse(POND.x, POND.z, 0.15);
  for (let i = 0; i < 15; i++) waves.step(1 / 60);
  const initial = energy();
  assert.ok(initial > 0.001);
  const outward = 36 * waves.columns + 56;
  const firstOutward = Math.abs(waves.heights[outward]);
  for (let i = 0; i < 45; i++) waves.step(1 / 60);
  assert.ok(Math.abs(waves.heights[outward]) > firstOutward + 0.0001);
  for (let i = 0; i < 600; i++) waves.step(1 / 60);
  assert.ok(energy() < initial * 0.01);
  waves.heights.forEach((h, i) => {
    assert.ok(Number.isFinite(h) && Math.abs(h) <= 0.15);
    if (!waves.wet[i]) assert.equal(h, 0);
  });
});
