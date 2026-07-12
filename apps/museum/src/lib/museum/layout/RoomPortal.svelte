<script lang="ts">
  import { T } from '@threlte/core';
  import type { Vec3 } from '$lib/types/museum';

  let {
    position,
    rotation = [0, 0, 0] as Vec3,
    width = 2.6,
    height = 3.35,
    color = '#d6b35f'
  }: { position: Vec3; rotation?: Vec3; width?: number; height?: number; color?: string } = $props();

  const postThickness = 0.16;
  const postOffset = $derived(width / 2 + postThickness / 2);
</script>

<T.Group {position} {rotation}>
  <T.Mesh position={[-postOffset, height / 2, 0]}>
    <T.BoxGeometry args={[postThickness, height, 0.2]} />
    <T.MeshStandardMaterial {color} emissive={color} emissiveIntensity={0.15} roughness={0.7} />
  </T.Mesh>
  <T.Mesh position={[postOffset, height / 2, 0]}>
    <T.BoxGeometry args={[postThickness, height, 0.2]} />
    <T.MeshStandardMaterial {color} emissive={color} emissiveIntensity={0.15} roughness={0.7} />
  </T.Mesh>
  <T.Mesh position={[0, height, 0]}>
    <T.BoxGeometry args={[width + postThickness * 2, postThickness, 0.2]} />
    <T.MeshStandardMaterial {color} emissive={color} emissiveIntensity={0.15} roughness={0.7} />
  </T.Mesh>
  <T.Mesh position={[0, height - width * 0.18, 0]}>
    <T.TorusGeometry args={[width / 2, 0.045, 8, 32, Math.PI]} />
    <T.MeshStandardMaterial {color} emissive={color} emissiveIntensity={0.35} roughness={0.45} />
  </T.Mesh>
</T.Group>
