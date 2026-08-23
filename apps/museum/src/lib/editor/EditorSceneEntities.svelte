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
    isScenePrimitiveEntity
  } from '$lib/content/scene';
  import type { RoomId } from '$lib/types/scene';
  import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
  import { resolveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
  import EditorPlacementRoot from '$lib/museum/EditorPlacementRoot.svelte';
  import type { EditorPlacementRegistry } from '$lib/museum/placement-registry';
  import AssetModel from '$lib/museum/assets/AssetModel.svelte';
  import EntityLight from '$lib/museum/entities/EntityLight.svelte';
  import EntityPrimitive from '$lib/museum/entities/EntityPrimitive.svelte';

  let {
    scene,
    rooms,
    placementRegistry,
    hiddenEntityIds = []
  }: {
    scene: RuntimeScene;
    rooms: LayoutRoomRegistry;
    placementRegistry: EditorPlacementRegistry;
    /** S10.1 — session-only per-entity visibility override (the editor only; relic stays undefined). */
    hiddenEntityIds?: readonly string[];
  } = $props();

  const hiddenSet = $derived(new Set(hiddenEntityIds));

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
      {@const scaleVersion = placementRegistry.scaleVersion ?? 0}
      {@const editorScale = scaleVersion >= 0
        ? placementRegistry.getPlacementScale?.(entity.id) ?? entity.scale ?? 1
        : entity.scale ?? 1}
      {#if !hiddenSet.has(entity.id)}
      <EditorPlacementRoot
        placementId={entity.id}
        roomId={entity.roomId}
        {placementRegistry}
        position={entity.position}
        rotation={entity.rotation}
        scale={editorScale}
      >
        {#if isSceneModelEntity(entity)}
          <AssetModel
            assetId={entity.assetId}
            fallback={entity.fallback}
            enabled
            localTransform
            effective={entity.materialInstanceId ? entityEffective(entity) : null}
          />
        {:else if isScenePrimitiveEntity(entity)}
          <EntityPrimitive {entity} effective={entityEffective(entity)} />
        {:else if isSceneLightEntity(entity)}
          <EntityLight {entity} showPickProxy />
        {/if}
      </EditorPlacementRoot>
      {/if}
    {/each}
  </T.Group>
{/each}
