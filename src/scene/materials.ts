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

/** World-space variation continues across instances and breaks up repeated scans. */
export function applySurfaceVariation(material: THREE.MeshStandardMaterial, kind: 'moss' | 'stone') {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vGardenSurface;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      vec4 gardenLocal = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        gardenLocal = instanceMatrix * gardenLocal;
      #endif
      vGardenSurface = (modelMatrix * gardenLocal).xyz;
    `);
    shader.fragmentShader = `
      varying vec3 vGardenSurface;
      float gardenHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float gardenNoise(vec2 p) {
        vec2 cell=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(gardenHash(cell),gardenHash(cell+vec2(1,0)),f.x),
                   mix(gardenHash(cell+vec2(0,1)),gardenHash(cell+vec2(1,1)),f.x),f.y);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      vec2 gardenXZ = vGardenSurface.xz;
      float broadPatch = gardenNoise(gardenXZ * 0.19);
      float finePatch = gardenNoise(gardenXZ * 1.3 + vec2(17,31));
      ${kind === 'moss' ? `
        // Retain scan detail but remove its dry yellow cast. An independently
        // rotated larger sample prevents a five-metre repeating turf pattern.
        float scanDetail = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
        #ifdef USE_MAP
          vec2 secondUV = mat2(0.74,-0.67,0.67,0.74) * vMapUv * 0.43 + vec2(0.37,0.71);
          scanDetail = mix(scanDetail,dot(texture2D(map,secondUV).rgb,vec3(0.2126,0.7152,0.0722)),0.30);
        #endif
        vec3 deepMoss = vec3(0.018,0.045,0.028);
        vec3 cushionMoss = vec3(0.065,0.132,0.048);
        vec3 fernMoss = vec3(0.028,0.082,0.045);
        vec3 mossTone = mix(deepMoss,cushionMoss,smoothstep(0.24,0.79,broadPatch));
        mossTone = mix(mossTone,fernMoss,finePatch*0.34);
        diffuseColor.rgb = mossTone * (0.59 + scanDetail*2.75) * (0.75+finePatch*0.45);
      ` : `
        float stratum = sin(vGardenSurface.y*12.0 + gardenNoise(gardenXZ*0.8)*4.0);
        diffuseColor.rgb *= mix(vec3(0.75,0.83,0.87),vec3(1.27,1.16,1.02),broadPatch);
        diffuseColor.rgb *= 0.94 + finePatch*0.15 + stratum*0.025;
        float lichen = smoothstep(0.72,0.89,gardenNoise(gardenXZ*3.4+vGardenSurface.y));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.18,0.20,0.14),lichen*0.17);
      `}
    `);
  };
  material.customProgramCacheKey = () => `garden-surface-${kind}-v1`;
  return material;
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
  applySurfaceVariation(stone, 'stone');
  applySurfaceVariation(rock, 'stone');

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
  moss.color.set('#ffffff');
  moss.envMapIntensity = 0.3;
  applySurfaceVariation(moss, 'moss');

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
