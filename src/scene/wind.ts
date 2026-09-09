import * as THREE from 'three';

function noise(t: number, seed: number) {
  const i = Math.floor(t), f = t - i, smooth = f * f * (3 - 2 * f);
  const hash = (n: number) => {
    const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  return THREE.MathUtils.lerp(hash(i), hash(i + 1), smooth);
}

/** Slowly arriving gusts: reproducible, continuous, and independent of frame rate. */
export function sampleWind(time: number, x = 0, z = 0) {
  const t = time + x * 0.075 + z * 0.045;
  const strength = 0.45 + noise(t * 0.11, 17) * 0.23 + noise(t * 0.29, 73) * 0.12;
  return {
    x: (noise(t * 0.23, 19) * 0.78 + Math.sin(t * 0.82) * 0.22) * strength,
    z: (noise(t * 0.17, 43) * 0.80 + Math.sin(t * 0.67 + 1.7) * 0.20) * strength,
    strength,
  };
}

export interface WindState {
  time: { value: number };
  direction: { value: THREE.Vector2 };
  enabled: { value: number };
}

export function createWindState(): WindState {
  return { time: { value: 0 }, direction: { value: new THREE.Vector2() }, enabled: { value: 1 } };
}

export function updateWind(state: WindState, time: number, reducedMotion: boolean) {
  const wind = sampleWind(time);
  state.time.value = time;
  state.direction.value.set(wind.x, wind.z);
  state.enabled.value = reducedMotion ? 0 : 1;
}

/** Keep stems anchored; only the flexible part of each leaf/crown catches wind. */
export function addFoliageWind(material: THREE.MeshStandardMaterial, wind: WindState, strength: number, weighted = false) {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.naturalWindTime = wind.time;
    shader.uniforms.naturalWindDirection = wind.direction;
    shader.uniforms.naturalWindEnabled = wind.enabled;
    shader.vertexShader = `uniform float naturalWindTime; uniform vec2 naturalWindDirection; uniform float naturalWindEnabled;\n${weighted ? 'attribute float windWeight;\n' : ''}` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float windFlex = ${weighted ? 'windWeight' : 'pow(clamp(position.y + 0.10, 0.0, 1.3), 2.0)'};
      float windPhase = position.x*1.7 + position.z*2.3;
      #ifdef USE_INSTANCING
        windPhase += instanceMatrix[3].x*0.17 + instanceMatrix[3].z*0.23;
      #endif
      vec2 flutter = vec2(sin(naturalWindTime*1.9+windPhase),cos(naturalWindTime*1.53+windPhase))*0.16;
      transformed.xz += (naturalWindDirection + flutter) * windFlex * ${strength.toFixed(4)} * naturalWindEnabled;
    `);
  };
  material.customProgramCacheKey = () => `${key}-natural-wind-${strength}-${weighted}`;
}
