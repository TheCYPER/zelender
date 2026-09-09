import * as THREE from 'three';
import { POND, pondFloorY, pondFraction, pondPoint, randomGenerator } from './common';

/** A cupped ribbon with a slightly raised midrib, anchored at y=0. */
function ribbonLeaf() {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const sections = 14;
  for (let row = 0; row <= sections; row++) {
    const t = row / sections;
    const width = Math.pow(Math.sin(Math.PI * t), 0.7) * 0.045 + 0.003 * (1 - t);
    for (let side = -1; side <= 1; side++) {
      positions.push(side * width, t, t * t * 0.19 + (side === 0 ? Math.sin(t * Math.PI) * 0.012 : 0));
      const shade = 0.62 + t * 0.38;
      colors.push(shade * (side === 0 ? 0.91 : 1), shade, shade * 0.92);
    }
    if (row < sections) for (let col = 0; col < 2; col++) {
      const a = row * 3 + col, b = a + 3;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Small beds of submerged ribbon grass, leaving the middle open for the koi. */
export function createAquaticPlants(scene: THREE.Scene, sampleHeight: (x: number, z: number) => number) {
  const random = randomGenerator(42651);
  const patches = [
    { angle: 0.18, radius: 0.77, count: 28, height: 0.79 },
    { angle: 1.15, radius: 0.79, count: 23, height: 0.64 },
    { angle: 2.43, radius: 0.78, count: 34, height: 0.91 },
    { angle: 3.70, radius: 0.81, count: 29, height: 0.75 },
    { angle: 4.82, radius: 0.79, count: 23, height: 0.70 },
    { angle: 5.61, radius: 0.80, count: 31, height: 0.84 },
  ].map(patch => ({ ...patch, center: pondPoint(patch.angle, patch.radius) }));
  const time = { value: 0 }, motion = { value: 1 };
  const currents = patches.map(() => new THREE.Vector2());
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.74, metalness: 0, side: THREE.DoubleSide,
    vertexColors: true, envMapIntensity: 0.23,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.aquaticTime = time;
    shader.uniforms.aquaticMotion = motion;
    shader.uniforms.aquaticCurrents = { value: currents };
    shader.vertexShader = `
      uniform float aquaticTime;
      uniform float aquaticMotion;
      uniform vec2 aquaticCurrents[6];
      attribute float bladePhase;
      attribute float bladePatch;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float flex = position.y * position.y;
      float phase = bladePhase + aquaticTime * 0.68;
      vec2 current = aquaticCurrents[int(bladePatch)];
      // Wave gradients are in world XZ; each ribbon has its own yaw and scale.
      // Undo those axes before the instancing transform so a passing wave
      // pushes neighbouring leaves in the same direction.
      #ifdef USE_INSTANCING
        vec3 worldCurrent = vec3(current.x, 0.0, current.y);
        current = vec2(
          dot(worldCurrent, instanceMatrix[0].xyz) / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz),
          dot(worldCurrent, instanceMatrix[2].xyz) / dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz)
        );
      #endif
      vec2 drift = vec2(sin(phase) * 0.095 + sin(phase * 0.61 + 1.9) * 0.045,
        cos(phase * 0.78) * 0.073);
      float tipFlutter = sin(position.y * 8.0 - aquaticTime * 1.25 + bladePhase) * 0.020;
      transformed.xz += (drift + current + tipFlutter) * flex * aquaticMotion;
    `);
  };
  material.customProgramCacheKey = () => 'submerged-ribbon-grass-v1';
  const count = patches.reduce((sum, patch) => sum + patch.count, 0);
  const geometry = ribbonLeaf();
  const phases = new Float32Array(count), patchIds = new Float32Array(count);
  geometry.setAttribute('bladePhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute('bladePatch', new THREE.InstancedBufferAttribute(patchIds, 1));
  const leaves = new THREE.InstancedMesh(geometry, material, count);
  leaves.name = 'submerged-ribbon-grass';
  leaves.userData.skipAO = true;
  leaves.receiveShadow = true;
  leaves.castShadow = false;
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const palette = ['#386b4d', '#497953', '#537b49', '#36685b'];
  let index = 0;
  patches.forEach((patch, patchIndex) => {
    for (let blade = 0; blade < patch.count; blade++) {
      const angle = blade * 2.399963;
      const spread = Math.sqrt(random()) * 0.46;
      const x = patch.center.x + Math.cos(angle) * spread;
      const z = patch.center.z + Math.sin(angle) * spread * 0.68;
      const y = pondFloorY(x, z) + 0.028;
      // Keep every blade underwater even where a shelf rises near the shore.
      const height = Math.max(0.08, Math.min(patch.height * (0.56 + random() * 0.62), POND.waterY - y - 0.24));
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, angle + random() * 0.5, 0);
      dummy.scale.set(height * (0.85 + random() * 0.45), height, height);
      dummy.updateMatrix();
      leaves.setMatrixAt(index, dummy.matrix);
      color.set(palette[(blade + patchIndex) % palette.length]);
      leaves.setColorAt(index, color);
      phases[index] = patchIndex * 0.8 + random() * 1.9;
      patchIds[index++] = patchIndex;
    }
  });
  leaves.computeBoundingSphere();
  if (leaves.boundingSphere) leaves.boundingSphere.radius += 0.3;
  scene.add(leaves);
  return {
    update(elapsed: number, reducedMotion: boolean) {
      time.value = elapsed;
      motion.value = reducedMotion ? 0 : 1;
      patches.forEach((patch, index) => {
        const { x, z } = patch.center;
        const slopeX = sampleHeight(x + 0.24, z) - sampleHeight(x - 0.24, z);
        const slopeZ = sampleHeight(x, z + 0.24) - sampleHeight(x, z - 0.24);
        currents[index].set(THREE.MathUtils.clamp(slopeX * 2.6, -0.09, 0.09), THREE.MathUtils.clamp(slopeZ * 2.6, -0.09, 0.09));
      });
    },
    debug() { return { patches: patches.length, blades: count, motion: motion.value,
      allInsidePond: patches.every(patch => pondFraction(patch.center.x, patch.center.z) < 0.9),
      currents: currents.map(current => current.toArray()) }; },
  };
}
