<script lang="ts">
  import { T } from '@threlte/core';
  import type { MaterialId, Vec2 } from '$lib/types/materials';
  import type { Vec3 } from '$lib/types/museum';
  import MuseumMaterial from '../MuseumMaterial.svelte';

  let {
    width,
    depth,
    position = [0, 0, 0] as Vec3,
    materialId = 'wood-walnut' as MaterialId,
    tint,
    textures = 'auto' as const,
    receiveShadow = false
  }: {
    width: number;
    depth: number;
    position?: Vec3;
    materialId?: MaterialId;
    tint?: string;
    textures?: 'auto' | 'off';
    receiveShadow?: boolean;
  } = $props();

  const surfaceSize: Vec2 = $derived([width, depth]);
</script>

<T.Mesh {position} rotation={[-Math.PI / 2, 0, 0]} {receiveShadow}>
  <T.PlaneGeometry args={[width, depth]} />
  <MuseumMaterial {materialId} surfaceSize={surfaceSize} {tint} {textures} />
</T.Mesh>
