import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createTeaInteraction, type TeaCup } from '../src/scene/tea-interaction';
import { createTeaCorner } from '../src/scene/tea';

function ritual() {
  const room = new THREE.Group();
  const tray = new THREE.Group();
  tray.position.set(-2.3, 1.69, 10.19);
  tray.rotation.y = -0.03;
  room.add(tray);
  const pot = new THREE.Group();
  pot.position.set(-0.12, 0.033, -0.1);
  pot.rotation.y = 0.22;
  const ceramic = new THREE.MeshStandardMaterial();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), ceramic);
  body.position.y = 0.25;
  pot.add(body);
  tray.add(pot);
  const cups: TeaCup[] = [[0.48, 0.24], [-0.48, 0.29]].map(([x, z]) => {
    const object = new THREE.Group();
    object.position.set(x, 0.057, z);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.1, 0.25, 24), ceramic);
    shell.position.y = 0.125;
    const liquid = new THREE.Mesh(new THREE.CircleGeometry(0.136, 24), ceramic);
    liquid.rotation.x = -Math.PI / 2;
    object.add(shell, liquid);
    tray.add(object);
    return { object, liquid, fill: 0.42 };
  });
  const controller = createTeaInteraction(tray, pot, cups);
  const camera = new THREE.PerspectiveCamera(48, 1.4, 0.1, 100);
  camera.position.set(0.7, 6.8, 19.6);
  camera.lookAt(0.2, 1.5, -1.2);
  camera.updateMatrixWorld();
  let time = 0;
  function ray(point: THREE.Vector3) {
    room.updateMatrixWorld(true);
    return new THREE.Raycaster(camera.position, point.clone().sub(camera.position).normalize());
  }
  function at(object: THREE.Object3D, y = 0.13) {
    room.updateMatrixWorld(true);
    return ray(object.localToWorld(new THREE.Vector3(0, y, 0)));
  }
  return {
    ...controller, pot, cups, tray, room, at, ray,
    state() { return controller.interaction.debug(camera, 1000, 700); },
    step(count = 1, reduced = false) {
      for (let i = 0; i < count; i++) { time += 1 / 60; controller.update(1 / 60, time, reduced); }
      room.updateMatrixWorld(true);
    },
  };
}

test('actual rays pick the pot, holding over a cup pours into its rim, and release returns the complete pot', () => {
  const sim = ritual();
  const original = sim.pot.position.clone();
  const orientation = sim.pot.quaternion.clone();
  assert.equal(sim.interaction.pointerDown(sim.at(sim.pot, 0.28)), true);
  sim.step(30);
  assert.ok(sim.pot.position.y > original.y + 0.6, 'the mesh itself lifts above the tray');
  sim.interaction.pointerMove(sim.at(sim.cups[0].object));
  sim.step(90);
  assert.equal(sim.state().pouringCup, 0);
  assert.ok(sim.cups[0].fill > 0.56, 'a stationary held pointer continues pouring');
  assert.equal(sim.cups[1].fill, 0.42, 'only the cup beneath the spout fills');
  const outlet = new THREE.Vector3(-0.638, 0.418, 0).applyQuaternion(sim.pot.quaternion).add(sim.pot.position);
  const cup = sim.cups[0].object.position;
  assert.ok(Math.hypot(outlet.x - cup.x, outlet.z - cup.z) < 0.02);
  assert.ok(outlet.y > cup.y + 0.248, 'pouring starts above the actual rim');
  assert.ok(sim.cups[0].liquid.position.y > sim.cups[1].liquid.position.y, 'liquid mesh follows fill');
  const heldFill = sim.cups[0].fill;
  sim.interaction.pointerUp();
  assert.equal(sim.state().streamVisible, false, 'release stops pouring immediately');
  sim.step(120);
  assert.deepEqual(sim.pot.position.toArray(), original.toArray());
  assert.ok(sim.pot.quaternion.angleTo(orientation) < 1e-7);
  assert.equal(sim.cups[0].fill, heldFill);
  sim.dispose();
});

