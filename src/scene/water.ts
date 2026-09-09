import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { POND, pondFloorY, pondPoint, randomGenerator } from './common';
import { PondWaves } from './waves';

/** The reflection is rendered from a clipped mirror camera, then blended over the fish. */
export function createWater(scene: THREE.Scene) {
  const time = { value: 0 };
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#142d25', roughness: 0.95 });
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
      float depthFalloff = smoothstep(0.12, 1.0, length((p - vec2(${POND.x}, ${POND.z})) / vec2(${POND.rx}, ${POND.rz})));
      diffuseColor.rgb *= (0.88 + grain * 0.08) * mix(0.52, 1.0, depthFalloff);
      diffuseColor.rgb += vec3(0.20, 0.28, 0.17) * (caustic * 0.06 + caustic2 * 0.035);
    `);
  };
  const floorVertices = [POND.x, POND.floorY, POND.z];
  const floorIndices: number[] = [];
  const floorRings = 24, floorSegments = 128;
  for (let ring = 1; ring <= floorRings; ring++) for (let segment = 0; segment < floorSegments; segment++) {
    const p = pondPoint(segment / floorSegments * Math.PI * 2, ring / floorRings);
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

  // The vertical bank closes the gap between the surface and the recessed floor.
  // Without it the clear color shows through the far shore as a pale, icy band.
  const bankVertices: number[] = [];
  const bankIndices: number[] = [];
  for (let i = 0; i <= 128; i++) {
    const p = pondPoint(i / 128 * Math.PI * 2);
    bankVertices.push(p.x, 0.12, p.z, p.x, pondFloorY(p.x, p.z) - 0.025, p.z);
    if (i < 128) bankIndices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const bankGeometry = new THREE.BufferGeometry();
  bankGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bankVertices, 3));
  bankGeometry.setIndex(bankIndices);
  bankGeometry.computeVertexNormals();
  const bank = new THREE.Mesh(bankGeometry, new THREE.MeshStandardMaterial({ color: '#405c47', roughness: 1, side: THREE.DoubleSide }));
  bank.receiveShadow = true;
  scene.add(bank);

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

  // A few submerged stones near the shallows give the transparent water a visible depth.
  const random = randomGenerator(828);
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#657c60', roughness: 1 }), 95);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 95; i++) {
    const angle = random() * 6.28;
    const r = 0.75 + random() * 0.15;
    const x = POND.x + Math.cos(angle) * POND.rx * r, z = POND.z + Math.sin(angle) * POND.rz * r;
    dummy.position.set(x, pondFloorY(x, z) + 0.03, z);
    const s = 0.04 + random() * 0.08;
    dummy.scale.set(s * 1.5, s * 0.5, s);
    dummy.rotation.y = random() * 6.28;
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  stones.receiveShadow = true;
  scene.add(stones);

  let previousTime = 0;
  let nextRain = 0;
  return {
    surface: water,
    color: waterMaterial.uniforms.color.value as THREE.Color,
    impulse(x: number, z: number, strength = 0.12) { waves.impulse(x, z, strength); },
    debug() { return { displacedVertices: waves.heights.filter(height => Math.abs(height) > 0.001).length, maxDisplacement: waves.heights.reduce((max, height) => Math.max(max, Math.abs(height)), 0) }; },
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
