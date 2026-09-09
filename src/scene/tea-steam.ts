import * as THREE from 'three';
import { randomGenerator } from './common';

export type TeaSteamSource = {
  name: string;
  object: THREE.Object3D;
  point: THREE.Vector3;
  enabled(): boolean;
  count: number;
  rate: number;
  life: number;
  opacity: number;
  size?: number;
  verticalSpread?: number;
};

/** Birth positions follow the hot object; emitted vapour belongs to the air. */
export function createTeaSteam(parent: THREE.Object3D, sources: TeaSteamSource[], texture?: THREE.Texture) {
  const random = randomGenerator(24019);
  const emitters = sources.map(source => ({ source, credit: 0, next: 0 }));
  const particles = emitters.flatMap((emitter, sourceIndex) => Array.from({ length: emitter.source.count }, (_, index) => ({
    sourceIndex, id: `${sourceIndex}:${index}`, age: -1, life: emitter.source.life,
    birth: new THREE.Vector3(), position: new THREE.Vector3(),
    velocity: new THREE.Vector3(), phase: random() * Math.PI * 2,
  })));
  const offsets = emitters.map((_, index) => sources.slice(0, index).reduce((sum, source) => sum + source.count, 0));
  const positions = new Float32Array(particles.length * 3);
  const alphas = new Float32Array(particles.length);
  const sizes = new Float32Array(particles.length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('steamAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('steamSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.PointsMaterial({
    map: texture ?? null, color: '#e7eeea', size: 0.16, transparent: true, opacity: 1, depthWrite: false,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float steamAlpha; attribute float steamSize; varying float vSteamAlpha;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * steamSize; vSteamAlpha = steamAlpha;');
    shader.fragmentShader = 'varying float vSteamAlpha;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_particle_fragment>', '#include <map_particle_fragment>\n diffuseColor.a *= vSteamAlpha;');
  };
  material.customProgramCacheKey = () => 'world-space-tea-steam-v1';
  const points = new THREE.Points(geometry, material);
  points.name = 'independent-tea-steam';
  points.userData.skipAO = true;
  points.frustumCulled = false;
  points.visible = false;
  parent.add(points);
  const inverse = new THREE.Matrix4();
  const local = new THREE.Vector3();
  let disposed = false;

  function clear() {
    particles.forEach(particle => { particle.age = -1; });
    emitters.forEach(emitter => { emitter.credit = 0; });
    alphas.fill(0);
    geometry.getAttribute('steamAlpha').needsUpdate = true;
    points.visible = false;
  }

  return {
    points,
    clear,
    update(dt: number, reducedMotion: boolean) {
      if (disposed) return;
      if (reducedMotion) { clear(); return; }
      const step = THREE.MathUtils.clamp(dt, 0, 0.06);
      for (const particle of particles) {
        if (particle.age < 0) continue;
        particle.age += step;
        if (particle.age >= particle.life) { particle.age = -1; continue; }
        // The integration is explicitly in world axes. Neither current pot
        // tilt nor a later parent transform can rotate an existing plume.
        particle.position.copy(particle.birth).addScaledVector(particle.velocity, particle.age);
        particle.position.x += (Math.sin(particle.phase + particle.age * 2.2) - Math.sin(particle.phase)) * 0.013;
        particle.position.z += (Math.cos(particle.phase + particle.age * 1.7) - Math.cos(particle.phase)) * 0.01;
      }
      for (const [sourceIndex, emitter] of emitters.entries()) {
        const source = emitter.source;
        if (!source.enabled()) { emitter.credit = 0; continue; }
        source.object.updateWorldMatrix(true, false);
        emitter.credit += step * source.rate;
        while (emitter.credit >= 1) {
          emitter.credit--;
          const particle = particles[offsets[sourceIndex] + emitter.next];
          emitter.next = (emitter.next + 1) % source.count;
          local.copy(source.point);
          local.y += (random() - 0.5) * (source.verticalSpread ?? 0);
          particle.birth.copy(source.object.localToWorld(local));
          // Tiny world-horizontal variation avoids a perfectly rigid column.
          particle.birth.x += (random() - 0.5) * 0.025;
          particle.birth.z += (random() - 0.5) * 0.025;
          particle.position.copy(particle.birth);
          particle.velocity.set((random() - 0.5) * 0.013, 0.17 + random() * 0.075, (random() - 0.5) * 0.012);
          particle.age = 0;
        }
      }
      points.updateWorldMatrix(true, false);
      inverse.copy(points.matrixWorld).invert();
      let living = 0;
      particles.forEach((particle, index) => {
        if (particle.age < 0) { alphas[index] = 0; sizes[index] = 0; return; }
        living++;
        const progress = particle.age / particle.life;
        const source = sources[particle.sourceIndex];
        local.copy(particle.position).applyMatrix4(inverse);
        local.toArray(positions, index * 3);
        alphas[index] = Math.sin(progress * Math.PI) ** 0.8 * source.opacity;
        sizes[index] = (0.65 + progress * 1.7) * (source.size ?? 1);
      });
      points.visible = living > 0;
      for (const name of ['position', 'steamAlpha', 'steamSize']) geometry.getAttribute(name).needsUpdate = true;
    },
    debug() {
      const live = particles.filter(particle => particle.age >= 0);
      const counts = Object.fromEntries(sources.map((source, index) => [source.name, live.filter(particle => particle.sourceIndex === index).length]));
      return {
        visible: points.visible, counts,
        samples: sources.flatMap((source, index) => live.filter(particle => particle.sourceIndex === index).slice(0, 2).map(particle => ({
          id: particle.id, source: source.name, age: particle.age, birth: particle.birth.toArray(), position: particle.position.toArray(),
        }))),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
