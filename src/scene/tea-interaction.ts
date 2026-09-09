import * as THREE from 'three';
import { createTeaSound } from './tea-audio';
import { createTeaSteam } from './tea-steam';

export type TeaCup = { object: THREE.Group; liquid: THREE.Mesh; fill: number };
export type TeaInteraction = {
  pointerDown(raycaster: THREE.Raycaster): boolean;
  pointerMove(raycaster: THREE.Raycaster): void;
  pointerUp(): void;
  contextMenu(raycaster: THREE.Raycaster): boolean;
  cancel(): void;
  hovered(raycaster: THREE.Raycaster): boolean;
  debug(camera: THREE.Camera, width: number, height: number): Record<string, unknown>;
};

const SPOUT = new THREE.Vector3(-0.638, 0.418, 0);
const CUP_BASE = 0.057;
const CUP_RIM = 0.248;
const POUR_TILT = 0.76;

/** Operates in tray coordinates; the tray may be translated/rotated in the room. */
export function createTeaInteraction(tray: THREE.Group, pot: THREE.Group, cups: TeaCup[], steamTexture?: THREE.Texture) {
  const audio = createTeaSound();
  const home = pot.position.clone();
  const homeRotation = pot.quaternion.clone();
  const cupHomes = cups.map(cup => cup.object.position.clone());
  const cupTargets = cupHomes.map(position => position.clone());
  const cupPositions = cupHomes.map(position => position.clone());
  const cupDrinking = cups.map(() => 0);
  const cupDrinkStart = cups.map(cup => cup.fill);
  const potTarget = home.clone();
  const targetRotation = homeRotation.clone();
  const pourRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, POUR_TILT));
  const outletOffset = SPOUT.clone().applyQuaternion(pourRotation);
  const hitPoint = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();
  const cursor = new THREE.Vector3();
  const plane = new THREE.Plane();
  let active: 'pot' | number | null = null;
  let pouringCup = -1;
  let returningPot = false;
  let settleCup = -1;
  let disposed = false;
  let reduced = false;
  const sources = [pot, ...cups.map(cup => cup.object)];
  for (const source of sources) source.traverse(object => { object.userData.skipAO = true; });
  const stream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.014, 1, 8),
    new THREE.MeshPhysicalMaterial({ color: '#be9448', transparent: true, opacity: 0.7, roughness: 0.12, clearcoat: 1, depthWrite: false }),
  );
  stream.name = 'pouring-tea-stream';
  stream.visible = false;
  stream.userData.skipAO = true;
  tray.add(stream);
  const splash = new THREE.Mesh(
    new THREE.RingGeometry(0.016, 0.025, 24),
    new THREE.MeshBasicMaterial({ color: '#d6bc78', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
  );
  splash.rotation.x = -Math.PI / 2;
  splash.visible = false;
  splash.userData.skipAO = true;
  tray.add(splash);
  const steam = createTeaSteam(tray, [
    { name: 'pot', object: pot, point: new THREE.Vector3(0, 0.59, 0), enabled: () => true, count: 22, rate: 7, life: 2.8, opacity: 0.055 },
    ...cups.map((cup, index) => ({
      name: `cup-${index}`, object: cup.liquid, point: new THREE.Vector3(0, 0, 0.012), enabled: () => cup.fill > 0.02,
      count: 10, rate: 4, life: 2.1, opacity: 0.035, size: 0.8,
    })),
    { name: 'pour', object: stream, point: new THREE.Vector3(), enabled: () => stream.visible, count: 14, rate: 9, life: 1.3, opacity: 0.027, size: 0.65, verticalSpread: 0.8 },
  ], steamTexture);

  function hit(raycaster: THREE.Raycaster) {
    if (disposed) return null;
    tray.updateWorldMatrix(true, true);
    for (const ancestor of [tray, tray.parent, tray.parent?.parent]) if (ancestor && !ancestor.visible) return null;
    const intersections = raycaster.intersectObjects(sources, true);
    for (const intersection of intersections) {
      if (!(intersection.object instanceof THREE.Mesh)) continue;
      let object: THREE.Object3D | null = intersection.object;
      while (object && !sources.includes(object as THREE.Group)) object = object.parent;
      const index = sources.indexOf(object as THREE.Group);
      if (index >= 0) return index === 0 ? 'pot' as const : index - 1;
    }
    return null;
  }

  function locate(raycaster: THREE.Raycaster) {
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(tray.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, tray.localToWorld(new THREE.Vector3(0, CUP_BASE, 0)));
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return false;
    tray.worldToLocal(hitPoint);
    return Number.isFinite(hitPoint.x) && Number.isFinite(hitPoint.z);
  }

  function validCupSpot(x: number, z: number, index: number) {
    if (Math.abs(x) > 0.635 || Math.abs(z) > 0.385) return false;
    // Reserve the teapot's footprint even while it is being returned home.
    if (Math.hypot(x - home.x, z - home.z) < 0.53) return false;
    if (Math.hypot(x - 0.46, z + 0.23) < 0.23) return false;
    return cups.every((_, other) => other === index || Math.hypot(x - cupTargets[other].x, z - cupTargets[other].z) >= 0.35);
  }

  function settlePosition(point: THREE.Vector3, index: number) {
    let closest = cupTargets[index].clone();
    let distance = Infinity;
    // Small fixed grid makes every release stable, even outside the tray or
    // between both cups. No frame-by-frame collision iteration can jitter.
    for (let x = -0.63; x <= 0.64; x += 0.035) for (let z = -0.38; z <= 0.39; z += 0.035) {
      if (!validCupSpot(x, z, index)) continue;
      const delta = Math.hypot(point.x - x, point.z - z);
      if (delta < distance) { distance = delta; closest.set(x, CUP_BASE, z); }
    }
    return closest;
  }

  function move(raycaster: THREE.Raycaster) {
    if (active === null || !locate(raycaster)) return;
    cursor.copy(hitPoint).add(dragOffset);
    cursor.x = THREE.MathUtils.clamp(cursor.x, -1.5, 1.5);
    cursor.z = THREE.MathUtils.clamp(cursor.z, -0.9, 0.9);
    if (active === 'pot') {
      const target = cups.findIndex((cup, index) => cup.fill < 0.985 && !cupDrinking[index]
        && Math.hypot(cursor.x - cup.object.position.x, cursor.z - cup.object.position.z) < 0.43);
      if (target >= 0) {
        const cupPosition = cups[target].object.position;
        potTarget.set(cupPosition.x - outletOffset.x, 0.91, cupPosition.z - outletOffset.z);
        targetRotation.copy(pourRotation);
      } else {
        potTarget.set(cursor.x, 0.91, cursor.z);
        targetRotation.copy(homeRotation);
      }
      pouringCup = target;
    } else {
      cupTargets[active].set(cursor.x, CUP_BASE + 0.36, cursor.z);
    }
  }

  function cancel() {
    active = null;
    pouringCup = -1;
    returningPot = false;
    settleCup = -1;
    potTarget.copy(home);
    pot.position.copy(home);
    pot.quaternion.copy(homeRotation);
    targetRotation.copy(homeRotation);
    cups.forEach((cup, index) => {
      const safe = settlePosition(cupTargets[index], index);
      cupTargets[index].copy(safe);
      cupPositions[index].copy(safe);
      cup.object.position.copy(safe);
      cup.object.rotation.set(0, 0, 0);
      cupDrinking[index] = 0;
    });
    stream.visible = splash.visible = false;
    steam.clear();
    audio.stop();
  }

  const cleanup = new AbortController();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel();
  }, { signal: cleanup.signal });

  const interaction: TeaInteraction = {
    pointerDown(raycaster) {
      if (active !== null) return true;
      const selected = hit(raycaster);
      if (selected === null || !locate(raycaster)) return false;
      active = selected;
      if (selected === 'pot') returningPot = false;
      settleCup = -1;
      const position = selected === 'pot' ? pot.position : cups[selected].object.position;
      dragOffset.copy(position).sub(hitPoint);
      dragOffset.y = 0;
      if (typeof selected === 'number') cupDrinking[selected] = 0;
      audio.gesture('pickup');
      move(raycaster);
      return true;
    },
    pointerMove: move,
    pointerUp() {
      if (active === null) return;
      if (active === 'pot') {
        potTarget.copy(home);
        targetRotation.copy(homeRotation);
        returningPot = true;
      } else {
        cupTargets[active].copy(settlePosition(cupTargets[active], active));
        settleCup = active;
      }
      active = null;
      pouringCup = -1;
      stream.visible = splash.visible = false;
      audio.setPouring(false);
    },
    contextMenu(raycaster) {
      // Captured left dragging may put the cursor below the lifted cup. The
      // right-button gesture belongs to that held cup regardless of its ray.
      const selected = active ?? hit(raycaster);
      if (selected === null) return false;
      if (selected === 'pot') return true;
      if (cups[selected].fill > 0.005 && cupDrinking[selected] === 0) {
        cupDrinking[selected] = 1;
        cupDrinkStart[selected] = cups[selected].fill;
        audio.gesture('drink');
      }
      return true;
    },
    cancel,
    hovered(raycaster) { return active !== null || hit(raycaster) !== null; },
    debug(camera, width, height) {
      const screen = (object: THREE.Object3D, local: THREE.Vector3) => {
        object.updateWorldMatrix(true, false);
        const point = object.localToWorld(local).project(camera);
        return { x: (point.x * 0.5 + 0.5) * width, y: (-point.y * 0.5 + 0.5) * height };
      };
      return {
        active, pouringCup: stream.visible ? pouringCup : -1, streamVisible: stream.visible,
        pot: { position: pot.position.toArray(), tilt: pot.rotation.z, screen: screen(pot, new THREE.Vector3(0, 0.28, 0)) },
        cups: cups.map((cup, id) => ({ id, fill: cup.fill, drinking: cupDrinking[id] > 0, position: cup.object.position.toArray(), screen: screen(cup.object, new THREE.Vector3(0, 0.13, 0)) })),
        steam: steam.debug(),
        audio: audio.debug(),
      };
    },
  };

  const outlet = new THREE.Vector3();
  const teaSurface = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  return {
    interaction,
    update(dt: number, time: number, reducedMotion: boolean) {
      if (disposed) return;
      reduced = reducedMotion;
      const step = THREE.MathUtils.clamp(dt, 0, 0.06);
      const blend = 1 - Math.exp(-step * (reduced ? 25 : 10));
      pot.position.lerp(potTarget, blend);
      pot.quaternion.slerp(targetRotation, blend);
      if (returningPot && pot.position.distanceTo(home) < 0.015 && pot.quaternion.angleTo(homeRotation) < 0.02) {
        pot.position.copy(home);
        pot.quaternion.copy(homeRotation);
        returningPot = false;
        audio.effect('setdown');
      }
      cups.forEach((cup, index) => {
        cupPositions[index].lerp(cupTargets[index], blend);
        cup.object.position.copy(cupPositions[index]);
        if (cupDrinking[index] > 0) {
          cupDrinking[index] = Math.max(0, cupDrinking[index] - step / 0.95);
          cup.fill = cupDrinkStart[index] * cupDrinking[index];
          const arc = Math.sin(cupDrinking[index] * Math.PI);
          cup.object.position.y += reduced ? 0 : arc * 0.14;
          cup.object.rotation.x = reduced ? 0 : arc * 0.18;
        } else cup.object.rotation.x *= 1 - blend;
        if (settleCup === index && cup.object.position.distanceTo(cupTargets[index]) < 0.015) {
          cup.object.position.copy(cupTargets[index]);
          cupPositions[index].copy(cupTargets[index]);
          settleCup = -1;
          audio.effect('setdown');
        }
      });
      stream.visible = splash.visible = false;
      let fill = 0;
      if (active === 'pot' && pouringCup >= 0) {
        const cup = cups[pouringCup];
        if (cup.fill >= 0.985) targetRotation.copy(homeRotation);
        outlet.copy(SPOUT).applyQuaternion(pot.quaternion).add(pot.position);
        teaSurface.copy(cup.object.position).add(new THREE.Vector3(0, 0.038 + cup.fill * 0.197, 0));
        const aligned = Math.hypot(outlet.x - teaSurface.x, outlet.z - teaSurface.z) < 0.13;
        if (aligned && outlet.y > cup.object.position.y + CUP_RIM && pot.rotation.z > 0.55 && cup.fill < 0.985) {
          cup.fill = Math.min(0.985, cup.fill + step * 0.19);
          fill = cup.fill;
          direction.subVectors(outlet, teaSurface);
          stream.position.copy(outlet).add(teaSurface).multiplyScalar(0.5);
          stream.quaternion.setFromUnitVectors(up, direction.clone().normalize());
          stream.scale.set(1 + Math.sin(time * 29) * 0.13, direction.length(), 1);
          stream.visible = true;
          splash.position.copy(teaSurface);
          splash.position.y += 0.003;
          const rippleSize = 1 + ((time * 2.7) % 1) * 3;
          splash.scale.setScalar(rippleSize);
          splash.material.opacity = (1 - (time * 2.7) % 1) * 0.5;
          splash.visible = !reduced;
        }
      }
      audio.setPouring(stream.visible, fill);
      cups.forEach(cup => {
        cup.liquid.position.y = 0.038 + cup.fill * 0.197;
        cup.liquid.scale.setScalar((0.091 + cup.fill * 0.053) / 0.136);
        cup.liquid.visible = cup.fill > 0.003;
      });
      steam.update(step, reducedMotion);
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      cleanup.abort();
      audio.dispose();
      steam.dispose();
    },
  };
}
