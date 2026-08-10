# Phase 5.3 — Shared Material-instance Rendering, Cache Lifecycle, and JSON Round-trip Parity

**Date:** 2026-08-04  
**Status:** Awaiting user review  
**Parent plan:** [`../../plans/museum-editor-workspace/phase-5-textures.md`](../../plans/museum-editor-workspace/phase-5-textures.md) slice 5.3  
**Prior slice:** [`../../agent-handoffs/phase-5.2.md`](../../agent-handoffs/phase-5.2.md)  
**Carry-over:** [`./2026-08-02-phase-5-2-texture-library-assignment-design.md`](./2026-08-02-phase-5-2-texture-library-assignment-design.md)

## Goal

Paint v6 material instances identically in the editor and visitor. Combine the existing PBR catalogue base with per-document overrides (per-slot base URI, roughness, metalness), dedup and ref-count raw `THREE.Texture` load through the shared source cache, and own variant disposal so cache entries never leak across document swaps, undo/redo, or asset replacement. Make the editor Material inspector's placeholder "viewport rendering arrives in Phase 5.3" notice obsolete.

## Scope

### Includes

- Pure resolver `resolveSceneMaterial(document, target)` → `EffectiveSceneMaterial`.
- New `SceneInstanceMaterial.svelte` (renders one effective material as a `<T.MeshStandardMaterial>`).
- Extend `texture-cache.ts` with `loadEffectiveTextures`, `acquireEffectiveVariant`, `releaseEffectiveVariant` keyed on the effective slot-URI set + repeat; existing catalogue-only path stays.
- `EntityPrimitive.svelte` consumes the resolver; renders through `SceneInstanceMaterial`.
- `AssetModel.svelte` performs a fresh `MeshStandardMaterial` allocation per affected mesh per `(effective, repeat)` pair, released on cleanup / instance swap.
- `MuseumEntities.svelte` wires document-swap release so undo, redo, import, and reset never leak variants.
- `texture-verifier` keeps its observable `unsafe-uri | load-failed | ready` contract. Internally, it calls into `texture-cache`'s source loader (`loadSourceTexture`) so a registered URI produces exactly one `THREE.Texture` shared with the renderer. The verifier no longer ships its own `new Image()` copy and `helpers/browser-image.ts` is removed.
- Visual parity: produce the same `WebGLRenderer` color buffer for editor and visitor on the same document + same camera.
- Editor Material inspector: drop "Phase 5.3" placeholder text.

### Excludes

- Binary upload, object URLs, package export (Phase 5.4).
- UV editing, shader editing, image editing, texture scene objects.
- Per-mesh material selection on a single model — one model takes one instance at a time.
- New texture formats (`.basis`, KTX2, etc.). Existing `.png`/`.webp` only.
- New runtime dependencies.
- Per-fragment logic in tests; rely on counts and deterministic micro-DOM rendering through `<T>` is not possible in node, so render-side tests stay minimal.

## Locked decisions

1. **Three thin new files.** Resolver + component + remap helper. No new module families.
2. **Single integration path.** Every primitive + every mesh that should follow the instance delegates through the cache, never through per-call `THREE.TextureLoader` instances.
3. **Effective material = catalogue base + per-slot URI replacement on `map` + numeric roughness/metalness override.** No `map`/`roughness` split between `map` (URI) and (structurally) `dataMap`; existing v6 schema stays.
4. **Cache variant key = `(effectiveKey, repeatX, repeatY, rotation)`, effectiveKey = sha-like string of `(slot, uri | catalogue-uri)` pairs + final roughness/metalness.** Source cache key stays at the URL alone.
5. **GLTF mesh remap = fresh `MeshStandardMaterial` per affected mesh per `(effective, repeat)`.** No in-place property remap; cleaner state and easier cache ownership. Allocation bounded by entity count.
6. **`MuseumMaterial.svelte` continues to serve catalogue-only surfaces (shells, floors, ceilings, dev previews).** It is not deleted; it is left untouched.
7. **Document-swap release is driven from `MuseumEntities.svelte`'s `$effect` cleanup** that watches the `document` reference. Reset / import / undo / redo all swap the document reference, triggering the cleanup. Per-entity caches release through `EntityPrimitive` and `AssetModel` `onDestroy`-style hooks.
8. **Verifier remains editor-only.** It uses the single `THREE.Texture` source loader exported by `texture-cache` (`loadSourceTexture(uri, slot)`); the verifier Promise resolves to `{ status: 'ready' }` once the cache holds a `THREE.Texture` for the URI. There is no separate `new Image()` loader in the verifier. Editor UI badges still report session-only load state through the verifier.
9. **No new error enums.** Status uses the existing `MaterialLoadStatus` plus one new `'partial'`.

