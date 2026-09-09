import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pondFraction, randomGenerator } from './common';

type Planting = { x: number; z: number; height: number; yaw: number; breadth?: number };

/** Curved, continuously tapered limbs avoid the straight-radial broom silhouette. */
function curvedLimb(points: THREE.Vector3[], baseRadius: number, tipRadius: number, sections = 20) {
  const curve = new THREE.CatmullRomCurve3(points);
  const sides = baseRadius > 0.18 ? 12 : 8;
  const geometry = new THREE.TubeGeometry(curve, sections, 1, sides, false);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const length = curve.getLength();
  for (let i = 0; i < uv.count; i++) {
    const along = uv.getX(i), around = uv.getY(i);
    uv.setXY(i, around * Math.max(0.2, baseRadius * Math.PI * 2), along * length * 0.75);
  }
  for (let section = 0; section <= sections; section++) {
    const t = section / sections, center = curve.getPointAt(t);
    const radius = tipRadius + (baseRadius - tipRadius) * Math.pow(1 - t, 0.82);
    for (let side = 0; side <= sides; side++) {
      const i = section * (sides + 1) + side;
      positions.setXYZ(i, center.x + (positions.getX(i) - center.x) * radius, center.y + (positions.getY(i) - center.y) * radius, center.z + (positions.getZ(i) - center.z) * radius);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A trained pine with broad, separated pads of fine three-dimensional needles. */
function createNiwaki(scene: THREE.Scene, bark: THREE.MeshStandardMaterial, wind: { value: number }): THREE.InstancedMesh[] {
  const random = randomGenerator(74192);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const group = new THREE.Group();
  group.name = 'trained-japanese-pine';
  group.position.set(8.1, groundHeight(8.1, -6.4), -6.4);
  group.scale.set(0.90, 0.88, 0.90);
  scene.add(group);
  const trunkPoints = [v(0,0,0),v(-0.24,0.8,0.08),v(-0.08,1.65,-0.06),v(0.40,2.55,0.07),v(0.12,3.35,-0.03),v(0.39,4.05,0.04),v(0.19,4.99,-0.09)];
  const woodParts: THREE.BufferGeometry[] = [curvedLimb(trunkPoints, 0.34, 0.045, 46)];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    woodParts.push(curvedLimb([v(-0.03,0.18,0),v(Math.cos(a)*0.34,0.065,Math.sin(a)*0.30),v(Math.cos(a)*0.76,-0.01,Math.sin(a)*0.66)],0.18,0.025,12));
  }
  const pads = [
    { center:v(-2.55,2.12,0.52), radius:v(1.60,0.51,1.12), from:v(-0.11,1.55,-0.02), bend:v(-1.32,1.51,0.23) },
    { center:v(2.62,2.86,-0.32), radius:v(1.59,0.53,1.03), from:v(0.36,2.40,0.05), bend:v(1.45,2.16,-0.12) },
    { center:v(-1.28,2.98,-1.41), radius:v(1.25,0.45,0.94), from:v(0.22,2.48,0.05), bend:v(-0.60,2.48,-0.87) },
    { center:v(-1.43,3.78,0.05), radius:v(1.37,0.51,1.01), from:v(0.20,3.17,0.01), bend:v(-0.72,3.24,0.02) },
    { center:v(1.50,4.00,1.07), radius:v(1.23,0.48,0.97), from:v(0.22,3.62,0.01), bend:v(0.89,3.53,0.73) },
    { center:v(-0.62,4.74,-0.37), radius:v(1.12,0.48,0.92), from:v(0.34,4.11,0.04), bend:v(-0.31,4.23,-0.25) },
    { center:v(0.23,5.12,0.09), radius:v(1.10,0.45,0.84), from:v(0.21,4.68,-0.07), bend:v(0.17,4.88,0.04) },
  ];
  const coreParts: THREE.BufferGeometry[] = [];
  const needleVertices: number[] = [], needleColors: number[] = [], needleIndices: number[] = [];
  // Eight slender curved needles form one small radial shoot, not a leaf billboard.
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + (i % 2) * 0.08;
    const length = 0.76 + random() * 0.42;
    const tip = v(Math.cos(a) * length * 0.62, Math.sin(a) * length * 0.62, length * (0.40 + random() * 0.29));
    const cross = v(-Math.sin(a) * 0.018, Math.cos(a) * 0.018, 0);
    const mid = tip.clone().multiplyScalar(0.55).add(v(0,0,0.065));
    const base = needleVertices.length / 3;
    for (const [point, shade] of [[v(0,0,0),0.65],[mid.clone().add(cross),0.92],[tip,1],[mid.clone().sub(cross),0.90]] as [THREE.Vector3, number][]) {
      needleVertices.push(point.x, point.y, point.z);
      needleColors.push(shade, shade, shade * 0.94);
    }
    needleIndices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const shootGeometry = new THREE.BufferGeometry();
  shootGeometry.setAttribute('position', new THREE.Float32BufferAttribute(needleVertices, 3));
  shootGeometry.setAttribute('color', new THREE.Float32BufferAttribute(needleColors, 3));
  shootGeometry.setIndex(needleIndices);
  shootGeometry.computeVertexNormals();
  const counts = pads.map((pad) => Math.round(420 * pad.radius.x * pad.radius.z));
  const needleMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.91, side: THREE.DoubleSide, envMapIntensity: 0.32 });
  needleMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.gardenPineTime = wind;
    shader.vertexShader = 'uniform float gardenPineTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(gardenPineTime * 0.8 + position.z * 4.0) * position.z * 0.025;');
  };
  needleMaterial.customProgramCacheKey = () => 'niwaki-needle-shoot-v1';
  const needles = new THREE.InstancedMesh(shootGeometry, needleMaterial, counts.reduce((a,b)=>a+b,0));
  needles.name = 'niwaki-fine-radial-needles';
  needles.receiveShadow = true;
  // The recessed crown volumes cast a stable soft shadow. Tiny individual needle
  // shadows add little at this camera distance and double vegetation shadow cost.
  needles.castShadow = false;
  const dummy = new THREE.Object3D(), normal = new THREE.Vector3(), localZ = v(0,0,1), color = new THREE.Color();
  let index = 0;
  pads.forEach((pad, padIndex) => {
    const attachment = pad.center.clone().add(v(0,-pad.radius.y*0.45,0));
    woodParts.push(curvedLimb([pad.from,pad.bend,attachment],padIndex < 2 ? 0.16 : 0.115,0.035,22));
    for (let twig = 0; twig < 9; twig++) {
      const a = twig / 9 * Math.PI * 2 + 0.13;
      const end = pad.center.clone().add(v(Math.cos(a)*pad.radius.x*0.72,-pad.radius.y*0.08,Math.sin(a)*pad.radius.z*0.69));
      const bend = attachment.clone().lerp(end,0.51).add(v(0,-0.10,0));
      woodParts.push(curvedLimb([attachment,bend,end],0.027,0.005,8));
    }
    const ruffle = (x: number,y: number,z: number) => 1 + Math.sin(x*8+padIndex)*Math.cos(z*9-y*5)*0.037 + Math.sin(z*17+x*11)*0.014;
    const core = new THREE.SphereGeometry(1,24,14);
    const positions = core.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i), r = ruffle(x,y,z)*0.94;
      const py = y < 0 ? y * 0.48 : y;
      positions.setXYZ(i,pad.center.x+x*pad.radius.x*r,pad.center.y+py*pad.radius.y*r,pad.center.z+z*pad.radius.z*r);
      const patch = Math.sin(x*32+z*19)*Math.cos(y*27-z*13);
      color.setHSL(0.265 + patch*0.008,0.25,0.17 + Math.max(0,y)*0.06 + patch*0.017,THREE.SRGBColorSpace);
      colors.push(color.r,color.g,color.b);
    }
    core.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    core.computeVertexNormals();
    coreParts.push(core);
    for(let n=0;n<counts[padIndex];n++) {
      const y = -0.65 + random()*1.65, a = n*2.399963;
      const r = Math.sqrt(1-y*y), x = Math.cos(a)*r, z = Math.sin(a)*r;
      const irregular = ruffle(x,y,z)*(0.98+random()*0.035);
      const py = y < 0 ? y*0.48 : y;
      dummy.position.set(pad.center.x+x*pad.radius.x*irregular,pad.center.y+py*pad.radius.y*irregular,pad.center.z+z*pad.radius.z*irregular);
      normal.set(x/pad.radius.x,y/pad.radius.y,z/pad.radius.z).normalize();
      dummy.quaternion.setFromUnitVectors(localZ,normal);
      dummy.rotateZ(random()*Math.PI*2);
      dummy.rotateX((random()-0.5)*0.55);
      const size = 0.115+random()*0.068;
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      needles.setMatrixAt(index,dummy.matrix);
      color.setHSL(0.25+(random()-0.5)*0.035,0.29+random()*0.10,0.24+Math.max(0,y)*0.065+random()*0.048,THREE.SRGBColorSpace);
      needles.setColorAt(index++,color);
    }
  });
  const branchGeometry = mergeGeometries(woodParts);
  const coreGeometry = mergeGeometries(coreParts);
  woodParts.forEach((geometry)=>geometry.dispose());
  coreParts.forEach((geometry)=>geometry.dispose());
  if (branchGeometry) {
    const branches = new THREE.Mesh(branchGeometry,bark);
    branches.castShadow = branches.receiveShadow = true;
    group.add(branches);
  }
  if (coreGeometry) {
    const crowns = new THREE.Mesh(coreGeometry,new THREE.MeshStandardMaterial({ vertexColors:true,roughness:1,envMapIntensity:0.25 }));
    crowns.name = 'niwaki-rounded-crown-interiors';
    crowns.castShadow = crowns.receiveShadow = true;
    group.add(crowns);
  }
  needles.computeBoundingSphere();
  group.add(needles);
  return [needles];
}

