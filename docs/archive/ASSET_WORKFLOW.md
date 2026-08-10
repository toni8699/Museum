# Paris asset workflow

Use this when adding, replacing, or optimizing Paris Salon assets in the museum.

## Source of truth

- Keep raw downloads in `apps/museum/assets-source/models/`.
- Keep licence and acquisition notes in `apps/museum/assets-source/licenses/`.
- Keep only optimized production GLBs in `apps/museum/static/museum/models/`.
- Put model metadata, provenance, and defaults in `apps/museum/src/lib/content/assets.ts`.
- Author Paris placement transforms and clusters in `apps/museum/src/lib/content/museum-scene.json`, preferably through `/dev/museum-editor` and its canonical JSON export.
- Let `AssetModel.svelte` handle loading, cloning, Meshopt decoding, and fallbacks.

## Add or replace an asset

1. Obtain the source model and place it under `apps/museum/assets-source/models/<asset-name>/`.
2. Create or update the matching licence record in `apps/museum/assets-source/licenses/<asset-name>.md`.
3. Optimize the source into a production GLB under `apps/museum/static/museum/models/...`.
4. Update `apps/museum/src/lib/content/assets.ts` with:
   - `id`
   - `category`
   - `sourceFile`
   - `productionFile`
   - `sourceUrl`
   - `creator`
   - `license`
   - `attribution`
   - `defaultScale`
   - `castShadow` / `receiveShadow`
   - `status`
   - `rooms`
   - `notes`
   - optional `fallback`
5. Add the placement and any cluster membership in `/dev/museum-editor`, then export the canonical `museum-scene.json`.
6. Update any fallback primitives if the asset needs a new silhouette.
7. Remove stale scene references only after the new asset is in place and verified.

## Optimization checklist

Use the source asset as the editing target, then produce a new GLB that is:

- centered on a sensible pivot, usually floor-centered for furniture or ceiling-centered for hanging decor
- stripped of unused attributes when safe
- merged where redundant meshes are wasting draw calls
- scaled to the intended room size in the manifest, not baked into the room layout
- converted to WebP textures where the source allows it
- Meshopt-compressed for runtime delivery
- kept compatible with any required materials, tangents, or transmission features

Typical asset-specific tweaks from this slice:

- chairs and tables were floor-centered and then scaled down to salon size
- the sofa kept generated tangents before optimization
- the chandelier was ceiling-centered and redundant meshes were joined
- the lamp was moved from a distant source origin to the floor pivot
- the grandfather clock kept out-of-range UVs unquantized

## Validation

After any change, check:

- `npm run check -w @portfolio/museum`
- `npm run build:museum`
- `/dev/assets` for model load status, bounds, and fallback behavior
- that the production GLB path exists in `static/museum/models/`
- that the old asset is no longer referenced anywhere in the scene

## Placement rules

- Keep the piano position unchanged unless the user explicitly asks otherwise.
- For Paris Salon, treat furniture clusters as layout data, not scene logic.
- Use `museum-scene.json` for transforms; do not add room-local GLTF loaders.
- Use the room-scoped fallback kind when a model is unavailable.

## Future-agent shortcut

If you only need the shortest version:

1. Put source in `assets-source/models/`.
2. Record licence in `assets-source/licenses/`.
3. Optimize to `static/museum/models/` with pivot cleanup, pruning, WebP, and Meshopt.
4. Wire it in `assets.ts`.
5. Place it in `/dev/museum-editor` and export `museum-scene.json`.
6. Validate with `check`, `build`, and `/dev/assets`.
