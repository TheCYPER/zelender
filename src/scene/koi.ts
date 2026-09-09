import * as THREE from 'three';
import { horizontal, POND, pondFraction, randomGenerator } from './common';

interface Fish {
  group: THREE.Group;
  tail: THREE.Group;
  fins: THREE.Object3D[];
  shadow: THREE.Mesh;
  heading: number;
  speed: number;
  panicUntil: number;
  escapeHeading: number;
  phase: number;
  size: number;
  feeding: boolean;
}

interface Pellet { x: number; z: number; born: number; active: boolean }

function koiBody(seed: number, variety: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const white = new THREE.Color('#f5eee0');
  const red = new THREE.Color(variety === 3 ? '#eeb55d' : '#dd4b28');
  const black = new THREE.Color('#29322d');
  const color = new THREE.Color();
  const rings = 32;
  const segments = 20;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const z = -0.69 + t * 1.39;
    // Broad shoulders, a rounded nose, and a narrow caudal peduncle.
    const radius = Math.pow(Math.sin(t * Math.PI), 0.60) * (0.11 + t * 0.18);
    for (let side = 0; side <= segments; side++) {
      const angle = side / segments * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const y = Math.cos(angle) * radius * 0.59;
      vertices.push(x, y, z);
      const pattern = Math.sin(z * 9.8 + seed * 2 + Math.sin(angle * 2.0) * 1.0) + Math.cos(angle * 3.2 + z * 4.0 + seed) * 0.65;
      color.copy(variety === 3 ? red : white);
      if (variety !== 3 && pattern > (variety === 1 ? 0.32 : 0.03)) color.copy(red);
      if (variety === 2 && Math.sin(z * 17 + angle * 3 + seed) > 0.68) color.copy(black);
      if (variety === 4 && pattern < -0.02) color.copy(black);
      const scales = 0.97 + Math.sin(ring * 3.8 + Math.floor(side / 2) * 2) * 0.027;
      color.multiplyScalar(scales * (0.87 + Math.max(Math.cos(angle), 0) * 0.13));
      colors.push(color.r, color.g, color.b);
      if (ring < rings && side < segments) {
        const a = ring * (segments + 1) + side;
        const b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function finGeometry(points: number[][]): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => index === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z));
  shape.closePath();
  return horizontal(new THREE.ShapeGeometry(shape, 5));
}

