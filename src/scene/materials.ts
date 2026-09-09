import * as THREE from 'three';

export interface GardenMaterials {
  stone: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  moss: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
}

/** Locally bundled CC0 scans. TextureLoader fills these textures asynchronously. */
export function createGardenMaterials(): GardenMaterials {
  const loader = new THREE.TextureLoader();
  const texture = (file: string, color = false): THREE.Texture => {
    const map = loader.load(`${import.meta.env.BASE_URL}assets/textures/${file}`);
    map.name = file;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    return map;
  };

  const scanned = (name: string, normalStrength: number, roughness: number) => {
    const material = new THREE.MeshStandardMaterial({
      map: texture(`${name}-color.jpg`, true),
      normalMap: texture(`${name}-normal.jpg`),
      roughnessMap: texture(`${name}-roughness.jpg`),
      normalScale: new THREE.Vector2(normalStrength, normalStrength),
      roughness,
      metalness: 0,
      envMapIntensity: 0.65,
    });
    material.name = `garden-${name}`;
    return material;
  };

  const stone = scanned('stone', 0.72, 0.94);
  const rock = stone.clone();
  rock.name = 'garden-rock';
  rock.vertexColors = true;
  rock.roughness = 0.78;

  const wood = scanned('wood', 0.32, 0.92);
  // The source has nine boards across U. Sample one board and orient its
  // longitudinal grain along the long X face of the veranda planks.
  for (const map of [wood.map, wood.normalMap, wood.roughnessMap]) {
    if (!map) continue;
    map.repeat.set(0.075, 4);
    map.offset.set(0.19, 0);
    map.rotation = Math.PI / 2;
  }
  const darkWood = wood.clone();
  darkWood.name = 'garden-dark-wood';
  darkWood.color.set('#8c8073');

  const bark = scanned('bark', 0.85, 1);
  bark.envMapIntensity = 0.35;
  const moss = scanned('moss', 0.38, 1);
  moss.color.set('#c1cbb1');
  moss.envMapIntensity = 0.3;

  const leafMap = texture('leaf-ash.png', true);
  leafMap.wrapS = leafMap.wrapT = THREE.ClampToEdgeWrapping;
  const leaf = new THREE.MeshStandardMaterial({
    name: 'garden-leaf',
    map: leafMap,
    color: '#ffffff',
    side: THREE.DoubleSide,
    alphaTest: 0.45,
    alphaToCoverage: true,
    roughness: 0.85,
    metalness: 0,
    envMapIntensity: 0.45,
  });

  return { stone, rock, wood, darkWood, bark, moss, leaf };
}
