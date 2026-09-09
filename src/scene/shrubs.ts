import * as THREE from 'three';
import { randomGenerator } from './common';
import { groundHeight } from './vegetation';

/** A small cupped lanceolate leaf, with a raised midrib and curved edges. */
function smallLeaf(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const sections = 2;
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const width = Math.sin(Math.PI * t) * 0.25;
    for (let side = -1; side <= 1; side++) {
      positions.push(side * width, t - 0.35, Math.sin(t * Math.PI) * (side === 0 ? 0.095 : 0.025));
      const shade = side === 0 ? 0.88 : 1;
      colors.push(shade, shade, shade * 0.96);
    }
    if (i < sections) {
      for (let side = 0; side < 2; side++) {
        const a = i * 3 + side, b = a + 3;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type Shrub = { x: number; z: number; height: number; rx: number; rz: number; seed: number };

/** Clipped garden shrubs: dark interior volume under many individually curved leaves. */
export function createGardenShrubs(scene: THREE.Scene): THREE.InstancedMesh[] {
  const planting: Shrub[] = [
    { x: -8.8, z: -0.9, height: 0.88, rx: 1.12, rz: 0.82, seed: 57 },
    { x: -6.7, z: -5.7, height: 0.53, rx: 0.94, rz: 0.70, seed: 134 },
    { x: 8.4, z: 0.1, height: 1.08, rx: 1.12, rz: 0.86, seed: 263 },
    { x: 5.5, z: -6.5, height: 0.74, rx: 1.24, rz: 0.76, seed: 481 },
    { x: -3.8, z: -9.8, height: 0.48, rx: 0.76, rz: 0.64, seed: 619 },
    { x: 2.2, z: -12.9, height: 0.85, rx: 1.13, rz: 0.89, seed: 734 },
    { x: -9.9, z: 2.9, height: 0.64, rx: 0.88, rz: 0.73, seed: 815 },
    { x: 9.8, z: -3.2, height: 0.43, rx: 0.69, rz: 0.54, seed: 917 },
    { x: -10.4, z: -7.5, height: 1.16, rx: 1.30, rz: 0.96, seed: 1028 },
    { x: 6.8, z: -10.4, height: 1.17, rx: 1.81, rz: 1.32, seed: 1163 },
    { x: -8.8, z: -12.6, height: 2.1, rx: 2.7, rz: 2.0, seed: 1201 },
    { x: -5.1, z: -12.1, height: 1.4, rx: 1.9, rz: 1.7, seed: 1402 },
    { x: 5.3, z: -16.6, height: 2.2, rx: 2.9, rz: 2.3, seed: 1537 },
    { x: 9.2, z: -16.1, height: 1.5, rx: 2.0, rz: 1.7, seed: 1558 },
    { x: 0.2, z: -17.5, height: 1.0, rx: 2.0, rz: 1.6, seed: 1685 },
  ];
  const group = new THREE.Group();
  group.name = 'clipped-garden-azaleas';
  scene.add(group);

  const counts = planting.map((shrub) => Math.round(1450 * Math.min(2.2, shrub.rx * shrub.rz)));
  const leaves = new THREE.InstancedMesh(smallLeaf(), new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.84,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.35,
  }), counts.reduce((sum, count) => sum + count, 0));
  leaves.name = 'azalea-individual-leaves';
  leaves.castShadow = leaves.receiveShadow = true;
  group.add(leaves);

  const coreMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    envMapIntensity: 0.18,
  });
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3(), localZ = new THREE.Vector3(0, 0, 1);
  const color = new THREE.Color();
  let leafIndex = 0;

  planting.forEach((shrub, shrubIndex) => {
    const random = randomGenerator(shrub.seed);
    const baseY = groundHeight(shrub.x, shrub.z);
    const phase = random() * Math.PI * 2;
    const radiusAt = (angle: number, y: number) => 1
      + Math.sin(angle * 3 + phase) * 0.045
      + Math.cos(angle * 5 - y * 2 + phase) * 0.028
      + Math.sin(angle * 11 + y * 13) * 0.015;

    // A darker recessed interior prevents a thin shell appearance through gaps.
    // It is deliberately smaller than the foliage envelope and locally uneven.
    const coreGeometry = new THREE.SphereGeometry(1, 40, 24);
    const corePositions = coreGeometry.getAttribute('position');
    const coreColors: number[] = [];
    for (let i = 0; i < corePositions.count; i++) {
      const x = corePositions.getX(i), y = corePositions.getY(i), z = corePositions.getZ(i);
      const angle = Math.atan2(z, x);
      const r = radiusAt(angle, y) * 0.91;
      corePositions.setXYZ(i, x * shrub.rx * r, y * shrub.height * 0.65 + shrub.height * 0.27, z * shrub.rz * r);
      const patch = Math.sin(x * 37 + phase) * Math.cos(z * 31 - y * 19);
      color.setHSL(0.25 + patch * 0.012, 0.55, 0.25 + (y + 1) * 0.025 + patch * 0.012, THREE.SRGBColorSpace);
      coreColors.push(color.r, color.g, color.b);
    }
    coreGeometry.setAttribute('color', new THREE.Float32BufferAttribute(coreColors, 3));
    coreGeometry.computeVertexNormals();
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.name = `azalea-interior-${shrubIndex}`;
    core.position.set(shrub.x, baseY, shrub.z);
    core.castShadow = core.receiveShadow = true;
    group.add(core);

    for (let i = 0; i < counts[shrubIndex]; i++) {
      // Stratified height/azimuth keeps individual leaves dense around the dome.
      const y = -0.32 + 1.32 * (i + random()) / counts[shrubIndex];
      const angle = i * 2.399963 + random() * 0.48;
      const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
      const x = Math.cos(angle) * horizontal, z = Math.sin(angle) * horizontal;
      const r = radiusAt(angle, y) * (0.94 + random() * 0.085);
      normal.set(x / shrub.rx, y / (shrub.height * 0.72) + 0.22, z / shrub.rz).normalize();
      dummy.position.set(
        shrub.x + x * shrub.rx * r,
        baseY + shrub.height * (0.28 + y * 0.72 * r),
        shrub.z + z * shrub.rz * r,
      );
      dummy.quaternion.setFromUnitVectors(localZ, normal);
      dummy.rotateZ(random() * Math.PI * 2);
      dummy.rotateX((random() - 0.5) * 0.8);
      const size = (0.068 + random() * 0.027) * Math.sqrt(Math.max(1, shrub.rx * shrub.rz / 2.2));
      dummy.scale.set(size * (0.90 + random() * 0.25), size, size);
      dummy.updateMatrix();
      leaves.setMatrixAt(leafIndex, dummy.matrix);
      const topLight = Math.max(0, y);
      color.setHSL(0.235 + (random() - 0.5) * 0.033, 0.52 + random() * 0.10, 0.26 + topLight * 0.04 + random() * 0.025, THREE.SRGBColorSpace);
      leaves.setColorAt(leafIndex++, color);
    }
  });
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  leaves.computeBoundingSphere();
  return [leaves];
}
