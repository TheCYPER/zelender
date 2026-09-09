import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomGenerator } from './common';
import { groundHeight } from './vegetation';
import { countrysideFootprint } from './countryside';
import { addFoliageWind, type WindState } from './wind';

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

type Shrub = { x: number; z: number; height: number; rx: number; rz: number; seed: number; hue?: number };

/** Clipped garden shrubs: dark interior volume under many individually curved leaves. */
export function createGardenShrubs(scene: THREE.Scene, wind: WindState): THREE.InstancedMesh[] {
  const candidates: Shrub[] = [
    { x: -8.8, z: -0.9, height: 0.88, rx: 1.12, rz: 0.82, seed: 57 },
    { x: -6.7, z: -5.7, height: 0.53, rx: 0.94, rz: 0.70, seed: 134 },
    { x: 8.4, z: 0.1, height: 1.08, rx: 1.12, rz: 0.86, seed: 263 },
    { x: 5.5, z: -6.5, height: 0.74, rx: 1.24, rz: 0.76, seed: 481 },
    { x: -3.8, z: -9.8, height: 0.48, rx: 0.76, rz: 0.64, seed: 619 },
    { x: 2.2, z: -12.9, height: 0.85, rx: 1.13, rz: 0.89, seed: 734 },
    { x: -9.9, z: 2.9, height: 0.64, rx: 0.88, rz: 0.73, seed: 815 },
    { x: 9.8, z: -3.2, height: 0.43, rx: 0.69, rz: 0.54, seed: 917 },
    { x: -10.4, z: -7.5, height: 1.16, rx: 1.30, rz: 0.96, seed: 1028 },
    { x: 7.0, z: -13.7, height: 1.17, rx: 1.81, rz: 1.32, seed: 1163 },
    { x: -9.8, z: -15.2, height: 2.1, rx: 2.7, rz: 2.0, seed: 1201 },
    { x: -5.1, z: -13.8, height: 1.4, rx: 1.9, rz: 1.7, seed: 1402 },
    { x: 5.3, z: -16.6, height: 2.2, rx: 2.9, rz: 2.3, seed: 1537 },
    { x: 9.2, z: -16.1, height: 1.5, rx: 2.0, rz: 1.7, seed: 1558 },
    { x: 0.2, z: -17.5, height: 1.0, rx: 2.0, rz: 1.6, seed: 1685 },
    { x: -8.9, z: 5.3, height: 0.56, rx: 0.83, rz: 0.78, seed: 1791, hue: 0.32 },
    { x: -9.2, z: 3.9, height: 1.06, rx: 1.11, rz: 0.96, seed: 1834, hue: 0.29 },
    { x: 8.1, z: 4.8, height: 0.78, rx: 1.00, rz: 0.85, seed: 1928, hue: 0.31 },
    { x: 8.5, z: 6.1, height: 0.41, rx: 0.76, rz: 0.62, seed: 2155 },
    { x: -8.2, z: -7.1, height: 0.61, rx: 1.09, rz: 0.71, seed: 2463, hue: 0.28 },
    { x: -12.0, z: -8.0, height: 1.46, rx: 1.62, rz: 1.05, seed: 2711, hue: 0.29 },
    { x: -17.8, z: -8.9, height: 2.15, rx: 2.35, rz: 1.56, seed: 2835, hue: 0.30 },
    { x: -17.4, z: -6.1, height: 1.05, rx: 1.58, rz: 1.20, seed: 2977 },
    { x: 16.1, z: -7.4, height: 1.72, rx: 2.18, rz: 1.37, seed: 3124, hue: 0.31 },
    { x: 14.6, z: -14.4, height: 2.11, rx: 2.21, rz: 1.50, seed: 3376, hue: 0.27 },
    { x: 17.4, z: -13.0, height: 0.91, rx: 1.62, rz: 1.19, seed: 3510 },
    { x: -2.1, z: -7.3, height: 0.70, rx: 1.80, rz: 0.90, seed: 3835, hue: 0.30 },
    { x: 1.5, z: -7.1, height: 0.39, rx: 1.16, rz: 0.68, seed: 4077 },
  ];
  const planting = candidates.filter(shrub => !countrysideFootprint(shrub.x, shrub.z, shrub.rx));
  const group = new THREE.Group();
  group.name = 'clipped-garden-azaleas';
  scene.add(group);

  // Leaf density falls with projected size. Distant planting below uses shaded
  // crown geometry instead of tens of thousands of invisible individual leaves.
  const counts = planting.map((shrub) => Math.round((shrub.z < -10 ? 780 : 1180) * Math.min(2.2, shrub.rx * shrub.rz)));
  const leaves = new THREE.InstancedMesh(smallLeaf(), new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.84,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.35,
  }), counts.reduce((sum, count) => sum + count, 0));
  addFoliageWind(leaves.material, wind, 0.09);
  leaves.name = 'azalea-individual-leaves';
  leaves.castShadow = false;
  leaves.receiveShadow = true;
  group.add(leaves);

  const coreMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    envMapIntensity: 0.18,
  });
  addFoliageWind(coreMaterial,wind,0.034,true);
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3(), localZ = new THREE.Vector3(0, 0, 1);
  const color = new THREE.Color();
  let leafIndex = 0;
  const coreParts: THREE.BufferGeometry[] = [];

  planting.forEach((shrub, shrubIndex) => {
    // Golden new growth is grouped by plant, with a matching shaded interior.
    const golden = [1, 3, 6, 10, 17, 21, 24, 27].includes(shrubIndex);
    const hue = golden ? 0.225 : (shrub.hue ?? 0.29);
    const lightness = golden ? 0.39 : 0.275;
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
    const coreColors: number[] = [], flex: number[] = [];
    for (let i = 0; i < corePositions.count; i++) {
      const x = corePositions.getX(i), y = corePositions.getY(i), z = corePositions.getZ(i);
      flex.push(Math.pow(Math.max(0,(y+0.4)/1.4),2)*shrub.height);
      const angle = Math.atan2(z, x);
      const r = radiusAt(angle, y) * 0.91;
      corePositions.setXYZ(i, x * shrub.rx * r, y * shrub.height * 0.65 + shrub.height * 0.27, z * shrub.rz * r);
      const patch = Math.sin(x * 37 + phase) * Math.cos(z * 31 - y * 19);
      color.setHSL(hue + patch * 0.012, golden ? 0.48 : 0.43, lightness - 0.045 + (y + 1) * 0.025 + patch * 0.012, THREE.SRGBColorSpace);
      coreColors.push(color.r, color.g, color.b);
    }
    coreGeometry.setAttribute('color', new THREE.Float32BufferAttribute(coreColors, 3));
    coreGeometry.setAttribute('windWeight',new THREE.Float32BufferAttribute(flex,1));
    coreGeometry.computeVertexNormals();
    coreGeometry.translate(shrub.x, baseY, shrub.z);
    coreParts.push(coreGeometry);

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
      const size = (0.078 + random() * 0.032) * Math.sqrt(Math.max(1, shrub.rx * shrub.rz / 2.2)) * (shrub.z < -10 ? 1.18 : 1);
      dummy.scale.set(size * (0.90 + random() * 0.25), size, size);
      dummy.updateMatrix();
      leaves.setMatrixAt(leafIndex, dummy.matrix);
      const topLight = Math.max(0, y);
      color.setHSL(hue + (random() - 0.5) * 0.033, 0.42 + random() * 0.12, lightness + topLight * 0.045 + random() * 0.035, THREE.SRGBColorSpace);
      leaves.setColorAt(leafIndex++, color);
    }
  });
  const coreGeometry = mergeGeometries(coreParts);
  coreParts.forEach((part) => part.dispose());
  if (coreGeometry) {
    const cores = new THREE.Mesh(coreGeometry, coreMaterial);
    cores.name = 'clipped-shrub-interiors';
    cores.castShadow = cores.receiveShadow = true;
    group.add(cores);
  }
  addLayeredPlanting(scene,wind);
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  leaves.computeBoundingSphere();
  return [leaves];
}