function makeFish(scene: THREE.Scene, index: number, softMap: THREE.Texture): Fish {
  const random = randomGenerator(index * 71 + 11);
  const group = new THREE.Group();
  const variety = [0, 1, 3, 0, 2, 0, 3, 1, 4, 0, 2, 3, 0, 1][index];
  const body = new THREE.Mesh(koiBody(index + 1, variety), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.08 }));
  group.add(body);
  const finMaterial = new THREE.MeshStandardMaterial({ color: variety === 3 ? '#f4cf81' : '#f2ddc5', transparent: true, opacity: 0.8, side: THREE.DoubleSide, roughness: 0.46, depthWrite: false });
  const tail = new THREE.Group();
  tail.position.set(0, 0, -0.63);
  const tailMesh = new THREE.Mesh(finGeometry([[0,-0.03],[-0.10,0.16],[-0.31,0.52],[-0.08,0.44],[0,0.28],[0.09,0.44],[0.31,0.52],[0.10,0.16]]), finMaterial);
  tail.add(tailMesh);
  group.add(tail);
  const fins: THREE.Object3D[] = [];
  for (const direction of [-1, 1]) {
    const fin = new THREE.Mesh(finGeometry([[0,0],[direction*0.15,0.015],[direction*0.31,0.25],[direction*0.15,0.30],[0,0.13]]), finMaterial);
    fin.position.set(direction * 0.16, -0.025, 0.28);
    fin.rotation.z = direction * 0.13;
    group.add(fin);
    fins.push(fin);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), new THREE.MeshStandardMaterial({ color: '#111c18', roughness: 0.2 }));
    eye.position.set(direction * 0.142, 0.077, 0.50);
    group.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), new THREE.MeshBasicMaterial({ color: '#fffef0' }));
    glint.position.set(direction * 0.148, 0.095, 0.506);
    group.add(glint);
  }
  const dorsal = new THREE.Mesh(finGeometry([[0,-0.05],[-0.02,0.15],[0,0.43],[0.025,0.15]]), finMaterial);
  dorsal.position.set(0, 0.155, 0.12);
  group.add(dorsal);
  const size = 0.68 + random() * 0.33;
  group.scale.setScalar(size);
  const angle = index / 14 * Math.PI * 2;
  const r = 0.36 + random() * 0.33;
  group.position.set(POND.x + Math.cos(angle) * POND.rx * r, -0.18 - random() * 0.07, POND.z + Math.sin(angle) * POND.rz * r);
  const heading = angle + Math.PI / 2;
  group.rotation.y = heading;
  scene.add(group);
  const shadow = new THREE.Mesh(horizontal(new THREE.PlaneGeometry(0.75, 1.8)), new THREE.MeshBasicMaterial({ color: '#14392d', map: softMap, transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.position.set(group.position.x + 0.15, -0.57, group.position.z + 0.10);
  shadow.scale.setScalar(size);
  scene.add(shadow);
  return { group, tail, fins, shadow, heading, speed: 0.32 + random() * 0.16, panicUntil: 0, escapeHeading: 0, phase: random() * 6.28, size, feeding: false };
}

export function createKoi(scene: THREE.Scene, softMap: THREE.Texture) {
  const random = randomGenerator(337);
  const fish = Array.from({ length: 14 }, (_, index) => makeFish(scene, index, softMap));
  const pellets: Pellet[] = Array.from({ length: 48 }, () => ({ x: 0, z: 0, born: 0, active: false }));
  const pelletMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.044, 8, 6), new THREE.MeshStandardMaterial({ color: '#d4a65b', roughness: 0.86 }), pellets.length);
  pelletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pelletMesh.frustumCulled = false;
  scene.add(pelletMesh);
  const dummy = new THREE.Object3D();
  let pelletIndex = 0;

  function feed(x: number, z: number, time: number): number {
    for (let i = 0; i < 9; i++) {
      const angle = random() * 6.28;
      const r = random() * 0.42;
      const px = x + Math.sin(angle) * r;
      const pz = z + Math.cos(angle) * r;
      if (pondFraction(px, pz) > 0.94) continue;
      const pellet = pellets[pelletIndex];
      pellet.x = px;
      pellet.z = pz;
      pellet.born = time;
      pellet.active = true;
      pelletIndex = (pelletIndex + 1) % pellets.length;
    }
    return pellets.filter((pellet) => pellet.active).length;
  }

  function startle(x: number, z: number, time: number): number {
    let affected = 0;
    for (const koi of fish) {
      const dx = koi.group.position.x - x;
      const dz = koi.group.position.z - z;
      if (Math.hypot(dx, dz) < 4.6) {
        koi.panicUntil = time + 3.0 + random() * 0.7;
        koi.escapeHeading = Math.atan2(dx, dz) + (random() - 0.5) * 0.65;
        affected++;
      }
    }
    return affected;
  }

  function update(time: number, dt: number, reducedMotion: boolean) {
    const movement = reducedMotion ? 0.4 : 1;
    for (let i = 0; i < fish.length; i++) {
      const koi = fish[i];
      const position = koi.group.position;
      let targetHeading = koi.heading + Math.sin(time * 0.33 + koi.phase) * 0.7 * dt;
      let targetSpeed = 0.38 + Math.sin(time * 0.4 + koi.phase) * 0.075;
      let turnRate = 0.8;
      let closest: Pellet | null = null;
      let distance = 60;
      koi.feeding = false;
      for (const pellet of pellets) {
        if (!pellet.active) continue;
        const d = Math.hypot(position.x - pellet.x, position.z - pellet.z);
        if (d < distance) { closest = pellet; distance = d; }
      }
      if (closest && distance < 11 && time >= koi.panicUntil) {
        targetHeading = Math.atan2(closest.x - position.x, closest.z - position.z);
        targetSpeed = distance > 0.7 ? 1.10 : 0.40;
        turnRate = 2.2;
        koi.feeding = true;
        if (distance < 0.34) closest.active = false;
      }
      if (time < koi.panicUntil) {
        targetHeading = koi.escapeHeading;
        targetSpeed = 0.5 + Math.min(koi.panicUntil - time, 2) * 1.5;
        turnRate = 5;
      }
      const boundary = pondFraction(position.x, position.z);
      const nextBoundary = pondFraction(position.x + Math.sin(koi.heading) * 0.8, position.z + Math.cos(koi.heading) * 0.8);
      if (boundary > 0.82 || nextBoundary > 0.88) {
        targetHeading = Math.atan2(POND.x - position.x, POND.z - position.z) + Math.sin(koi.phase + time * 0.2) * 0.6;
        turnRate = 3;
        if (time < koi.panicUntil) koi.escapeHeading = targetHeading;
      }
      const difference = Math.atan2(Math.sin(targetHeading - koi.heading), Math.cos(targetHeading - koi.heading));
      koi.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, difference));
      koi.speed += (targetSpeed - koi.speed) * Math.min(dt * 3.2, 1);
      position.x += Math.sin(koi.heading) * koi.speed * dt * movement;
      position.z += Math.cos(koi.heading) * koi.speed * dt * movement;
      // Steering alone cannot guarantee containment during repeated fast scares.
      // Project a rare overshoot onto a safe inner shore and turn it back inward.
      const afterStep = pondFraction(position.x, position.z);
      if (afterStep > 0.92) {
        position.x = POND.x + (position.x - POND.x) * (0.92 / afterStep);
        position.z = POND.z + (position.z - POND.z) * (0.92 / afterStep);
        koi.heading = Math.atan2(POND.x - position.x, POND.z - position.z);
        koi.escapeHeading = koi.heading;
        koi.speed = Math.min(koi.speed, 1.8);
      }
      position.y = -0.21 + Math.sin(time * 0.8 + koi.phase) * 0.035 + (koi.feeding ? 0.065 : 0);
      koi.group.rotation.y = koi.heading;
      const swim = Math.sin(time * (3.6 + koi.speed * 4) + koi.phase);
      koi.tail.rotation.y = swim * (0.23 + koi.speed * 0.08) * movement;
      koi.group.rotation.z = Math.max(-0.07, Math.min(0.07, difference * 0.08));
      koi.fins[0].rotation.y = swim * 0.13 * movement;
      koi.fins[1].rotation.y = -swim * 0.13 * movement;
      koi.shadow.position.set(position.x + 0.15, -0.57, position.z + 0.1);
      koi.shadow.rotation.z = -koi.heading;
    }
    for (let i = 0; i < pellets.length; i++) {
      const pellet = pellets[i];
      if (pellet.active && time - pellet.born > 18) pellet.active = false;
      dummy.position.set(pellet.x, POND.waterY + 0.028 + Math.sin(time * 2 + i) * 0.012, pellet.z);
      dummy.scale.setScalar(pellet.active ? 1 : 0);
      dummy.updateMatrix();
      pelletMesh.setMatrixAt(i, dummy.matrix);
    }
    pelletMesh.instanceMatrix.needsUpdate = true;
  }

  function debug(time: number, camera: THREE.Camera, width: number, height: number) {
    return {
      fish: fish.map((koi) => {
        const screen = koi.group.position.clone().project(camera);
        return {
          x: Number(koi.group.position.x.toFixed(3)), z: Number(koi.group.position.z.toFixed(3)),
          speed: Number(koi.speed.toFixed(3)),
          state: time < koi.panicUntil ? 'fleeing' : koi.feeding ? 'feeding' : 'swimming',
          screen: { x: Math.round((screen.x + 1) * width / 2), y: Math.round((1 - screen.y) * height / 2) },
        };
      }),
      fleeingCount: fish.filter((koi) => time < koi.panicUntil).length,
      feedingCount: fish.filter((koi) => koi.feeding).length,
      foodCount: pellets.filter((pellet) => pellet.active).length,
    };
  }
  update(0, 0, false);
  return { feed, startle, update, debug };
}
