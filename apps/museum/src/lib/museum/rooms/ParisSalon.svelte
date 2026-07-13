<script lang="ts">
  import { T } from '@threlte/core';
  import { Object3D, type SpotLight } from 'three';
  import { parisSalonAssets } from '$lib/content/paris-salon-layout';
  import { getNode, getRoom } from '$lib/content/rooms';
  import { museumState } from '$lib/state/museum-state.svelte';
  import AssetModel from '$lib/museum/assets/AssetModel.svelte';
  import { getCameraRoute } from '$lib/museum/navigation/camera-route';

  const room = getRoom('paris');
  const lightTarget = new Object3D();
  lightTarget.position.set(1.35, 0.8, -0.25);

  let keyLight = $state<SpotLight>();

  const routePassesParis = $derived.by(() => {
    const targetNodeId = museumState.targetNodeId;
    if (!targetNodeId) return false;

    return getCameraRoute(museumState.activeNodeId, targetNodeId).nodeIds.some(
      (nodeId) => getNode(nodeId).roomId === 'paris'
    );
  });
  const preloadHero = $derived(
    museumState.currentRoomId === 'departure' ||
      museumState.currentRoomId === 'paris' ||
      routePassesParis
  );
  const loadSalonAssets = $derived(museumState.currentRoomId === 'paris' || routePassesParis);

  $effect(() => {
    if (!keyLight) return;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.bias = -0.00035;
    keyLight.shadow.normalBias = 0.025;
  });
</script>

<T.Group position={room.position} rotation={room.rotation}>
  <T is={lightTarget} />
  <T.SpotLight
    bind:ref={keyLight}
    position={[0.8, 3.75, 1.6]}
    target={lightTarget}
    color="#ffd5a0"
    intensity={48}
    distance={12}
    angle={0.72}
    penumbra={0.78}
    decay={2}
    castShadow={preloadHero}
  />
  <T.PointLight position={[-2.6, 2.4, -2.8]} color="#d69d65" intensity={7} distance={5.5} />

  {#each parisSalonAssets as placement (placement.id)}
    <AssetModel
      assetId={placement.assetId}
      position={placement.position}
      rotation={placement.rotation}
      scale={placement.scale ?? 1}
      fallback={placement.fallback}
      enabled={placement.assetId === 'paris-grand-piano' ? preloadHero : loadSalonAssets}
    />
  {/each}
</T.Group>
