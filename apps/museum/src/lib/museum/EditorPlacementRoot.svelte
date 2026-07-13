<script lang="ts">
  import { T } from '@threlte/core';
  import type { Group } from 'three';
  import type { Snippet } from 'svelte';
  import type { EditorPlacementRegistry } from './placement-registry';
  import type { Vec3 } from '$lib/types/museum';

  let {
    placementId,
    placementRegistry,
    position = [0, 0, 0] as Vec3,
    rotation = [0, 0, 0] as Vec3,
    scale = 1,
    visible = true,
    children
  }: {
    placementId: string;
    placementRegistry: EditorPlacementRegistry;
    position?: Vec3;
    rotation?: Vec3;
    scale?: number;
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
