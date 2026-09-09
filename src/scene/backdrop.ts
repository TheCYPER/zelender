import * as THREE from 'three';
import type { Weather } from '../types';

const FACE_SIZE = 512;
const FACE_PIXELS = FACE_SIZE * FACE_SIZE;
const PIXELS = FACE_PIXELS * 6;
const WEATHER_ORDER: Weather[] = ['sunny', 'rain', 'snow', 'mist'];

const SKIES: Record<Weather, {
  zenith: string; horizon: string; below: string;
  cloudLight: string; cloudShade: string; threshold: number; softness: number;
}> = {
  sunny: { zenith: '#247fca', horizon: '#74b9ea', below: '#8aafc6', cloudLight: '#fffef9', cloudShade: '#9aaec3', threshold: 0.525, softness: 0.145 },
  rain: { zenith: '#6b86a1', horizon: '#bbc9d4', below: '#80929f', cloudLight: '#c7d1db', cloudShade: '#71859e', threshold: 0.32, softness: 0.20 },
  snow: { zenith: '#8faecb', horizon: '#d4e3ed', below: '#a2b4c0', cloudLight: '#f3f5f6', cloudShade: '#b3c2d1', threshold: 0.37, softness: 0.22 },
  mist: { zenith: '#78a7cd', horizon: '#cbdee9', below: '#9bacb6', cloudLight: '#edf2f3', cloudShade: '#a1b9cc', threshold: 0.44, softness: 0.20 },
};

function hash(x: number, y: number) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  // Quintic interpolation keeps the density and its slope smooth at cell edges.
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const lower = THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), fx);
  const upper = THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx);
  return THREE.MathUtils.lerp(lower, upper, fy);
}

function cloudNoise(x: number, y: number) {
  let value = 0, amplitude = 0.58;
  for (let octave = 0; octave < 4; octave++) {
    value += noise(x, y) * amplitude;
    // A rotated, non-integer octave transform avoids a repeated square pattern.
    const nextX = x * 1.77 + y * 0.91 + 17.31;
    y = y * 1.77 - x * 0.91 - 8.47;
    x = nextX;
    amplitude *= 0.43;
  }
  return value;
}

