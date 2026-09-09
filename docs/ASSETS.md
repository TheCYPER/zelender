# Garden assets

The garden uses locally bundled material scans and a forest lighting capture.
Sources were verified against the official asset pages and API on 2026-09-09.
The distributable attribution and license record lives in
[`public/assets/LICENSES.md`](../public/assets/LICENSES.md), which Vite copies
to both the website and Chrome extension. Original download URLs and hashes
are in [`public/assets/sources.json`](../public/assets/sources.json).

## Material contract

`createGardenMaterials()` in `src/scene/materials.ts` synchronously returns
`{ stone, rock, wood, darkWood, bark, moss, leaf }`, all
`THREE.MeshStandardMaterial`. Image loading continues asynchronously through
`THREE.TextureLoader`. Every URL uses `import.meta.env.BASE_URL` so the same
files resolve under the Pages subdirectory and the extension origin.

- Albedo and the leaf atlas use `SRGBColorSpace`.
- Normals and roughness use `NoColorSpace`; normals follow the OpenGL +Y convention.
- Tileable maps use `RepeatWrapping` and anisotropy 4.
- The leaf atlas is RGBA with transparent background, clamped edges, and
  alpha testing; transparent pixels still contain green edge colors.
- `rock` enables geometry vertex colors. Keep vertex and instance tints close
  to white: the photographic dark-rock albedo is already charcoal colored.
- `wood` and `darkWood` share textures. The veranda overrides their UV transform
  to sample one board from the nine-board scan, with grain along each board's
  long Z face. Furniture loads its own maps for independent texture repeats.

## Sources and preparation

Poly Haven CC0 sources: [Weathered Planks](https://polyhaven.com/a/weathered_planks),
[Dark Rock](https://polyhaven.com/a/dark_rock),
[Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock),
[Bark Brown 02](https://polyhaven.com/a/bark_brown_02), and
[Forest Slope](https://polyhaven.com/a/forest_slope).

Downloads used the official `/files/{id}` API with the identifying user agent
`ZelenderAssetPreparation/1.0`, following the
[published API conditions](https://polyhaven.com/our-api).
The product has no runtime API dependency. Original files were checked against
the API's MD5 hashes. Albedo/normal maps retain 1024 × 1024 resolution; roughness
maps use 512 × 512. JPEGs were recompressed with macOS `sips` at quality 85
(color/roughness) or 92 (normals). There are no baked directional shadows
introduced by our processing and no synthesized normal maps.

`environment/forest-slope-1k.hdr` is the unchanged 1024 × 512 Radiance source
(1.91 MB) by Andreas Mischok. Use it for reflected environment light via PMREM.

`environment/mountain-background.jpg` is a real photographic panorama of
[Alps Field](https://polyhaven.com/a/alps_field), also by Andreas Mischok and
released under CC0. The official tonemapped JPEG was verified against the API
MD5, then resized to 4096 × 2048 and recompressed with `sips` at JPEG quality 90.
No objects or scenery were generated, removed, or edited. It contains forested
mountain slopes and a clear sky; garden geometry should cover the lower meadow.
Use `SRGBColorSpace` and an equirectangular background mapping, independently
of the existing forest environment lighting. This asset adds a photographic
distant view; it is not a three-dimensional mountain model.

The [EZ-Tree](https://github.com/dgreenheck/ez-tree) 1.1.0 library provides
branching geometry, tree presets, and textured branch/leaf cards. Its release
bundle embeds its maps as data URIs, which work offline. These are procedural
trees with textured leaf cards, not scanned whole-tree models. The standalone
`leaf-ash.png` is copied from the release without modification for other foliage.

## Integration notes

`Tree.loadPreset(name)` in EZ-Tree 1.1.0 already generates the tree. Mutating
`tree.options` requires another `tree.generate()`. Trees can share generated
geometries/materials, but the release's leaf wind shader overrides
`project_vertex` without instancing support. Use regular meshes or an
instancing-aware replacement material for instanced trees. The release has no
`generateLODs()` method, even though current upstream documentation describes it.

Visual acceptance requires an actual rendered review. PBR maps and tree presets
alone do not establish photorealism or correct physical scale.
