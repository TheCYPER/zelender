import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKoi } from '../src/scene/koi';
import { POND, pondFraction } from '../src/scene/common';

function simulation() {
  const scene = new THREE.Scene();
  const koi = createKoi(scene, new THREE.Texture());
  const camera = new THREE.PerspectiveCamera(46, 1.4, 0.1, 100);
  camera.position.set(0, 19, 4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  let time = 0;
  return {
    koi,
    get time() { return time; },
    state() { return koi.debug(time, camera, 1000, 700); },
    step(dt = 1 / 60) { time += dt; koi.update(time, dt, false); },
  };
}

test('feeding attracts koi and food is eaten before its expiration time', () => {
  const sim = simulation();
  sim.koi.feed(POND.x, POND.z, sim.time);
  const initialFood = sim.state().foodCount;
  assert(initialFood > 0);
  // Food falls from hand height before the koi can seek it out.
  for (let i = 0; i < 60; i++) sim.step();
  assert(sim.state().feedingCount > 0);
  for (let i = 0; i < 540; i++) sim.step();
  // Pellets expire after 18 seconds, so a decrease here proves consumption.
  assert(sim.state().foodCount < initialFood);
});

test('nearby koi visibly accelerate when startled and recover afterward', () => {
  const sim = simulation();
  const target = sim.state().fish[0];
  const affected = sim.koi.startle(target.x, target.z, sim.time);
  assert(affected > 0);
  for (let i = 0; i < 30; i++) sim.step();
  const scared = sim.state();
  assert(scared.fleeingCount > 0);
  assert(scared.fish.some((fish) => fish.speed > 1.5));
  for (let i = 0; i < 300; i++) sim.step();
  assert.equal(sim.state().fleeingCount, 0);
});

test('repeated targeted scares cannot drive fish through the irregular shore', () => {
  const sim = simulation();
  const observed = new Set<string>();
  for (let tick = 0; tick < 9000; tick++) {
    if (tick % 900 === 0) sim.koi.feed(POND.x, POND.z, sim.time);
    if (tick % 300 === 150) {
      const target = sim.state().fish[Math.floor(tick / 300) % 14];
      sim.koi.startle(target.x, target.z, sim.time);
    }
    sim.step(1 / 30);
    if (tick % 5 !== 0) continue;
    for (const fish of sim.state().fish) {
      assert(Number.isFinite(fish.x) && Number.isFinite(fish.z));
      assert(pondFraction(fish.x, fish.z) <= 0.922, `Fish crossed safe shoreline at ${sim.time}: ${fish.x}, ${fish.z}`);
      observed.add(fish.state);
    }
  }
  assert.deepEqual([...observed].sort(), ['feeding', 'fleeing', 'swimming']);
});
