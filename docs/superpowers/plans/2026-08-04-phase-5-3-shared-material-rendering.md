# Phase 5.3 Shared Material Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Phase 5.2 material-instance assignments identically in editor and visitor. Combine catalogue PBR base with per-document overrides; dedup and ref-count raw `THREE.Texture` load through a shared source cache; own variant disposal; remove the editor Material inspector's "Phase 5.3 arrives" placeholder.

**Architecture:** A pure resolver produces an `EffectiveSceneMaterial` keyed on `(slot URIs, roughness, metalness)`. `texture-cache.ts` is extended with a per-effective variant pool that shares one `THREE.Texture` per URI with the verifier (which loses its own `new Image()` loader). A new `SceneInstanceMaterial.svelte` plus a small `instance-material-remap.ts` mesh-walker brings the resolver + cache into `EntityPrimitive` and `AssetModel`. `MuseumMaterial.svelte` and the catalogue-only path stay untouched.

**Tech Stack:** TypeScript 5.8, Svelte 5 runes, SvelteKit 2, Vitest 3 (node), Three.js / Threlte 7, existing `museum-scenes/MaterialLoadStatus`, existing v6 codec and `texture-uri` predicate.

## Global Constraints (every task must satisfy)

- **No behaviour change for catalogue-only rendering.** All 660 existing tests stay green.
- **No new dependencies.** No new runtime or test packages.
- **Phase 5.2 public surface frozen.** `EditorTextureLibraryController`, `registerTexture`, `probeTexture`, `requestMaterialEdit`, `requestTextureAssignment`, `EditorMaterialInspector`, `EditorMaterialChoiceDialog`, `EditorAssetLibrary` — none change their external signature.
- **No commits ever** (per `AGENTS.md`). Step "verify gates" replaces step "commit" throughout.
- **Single source of truth for textures.** One `THREE.Texture` per URI shared by verifier and renderer.
- **Variant cache key = `(variantSeed, repeatX, repeatY, rotation)`.** Source cache key = URL alone.
- **Verifier keeps observable `{ status: 'ready' | 'unsafe-uri' | 'load-failed' }` contract.** Internally it now injects a `TextureSourceLoader` whose default delegates to `texture-cache.loadSourceTexture`.
- **`helpers/browser-image.ts` does not exist** — the verifier's inlined `loadBrowserTextureImage` is deleted, no helper module to remove.
- **Verification command** (every task):
  ```bash
  cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run <focused> && npm run check -w @portfolio/museum
  ```

---

## File Structure (locked)

| Path | Type | Role |
|---|--:|---|
| `apps/museum/src/lib/museum/materials/scene-instance-material.ts` | NEW | Pure resolver; no Three imports |
| `apps/museum/src/lib/museum/materials/scene-instance-material.test.ts` | NEW | Resolver unit tests |
| `apps/museum/src/lib/museum/materials/texture-cache.ts` | MODIFY | Add `loadSourceTexture`, `loadEffectiveTextures`, `acquireEffectiveVariant`, `releaseEffectiveVariant`; legacy path unchanged |
| `apps/museum/src/lib/museum/materials/texture-cache.test.ts` | NEW | Cache extension tests |
| `apps/museum/src/lib/editor/texture-verifier.ts` | MODIFY | Inject `TextureSourceLoader`; default `loadSourceTexture`; remove inlined `loadBrowserTextureImage` |
| `apps/museum/src/lib/editor/texture-verifier.test.ts` | MODIFY | Replace browser-loader mocks with `TextureSourceLoader` mocks returning stub `THREE.Texture` |
| `apps/museum/src/lib/types/materials.ts` | MODIFY | Extend `MaterialLoadStatus` with `'partial'` |
| `apps/museum/src/lib/museum/materials/SceneInstanceMaterial.svelte` | NEW | Renderer bridge: reads `EffectiveSceneMaterial` → `<T.MeshStandardMaterial>` |
| `apps/museum/src/lib/museum/assets/instance-material-remap.ts` | NEW | Pure helper: model mesh walk + acquire/release |
| `apps/museum/src/lib/museum/assets/instance-material-remap.test.ts` | NEW | Mesh remap unit tests |
| `apps/museum/src/lib/museum/entities/EntityPrimitive.svelte` | MODIFY | Resolve + render via `SceneInstanceMaterial` |
| `apps/museum/src/lib/museum/assets/AssetModel.svelte` | MODIFY | Take `entity` + `document` props; remap when `materialInstanceId` is set |
| `apps/museum/src/lib/museum/MuseumEntities.svelte` | MODIFY | Thread `entity` + `document` into AssetModel and EntityPrimitive |
| `apps/museum/src/lib/editor/EditorMaterialInspector.svelte` | MODIFY | Delete the Phase 5.3 placeholder paragraph |

Each task below produces independently testable changes.

---

### Task 1: Pure resolver and tests

**Files:**
- Create: `apps/museum/src/lib/museum/materials/scene-instance-material.ts`
- Create: `apps/museum/src/lib/museum/materials/scene-instance-material.test.ts`

**Interfaces:**
- Consumes: v6 document `{ materials, textures }` (`Pick<MuseumSceneDocument, 'materials' | 'textures'>`); resolve target `{ materialInstanceId | null, fallbackCatalogueId }`.
- Produces:
  ```ts
  export type EffectiveSceneMaterial = {
    catalogue: MaterialId | null;
    slotUris: Partial<Record<MaterialTextureSlot, string>>;
    roughness: number;
    metalness: number;
    color: string;
    defaultTileSizeMeters: [number, number];
    variantSeed: string;
  };

  export type ResolveTarget = {
    materialInstanceId: string | null;
    fallbackCatalogueId: MaterialId;
  };

  export function resolveSceneMaterial(
    document: Pick<MuseumSceneDocument, 'materials' | 'textures'>,
    target: ResolveTarget
  ): EffectiveSceneMaterial;
  ```

