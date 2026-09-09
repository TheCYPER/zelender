import * as THREE from 'three';
import type { GardenController, ViewMode, Weather } from './types';
import { horizontal, POND, softTexture } from './scene/common';
import { createLandscape } from './scene/landscape';
import { createKoi } from './scene/koi';
import { createWater } from './scene/water';
import { createAquaticPlants } from './scene/aquatic-plants';
import { createWeather } from './scene/weather';
import { createRendering } from './scene/rendering';
import { createBackdrop } from './scene/backdrop';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { batchStaticMeshes } from './scene/batching';

const ATMOSPHERE: Record<Weather, { sky: string; light: number; sun: string; water: string }> = {
  sunny: { sky: '#accde5', light: 3.8, sun: '#fff0d9', water: '#234c42' },
  rain: { sky: '#899d9c', light: 1.2, sun: '#cfdee2', water: '#294b49' },
  snow: { sky: '#d6dfdf', light: 2.8, sun: '#e6eef3', water: '#4c6864' },
  mist: { sky: '#bacac5', light: 1.7, sun: '#e5eddf', water: '#31584e' },
};

/** A self-contained garden; its only persistent state is owned by the application. */
export function createGarden(host: HTMLElement, onInteraction?: (kind: 'feed' | 'startle') => void): GardenController {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'garden-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '可互动的日式锦鲤庭院。点击池水惊鱼，右键投食。键盘 F 投食，空格轻触水面。');
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ATMOSPHERE.sunny.sky);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 250);
  scene.add(camera);
  const sunlight = new THREE.DirectionalLight('#fff0d5', 3.8);
  sunlight.position.set(-14, 21, 5);
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
  const skylight = new THREE.HemisphereLight('#dce8f1', '#35362b', 0.55);
  scene.add(sunlight, skylight);
  const bounce = new THREE.DirectionalLight('#cddbe6', 0.2);
  bounce.position.set(8, 5, -10);
  scene.add(bounce);
  const landscape = createLandscape(scene);
  batchStaticMeshes(landscape.room);
  batchStaticMeshes(scene);
  const backdrop = createBackdrop(scene);
  const softMap = softTexture();
  const pondWater = createWater(scene);
  const aquaticPlants = createAquaticPlants(scene, pondWater.sampleHeight);
  const koi = createKoi(scene, softMap, (x, z) => {
    pondWater.impulse(x, z, 0.06);
    ripple(x, z, 0.3);
  }, (x, z, strength) => pondWater.impulse(x, z, strength));
  const water = pondWater.surface;
  const weatherEffects = createWeather(scene, renderer.getPixelRatio());
  const rendering = createRendering(renderer, scene, camera);

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
  const previousLoadComplete = THREE.DefaultLoadingManager.onLoad;
  const onAssetsLoaded = () => {
    previousLoadComplete?.();
    if (!disposed) { renderer.shadowMap.needsUpdate = true; rendering.invalidate(); }
  };
  THREE.DefaultLoadingManager.onLoad = onAssetsLoaded;
  let environment: THREE.WebGLRenderTarget | undefined;
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  environmentGenerator.compileEquirectangularShader();
  new HDRLoader().load(`${import.meta.env.BASE_URL}assets/environment/forest-slope-1k.hdr`, (texture) => {
    if (!disposed) {
      environment = environmentGenerator.fromEquirectangular(texture);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.45;
      renderer.shadowMap.needsUpdate = true;
    }
    texture.dispose();
    environmentGenerator.dispose();
  }, undefined, () => environmentGenerator.dispose());
  let elapsed = 0;
  let waterElapsed = 0;
  let lastFrame = performance.now();
  let frame = 0;
  let width = 1;
  let height = 1;
  let lastInteraction: null | { kind: 'feed' | 'startle'; x: number; z: number; time: number; affected: number } = null;
  let chimeRings = 0;
  let frameTiming = { intervalMs: 0, logicMs: 0, renderMs: 0 };
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
    const aspect = width / height;
    const narrow = THREE.MathUtils.clamp(1.4 / aspect - 1, 0, 1.5);
    const offset = width < 760 ? 0 : 0.5;
    if (view === 'room') {
      desiredPosition.set(offset + 0.2, 6.8 + narrow * 4, 19.6 + narrow * 8);
      desiredTarget.set(offset - 0.3, 1.5, -1.2);
    } else {
      desiredPosition.set(offset, 19 * Math.min(2, Math.max(1, 1.25 / aspect)), 5.3);
      desiredTarget.set(offset - 0.4, 0, 0.7);
    }
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    rendering.resize(width, height);
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
    if (kind === 'startle') { pondWater.impulse(x, z, 0.18); ripple(x, z, 1.0); }
    lastInteraction = { kind, x, z, time: elapsed, affected };
    onInteraction?.(kind);
  }

  function setPointerRay(event: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function waterHit(): THREE.Vector3 | null {
    return raycaster.intersectObject(water, false)[0]?.point ?? null;
  }
  let teaPointer: number | null = null;
  let teaShadowUntil = 0;
  let nextWindShadow = 0;
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  function cancelTea() {
    landscape.tea.cancel();
    const id = teaPointer;
    teaPointer = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    canvas.style.cursor = '';
    teaShadowUntil = elapsed + 1.5;
  }
  function onPointer(event: PointerEvent) {
    if (event.button !== 0 || teaPointer !== null) return;
    setPointerRay(event);
    if (view === 'room' && landscape.tea.pointerDown(raycaster)) {
      event.preventDefault();
      teaPointer = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (view === 'room' && raycaster.intersectObject(landscape.chimeTarget, true).length) {
      landscape.ringChime();
      chimeRings++;
      return;
    }
    const point = waterHit();
    if (point) interact('startle', point.x, point.z);
  }
  function onPointerMove(event: PointerEvent) {
    setPointerRay(event);
    if (teaPointer !== null) {
      if (event.pointerId === teaPointer) {
        // Chorded mouse buttons report intermediate releases as pointermove.
        if ((event.buttons & 1) === 0) onPointerUp(event);
        else landscape.tea.pointerMove(raycaster);
      }
      return;
    }
    canvas.style.cursor = view === 'room' && landscape.tea.hovered(raycaster) ? 'grab'
      : view === 'room' && raycaster.intersectObject(landscape.chimeTarget, true).length ? 'pointer' : '';
  }
  function onPointerUp(event: PointerEvent) {
    // The right button can be released during a left-held drinking gesture.
    if (event.pointerId !== teaPointer || (event.buttons & 1) !== 0) return;
    landscape.tea.pointerUp();
    teaPointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = '';
    teaShadowUntil = elapsed + 1.5;
  }
  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === teaPointer) cancelTea();
  }
  function onContext(event: MouseEvent) {
    setPointerRay(event);
    if (view === 'room' && landscape.tea.contextMenu(raycaster)) {
      event.preventDefault();
      teaShadowUntil = elapsed + 1.5;
      return;
    }
    const point = waterHit();
    if (!point) return;
    event.preventDefault();
    interact('feed', point.x, point.z);
  }
  function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); interact('feed', POND.x, POND.z); }
    else if (event.key === ' ') { event.preventDefault(); interact('startle', POND.x, POND.z); }
    else if (event.key.toLowerCase() === 'c' && view === 'room') { event.preventDefault(); landscape.ringChime(); chimeRings++; }
  }
  renderer.domElement.addEventListener('pointerdown', onPointer);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onPointerCancel);
  window.addEventListener('blur', cancelTea);
  renderer.domElement.addEventListener('contextmenu', onContext);
  renderer.domElement.addEventListener('keydown', onKey);

  const targetSky = new THREE.Color(ATMOSPHERE.sunny.sky);
  const targetSun = new THREE.Color(ATMOSPHERE.sunny.sun);
  const targetWater = new THREE.Color(ATMOSPHERE.sunny.water);
  function render(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    const interval = now - lastFrame;
    const dt = Math.min(interval / 1000, 0.05);
    const frameStart = performance.now();
    lastFrame = now;
    if (paused) return;
    elapsed += dt;
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.0);
    camera.position.lerp(desiredPosition, smoothing);
    cameraTarget.lerp(desiredTarget, smoothing);
    camera.lookAt(cameraTarget);
    landscape.room.visible = view === 'room' || camera.position.y < 15;
    if ('update' in landscape && typeof landscape.update === 'function') landscape.update(elapsed, reducedMotion);
    const atmosphere = ATMOSPHERE[weather];
    targetSky.set(atmosphere.sky);
    targetSun.set(atmosphere.sun);
    targetWater.set(atmosphere.water);
    if (scene.background instanceof THREE.Color) scene.background.lerp(targetSky, dt * 1.5);
    backdrop.update(elapsed, weather, reducedMotion);
    const skyBrightness = weather === 'rain' ? 0.9 : 1.0;
    scene.backgroundIntensity = THREE.MathUtils.lerp(scene.backgroundIntensity, skyBrightness, dt * 1.5);
    sunlight.color.lerp(targetSun, dt * 1.5);
    sunlight.intensity = THREE.MathUtils.lerp(sunlight.intensity, atmosphere.light, dt * 1.5);
    pondWater.color.lerp(targetWater, dt * 1.5);
    waterElapsed += dt * (reducedMotion ? 0.2 : 1);
    pondWater.update(waterElapsed, weather === 'rain');
    aquaticPlants.update(elapsed, reducedMotion);
    weatherEffects.update(elapsed, weather, reducedMotion);
    koi.update(elapsed, dt, reducedMotion);
    for (const item of ripples) {
      const age = elapsed - item.born;
      item.mesh.visible = age >= 0 && age < 2.9;
      if (!item.mesh.visible) continue;
      item.mesh.scale.setScalar(0.07 + age * item.strength);
      item.mesh.material.opacity = Math.max(0, 0.33 * (1 - age / 2.9));
    }
    // Trees move slowly: refresh their shadows without rebuilding static AO.
    if (!reducedMotion && elapsed >= nextWindShadow) {
      renderer.shadowMap.needsUpdate = true;
      nextWindShadow = elapsed + 0.65;
    }
    if (teaPointer !== null || elapsed < teaShadowUntil) renderer.shadowMap.needsUpdate = true;
    const renderStart = performance.now();
    rendering.render();
    frameTiming = { intervalMs: Math.round(interval), logicMs: Math.round(renderStart - frameStart), renderMs: Math.round(performance.now() - renderStart) };
    renderer.shadowMap.autoUpdate = false;
  }
  frame = requestAnimationFrame(render);

  return {
    setView(next) { cancelTea(); view = next; cameraDestination(); },
    setWeather(next) { weather = next; landscape.snow.visible = next === 'snow'; renderer.shadowMap.needsUpdate = true; rendering.invalidate(); },
    feed() { interact('feed', POND.x, POND.z); },
    startle() { interact('startle', POND.x, POND.z); },
    setPaused(value) { if (value) cancelTea(); paused = value; lastFrame = performance.now(); },
    getDebugState() {
      const center = new THREE.Vector3(POND.x, POND.waterY, POND.z).project(camera);
      const chime = landscape.chimeTarget.localToWorld(new THREE.Vector3(0, -0.27, 0)).project(camera);
      return {
        view, weather, paused, reducedMotion, elapsed: Math.round(elapsed * 10) / 10,
        camera: camera.position.toArray(),
        projectedPondCenter: { x: Math.round((center.x + 1) * width / 2), y: Math.round((1 - center.y) * height / 2) },
        lastInteraction,
        waves: pondWater.debug(),
        aquaticPlants: aquaticPlants.debug(),
        tea: landscape.tea.debug(camera, width, height),
        chime: { rings: chimeRings, angle: landscape.chimeTarget.rotation.z, screen: { x: Math.round((chime.x + 1) * width / 2), y: Math.round((1 - chime.y) * height / 2) } },
        ...koi.debug(elapsed, camera, width, height),
        renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
        frameTiming,
      };
    },
    dispose() {
      cancelTea();
      disposed = true;
      if (THREE.DefaultLoadingManager.onLoad === onAssetsLoaded) THREE.DefaultLoadingManager.onLoad = previousLoadComplete;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      reducedMotionQuery.removeEventListener('change', onReducedMotion);
      renderer.domElement.removeEventListener('pointerdown', onPointer);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onPointerCancel);
      window.removeEventListener('blur', cancelTea);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      renderer.domElement.removeEventListener('keydown', onKey);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
        if (object instanceof THREE.InstancedMesh) object.dispose();
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
      landscape.dispose();
      backdrop.dispose();
      sunlight.shadow.dispose();
      environment?.dispose();
      rendering.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