test('cups can be moved, settle without overlapping the pot or another cup, then empty and refill', () => {
  const sim = ritual();
  const cup = sim.cups[0];
  assert.equal(sim.interaction.pointerDown(sim.at(cup.object)), true);
  sim.interaction.pointerMove(sim.ray(sim.tray.localToWorld(new THREE.Vector3(3, 0.057, 3))));
  sim.step(30);
  assert.ok(cup.object.position.y > 0.3, 'cup mesh lifts during drag');
  sim.interaction.pointerUp();
  sim.step(90);
  assert.ok(Math.abs(cup.object.position.x) <= 0.635 && Math.abs(cup.object.position.z) <= 0.385);
  assert.ok(Math.hypot(cup.object.position.x + 0.12, cup.object.position.z + 0.1) >= 0.5);
  assert.ok(cup.object.position.distanceTo(sim.cups[1].object.position) >= 0.35);
  assert.ok(Math.abs(cup.object.position.y - 0.057) < 1e-7);
  assert.equal(sim.interaction.contextMenu(sim.at(cup.object)), true);
  sim.step(20);
  assert.ok(cup.fill < 0.42 && cup.fill > 0, 'a sip lowers liquid over time');
  assert.ok(cup.object.position.y < 0.22, 'drinking lift remains bounded instead of accumulating each frame');
  sim.step(100);
  assert.equal(cup.fill, 0);
  assert.equal(cup.liquid.visible, false);
  sim.interaction.pointerDown(sim.at(sim.pot, 0.28));
  sim.interaction.pointerMove(sim.at(cup.object));
  sim.step(420);
  assert.equal(cup.fill, 0.985, 'empty cups refill without overflowing');
  assert.equal(sim.state().streamVisible, false);
  sim.dispose();
});

test('cancel, visibility, missed rays and reduced motion leave no ghost drag or pouring', () => {
  const sim = ritual();
  const miss = sim.ray(new THREE.Vector3(100, 20, -100));
  assert.equal(sim.interaction.pointerDown(miss), false);
  assert.equal(sim.interaction.contextMenu(miss), false);
  sim.room.visible = false;
  assert.equal(sim.interaction.hovered(sim.at(sim.pot, 0.28)), false);
  sim.room.visible = true;
  sim.interaction.pointerDown(sim.at(sim.pot, 0.28));
  sim.interaction.pointerMove(sim.at(sim.cups[0].object));
  sim.step(90, true);
  assert.ok(sim.cups[0].fill > 0.42, 'reduced motion preserves the requested pouring action');
  sim.interaction.cancel();
  const cancelledFill = sim.cups[0].fill;
  sim.step(120);
  assert.equal(sim.state().active, null);
  assert.equal(sim.state().streamVisible, false);
  assert.deepEqual(sim.pot.position.toArray(), [-0.12, 0.033, -0.1]);
  assert.equal(sim.cups[0].fill, cancelledFill);
  sim.interaction.pointerUp();
  sim.dispose();
  sim.dispose();
  assert.equal(sim.interaction.pointerDown(sim.at(sim.pot, 0.28)), false);
});

test('the rendered tea corner keeps animated ceramic meshes out of static batches and its chime catches irregular wind', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  class CanvasPage extends EventTarget {
    hidden = false;
    createElement() {
      return { width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' }) };
    }
  }
  Object.defineProperty(globalThis, 'document', { value: new CanvasPage(), configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const room = new THREE.Group();
  const corner = createTeaCorner(room, new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial());
  const pot = room.getObjectByName('ceramic-teapot')!;
  const cup = room.getObjectByName('ceramic-teacup-1')!;
  assert.ok(pot.children.filter(child => child instanceof THREE.Mesh).length >= 7, 'body, lid, handle and spout survive batching inside the movable pot');
  assert.equal(cup.children.filter(child => child instanceof THREE.Mesh).length, 2, 'cup shell and liquid remain together');
  const camera = new THREE.PerspectiveCamera(48, 1.4, 0.1, 100);
  camera.position.set(0.7, 6.8, 19.6);
  camera.lookAt(0.2, 1.5, -1.2);
  camera.updateMatrixWorld();
  room.updateMatrixWorld(true);
  const point = pot.localToWorld(new THREE.Vector3(0, 0.28, 0));
  const ray = new THREE.Raycaster(camera.position, point.sub(camera.position).normalize());
  assert.equal(corner.interaction.pointerDown(ray), true, 'actual lathed pot geometry can be picked');
  corner.interaction.pointerUp();
  let peak = 0;
  for (let frame = 0; frame < 1800; frame++) {
    corner.update(frame / 60, false);
    peak = Math.max(peak, Math.abs(corner.chimeTarget.rotation.z));
  }
  assert.ok(peak > 0.003 && peak < 0.15, `natural wind remains gentle and visible: ${peak}`);
  corner.update(30, true);
  assert.equal(corner.chimeTarget.rotation.z, 0);
  assert.equal(corner.chimeTarget.rotation.x, 0);
  corner.dispose();
});