/** Sky-only cloud field. The connected garden terrain remains actual geometry. */
export function createBackdrop(scene: THREE.Scene) {
  const density = new Float32Array(PIXELS);
  const illumination = new Float32Array(PIXELS);
  const elevations = new Float32Array(PIXELS);
  const direction = new THREE.Vector3();

  for (let face = 0; face < 6; face++) {
    for (let row = 0; row < FACE_SIZE; row++) {
      for (let column = 0; column < FACE_SIZE; column++) {
        const u = (column + 0.5) / FACE_SIZE * 2 - 1;
        const v = (row + 0.5) / FACE_SIZE * 2 - 1;
        // OpenGL cube-face coordinates. Sampling a shared direction field
        // makes adjacent faces continuous, including the cloud layer.
        if (face === 0) direction.set(1, -v, -u);
        else if (face === 1) direction.set(-1, -v, u);
        else if (face === 2) direction.set(u, 1, v);
        else if (face === 3) direction.set(u, -1, -v);
        else if (face === 4) direction.set(u, -v, 1);
        else direction.set(-u, -v, -1);
        direction.normalize();
        const elevation = direction.y;
        const index = face * FACE_PIXELS + row * FACE_SIZE + column;
        elevations[index] = elevation;
        if (elevation <= 0.025) continue;
        // Project a ray onto a horizontal cloud layer: cloud shapes become
        // finer towards the horizon, without a veil across the garden.
        const stretch = 0.95 / Math.max(0.035, elevation);
        const x = direction.x * stretch + 7.1;
        const y = direction.z * stretch - 11.8;
        const warpX = (noise(x * 0.68 - 4, y * 0.68 + 3) - 0.5) * 1.1;
        const warpY = (noise(y * 0.73 + 6, x * 0.73 - 2) - 0.5) * 1.1;
        const field = cloudNoise(x + warpX, y + warpY);
        const sunward = cloudNoise(x - 0.12 + warpX, y + 0.09 + warpY);
        density[index] = field;
        // Lit rims and gently blue undersides suggest thickness without sharp,
        // cartoon outlines. Fine turbulence provides broken, feathered edges.
        illumination[index] = THREE.MathUtils.clamp(0.76 + (field - sunward) * 4.2 + elevation * 0.09, 0.25, 1);
      }
    }
  }

  const skies = WEATHER_ORDER.map(weather => {
    const palette = SKIES[weather];
    const zenith = new THREE.Color(palette.zenith);
    const horizon = new THREE.Color(palette.horizon);
    const below = new THREE.Color(palette.below);
    const cloudLight = new THREE.Color(palette.cloudLight);
    const cloudShade = new THREE.Color(palette.cloudShade);
    const skyColor = new THREE.Color(), color = new THREE.Color(), cloudColor = new THREE.Color();
    const pixels = new Uint8Array(PIXELS * 4);
    for (let index = 0; index < PIXELS; index++) {
      const elevation = elevations[index];
      skyColor.copy(horizon).lerp(elevation > 0 ? zenith : below, Math.pow(Math.abs(elevation), 0.62));
      const horizonCloud = THREE.MathUtils.smoothstep(elevation, 0.055, 0.19);
      const cloud = THREE.MathUtils.smoothstep(density[index], palette.threshold, palette.threshold + palette.softness) * horizonCloud;
      cloudColor.copy(cloudShade).lerp(cloudLight, illumination[index]);
      color.copy(skyColor).lerp(cloudColor, cloud).convertLinearToSRGB();
      pixels[index * 4] = Math.round(color.r * 255);
      pixels[index * 4 + 1] = Math.round(color.g * 255);
      pixels[index * 4 + 2] = Math.round(color.b * 255);
      pixels[index * 4 + 3] = 255;
    }
    return pixels;
  });

  const pixels = skies[0].slice();
  const faces = Array.from({ length: 6 }, (_, face) => new THREE.DataTexture(
    pixels.subarray(face * FACE_PIXELS * 4, (face + 1) * FACE_PIXELS * 4), FACE_SIZE, FACE_SIZE, THREE.RGBAFormat,
  ));
  // Direct cube faces update on the GPU. Three caches the conversion of an
  // equirectangular background and would otherwise retain the first weather.
  const texture = new THREE.CubeTexture(faces);
  texture.name = 'procedural-blue-sky-and-cumulus';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  scene.background = texture;
  scene.backgroundRotation.set(0, 0, 0);
  scene.backgroundBlurriness = 0;

  const transitionFrom = pixels.slice();
  let targetWeather = 0, transitionTime = 3;
  let lastTime = 0, lastBlend = -1, drift = 0;
  let disposed = false;

  return {
    update(time: number, weather: Weather, reducedMotion: boolean) {
      if (disposed) return;
      const dt = THREE.MathUtils.clamp(time - lastTime, 0, 0.1);
      lastTime = time;
      // Freeze the present sky angle under reduced motion, without a visible
      // position jump when the system preference changes.
      if (!reducedMotion) drift += dt * (weather === 'rain' ? 0.0010 : 0.00045);
      scene.backgroundRotation.y = drift;
      const active = WEATHER_ORDER.indexOf(weather);
      if (active !== targetWeather) {
        transitionFrom.set(pixels);
        targetWeather = active;
        transitionTime = 0;
      }
      if (transitionTime >= 3) return;
      transitionTime = Math.min(3, transitionTime + dt);
      // Upload only while weather changes, at most five times per second. The
      // garden's regular frame loop never regenerates noise or cloud shapes.
      if (time - lastBlend < 0.2 && transitionTime < 3) return;
      lastBlend = time;
      const blend = THREE.MathUtils.smoothstep(transitionTime, 0, 3);
      const target = skies[targetWeather];
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = Math.round(transitionFrom[i] + (target[i] - transitionFrom[i]) * blend);
        pixels[i + 1] = Math.round(transitionFrom[i + 1] + (target[i + 1] - transitionFrom[i + 1]) * blend);
        pixels[i + 2] = Math.round(transitionFrom[i + 2] + (target[i + 2] - transitionFrom[i + 2]) * blend);
      }
      texture.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scene.background === texture) scene.background = null;
      texture.dispose();
      faces.forEach(face => face.dispose());
      skies.length = 0;
    },
  };
}
