import * as THREE from 'three';
import { batchStaticMeshes } from './batching';
import { gardenStreamProfile, randomGenerator } from './common';
import type { GardenMaterials } from './materials';
import { groundHeight } from './vegetation';

const PAVILION = { x: -8, z: -29, halfWidth: 3.55, halfDepth: 2.80 };

/** Keep planting away from the open pavilion, access treads and recessed water. */
export function countrysideFootprint(x: number, z: number, padding = 0): boolean {
  if (Math.abs(x - PAVILION.x) < PAVILION.halfWidth + padding && Math.abs(z - PAVILION.z) < PAVILION.halfDepth + padding) return true;
  const stream = gardenStreamProfile(z);
  return stream.strength > 0.05 && Math.abs(x - stream.x) < stream.width * 1.24 + padding;
}

function weatheredSlab(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(1, 1.08, 1, 7, 1);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const irregular = 1 + Math.sin(x * 4.1 + z * 3.6 + seed) * 0.06;
    positions.setXYZ(i, x * irregular, y + (x * 0.04 + z * 0.025), z * irregular);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A low hip roof with a short ridge, shallow curved pitches and lifted eaves. */
function pavilionRoof(): THREE.BufferGeometry {
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const columns = 40, rows = 32;
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const x = (col / columns * 2 - 1) * PAVILION.halfWidth;
    const z = (row / rows * 2 - 1) * PAVILION.halfDepth;
    const pitch = Math.min(1, Math.max(Math.abs(z) / PAVILION.halfDepth, Math.max(0, Math.abs(x) - 0.75) / (PAVILION.halfWidth - 0.75)));
    const y = 3.48 + 1.44 * Math.pow(1 - pitch, 1.55) + 0.16 * Math.pow(pitch, 10);
    vertices.push(x, y, z);
    uvs.push(x * 0.42, z * 0.42);
    if (row < rows && col < columns) {
      const a = row * (columns + 1) + col, b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Distant architecture and a restrained, stone-lined stream, all in world space. */
export function createCountryside(scene: THREE.Scene, materials: Pick<GardenMaterials, 'stone' | 'darkWood'>) {
  const group = new THREE.Group();
  group.name = 'countryside-pavilion-and-stream';
  scene.add(group);
  const random = randomGenerator(16384), dummy = new THREE.Object3D(), color = new THREE.Color();
  const timber = materials.darkWood.clone();
  timber.color.set('#756657');
  timber.roughness = 0.93;
  const roofMaterial = materials.stone.clone();
  roofMaterial.color.setRGB(1.6, 1.85, 1.87);
  roofMaterial.roughness = 0.92;
  roofMaterial.side = THREE.DoubleSide;
  roofMaterial.onBeforeCompile = materials.stone.onBeforeCompile;
  roofMaterial.customProgramCacheKey = materials.stone.customProgramCacheKey.bind(materials.stone);

  const pavilion = new THREE.Group();
  pavilion.name = 'open-garden-pavilion';
  const foundationHeights = [-2.53, 2.53].flatMap(x => [-2.08, 2.08].map(z => groundHeight(PAVILION.x + x, PAVILION.z + z)));
  pavilion.position.set(PAVILION.x, Math.max(...foundationHeights) - 0.12, PAVILION.z);
  group.add(pavilion);
  const box = (width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material = timber) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    pavilion.add(mesh);
    return mesh;
  };
  // A low stone plinth seats the floor on the uneven mound; all sides stay open.
  const foundationBottom = Math.min(...foundationHeights) - pavilion.position.y - 0.15;
  box(5.05, 0.30 - foundationBottom, 4.15, 0, (foundationBottom + 0.30) / 2, 0, materials.stone);
  for (let i = 0; i < 14; i++) box(0.34, 0.12, 3.9, -2.29 + i * 0.352, 0.37, 0);
  for (const x of [-2.18, 2.18]) for (const z of [-1.62, 1.62]) {
    const baseY = groundHeight(PAVILION.x + x, PAVILION.z + z) - pavilion.position.y;
    box(0.43, Math.max(0.28, 0.46 - baseY), 0.43, x, (baseY + 0.46) / 2, z, materials.stone);
    box(0.20, 2.84, 0.20, x, 1.87, z);
    box(0.36, 0.13, 0.33, x, 3.28, z);
  }
  for (const z of [-1.62, 1.62]) box(4.85, 0.22, 0.21, 0, 3.35, z);
  for (const x of [-2.18, 2.18]) box(0.21, 0.22, 4.02, x, 3.35, 0);
  // Open benches indicate a human-scaled place to pause, without railing walls.
  for (const x of [-1.76, 1.76]) {
    box(0.48, 0.11, 2.75, x, 0.96, -0.08);
    for (const z of [-1.15, 0.99]) box(0.16, 0.51, 0.18, x, 0.67, z);
  }
  const roof = new THREE.Mesh(pavilionRoof(), roofMaterial);
  roof.name = 'curved-hip-roof';
  roof.castShadow = roof.receiveShadow = true;
  pavilion.add(roof);
  box(1.78, 0.14, 0.18, 0, 4.93, 0, roofMaterial);
  // Fine transverse seams break the large roof plane at the viewing distance.
  for (const side of [-1, 1]) for (let seam = 0; seam < 14; seam++) {
    const t = (seam + 0.5) / 14, z = side * t * PAVILION.halfDepth;
    const y = 3.48 + 1.44 * Math.pow(1 - t, 1.55) + 0.16 * Math.pow(t, 10) + 0.017;
    const halfWidth = 0.75 + (PAVILION.halfWidth - 0.75) * t;
    box(halfWidth * 2, 0.030, 0.045, 0, y, z, roofMaterial);
  }
  // Stone stairs reach the actual sloping approach rather than floating over it.
  const lowestStep = groundHeight(PAVILION.x - 0.1, PAVILION.z + 4.58) - pavilion.position.y + 0.11;
  for (let i = 0; i < 6; i++) {
    const z = 2.28 + i * 0.46;
    const bottom = groundHeight(PAVILION.x - 0.1, PAVILION.z + z) - pavilion.position.y - 0.08;
    const top = Math.max(bottom + 0.13, THREE.MathUtils.lerp(0.34, lowestStep, i / 5));
    box(1.65 + i * 0.025, top - bottom, 0.52, -0.1, (top + bottom) / 2, z, materials.stone);
  }
  batchStaticMeshes(pavilion, true);

  const slabs = new THREE.InstancedMesh(weatheredSlab(31), materials.stone, 30);
  slabs.name = 'scattered-midground-stepping-stones';
  for (let i = 0; i < slabs.count; i++) {
    let x: number, z: number, yaw: number;
    if (i < 12) {
      const t = i / 11;
      x = -8.1 + Math.sin(t * 4.5) * 1.0;
      z = -25.6 + t * 9.5;
      yaw = -0.15 + t * 0.3;
    } else if (i < 23) {
      const t = (i - 12) / 10;
      x = 4 + t * 8.5;
      z = -21.7 + Math.sin(t * 4.1) * 1.65;
      yaw = 0.9 + t * 0.6;
    } else {
      const t = (i - 23) / 6;
      x = -12.9 - t * 4.2;
      z = -39.2 - t * 5.5;
      yaw = 0.65;
    }
    dummy.position.set(x, groundHeight(x, z) + 0.07, z);
    dummy.rotation.set((random() - 0.5) * 0.035, yaw + random() * 0.38, (random() - 0.5) * 0.035);
    dummy.scale.set(0.42 + random() * 0.16, 0.11 + random() * 0.06, 0.30 + random() * 0.11);
    dummy.updateMatrix();
    slabs.setMatrixAt(i, dummy.matrix);
    color.setRGB(0.78 + random() * 0.16, 0.85 + random() * 0.12, 0.87 + random() * 0.11);
    slabs.setColorAt(i, color);
  }
  slabs.castShadow = slabs.receiveShadow = true;
  slabs.computeBoundingSphere();
  group.add(slabs);

  const time = { value: 0 };
  const riverMaterial = new THREE.MeshStandardMaterial({
    color: '#315349', roughness: 0.26, metalness: 0.05,
    transparent: true, opacity: 0.89, depthWrite: false, envMapIntensity: 0.95,
  });
  riverMaterial.onBeforeCompile = shader => {
    shader.uniforms.streamTime = time;
    shader.vertexShader = 'varying vec3 vStreamWorld;\n' + shader.vertexShader;
    shader.vertexShader = 'uniform float streamTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(position.z*4.7-streamTime*1.4+position.x)*0.009;');
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvStreamWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = 'uniform float streamTime; varying vec3 vStreamWorld;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      float flow = sin(vStreamWorld.z*8.0 + streamTime*1.5 + sin(vStreamWorld.x*4.3));
      normal = normalize(normal + vec3(flow*0.027,0.0,cos(vStreamWorld.x*7.0-streamTime)*0.018));
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float ripple = pow(max(0.0,sin(vStreamWorld.z*10.0+streamTime*2.4+sin(vStreamWorld.x*8.0)*0.7)),18.0);
      diffuseColor.rgb += vec3(0.16,0.21,0.18)*ripple*0.16;
    `);
  };
  riverMaterial.customProgramCacheKey = () => 'recessed-garden-stream-v1';
  const vertices: number[] = [], indices: number[] = [];
  const rows = 192, columns = 6;
  for (let row = 0; row <= rows; row++) {
    const z = -12.5 - row / rows * 49.7, profile = gardenStreamProfile(z);
    const centerY = groundHeight(profile.x, z) + 0.24 * profile.strength;
    for (let col = 0; col <= columns; col++) {
      const across = col / columns * 2 - 1;
      const x = profile.x + across * profile.width * 0.75;
      vertices.push(x, centerY, z);
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col, b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const riverGeometry = new THREE.BufferGeometry();
  riverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  riverGeometry.setIndex(indices);
  riverGeometry.computeVertexNormals();
  const river = new THREE.Mesh(riverGeometry, riverMaterial);
  river.name = 'recessed-flowing-garden-stream';
  river.receiveShadow = true;
  group.add(river);

  const bankGeometry = new THREE.SphereGeometry(1, 10, 7);
  const bankPositions = bankGeometry.getAttribute('position');
  for (let i = 0; i < bankPositions.count; i++) {
    const x = bankPositions.getX(i), y = bankPositions.getY(i), z = bankPositions.getZ(i);
    const rough = 1 + Math.sin(x * 6 + z * 5) * Math.cos(y * 8) * 0.075;
    bankPositions.setXYZ(i, x * rough, y * rough, z * rough);
  }
  bankGeometry.computeVertexNormals();
  const banks = new THREE.InstancedMesh(bankGeometry, materials.stone, 184);
  banks.name = 'buried-stream-bank-stones';
  for (let i = 0; i < banks.count; i++) {
    const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    const z = -12.6 - row / 91 * 49.3 + (random() - 0.5) * 0.24;
    const profile = gardenStreamProfile(z);
    const x = profile.x + side * profile.width * (0.84 + random() * 0.22);
    dummy.position.set(x, groundHeight(x, z) + 0.08, z);
    dummy.rotation.set(random() * 0.1, random() * Math.PI * 2, random() * 0.1);
    const size = 0.32 + random() * 0.26;
    dummy.scale.set(size * (1.1 + random() * 0.25), size * (0.48 + random() * 0.20), size);
    dummy.updateMatrix();
    banks.setMatrixAt(i, dummy.matrix);
    const shade = 0.65 + random() * 0.26;
    color.setRGB(shade * 0.97, shade, shade * 0.98);
    banks.setColorAt(i, color);
  }
  banks.castShadow = banks.receiveShadow = true;
  banks.computeBoundingSphere();
  group.add(banks);

  return { update(elapsed: number, reducedMotion: boolean) { time.value = reducedMotion ? 0 : elapsed; } };
}
