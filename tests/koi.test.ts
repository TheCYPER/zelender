import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKoi } from '../src/scene/koi';
import { POND, pondFloorY, pondFraction, pondPoint } from '../src/scene/common';
import { PondWaves } from '../src/scene/waves';
import { createWater } from '../src/scene/water';

function foodSimulation() {
  const contacts: { x: number; z: number }[] = [];
  const scene = new THREE.Scene();
  const koi = createKoi(scene, new THREE.Texture(), (x, z) => contacts.push({ x, z }));
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  camera.position.set(0, 19, 4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { koi, scene, contacts, state: (time: number) => koi.debug(time, camera, 1000, 1000) };
}

test('food accelerates downward, wets briefly, then slowly sinks after exactly one splash', () => {
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
  sim.koi.update(3, 0, false);
  const wet = sim.state(3);
  sim.koi.update(7, 0, false);
  const sunk = sim.state(7);
  assert.equal(sunk.sinkingFoodCount, initial.foodCount);
  wet.foodPositions.forEach((pellet, i) => {
    const drop = pellet.y - sunk.foodPositions[i].y;
    assert(drop > 0.17 && drop < 0.27, 'food must visibly descend at a slow settling speed');
    assert(sunk.foodPositions[i].y > pondFloorY(pellet.x, pellet.z));
  });
  assert.equal(sim.contacts.length, initial.foodCount, 'sinking pellets must not repeat their landing callback');
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
  assert.equal(sim.state(0.9).foodCount, before.foodCount, 'fish well below the surface cannot eat food through a vertical gap');
  assert(sim.state(0.9).feedingCount > 0, 'landed food may attract fish before their mouths reach it');
  for (let frame = 1; frame <= 480; frame++) sim.koi.update(0.9 + frame / 60, 1 / 60, false);
  assert(sim.state(8.9).foodCount < before.foodCount, 'fish can consume food after rising to its actual depth');
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
      const ux = Math.sin(second.heading) * Math.cos(second.pitch), uy = Math.sin(second.pitch), uz = Math.cos(second.heading) * Math.cos(second.pitch);
      // Sample the first fish's long body axis against the second's capsule.
      // This catches nose-to-flank crossings that centre-distance checks miss.
      for (let sample = 0; sample <= 16; sample++) {
        const offset = (sample / 8 - 1) * first.collisionHalfLength;
        const dx = first.x + Math.sin(first.heading) * Math.cos(first.pitch) * offset - second.x;
        const dy = first.y + Math.sin(first.pitch) * offset - second.y;
        const dz = first.z + Math.cos(first.heading) * Math.cos(first.pitch) * offset - second.z;
        const along = Math.max(-second.collisionHalfLength, Math.min(second.collisionHalfLength, dx * ux + dy * uy + dz * uz));
        const gap = Math.hypot(dx - ux * along, dy - uy * along, dz - uz * along) - first.collisionRadius - second.collisionRadius;
        minimumGap = Math.min(minimumGap, gap);
        assert(gap >= -0.006, `Fish ${a}/${b} overlap by ${-gap} at ${time}s`);
      }
    }
    assert(fish.every((koi) => pondFraction(koi.x, koi.z) <= 0.861));
    assert(fish.every((koi) => koi.y >= koi.verticalBounds.min - 0.001 && koi.y <= koi.verticalBounds.max + 0.001));
  }
  assert(minimumGap < 0.15, 'scenario must exercise close body contacts');
});

test('crowded fish separate even when the surface and shoreline block part of each correction', () => {
  const sim = foodSimulation();
  const shore = pondPoint(1.0, 0.83);
  const initial = sim.state(0).fish;
  // A compact surface-feeding cluster makes several separation constraints
  // compete with both the upper water bound and the outer bank at once.
  for (let i = 0; i < 7; i++) {
    sim.scene.getObjectByName(`koi-${i}`)!.position.set(
      shore.x + (i % 3 - 1) * 0.17,
      initial[i].verticalBounds.max - (i % 2) * 0.008,
      shore.z - Math.floor(i / 3) * 0.16,
    );
  }
  sim.koi.update(0.1, 0, false);
  const fish = sim.state(0.1).fish;
  for (let a = 0; a < fish.length; a++) for (let b = a + 1; b < fish.length; b++) {
    const first = fish[a], second = fish[b];
    const axis = new THREE.Vector3(Math.sin(second.heading) * Math.cos(second.pitch), Math.sin(second.pitch), Math.cos(second.heading) * Math.cos(second.pitch));
    for (let sample = 0; sample <= 24; sample++) {
      const offset = (sample / 12 - 1) * first.collisionHalfLength;
      const delta = new THREE.Vector3(
        first.x + Math.sin(first.heading) * Math.cos(first.pitch) * offset - second.x,
        first.y + Math.sin(first.pitch) * offset - second.y,
        first.z + Math.cos(first.heading) * Math.cos(first.pitch) * offset - second.z,
      );
      const along = THREE.MathUtils.clamp(delta.dot(axis), -second.collisionHalfLength, second.collisionHalfLength);
      const gap = delta.addScaledVector(axis, -along).length() - first.collisionRadius - second.collisionRadius;
      assert(gap >= -0.006, `surface/bank constraint left fish ${a}/${b} overlapping by ${-gap}`);
    }
  }
  assert(fish.every(koi => pondFraction(koi.x, koi.z) <= 0.861));
  assert(fish.every(koi => koi.y <= koi.verticalBounds.max + 0.001 && koi.y >= koi.verticalBounds.min - 0.001));
});

