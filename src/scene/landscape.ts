import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { horizontal, noiseTexture, POND, pondFraction, pondPoint, randomGenerator } from './common';
import { createGardenMaterials } from './materials';
import { createTeaCorner } from './tea';
import { createGardenTrees, groundHeight } from './vegetation';
import { createGardenShrubs } from './shrubs';

export interface Landscape {
  room: THREE.Group;
  snow: THREE.Group;
  foliage: THREE.InstancedMesh[];
  lanternLight: THREE.PointLight;
  chimeTarget: THREE.Group;
  ringChime(): void;
  dispose(): void;
  update(time: number, reducedMotion: boolean): void;
}

function riverStone(seed: number, segments = 28, rings = 18): THREE.BufferGeometry {
  // Indexed spheres retain smooth shared normals after deformation.
  const geometry = new THREE.SphereGeometry(1, segments, rings);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  const mossTint = new THREE.Color('#768165');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const large = Math.sin(x * 3.3 + seed) * Math.cos(z * 2.8 + y * 1.7) * 0.10;
    const fine = Math.sin(x * 8.7 + z * 5.2 + seed) * Math.cos(y * 6.7 - z * 2.1) * 0.019;
    const radius = 1 + large + fine;
    const squareness = seed === 24 ? 0.69 : seed === 56 ? 0.82 : 0.97;
    const weathered = (axis: number) => Math.sign(axis) * Math.pow(Math.abs(axis), squareness);
    positions.setXYZ(i, weathered(x) * radius, weathered(y) * radius * (y < -0.45 ? 0.85 : 1), weathered(z) * radius);
    color.setRGB(0.95 + large * 0.22, 0.96 + large * 0.18, 0.94 + large * 0.12);
    if (y > 0.35) color.lerp(mossTint, (y - 0.35) * 0.30);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function terrainGeometry(): THREE.BufferGeometry {
  const angularSegments = 160, bands = 60;
  const vertices: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new THREE.Color(), forestColor = new THREE.Color('#8f8c78');
  for (let band = 0; band <= bands; band++) {
    const spread = Math.pow(band / bands, 1.8);
    for (let i = 0; i <= angularSegments; i++) {
      const angle = i / angularSegments * Math.PI * 2;
      const shore = pondPoint(angle, 1.004);
      const x = THREE.MathUtils.lerp(shore.x, Math.cos(angle) * 155, spread);
      const z = THREE.MathUtils.lerp(shore.z, Math.sin(angle) * 155, spread);
      vertices.push(x, groundHeight(x, z), z);
      uvs.push(x / 5, z / 5);
      const patch = Math.sin(x * 0.51 + z * 0.19) * Math.cos(z * 0.39 - x * 0.17);
      const woods = THREE.MathUtils.smoothstep(-z, 8, 30);
      color.set('#eff7d1').lerp(forestColor, woods * 0.27 + Math.max(0, patch) * 0.14);
      colors.push(color.r, color.g, color.b);
      if (band < bands && i < angularSegments) {
        const a = band * (angularSegments + 1) + i, b = a + angularSegments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addUnderstory(scene: THREE.Scene): void {
  const random = randomGenerator(8351), dummy = new THREE.Object3D(), color = new THREE.Color();
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, width = (1 - t) * 0.017;
    for (const side of [-1, 1]) {
      positions.push(side * width, t * 0.70, Math.pow(t, 2) * 0.25);
      uvs.push(side === -1 ? 0 : 1, t);
    }
    if (i < 6) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bladeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bladeGeometry.setIndex(indices);
  bladeGeometry.computeVertexNormals();
  const grass = new THREE.InstancedMesh(bladeGeometry, new THREE.MeshStandardMaterial({ color: '#8c9463', roughness: 0.91, side: THREE.DoubleSide }), 1200);
  for (let i = 0; i < grass.count; i++) {
    const patch = Math.floor(random() * 13) / 13 * Math.PI * 2;
    const p = pondPoint(patch + (random() - 0.5) * 0.16, 1.12 + random() * 0.44);
    if (p.z > 7.4) p.z -= 1.5;
    dummy.position.set(p.x, groundHeight(p.x, p.z) - 0.025, p.z);
    dummy.rotation.set((random() - 0.5) * 0.19, random() * Math.PI * 2, (random() - 0.5) * 0.22);
    dummy.scale.setScalar(0.32 + random() * 0.69);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.20 + random() * 0.04, 0.21 + random() * 0.10, 0.40 + random() * 0.17);
    grass.setColorAt(i, color);
  }
  grass.receiveShadow = true;
  grass.name = 'shore-sedges';
  scene.add(grass);
  // Feathered fronds form actual three-dimensional fern rosettes in the shade.
  const frondParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 12, width = Math.sin(Math.PI * (t * 0.86 + 0.12)) * 0.18 * (1 - t * 0.3);
    for (const side of [-1, 1]) {
      const leaf = new THREE.PlaneGeometry(width, 0.055 * (1 - t * 0.55), 2, 1);
      leaf.rotateX(-Math.PI / 2);
      leaf.rotateY(side * (0.5 + t * 0.6));
      leaf.translate(side * width * 0.46, Math.sin(t * Math.PI * 0.85) * 0.30, t * 0.69);
      frondParts.push(leaf);
    }
  }
  const frond = mergeGeometries(frondParts);
  frondParts.forEach((geometry) => geometry.dispose());
  if (!frond) return;
  const ferns = new THREE.InstancedMesh(frond, new THREE.MeshStandardMaterial({ color: '#6c8453', roughness: 0.9, side: THREE.DoubleSide }), 154);
  for (let i = 0; i < ferns.count; i++) {
    const r = randomGenerator(Math.floor(i / 7) * 41 + 911), angle = r() * Math.PI * 2;
    const p = pondPoint(angle, 1.24 + r() * 1.25);
    if (p.z > 7.4) p.z = -5.9 - r() * 8;
    dummy.position.set(p.x, groundHeight(p.x, p.z), p.z);
    dummy.rotation.set(0, i % 7 / 7 * Math.PI * 2 + r(), 0);
    dummy.scale.setScalar(0.55 + random() * 0.8);
    dummy.updateMatrix();
    ferns.setMatrixAt(i, dummy.matrix);
    color.setRGB(0.60 + random() * 0.3, 0.72 + random() * 0.25, 0.54 + random() * 0.2);
    ferns.setColorAt(i, color);
  }
  ferns.receiveShadow = true;
  scene.add(ferns);
}
function addLantern(scene: THREE.Scene, stone: THREE.Material): THREE.PointLight {
  const group = new THREE.Group();
  group.position.set(6.4, 0.18, -3.5);
  const part = (geometry: THREE.BufferGeometry, y: number, rotation = 0) => {
    const mesh = new THREE.Mesh(geometry, stone);
    mesh.position.y = y;
    mesh.rotation.y = rotation;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  part(new THREE.CylinderGeometry(0.59, 0.75, 0.18, 6), 0.02);
  part(new THREE.CylinderGeometry(0.27, 0.39, 1.0, 8), 0.61);
  part(new THREE.CylinderGeometry(0.63, 0.35, 0.28, 6), 1.19);
  part(new THREE.CylinderGeometry(0.47, 0.57, 0.19, 4), 1.4, Math.PI / 4);
  for (const x of [-0.27, 0.27]) for (const z of [-0.27, 0.27]) {
    const post = part(new THREE.BoxGeometry(0.13, 0.55, 0.13), 1.72);
    post.position.x = x;
    post.position.z = z;
  }
  const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.38, 8), new THREE.MeshBasicMaterial({ color: '#ffe6a1' }));
  flame.position.y = 1.69;
  group.add(flame);
  part(new THREE.CylinderGeometry(0.24, 0.94, 0.46, 4), 2.13, Math.PI / 4);
  part(new THREE.SphereGeometry(0.15, 12, 8), 2.46);
  const light = new THREE.PointLight('#ffc774', 2.7, 5, 2);
  light.position.set(0, 1.75, 0);
  group.add(light);
  scene.add(group);
  return light;
}

export function createLandscape(scene: THREE.Scene): Landscape {
  const random = randomGenerator(112);
  const { stone, rock: rockMaterial, wood, darkWood, bark, moss } = createGardenMaterials();
  // Raise the charcoal scan into weathered garden-granite values. The original
  // normal and roughness scans still supply crevices and mineral variation.
  stone.color.setRGB(4.4, 4.8, 5.0);
  rockMaterial.color.copy(stone.color);
  // Box top UV V runs along the veranda's long Z axis. Sample one board across
  // U, with uninterrupted lengthwise grain instead of crosswise stretching.
  for (const map of [wood.map, wood.normalMap, wood.roughnessMap]) {
    if (!map) continue;
    map.rotation = 0;
    map.repeat.set(0.075, 3.0);
    map.offset.set(0.19, 0);
  }
  const snow = new THREE.Group();
  snow.visible = false;
  scene.add(snow);
  const terrain = terrainGeometry(), groundMaterial = moss.clone();
  groundMaterial.color.set('#dce9c4');
  groundMaterial.vertexColors = true;
  const ground = new THREE.Mesh(terrain, groundMaterial);
  ground.name = 'continuous-woodland-ground';
  ground.receiveShadow = true;
  scene.add(ground);
  const snowTerrain = new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ color: '#e1e6df', roughness: 1 }));
  snowTerrain.position.y = 0.038;
  snowTerrain.receiveShadow = true;
  snow.add(snowTerrain);
  const rockGeometries = [riverStone(7), riverStone(24), riverStone(56)];
  const shoreGeometries = [riverStone(7, 16, 10), riverStone(24, 16, 10), riverStone(56, 16, 10)];
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  // Uneven partly buried stones avoid a repeated bead-necklace shoreline.
  for (let kind = 0; kind < 3; kind++) {
    const edge = new THREE.InstancedMesh(shoreGeometries[kind], rockMaterial, 34);
    for (let i = 0; i < edge.count; i++) {
      const angle = (i * 3 + kind) / 102 * Math.PI * 2 + (random() - 0.5) * 0.027;
      const p = pondPoint(angle, 1.012 + random() * 0.033);
      const s = 0.22 + random() * 0.28 + (i % 9 === 0 ? 0.19 : 0);
      dummy.position.set(p.x, -0.012 + s * 0.13, p.z);
      dummy.rotation.set((random() - 0.5) * 0.4, random() * Math.PI * 2, (random() - 0.5) * 0.35);
      dummy.scale.set(s * (1.1 + random() * 0.7), s * (0.46 + random() * 0.48), s);
      dummy.updateMatrix();
      edge.setMatrixAt(i, dummy.matrix);
      const shade = 0.90 + random() * 0.10;
      color.setRGB(shade, shade, shade * 0.98);
      edge.setColorAt(i, color);
    }
    edge.castShadow = edge.receiveShadow = true;
    scene.add(edge);
  }
  const boulders = [[-7.7,-3.4,1.18],[-8.5,-2.1,0.73],[-6.6,-4.3,0.78],[5.0,-3.7,1.18],[6.0,-4.6,0.81],[7.0,0.7,0.84],[7.5,1.7,0.49],[-7.5,3.4,0.65],[-8.4,4.0,0.98],[3.6,5.0,0.55],[-4.5,-6.0,0.93],[-3.5,-6.5,0.60],[-10.6,-9.4,1.9],[-9.4,-10.1,1.15],[10.4,-11.8,1.65],[11.7,-12.4,1.1],[-2,-17.1,1.15],[4,-21.3,1.8],[-15,-21,2.2]];
  boulders.forEach(([x, z, s], i) => {
    const rock = new THREE.Mesh(rockGeometries[i % 3], rockMaterial);
    rock.position.set(x, groundHeight(x, z) + s * 0.25, z);
    rock.scale.set(s * 1.2, s * (0.74 + random() * 0.25), s);
    rock.rotation.set(random() * 0.24, random() * Math.PI * 2, random() * 0.2);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    const cap = new THREE.Mesh(rockGeometries[i % 3], new THREE.MeshStandardMaterial({ color: '#e5e8df', roughness: 1 }));
    cap.position.set(x, rock.position.y + s * 0.70, z);
    cap.rotation.copy(rock.rotation);
    cap.scale.set(s * 0.82, s * 0.15, s * 0.72);
    snow.add(cap);
  });
  const pebbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), stone, 850);
  for (let i = 0; i < pebbles.count; i++) {
    const p = pondPoint(random() * Math.PI * 2, 1.022 + random() * 0.15);
    dummy.position.set(p.x, groundHeight(p.x, p.z) + 0.035, p.z);
    dummy.rotation.set(random(), random() * Math.PI * 2, random());
    const s = 0.027 + random() * 0.075;
    dummy.scale.set(s * 1.3, s * 0.65, s);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);
    const shade = 0.76 + random() * 0.24;
    color.setRGB(shade, shade, shade * 0.98);
    pebbles.setColorAt(i, color);
  }
  pebbles.receiveShadow = true;
  scene.add(pebbles);
  addUnderstory(scene);
  // A pale gravel ribbon separates moss islands and turns behind the pond. Its
  // asymmetry and grouped stones are borrowed from the user's garden references.
  const gardenPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(9.4, 0, 7.4), new THREE.Vector3(10.7, 0, 1.8),
    new THREE.Vector3(11.7, 0, -5.2), new THREE.Vector3(5.7, 0, -8.9),
    new THREE.Vector3(-1.0, 0, -8.0), new THREE.Vector3(-8.5, 0, -9.3),
    new THREE.Vector3(-13.8, 0, -14.7), new THREE.Vector3(-18.0, 0, -27.0),
  ]);
  const gravelPositions: number[] = [], gravelUvs: number[] = [], gravelIndices: number[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120, p = gardenPath.getPointAt(t), tangent = gardenPath.getTangentAt(t);
    const width = 0.76 + Math.sin(t * 8.5) * 0.15;
    for (const side of [-1, 1]) {
      const x = p.x + tangent.z * width * side, z = p.z - tangent.x * width * side;
      gravelPositions.push(x, groundHeight(x, z) + 0.026, z);
      gravelUvs.push(side === -1 ? 0 : 1, t * 22);
    }
    if (i < 120) gravelIndices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const gravelGeometry = new THREE.BufferGeometry();
  gravelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gravelPositions, 3));
  gravelGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(gravelUvs, 2));
  gravelGeometry.setIndex(gravelIndices);
  gravelGeometry.computeVertexNormals();
  const gravelMap = noiseTexture('stone', 126);
  gravelMap.repeat.set(1, 1);
  const gravel = new THREE.Mesh(gravelGeometry, new THREE.MeshStandardMaterial({ color: '#c9c6ae', map: gravelMap, bumpMap: gravelMap, bumpScale: 0.019, roughness: 0.98, side: THREE.DoubleSide }));
  gravel.name = 'pale-garden-gravel-path';
  gravel.receiveShadow = true;
  scene.add(gravel);
  for (let i = 0; i < 36; i++) {
    const p = gardenPath.getPointAt(i / 39);
    const x = p.x, z = p.z;
    const step = new THREE.Mesh(rockGeometries[i % 3], stone);
    step.scale.set(0.58 + random() * 0.2, 0.075 + random() * 0.035, 0.43 + random() * 0.07);
    step.position.set(x, groundHeight(x, z) + 0.045, z);
    step.rotation.y = random() * 0.65;
    step.castShadow = step.receiveShadow = true;
    scene.add(step);
  }
  const planting = createGardenTrees(scene, bark);
  planting.foliage.push(...createGardenShrubs(scene));
  const padShape = new THREE.Shape();
  padShape.moveTo(0.03, 0);
  padShape.absarc(0, 0, 1, 0.17, Math.PI * 2 - 0.16, false);
  padShape.lineTo(0.03, 0);
  const padGeometry = horizontal(new THREE.ExtrudeGeometry(padShape, { depth: 0.018, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.005, bevelSegments: 1, curveSegments: 30, steps: 1 }));
  const padMaterial = new THREE.MeshStandardMaterial({ color: '#536946', roughness: 0.51, metalness: 0.03 });
  for (let i = 0; i < 22; i++) {
    const x = i < 14 ? 3.0 + random() * 2.2 : -4.8 + random() * 1.6;
    const z = i < 14 ? -1.9 + random() * 1.9 : 2.35 + random() * 1.3;
    if (pondFraction(x, z) > 0.82) continue;
    const pad = new THREE.Mesh(padGeometry, padMaterial), s = 0.18 + random() * 0.19;
    pad.scale.set(s, 1, s);
    pad.position.set(x, POND.waterY + 0.012 + random() * 0.007, z);
    pad.rotation.y = random() * Math.PI * 2;
    pad.castShadow = pad.receiveShadow = true;
    scene.add(pad);
    if (i === 5 || i === 18) {
      const flower = new THREE.Group(), petalMaterial = new THREE.MeshStandardMaterial({ color: '#e4d0c3', roughness: 0.63 });
      for (let j = 0; j < 12; j++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), petalMaterial), angle = j / 12 * Math.PI * 2;
        petal.scale.set(0.045, 0.057, 0.12);
        petal.rotation.set(-0.38, angle, 0);
        petal.position.set(Math.sin(angle) * 0.06, 0.055, Math.cos(angle) * 0.06);
        flower.add(petal);
      }
      flower.position.copy(pad.position);
      scene.add(flower);
    }
  }
  const room = new THREE.Group();
  room.name = 'open-wooden-veranda';
  const roomBox = (width: number, height: number, depth: number, x: number, y: number, z: number, material = wood) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    room.add(mesh);
  };
  roomBox(32, 0.40, 9, 0, 0.39, 12.4, darkWood);
  for (let i = 0; i < 64; i++) roomBox(0.48, 0.13, 9, -15.75 + i * 0.5, 0.65, 12.4);
  roomBox(32, 0.26, 0.16, 0, 0.48, 7.88, darkWood);
  const teaCorner = createTeaCorner(room, wood, darkWood);
  scene.add(room);
  return {
    room, snow, foliage: planting.foliage, lanternLight: addLantern(scene, stone),
    chimeTarget: teaCorner.chimeTarget,
    ringChime: teaCorner.ring,
    dispose: teaCorner.dispose,
    update(time, reducedMotion) { planting.update(time, reducedMotion); teaCorner.update(time, reducedMotion); },
  };
}
