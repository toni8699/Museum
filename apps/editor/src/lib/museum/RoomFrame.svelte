<script lang="ts">
  import type { Snippet } from 'svelte';
  import { T } from '@threlte/core';
  import type { LayoutRoomRegistryEntry } from '$lib/project/project-layout-semantics';

  let { room, children }: { room: LayoutRoomRegistryEntry; children: Snippet } = $props();
</script>

<T.Group name={`RoomFrame:${room.id}`} position={room.position} rotation={room.rotation}>
  {@render children()}
</T.Group>
