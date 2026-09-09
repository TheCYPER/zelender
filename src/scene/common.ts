import * as THREE from 'three';

export const POND = {
  x: -0.6, z: 0.8, rx: 7.35, rz: 4.9, waterY: 0.08,
  floorY: -2.45, shoreFloorY: -0.024,
};

export function randomGenerator(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function shoreRadius(angle: number): number {
  return 1 + 0.075 * Math.sin(angle * 3 + 0.5) + 0.045 * Math.cos(angle * 5 - 0.4);
}

export function pondPoint(angle: number, scale = 1): THREE.Vector3 {
  const r = shoreRadius(angle) * scale;
  return new THREE.Vector3(POND.x + Math.cos(angle) * POND.rx * r, 0, POND.z + Math.sin(angle) * POND.rz * r);
}

export function pondShape(scale = 1): THREE.Shape {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < 128; i++) {
    const p = pondPoint((i / 128) * Math.PI * 2, scale);
    points.push(new THREE.Vector2(p.x, -p.z));
  }
  return new THREE.Shape(points);
}

export function pondFraction(x: number, z: number): number {
  const dx = (x - POND.x) / POND.rx;
  const dz = (z - POND.z) / POND.rz;
  return Math.hypot(dx, dz) / shoreRadius(Math.atan2(dz, dx));
}

/** Continuous, asymmetric stone bed: a deep hollow, broad shelves and a soft rim. */
export function pondFloorY(x: number, z: number): number {
  const dx = (x - POND.x) / POND.rx, dz = (z - POND.z) / POND.rz;
  const angle = Math.atan2(dz, dx);
  const radius = Math.hypot(dx, dz) / shoreRadius(angle);
  if (radius >= 1) return POND.shoreFloorY;
  const mound = (cx: number, cz: number, rx: number, rz: number, height: number) =>
    height * Math.exp(-(((x - cx) / rx) ** 2) - ((z - cz) / rz) ** 2);
  const hollow = POND.floorY + Math.sin(x * 0.58 + z * 0.31) * 0.09
    + Math.cos(z * 0.73 - x * 0.19) * 0.07 - mound(-1.9, 0.5, 2.8, 2.0, 0.13);
  const shelfStart = 0.34 + Math.sin(angle * 2 + 0.4) * 0.065 + Math.cos(angle * 5) * 0.025;
  const shelf = THREE.MathUtils.smoothstep(radius, shelfStart, 0.86);
  const shelfY = -1.58 + Math.sin(angle - 0.4) * 0.16 + Math.cos(angle * 3 + 0.7) * 0.09;
  const bank = THREE.MathUtils.smoothstep(radius, 0.80 + Math.sin(angle * 3) * 0.025, 1);
  const shelves = mound(-4.5, 1.5, 1.9, 1.4, 0.26) + mound(3.3, -1.4, 1.8, 1.2, 0.22);
  const bed = THREE.MathUtils.lerp(hollow, shelfY, shelf) + shelves * (1 - shelf * 0.65);
  return THREE.MathUtils.lerp(bed, POND.shoreFloorY, bank);
}

/** One analytic channel shared by sculpted ground and the visible garden stream. */
export function gardenStreamProfile(z: number) {
  const distance = -z - 11;
  return {
    x: 12.8 + Math.sin(distance * 0.095) * 2.5 + distance * 0.10,
    width: 1.25 + Math.sin(distance * 0.08) * 0.15 + Math.max(0, distance) * 0.018,
    strength: THREE.MathUtils.smoothstep(distance, 0, 3) * (1 - THREE.MathUtils.smoothstep(distance, 47, 53)),
  };
}

export function horizontal(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.rotateX(-Math.PI / 2);
}

export function seededStoneGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const positions = geometry.getAttribute('position');
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const noise = Math.sin(x * 12.4 + z * 6.7) * Math.cos(y * 11.5 + x * 4.9);
    const scale = 1 + noise * 0.105 + Math.sin(x * 4 + z * 3) * 0.045;
    positions.setXYZ(i, x * scale, y * scale, z * scale);
    color.setHSL(0.19 + noise * 0.025, 0.055 + Math.max(y, 0) * 0.11, 0.46 + noise * 0.045 + y * 0.055);
    if (y > 0.35) color.lerp(new THREE.Color('#687347'), (y - 0.35) * 0.4);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function noiseTexture(kind: 'stone' | 'moss' | 'wood', seed = 7): THREE.CanvasTexture {
  const random = randomGenerator(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas textures are not supported by this browser.');
  const image = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4;
      const noise = random() * 28;
      const u = x / 512 * Math.PI * 2;
      const v = y / 512 * Math.PI * 2;
      const broad = kind === 'moss'
        ? Math.sin(u) * Math.sin(v) * 9 + Math.sin(u * 3 + v * 2) * 3 + Math.cos(u * 2 - v * 3) * 4
        : Math.sin(x * 0.032) * Math.sin(y * 0.026) * 18 + Math.cos(x * 0.084 + y * 0.07) * 5;
      const grain = Math.sin(x * 0.54 + Math.sin(y * 0.023 + x * 0.04) * 2) * 8;
      const base = kind === 'stone' ? 179 + broad + noise : kind === 'moss' ? 140 + broad * 0.9 + noise * 0.3 : 136 + noise + grain + broad * 0.3;
      image.data[i] = base * (kind === 'moss' ? 0.88 : kind === 'wood' ? 1.06 : 1);
      image.data[i + 1] = base * (kind === 'wood' ? 0.83 : 1);
      image.data[i + 2] = base * (kind === 'moss' ? 0.64 : kind === 'wood' ? 0.58 : 0.95);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  if (kind === 'stone') {
    for (let i = 0; i < 190; i++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(46,49,41,${random() * 0.14})`;
      ctx.lineWidth = random() * 1.1;
      const x = random() * 512;
      const y = random() * 512;
      ctx.moveTo(x, y);
      ctx.lineTo(x + random() * 35, y + random() * 16);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'wood' ? 2 : kind === 'moss' ? 1 : 4, kind === 'wood' ? 0.3 : kind === 'moss' ? 1 : 4);
  texture.anisotropy = 4;
  return texture;
}

export function softTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas textures are not supported by this browser.');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,.7)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,.28)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function branchGeometry(a: THREE.Vector3, b: THREE.Vector3, start: number, end: number): THREE.BufferGeometry {
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(end, start, direction.length(), 7, 1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  return geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
