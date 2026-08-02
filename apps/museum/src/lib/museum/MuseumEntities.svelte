<script lang="ts">
  import { T } from '@threlte/core';
  import { getRoom } from '$lib/content/rooms';
  import type { RuntimeMuseumScene, SceneEntity } from '$lib/content/scene';
  import {
    isSceneLightEntity,
    isSceneModelEntity,
    isScenePrimitiveEntity,
    modelEntityToPlacement
  } from '$lib/content/scene';
  import type { MuseumRoomId } from '$lib/types/museum';
  import EditorPlacementRoot from './EditorPlacementRoot.svelte';
  import type { EditorPlacementRegistry } from './placement-registry';
  import AssetModel from './assets/AssetModel.svelte';
  import EntityLight from './entities/EntityLight.svelte';
  import EntityPrimitive from './entities/EntityPrimitive.svelte';
  import { isSceneObjectEnabled } from './paris-activation';

  let {
    scene,
    preloadParisHero = false,
    loadParisSalon = false,
    placementRegistry
  }: {
    scene: RuntimeMuseumScene;
    preloadParisHero?: boolean;
    loadParisSalon?: boolean;
    /** Editor-only; omitted on visitor `/museum`. */
    placementRegistry?: EditorPlacementRegistry;
  } = $props();

  const roomGroups = $derived.by(() => {
    const entitiesByRoom = new Map<MuseumRoomId, SceneEntity[]>();

    for (const entity of scene.entities) {
      const entities = entitiesByRoom.get(entity.roomId) ?? [];
      entities.push(entity);
      entitiesByRoom.set(entity.roomId, entities);
    }

    return [...entitiesByRoom].map(([roomId, entities]) => ({
      room: getRoom(roomId),
      entities
    }));
  });
</script>

{#each roomGroups as group (group.room.id)}
  <T.Group position={group.room.position} rotation={group.room.rotation}>
    {#each group.entities as entity (entity.id)}
      {#if placementRegistry}
        <EditorPlacementRoot
          placementId={entity.id}
          roomId={entity.roomId}
          {placementRegistry}
          position={entity.position}
          rotation={entity.rotation}
          scale={entity.scale ?? 1}
        >
          {#if isSceneModelEntity(entity)}
            {@const placement = modelEntityToPlacement(entity)}
            {@const enabled = isSceneObjectEnabled(placement, {
              preloadParisHero,
              loadParisSalon
            })}
            <AssetModel
              assetId={entity.assetId}
              fallback={entity.fallback}
              {enabled}
              localTransform
            />
          {:else if isScenePrimitiveEntity(entity)}
            <EntityPrimitive {entity} />
          {:else if isSceneLightEntity(entity)}
            <EntityLight {entity} showPickProxy />
          {/if}
        </EditorPlacementRoot>
      {:else if isSceneModelEntity(entity)}
        {@const placement = modelEntityToPlacement(entity)}
        {@const enabled = isSceneObjectEnabled(placement, {
          preloadParisHero,
          loadParisSalon
        })}
        <AssetModel
          assetId={entity.assetId}
          position={entity.position}
          rotation={entity.rotation}
          scale={entity.scale ?? 1}
          fallback={entity.fallback}
          {enabled}
        />
      {:else if isScenePrimitiveEntity(entity)}
        <T.Group
          position={entity.position}
          rotation={entity.rotation}
          scale={entity.scale ?? 1}
        >
          <EntityPrimitive {entity} />
        </T.Group>
      {:else if isSceneLightEntity(entity)}
        <T.Group
          position={entity.position}
          rotation={entity.rotation}
          scale={entity.scale ?? 1}
        >
          <EntityLight {entity} />
        </T.Group>
      {/if}
    {/each}
  </T.Group>
{/each}