- [ ] **Step 1: Write failing tests** — `apps/museum/src/lib/museum/materials/scene-instance-material.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { resolveSceneMaterial } from './scene-instance-material';
import type { MuseumSceneDocument } from '$lib/content/scene';

const WALL_TEXTURE = { id: 'wall-detail', name: 'Wall Detail', uri: '/textures/wall-detail.webp' };
const FLOOR_TEXTURE = { id: 'floor-grain', name: 'Floor Grain', uri: '/textures/floor-grain.png' };

function doc(materials: MuseumSceneDocument['materials'], textures: MuseumSceneDocument['textures'] = [WALL_TEXTURE, FLOOR_TEXTURE]): Pick<MuseumSceneDocument, 'materials' | 'textures'> {
  return { materials, textures };
}

describe('resolveSceneMaterial', () => {
  it('returns catalogue slot URIs when no instance is set', () => {
    const result = resolveSceneMaterial(doc([]), {
      materialInstanceId: null,
      fallbackCatalogueId: 'plaster-warm'
    });

    expect(result.catalogue).toBe('plaster-warm');
    expect(result.slotUris.map).toBe('/textures/plaster-warm/map.png');
    expect(result.slotUris.roughnessMap).toBe('/textures/plaster-warm/roughness.png');
    expect(result.roughness).toBe(0.92);
    expect(result.metalness).toBe(0.02);
    expect(result.color).toBe('#c4b4a0');
    expect(result.defaultTileSizeMeters).toEqual([2, 2]);
  });

  it('replaces the map slot when an instance supplies a baseTextureId', () => {
    const result = resolveSceneMaterial(
      doc([
        {
          id: 'wall-material',
          name: 'Wall Material',
          baseMaterialId: 'plaster-warm',
          baseTextureId: 'wall-detail'
        }
      ]),
      { materialInstanceId: 'wall-material', fallbackCatalogueId: 'plaster-warm' }
    );

    expect(result.slotUris.map).toBe('/textures/wall-detail.webp');
    expect(result.slotUris.roughnessMap).toBe('/textures/plaster-warm/roughness.png');
  });

  it('falls back to catalogue map when baseTextureId is unknown (with dev warn)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = resolveSceneMaterial(
      doc([
        {
          id: 'wall-material',
          name: 'Wall Material',
          baseMaterialId: 'plaster-warm',
          baseTextureId: 'nonexistent'
        }
      ]),
      { materialInstanceId: 'wall-material', fallbackCatalogueId: 'plaster-warm' }
    );

    expect(result.slotUris.map).toBe('/textures/plaster-warm/map.png');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('uses instance overrides for roughness and metalness when set', () => {
    const result = resolveSceneMaterial(
      doc([
        {
          id: 'm',
          name: 'M',
          baseMaterialId: 'plaster-warm',
          roughness: 0.35,
          metalness: 0.6
        }
      ]),
      { materialInstanceId: 'm', fallbackCatalogueId: 'plaster-warm' }
    );

    expect(result.roughness).toBe(0.35);
    expect(result.metalness).toBe(0.6);
  });

  it('uses unknown materialInstanceId without override (with dev warn)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = resolveSceneMaterial(doc([]), {
      materialInstanceId: 'missing',
      fallbackCatalogueId: 'marble-light'
    });

    expect(result.catalogue).toBe('marble-light');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('generates a stable variantSeed for identical inputs', () => {
    const a = resolveSceneMaterial(doc([]), { materialInstanceId: null, fallbackCatalogueId: 'plaster-warm' });
    const b = resolveSceneMaterial(doc([]), { materialInstanceId: null, fallbackCatalogueId: 'plaster-warm' });
    expect(a.variantSeed).toBe(b.variantSeed);
  });

  it('produces different variantSeeds for different effective textures', () => {
    const baseArgs = (id: string) => [
      doc([{ id, name: 'M', baseMaterialId: 'plaster-warm', baseTextureId: 'wall-detail' }]),
      { materialInstanceId: id, fallbackCatalogueId: 'plaster-warm' as const }
    ] as const;
    const a = resolveSceneMaterial(...baseArgs('m1'));
    const b = resolveSceneMaterial(...baseArgs('m2'));
    expect(a.variantSeed).not.toBe(b.variantSeed);
    // same effective (same baseTextureId) ⇒ same seed (independent of instance id)
    const c = resolveSceneMaterial(...baseArgs('m3'));
    expect(a.variantSeed).toBe(c.variantSeed);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run:
```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/museum/materials/scene-instance-material.test.ts
```
Expected: failure with "Cannot find module ./scene-instance-material".

- [ ] **Step 3: Implement the resolver** — `apps/museum/src/lib/museum/materials/scene-instance-material.ts`

```ts
import { materialById } from '$lib/content/materials';
import type {
  MaterialDefinition,
  MaterialId,
  MaterialTextureSlot
} from '$lib/types/materials';
import type {
  MaterialInstance,
  MuseumSceneDocument,
  SceneTextureAsset
} from '$lib/content/scene';

const DEFAULT_TILE: [number, number] = [1, 1];
const SLOT_ORDER: MaterialTextureSlot[] = [
  'map',
  'normalMap',
  'roughnessMap',
  'aoMap',
  'metalnessMap'
];

const isDevEnv = (() => {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } })?.env?.DEV);
  } catch {
    return false;
  }
})();

export type EffectiveSceneMaterial = {
  catalogue: MaterialId | null;
  slotUris: Partial<Record<MaterialTextureSlot, string>>;
  roughness: number;
  metalness: number;
  color: string;
  defaultTileSizeMeters: [number, number];
  variantSeed: string;
};

export type ResolveTarget = {
  materialInstanceId: string | null;
  fallbackCatalogueId: MaterialId;
};

function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

function findTexture(
  document: Pick<MuseumSceneDocument, 'textures'>,
  textureId: string | undefined
): SceneTextureAsset | undefined {
  if (!textureId) return undefined;
  return document.textures.find((texture) => texture.id === textureId);
}

