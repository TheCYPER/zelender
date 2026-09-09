import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { branchGeometry, horizontal, noiseTexture, POND, pondFraction, pondPoint, pondShape, randomGenerator, seededStoneGeometry } from './common';

export interface Landscape {
  room: THREE.Group;
  snow: THREE.Group;
  foliage: THREE.InstancedMesh[];
  lanternLight: THREE.PointLight;
}

function leafGeometry(pine: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  if (pine) {
    shape.moveTo(0, -0.75);
    shape.quadraticCurveTo(-0.25, 0, 0, 0.9);
    shape.quadraticCurveTo(0.25, 0, 0, -0.75);
  } else {
    shape.moveTo(0, -0.52);
    const points = [[-0.16,-0.13],[-0.53,-0.14],[-0.37,0.08],[-0.7,0.38],[-0.29,0.28],[-0.31,0.78],[-0.08,0.5],[0,1],[0.13,0.48],[0.38,0.76],[0.31,0.25],[0.73,0.4],[0.4,0.06],[0.57,-0.17],[0.16,-0.12]];
    for (const [x, y] of points) shape.lineTo(x, y);
    shape.closePath();
  }
  return horizontal(new THREE.ShapeGeometry(shape, 2));
}

function tree(scene: THREE.Scene, x: number, z: number, size: number, kind: 'maple' | 'pine' | 'green', seed: number, bark: THREE.Material): THREE.InstancedMesh {
  const random = randomGenerator(seed);
  const pine = kind === 'pine';
  const branchParts: THREE.BufferGeometry[] = [];
  const clusters: { center: THREE.Vector3; radius: number; depth: number }[] = [];
  const base = new THREE.Vector3(x, 0.05, z);
  const trunk = new THREE.Vector3(x + size * 0.09, size * 0.51, z - size * 0.04);
  const elbow = new THREE.Vector3(x - size * 0.035, size * 0.25, z + size * 0.02);
  branchParts.push(branchGeometry(base, elbow, size * 0.066, size * 0.048));
  branchParts.push(branchGeometry(elbow, trunk, size * 0.048, size * 0.03));
  const crownCount = pine ? 12 : 17;
  for (let b = 0; b < crownCount; b++) {
    const angle = b * 2.399 + random() * 0.35;
    const level = b / crownCount;
    const reach = size * (pine ? 0.33 - level * 0.15 : 0.26 + random() * 0.15);
    const center = new THREE.Vector3(x + Math.cos(angle) * reach + size * 0.09, size * (0.52 + level * 0.46), z + Math.sin(angle) * reach);
    const origin = new THREE.Vector3(trunk.x, size * (pine ? 0.35 + level * 0.52 : 0.43 + level * 0.18), trunk.z);
    const split = origin.clone().lerp(center, 0.58);
    split.y -= size * 0.055;
    branchParts.push(branchGeometry(origin, split, size * (0.018 - level * 0.008), size * 0.009));
    branchParts.push(branchGeometry(split, center, size * 0.009, size * 0.003));
    for (let twig = 0; twig < (pine ? 4 : 5); twig++) {
      const turn = angle + (random() - 0.5) * 3;
      const radius = size * (pine ? 0.10 : 0.13) * (0.8 + random() * 0.45);
      const end = center.clone().add(new THREE.Vector3(Math.cos(turn) * radius, (random() - 0.25) * size * 0.095, Math.sin(turn) * radius));
      branchParts.push(branchGeometry(split.clone().lerp(center, 0.7), end, size * 0.0035, size * 0.001));
      clusters.push({ center: end, radius: radius * (pine ? 1.1 : 1.15), depth: size * (pine ? 0.055 : 0.068) });
    }
  }
  const mergedBranches = mergeGeometries(branchParts);
  if (mergedBranches) {
    const branches = new THREE.Mesh(mergedBranches, bark);
    branches.castShadow = branches.receiveShadow = true;
    scene.add(branches);
  }
  branchParts.forEach((geometry) => geometry.dispose());
  const leavesPerCluster = seed >= 170 ? 55 : pine ? 170 : kind === 'maple' ? 170 : 105;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.89, side: THREE.DoubleSide });
  const leaves = new THREE.InstancedMesh(leafGeometry(pine), material, clusters.length * leavesPerCluster);
  const matrix = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;
  for (const cluster of clusters) {
    for (let leaf = 0; leaf < leavesPerCluster; leaf++) {
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      matrix.position.set(cluster.center.x + Math.cos(angle) * r * cluster.radius, cluster.center.y + (random() - 0.42) * cluster.depth - r * r * cluster.depth * 0.3, cluster.center.z + Math.sin(angle) * r * cluster.radius * 0.84);
      matrix.rotation.set((random() - 0.5) * 1.1, random() * 6.28, (random() - 0.5) * 1.05);
      const s = size * (pine ? 0.017 : 0.022) * (0.75 + random() * 0.65);
      matrix.scale.set(s, s, pine ? s * 1.7 : s);
      matrix.updateMatrix();
      leaves.setMatrixAt(index, matrix.matrix);
      const hue = kind === 'maple' ? 0.015 + random() * 0.055 : kind === 'green' ? 0.17 + random() * 0.10 : 0.24 + random() * 0.08;
      color.setHSL(hue, kind === 'maple' ? 0.52 + random() * 0.18 : 0.21 + random() * 0.25, (pine ? 0.13 : kind === 'green' ? 0.23 : 0.26) + random() * 0.14);
      leaves.setColorAt(index++, color);
    }
  }
  leaves.castShadow = leaves.receiveShadow = true;
  leaves.instanceMatrix.needsUpdate = true;
  scene.add(leaves);
  return leaves;
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
  const stoneTexture = noiseTexture('stone');
  const mossTexture = noiseTexture('moss');
  const woodTexture = noiseTexture('wood');
  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture, bumpMap: stoneTexture, bumpScale: 0.10, roughness: 0.99, color: '#a6ada3' });
  const rockMaterial = stone.clone();
  rockMaterial.vertexColors = true;
  rockMaterial.color.set('#c2c5b6');
  const wood = new THREE.MeshStandardMaterial({ color: '#806247', map: woodTexture, bumpMap: woodTexture, bumpScale: 0.06, roughness: 0.85 });
  const darkWood = wood.clone();
  darkWood.color.set('#49392b');
  const bark = new THREE.MeshStandardMaterial({ color: '#514b3a', map: woodTexture, roughness: 1 });
  const moss = new THREE.MeshStandardMaterial({ color: '#718052', map: mossTexture, bumpMap: mossTexture, bumpScale: 0.1, roughness: 1 });
  const snow = new THREE.Group();
  snow.visible = false;
  scene.add(snow);

  const outer = new THREE.Shape([new THREE.Vector2(-40, -34), new THREE.Vector2(40, -34), new THREE.Vector2(40, 30), new THREE.Vector2(-40, 30)]);
  outer.holes.push(new THREE.Path(pondShape(1.005).getPoints()));
  const terrainGeometry = horizontal(new THREE.ShapeGeometry(outer));
  const groundUv = terrainGeometry.getAttribute('uv');
  for (let i = 0; i < groundUv.count; i++) groundUv.setXY(i, groundUv.getX(i) / 10, groundUv.getY(i) / 10);
  const terrain = new THREE.Mesh(terrainGeometry, moss);
  terrain.position.y = -0.015;
  terrain.receiveShadow = true;
  scene.add(terrain);
  const snowTerrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ color: '#e1e8df', roughness: 1 }));
  snowTerrain.position.y = 0.002;
  snowTerrain.receiveShadow = true;
  snow.add(snowTerrain);

  const rockGeometry = seededStoneGeometry();
  const edgeRocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 102);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < 102; i++) {
    const p = pondPoint(i / 102 * Math.PI * 2, 1.005 + random() * 0.025);
    const s = 0.23 + random() * 0.26;
    dummy.position.set(p.x, 0.02 + s * 0.15, p.z);
    dummy.rotation.set(random() * 0.5, random() * 6.28, random() * 0.4);
    dummy.scale.set(s * (1.3 + random() * 0.5), s * (0.55 + random() * 0.6), s);
    dummy.updateMatrix();
    edgeRocks.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.16, 0.06 + random() * 0.10, 0.48 + random() * 0.24);
    edgeRocks.setColorAt(i, color);
  }
  edgeRocks.castShadow = edgeRocks.receiveShadow = true;
  scene.add(edgeRocks);

  const boulderPositions = [[-7.7,-3.4,1.15],[-8.5,-2.1,0.73],[-6.6,-4.3,0.78],[5.0,-3.7,1.05],[6.0,-4.6,0.81],[7.0,0.7,0.74],[7.5,1.7,0.43],[-7.5,3.4,0.65],[-8.4,4.0,0.98],[3.6,5.0,0.55],[-4.5,-6.0,0.93],[-3.5,-6.5,0.6]];
  for (const [x, z, s] of boulderPositions) {
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(x, s * 0.34, z);
    rock.scale.set(s * 1.2, s * 0.85, s);
    rock.rotation.set(random() * 0.3, random() * 6.28, random() * 0.3);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    const cap = new THREE.Mesh(rockGeometry, new THREE.MeshStandardMaterial({ color: '#e6eade', roughness: 1 }));
    cap.position.set(x, s * 0.77, z);
    cap.scale.set(s * 0.92, s * 0.17, s * 0.80);
    snow.add(cap);
  }

  const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), stone, 1200);
  for (let i = 0; i < 1200; i++) {
    const p = pondPoint(random() * 6.28, 1.03 + random() * 0.12);
    dummy.position.set(p.x, 0.02, p.z);
    dummy.rotation.set(random(), random() * 6.28, random());
    const s = 0.026 + random() * 0.065;
    dummy.scale.set(s * 1.3, s * 0.6, s);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.15, 0.055, 0.35 + random() * 0.4);
    pebbles.setColorAt(i, color);
  }
  pebbles.receiveShadow = true;
  scene.add(pebbles);

  // Tall grasses use one draw call; patches follow the shore instead of a uniform lawn.
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.035,0,0, 0.035,0,0, 0.02,0.68,0.08], 3));
  grassGeometry.computeVertexNormals();
  const grass = new THREE.InstancedMesh(grassGeometry, new THREE.MeshStandardMaterial({ color: '#728143', side: THREE.DoubleSide, roughness: 1 }), 10500);
  for (let i = 0; i < 10500; i++) {
    const patch = Math.floor(random() * 32) / 32 * 6.28;
    const p = pondPoint(patch + (random() - 0.5) * 0.10, 1.11 + random() * 0.25);
    dummy.position.set(p.x, -0.035, p.z);
    dummy.rotation.set((random() - 0.5) * 0.9, random() * 6.28, (random() - 0.5) * 0.5);
    const s = 0.25 + random() * 0.62;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.19 + random() * 0.05, 0.21 + random() * 0.25, 0.19 + random() * 0.14);
    grass.setColorAt(i, color);
  }
  grass.receiveShadow = true;
  scene.add(grass);

  // Rounded stepping stones lead from the veranda around the right side of the pond.
  for (let i = 0; i < 12; i++) {
    const z = 7.4 - i * 1.18;
    const x = 8.8 + Math.sin(i * 0.42) * 0.65;
    const step = new THREE.Mesh(rockGeometry, stone);
    step.scale.set(0.66 + random() * 0.14, 0.095, 0.47 + random() * 0.07);
    step.position.set(x, 0.05, z);
    step.rotation.y = random();
    step.receiveShadow = true;
    scene.add(step);
  }

  const wall = new THREE.Mesh(new THREE.BoxGeometry(43, 3.1, 0.36), new THREE.MeshStandardMaterial({ color: '#b9b8a0', map: stoneTexture, roughness: 1 }));
  wall.position.set(0, 1.35, -11.7);
  wall.receiveShadow = true;
  scene.add(wall);
  const wallFoot = new THREE.Mesh(new THREE.BoxGeometry(43, 0.57, 0.52), stone);
  wallFoot.position.set(0, 0.22, -11.55);
  wallFoot.receiveShadow = true;
  scene.add(wallFoot);
  for (const y of [2.89, 3.0]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(43, 0.12, y === 3 ? 0.65 : 0.83), darkWood);
    cap.position.set(0, y, -11.7);
    cap.castShadow = true;
    scene.add(cap);
  }
  for (let i = 0; i < 34; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.9, 0.11), wood);
    slat.position.set(-15 + i * 0.21, 1.55, -8.8);
    slat.castShadow = true;
    scene.add(slat);
  }

  const foliage = [
    tree(scene, -7.7, -4.5, 7.7, 'maple', 24, bark),
    tree(scene, 7.9, -6.9, 9.4, 'pine', 15, bark),
    tree(scene, -12.2, -7.6, 8.3, 'green', 66, bark),
    tree(scene, 13.6, -7.4, 6.6, 'green', 97, bark),
    tree(scene, 0.8, -10.3, 5.5, 'green', 118, bark),
  ];
  // Distant crowns dissolve into atmospheric perspective beyond the courtyard wall.
  for (let i = 0; i < 4; i++) foliage.push(tree(scene, -16 + i * 10.5, -20.0 - random() * 3, 9 + random() * 3, 'green', 170 + i, bark));

  const padGeometry = horizontal(new THREE.CircleGeometry(1, 36, 0.15, Math.PI * 2 - 0.38));
  const padMaterial = new THREE.MeshStandardMaterial({ color: '#4c703b', roughness: 0.53, metalness: 0.08, side: THREE.DoubleSide });
  for (let i = 0; i < 23; i++) {
    const x = i < 14 ? 3.0 + random() * 2.2 : -4.8 + random() * 1.6;
    const z = i < 14 ? -1.9 + random() * 1.9 : 2.35 + random() * 1.3;
    if (pondFraction(x, z) > 0.82) continue;
    const pad = new THREE.Mesh(padGeometry, padMaterial);
    const s = 0.18 + random() * 0.19;
    pad.scale.setScalar(s);
    pad.position.set(x, POND.waterY + 0.023 + random() * 0.018, z);
    pad.rotation.y = random() * 6.28;
    pad.receiveShadow = true;
    scene.add(pad);
    if (i === 5 || i === 18) {
      const flower = new THREE.Group();
      const petalMaterial = new THREE.MeshStandardMaterial({ color: '#e8bdb8', roughness: 0.65 });
      for (let j = 0; j < 9; j++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), petalMaterial);
        const angle = j / 9 * 6.28;
        petal.scale.set(0.055, 0.075, 0.15);
        petal.rotation.set(-0.4, angle, 0);
        petal.position.set(Math.sin(angle) * 0.07, 0.06, Math.cos(angle) * 0.07);
        flower.add(petal);
      }
      flower.position.copy(pad.position);
      scene.add(flower);
    }
  }

  const room = new THREE.Group();
  const roomBox = (width: number, height: number, depth: number, x: number, y: number, z: number, material = wood) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    room.add(mesh);
    return mesh;
  };
  roomBox(32, 0.45, 9, 0, 0.37, 12.4, darkWood);
  for (let i = 0; i < 53; i++) roomBox(0.57, 0.13, 9, -15.6 + i * 0.6, 0.65, 12.4);
  roomBox(32, 0.36, 0.25, 0, 0.4, 7.85, darkWood);
  for (const x of [-10.7, 10.7]) {
    roomBox(0.48, 11, 0.48, x, 5.4, 11.0, darkWood);
    roomBox(0.12, 10.5, 3.2, x + (x < 0 ? -0.35 : 0.35), 5.4, 12.3, wood);
  }
  roomBox(25, 0.50, 0.52, 0, 9.45, 11, darkWood);
  roomBox(27, 0.35, 5.5, 0, 10.0, 13.4, darkWood);
  for (let i = 0; i < 19; i++) roomBox(0.14, 0.22, 5.1, -12 + i * 1.35, 9.7, 13.4, wood);
  scene.add(room);

  return { room, snow, foliage, lanternLight: addLantern(scene, stone) };
}
