<script lang="ts">
  import { T } from '@threlte/core';
  import type { MaterialId, Vec2 } from '$lib/types/materials';
  import type { MuseumRoomId, Vec3 } from '$lib/types/museum';
  import type { Mesh } from 'three';
  import MuseumMaterial from '../MuseumMaterial.svelte';

  let {
    width,
    depth,
    position = [0, 0, 0] as Vec3,
    materialId = 'wood-walnut' as MaterialId,
    tint,
    textures = 'auto' as const,
    receiveShadow = false,
    roomId
  }: {
    width: number;
    depth: number;
    position?: Vec3;
    materialId?: MaterialId;
    tint?: string;
    textures?: 'auto' | 'off';
    receiveShadow?: boolean;
    roomId?: MuseumRoomId;
  } = $props();

  const surfaceSize: Vec2 = $derived([width, depth]);
  let mesh = $state<Mesh>();

  // Stamp editor floor metadata outside reactive props — Threlte remounts on userData object churn.
  $effect(() => {
    const object = mesh;
    if (!object) return;
    object.userData.surfaceType = 'floor';
    object.userData.roomId = roomId;
    object.userData.editorSurface = { type: 'floor', placeable: true, roomId };
  });
</script>

<T.Mesh bind:ref={mesh} {position} rotation={[-Math.PI / 2, 0, 0]} {receiveShadow}>
  <T.PlaneGeometry args={[width, depth]} />
  <MuseumMaterial {materialId} surfaceSize={surfaceSize} {tint} {textures} />
</T.Mesh>
