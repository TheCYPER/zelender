import * as THREE from 'three';

/** Code-generated sky only: every planted contour below it is scene geometry. */
export function createBackdrop(scene: THREE.Scene) {
  const width = 256, height = 128;
  const pixels = new Uint8Array(width * height * 4);
  const zenith = new THREE.Color('#789fba');
  const horizon = new THREE.Color('#c3d9e6');
  const below = new THREE.Color('#adbfc0');
  const color = new THREE.Color();
  for (let y = 0; y < height; y++) {
    // DataTexture row zero is V=0 (the lower pole in Three's equirectangular UVs).
    const elevation = -Math.cos(y / (height - 1) * Math.PI);
    for (let x = 0; x < width; x++) {
      color.copy(horizon).lerp(elevation > 0 ? zenith : below, Math.pow(Math.abs(elevation), 0.62));
      // Very faint broad cirrus in the sky, never a veil across the garden.
      const cloud = Math.max(0, Math.sin(x * 0.033 + y * 0.24) * Math.cos(y * 0.34 - x * 0.015) - 0.22)
        * THREE.MathUtils.smoothstep(elevation, 0.03, 0.23) * 0.10;
      color.lerp(horizon, cloud).convertLinearToSRGB();
      const index = (y * width + x) * 4;
      pixels[index] = Math.round(color.r * 255);
      pixels[index + 1] = Math.round(color.g * 255);
      pixels[index + 2] = Math.round(color.b * 255);
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = 'procedural-garden-sky';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  scene.background = texture;
  scene.backgroundRotation.set(0, 0, 0);
  scene.backgroundBlurriness = 0;
  return { dispose() { texture.dispose(); } };
}
