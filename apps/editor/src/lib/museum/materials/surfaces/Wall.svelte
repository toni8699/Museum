<script lang="ts">
  import { T } from '@threlte/core';
  import type { MaterialId, Vec2 } from '$lib/types/materials';
  import type { RoomOpeningSide, Vec3 } from '$lib/types/scene';
  import MuseumMaterial from '../MuseumMaterial.svelte';

  let {
    side,
    length,
    height,
    position,
    thickness = 0.16,
    materialId = 'plaster-warm' as MaterialId,
    tint,
    textures = 'auto' as const
  }: {
    side: RoomOpeningSide;
    length: number;
    height: number;
    position: Vec3;
    thickness?: number;
    materialId?: MaterialId;
    tint?: string;
    textures?: 'auto' | 'off';
  } = $props();

  const alongX = $derived(side === 'neg-z' || side === 'pos-z');
  const surfaceSize: Vec2 = $derived([length, height]);

  /** Inward-facing plane sits on the room-facing side of the wall mass. */
  const face = $derived.by(() => {
    const [x, y, z] = position;
    const inset = thickness / 2;

    if (side === 'pos-z') {
      return { position: [x, y, z - inset] as Vec3, rotation: [0, Math.PI, 0] as Vec3 };
    }
    if (side === 'neg-z') {
      return { position: [x, y, z + inset] as Vec3, rotation: [0, 0, 0] as Vec3 };
    }
    if (side === 'pos-x') {
      return { position: [x - inset, y, z] as Vec3, rotation: [0, -Math.PI / 2, 0] as Vec3 };
    }
    return { position: [x + inset, y, z] as Vec3, rotation: [0, Math.PI / 2, 0] as Vec3 };
  });

  const depthSize: Vec3 = $derived(
    alongX ? [length, height, thickness] : [thickness, height, length]
  );
</script>

<T.Group>
  <T.Mesh position={face.position} rotation={face.rotation}>
    <T.PlaneGeometry args={[length, height]} />
    <MuseumMaterial {materialId} surfaceSize={surfaceSize} {tint} {textures} />
  </T.Mesh>

  <T.Mesh position={position}>
    <T.BoxGeometry args={depthSize} />
    <MuseumMaterial
      {materialId}
      surfaceSize={[thickness, height]}
      {tint}
      textures="off"
    />
  </T.Mesh>
</T.Group>