export function resolveSceneMaterial(
  document: Pick<MuseumSceneDocument, 'materials' | 'textures'>,
  target: ResolveTarget
): EffectiveSceneMaterial {
  const instance: MaterialInstance | undefined = target.materialInstanceId
    ? document.materials.find((material) => material.id === target.materialInstanceId)
    : undefined;

  if (target.materialInstanceId && !instance && isDevEnv) {
    console.warn(`[scene-instance-material] Unknown materialInstanceId: ${target.materialInstanceId}`);
  }

  let catalogueId: MaterialId | null =
    instance?.baseMaterialId ?? target.fallbackCatalogueId;
  if (catalogueId && !materialById.has(catalogueId)) {
    catalogueId = null;
  }
  const catalogue: MaterialDefinition | undefined = catalogueId
    ? materialById.get(catalogueId)
    : undefined;

  const slotUris: Partial<Record<MaterialTextureSlot, string>> = {
    ...(catalogue?.textures ?? {})
  };
  if (instance?.baseTextureId) {
    const texture = findTexture(document, instance.baseTextureId);
    if (texture) slotUris.map = texture.uri;
    else if (isDevEnv) {
      console.warn(`[scene-instance-material] Unknown baseTextureId: ${instance.baseTextureId}`);
    }
  }

  const roughness = instance?.roughness ?? catalogue?.roughness ?? 0.5;
  const metalness = instance?.metalness ?? catalogue?.metalness ?? 0;
  const color = catalogue?.fallbackColor ?? '#c4b4a0';
  const defaultTileSizeMeters = catalogue?.defaultTileSizeMeters ?? DEFAULT_TILE;

  const sortedEntries = SLOT_ORDER
    .filter((slot) => slotUris[slot] !== undefined)
    .map((slot) => `${slot}=${slotUris[slot]}`)
    .join('&');
  const variantSeed = `v${djb2(
    `${sortedEntries}|${Math.round(roughness * 1000)}|${Math.round(metalness * 1000)}`
  )}`;

  return {
    catalogue: catalogueId,
    slotUris,
    roughness,
    metalness,
    color,
    defaultTileSizeMeters,
    variantSeed
  };
}
```

- [ ] **Step 4: Run the test to verify GREEN**

Same command as Step 2. Expected: all 7 tests pass.

- [ ] **Step 5: Verify gates**

Run:
```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```
Expected: full suite green (660 tests), 0 errors / 0 warnings.

---

### Task 2: texture-cache extension + tests

**Files:**
- Modify: `apps/museum/src/lib/museum/materials/texture-cache.ts`
- Create: `apps/museum/src/lib/museum/materials/texture-cache.test.ts`
- Modify: `apps/museum/src/lib/types/materials.ts:15-15` — extend `MaterialLoadStatus` with `'partial'`

**Interfaces:**
- Consumes: `EffectiveSceneMaterial`, single `THREE.TextureLoader` (existing).
- Produces (alongside legacy path, no signature removal):
  ```ts
  export type TextureSourceLoader = (
    uri: string,
    slot: MaterialTextureSlot
  ) => Promise<import('three').Texture>;

  export type EffectiveLoadResult =
    | { status: 'ready'; maps: LoadedTextureMaps }
    | { status: 'partial'; maps: LoadedTextureMaps; failed: string[] }
    | { status: 'failed'; error: string; maps: LoadedTextureMaps }
    | { status: 'fallback' };

  export function loadSourceTexture(uri: string, slot: MaterialTextureSlot): Promise<import('three').Texture>;
  export function loadEffectiveTextures(effective: EffectiveSceneMaterial): Promise<EffectiveLoadResult>;
  export function acquireEffectiveVariant(effective: EffectiveSceneMaterial, repeatX: number, repeatY: number, rotation?: number): LoadedTextureMaps;
  export function releaseEffectiveVariant(seed: string, repeatX: number, repeatY: number, rotation?: number): void;
  ```

- [ ] **Step 1: Extend the type** — `apps/museum/src/lib/types/materials.ts`

Replace:
```ts
export type MaterialLoadStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'fallback';
```
With:
```ts
export type MaterialLoadStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'failed' | 'fallback';
```

- [ ] **Step 2: Write failing tests** — `apps/museum/src/lib/museum/materials/texture-cache.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireEffectiveVariant,
  loadEffectiveTextures,
  loadSourceTexture,
  releaseEffectiveVariant,
  resetTextureCachesForTests
} from './texture-cache';
import type { EffectiveSceneMaterial } from './scene-instance-material';
import type { Texture as ThreeTexture } from 'three';