/** Lower-detail planting occupies real sloping ground, never a painted horizon. */
function addLayeredPlanting(scene: THREE.Scene, wind: WindState): void {
  const random = randomGenerator(59083), dummy = new THREE.Object3D(), color = new THREE.Color();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, envMapIntensity: 0.25 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vClippedWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 clippedPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        clippedPosition = instanceMatrix * clippedPosition;
      #endif
      vClippedWorld = (modelMatrix * clippedPosition).xyz;
    `);
    shader.fragmentShader = 'varying vec3 vClippedWorld;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 clippedCell = floor(vClippedWorld * 21.0);
      float clippedGrain = fract(sin(dot(clippedCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      float clippedDetail = 1.0 - smoothstep(0.06, 0.16, length(fwidth(vClippedWorld)));
      float clippedPatch = sin(vClippedWorld.x * 4.2 + vClippedWorld.z * 2.6) * sin(vClippedWorld.y * 7.1 - vClippedWorld.z * 3.4);
      diffuseColor.rgb *= 0.92 + clippedPatch * 0.07 + (clippedGrain - 0.5) * 0.24 * clippedDetail;
    `);
  };
  material.customProgramCacheKey = () => 'layered-clipped-planting-v1';
  addFoliageWind(material,wind,0.028);

  const geometryFor = (kind: number, distant: boolean) => {
    const parts: THREE.BufferGeometry[] = [];
    // Lower-detail crowns retain an irregular, multi-lobed outline. Their
    // geometry does not resolve into enormous smooth hemispheres at a distance.
    const lobes = distant ? [
      [-0.40, 0.21, 0.03, 0.67, 0.63, 0.65],
      [0.33, 0.34, 0.17, 0.68, 0.77, 0.61],
      [-0.04, 0.45, -0.38, 0.63, 0.68, 0.57],
    ] : [[0, 0.23, 0, 1, 1, 1]];
    lobes.forEach(([cx, cy, cz, rx, ry, rz], lobe) => {
      const geometry = new THREE.SphereGeometry(1, distant ? 10 : 22, distant ? 7 : 14);
      const positions = geometry.getAttribute('position'), colors: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const azimuth = Math.atan2(z, x);
        const shoulder = 1 + Math.sin(azimuth * (kind + 3) + kind + lobe) * (distant ? 0.13 : 0.055)
          + Math.sin(x * 8 + z * 6 - y * 4 + kind * 2) * (distant ? 0.11 : kind === 2 ? 0.075 : 0.033);
        const top = kind === 1 ? Math.min(0.79 + x * 0.07, y) : y;
        positions.setXYZ(i, cx + x * shoulder * rx, cy + (top < 0 ? top * 0.30 : top) * shoulder * ry, cz + z * shoulder * rz);
        const shade = 0.73 + Math.max(0, y) * 0.24 + Math.sin(x * 31 + z * 23 - y * 17) * 0.07;
        colors.push(shade, shade, shade * 0.97);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      parts.push(geometry);
    });
    const geometry = mergeGeometries(parts)!;
    parts.forEach((part) => part.dispose());
    return geometry;
  };
  type Crown = { x: number; z: number; rx: number; rz: number; height: number; hue: number };
  const middle: Crown[] = [], far: Crown[] = [];
  // Asymmetrically sized planting islands leave the path bends open. Each island
  // combines a few nested clipped domes, rather than repeating equally spaced balls.
  const islands = [
    [-20.0, -13.0, 3.4, 2.0], [-13.0, -22.5, 4.1, 1.9], [-5.4, -23.9, 3.7, 1.6],
    [8.5, -22.6, 4.7, 2.3], [19.8, -19.0, 4.6, 2.2], [-29.5, -24.6, 4.1, 2.2],
    [-21.9, -33.7, 3.9, 2.0], [-9.8, -35.8, 4.2, 2.5], [0.9, -30.0, 3.6, 1.7],
    [17.8, -35.7, 4.4, 2.4], [30.7, -31.8, 5.4, 2.3], [-35.9, -41.2, 5.3, 2.8],
    [-13.8, -45.8, 4.9, 2.6], [3.0, -46.9, 4.9, 2.0], [27.9, -47.4, 4.8, 2.7],
  ];
  islands.forEach(([cx, cz, spread, height], islandIndex) => {
    for (let j = 0; j < 5; j++) {
      const angle = j * 2.39996 + islandIndex;
      const r = j === 0 ? 0 : spread * (0.65 + random() * 0.32);
      const size = j === 0 ? 1.0 : 0.53 + random() * 0.28;
      middle.push({ x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r * 0.67,
        rx: spread * size * 0.64, rz: spread * size * (0.40 + random() * 0.15),
        height: height * size, hue: islandIndex % 3 === 1 ? 0.225 : 0.285 + (islandIndex % 4) * 0.015 });
    }
  });
  // Smaller tree-crown pockets follow the rear contours with clear glades
  // between them. Each pocket varies its footprint, density and canopy heights.
  const contours = [
    { z: -57, width: 43, groups: 4 }, { z: -73, width: 53, groups: 5 },
    { z: -94, width: 66, groups: 5 }, { z: -116, width: 81, groups: 6 },
    { z: -137, width: 91, groups: 6 },
  ];
  contours.forEach((contour, contourIndex) => {
    for (let pocket = 0; pocket < contour.groups; pocket++) {
      const cx = -contour.width + (pocket + 0.4 + random() * 0.3) / contour.groups * contour.width * 2;
      const cz = contour.z + (random() - 0.5) * 12;
      const spread = 5.2 + random() * 5.2;
      const count = 12 + Math.floor(random() * 10);
      for (let j = 0; j < count; j++) {
        const angle = j * 2.399963 + pocket, r = Math.sqrt(random()) * spread;
        const x = cx + Math.cos(angle) * r, z = cz + Math.sin(angle) * r * 0.62;
        const size = 1.15 + random() * 1.20 + contourIndex * 0.13;
        far.push({ x, z, rx: size * (0.90 + random() * 0.5), rz: size * (0.65 + random() * 0.3),
          height: size * (0.43 + random() * 0.40), hue: 0.29 + random() * 0.048 });
      }
    }
  });
  const farPalette = ['#294b38', '#3e623e', '#5f783e', '#2b463b', '#799244', '#3d624a', '#506e38'];
  for (const [plants, distant] of [[middle, false], [far, true]] as const) {
    for (let kind = 0; kind < 3; kind++) {
      const subset = plants.filter((plant, index) => index % 3 === kind && !countrysideFootprint(plant.x, plant.z, plant.rx));
      const crowns = new THREE.InstancedMesh(geometryFor(kind, distant), material, subset.length);
      crowns.name = `${distant ? 'far' : 'middle'}-planted-contours-${kind}`;
      crowns.castShadow = !distant;
      crowns.receiveShadow = true;
      subset.forEach((plant, index) => {
        dummy.position.set(plant.x, groundHeight(plant.x, plant.z) - 0.12, plant.z);
        dummy.rotation.set(0, random() * Math.PI * 2, 0);
        dummy.scale.set(plant.rx, plant.height, plant.rz);
        dummy.updateMatrix();
        crowns.setMatrixAt(index, dummy.matrix);
        if (distant) {
          color.set(farPalette[Math.floor(random() * farPalette.length)]).multiplyScalar(0.87 + random() * 0.25);
        } else {
          color.setHSL(plant.hue, 0.34 + random() * 0.14, (plant.hue < 0.25 ? 0.36 : 0.26) + random() * 0.065, THREE.SRGBColorSpace);
        }
        crowns.setColorAt(index, color);
      });
      crowns.computeBoundingSphere();
      scene.add(crowns);
    }
  }
}