/** Gentle terrain rises leave the pool's original shoreline and interaction shape intact. */
export function groundHeight(x: number, z: number): number {
  const distance = Math.hypot(x * 0.74, z * 0.93);
  const slope = THREE.MathUtils.smoothstep(distance, 8, 26);
  const roll = 0.85 + Math.sin(x * 0.15 + z * 0.08) * 0.42 + Math.cos(z * 0.21 - x * 0.06) * 0.32;
  // The planted garden sits above the distant valley. Land falls away behind
  // its low planting, so an empty repeated turf slope cannot obscure the hills.
  const farRise = -THREE.MathUtils.smoothstep(distance, 18, 44) * 18;
  const island = (cx: number, cz: number, radius: number, height: number) => height * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (radius * radius));
  const mossIslands = island(-8.1, -5.5, 3.2, 0.48) + island(7.3, -7.1, 3.7, 0.57) + island(-2.5, -11, 2.5, 0.26);
  const clearShore = THREE.MathUtils.smoothstep(pondFraction(x, z), 1.06, 1.38);
  return -0.024 + slope * roll + farRise + mossIslands * clearShore;
}

/**
 * EZ-Tree supplies continuous branching and photographic cutout foliage. Three
 * low, spreading specimen trees sit in a deliberately open garden. Borrowed
 * distant scenery is composed independently, without a row of forest trunks.
 */