function makeTexture(uri: string): ThreeTexture {
  return {
    source: { data: null },
    isTexture: true,
    uuid: uri,
    image: { complete: true, naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement,
    needsUpdate: false,
    colorSpace: '',
    wrapS: 0,
    wrapT: 0,
    repeat: { set() {}, x: 1, y: 1 },
    rotation: 0,
    center: { set() {} },
    clone() { return makeTexture(this.uuid); },
    dispose() {}
  } as unknown as ThreeTexture;
}

const effectiveA: EffectiveSceneMaterial = {
  catalogue: 'plaster-warm',
  slotUris: { map: '/textures/plaster-warm/map.png' },
  roughness: 0.92,
  metalness: 0.02,
  color: '#c4b4a0',
  defaultTileSizeMeters: [2, 2],
  variantSeed: 'vAABBCC'
};

const effectiveB: EffectiveSceneMaterial = {
  catalogue: 'plaster-warm',
  slotUris: { map: '/textures/wall-detail.webp' },
  roughness: 0.92,
  metalness: 0.02,
  color: '#c4b4a0',
  defaultTileSizeMeters: [2, 2],
  variantSeed: 'vDDEEFF'
};

describe('texture-cache extensions', () => {
  beforeEach(() => {
    resetTextureCachesForTests();
  });

  afterEach(() => {
    resetTextureCachesForTests();
  });

  it('loadEffectiveTextures returns ready when every URI resolves', async () => {
    const stub = vi.fn(async (uri: string) => makeTexture(uri));
    // Inject custom loader by re-loading the module? Simpler: rely on the source loader
    // and stub `THREE.TextureLoader.load` via vi.mock at module scope. Here we directly
    // call loadEffectiveTextures with the loader mocked through vi.mock below.
    void stub;
    // Real assertion below uses module-level mock for THREE.Loader.prototype.load.
    expect((await import('three')).TextureLoader).toBeDefined();
  });

  it('produces distinct variants for different effective seeds at the same repeat', () => {
    const loader = () => Promise.resolve(makeTexture('/x.png'));
    void loader;
  });
});
```

**Re-write the simpler form using `vi.mock('three')`** — the test file's skeleton must mock `THREE.TextureLoader.load` once, then exercise the new functions. Use this final shape:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireEffectiveVariant,
  loadEffectiveTextures,
  releaseEffectiveVariant,
  resetTextureCachesForTests
} from './texture-cache';
import type { EffectiveSceneMaterial } from './scene-instance-material';
import type { Texture as ThreeTexture } from 'three';

const texturesByUri = new Map<string, ThreeTexture>();
const inflight = new Map<string, Promise<ThreeTexture>>();

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockTextureLoader {
    load(
      url: string,
      onLoad: (tex: ThreeTexture) => void,
      _onProgress: unknown,
      onError: (event: { message?: string }) => void
    ): unknown {
      const existing = texturesByUri.get(url);
      if (existing) {
        queueMicrotask(() => onLoad(existing));
        return;
      }
      const pending = inflight.get(url);
      if (pending) {
        pending.then((tex) => onLoad(tex), (err) => onError({ message: String(err) }));
        return;
      }
      const tex: ThreeTexture = {
        source: { data: null },
        isTexture: true,
        uuid: url,
        image: { complete: true, naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement,
        needsUpdate: false,
        colorSpace: '',
        wrapS: 0,
        wrapT: 0,
        repeat: { set() {}, x: 1, y: 1 },
        rotation: 0,
        center: { set() {} },
        clone() { return tex; },
        dispose() {}
      } as unknown as ThreeTexture;
      texturesByUri.set(url, tex);
      queueMicrotask(() => onLoad(tex));
      return;
    }
  }
  return { ...actual, TextureLoader: MockTextureLoader };
});

const effectiveA: EffectiveSceneMaterial = {
  catalogue: 'plaster-warm',
  slotUris: { map: '/textures/plaster-warm/map.png' },
  roughness: 0.92,
  metalness: 0.02,
  color: '#c4b4a0',
  defaultTileSizeMeters: [2, 2],
  variantSeed: 'vAABBCC'
};

const effectiveB: EffectiveSceneMaterial = {
  catalogue: 'plaster-warm',
  slotUris: { map: '/textures/wall-detail.webp' },
  roughness: 0.92,
  metalness: 0.02,
  color: '#c4b4a0',
  defaultTileSizeMeters: [2, 2],
  variantSeed: 'vDDEEFF'
};

describe('texture-cache extensions', () => {
  beforeEach(() => { texturesByUri.clear(); inflight.clear(); resetTextureCachesForTests(); });
  afterEach(() => { texturesByUri.clear(); inflight.clear(); resetTextureCachesForTests(); });

  it('loadEffectiveTextures returns ready when every URI resolves', async () => {
    const result = await loadEffectiveTextures(effectiveA);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.maps.map?.uuid).toBe('/textures/plaster-warm/map.png');
    }
  });

  it('produces distinct variants for different effective seeds at the same repeat', () => {
    const mapsA = acquireEffectiveVariant(effectiveA, 2, 2, 0);
    const mapsB = acquireEffectiveVariant(effectiveB, 2, 2, 0);
    expect(mapsA.map).not.toBe(mapsB.map);

    // Acquire again → refCount + 1, returns same maps reference.
    const acquireAgain = acquireEffectiveVariant(effectiveA, 2, 2, 0);
    expect(acquireAgain).toBe(mapsA);

    releaseEffectiveVariant(effectiveA.variantSeed, 2, 2, 0);
    releaseEffectiveVariant(effectiveA.variantSeed, 2, 2, 0);
  });

  it('release is idempotent', () => {
    acquireEffectiveVariant(effectiveA, 1, 1, 0);
    releaseEffectiveVariant(effectiveA.variantSeed, 1, 1, 0);
    releaseEffectiveVariant(effectiveA.variantSeed, 1, 1, 0);
    releaseEffectiveVariant(effectiveA.variantSeed, 1, 1, 0);
  });
});
```

- [ ] **Step 3: Run the test file to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/museum/materials/texture-cache.test.ts
```
Expected: failure — `loadEffectiveTextures`, `acquireEffectiveVariant`, `releaseEffectiveVariant` not exported.

- [ ] **Step 4: Extend `texture-cache.ts`** — append (do not delete any existing export) at the bottom of `apps/museum/src/lib/museum/materials/texture-cache.ts`:

```ts
import type { EffectiveSceneMaterial } from './scene-instance-material';
import type { MaterialTextureSlot as _Slot } from '$lib/types/materials';
// Above import kept for alignment with existing top-of-file imports.

export type EffectiveLoadResult =
  | { status: 'ready'; maps: LoadedTextureMaps }
  | { status: 'partial'; maps: LoadedTextureMaps; failed: string[] }
  | { status: 'failed'; error: string; maps: LoadedTextureMaps }
  | { status: 'fallback' };

const effectiveSourceCache = new Map<string, Promise<ThreeTexture>>();

export function loadSourceTexture(
  url: string,
  slot: MaterialTextureSlot
): Promise<ThreeTexture> {
  // Reuse the same TextureLoader + sourceCache route already used by loadSource().
  return loadSource(url, slot, 'effective');
}

export async function loadEffectiveTextures(
  effective: EffectiveSceneMaterial
): Promise<EffectiveLoadResult> {
  const entries = Object.entries(effective.slotUris) as [MaterialTextureSlot, string][];
  if (entries.length === 0) {
    return { status: 'fallback' };
  }

  const maps: LoadedTextureMaps = {};
  const failed: string[] = [];

  await Promise.all(
    entries.map(async ([slot, url]) => {
      try {
        maps[slot] = await loadSourceTexture(url, slot);
      } catch (error) {
        failed.push(error instanceof Error ? error.message : String(error));
      }
    })
  );

  if (!maps.map) {
    if (failed.length > 0) {
      return { status: 'failed', error: failed.join('; '), maps };
    }
    return { status: 'fallback' };
  }

  if (failed.length > 0) return { status: 'partial', maps, failed };
  return { status: 'ready', maps };
}

function effectiveVariantKey(
  seed: string,
  rx: number,
  ry: number,
  rot: number
): VariantKey {
  return `eff|${seed}|${rx.toFixed(4)}|${ry.toFixed(4)}|${rot.toFixed(4)}`;
}

export function acquireEffectiveVariant(
  effective: EffectiveSceneMaterial,
  repeatX: number,
  repeatY: number,
  rotation = 0
): LoadedTextureMaps {
  const key = effectiveVariantKey(effective.variantSeed, repeatX, repeatY, rotation);
  const existing = variantCache.get(key);
  if (existing) {
    existing.refCount += 1;
    return existing.maps;
  }

  const maps: LoadedTextureMaps = {};
  for (const [slot, source] of Object.entries(effective.slotUris) as [MaterialTextureSlot, string][]) {
    const cached = sourceCache.get(source);
    if (cached?.texture) {
      const clone = cached.texture.clone();
      clone.wrapS = RepeatWrapping;
      clone.wrapT = RepeatWrapping;
      clone.colorSpace = cached.texture.colorSpace;
      clone.repeat.set(repeatX, repeatY);
      clone.rotation = rotation;
      clone.center.set(0.5, 0.5);
      clone.needsUpdate = true;
      maps[slot] = clone;
    }
  }
  variantCache.set(key, { maps, refCount: 1 });
  return maps;
}

export function releaseEffectiveVariant(
  seed: string,
  repeatX: number,
  repeatY: number,
  rotation = 0
): void {
  const key = effectiveVariantKey(seed, repeatX, repeatY, rotation);
  const existing = variantCache.get(key);
  if (!existing) return;

  existing.refCount -= 1;
  if (existing.refCount > 0) return;

  for (const texture of Object.values(existing.maps)) texture?.dispose();
  variantCache.delete(key);
}
```

Also tighten `resetTextureCachesForTests()` so it leaves no leaks:

```ts
export function resetTextureCachesForTests() {
  for (const entry of variantCache.values()) {
    for (const texture of Object.values(entry.maps)) texture?.dispose();
  }
  variantCache.clear();
  materialLoadPromises.clear();
  sourceCache.clear();
  effectiveSourceCache.clear(); // (declared above; harmless if empty)
}
```

(Pick the smaller diff: leave `resetTextureCachesForTests` alone unless necessary — `effectiveSourceCache` is unused.)

- [ ] **Step 5: Run the test file to verify GREEN**

Same command as Step 3. Expected: 3 tests pass.

- [ ] **Step 6: Verify full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```
Expected: 663 / 663 tests pass, 0 errors / 0 warnings.

---

### Task 3: Verifier rewiring

**Files:**
- Modify: `apps/museum/src/lib/editor/texture-verifier.ts`
- Modify: `apps/museum/src/lib/editor/texture-verifier.test.ts`

**Interfaces:**
- Consumes: injected `TextureSourceLoader`; default `loadSourceTexture` from texture-cache.
- Produces:
  ```ts
  export type TextureSourceLoader = (
    uri: string,
    slot: MaterialTextureSlot
  ) => Promise<import('three').Texture>;

  export type TextureVerificationResult =
    | { status: 'ready' }
    | { status: 'unsafe-uri' }
    | { status: 'load-failed'; message: string };

  export function createTextureVerifier(loadSource?: TextureSourceLoader): TextureVerifier;
  ```

- [ ] **Step 1: Write failing tests with `TextureSourceLoader`** — replace the contents of `apps/museum/src/lib/editor/texture-verifier.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTextureVerifier } from './texture-verifier';
import type { Texture as ThreeTexture } from 'three';

const SAFE = '/textures/wall.webp';

function stubTexture(uri: string): ThreeTexture {
  return {
    source: { data: null },
    uuid: uri,
    image: { complete: true } as HTMLImageElement
  } as unknown as ThreeTexture;
}

describe('texture verifier', () => {
  it('rejects unsafe URIs without invoking the loader', async () => {
    const load = vi.fn(async (_uri: string, _slot: 'map') => stubTexture('x'));
    const verify = createTextureVerifier(load);

    const result = await verify('https://example.com/x.png');

    expect(result.status).toBe('unsafe-uri');
    expect(load).not.toHaveBeenCalled();
  });

  it('returns ready when the source loader resolves', async () => {
    const load = vi.fn(async (uri: string, _slot: 'map') => stubTexture(uri));
    const verify = createTextureVerifier(load);

    expect(await verify(SAFE)).toEqual({ status: 'ready' });
    expect(load).toHaveBeenCalledWith(SAFE, 'map');
  });

  it('returns load-failed when the source loader rejects', async () => {
    const load = vi.fn(async () => Promise.reject(new Error('boom')));
    const verify = createTextureVerifier(load);

    const result = await verify(SAFE);

    expect(result.status).toBe('load-failed');
    if (result.status === 'load-failed') {
      expect(result.message).toContain('boom');
    }
  });

  it('coalesces concurrent calls to the same URI', async () => {
    let resolvers: Array<() => void> = [];
    const load = vi.fn().mockImplementation(
      () =>
        new Promise<ThreeTexture>((resolve) => {
          resolvers.push(() => resolve(stubTexture('/textures/a.png')));
        })
    );
    const verify = createTextureVerifier(load);

    const first = verify('/textures/a.png');
    const second = verify('/textures/a.png');

    expect(load).toHaveBeenCalledTimes(1);
    resolvers.forEach((r) => r());
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ status: 'ready' });
    expect(b).toEqual({ status: 'ready' });
  });

  it('does not coalesce distinct URIs', async () => {
    const load = vi.fn(async (uri: string, _slot: 'map') => stubTexture(uri));
    const verify = createTextureVerifier(load);
    await Promise.all([verify('/textures/a.png'), verify('/textures/b.png')]);
    expect(load.mock.calls.map((c) => c[0])).toEqual([
      '/textures/a.png',
      '/textures/b.png'
    ]);
  });

  it('retries a failed URI on the next call', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce(stubTexture(SAFE));
    const verify = createTextureVerifier(load);

    const failed = await verify(SAFE);
    expect(failed.status).toBe('load-failed');

    const retry = await verify(SAFE);
    expect(retry).toEqual({ status: 'ready' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/texture-verifier.test.ts
```
Expected: failure — `status: 'unsafe-uri'` does not match `success: false` shape.

- [ ] **Step 3: Rewrite `texture-verifier.ts`** — replace the file contents:

```ts
import { isSafeTextureUri } from '$lib/content/texture-uri';
import { loadSourceTexture } from '$lib/museum/materials/texture-cache';
import type { MaterialTextureSlot } from '$lib/types/materials';
import type { Texture as ThreeTexture } from 'three';

export type TextureSourceLoader = (
  uri: string,
  slot: MaterialTextureSlot
) => Promise<ThreeTexture>;

export type TextureVerificationResult =
  | { status: 'ready' }
  | { status: 'unsafe-uri' }
  | { status: 'load-failed'; message: string };

export type TextureVerifier = (uri: string) => Promise<TextureVerificationResult>;

/**
 * Editor-only verifier. URI safety is checked before any loader call and
 * concurrent checks for the same URI share one pending promise. Errors are
 * NOT cached permanently; retries re-invoke the loader.
 *
 * Pass `loadSource` to inject a deterministic loader for tests. Default
 * delegates to texture-cache.loadSourceTexture so a registered URI produces
 * exactly one THREE.Texture shared with the renderer.
 */
export function createTextureVerifier(loadSource?: TextureSourceLoader): TextureVerifier {
  const loader = loadSource ?? loadSourceTexture;
  const pending = new Map<string, Promise<TextureVerificationResult>>();

  function attempt(uri: string): Promise<TextureVerificationResult> {
    return loader(uri, 'map').then(
      () => ({ status: 'ready' }) as TextureVerificationResult,
      (error: unknown) => ({
        status: 'load-failed',
        message: error instanceof Error ? error.message : String(error)
      }) as TextureVerificationResult
    );
  }

  return (uri: string) => {
    if (!isSafeTextureUri(uri)) {
      return Promise.resolve({
        status: 'unsafe-uri',
        message: `Texture URI must be a safe root-relative public path: ${uri}`
      } satisfies TextureVerificationResult);
    }
    const inflight = pending.get(uri);
    if (inflight) return inflight;
    const next = attempt(uri).finally(() => pending.delete(uri));
    pending.set(uri, next);
    return next;
  };
}
```

- [ ] **Step 4: Run to verify GREEN**

Same command as Step 2. Expected: 6 tests pass.

- [ ] **Step 5: Verify full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```
Expected: 666 / 666 tests pass, 0 errors / 0 warnings.

---

### Task 4: SceneInstanceMaterial component

**Files:**
- Create: `apps/museum/src/lib/museum/materials/SceneInstanceMaterial.svelte`

**Interfaces:**
- Consumes: `EffectiveSceneMaterial`, `surfaceSize: Vec2`, optional `rotation = 0`, optional `receiveLighting = true`, bindable `status`.
- Produces: `<T.MeshStandardMaterial>` populated from cache + resolver.

- [ ] **Step 1: Write the component** — `apps/museum/src/lib/museum/materials/SceneInstanceMaterial.svelte`

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { T } from '@threlte/core';
  import { computeTextureRepeat } from '$lib/content/materials';
  import type { MaterialLoadStatus, Vec2 } from '$lib/types/materials';
  import {
    acquireEffectiveVariant,
    loadEffectiveTextures,
    releaseEffectiveVariant,
    type LoadedTextureMaps
  } from './texture-cache';
  import type { EffectiveSceneMaterial } from './scene-instance-material';

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

  const repeat = $derived(computeTextureRepeat(surfaceSize, material.defaultTileSizeMeters));

  let maps = $state<LoadedTextureMaps | undefined>(undefined);
  let acquiredKey: { seed: string; rx: number; ry: number; rot: number } | null = null;

  $effect(() => {
    const seed = material.variantSeed;
    const [rx, ry] = repeat;
    const rot = rotation;
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
        console.warn(`[SceneInstanceMaterial] ${material.catalogue}: ${result.error}`);
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

  onDestroy(() => {
    maps = undefined;
  });
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

Note: this is a renderer-only file — no Vitest unit test (Three `<T>` components cannot render under node). Visual parity is verified by Tasks 6/7's integration + manual browser step in Task 10.

- [ ] **Step 2: Verify Svelte + type check**

```bash
cd /Users/tony/Documents/Personal && npm run check -w @portfolio/museum
```
Expected: 0 errors / 0 warnings.

---

### Task 5: Model material remap helper + tests

**Files:**
- Create: `apps/museum/src/lib/museum/assets/instance-material-remap.ts`
- Create: `apps/museum/src/lib/museum/assets/instance-material-remap.test.ts`

**Interfaces:**
- Consumes: `Object3D` from cloned GLTF, `EffectiveSceneMaterial`, `repeat: [number, number]`.
- Produces:
  ```ts
  export type RemapKey = { seed: string; rx: number; ry: number; rot: number };
  export function remapModelMaterials(
    scene: Object3D,
    effective: EffectiveSceneMaterial,
    repeat: [number, number]
  ): { acquiredKey: RemapKey };
  export function releaseModelMaterialRemap(key: RemapKey): void;
  ```

- [ ] **Step 1: Write failing tests** — `apps/museum/src/lib/museum/assets/instance-material-remap.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three';
import {
  remapModelMaterials,
  releaseModelMaterialRemap
} from './instance-material-remap';
import { resetTextureCachesForTests } from '../materials/texture-cache';
import type { EffectiveSceneMaterial } from '../materials/scene-instance-material';

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockTextureLoader {
    load(
      url: string,
      onLoad: (tex: unknown) => void,
      _onProgress: unknown,
      _onError: (e: unknown) => void
    ): unknown {
      const tex = {
        source: { data: null },
        uuid: url,
        image: { complete: true } as HTMLImageElement,
        wrapS: 0,
        wrapT: 0,
        repeat: { set() {}, x: 1, y: 1 },
        rotation: 0,
        center: { set() {} },
        needsUpdate: false,
        clone(this: unknown) { return this; },
        dispose() {}
      };
      queueMicrotask(() => onLoad(tex));
      return;
    }
  }
  return { ...actual, TextureLoader: MockTextureLoader };
});

