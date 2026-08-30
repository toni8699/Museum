<script lang="ts">
  import { T } from '@threlte/core';
  import { getMaterial } from '$lib/content/materials';
  import MuseumMaterial from '$lib/museum/materials/MuseumMaterial.svelte';
  import type { MaterialId, Vec2 } from '$lib/types/materials';

  let {
    materialId,
    surfaceSize,
    tint,
    wireframe = false
  }: {
    materialId: MaterialId;
    surfaceSize: Vec2;
    tint?: string;
    wireframe?: boolean;
  } = $props();

  const definition = $derived(getMaterial(materialId));
</script>

{#if wireframe}
  <T.MeshStandardMaterial
    color={tint ?? definition.fallbackColor}
    roughness={definition.roughness}
    metalness={definition.metalness}
    wireframe
  />
{:else}
  <MuseumMaterial {materialId} {surfaceSize} {tint} textures="off" />
{/if}
