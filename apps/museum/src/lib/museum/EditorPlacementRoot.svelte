<script lang="ts">
  import { T } from '@threlte/core';
  import type { Group } from 'three';
  import type { Snippet } from 'svelte';
  import type { EditorPlacementRegistry } from './placement-registry';
  import type { MuseumRoomId, Vec3 } from '$lib/types/museum';

  let {
    placementId,
    roomId,
    placementRegistry,
    position = [0, 0, 0] as Vec3,
    rotation = [0, 0, 0] as Vec3,
    // number = uniform; Vec3 = independent (session vector). Must not be the
    // visitor scalar average when a non-uniform vector is active.
    scale = 1 as number | Vec3,
    visible = true,
    children
  }: {
    placementId: string;
    roomId: MuseumRoomId;
    placementRegistry: EditorPlacementRegistry;
    position?: Vec3;
    rotation?: Vec3;
    scale?: number | Vec3;
    visible?: boolean;
    children: Snippet;
  } = $props();

  let root = $state<Group>();

  $effect(() => {
    const object = root;
    const registry = placementRegistry;
    const id = placementId;
    if (!object) return;

    object.userData.editorEntity = 'placement';
    object.userData.placementId = id;
    object.userData.roomId = roomId;
    registry.registerPlacementRoot(id, object);

    return () => {
      registry.unregisterPlacementRoot(id, object);
    };
  });
</script>

<!-- Avoid reactive userData prop objects — they remount/ref-churn under Threlte. -->
<T.Group bind:ref={root} {position} {rotation} {scale} {visible}>
  {@render children()}
</T.Group>
