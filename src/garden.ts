import * as THREE from 'three';
import type { GardenController, ViewMode, Weather } from './types';
import { horizontal, noiseTexture, POND, softTexture } from './scene/common';
import { createLandscape } from './scene/landscape';
import { createKoi } from './scene/koi';
import { createWater } from './scene/water';
import { createWeather } from './scene/weather';

const ATMOSPHERE: Record<Weather, { sky: string; fog: number; light: number; sun: string; water: string }> = {
  sunny: { sky: '#c7d3c2', fog: 0.015, light: 3.1, sun: '#fff0d5', water: '#477c6b' },
  rain: { sky: '#7c9394', fog: 0.029, light: 1.0, sun: '#c2d5db', water: '#4d7372' },
  snow: { sky: '#c2cfcd', fog: 0.025, light: 2.1, sun: '#e3edf1', water: '#6c8e87' },
  mist: { sky: '#c6d1c0', fog: 0.047, light: 1.6, sun: '#f6edda', water: '#648478' },
};

/** A self-contained garden; its only persistent state is owned by the application. */
export function createGarden(host: HTMLElement, onInteraction?: (kind: 'feed' | 'startle') => void): GardenController {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'garden-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '可互动的日式锦鲤庭院。点击池水惊鱼，右键投食。键盘 F 投食，空格轻触水面。');
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ATMOSPHERE.sunny.sky);
  const fog = new THREE.FogExp2(ATMOSPHERE.sunny.sky, ATMOSPHERE.sunny.fog);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 130);
  scene.add(camera);
  // The near cedar frame preserves a room view on every aspect ratio.
  const roomFrame = new THREE.Group();
  camera.add(roomFrame);
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#76583d', map: noiseTexture('wood', 91), roughness: 0.75, transparent: true });
  const postGeometry = new THREE.BoxGeometry(1, 1, 1);
  const frameParts = Array.from({ length: 3 }, () => {
    const post = new THREE.Mesh(postGeometry, frameMaterial);
    roomFrame.add(post);
    return post;
  });
  const sunlight = new THREE.DirectionalLight('#fff0d5', 3.1);
  sunlight.position.set(-7, 16, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -18;
  sunlight.shadow.camera.right = 18;
  sunlight.shadow.camera.top = 15;
  sunlight.shadow.camera.bottom = -15;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 48;
  sunlight.shadow.normalBias = 0.045;
  sunlight.shadow.bias = -0.0002;
  sunlight.shadow.radius = 3;
  scene.add(sunlight, new THREE.HemisphereLight('#e2e9d6', '#596b46', 2.0));
  const bounce = new THREE.DirectionalLight('#d7e6da', 0.5);
  bounce.position.set(8, 5, -10);
  scene.add(bounce);
  const landscape = createLandscape(scene);
  const softMap = softTexture();
  const koi = createKoi(scene, softMap);

  const pondWater = createWater(scene);
  const water = pondWater.surface;
  const weatherEffects = createWeather(scene, softMap, renderer.getPixelRatio());

  const ripples = Array.from({ length: 24 }, () => {
    const material = new THREE.MeshBasicMaterial({ color: '#dce7ca', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 vRippleWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRippleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = 'varying vec3 vRippleWorld;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
        vec2 pond = (vRippleWorld.xz - vec2(${POND.x}, ${POND.z})) / vec2(${POND.rx}, ${POND.rz});
        float angle = atan(pond.y, pond.x);
        float shore = 1.0 + 0.075 * sin(angle * 3.0 + 0.5) + 0.045 * cos(angle * 5.0 - 0.4);
        if (length(pond) > shore * 0.99) discard;
      `);
    };
    const mesh = new THREE.Mesh(horizontal(new THREE.RingGeometry(0.965, 1, 96)), material);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, born: -100, strength: 1 };
  });
  let rippleIndex = 0;
  let view: ViewMode = 'room';
  let weather: Weather = 'sunny';
  let paused = false;
  let disposed = false;
  let elapsed = 0;
  let lastFrame = performance.now();
  let frame = 0;
  let width = 1;
  let height = 1;
  let lastInteraction: null | { kind: 'feed' | 'startle'; x: number; z: number; time: number; affected: number } = null;
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;
  const onReducedMotion = () => { reducedMotion = reducedMotionQuery.matches; };
  reducedMotionQuery.addEventListener('change', onReducedMotion);
  const cameraTarget = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function cameraDestination() {
    const mobile = width < 760;
    const offset = mobile ? 0 : 2.15;
    if (view === 'room') {
      desiredPosition.set(offset + 0.2, mobile ? 10.5 : 8.2, mobile ? 24 : 19.6);
      desiredTarget.set(offset - 0.3, 1.2, -0.8);
    } else {
      desiredPosition.set(offset, mobile ? 24.5 : 19.0, 5.3);
      desiredTarget.set(offset - 0.4, 0, 0.7);
    }
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
    const halfWidth = halfHeight * camera.aspect;
    frameParts[0].position.set(-halfWidth * 0.992, 0, -2);
    frameParts[1].position.set(halfWidth * 0.992, 0, -2);
    for (let i = 0; i < 2; i++) frameParts[i].scale.set(halfWidth * 0.075, halfHeight * 2.2, 0.11);
    frameParts[2].position.set(0, halfHeight * 1.01, -2);
    frameParts[2].scale.set(halfWidth * 2.15, halfHeight * 0.11, 0.15);
    cameraDestination();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  camera.position.copy(desiredPosition);
  cameraTarget.copy(desiredTarget);
  camera.lookAt(cameraTarget);

  function ripple(x: number, z: number, strength: number) {
    for (let i = 0; i < 3; i++) {
      const item = ripples[rippleIndex];
      item.born = elapsed + i * 0.16;
      item.strength = strength;
      item.mesh.position.set(x, POND.waterY + 0.04 + i * 0.001, z);
      item.mesh.visible = true;
      rippleIndex = (rippleIndex + 1) % ripples.length;
    }
  }

  function interact(kind: 'feed' | 'startle', x: number, z: number) {
    const affected = kind === 'feed' ? koi.feed(x, z, elapsed) : koi.startle(x, z, elapsed);
    ripple(x, z, kind === 'feed' ? 0.65 : 1.3);
    lastInteraction = { kind, x, z, time: elapsed, affected };
    onInteraction?.(kind);
  }

  function hit(event: MouseEvent): THREE.Vector3 | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(water, false);
    return hits[0]?.point ?? null;
  }
  function onPointer(event: PointerEvent) {
    if (event.button !== 0) return;
    const point = hit(event);
    if (point) interact('startle', point.x, point.z);
  }
  function onContext(event: MouseEvent) {
    const point = hit(event);
    if (!point) return;
    event.preventDefault();
    interact('feed', point.x, point.z);
  }
  function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); interact('feed', POND.x, POND.z); }
    else if (event.key === ' ') { event.preventDefault(); interact('startle', POND.x, POND.z); }
  }
  renderer.domElement.addEventListener('pointerdown', onPointer);
  renderer.domElement.addEventListener('contextmenu', onContext);
  renderer.domElement.addEventListener('keydown', onKey);

  const targetSky = new THREE.Color(ATMOSPHERE.sunny.sky);
  const targetSun = new THREE.Color(ATMOSPHERE.sunny.sun);
  const targetWater = new THREE.Color(ATMOSPHERE.sunny.water);
  function render(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (paused) return;
    elapsed += dt;
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.0);
    camera.position.lerp(desiredPosition, smoothing);
    cameraTarget.lerp(desiredTarget, smoothing);
    camera.lookAt(cameraTarget);
    landscape.room.visible = view === 'room' || camera.position.y < 15;
    frameMaterial.opacity = THREE.MathUtils.lerp(frameMaterial.opacity, view === 'room' ? 1 : 0, smoothing);
    roomFrame.visible = frameMaterial.opacity > 0.015;
    const atmosphere = ATMOSPHERE[weather];
    targetSky.set(atmosphere.sky);
    targetSun.set(atmosphere.sun);
    targetWater.set(atmosphere.water);
    (scene.background as THREE.Color).lerp(targetSky, dt * 1.5);
    fog.color.copy(scene.background as THREE.Color);
    fog.density = THREE.MathUtils.lerp(fog.density, atmosphere.fog, dt * 1.5);
    sunlight.color.lerp(targetSun, dt * 1.5);
    sunlight.intensity = THREE.MathUtils.lerp(sunlight.intensity, atmosphere.light, dt * 1.5);
    pondWater.color.lerp(targetWater, dt * 1.5);
    pondWater.update(reducedMotion ? elapsed * 0.2 : elapsed, weather === 'rain');
    weatherEffects.update(elapsed, weather, reducedMotion);
    koi.update(elapsed, dt, reducedMotion);
    for (const item of ripples) {
      const age = elapsed - item.born;
      item.mesh.visible = age >= 0 && age < 2.9;
      if (!item.mesh.visible) continue;
      item.mesh.scale.setScalar(0.07 + age * item.strength);
      item.mesh.material.opacity = Math.max(0, 0.33 * (1 - age / 2.9));
    }
    renderer.render(scene, camera);
    renderer.shadowMap.autoUpdate = false;
  }
  frame = requestAnimationFrame(render);

  return {
    setView(next) { view = next; cameraDestination(); },
    setWeather(next) { weather = next; landscape.snow.visible = next === 'snow'; renderer.shadowMap.needsUpdate = true; },
    feed() { interact('feed', POND.x, POND.z); },
    startle() { interact('startle', POND.x, POND.z); },
    setPaused(value) { paused = value; lastFrame = performance.now(); },
    getDebugState() {
      const center = new THREE.Vector3(POND.x, POND.waterY, POND.z).project(camera);
      return {
        view, weather, paused, reducedMotion, elapsed: Math.round(elapsed * 10) / 10,
        camera: camera.position.toArray(),
        projectedPondCenter: { x: Math.round((center.x + 1) * width / 2), y: Math.round((1 - center.y) * height / 2) },
        lastInteraction,
        ...koi.debug(elapsed, camera, width, height),
        renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
      };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      reducedMotionQuery.removeEventListener('change', onReducedMotion);
      renderer.domElement.removeEventListener('pointerdown', onPointer);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      renderer.domElement.removeEventListener('keydown', onKey);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      pondWater.dispose();
      sunlight.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