## Architecture

### Pure resolver — `museum/materials/scene-instance-material.ts`

```ts
import type { MaterialTextureSlot, MaterialId } from '$lib/types/materials';
import type { MuseumSceneDocument } from '$lib/content/scene';
import { materialById } from '$lib/content/materials';

export type EffectiveSceneMaterial = {
  /** Catalogue this effective derives from; `null` means no catalogue (fallback only). */
  catalogue: MaterialId | null;
  /** Per-slot URI set in render order: map, normalMap, roughnessMap, aoMap, metalnessMap. */
  slotUris: Partial<Record<MaterialTextureSlot, string>>;
  /** Effective roughness (catalog or instance override). */
  roughness: number;
  /** Effective metalness (catalog or instance override). */
  metalness: number;
  /** Tint colour fallback (catalogue `fallbackColor`). */
  color: string;
  /** Tile size in meters the surface repeat is computed against (from catalogue). */
  defaultTileSizeMeters: [number, number];
  /** Stable cache key seed: `${sortedSlotEntries}|${roughness × 1000}|${metalness × 1000}` hex digest (djb2 → 6 hex digits). */
  variantSeed: string;
};

export type ResolveTarget = {
  /** Per-entity override from v6 document; `null` when no instance is set. */
  materialInstanceId: string | null;
  /** Catalogue fallback: `entity.materialId` for primitives, asset catalogue default for models, or current GLTF primary material id. */
  fallbackCatalogueId: MaterialId;
};

export function resolveSceneMaterial(
  document: Pick<MuseumSceneDocument, 'materials' | 'textures'>,
  target: ResolveTarget
): EffectiveSceneMaterial;
```

**Rules**

