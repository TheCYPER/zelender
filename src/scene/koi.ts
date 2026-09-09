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
  swimPhase: number;
  wave: { value: number };
  amplitude: { value: number };
  bend: { value: number };
}

interface Pellet {
  x: number;
  y: number;
  z: number;
  originX: number;
  originZ: number;
  initialY: number;
  initialVelocity: number;
  flightDuration: number;
  landedAt: number | null;
  born: number;
  active: boolean;
}

const FOOD_GRAVITY = 9.81;
const FOOD_SURFACE_Y = POND.waterY + 0.028;

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
    const z = -0.70 + t * 1.36;
    // A broad, blunt head and shoulders flow into a narrow tail peduncle.
    // The old sine profile pinched the nose into the same point as the tail.
    const profile = [0.026, 0.061, 0.112, 0.163, 0.205, 0.232, 0.236, 0.205, 0];
    const span = Math.min(7, Math.floor(t * 8));
    const blend = t * 8 - span;
    const radius = span === 7
      ? profile[7] * Math.sqrt(Math.max(0, 1 - blend * blend))
      : THREE.MathUtils.lerp(profile[span], profile[span + 1], blend * blend * (3 - 2 * blend));
    for (let side = 0; side <= segments; side++) {
      const angle = side / segments * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const y = Math.cos(angle) * radius * (Math.cos(angle) > 0 ? 0.76 : 0.64);
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

function makeFish(scene: THREE.Scene, index: number, softMap: THREE.Texture): Fish {
  const random = randomGenerator(index * 71 + 11);
  const group = new THREE.Group();
  group.name = `koi-${index}`;
  group.userData.skipAO = true;
  const variety = [0, 1, 3, 0, 2, 0, 3, 1, 4, 0, 2, 3, 0, 1][index];
  const wave = { value: random() * Math.PI * 2 }, amplitude = { value: 0.04 }, bend = { value: 0 };
  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 });
  bodyMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.koiWave = wave;
    shader.uniforms.koiAmplitude = amplitude;
    shader.uniforms.koiBend = bend;
    shader.vertexShader = 'uniform float koiWave; uniform float koiAmplitude; uniform float koiBend;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float bodyFlex = 1.0 - smoothstep(-0.70, 0.40, position.z);
      transformed.x += (sin(koiWave + position.z * 4.6) * koiAmplitude + koiBend) * bodyFlex * bodyFlex;
    `);
  };
  bodyMaterial.customProgramCacheKey = () => 'koi-body-flex-v1';
  const body = new THREE.Mesh(koiBody(index + 1, variety), bodyMaterial);
  body.name = 'rounded-koi-body';
  group.add(body);
  const finMaterial = new THREE.MeshStandardMaterial({ color: variety === 3 ? '#eac477' : '#ece0c9', transparent: true, opacity: 0.62, side: THREE.DoubleSide, roughness: 0.5, depthWrite: false });
  const tail = new THREE.Group();
  tail.position.set(0, 0, -0.67);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.03, 0);
  tailShape.bezierCurveTo(-0.09, 0.04, -0.28, 0.23, -0.39, 0.20);
  tailShape.quadraticCurveTo(-0.40, 0.09, -0.28, 0);
  tailShape.quadraticCurveTo(-0.40, -0.09, -0.39, -0.20);
  tailShape.bezierCurveTo(-0.28, -0.23, -0.09, -0.04, 0.03, 0);
  const tailMesh = new THREE.Mesh(new THREE.ShapeGeometry(tailShape, 14).rotateY(-Math.PI / 2), finMaterial);
  tailMesh.name = 'vertical-forked-caudal-fin';
  tail.add(tailMesh);
  group.add(tail);
  const fins: THREE.Object3D[] = [];
  for (const direction of [-1, 1]) {
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.bezierCurveTo(direction * 0.13, 0.02, direction * 0.26, -0.09, direction * 0.23, -0.18);
    finShape.bezierCurveTo(direction * 0.17, -0.29, direction * 0.04, -0.24, 0, -0.10);
    finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ShapeGeometry(finShape, 12).rotateX(Math.PI / 2), finMaterial);
    fin.position.set(direction * 0.19, -0.025, 0.21);
    fin.rotation.z = direction * 0.13;
    group.add(fin);
    fins.push(fin);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshStandardMaterial({ color: '#111c18', roughness: 0.2 }));
    eye.position.set(direction * 0.179, 0.064, 0.49);
    group.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 5), new THREE.MeshBasicMaterial({ color: '#fffef0' }));
    glint.position.set(direction * 0.187, 0.077, 0.495);
    group.add(glint);
  }
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.38, 0);
  dorsalShape.quadraticCurveTo(-0.29, 0.12, -0.08, 0.15);
  dorsalShape.quadraticCurveTo(0.06, 0.14, 0.18, 0);
  dorsalShape.closePath();
  const dorsal = new THREE.Mesh(new THREE.ShapeGeometry(dorsalShape, 14).rotateY(-Math.PI / 2), finMaterial);
  dorsal.name = 'vertical-dorsal-fin';
  dorsal.position.set(0, 0.135, 0.03);
  group.add(dorsal);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 5, 16), new THREE.MeshStandardMaterial({ color: '#bcad8d', roughness: 0.6 }));
  mouth.position.set(0, -0.025, 0.649);
  mouth.scale.y = 0.58;
  group.add(mouth);
  const size = 0.68 + random() * 0.33;
  group.scale.setScalar(size);
  const angle = index / 14 * Math.PI * 2;
  const r = 0.36 + random() * 0.33;
  group.position.set(POND.x + Math.cos(angle) * POND.rx * r, -0.18 - random() * 0.07, POND.z + Math.sin(angle) * POND.rz * r);
  const heading = angle + Math.PI / 2;
  group.rotation.y = heading;
  scene.add(group);
  const shadow = new THREE.Mesh(horizontal(new THREE.PlaneGeometry(0.75, 1.8)), new THREE.MeshBasicMaterial({ color: '#14392d', map: softMap, transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.name = `koi-shadow-${index}`;
  shadow.userData.skipAO = true;
  shadow.position.set(group.position.x + 0.15, -0.57, group.position.z + 0.10);
  shadow.scale.setScalar(size);
  scene.add(shadow);
  return { group, tail, fins, shadow, heading, speed: 0.32 + random() * 0.16, panicUntil: 0, escapeHeading: 0, phase: random() * 6.28, size, feeding: false, swimPhase: wave.value, wave, amplitude, bend };
}

/** Closest points of two body-axis segments; radii turn these into capsules. */
function bodyContact(a: Fish, b: Fish) {
  const ah = a.size * 0.45, bh = b.size * 0.45;
  const ax = Math.sin(a.heading) * ah, az = Math.cos(a.heading) * ah;
  const bx = Math.sin(b.heading) * bh, bz = Math.cos(b.heading) * bh;
  const ap = a.group.position, bp = b.group.position;
  const a0x = ap.x - ax, a0z = ap.z - az, b0x = bp.x - bx, b0z = bp.z - bz;
  let best = Infinity, dx = 0, dz = 0;
  const candidate = (x: number, z: number, sx: number, sz: number, ux: number, uz: number, flip: number) => {
    const t = THREE.MathUtils.clamp(((x - sx) * ux + (z - sz) * uz) / (ux * ux + uz * uz), 0, 1);
    const cx = (x - sx - ux * t) * flip, cz = (z - sz - uz * t) * flip;
    const d = cx * cx + cz * cz;
    if (d < best) { best = d; dx = cx; dz = cz; }
  };
  candidate(a0x, a0z, b0x, b0z, 2 * bx, 2 * bz, 1);
  candidate(ap.x + ax, ap.z + az, b0x, b0z, 2 * bx, 2 * bz, 1);
  candidate(b0x, b0z, a0x, a0z, 2 * ax, 2 * az, -1);
  candidate(bp.x + bx, bp.z + bz, a0x, a0z, 2 * ax, 2 * az, -1);
  const cross = ax * bz - az * bx;
  if (Math.abs(cross) > 1e-8) {
    const wx = b0x - a0x, wz = b0z - a0z;
    const s = (wx * bz - wz * bx) / (2 * cross), t = (wx * az - wz * ax) / (2 * cross);
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) { best = 0; dx = ap.x - bp.x; dz = ap.z - bp.z; }
  }
  const distance = Math.sqrt(best);
  const normalLength = Math.hypot(dx, dz);
  return { distance, nx: normalLength > 1e-8 ? dx / normalLength : Math.cos(a.heading), nz: normalLength > 1e-8 ? dz / normalLength : -Math.sin(a.heading), radius: (a.size + b.size) * 0.255 };
}

export function createKoi(scene: THREE.Scene, softMap: THREE.Texture, onFoodSplash?: (x: number, z: number) => void) {
  const random = randomGenerator(337);
  const fish = Array.from({ length: 14 }, (_, index) => makeFish(scene, index, softMap));
  const pellets: Pellet[] = Array.from({ length: 48 }, () => ({
    x: 0, y: 0, z: 0, originX: 0, originZ: 0, initialY: 0,
    initialVelocity: 0, flightDuration: 0, landedAt: null, born: 0, active: false,
  }));
  const pelletMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.044, 8, 6), new THREE.MeshStandardMaterial({ color: '#d4a65b', roughness: 0.86 }), pellets.length);
  pelletMesh.name = 'falling-fish-food';
  pelletMesh.userData.skipAO = true;
  pelletMesh.castShadow = true;
  pelletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pelletMesh.frustumCulled = false;
  scene.add(pelletMesh);
  const dummy = new THREE.Object3D();
  let pelletIndex = 0;

  function feed(x: number, z: number, time: number): number {
    for (let i = 0; i < 9; i++) {
      const angle = random() * 6.28;
      const r = random() * 0.42;
      let px = x + Math.sin(angle) * r;
      let pz = z + Math.cos(angle) * r;
      // A valid click near the bank must still throw food. Keep scattered
      // pellets inside the same safe shore used by their subsequent drift.
      const fraction = pondFraction(px, pz);
      if (fraction > 0.94) {
        px = POND.x + (px - POND.x) * 0.94 / fraction;
        pz = POND.z + (pz - POND.z) * 0.94 / fraction;
      }
      const pellet = pellets[pelletIndex];
      pellet.x = px;
      pellet.z = pz;
      pellet.originX = px;
      pellet.originZ = pz;
      pellet.initialY = 2 + random();
      pellet.y = pellet.initialY;
      pellet.initialVelocity = -0.3 - random() * 0.5;
      pellet.flightDuration = (pellet.initialVelocity + Math.sqrt(
        pellet.initialVelocity ** 2 + 2 * FOOD_GRAVITY * (pellet.initialY - FOOD_SURFACE_Y),
      )) / FOOD_GRAVITY;
      pellet.landedAt = null;
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
    // Resolve food before fish steering: airborne food cannot attract fish or
    // disappear into a mouth, and every water contact emits exactly one splash.
    for (let i = 0; i < pellets.length; i++) {
      const pellet = pellets[i];
      if (!pellet.active) continue;
      const age = Math.max(0, time - pellet.born);
      if (pellet.landedAt === null) {
        pellet.y = pellet.initialY + pellet.initialVelocity * age - 0.5 * FOOD_GRAVITY * age * age;
        if (age >= pellet.flightDuration) {
          pellet.landedAt = pellet.born + pellet.flightDuration;
          pellet.y = FOOD_SURFACE_Y;
          onFoodSplash?.(pellet.x, pellet.z);
        }
      }
      if (age > 18) {
        pellet.active = false;
        continue;
      }
      if (pellet.landedAt !== null) {
        const floatingAge = Math.max(0, time - pellet.landedAt);
        pellet.y = FOOD_SURFACE_Y + Math.sin(time * 2 + i) * 0.008 * Math.min(floatingAge * 3, 1);
        pellet.x = pellet.originX + (Math.sin(floatingAge * 0.45 + i) - Math.sin(i)) * 0.035 + floatingAge * 0.008;
        pellet.z = pellet.originZ + (Math.cos(floatingAge * 0.38 + i) - Math.cos(i)) * 0.035;
        const fraction = pondFraction(pellet.x, pellet.z);
        if (fraction > 0.94) {
          pellet.x = POND.x + (pellet.x - POND.x) * 0.94 / fraction;
          pellet.z = POND.z + (pellet.z - POND.z) * 0.94 / fraction;
        }
      }
    }
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
        if (!pellet.active || pellet.landedAt === null) continue;
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
      let avoidX = 0, avoidZ = 0, pressure = 0;
      for (const other of fish) {
        if (other === koi || position.distanceToSquared(other.group.position) > 4) continue;
        const contact = bodyContact(koi, other);
        const urgency = THREE.MathUtils.clamp((contact.radius + 0.48 - contact.distance) / 0.48, 0, 1);
        avoidX += contact.nx * urgency;
        avoidZ += contact.nz * urgency;
        pressure += urgency;
      }
      if (pressure > 0) {
        // A slight consistent starboard preference breaks head-on deadlocks.
        targetHeading = Math.atan2(Math.sin(targetHeading) + avoidX * 1.25 + Math.cos(koi.heading) * pressure * 0.18,
          Math.cos(targetHeading) + avoidZ * 1.25 - Math.sin(koi.heading) * pressure * 0.18);
        targetSpeed *= 1 - Math.min(pressure * 0.16, 0.48);
        turnRate = Math.max(turnRate, 2.5);
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
      koi.swimPhase += dt * (3.6 + koi.speed * 4);
      koi.wave.value = koi.swimPhase;
      koi.amplitude.value = (0.025 + Math.min(koi.speed, 2) * 0.026) * movement;
      koi.bend.value = Math.max(-0.07, Math.min(0.07, difference * 0.035));
      const swim = Math.sin(koi.swimPhase - 3.08);
      koi.tail.position.x = swim * koi.amplitude.value + koi.bend.value;
      koi.tail.rotation.y = swim * (0.23 + koi.speed * 0.08) * movement;
      koi.group.rotation.z = Math.max(-0.07, Math.min(0.07, difference * 0.08));
      koi.fins[0].rotation.y = swim * 0.13 * movement;
      koi.fins[1].rotation.y = -swim * 0.13 * movement;
      koi.shadow.position.set(position.x + 0.15, -0.57, position.z + 0.1);
      koi.shadow.rotation.z = -koi.heading;
    }
    // Positional capsule constraints provide a final guarantee when urgent
    // feeding/scares turn fish faster than steering can keep them apart.
    for (let iteration = 0; iteration < 12; iteration++) {
      let largestOverlap = 0;
      for (let a = 0; a < fish.length; a++) for (let b = a + 1; b < fish.length; b++) {
        const contact = bodyContact(fish[a], fish[b]);
        const overlap = contact.radius - contact.distance;
        if (overlap <= 0) continue;
        largestOverlap = Math.max(largestOverlap, overlap);
        const push = overlap * 0.5 + 0.0002;
        fish[a].group.position.x += contact.nx * push;
        fish[a].group.position.z += contact.nz * push;
        fish[b].group.position.x -= contact.nx * push;
        fish[b].group.position.z -= contact.nz * push;
      }
      for (const koi of fish) {
        const position = koi.group.position;
        const fraction = pondFraction(position.x, position.z);
        // Leave space for the head/tail, not only the centre point, at the bank.
        if (fraction > 0.86) {
          position.x = POND.x + (position.x - POND.x) * 0.86 / fraction;
          position.z = POND.z + (position.z - POND.z) * 0.86 / fraction;
        }
      }
      if (largestOverlap < 0.0005) break;
    }
    for (const koi of fish) koi.shadow.position.set(koi.group.position.x + 0.15, -0.57, koi.group.position.z + 0.1);
    for (let i = 0; i < pellets.length; i++) {
      const pellet = pellets[i];
      dummy.position.set(pellet.x, pellet.y, pellet.z);
      dummy.rotation.set(i + time * 0.7, i * 2 + time, i * 0.3);
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
          heading: koi.heading,
          size: koi.size,
          collisionRadius: koi.size * 0.255,
          collisionHalfLength: koi.size * 0.45,
          state: time < koi.panicUntil ? 'fleeing' : koi.feeding ? 'feeding' : 'swimming',
          screen: { x: Math.round((screen.x + 1) * width / 2), y: Math.round((1 - screen.y) * height / 2) },
        };
      }),
      fleeingCount: fish.filter((koi) => time < koi.panicUntil).length,
      feedingCount: fish.filter((koi) => koi.feeding).length,
      foodCount: pellets.filter((pellet) => pellet.active).length,
      airborneFoodCount: pellets.filter((pellet) => pellet.active && pellet.landedAt === null).length,
      foodPositions: pellets.filter((pellet) => pellet.active).map((pellet) => {
        const screen = new THREE.Vector3(pellet.x, pellet.y, pellet.z).project(camera);
        return {
          x: pellet.x, y: pellet.y, z: pellet.z,
          airborne: pellet.landedAt === null,
          screen: { x: Math.round((screen.x + 1) * width / 2), y: Math.round((1 - screen.y) * height / 2) },
        };
      }),
    };
  }
  update(0, 0, false);
  return { feed, startle, update, debug };
}
