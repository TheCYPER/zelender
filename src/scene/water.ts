import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { POND, pondFloorY, pondFraction, pondPoint, randomGenerator } from './common';
import { PondWaves } from './waves';

function addPebbleBed(scene: THREE.Scene, time: { value: number }): number {
  const random = randomGenerator(828), dummy = new THREE.Object3D(), color = new THREE.Color();
  const normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), vertex = new THREE.Vector3();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, envMapIntensity: 0.34 });
  material.onBeforeCompile = shader => {
    shader.uniforms.pondTime = time;
    shader.vertexShader = 'varying vec3 vPebbleWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      vec4 bedVertex=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        bedVertex=instanceMatrix*bedVertex;
      #endif
      vPebbleWorld=(modelMatrix*bedVertex).xyz;
    `);
    shader.fragmentShader = 'varying vec3 vPebbleWorld; uniform float pondTime;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float depth=clamp((${POND.waterY}-vPebbleWorld.y)/2.7,0.0,1.0);
      float mineral=fract(sin(dot(floor(vPebbleWorld.xz*240.0),vec2(12.9898,78.233)))*43758.5453);
      float caustic=pow(1.0-abs(sin(vPebbleWorld.x*5.4+sin(vPebbleWorld.z*4.2+pondTime*0.4))),20.0);
      diffuseColor.rgb *= (0.90+mineral*0.15)*mix(vec3(1.0),vec3(0.62,0.76,0.74),depth);
      diffuseColor.rgb += vec3(0.05,0.07,0.06)*caustic;
    `);
  };
  material.customProgramCacheKey = () => 'submerged-rounded-pebbles-v1';
  const patches = [
    [-5.1, -0.7, 1.5, 1.1], [-3.5, 3.4, 1.6, 0.95], [3.8, 1.9, 1.5, 1.3],
    [2.6, -2.0, 1.8, 0.95], [-2.0, -1.9, 1.7, 1.0], [0.3, 3.6, 1.6, 0.85],
  ];
  const palette = ['#3d514b', '#59665e', '#626e64', '#384844', '#5b5a50', '#42584f'];
  const counts = [1360, 260, 40];
  counts.forEach((count, kind) => {
    const geometry = new THREE.SphereGeometry(1, 10, 7);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const irregular = 1 + Math.sin(x * 4.2 + z * 3.7 + kind * 13) * Math.cos(y * 4.6 + z * 2.0) * 0.075;
      positions.setXYZ(i, x * irregular, y * irregular, z * irregular);
    }
    geometry.computeVertexNormals();
    const stones = new THREE.InstancedMesh(geometry, material, count);
    stones.name = `pond-bed-pebbles-${kind}`;
    for (let i = 0; i < count; i++) {
      let x: number, z: number;
      if (random() < 0.82) {
        const patch = patches[Math.floor(random() * patches.length)];
        const angle = random() * Math.PI * 2, r = Math.sqrt(random());
        x = patch[0] + Math.cos(angle) * r * patch[2];
        z = patch[1] + Math.sin(angle) * r * patch[3];
      } else {
        const p = pondPoint(random() * Math.PI * 2, Math.sqrt(random()) * 0.985);
        x = p.x; z = p.z;
      }
      const radius = pondFraction(x, z);
      if (radius > 0.97) { x = POND.x + (x - POND.x) * 0.97 / radius; z = POND.z + (z - POND.z) * 0.97 / radius; }
      const size = kind === 0 ? 0.034 + random() * 0.085 : kind === 1 ? 0.11 + random() * 0.08 : 0.20 + random() * 0.075;
      const thickness = Math.min(0.074, size * (0.35 + random() * 0.12));
      const bed = pondFloorY(x, z);
      normal.set(-(pondFloorY(x + 0.025, z) - pondFloorY(x - 0.025, z)) / 0.05,
        1, -(pondFloorY(x, z + 0.025) - pondFloorY(x, z - 0.025)) / 0.05).normalize();
      dummy.position.set(x, bed - thickness * 0.22, z);
      dummy.quaternion.setFromUnitVectors(up, normal);
      dummy.rotateY(random() * Math.PI * 2);
      dummy.scale.set(size * (1.05 + random() * 0.42), thickness, size * (0.74 + random() * 0.28));
      dummy.updateMatrix();
      // Large flat pebbles bridge small hollows. Bury them enough that their
      // actual upper vertices fit below the fish's reserved substrate margin.
      let excess = 0;
      for (let v = 0; v < positions.count; v++) {
        vertex.fromBufferAttribute(positions, v).applyMatrix4(dummy.matrix);
        excess = Math.max(excess, vertex.y - pondFloorY(vertex.x, vertex.z) - 0.075);
      }
      dummy.position.y -= excess;
      dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
      color.set(palette[Math.floor(random() * palette.length)]).multiplyScalar(0.82 + random() * 0.20);
      stones.setColorAt(i, color);
    }
    stones.receiveShadow = true;
    stones.computeBoundingSphere();
    scene.add(stones);
  });
  return counts.reduce((sum, count) => sum + count, 0);
}