test('koi explore a water column with pitched rises and dives while remaining submerged', () => {
  const sim = foodSimulation();
  const depths = Array.from({ length: 14 }, () => ({ min: Infinity, max: -Infinity, up: false, down: false }));
  for (let frame = 1; frame <= 2400; frame++) {
    const time = frame / 30;
    sim.koi.update(time, 1 / 30, false);
    if (frame % 15) continue;
    for (const [i, koi] of sim.state(time).fish.entries()) {
      depths[i].min = Math.min(depths[i].min, koi.y);
      depths[i].max = Math.max(depths[i].max, koi.y);
      depths[i].up ||= koi.pitch > 0.05;
      depths[i].down ||= koi.pitch < -0.05;
      assert(koi.y <= koi.verticalBounds.max + 0.001);
      assert(koi.y >= koi.verticalBounds.min - 0.001);
    }
  }
  assert(depths.every(depth => depth.max - depth.min > 0.65), 'each koi must change depth by much more than a small surface bob');
  assert(depths.every(depth => depth.up && depth.down), 'body attitude must follow rises and dives');
});

test('fish on separate vertical levels can cross without artificial horizontal repulsion', () => {
  const sim = foodSimulation();
  const upper = sim.scene.getObjectByName('koi-0')!, lower = sim.scene.getObjectByName('koi-1')!;
  upper.position.set(POND.x, -0.45, POND.z);
  lower.position.set(POND.x, -1.7, POND.z);
  sim.koi.update(0.1, 0, false);
  assert(Math.hypot(upper.position.x - lower.position.x, upper.position.z - lower.position.z) < 0.0001);
  assert(upper.position.y - lower.position.y > 1, 'depth separation must remain available instead of flattening the school');
});

test('visible bowl geometry follows the same depth contract as fish and food', () => {
  const scene = new THREE.Scene();
  const water = createWater(scene);
  const bowl = scene.getObjectByName('recessed-pond-bowl') as THREE.Mesh;
  const vertices = bowl.geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    assert(Math.abs(vertices.getY(i) - pondFloorY(vertices.getX(i), vertices.getZ(i))) < 0.00001);
  }
  const normals = bowl.geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) assert(normals.getY(i) > 0.14, 'the bed must climb as a slope, not a vertical cylinder');
  const shelfHeights: number[] = [];
  for (let side = 0; side < 24; side++) {
    const point = pondPoint(side / 24 * Math.PI * 2, 1);
    assert(Math.abs(pondFloorY(point.x, point.z) - POND.shoreFloorY) < 0.00001, 'the sloping bed meets the garden without a separate wall');
    const shelf = pondPoint(side / 24 * Math.PI * 2, 0.73);
    shelfHeights.push(pondFloorY(shelf.x, shelf.z));
  }
  assert(Math.max(...shelfHeights) - Math.min(...shelfHeights) > 0.22, 'uneven shelves must break the rotationally uniform bowl');
  assert(POND.waterY - POND.floorY > 2, 'pond must contain a credible swimming depth');
  water.dispose();
});