export function createGardenTrees(scene: THREE.Scene, bark: THREE.MeshStandardMaterial) {
  const random = randomGenerator(6427);
  const foliage: THREE.InstancedMesh[] = [];
  const wind = { value: 0 };
  const makeGrove = (preset: string, seed: number, planting: Planting[]) => {
    const tree = new Tree();
    tree.loadPreset(preset);
    tree.options.seed = seed;
    tree.options.bark.flatShading = false;
    // The released generator uses 16-bit indices; keep each geometry below
    // 65,536 vertices when adjusting branching or terminal leaf counts.
    {
      // Short trunk, long radiating branches and small terminal sprays give the
      // specimen trees a garden-scale spreading crown, rather than a tall bole.
      tree.options.branch.length[0] = 20;
      tree.options.branch.length[1] = 23;
      tree.options.branch.length[2] = 10;
      tree.options.branch.length[3] = 3.6;
      tree.options.branch.angle[1] = 67;
      tree.options.branch.angle[2] = 51;
      tree.options.branch.start[1] = 0.30;
      tree.options.branch.force.strength = 0.013;
      tree.options.branch.sections[0] = 14;
      tree.options.branch.sections[1] = 10;
      tree.options.branch.sections[2] = 6;
      tree.options.branch.sections[3] = 3;
      tree.options.branch.gnarliness[0] = 0.14;
      tree.options.branch.gnarliness[1] = 0.18;
      tree.options.branch.gnarliness[2] = 0.13;
      tree.options.branch.radius[0] *= 1.18;
      tree.options.leaves.count = preset === 'Ash Medium' ? 32 : 30;
      tree.options.leaves.size = preset === 'Ash Medium' ? 3.45 : 3.30;
      tree.options.leaves.sizeVariance = 0.46;
    }
    tree.generate();
    const bounds = new THREE.Box3().setFromObject(tree);
    const sourceHeight = Math.max(1, bounds.max.y);
    const branches = tree.branchesMesh.geometry;
    const leaves = tree.leavesMesh.geometry;
    // Unit-height geometry allows one instance buffer to hold varied ages/scales.
    branches.scale(1 / sourceHeight, 1 / sourceHeight, 1 / sourceHeight);
    leaves.scale(1 / sourceHeight, 1 / sourceHeight, 1 / sourceHeight);
    const importedLeafMaterial = tree.leavesMesh.material as THREE.MeshPhongMaterial;
    const leafMaterial = new THREE.MeshStandardMaterial({
      map: importedLeafMaterial.map,
      color: preset.startsWith('Pine') ? '#b3bd9c' : '#c7c5a4',
      roughness: 0.94,
      side: THREE.DoubleSide,
      alphaTest: 0.45,
      alphaToCoverage: true,
      vertexColors: true,
    });
    // Crown-oriented normals shade leaf clusters as volumes rather than flat cards.
    const leafPositions = leaves.getAttribute('position');
    const leafNormals = leaves.getAttribute('normal');
    const colors = new Float32Array(leafPositions.count * 3);
    const normal = new THREE.Vector3();
    const crownNormal = new THREE.Vector3();
    const color = new THREE.Color();
    let variation = 0;
    for (let i = 0; i < leafPositions.count; i++) {
      if (i % 4 === 0) variation = random();
      crownNormal.set(leafPositions.getX(i), (leafPositions.getY(i) - 0.49) * 0.82, leafPositions.getZ(i)).normalize();
      normal.fromBufferAttribute(leafNormals, i).lerp(crownNormal, 0.68).normalize();
      leafNormals.setXYZ(i, normal.x, normal.y, normal.z);
      const shade = 0.73 + variation * 0.27;
      color.setRGB(shade * (0.93 + variation * 0.07), shade, shade * 0.88);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    leaves.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    leafMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.gardenWindTime = wind;
      shader.vertexShader = 'uniform float gardenWindTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float leafFlex = smoothstep(0.12, 1.0, position.y);
        float breeze = sin(gardenWindTime * 0.78 + position.y * 8.0 + position.x * 12.0);
        transformed.x += breeze * leafFlex * 0.0028;
        transformed.z += sin(gardenWindTime * 0.52 + position.z * 10.0) * leafFlex * 0.0019;
      `);
    };
    leafMaterial.customProgramCacheKey = () => 'garden-leaf-volume-wind-v1';
    const trunks = new THREE.InstancedMesh(branches, bark, planting.length);
    const crowns = new THREE.InstancedMesh(leaves, leafMaterial, planting.length);
    trunks.name = `garden-specimen-${preset}-trunks`;
    crowns.name = `garden-specimen-${preset}-leaves`;
    const transform = new THREE.Object3D();
    planting.forEach((plant, index) => {
      transform.position.set(plant.x, groundHeight(plant.x, plant.z), plant.z);
      transform.rotation.set(0, plant.yaw, 0);
      const breadth = plant.breadth ?? 1;
      transform.scale.set(plant.height * breadth, plant.height, plant.height * breadth);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      crowns.setMatrixAt(index, transform.matrix);
    });
    trunks.castShadow = crowns.castShadow = true;
    trunks.receiveShadow = crowns.receiveShadow = true;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    scene.add(trunks, crowns);
    foliage.push(crowns);
    // The generator's own shader bypasses instance matrices. Its geometries and
    // cutout map are reused above with an instancing-safe physical material.
    (tree.branchesMesh.material as THREE.Material).dispose();
    importedLeafMaterial.dispose();
  };

  const p = (x: number, z: number, height: number, breadth = 1): Planting => ({ x, z, height, breadth, yaw: random() * Math.PI * 2 });
  makeGrove('Ash Medium', 38734, [p(-8.4,-4.6,5.6,1.0)]);
  makeGrove('Oak Medium', 12461, [p(-1.0,-11.5,4.0,1.10)]);
  foliage.push(...createNiwaki(scene, bark, wind));
  return { foliage, update(time: number, reducedMotion: boolean) { wind.value = reducedMotion ? 0 : time; } };
}
