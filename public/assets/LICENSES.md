# Bundled garden asset licenses

All assets are bundled locally; the website and Chrome extension make no
runtime requests to asset providers. Source pages and licenses were verified
on 2026-09-09. Exact source URLs, original MD5 hashes, and distributed SHA-256
hashes are recorded in `sources.json` alongside this file.

## Poly Haven — CC0 1.0 Universal

[Poly Haven's asset license](https://polyhaven.com/license) permits use,
modification, and redistribution, including with commercial projects.
[CC0 legal text](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

| Local asset | Source | Creator |
| --- | --- | --- |
| `textures/wood-*.jpg` | [Weathered Planks](https://polyhaven.com/a/weathered_planks) | Dimitrios Savva (photography), Dario Barresi (processing) |
| `textures/stone-*.jpg` | [Dark Rock](https://polyhaven.com/a/dark_rock) | Amal Kumar |
| `textures/moss-*.jpg` | [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) | Rob Tuytel |
| `textures/bark-*.jpg` | [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) | Rob Tuytel |
| `environment/forest-slope-1k.hdr` | [Forest Slope](https://polyhaven.com/a/forest_slope) | Andreas Mischok |
| `environment/mountain-background.jpg` | [Alps Field](https://polyhaven.com/a/alps_field) | Andreas Mischok |

Each material includes albedo, OpenGL tangent-space normals, and roughness.
JPEGs were recompressed for distribution; roughness was resized to 512 × 512.
The 1K HDR remains byte-identical to the source.
The mountain background is the official tonemapped Alps Field panorama,
resized to 4096 × 2048 and recompressed to JPEG quality 90. Its photographic
content is unchanged; it provides a distant view rather than scene lighting.

## EZ-Tree — MIT

`textures/leaf-ash.png` is copied unchanged from
`@dgreenheck/ez-tree@1.1.0/src/lib/assets/leaves/ash_color.png`.
The same library embeds branch/leaf atlases and bark maps in its JavaScript
bundle. Library code, presets, and leaf artwork are distributed under the
[EZ-Tree MIT license](https://github.com/dgreenheck/ez-tree/blob/main/LICENSE).
Copyright (c) 2024 Daniel Greenheck. The complete notice is included in
`EZ-TREE-LICENSE.txt` alongside this file.

The upstream `src/lib/assets/bark/README.md` identifies these original bark
sources, also available under CC0:

- Birch: [TextureCan Wood 0027](https://www.texturecan.com/details/221/).
- Pine: [TextureCan Wood 0063](https://www.texturecan.com/details/588/).
- Oak: [Poly Haven Bark Brown 02](https://polyhaven.com/a/bark_brown_02).
- Willow: [Poly Haven Bark Willow 02](https://polyhaven.com/a/bark_willow_02).

[TextureCan's license](https://www.texturecan.com/terms/) permits redistribution
of its textures with projects and 3D assets under CC0 1.0 Universal.
