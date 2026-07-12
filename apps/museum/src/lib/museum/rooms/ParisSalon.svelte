<script lang="ts">
  import { T } from '@threlte/core';
  import { getRoom } from '$lib/content/rooms';

  const room = getRoom('paris');
</script>

<T.Group position={room.position} rotation={room.rotation}>
  <T.PointLight position={[0, 2.7, 0.4]} color="#d69d65" intensity={18} distance={8} />
  <T.Mesh position={[1.4, 0.86, 0]}>
    <T.BoxGeometry args={[2.2, 0.58, 1]} />
    <T.MeshStandardMaterial color="#060505" roughness={0.48} metalness={0.15} />
  </T.Mesh>
  <T.Mesh position={[1.55, 1.2, -0.45]} rotation={[-0.28, 0, 0]}>
    <T.BoxGeometry args={[2.05, 0.08, 1.05]} />
    <T.MeshStandardMaterial color="#090707" roughness={0.42} />
  </T.Mesh>
  {#each [[-2.3, 1.8], [-1.2, 2.5], [0.2, 2.6], [2.7, 1.8]] as chair}
    <T.Group position={[chair[0], 0, chair[1]]}>
      <T.Mesh position={[0, 0.48, 0]}>
        <T.BoxGeometry args={[0.62, 0.16, 0.62]} />
        <T.MeshStandardMaterial color="#6c2831" roughness={0.72} />
      </T.Mesh>
      <T.Mesh position={[0, 0.95, 0.28]}>
        <T.BoxGeometry args={[0.62, 0.8, 0.12]} />
        <T.MeshStandardMaterial color="#6c2831" roughness={0.72} />
      </T.Mesh>
    </T.Group>
  {/each}
  {#each [-4, -2.2, -0.4, 1.4] as x}
    <T.Mesh position={[x, 2.15, -4.4]}>
      <T.BoxGeometry args={[1.0, 1.25, 0.1]} />
      <T.MeshStandardMaterial color="#c79f72" roughness={0.76} />
    </T.Mesh>
  {/each}
  <T.Mesh position={[4.4, 2, 0]}>
    <T.BoxGeometry args={[0.08, 2.2, 2.2]} />
    <T.MeshStandardMaterial color="#d6b35f" transparent opacity={0.18} />
  </T.Mesh>
</T.Group>
