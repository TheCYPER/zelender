import * as THREE from 'three';
import type { Weather } from '../types';
import { randomGenerator } from './common';
import { groundHeight } from './vegetation';

export function createWeather(scene: THREE.Scene, dpr: number) {
  const random = randomGenerator(472);
  const positions = new Float32Array(1600 * 3);
  const seeds = new Float32Array(1600);
  for (let i = 0; i < 1600; i++) {
    positions[i * 3] = (random() - 0.5) * 36;
    positions[i * 3 + 1] = random() * 20;
    positions[i * 3 + 2] = (random() - 0.5) * 30;
    seeds[i] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, kind: { value: 0 }, dpr: { value: dpr } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float time;
      uniform float kind;
      uniform float dpr;
      attribute float seed;
      varying float vSeed;
      void main() {
        vec3 p = position;
        vSeed = seed;
        float speed = kind < 0.5 ? 0.14 : kind < 1.5 ? 11.0 : 0.7;
        p.y = mod(position.y - time * speed * (0.8 + seed * 0.3), 20.0);
        p.x += sin(time * 0.3 + seed * 100.0) * (kind > 1.5 ? 1.1 : 0.08);
        p.z += cos(time * 0.18 + seed * 30.0) * 0.6;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float size = kind < 0.5 ? 1.3 : kind < 1.5 ? 15.0 : 3.8;
        gl_PointSize = clamp(size * dpr * 14.0 / -mvPosition.z, 1.0, kind < 1.5 ? 32.0 : 9.0);
      }
    `,
    fragmentShader: `
      uniform float kind;
      varying float vSeed;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float alpha;
        if (kind > 0.5 && kind < 1.5) {
          alpha = (1.0 - smoothstep(0.016, 0.06, abs(uv.x + uv.y * 0.10))) * (1.0 - abs(uv.y) * 2.0) * 0.48;
        } else {
          alpha = (1.0 - smoothstep(0.10, 0.48, length(uv))) * (kind > 1.5 ? 0.83 : 0.18);
          if (kind < 0.5 && vSeed > 0.14) discard;
        }
        gl_FragColor = vec4(kind < 0.5 ? vec3(1.0, 0.92, 0.68) : vec3(0.88, 0.94, 0.94), alpha);
      }
    `,
  });
  const particles = new THREE.Points(geometry, material);
  particles.frustumCulled = false;
  scene.add(particles);
  // Low drifting banks belong only to mist weather. They never apply a global
  // distance fade or obscure the permanent horizon in the other three modes.
  const mistGeometry = new THREE.PlaneGeometry(1, 1);
  const mistMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, strength: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float time;
      varying vec2 vMistUv;
      varying float vMistPhase;
      void main() {
        vMistUv = uv;
        vec4 origin = instanceMatrix * vec4(0,0,0,1);
        vMistPhase = origin.x * 0.73 + origin.z;
        origin.x += sin(time*0.10+vMistPhase)*1.6;
        vec4 mv = modelViewMatrix * origin;
        float width = length(instanceMatrix[0].xyz);
        float height = length(instanceMatrix[1].xyz);
        mv.xy += position.xy * vec2(width,height);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float strength;
      varying vec2 vMistUv;
      varying float vMistPhase;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
      }
      void main() {
        vec2 uv=vMistUv-0.5;
        float edge=1.0-smoothstep(0.14,0.51,length(uv*vec2(1.0,1.5)));
        vec2 flow=vMistUv*vec2(5.0,3.0)+vec2(time*0.024+vMistPhase,0);
        float density=noise(flow)*0.65+noise(flow*2.3)*0.35;
        float alpha=edge*smoothstep(0.20,0.82,density)*strength*0.18;
        gl_FragColor=vec4(vec3(0.71,0.79,0.75),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mist = new THREE.InstancedMesh(mistGeometry, mistMaterial, 18);
  mist.name = 'weather-local-low-mist';
  mist.userData.skipAO = true;
  const transform = new THREE.Object3D();
  for (let i = 0; i < mist.count; i++) {
    const x = (random()-0.5)*34, z = -random()*22+4;
    transform.position.set(x, groundHeight(x,z)+0.7+random()*0.6, z);
    transform.scale.set(9+random()*6, 1.6+random()*1.1, 1);
    transform.updateMatrix();
    mist.setMatrixAt(i,transform.matrix);
  }
  mist.frustumCulled = false;
  mist.visible = false;
  scene.add(mist);
  let lastTime = 0;
  return {
    update(time: number, weather: Weather, reducedMotion: boolean) {
      material.uniforms.time.value = reducedMotion ? time * 0.25 : time;
      material.uniforms.kind.value = weather === 'rain' ? 1 : weather === 'snow' ? 2 : 0;
      particles.visible = !reducedMotion && weather !== 'mist';
      const dt = Math.min(0.1, Math.max(0,time-lastTime));
      lastTime = time;
      mistMaterial.uniforms.time.value = reducedMotion ? 0 : time;
      mistMaterial.uniforms.strength.value = THREE.MathUtils.lerp(mistMaterial.uniforms.strength.value,weather === 'mist' ? 1 : 0,1-Math.exp(-dt*2));
      mist.visible = mistMaterial.uniforms.strength.value > 0.005;
    },
  };
}