const effective: EffectiveSceneMaterial = {
  catalogue: 'plaster-warm',
  slotUris: { map: '/textures/x.png' },
  roughness: 0.92,
  metalness: 0.02,
  color: '#c4b4a0',
  defaultTileSizeMeters: [2, 2],
  variantSeed: 'vREMAP1'
};

describe('instance-material-remap', () => {
  beforeEach(() => {
    resetTextureCachesForTests();
  });

  it('replaces every mesh material with a fresh MeshStandardMaterial', () => {
    const group = new Group();
    const a = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    const b = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    group.add(a, b);

    const { acquiredKey } = remapModelMaterials(group, effective, [1, 1]);

    expect(acquiredKey.seed).toBe('vREMAP1');
    for (const mesh of [a, b]) {
      expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
      expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBeTruthy();
    }
  });

  it('releases the variant exactly once per call', () => {
    const group = new Group();
    group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
    const key = remapModelMaterials(group, effective, [1, 1]).acquiredKey;

    // Should be safe to release; no throw, no double-dispose.
    releaseModelMaterialRemap(key);
    releaseModelMaterialRemap(key);
  });
});
```

- [ ] **Step 2: Run to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/museum/assets/instance-material-remap.test.ts
```
Expected: module-not-found failure.

- [ ] **Step 3: Implement `instance-material-remap.ts`**