- If `materialInstanceId` is set and exists in `document.materials`, return its `baseMaterialId` as catalogue + replace the `map` slot with the `SceneTextureAsset.uri` keyed by `instance.baseTextureId`. Other slots fall through to catalogue.
- Numerics: `instance.roughness ?? catalogue.roughness`, same for metalness.
- Unknown `materialInstanceId` → resolves without override (dev-only `console.warn`).
- Unknown `materialInstanceId` for a primitive whose entity has no override is impossible by construction.
- The `variantSeed` is `'v' + djb2(sorted slot entries + integer-rounded roughness + integer-rounded metalness)` reduced to 6 hex digits. Two different `baseTextureId` values at the same catalogue yield distinct seeds; identical inputs yield the same seed (deterministic across reloads).
- `defaultTileSizeMeters` defaults to `[1, 1]` when the catalogue has none (matches today's `materials.ts` behaviour).

### Extended cache — `museum/materials/texture-cache.ts`

Add three functions alongside the existing catalogue path. Source cache remains URL-keyed:

```ts
export type EffectiveLoadResult =
  | { status: 'ready'; maps: LoadedTextureMaps }
  | { status: 'partial'; maps: LoadedTextureMaps; failed: string[] }
  | { status: 'failed'; error: string; maps: LoadedTextureMaps }
  | { status: 'fallback' };

export function loadEffectiveTextures(
  effective: EffectiveSceneMaterial
): Promise<EffectiveLoadResult>;

export function acquireEffectiveVariant(
  effective: EffectiveSceneMaterial,
  repeatX: number,
  repeatY: number,
  rotation?: number
): LoadedTextureMaps;

export function releaseEffectiveVariant(
  seed: string,
  repeatX: number,
  repeatY: number,
  rotation?: number
): void;
```

**Variant key** = `${effective.variantSeed}|${rx.toFixed(4)}|${ry.toFixed(4)}|${rot.toFixed(4)}`. Distinct seeds from different `baseTextureId` values never collide on the catalogue path's `${materialId}|...` key, even if `materialId` is identical. Ref-counting is identical.

`loadEffectiveTextures` reuses one `loader: TextureLoader` and one inflight `Map<string, Promise<...>>` shared with the catalogue path. URL is the cache key.

### Renderer — `museum/materials/SceneInstanceMaterial.svelte`

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { T } from '@threlte/core';
  import type { EffectiveSceneMaterial } from './scene-instance-material';
  import type { MaterialLoadStatus, Vec2 } from '$lib/types/materials';
  import { computeTextureRepeat } from '$lib/content/materials';
  import { loadEffectiveTextures, acquireEffectiveVariant, releaseEffectiveVariant } from './texture-cache';

  let {
    material,
    surfaceSize,
    rotation = 0,
    receiveLighting = true,
    status = $bindable<MaterialLoadStatus>('idle')
  }: {
    material: EffectiveSceneMaterial;
    surfaceSize: Vec2;
    rotation?: number;
    receiveLighting?: boolean;
    status?: MaterialLoadStatus;
  } = $props();

  // Surface size drives texture repeat; the resolver exposes defaultTileSizeMeters
  // so the component is the single source of repeat calculation.
  const repeat = $derived(
    computeTextureRepeat(surfaceSize, material.defaultTileSizeMeters)
  );
  const rotationRadians = $derived(rotation);

  let maps = $state<LoadedTextureMaps | undefined>(undefined);
  let acquiredKey: { seed: string; rx: number; ry: number; rot: number } | null = null;

  $effect(() => {
    const seed = material.variantSeed;
    const [rx, ry] = repeat;
    const rot = rotationRadians;

    maps = undefined;
    status = 'loading';
    let cancelled = false;

    loadEffectiveTextures(material).then((result) => {
      if (cancelled) return;
      if (result.status === 'fallback') {
        status = 'fallback';
        return;
      }
      if (result.status === 'failed') {
        status = 'failed';
        return;
      }
      maps = acquireEffectiveVariant(material, rx, ry, rot);
      acquiredKey = { seed, rx, ry, rot };
      status = result.status === 'partial' ? 'partial' : 'ready';
    });

    return () => {
      cancelled = true;
      maps = undefined;
      if (acquiredKey) {
        releaseEffectiveVariant(acquiredKey.seed, acquiredKey.rx, acquiredKey.ry, acquiredKey.rot);
        acquiredKey = null;
      }
    };
  });

  onDestroy(() => { maps = undefined; });
</script>

<T.MeshStandardMaterial
  attach="material"
  color={material.color}
  roughness={material.roughness}
  metalness={material.metalness}
  map={maps?.map}
  normalMap={maps?.normalMap}
  roughnessMap={maps?.roughnessMap}
  aoMap={maps?.aoMap}
  metalnessMap={maps?.metalnessMap}
  toneMapped={receiveLighting}
/>
```

The repeat is computed here (host of the parameter seeded by catalogue / surface size). Both the variant cache key and the cloned `THREE.Texture.repeat` set are derived from the same integers, so each (effective, surface) maps to at most one variant.

### Primitive integration — `museum/entities/EntityPrimitive.svelte`

Per-shape, derive `effective` from `entity` + `document`, surface size from the entity shape, and render through `SceneInstanceMaterial`:

```svelte
<script lang="ts">
  import { T } from '@threlte/core';
  import type { ScenePrimitiveEntity } from '$lib/content/scene';
  import type { MuseumSceneDocument } from '$lib/content/scene';
  import { resolveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
  import type { Vec2 } from '$lib/types/materials';
  import SceneInstanceMaterial from '$lib/museum/materials/SceneInstanceMaterial.svelte';

  let {
    entity,
    document
  }: {
    entity: ScenePrimitiveEntity;
    document: MuseumSceneDocument;
  } = $props();

  const surfaceSize = $derived.by((): Vec2 => {
    switch (entity.primitive) {
      case 'box':       return [entity.dimensions.width, entity.dimensions.depth];
      case 'plane':     return [entity.dimensions.width, entity.dimensions.height];
      case 'cylinder':  return [entity.dimensions.radius * 2, entity.dimensions.height];
      case 'sphere':    return [entity.dimensions.radius * 2, entity.dimensions.radius * 2];
    }
  });

  const effective = $derived(resolveSceneMaterial(document, {
    materialInstanceId: entity.materialInstanceId ?? null,
    fallbackCatalogueId: entity.materialId
  }));
</script>

{#if entity.primitive === 'box'}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.BoxGeometry args={[entity.dimensions.width, entity.dimensions.height, entity.dimensions.depth]} />
    <SceneInstanceMaterial material={effective} {surfaceSize} />
  </T.Mesh>
{:else if entity.primitive === 'plane'}
  ...
{/if}
```

`MuseumEntities.svelte` threads the runtime document into the params it already passes (`document: scene.document` / the constructed runtime scene document) so EntityPrimitive receives both.

### Model integration — `museum/assets/AssetModel.svelte`

`AssetModel.svelte` does **not** render its material through the resolver by default. Today the GLTF scene's embedded materials are kept verbatim. The Phase 5.3 integration triggers only when the entity carries a `materialInstanceId`:

```svelte
<script lang="ts">
  // existing imports …
  import type { MuseumSceneDocument, SceneModelEntity } from '$lib/content/scene';
  import { resolveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
  import { remapModelMaterials, releaseModelMaterialRemap } from './instance-material-remap';

  let {
    entity,
    document,
    assetId,
    ...
  }: {
    entity: SceneModelEntity;
    document: MuseumSceneDocument;
    // existing props …
  } = $props();

  const instanceApplied = $derived(Boolean(entity.materialInstanceId));
  const effective = $derived(resolveSceneMaterial(document, {
    materialInstanceId: entity.materialInstanceId ?? null,
    fallbackCatalogueId: 'paper-aged' as MaterialId
  }));
  let acquiredRemap = $state<{ seed: string; rx: number; ry: number; rot: number } | null>(null);

  $effect(() => {
    if (!instance || !instanceApplied) return;
    const result = remapModelMaterials(instance, effective, [1, 1]);
    acquiredRemap = result.acquiredKey;
    return () => {
      releaseModelMaterialRemap(acquiredRemap);
      acquiredRemap = null;
    };
  });
</script>
```

`MuseumEntities.svelte` threads `entity` + `document` into AssetModel the same way it threads them into EntityPrimitive. When `instanceApplied` is false, GLTF materials stay untouched (current behaviour). When it is true, the renderer swaps every mesh's material to a fresh `MeshStandardMaterial` populated from the resolver; one variant per effective, ref-counted across all observable meshes inside the cloned scene.

**Asset default catalogue is fixed.** Every model without a `materialInstanceId` retains its GLTF-provided materials. The only catalogue in play for AssetModel is the one chosen by the instance. The plan does **not** add a `defaultCatalogueMaterialId` field to `MuseumAsset`.

### Model remap — `museum/assets/instance-material-remap.ts`

Pure helper consumed by `AssetModel.svelte`:

```ts
export function remapModelMaterials(
  scene: Object3D,
  effective: EffectiveSceneMaterial,
  repeat: [number, number]
): { acquiredKey: { seed: string; rx: number; ry: number; rot: number } | null };

export function releaseModelMaterialRemap(key: { seed: string; rx: number; ry: number; rot: number } | null): void;
```

**Algorithm.** For each `Mesh` under `scene.traverse(...)`:

1. Acquire (or reuse) the variant via `acquireEffectiveVariant(effective, repeatX, repeatY, 0)`.
2. Build a fresh `MeshStandardMaterial` per mesh (not shared). Properties = `material.color`, `material.roughness`, `material.metalness`, `material.slotUris` maps. Each fresh material holds `userData['museumEffectiveSeed']` for diagnostic.
3. Replace `mesh.material` with the fresh material.

The remap helper calls `acquireEffectiveVariant` ONCE per `remapModelMaterials` invocation; the same `maps` reference is shared across every fresh `MeshStandardMaterial` so Three.js sees one refcounted texture source. **Release happens once per call** on `releaseModelMaterialRemap`.

**Reasoning.** Sharing the maps across fresh materials keeps ref-counting at one variant per (instance × repeat). After unmount, refCount → 0, the variant releases, every cloned material becomes safe to dispose (we do not currently collect them; the GLTF cloned branch already disposes meshes).

### Document-swap release — `museum/MuseumEntities.svelte`

We extend the existing `roomGroups` $derived to also include the `document` reference, then pass it as a prop into both EntityPrimitive and AssetModel. Each component's `$effect` cleanup calls `releaseModelMaterialRemap` / `releaseEffectiveVariant` automatically when (entity, document) changes. We do not call `resetTextureCachesForTests` per swap; per-entity release covers everything. Tests opt in via `resetTextureCachesForTests`.

### Verifier — `editor/texture-verifier.ts`

The verifier becomes a thin wrapper that owns URI safety + session-load-state reporting, delegating every actual load to `texture-cache.loadSourceTexture`:

```ts
import { loadSourceTexture } from '$lib/museum/materials/texture-cache';
import { isSafeTextureUri } from '$lib/content/texture-uri';

export type TextureVerificationResult =
  | { status: 'ready' }
  | { status: 'unsafe-uri' }
  | { status: 'load-failed'; message: string };

export type TextureSourceLoader = (
  uri: string,
  slot: MaterialTextureSlot
) => Promise<import('three').Texture>;

export type TextureVerifier = (uri: string) => Promise<TextureVerificationResult>;

export function createTextureVerifier(
  loadSource?: TextureSourceLoader
): TextureVerifier {
  const loader = loadSource ?? loadSourceTexture;
  // Inflight map keyed by URI for dedup; failure deletes the entry so the
  // next call retries — same observable contract as Phase 5.2.
  return async (uri) => {
    if (!isSafeTextureUri(uri)) return { status: 'unsafe-uri' };
    try {
      await loader(uri, 'map');
      return { status: 'ready' };
    } catch (error) {
      return {
        status: 'load-failed',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  };
}
```

Concretely:

- The default `loader` is `texture-cache.loadSourceTexture`. The inflight `Map<string, Promise<...>>` lives in `texture-cache` keyed by URL; the verifier inherits dedup without owning its own.
- The verifier registers no new caches. Calls beyond URI safety just await the cache's source loader.
- Editor UI badges still flip to `ready` on Promise resolve and to `load-failed` on reject; retry on a failed URI produces a fresh source-loader attempt independent of any failed-then-cached state.
- Tests inject a mock `TextureSourceLoader` returning a stub `THREE.Texture`. No `Image()` mock is required.

## Components

| File | Type | Purpose |
|------|------|---------|
| `museum/materials/scene-instance-material.ts` | pure | `resolveSceneMaterial` + `EffectiveSceneMaterial` + tests |
| `museum/materials/SceneInstanceMaterial.svelte` | component | reads `EffectiveSceneMaterial`, drives `<T.MeshStandardMaterial>` |
| `museum/materials/texture-cache.ts` | module | extended; legacy catalogue path unchanged |
| `museum/assets/instance-material-remap.ts` | pure helper | model mesh walk + acquire/release |
| `museum/entities/EntityPrimitive.svelte` | modified | uses resolver + `SceneInstanceMaterial` |
| `museum/assets/AssetModel.svelte` | modified | remaps GLTF materials after clone |
| `museum/MuseumEntities.svelte` | modified | document-swap hook (suspender; not destructive) |
| `editor/EditorMaterialInspector.svelte` | modified | drop Phase 5.3 placeholder note |
| `editor/texture-verifier.ts` | modified | injects `TextureSourceLoader`; default delegates to `texture-cache` |
| `editor/texture-verifier.test.ts` | modified | mock `TextureSourceLoader` returning a stub `THREE.Texture` |
| `editor/helpers/browser-image.ts` | **removed** | verifier no longer needs its own `Image()` loader |

## Data flow

### Render a primitive with material instance

```
EntityPrimitive(entity, document)
  → resolveSceneMaterial(document, target)
      (catalogue-base + baseTextureId replacement + numeric overrides)
  → SceneInstanceMaterial(effective, surfaceSizeRepeat=[rx, ry], rotation=0)
      → loadEffectiveTextures(effective)         // shared source loader
      → acquireEffectiveVariant(effective, rx, ry, 0)  // refCount += 1
      → <T.MeshStandardMaterial {color, roughness, metalness, ...maps} />
```

### Render a model with material instance

```
AssetModel(assetId, position, ...)
  → cloneModelScene(gltf.scene)
  → remapModelMaterials(instance, effectiveModel(entity), repeat=[rx, ry])
      for each child Mesh:
        mesh.material = new MeshStandardMaterial({ ...effective, map: maps.map, ... })
  → on unmount or instance swap:
      releaseModelMaterialRemap({ seed, rx, ry, 0 })   // refCount -= 1
```

`effectiveModel(entity)` is identical to `resolveSceneMaterial`; the asset side just passes the catalogue default derived from the asset's manifest (or `paper-aged` for fallback).

### Editor flow equivalence

Identical. The editor mounts `MuseumScene` → `MuseumEntities` → `EntityPrimitive` / `AssetModel`. Drag-drop calls `requestTextureAssignment`, which mutates `document.materials`/`entity.materialInstanceId` and bumps document version; Svelte's reactivity re-derives `effective` and reinstalls the variant within one frame.

## Error handling

| Failure | Path | Visible effect |
|---------|------|---------------|
| Unknown `materialInstanceId` | resolver | `console.warn` in dev; falls back to catalogue. |
| Unknown `baseTextureId` | resolver | `console.warn` in dev; catalogues' `map` is used. |
| `baseTextureId` is set + URI loads | cache | Slot replaced in `map`. `status = 'ready'`. |
| One optional slot is missing | cache | Other slots paint; `status = 'partial'`. |
| All slots fail | cache | `status = 'fallback'`; white-tinted ball using `fallbackColor`. |
| Double release | cache | Silent no-op; ref-count never underflows. |
| `MaterialLoadStatus` undefined | component | Existing `MaterialLoadStatus` union is extended with `'partial'` only. |
| Cache race with entity remove | AssetModel | Release is idempotent under WeakMap cleanup. No leak. |

## Testing

### `scene-instance-material.test.ts` (pure)

- Resolve catalogue-only → returns catalogue slot URIs.
- Resolve with instance + `baseTextureId` override → `map` slot replaced, others fall through.
- Override applies to roughness and metalness when set; catalogue fallback when undefined.
- Stable `variantSeed` across reloads (deterministic for same inputs).
- Unknown `materialInstanceId` → no override, dev warn.
- Unknown `baseTextureId` → no override, dev warn.
- Different overrides produce different `variantSeed`.

### `texture-cache.test.ts` (additional describes)

- Two `effective` entries with same `materialId` but different `baseTextureId` produce distinct variants.
- Concurrent `loadEffectiveTextures` share one source promise.
- Acquire twice + release twice round-trip refCount without leaks.
- Reset clears both legacy catalogue variants and effective variants.

### Verifier tests (`texture-verifier.test.ts` updated)

- Injected `TextureSourceLoader` resolves a stub `THREE.Texture`: verifier resolves `{ status: 'ready' }` without invoking any `Image()`.
- Unsafe URI does not call the loader.
- Loader throw → `{ status: 'load-failed', message }`.
- Two concurrent calls share one loader invocation (delegated to `texture-cache` source inflight map).
- Failure does not become a permanent cached rejection: a retry calls the loader again.

### `instance-material-remap.test.ts`

- Synthesize a small `Object3D` with two meshes, run remap, assert every mesh's `material` is a `MeshStandardMaterial` carrying expected slots.
- Release after remap returns refCount to 0; disposal triggers at last release.

### Browser smoke (`/dev/materials`, editor + visitor preview)

- Catalogue-only material renders identically in editor and visitor screenshots.
- Newly assigned material instance renders within a frame in both contexts.
- Drag-drop on primitive updates visible state within a frame.
- Drag-drop on model updates visible state within a frame.
- Import a document containing a previously-unloaded texture URI; both editor and visitor render it without manual reload.

### Editor/visitor visual parity

- Export a document from the editor, copy JSON, paste into a fresh visitor mount, compare `WebGLRenderer` color buffers after a deterministic camera frame. Manual step in browser.
- Inspect built chunks: `SceneInstanceMaterial`, `texture-cache` extended exports, and `instance-material-remap` are reachable by `/museum` (visitor chunks) for boxes/primitives/lights. The editor's `texture-verifier`. `createTextureVerifier` is editor-only and must remain so.

### Svelte / Vitest results

- `npm run check -w @portfolio/museum`: 0 errors / 0 warnings.
- Vitest: previous 660 tests still pass + the new describes land around 700+ tests.
- `npm run build -w @portfolio/museum`: exit 0.

## Acceptance gate

1. The Material inspector shows the assigned texture identity and the viewport matches, both editor and visitor, without manual reload.
2. Drag-drop on primitive/model produces a visible render change within one frame; undo restores the exact previous frame.
3. Import of a JSON containing a `baseTextureId` URI renders the texture on first paint in both contexts.
4. Two primitives assigned different `materialInstanceId`s, both referencing the same catalogue `materialId`, render with visibly distinct textures.
5. Editor and visitor produce identical WebGL color buffers on the same document + camera frame.
6. Reset, import, undo, and redo do not leak variant slots across swaps (test: acquire/release counters).
7. Removing or replacing any entity releases its variant within one animation frame.
8. Catalogue-only rendering (shells, floors, ceilings, dev previews) behaves identically and its tests stay green.

## Files

Expected new files:

- `apps/museum/src/lib/museum/materials/scene-instance-material.ts` (~120 LOC)
- `apps/museum/src/lib/museum/materials/scene-instance-material.test.ts` (~150 LOC)
- `apps/museum/src/lib/museum/materials/SceneInstanceMaterial.svelte` (~80 LOC)
- `apps/museum/src/lib/museum/assets/instance-material-remap.ts` (~120 LOC)
- `apps/museum/src/lib/museum/assets/instance-material-remap.test.ts` (~140 LOC)

Expected modified:

- `apps/museum/src/lib/museum/materials/texture-cache.ts` (extension; legacy path preserved)
- `apps/museum/src/lib/museum/materials/texture-cache.test.ts` (additional describes)
- `apps/museum/src/lib/museum/entities/EntityPrimitive.svelte`
- `apps/museum/src/lib/museum/assets/AssetModel.svelte`
- `apps/museum/src/lib/museum/MuseumEntities.svelte` (document-swap cleanup hook)
- `apps/museum/src/lib/editor/EditorMaterialInspector.svelte` (delete placeholder note)
- `apps/museum/src/lib/editor/texture-verifier.ts` (delegate to `texture-cache.loadSourceTexture`)
- `apps/museum/src/lib/editor/texture-verifier.test.ts` (replace `TextureImageLoader` mocks with `TextureSourceLoader` mocks)
- `apps/museum/src/lib/editor/helpers/browser-image.ts` — **removed**

## Handoff to Phase 5.4

Phase 5.3 makes assigned textures render identically. Phase 5.4 takes over for binary-upload, object URLs, package export, and URI rewriting — it must not pull forward shared cache refactoring that Phase 5.3 finalises.
