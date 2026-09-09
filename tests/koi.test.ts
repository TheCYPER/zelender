import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKoi } from '../src/scene/koi';
import { POND, pondFraction, pondPoint } from '../src/scene/common';

function foodSimulation() {
  const contacts: { x: number; z: number }[] = [];
  const koi = createKoi(new THREE.Scene(), new THREE.Texture(), (x, z) => contacts.push({ x, z }));
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  camera.position.set(0, 19, 4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { koi, contacts, state: (time: number) => koi.debug(time, camera, 1000, 1000) };
}

test('food accelerates downward, then floats and splashes once per pellet', () => {
  const sim = foodSimulation();
  sim.koi.feed(POND.x, POND.z, 0);
  const initial = sim.state(0);
  assert.equal(initial.foodCount, 9);
  assert.equal(initial.airborneFoodCount, initial.foodCount);
  assert(initial.foodPositions.every((pellet) => pellet.y >= 2 && pellet.y <= 3));

  // Zero fish movement isolates pellet flight and prevents incidental eating.
  sim.koi.update(0.1, 0, false);
  const first = sim.state(0.1);
  sim.koi.update(0.2, 0, false);
  const second = sim.state(0.2);
  initial.foodPositions.forEach((pellet, i) => {
    const firstDrop = pellet.y - first.foodPositions[i].y;
    const secondDrop = first.foodPositions[i].y - second.foodPositions[i].y;
    assert(firstDrop > 0);
    assert(secondDrop > firstDrop, 'gravity must increase downward speed');
  });
  assert.equal(sim.contacts.length, 0);
  assert.equal(second.feedingCount, 0);

  sim.koi.update(0.9, 0, false);
  const landed = sim.state(0.9);
  assert.equal(landed.airborneFoodCount, 0);
  assert.equal(sim.contacts.length, initial.foodCount);
  assert(landed.feedingCount > 0);
  assert(landed.foodPositions.every((pellet) => Math.abs(pellet.y - POND.waterY) < 0.05));
  for (let i = 1; i <= 60; i++) sim.koi.update(0.9 + i / 60, 0, false);
  assert.equal(sim.contacts.length, initial.foodCount, 'floating pellets must not repeat their landing callback');
});

test('a koi directly below airborne food cannot eat or pursue it', () => {
  const sim = foodSimulation();
  const target = sim.state(0).fish[0];
  sim.koi.feed(target.x, target.z, 0);
  const before = sim.state(0);
  assert(before.foodPositions.some((pellet) => Math.hypot(pellet.x - target.x, pellet.z - target.z) < 0.34));
  sim.koi.update(0.2, 0, false);
  assert.equal(sim.state(0.2).foodCount, before.foodCount);
  assert.equal(sim.state(0.2).feedingCount, 0);
  assert.equal(sim.contacts.length, 0);
  sim.koi.update(0.9, 0, false);
  assert.equal(sim.contacts.length, before.foodCount);
  assert(sim.state(0.9).foodCount < before.foodCount, 'the fish can eat once the pellets reach the water');
});

test('feeding near every side of the organic shoreline still throws food into water', () => {
  for (let i = 0; i < 16; i++) {
    const sim = foodSimulation();
    const point = pondPoint(i / 16 * Math.PI * 2, 0.995);
    sim.koi.feed(point.x, point.z, 0);
    const thrown = sim.state(0);
    assert.equal(thrown.foodCount, 9, 'valid water clicks must not discard an entire throw');
    assert(thrown.foodPositions.every(pellet => pondFraction(pellet.x, pellet.z) <= 0.940001));
    sim.koi.update(0.9, 0, false);
    assert.equal(sim.contacts.length, 9);
    assert(sim.contacts.every(contact => pondFraction(contact.x, contact.z) <= 0.940001));
  }
});

test('body volumes remain separated when koi crowd food and repeatedly flee', () => {
  const sim = foodSimulation();
  let minimumGap = Infinity;
  for (let frame = 1; frame <= 1200; frame++) {
    const time = frame / 30;
    if (frame % 60 === 1) sim.koi.feed(POND.x, POND.z, time);
    if (frame % 150 === 100) sim.koi.startle(POND.x, POND.z, time);
    sim.koi.update(time, 1 / 30, false);
    if (frame % 6 !== 0) continue;
    const fish = sim.state(time).fish;
    for (let a = 0; a < fish.length; a++) for (let b = a + 1; b < fish.length; b++) {
      const first = fish[a], second = fish[b];
      const ux = Math.sin(second.heading), uz = Math.cos(second.heading);
      // Sample the first fish's long body axis against the second's capsule.
      // This catches nose-to-flank crossings that centre-distance checks miss.
      for (let sample = 0; sample <= 16; sample++) {
        const offset = (sample / 8 - 1) * first.collisionHalfLength;
        const dx = first.x + Math.sin(first.heading) * offset - second.x;
        const dz = first.z + Math.cos(first.heading) * offset - second.z;
        const along = Math.max(-second.collisionHalfLength, Math.min(second.collisionHalfLength, dx * ux + dz * uz));
        const gap = Math.hypot(dx - ux * along, dz - uz * along) - first.collisionRadius - second.collisionRadius;
        minimumGap = Math.min(minimumGap, gap);
        assert(gap >= -0.006, `Fish ${a}/${b} overlap by ${-gap} at ${time}s`);
      }
    }
    assert(fish.every((koi) => pondFraction(koi.x, koi.z) <= 0.861));
  }
  assert(minimumGap < 0.15, 'scenario must exercise close body contacts');
});

test('koi have a vertical dorsal fin, trailing caudal fin and a volumetric body', () => {
  const scene = new THREE.Scene();
  createKoi(scene, new THREE.Texture());
  const fish = scene.getObjectByName('koi-0')!;
  const dorsal = fish.getObjectByName('vertical-dorsal-fin') as THREE.Mesh;
  const tail = fish.getObjectByName('vertical-forked-caudal-fin') as THREE.Mesh;
  const body = fish.getObjectByName('rounded-koi-body') as THREE.Mesh;
  dorsal.geometry.computeBoundingBox();
  tail.geometry.computeBoundingBox();
  body.geometry.computeBoundingBox();
  const dorsalSize = dorsal.geometry.boundingBox!.getSize(new THREE.Vector3());
  const bodySize = body.geometry.boundingBox!.getSize(new THREE.Vector3());
  assert(dorsalSize.y > 0.1 && dorsalSize.x < 0.01, 'dorsal fin must stand above the back');
  assert(tail.geometry.boundingBox!.min.z < -0.35, 'tail fin must extend behind its tail root');
  assert(bodySize.x > 0.4 && bodySize.y > 0.28, 'body must retain lateral and vertical volume');
});