```ts
import { Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { acquireEffectiveVariant, releaseEffectiveVariant } from '../materials/texture-cache';
import type { EffectiveSceneMaterial } from '../materials/scene-instance-material';

export type RemapKey = { seed: string; rx: number; ry: number; rot: number };

/**
 * Replaces every Mesh's material in `scene` with a fresh `MeshStandardMaterial`
 * populated from `effective` + the cache. Each fresh material references the
 * same ref-counted texture maps; one acquire per call, one release.
 */
export function remapModelMaterials(
  scene: Object3D,
  effective: EffectiveSceneMaterial,
  repeat: [number, number]
): { acquiredKey: RemapKey } {
  const [rx, ry] = repeat;
  const maps = acquireEffectiveVariant(effective, rx, ry, 0);

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = new MeshStandardMaterial({
      color: effective.color,
      roughness: effective.roughness,
      metalness: effective.metalness,
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      aoMap: maps.aoMap,
      metalnessMap: maps.metalnessMap
    });
    material.userData['museumEffectiveSeed'] = effective.variantSeed;
    object.material = material;
  });

  return {
    acquiredKey: { seed: effective.variantSeed, rx, ry, rot: 0 }
  };
}

export function releaseModelMaterialRemap(key: RemapKey): void {
  releaseEffectiveVariant(key.seed, key.rx, key.ry, key.rot);
}
```

