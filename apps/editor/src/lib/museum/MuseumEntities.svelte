<script lang="ts">
  import { T } from '@threlte/core';
  import type {
    SceneDocument,
    RuntimeScene,
    SceneEntity,
    SceneModelEntity,
    ScenePrimitiveEntity
  } from '$lib/content/scene';
  import {
    isSceneLightEntity,
    isSceneModelEntity,
    isScenePrimitiveEntity,
    modelEntityToPlacement
  } from '$lib/content/scene';
  import { resolveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
  import type { RoomId } from '$lib/types/scene';
  import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
  import AssetModel from './assets/AssetModel.svelte';
  import EntityLight from './entities/EntityLight.svelte';
  import EntityPrimitive from './entities/EntityPrimitive.svelte';
  import { isSceneObjectEnabled } from './paris-activation';

  let {
    scene,
    rooms,
    preloadParisHero = false,
    loadParisSalon = false
  }: {
    scene: RuntimeScene;
    rooms: LayoutRoomRegistry;
    preloadParisHero?: boolean;
    loadParisSalon?: boolean;
  } = $props();

  const roomGroups = $derived.by(() => {
    const entitiesByRoom = new Map<RoomId, SceneEntity[]>();
    for (const entity of scene.entities) {
      const entities = entitiesByRoom.get(entity.roomId) ?? [];
      entities.push(entity);
      entitiesByRoom.set(entity.roomId, entities);
    }
    return [...entitiesByRoom].map(([roomId, entities]) => ({
      room: rooms.getRequired(roomId),
      entities
    }));
  });

  function entityEffective(
    entity: ScenePrimitiveEntity | SceneModelEntity
  ): ReturnType<typeof resolveSceneMaterial> {
    return resolveSceneMaterial(
      { materials: scene.materials, textures: scene.textures } as Pick<
        SceneDocument,
        'materials' | 'textures'
      >,
      {
        materialInstanceId: entity.materialInstanceId ?? null,
        fallbackCatalogueId: entity.kind === 'primitive' ? entity.materialId : 'paper-aged'
      }
    );
  }
</script>

{#each roomGroups as group (group.room.id)}
  <T.Group position={group.room.position} rotation={group.room.rotation}>
    {#each group.entities as entity (entity.id)}
      {#if isSceneModelEntity(entity)}
        {@const placement = modelEntityToPlacement(entity)}
        {@const enabled = isSceneObjectEnabled(placement, { preloadParisHero, loadParisSalon })}
        <AssetModel
          assetId={entity.assetId}
          position={entity.position}
          rotation={entity.rotation}
          scale={entity.scale ?? 1}
          fallback={entity.fallback}
          {enabled}
          effective={entity.materialInstanceId ? entityEffective(entity) : null}
        />
      {:else if isScenePrimitiveEntity(entity)}
        <T.Group position={entity.position} rotation={entity.rotation} scale={entity.scale ?? 1}>
          <EntityPrimitive {entity} effective={entityEffective(entity)} />
        </T.Group>
      {:else if isSceneLightEntity(entity)}
        <T.Group position={entity.position} rotation={entity.rotation} scale={entity.scale ?? 1}>
          <EntityLight {entity} />
        </T.Group>
      {/if}
    {/each}
  </T.Group>
{/each}
