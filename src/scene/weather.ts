import * as THREE from 'three';
import type { Weather } from '../types';
import { randomGenerator } from './common';

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
  return {
    update(time: number, weather: Weather, reducedMotion: boolean) {
      material.uniforms.time.value = reducedMotion ? time * 0.25 : time;
      material.uniforms.kind.value = weather === 'rain' ? 1 : weather === 'snow' ? 2 : 0;
      particles.visible = !reducedMotion;

    },
  };
}