- [ ] **Step 4: Run to verify GREEN**

Same command as Step 2. Expected: 2 tests pass.

- [ ] **Step 5: Verify full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```
Expected: 668 / 668 tests pass, 0 errors / 0 warnings.

---

### Task 6: EntityPrimitive integration

**Files:**
- Modify: `apps/museum/src/lib/museum/entities/EntityPrimitive.svelte`

**Interfaces:**
- Props now include `document: MuseumSceneDocument`. Component resolves `effective` and renders via `SceneInstanceMaterial`.

- [ ] **Step 1: Update `EntityPrimitive.svelte`** — replace the entire file with:

```svelte
<script lang="ts">
  import { T } from '@threlte/core';
  import type { ScenePrimitiveEntity } from '$lib/content/scene';
  import type { MuseumSceneDocument } from '$lib/content/scene';
  import { resolveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
  import SceneInstanceMaterial from '$lib/museum/materials/SceneInstanceMaterial.svelte';
  import type { Vec2 } from '$lib/types/materials';

  let {
    entity,
    document
  }: {
    entity: ScenePrimitiveEntity;
    document: MuseumSceneDocument;
  } = $props();

  const surfaceSize = $derived.by((): Vec2 => {
    switch (entity.primitive) {
      case 'box':
        return [entity.dimensions.width, entity.dimensions.depth];
      case 'plane':
        return [entity.dimensions.width, entity.dimensions.height];
      case 'cylinder':
        return [entity.dimensions.radius * 2, entity.dimensions.height];
      case 'sphere':
        return [entity.dimensions.radius * 2, entity.dimensions.radius * 2];
    }
  });

  const effective = $derived(
    resolveSceneMaterial(document, {
      materialInstanceId: entity.materialInstanceId ?? null,
      fallbackCatalogueId: entity.materialId
    })
  );
</script>

{#if entity.primitive === 'box'}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.BoxGeometry args={[entity.dimensions.width, entity.dimensions.height, entity.dimensions.depth]} />
    <SceneInstanceMaterial material={effective} {surfaceSize} />
  </T.Mesh>
{:else if entity.primitive === 'plane'}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.PlaneGeometry args={[entity.dimensions.width, entity.dimensions.height]} />
    <SceneInstanceMaterial material={effective} {surfaceSize} />
  </T.Mesh>
{:else if entity.primitive === 'cylinder'}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.CylinderGeometry args={[entity.dimensions.radius, entity.dimensions.radius, entity.dimensions.height, 32]} />
    <SceneInstanceMaterial material={effective} {surfaceSize} />
  </T.Mesh>
{:else}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.SphereGeometry args={[entity.dimensions.radius, 32, 24]} />
    <SceneInstanceMaterial material={effective} {surfaceSize} />
  </T.Mesh>
{/if}
```

- [ ] **Step 2: Verify Svelte + type check**

```bash
cd /Users/tony/Documents/Personal && npm run check -w @portfolio/museum
```
Expected: 0 errors / 0 warnings. The next task threads `document` into the parent.

---

### Task 7: AssetModel integration

**Files:**
- Modify: `apps/museum/src/lib/museum/assets/AssetModel.svelte`

**Interfaces:**
- New props: `entity?: SceneModelEntity` (optional for `/dev/assets` previews), `document?: MuseumSceneDocument`. Remap effect runs only when both are present AND `entity.materialInstanceId` is set.

- [ ] **Step 1: Add imports and props** at the top of `<script lang="ts">`, after existing imports:

```ts
import type { MuseumSceneDocument, SceneModelEntity } from '$lib/content/scene';
import { resolveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
import { remapModelMaterials, releaseModelMaterialRemap } from './instance-material-remap';
```

- [ ] **Step 2: Extend the props block** — replace the current `props` block so `entity` and `document` join the existing ones:

```ts
let {
  assetId,
  entity = undefined as SceneModelEntity | undefined,
  document = undefined as MuseumSceneDocument | undefined,
  position = ZERO,
  rotation = ZERO,
  scale = 1,
  fallback,
  enabled = true,
  visible = true,
  wireframe = false,
  shadows = true,
  showBounds = false,
  localTransform = false,
  status = $bindable<AssetLoadStatus>('idle'),
  metrics = $bindable<AssetMetrics | undefined>(),
  error = $bindable<string | undefined>()
}: {
  assetId: AssetId;
  entity?: SceneModelEntity;
  document?: MuseumSceneDocument;
  position?: Vec3;
  rotation?: Vec3;
  scale?: number;
  fallback?: FallbackKind;
  enabled?: boolean;
  visible?: boolean;
  wireframe?: boolean;
  shadows?: boolean;
  showBounds?: boolean;
  localTransform?: boolean;
  status?: AssetLoadStatus;
  metrics?: AssetMetrics;
  error?: string;
} = $props();
```

- [ ] **Step 3: Add the remap effect** — append after the existing wireframe `$effect`, before `computedMetrics`:

```ts
let acquiredRemap = $state<{ seed: string; rx: number; ry: number; rot: number } | null>(null);

const remapEligible = $derived(Boolean(entity && document && entity.materialInstanceId));

const effective = $derived(
  entity && document
    ? resolveSceneMaterial(document, {
        materialInstanceId: entity.materialInstanceId ?? null,
        fallbackCatalogueId: 'paper-aged'
      })
    : null
);

$effect(() => {
  if (!instance || !remapEligible || !effective) return;
  const result = remapModelMaterials(instance, effective, [1, 1]);
  acquiredRemap = result.acquiredKey;
  return () => {
    releaseModelMaterialRemap(acquiredRemap);
    acquiredRemap = null;
  };
});
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/tony/Documents/Personal && npm run check -w @portfolio/museum
```
Expected: 0 errors / 0 warnings.

---

### Task 8: MuseumEntities document threading

**Files:**
- Modify: `apps/museum/src/lib/museum/MuseumEntities.svelte`

**Interfaces:**
- Both EntityPrimitive and AssetModel now receive `entity` and `document` (`document` = `scene.document` — already part of `RuntimeMuseumScene`).

- [ ] **Step 1: Read current call sites** — confirm the existing loop binds `entity` to `AssetModel`/`EntityPrimitive`. If they only receive subsets (e.g. `entity.assetId`), extend both call sites to also pass `entity` and `document={scene.document}`.

Concretely, replace the AssetModel branch inside both the `placementRegistry` block and the visitor block with:

```svelte
<AssetModel
  assetId={entity.assetId}
  fallback={entity.fallback}
  {enabled}
  localTransform
  entity={isSceneModelEntity(entity) ? entity : undefined}
  document={scene.document}
/>
```

And the EntityPrimitive branch:

```svelte
<EntityPrimitive entity={entity} document={scene.document} />
```

(Apply only for primitives; the guard `isScenePrimitiveEntity(entity)` already restricts the branch.)

- [ ] **Step 2: Type-check**

```bash
cd /Users/tony/Documents/Personal && npm run check -w @portfolio/museum
```
Expected: 0 errors. Existing tests (which don't pass `document`) must still type-pass because `document` is optional at the AssetModel prop level.

---

### Task 9: Editor inspector placeholder removal

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorMaterialInspector.svelte`

- [ ] **Step 1: Delete the placeholder paragraph**

Remove these lines from the markup (look for "Assigned materials are saved..."):

```svelte
<p class="phase-note">
  Assigned materials are saved to the scene document now; viewport rendering arrives in Phase 5.3.
</p>
```

And the matching CSS rule `.phase-note { ... }`.

- [ ] **Step 2: Type-check**

```bash
cd /Users/tony/Documents/Personal && npm run check -w @portfolio/museum
```
Expected: 0 errors / 0 warnings.

---

### Task 10: Final verification + handoff

**Files:**
- Run-only.
- Create: `docs/agent-handoffs/phase-5.3.md`

- [ ] **Step 1: Full automated gate**

```bash
cd /Users/tony/Documents/Personal && \
  npm run test -w @portfolio/museum && \
  npm run check -w @portfolio/museum && \
  npm run build -w @portfolio/museum && \
  git diff --check
```

Expected: 668 / 668 tests pass; check 0 / 0; build exits 0 (only third-party/adapter-auto env note acceptable); diff-check silent.

- [ ] **Step 2: Browser smoke (manual or via registered preview)**

Recommended flow on `/dev/museum-editor` and `/museum`:

1. Register `/textures/existing-wall-detail.webp` in the Assets → Textures library and confirm the thumbnail loads.
2. Drag the texture onto a primitive (chair, table). Confirm the visible material updates within a frame and one history entry records the change.
3. Drag the texture onto a model. Confirm the entire model swaps to the assigned material.
4. Edit `roughness` / `metalness` from the inspector. Confirm the painted surface reflects the change.
5. Make a shared material instance unique. Undo. Redo. Verify the visual state round-trips exactly.
6. Reset / Import / Undo → no console warnings, no GPU leak (briefly inspect via `console` reports from Three.js).

Skip if no manual step is feasible — the automated gates above cover correctness; the browser step is a visual parity confirmation.

- [ ] **Step 3: Production isolation sanity check**

Build:

```bash
cd /Users/tony/Documents/Personal && npm run build -w @portfolio/museum
```

Confirm `/museum` remains reachable at `/museum` and `/dev/museum-editor` exports only with the dev server; the new `SceneInstanceMaterial` ships via the shared `museum/materials/` tree (visitor + editor), but `createTextureVerifier` and `EditorMaterialInspector` remain editor-only chunks. Run `git diff --stat` and inspect that `museum/materials/texture-cache.ts` and `museum/materials/scene-instance-material.ts` are reachable from both.

- [ ] **Step 4: Write the handoff** — `docs/agent-handoffs/phase-5.3.md`

Sections to include:

1. **Status** — Complete / awaiting user review.
2. **Date** — today.
3. **Goal** — One sentence from this plan's Goal.
4. **Delivered** — file-by-file bullet list mapping spec to implementation.
5. **Verification evidence** — exact counts (tests added, total), check result, build result, browser results.
6. **Plan deviations** — list any divergence from the spec (if none: "no deviations").
7. **Production isolation** — confirm /museum is unchanged shape and editor chunks remain editor-only.
8. **Known limitation** — none expected; mention if any render edge case showed up during smoke.
9. **Next slice pointer** — Phase 5.4 binary upload + package export (per Phase 5 plan). Reference `docs/plans/museum-editor-workspace/phase-5-textures.md`.

- [ ] **Step 5: Update project status files**

- Modify `docs/agent-handoffs/CURRENT.md`:
  - Replace "Phase 5.3 — shared material rendering" line with a "complete" line + reference the new handoff.
- Modify `docs/plans/museum-editor-workspace/README-museum-editor.md`:
  - Mark Phase 5.3 complete and add the next-slice pointer (Phase 5.4).

No commits (per AGENTS.md).

---

## Execution Notes

- Each task's tests must pass on their own; the full suite runs at the end of each task plus a final gate.
- No commits ever. The plan replaces "git commit" steps with explicit "verify gates" steps.
- Use the same `cd /Users/tony/Documents/Personal && ...` prefix so commands work from any directory.
- The resolver + cache are the two foundations; the renderer and remap depend on them; the entity integrations depend on those; the final gate confirms the whole stack renders identically.
- If any modified file refuses to compile because of `import.meta.env.DEV` outside a Vite context, route the dev-warn through a tiny `isDevEnv` helper (Task 1) or via `vi.stubEnv('DEV', true)` in tests.
