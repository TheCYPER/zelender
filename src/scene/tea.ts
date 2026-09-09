import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { softTexture } from './common';
import { batchStaticMeshes } from './batching';
import { createChimeSound } from './chime-audio';

type Pendulum = { angle: number; velocity: number };

function advancePendulum(state: Pendulum, stiffness: number, damping: number, force: number, dt: number, limit = Math.PI) {
  const acceleration = -stiffness * Math.sin(state.angle) - damping * state.velocity + force;
  state.velocity += acceleration * dt;
  state.angle += state.velocity * dt;
  if (Math.abs(state.angle) > limit) {
    state.angle = Math.sign(state.angle) * limit;
    state.velocity *= -0.2;
  }
  return acceleration;
}

/** The veranda objects stay in world space, so their silhouettes have real parallax. */
export function createTeaCorner(room: THREE.Group, wood: THREE.MeshStandardMaterial, darkWood: THREE.MeshStandardMaterial) {
  const tabletopWood = wood.clone();
  const furnitureTextureLoader = new THREE.TextureLoader();
  // Furniture spans several narrow boards; keep the scanned grain at a natural
  // scale instead of inheriting the long veranda-plank UV transform.
  for (const key of ['map', 'normalMap', 'roughnessMap'] as const) {
    const source = wood[key];
    if (!source) continue;
    const texture = furnitureTextureLoader.load(`${import.meta.env.BASE_URL}assets/textures/${source.name}`);
    texture.colorSpace = source.colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = source.anisotropy;
    texture.rotation = Math.PI / 2;
    texture.repeat.set(0.24, 1.4);
    texture.offset.set(0.21, 0.05);
    tabletopWood[key] = texture;
  }
  const table = new THREE.Group();
  table.name = 'low-cedar-tea-table';
  table.position.set(-2.6, 0.715, 10.25);
  table.rotation.y = -0.09;
  room.add(table);
  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  add(table, new RoundedBoxGeometry(3.25, 0.16, 1.92, 3, 0.035), tabletopWood, 0, 0.87, 0);
  // Recessed apron and separate legs make the table read as furniture, not a slab.
  for (const x of [-1.34, 1.34]) {
    for (const z of [-0.67, 0.67]) {
      const leg = add(table, new RoundedBoxGeometry(0.17, 0.79, 0.19, 2, 0.015), darkWood, x, 0.405, z);
      leg.rotation.z = x < 0 ? -0.035 : 0.035;
    }
    add(table, new THREE.BoxGeometry(0.09, 0.18, 1.45), darkWood, x, 0.71, 0);
  }
  for (const z of [-0.68, 0.68]) add(table, new THREE.BoxGeometry(2.68, 0.18, 0.085), darkWood, 0, 0.71, z);

  const getaPair = new THREE.Group();
  getaPair.name = 'paired-wooden-geta';
  getaPair.position.set(2.25, 0.72, 10.55);
  getaPair.rotation.y = -0.28;
  room.add(getaPair);
  const paulownia = tabletopWood.clone();
  paulownia.color.set('#bdb095');
  paulownia.roughness = 0.86;
  const thong = new THREE.MeshStandardMaterial({ color: '#293b39', roughness: 0.98 });
  const geta = new THREE.Group();
  geta.name = 'left-geta';
  getaPair.add(geta);
  // Separate ha supports, rounded wooden sole and raised Y-shaped hanao straps.
  add(geta, new RoundedBoxGeometry(0.40, 0.095, 0.88, 4, 0.044), paulownia, 0, 0.20, 0);
  for (const z of [-0.24, 0.23]) add(geta, new RoundedBoxGeometry(0.34, 0.15, 0.105, 2, 0.012), paulownia, 0, 0.076, z);
  const strapPath = (side: number) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(side*0.16,0.247,0.10),new THREE.Vector3(side*0.11,0.39,-0.02),
    new THREE.Vector3(side*0.035,0.37,-0.18),new THREE.Vector3(0,0.26,-0.25),
  ]);
  for (const side of [-1,1]) add(geta, new THREE.TubeGeometry(strapPath(side),16,0.025,8,false),thong,0,0,0);
  const secondGeta = geta.clone();
  secondGeta.name = 'right-geta';
  secondGeta.position.set(0.57,0,0.09);
  secondGeta.rotation.y = 0.13;
  getaPair.add(secondGeta);
  batchStaticMeshes(getaPair,true);

  const linen = new THREE.MeshStandardMaterial({ color: '#b7b09a', roughness: 1, side: THREE.DoubleSide });
  const cloth = new THREE.PlaneGeometry(0.73, 1.5, 16, 20);
  const positions = cloth.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i);
    positions.setXYZ(i, x, y, Math.sin(x * 22 + y * 9) * 0.004 + Math.cos(y * 16) * 0.002);
  }
  cloth.computeVertexNormals();
  const clothMesh = add(table, cloth, linen, -0.83, 0.963, 0.08);
  clothMesh.rotation.x = -Math.PI / 2;
  clothMesh.rotation.z = -0.08;

  const tray = new THREE.Group();
  tray.position.set(0.31, 0.973, -0.06);
  tray.rotation.y = 0.06;
  table.add(tray);
  add(tray, new RoundedBoxGeometry(1.67, 0.055, 1.20, 3, 0.035), darkWood, 0, 0, 0);
  for (const z of [-0.57, 0.57]) add(tray, new RoundedBoxGeometry(1.62, 0.09, 0.045, 2, 0.01), wood, 0, 0.035, z);
  for (const x of [-0.81, 0.81]) add(tray, new RoundedBoxGeometry(0.045, 0.09, 1.10, 2, 0.01), wood, x, 0.035, 0);

  const clay = new THREE.MeshPhysicalMaterial({ color: '#514b3d', roughness: 0.32, metalness: 0.03, clearcoat: 0.38, clearcoatRoughness: 0.31 });
  const glaze = new THREE.MeshPhysicalMaterial({ color: '#adb9a1', roughness: 0.24, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.22, side: THREE.DoubleSide });
  const darkCeramic = new THREE.MeshStandardMaterial({ color: '#3a3529', roughness: 0.45 });
  const lathe = (points: number[][]) => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 48);
  const pot = new THREE.Group();
  pot.name = 'ceramic-teapot';
  pot.position.set(-0.12, 0.033, -0.1);
  pot.rotation.y = 0.22;
  tray.add(pot);
  add(pot, lathe([[0,0],[0.18,0],[0.26,0.032],[0.34,0.14],[0.365,0.25],[0.34,0.36],[0.26,0.44],[0.20,0.465]]), clay, 0, 0, 0);
  add(pot, lathe([[0.20,0],[0.225,0.025],[0.20,0.047],[0.15,0.073],[0.06,0.081],[0,0.078]]), clay, 0, 0.46, 0);
  add(pot, new THREE.SphereGeometry(0.062, 24, 16), clay, 0, 0.582, 0).scale.y = 0.75;
  add(pot, lathe([[0.17,0],[0.185,0.005],[0.185,0.03],[0.17,0.038]]), darkCeramic, 0, 0, 0);
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.26, 0.16, 0), new THREE.Vector3(-0.44, 0.22, 0),
    new THREE.Vector3(-0.55, 0.34, 0), new THREE.Vector3(-0.64, 0.42, 0),
  ]);
  const spout = new THREE.TubeGeometry(spoutCurve, 24, 1, 16, false);
  const spoutPositions = spout.getAttribute('position');
  for (let segment = 0; segment <= 24; segment++) {
    const center = spoutCurve.getPointAt(segment / 24);
    const radius = THREE.MathUtils.lerp(0.125, 0.065, segment / 24);
    for (let side = 0; side <= 16; side++) {
      const i = segment * 17 + side;
      spoutPositions.setXYZ(i,
        center.x + (spoutPositions.getX(i) - center.x) * radius,
        center.y + (spoutPositions.getY(i) - center.y) * radius,
        center.z + (spoutPositions.getZ(i) - center.z) * radius);
    }
  }
  spout.computeVertexNormals();
  add(pot, spout, clay, 0, 0, 0);
  const opening = add(pot, new THREE.CircleGeometry(0.052, 24), darkCeramic, -0.638, 0.418, 0);
  opening.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spoutCurve.getTangentAt(1));
  const handle = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.23,0.37,0), new THREE.Vector3(0.49,0.40,0),
    new THREE.Vector3(0.60,0.27,0), new THREE.Vector3(0.52,0.10,0), new THREE.Vector3(0.29,0.09,0),
  ]);
  add(pot, new THREE.TubeGeometry(handle, 36, 0.043, 12, false), clay, 0, 0, 0);

  const tea = new THREE.MeshPhysicalMaterial({ color: '#665427', roughness: 0.12, metalness: 0.12, clearcoat: 1 });
  const cupGeometry = lathe([[0.06,0],[0.09,0.005],[0.105,0.035],[0.14,0.15],[0.165,0.24],[0.161,0.25],[0.145,0.248],[0.127,0.16],[0.096,0.052],[0.02,0.033],[0,0.033]]);
  for (const [x, z] of [[0.48,0.24], [-0.48,0.29]]) {
    add(tray, new THREE.CylinderGeometry(0.23, 0.205, 0.022, 40), clay, x, 0.046, z);
    add(tray, cupGeometry, glaze, x, 0.057, z);
    const liquid = add(tray, new THREE.CircleGeometry(0.136, 40), tea, x, 0.265, z);
    liquid.rotation.x = -Math.PI / 2;
    liquid.castShadow = false;
  }
  // An unglazed small dish rests on the linen, with two understated sweets.
  add(table, lathe([[0,0],[0.21,0],[0.25,0.025],[0.28,0.06],[0.26,0.067],[0.2,0.035],[0,0.028]]), glaze, -0.88, 0.956, 0.11);
  const sweet = new THREE.MeshStandardMaterial({ color: '#aa9a77', roughness: 0.93 });
  for (const x of [-0.99, -0.77]) add(table, new THREE.SphereGeometry(0.095, 20, 12), sweet, x, 1.025, 0.12).scale.y = 0.6;

  const steamGeometry = new THREE.BufferGeometry();
  const steamPositions = new Float32Array(18 * 3);
  steamGeometry.setAttribute('position', new THREE.BufferAttribute(steamPositions, 3));
  const steam = new THREE.Points(steamGeometry, new THREE.PointsMaterial({ map: softTexture(), color: '#e5e8df', size: 0.19, transparent: true, opacity: 0.11, depthWrite: false }));
  steam.position.set(0, 0.57, 0);
  pot.add(steam);

  // A single furin is hung from an offscreen cord. No architectural frame is reintroduced.
  const hanging = new THREE.Group();
  hanging.name = 'glass-furin';
  hanging.position.set(2.35, 7.8, 11.15);
  room.add(hanging);
  const cord = new THREE.MeshStandardMaterial({ color: '#767164', roughness: 1 });
  add(hanging, new THREE.CylinderGeometry(0.008, 0.008, 6, 8), cord, 0, 3, 0).castShadow = false;
  const chime = new THREE.Group();
  hanging.add(chime);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#e1eeea', transparent: true, opacity: 0.31, roughness: 0.08, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const bell = add(chime, lathe([[0.018,0],[0.11,-0.033],[0.23,-0.13],[0.29,-0.29],[0.28,-0.46],[0.247,-0.52],[0.232,-0.514],[0.265,-0.455],[0.273,-0.29],[0.22,-0.14],[0.10,-0.044],[0.018,-0.014]]), glass, 0, 0, 0);
  bell.castShadow = false;
  const rimMaterial = new THREE.MeshPhysicalMaterial({ color: '#a5c2b4', roughness: 0.12, metalness: 0.16, transparent: true, opacity: 0.68 });
  const rim = add(chime, new THREE.TorusGeometry(0.241, 0.012, 8, 48), rimMaterial, 0, -0.519, 0);
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = false;
  const clapper = new THREE.Group();
  chime.add(clapper);
  add(clapper, new THREE.CylinderGeometry(0.005, 0.005, 0.79, 6), cord, 0, -0.45, 0).castShadow = false;
  add(clapper, new THREE.SphereGeometry(0.047, 18, 12), rimMaterial, 0, -0.40, 0).castShadow = false;
  const paperGeometry = new THREE.PlaneGeometry(0.24, 0.77, 4, 12);
  const paperPositions = paperGeometry.getAttribute('position');
  for (let i = 0; i < paperPositions.count; i++) {
    const x = paperPositions.getX(i), y = paperPositions.getY(i);
    paperPositions.setZ(i, Math.sin(y * 5) * 0.045 + x * x * 0.6);
  }
  paperGeometry.computeVertexNormals();
  const paper = add(clapper, paperGeometry, new THREE.MeshStandardMaterial({ color: '#d7cfb7', roughness: 1, side: THREE.DoubleSide }), 0, -1.21, 0);
  paper.rotation.y = -0.18;
  // One slim green wash on the tanzaku reads as a hand-painted stem at this scale.
  const ink = new THREE.MeshStandardMaterial({ color: '#708773', roughness: 1, side: THREE.DoubleSide });
  const inkStroke = add(paper, new THREE.PlaneGeometry(0.012, 0.40), ink, -0.015, -0.045, 0.018);
  inkStroke.rotation.z = -0.06;

  batchStaticMeshes(table, true);
  const bellAcross: Pendulum = { angle: 0, velocity: 0 };
  const bellDepth: Pendulum = { angle: 0, velocity: 0 };
  const tongue: Pendulum = { angle: 0, velocity: 0 };
  const paperTwist: Pendulum = { angle: 0, velocity: 0 };
  const pendulums = [bellAcross, bellDepth, tongue, paperTwist];
  const sound = createChimeSound();
  let previousTime: number | undefined;
  let reduceMotion = false;
  let disposed = false;

  return {
    chimeTarget: chime,
    ring() {
      if (disposed) return;
      if (!reduceMotion) {
        // A bounded impulse adds energy to the hanging objects. Repeated taps
        // strengthen the swing without allowing the clapper to escape the bell.
        bellAcross.velocity = THREE.MathUtils.clamp(bellAcross.velocity + 0.76, -1.15, 1.15);
        bellDepth.velocity = THREE.MathUtils.clamp(bellDepth.velocity + 0.24, -0.6, 0.6);
        tongue.velocity = THREE.MathUtils.clamp(tongue.velocity - 1.45, -2.1, 2.1);
        paperTwist.velocity = THREE.MathUtils.clamp(paperTwist.velocity + 0.95, -1.7, 1.7);
      }
      sound.ring();
    },
    update(time: number, reducedMotion: boolean) {
      if (disposed) return;
      reduceMotion = reducedMotion;
      let remaining = previousTime === undefined ? 0 : THREE.MathUtils.clamp(time - previousTime, 0, 0.06);
      previousTime = time;
      if (reducedMotion) {
        for (const pendulum of pendulums) { pendulum.angle = 0; pendulum.velocity = 0; }
      } else {
        // Small substeps keep the coupled pendulums stable after a slow frame.
        // Wind is a weak force; visible swings are the response of the spring,
        // damping and the click impulse, rather than a prescribed sine rotation.
        while (remaining > 0) {
          const dt = Math.min(remaining, 1 / 120);
          const breeze = Math.sin(time * 0.77) * 0.09 + Math.sin(time * 1.19) * 0.035;
          const acceleration = advancePendulum(bellAcross, 10.8, 1.4, breeze, dt, 0.48);
          advancePendulum(bellDepth, 12.5, 1.7, breeze * 0.38, dt, 0.24);
          advancePendulum(tongue, 22, 1.15, -acceleration * 0.55 + breeze * 0.8, dt);
          if (Math.abs(tongue.angle) > 0.25) {
            tongue.angle = Math.sign(tongue.angle) * 0.25;
            bellAcross.velocity += tongue.velocity * 0.08;
            tongue.velocity *= -0.38;
          }
          advancePendulum(paperTwist, 6.2, 1.8, tongue.velocity * 0.55 + breeze, dt, 0.65);
          remaining -= dt;
        }
      }
      chime.rotation.z = bellAcross.angle;
      chime.rotation.x = bellDepth.angle;
      clapper.rotation.z = tongue.angle;
      paper.rotation.y = -0.18 + paperTwist.angle;
      steam.visible = !reducedMotion;
      for (let i = 0; i < 18; i++) {
        const progress = (time * 0.17 + i / 18) % 1;
        steamPositions[i * 3] = Math.sin(progress * 6 + time * 0.4 + i) * 0.048 * progress;
        steamPositions[i * 3 + 1] = progress * 0.62;
        steamPositions[i * 3 + 2] = Math.cos(progress * 5 + i * 0.8) * 0.032 * progress;
      }
      steamGeometry.getAttribute('position').needsUpdate = true;
    },
    dispose() { disposed = true; sound.dispose(); },
  };
}
