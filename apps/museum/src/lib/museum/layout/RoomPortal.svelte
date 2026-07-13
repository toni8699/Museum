<script lang="ts">
  import { T } from '@threlte/core';
  import type { MaterialId } from '$lib/types/materials';
  import type { Vec3 } from '$lib/types/museum';
  import MuseumMaterial from '../materials/MuseumMaterial.svelte';

  let {
    position,
    rotation = [0, 0, 0] as Vec3,
    width = 2.6,
    height = 3.35,
    color = '#d6b35f',
    materialId = 'brass-aged' as MaterialId
  }: {
    position: Vec3;
    rotation?: Vec3;
    width?: number;
    height?: number;
    color?: string;
    materialId?: MaterialId;
  } = $props();

  const postThickness = 0.16;
  const postOffset = $derived(width / 2 + postThickness / 2);
  const lintelWidth = $derived(width + postThickness * 2);
</script>

<T.Group {position} {rotation}>
  <T.Mesh position={[-postOffset, height / 2, 0]}>
    <T.BoxGeometry args={[postThickness, height, 0.2]} />
    <MuseumMaterial
      {materialId}
      surfaceSize={[postThickness, height]}
      tint={color}
    />
  </T.Mesh>
  <T.Mesh position={[postOffset, height / 2, 0]}>
    <T.BoxGeometry args={[postThickness, height, 0.2]} />
    <MuseumMaterial
      {materialId}
      surfaceSize={[postThickness, height]}
      tint={color}
    />
  </T.Mesh>
  <T.Mesh position={[0, height, 0]}>
    <T.BoxGeometry args={[lintelWidth, postThickness, 0.2]} />
    <MuseumMaterial
      {materialId}
      surfaceSize={[lintelWidth, postThickness]}
      tint={color}
    />
  </T.Mesh>
  <T.Mesh position={[0, height - width * 0.18, 0]}>
    <T.TorusGeometry args={[width / 2, 0.045, 8, 32, Math.PI]} />
    <MuseumMaterial
      {materialId}
      surfaceSize={[width, 0.2]}
      tint={color}
    />
  </T.Mesh>
</T.Group>
