import {
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture as ThreeTexture
} from 'three';
import type { MaterialDefinition, MaterialTextureSlot } from '$lib/types/materials';

export type LoadedTextureMaps = Partial<Record<MaterialTextureSlot, ThreeTexture>>;

export type MaterialTexturesResult =
  | { status: 'loading' }
  | { status: 'ready'; maps: LoadedTextureMaps }
  | { status: 'failed'; error: string; maps?: LoadedTextureMaps };

type SourceEntry = {
  promise: Promise<ThreeTexture>;
  texture?: ThreeTexture;
  error?: string;
};

type VariantKey = string;

type VariantEntry = {
  maps: LoadedTextureMaps;
  refCount: number;
};

const loader = new TextureLoader();
const sourceCache = new Map<string, SourceEntry>();
const variantCache = new Map<VariantKey, VariantEntry>();
const materialLoadPromises = new Map<string, Promise<MaterialTexturesResult>>();

function applySourceDefaults(texture: ThreeTexture, slot: MaterialTextureSlot) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = slot === 'map' ? SRGBColorSpace : NoColorSpace;
  texture.needsUpdate = true;
}

function loadSource(url: string, slot: MaterialTextureSlot, materialId: string): Promise<ThreeTexture> {
  const existing = sourceCache.get(url);
  if (existing) {
    if (existing.error) return Promise.reject(new Error(existing.error));
    if (existing.texture) return Promise.resolve(existing.texture);
    return existing.promise;
  }

  const promise = new Promise<ThreeTexture>((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        applySourceDefaults(texture, slot);
        const entry = sourceCache.get(url);
        if (entry) entry.texture = texture;
        resolve(texture);
      },
      undefined,
      (event) => {
        const message = `Failed to load texture for material "${materialId}": ${url}`;
        console.warn(message, event);
        const entry = sourceCache.get(url);
        if (entry) entry.error = message;
        reject(new Error(message));
      }
    );
  });

  sourceCache.set(url, { promise });
  return promise;
}

function variantKey(
  materialId: string,
  repeatX: number,
  repeatY: number,
  rotation: number
): VariantKey {
  return `${materialId}|${repeatX.toFixed(4)}|${repeatY.toFixed(4)}|${rotation.toFixed(4)}`;
}

function cloneMaps(
  sources: LoadedTextureMaps,
  repeatX: number,
  repeatY: number,
  rotation: number
): LoadedTextureMaps {
  const maps: LoadedTextureMaps = {};

  for (const [slot, source] of Object.entries(sources) as [MaterialTextureSlot, ThreeTexture][]) {
    if (!source) continue;
    const clone = source.clone();
    clone.wrapS = RepeatWrapping;
    clone.wrapT = RepeatWrapping;
    clone.colorSpace = source.colorSpace;
    clone.repeat.set(repeatX, repeatY);
    clone.rotation = rotation;
    clone.center.set(0.5, 0.5);
    clone.needsUpdate = true;
    maps[slot] = clone;
  }

  return maps;
}

export async function loadMaterialTextures(
  definition: MaterialDefinition
): Promise<MaterialTexturesResult> {
  const textures = definition.textures;
  if (!textures || Object.keys(textures).length === 0) {
    return { status: 'failed', error: `Material "${definition.id}" has no texture paths` };
  }

  const cached = materialLoadPromises.get(definition.id);
  if (cached) return cached;

  const promise = (async (): Promise<MaterialTexturesResult> => {
    const maps: LoadedTextureMaps = {};
    const errors: string[] = [];

    await Promise.all(
      (Object.entries(textures) as [MaterialTextureSlot, string][]).map(async ([slot, url]) => {
        try {
          maps[slot] = await loadSource(url, slot, definition.id);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      })
    );

    if (!maps.map && errors.length > 0) {
      return { status: 'failed', error: errors.join('; '), maps };
    }

    if (errors.length > 0) {
      console.warn(
        `Material "${definition.id}" loaded partially; using available maps. ${errors.join('; ')}`
      );
    }

    return { status: 'ready', maps };
  })();

  materialLoadPromises.set(definition.id, promise);
  return promise;
}

export function acquireMaterialVariant(
  definition: MaterialDefinition,
  sourceMaps: LoadedTextureMaps,
  repeatX: number,
  repeatY: number,
  rotation = 0
): LoadedTextureMaps {
  const key = variantKey(definition.id, repeatX, repeatY, rotation);
  const existing = variantCache.get(key);
  if (existing) {
    existing.refCount += 1;
    return existing.maps;
  }

  const maps = cloneMaps(sourceMaps, repeatX, repeatY, rotation);
  variantCache.set(key, { maps, refCount: 1 });
  return maps;
}

export function releaseMaterialVariant(
  materialId: string,
  repeatX: number,
  repeatY: number,
  rotation = 0
) {
  const key = variantKey(materialId, repeatX, repeatY, rotation);
  const existing = variantCache.get(key);
  if (!existing) return;

  existing.refCount -= 1;
  if (existing.refCount > 0) return;

  for (const texture of Object.values(existing.maps)) {
    texture?.dispose();
  }
  variantCache.delete(key);
}

/** Test helper: clear in-memory caches (does not dispose GPU sources still referenced). */
export function resetTextureCachesForTests() {
  for (const entry of variantCache.values()) {
    for (const texture of Object.values(entry.maps)) texture?.dispose();
  }
  variantCache.clear();
  materialLoadPromises.clear();
  sourceCache.clear();
}

// ---------------------------------------------------------------------------
// Phase 5.3 — per-effective material-instance variant pool.
// ---------------------------------------------------------------------------

import type { EffectiveSceneMaterial } from './scene-instance-material';

export type EffectiveLoadResult =
  | { status: 'ready'; maps: LoadedTextureMaps }
  | { status: 'partial'; maps: LoadedTextureMaps; failed: string[] }
  | { status: 'failed'; error: string; maps: LoadedTextureMaps }
  | { status: 'fallback' };

/**
 * Source loader reused by both Phase 5.2 catalogue path and Phase 5.3 effective
 * path. Same URL produces a single `THREE.Texture` instance regardless of caller.
 */
export function loadSourceTexture(
  url: string,
  slot: MaterialTextureSlot
): Promise<ThreeTexture> {
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
    entries.map(async ([entrySlot, url]) => {
      try {
        maps[entrySlot] = await loadSourceTexture(url, entrySlot);
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
  for (const [entrySlot, url] of Object.entries(effective.slotUris) as [
    MaterialTextureSlot,
    string
  ][]) {
    const cached = sourceCache.get(url);
    if (!cached?.texture) continue;
    const source = cached.texture;
    const clone = source.clone();
    clone.wrapS = RepeatWrapping;
    clone.wrapT = RepeatWrapping;
    clone.colorSpace = source.colorSpace;
    clone.repeat.set(repeatX, repeatY);
    clone.rotation = rotation;
    clone.center.set(0.5, 0.5);
    clone.needsUpdate = true;
    maps[entrySlot] = clone;
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