/** The reflection is rendered from a clipped mirror camera, then blended over the fish. */
export function createWater(scene: THREE.Scene) {
  const time = { value: 0 };
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#4e5a52', roughness: 0.97, envMapIntensity: 0.35 });
  floorMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.pondTime = time;
    shader.vertexShader = 'varying vec3 vPondWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPondWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform float pondTime;\nvarying vec3 vPondWorld;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 p = vPondWorld.xz;
      float grain = fract(sin(dot(floor(p * 85.0), vec2(12.9898,78.233))) * 43758.5453);
      float a = sin(p.x * 4.5 + sin(p.y * 3.0 + pondTime * 0.38)) + sin(p.y * 4.0 + sin(p.x * 2.5 - pondTime * 0.32));
      float b = sin(p.x * 7.0 - pondTime * 0.27) * cos(p.y * 6.0 + pondTime * 0.24);
      float caustic = pow(1.0 - abs(sin(a * 1.55 + b * 0.20)), 19.0);
      float caustic2 = pow(1.0 - abs(sin(a * 1.7 - b * 0.3 + 1.2)), 24.0);
      float sediment = sin(p.x*0.86 + sin(p.y*0.62))*cos(p.y*1.16-p.x*0.28);
      float depth = clamp((${POND.waterY} - vPondWorld.y)/2.7,0.0,1.0);
      diffuseColor.rgb *= (0.72 + grain * 0.27) * (0.88 + sediment*0.16);
      diffuseColor.rgb *= mix(vec3(1.10,1.04,0.96),vec3(0.58,0.69,0.69),depth);
      diffuseColor.rgb += vec3(0.24, 0.28, 0.22) * (caustic * 0.065 + caustic2 * 0.035);
    `);
  };
  const floorVertices = [POND.x, pondFloorY(POND.x, POND.z), POND.z];
  const floorIndices: number[] = [];
  const floorRings = 64, floorSegments = 144;
  for (let ring = 1; ring <= floorRings; ring++) for (let segment = 0; segment < floorSegments; segment++) {
    // Extend under the land by a few centimetres to close the join naturally.
    const p = pondPoint(segment / floorSegments * Math.PI * 2, ring / floorRings * 1.01);
    floorVertices.push(p.x, pondFloorY(p.x, p.z), p.z);
    const current = 1 + (ring - 1) * floorSegments + segment;
    const next = 1 + (ring - 1) * floorSegments + (segment + 1) % floorSegments;
    if (ring === 1) floorIndices.push(0, next, current);
    else {
      const inner = current - floorSegments, innerNext = next - floorSegments;
      floorIndices.push(inner, innerNext, current, innerNext, next, current);
    }
  }
  const floorGeometry = new THREE.BufferGeometry();
  floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(floorVertices, 3));
  floorGeometry.setIndex(floorIndices);
  floorGeometry.computeVertexNormals();
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.name = 'recessed-pond-bowl';
  floor.receiveShadow = true;
  scene.add(floor);

  const waves = new PondWaves();
  const surfaceGeometry = new THREE.BufferGeometry();
  const surfacePositions = new Float32Array(waves.heights.length * 3);
  const surfaceIndices: number[] = [];
  for (let row = 0; row < waves.rows; row++) for (let col = 0; col < waves.columns; col++) {
    const i = row * waves.columns + col;
    surfacePositions.set([waves.x(col), -waves.z(row), 0], i * 3);
    if (row < waves.rows - 1 && col < waves.columns - 1) {
      const b = i + waves.columns;
      if (waves.wet[i] && waves.wet[i + 1] && waves.wet[b]) surfaceIndices.push(i, b, i + 1);
      if (waves.wet[i + 1] && waves.wet[b] && waves.wet[b + 1]) surfaceIndices.push(i + 1, b, b + 1);
    }
  }
  surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(surfacePositions, 3).setUsage(THREE.DynamicDrawUsage));
  surfaceGeometry.setIndex(surfaceIndices);
  surfaceGeometry.computeVertexNormals();
  const water = new Reflector(surfaceGeometry, {
    textureWidth: 768,
    textureHeight: 768,
    clipBias: 0.003,
    multisample: 0,
    color: new THREE.Color('#658b7d'),
    shader: {
      name: 'QuietPondReflection',
      uniforms: {
        color: { value: new THREE.Color('#658b7d') },
        tDiffuse: { value: null },
        textureMatrix: { value: new THREE.Matrix4() },
        pondTime: { value: 0 },
        rain: { value: 0 },
      },
      vertexShader: `
        uniform mat4 textureMatrix;
        varying vec4 vReflection;
        varying vec3 vWorld;
        varying vec3 vWaveNormal;
        void main() {
          vReflection = textureMatrix * vec4(position, 1.0);
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          vWaveNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform float pondTime;
        uniform float rain;
        varying vec4 vReflection;
        varying vec3 vWorld;
        varying vec3 vWaveNormal;
        void main() {
          vec2 p = vWorld.xz;
          float t = pondTime;
          float wx = sin(p.x * 2.8 + t * 0.55 + sin(p.y * 2.6 - t * 0.20)) * 0.6 + sin(p.y * 5.2 + t * 0.6) * 0.22;
          float wy = cos(p.y * 3.6 - t * 0.40 + sin(p.x * 2.0 + t * 0.25)) * 0.6 + cos(p.x * 4.6 - t * 0.38) * 0.25;
          vec4 reflectionUv = vReflection;
          reflectionUv.xy += (vWaveNormal.xz * 0.022 + vec2(wx, wy) * 0.0003) * reflectionUv.w;
          vec3 reflected = texture2DProj(tDiffuse, reflectionUv).rgb;
          vec3 normal = normalize(vWaveNormal);
          vec3 eye = normalize(cameraPosition - vWorld);
          // Air/water reflectance grows at grazing angles; the overhead view
          // stays clear enough to see fish and stones beneath the surface.
          float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(eye, normal), 0.0), 5.0);
          vec3 outgoing = mix(color, reflected, 0.96);
          float glint = pow(max(dot(reflect(-normalize(vec3(-0.4, 1.0, 0.4)), normal), eye), 0.0), 260.0);
          outgoing += vec3(1.0, 0.93, 0.7) * glint * 0.5;
          gl_FragColor = vec4(outgoing, 0.04 + fresnel * 0.72);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    },
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = POND.waterY;
  const waterMaterial = water.material;
  if (!(waterMaterial instanceof THREE.ShaderMaterial)) throw new Error('The pond reflection material could not be created.');
  waterMaterial.transparent = true;
  waterMaterial.depthWrite = false;
  scene.add(water);

  const random = randomGenerator(828);
  const pebbleCount = addPebbleBed(scene, time);

  let previousTime = 0;
  let nextRain = 0;
  return {
    surface: water,
    color: waterMaterial.uniforms.color.value as THREE.Color,
    impulse(x: number, z: number, strength = 0.12) { waves.impulse(x, z, strength); },
    sampleHeight(x: number, z: number) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return POND.waterY;
      const col = THREE.MathUtils.clamp((x - waves.x(0)) / waves.dx, 0, waves.columns - 1);
      const row = THREE.MathUtils.clamp((z - waves.z(0)) / waves.dz, 0, waves.rows - 1);
      const left = Math.floor(col), right = Math.min(left + 1, waves.columns - 1);
      const top = Math.floor(row), bottom = Math.min(top + 1, waves.rows - 1);
      const height = (r: number, c: number) => surfacePositions[(r * waves.columns + c) * 3 + 2];
      return POND.waterY + THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(height(top, left), height(top, right), col - left),
        THREE.MathUtils.lerp(height(bottom, left), height(bottom, right), col - left), row - top);
    },
    debug() { return { displacedVertices: waves.heights.filter(height => Math.abs(height) > 0.001).length, maxDisplacement: waves.heights.reduce((max, height) => Math.max(max, Math.abs(height)), 0), pebbleCount }; },
    update(elapsed: number, raining: boolean) {
      waves.step(Math.max(0, elapsed - previousTime));
      previousTime = elapsed;
      if (raining && elapsed > nextRain) {
        const point = pondPoint(random() * Math.PI * 2, random() * 0.86);
        waves.impulse(point.x, point.z, 0.025);
        nextRain = elapsed + 0.08;
      }
      for (let i = 0; i < waves.heights.length; i++) {
        const x = surfacePositions[i * 3], z = -surfacePositions[i * 3 + 1];
        surfacePositions[i * 3 + 2] = waves.heights[i] + (waves.wet[i] ?
          Math.sin(x * 1.3 + z * 0.7 + elapsed * 1.0) * 0.009 + Math.sin(z * 1.9 - elapsed * 0.7) * 0.006 : 0);
      }
      surfaceGeometry.getAttribute('position').needsUpdate = true;
      surfaceGeometry.computeVertexNormals();
      time.value = elapsed;
      waterMaterial.uniforms.pondTime.value = elapsed;
      waterMaterial.uniforms.rain.value = raining ? 1 : 0;
    },
    dispose() { water.getRenderTarget().dispose(); },
  };
}
