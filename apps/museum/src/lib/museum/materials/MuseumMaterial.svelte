<script lang="ts">
  import { onDestroy } from 'svelte';
  import { T } from '@threlte/core';
  import { computeTextureRepeat, getMaterial } from '$lib/content/materials';
  import type {
    MaterialId,
    MaterialLoadStatus,
    MaterialTextureMode,
    Vec2
  } from '$lib/types/materials';
  import {
    acquireMaterialVariant,
    loadMaterialTextures,
    releaseMaterialVariant,
    type LoadedTextureMaps
  } from './texture-cache';

  let {
    materialId,
    surfaceSize,
    receiveLighting = true,
    textures = 'auto' as MaterialTextureMode,
    tint,
    repeat: repeatOverride,
    rotation = 0,
    status = $bindable<MaterialLoadStatus>('idle')
  }: {
    materialId: MaterialId;
    surfaceSize: Vec2;
    receiveLighting?: boolean;
    textures?: MaterialTextureMode;
    tint?: string;
    repeat?: Vec2;
    rotation?: number;
    status?: MaterialLoadStatus;
  } = $props();

  const definition = $derived(getMaterial(materialId));
  const tileSize = $derived<[number, number]>(definition.defaultTileSizeMeters ?? [1, 1]);
  const computedRepeat = $derived(
    repeatOverride ?? computeTextureRepeat(surfaceSize, tileSize)
  );
  const color = $derived(tint ?? definition.fallbackColor);

  let maps = $state<LoadedTextureMaps | undefined>(undefined);

  $effect(() => {
    const def = definition;
    const [rx, ry] = computedRepeat;
    const rot = rotation;
    const mode = textures;
    let cancelled = false;
    let acquiredKey: { id: string; rx: number; ry: number; rot: number } | null = null;

    maps = undefined;

    if (mode === 'off' || !def.textures || Object.keys(def.textures).length === 0) {
      status = 'fallback';
      return () => {
        cancelled = true;
      };
    }

    status = 'loading';

    loadMaterialTextures(def).then((result) => {
      if (cancelled) return;

      if (result.status !== 'ready' || !result.maps.map) {
        status = 'failed';
        maps = undefined;
        if (result.status === 'failed') {
          console.warn(`[MuseumMaterial] ${def.id}: ${result.error}`);
        }
        return;
      }

      maps = acquireMaterialVariant(def, result.maps, rx, ry, rot);
      acquiredKey = { id: def.id, rx, ry, rot };
      status = 'ready';
    });

    return () => {
      cancelled = true;
      maps = undefined;
      if (acquiredKey) {
        releaseMaterialVariant(acquiredKey.id, acquiredKey.rx, acquiredKey.ry, acquiredKey.rot);
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
  {color}
  roughness={definition.roughness}
  metalness={definition.metalness}
  map={maps?.map}
  normalMap={maps?.normalMap}
  roughnessMap={maps?.roughnessMap}
  aoMap={maps?.aoMap}
  metalnessMap={maps?.metalnessMap}
  toneMapped={receiveLighting}
/>
