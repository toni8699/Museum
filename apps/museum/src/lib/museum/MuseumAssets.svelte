<script lang="ts">
  import { T } from '@threlte/core';
  import { getRoom } from '$lib/content/rooms';
  import type {
    RuntimeMuseumScene,
    SceneObjectPlacement
  } from '$lib/content/scene';
  import type { MuseumRoomId } from '$lib/types/museum';
  import AssetModel from './assets/AssetModel.svelte';
  import { isSceneObjectEnabled } from './paris-activation';

  let {
    scene,
    preloadParisHero = false,
    loadParisSalon = false
  }: {
    scene: RuntimeMuseumScene;
    preloadParisHero?: boolean;
    loadParisSalon?: boolean;
  } = $props();

  const roomGroups = $derived.by(() => {
    const placementsByRoom = new Map<MuseumRoomId, SceneObjectPlacement[]>();

    for (const placement of scene.objects) {
      const placements = placementsByRoom.get(placement.roomId) ?? [];
      placements.push(placement);
      placementsByRoom.set(placement.roomId, placements);
    }

    return [...placementsByRoom].map(([roomId, placements]) => ({
      room: getRoom(roomId),
      placements
    }));
  });

</script>

{#each roomGroups as group (group.room.id)}
  <T.Group position={group.room.position} rotation={group.room.rotation}>
    {#each group.placements as placement (placement.id)}
      <AssetModel
        assetId={placement.assetId}
        position={placement.position}
        rotation={placement.rotation}
        scale={placement.scale ?? 1}
        fallback={placement.fallback}
        enabled={isSceneObjectEnabled(placement, { preloadParisHero, loadParisSalon })}
      />
    {/each}
  </T.Group>
{/each}
