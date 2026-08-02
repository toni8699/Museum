<script lang="ts">
  import { T } from '@threlte/core';
  import type { ScenePrimitiveEntity } from '$lib/content/scene';
  import type { Vec2 } from '$lib/types/materials';
  import MuseumMaterial from '../materials/MuseumMaterial.svelte';

  let { entity }: { entity: ScenePrimitiveEntity } = $props();

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
</script>

{#if entity.primitive === 'box'}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.BoxGeometry
      args={[entity.dimensions.width, entity.dimensions.height, entity.dimensions.depth]}
    />
    <MuseumMaterial materialId={entity.materialId} {surfaceSize} />
  </T.Mesh>
{:else if entity.primitive === 'plane'}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.PlaneGeometry args={[entity.dimensions.width, entity.dimensions.height]} />
    <MuseumMaterial materialId={entity.materialId} {surfaceSize} />
  </T.Mesh>
{:else if entity.primitive === 'cylinder'}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.CylinderGeometry args={[entity.dimensions.radius, entity.dimensions.radius, entity.dimensions.height, 32]} />
    <MuseumMaterial materialId={entity.materialId} {surfaceSize} />
  </T.Mesh>
{:else}
  <T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
    <T.SphereGeometry args={[entity.dimensions.radius, 32, 24]} />
    <MuseumMaterial materialId={entity.materialId} {surfaceSize} />
  </T.Mesh>
{/if}