test('rounded pebble patches cover deep and shallow areas without exceeding fish clearance', () => {
  const scene = new THREE.Scene();
  const water = createWater(scene);
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  let count = 0, deepest = Infinity, shallowest = -Infinity;
  const sectors = new Set<number>();
  for (let kind = 0; kind < 3; kind++) {
    const stones = scene.getObjectByName(`pond-bed-pebbles-${kind}`) as THREE.InstancedMesh;
    assert(stones.count > 0, 'each rounded size group contributes to the bed');
    const positions = stones.geometry.getAttribute('position');
    count += stones.count;
    for (let i = 0; i < stones.count; i++) {
      stones.getMatrixAt(i, matrix);
      point.setFromMatrixPosition(matrix);
      deepest = Math.min(deepest, point.y);
      shallowest = Math.max(shallowest, point.y);
      sectors.add(Math.floor((Math.atan2(point.z - POND.z, point.x - POND.x) + Math.PI) / (Math.PI * 2) * 8));
      assert(pondFraction(point.x, point.z) < 0.971);
      for (let vertex = 0; vertex < positions.count; vertex++) {
        point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
        assert(point.y - pondFloorY(point.x, point.z) <= 0.07501, 'pebbles must fit inside the reserved substrate margin');
      }
    }
  }
  assert(deepest < -2.2 && shallowest > -0.4);
  assert.equal(sectors.size, 8, 'natural patches reach every side while allowing open bed between them');
  assert.equal(water.debug().pebbleCount, count);
  water.dispose();
});

test('the aquatic-plant height sampler reads the actually displaced water vertices', () => {
  const water = createWater(new THREE.Scene());
  water.impulse(POND.x, POND.z, 0.12);
  water.update(0.05, false);
  const vertices = water.surface.geometry.getAttribute('position');
  for (const i of [1700, 2582, 3540, 4280]) {
    const x = vertices.getX(i), z = -vertices.getY(i);
    assert(Math.abs(water.sampleHeight(x, z) - (POND.waterY + vertices.getZ(i))) < 0.00001);
  }
  assert(Math.abs(water.sampleHeight(POND.x, POND.z) - POND.waterY) > 0.001);
  water.dispose();
});

test('pitched fish geometry clears the sloping floor and the water surface during feeding and scares', () => {
  const sim = foodSimulation();
  const point = new THREE.Vector3();
  for (let frame = 1; frame <= 1800; frame++) {
    const time = frame / 30;
    if (frame % 240 === 1) sim.koi.feed(POND.x + 3, POND.z + 1, time);
    if (frame % 240 === 180) sim.koi.startle(POND.x + 3, POND.z + 1, time);
    sim.koi.update(time, 1 / 30, false);
    if (frame % 30) continue;
    sim.scene.updateMatrixWorld(true);
    for (let i = 0; i < 14; i++) {
      sim.scene.getObjectByName(`koi-${i}`)!.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
          point.fromBufferAttribute(positions, vertex).applyMatrix4(object.matrixWorld);
          assert(point.y <= POND.waterY - 0.165, `fish ${i} broke the lowest wave trough at ${time}s`);
          assert(point.y >= pondFloorY(point.x, point.z) + 0.095, `fish ${i} entered the pebble clearance at ${time}s`);
        }
      });
    }
  }
});

test('shallow fish displace real waves on a fixed time cadence; deep fish do not', () => {
  function sample(depth: number, fps: number) {
    const scene = new THREE.Scene();
    const waves = new PondWaves();
    const contacts: { x: number; z: number; strength: number }[] = [];
    const koi = createKoi(scene, new THREE.Texture(), undefined, (x, z, strength) => {
      contacts.push({ x, z, strength });
      waves.impulse(x, z, strength);
    });
    for (let i = 0; i < 14; i++) {
      const position = scene.getObjectByName(`koi-${i}`)!.position;
      // Isolate depth response in the deep basin, not by placing a fish inside
      // the new shallow shelf and forcing the collision solver to lift it.
      position.x = POND.x + (position.x - POND.x) * 0.65;
      position.z = POND.z + (position.z - POND.z) * 0.65;
      position.y = POND.waterY - depth;
    }
    for (let frame = 1; frame <= fps * 2; frame++) {
      // Hold fish still to isolate event frequency and surface-distance response.
      koi.update(frame / fps, 0, false);
      waves.step(1 / fps);
    }
    return { contacts, waves };
  }
  const shallow = sample(0.55, 30), faster = sample(0.55, 60), deep = sample(1.65, 30);
  assert(shallow.contacts.length > 80);
  assert.equal(shallow.contacts.length, faster.contacts.length, 'higher render rates must not inject extra energy');
  assert.equal(deep.contacts.length, 0, 'deep swimming should not produce surface rings');
  assert(shallow.contacts.every(contact => Number.isFinite(contact.strength) && contact.strength > 0 && contact.strength < 0.05 && pondFraction(contact.x, contact.z) < 1));
  assert(shallow.waves.heights.some(height => Math.abs(height) > 0.001), 'wake impulses must move surface vertices');
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
