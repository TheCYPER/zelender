import * as THREE from 'three';

/** A locally bundled CC0 mountain panorama, independent of material lighting. */
export function createBackdrop(scene: THREE.Scene) {
  let disposed = false;
  const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/environment/mountain-background.jpg`, (loaded) => {
    if (disposed) { loaded.dispose(); return; }
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = loaded;
    // The veranda camera looks down toward the pond. Lower the distant horizon
    // in its photographic plate so the ridge, rather than the nearby field,
    // remains visible above the planted garden.
    scene.backgroundRotation.set(-0.42, Math.PI / 2, 0, 'YXZ');
    scene.backgroundBlurriness = 0;
  });
  return { dispose() { disposed = true; texture.dispose(); } };
}
