<script lang="ts">
  import { T } from '@threlte/core';
  import { getRoom } from '$lib/content/rooms';

  const room = getRoom('departure');
</script>

<T.Group position={room.position} rotation={room.rotation}>
  <T.PointLight position={[0, 2.6, 4.6]} color="#9fb9d1" intensity={8} distance={9} />
  <T.PointLight position={[0, 2.4, -5.2]} color="#d6b35f" intensity={5} distance={10} />
  <T.Mesh position={[0, 0.06, 0]}>
    <T.BoxGeometry args={[1.1, 0.035, 12]} />
    <T.MeshBasicMaterial color="#9fb9d1" transparent opacity={0.28} />
  </T.Mesh>
  {#each [-4.8, -2.4, 0, 2.4, 4.8] as z, i}
    <T.Mesh position={[1.6, 1.5, z]} rotation={[0, 0.16, 0]}>
      <T.BoxGeometry args={[1.1, 0.7, 0.05]} />
      <T.MeshStandardMaterial color="#d7d2c4" transparent opacity={0.55 - i * 0.05} roughness={0.9} />
    </T.Mesh>
  {/each}
  <T.Mesh position={[-1.4, 0.48, 2.8]}>
    <T.BoxGeometry args={[1.3, 0.72, 0.8]} />
    <T.MeshStandardMaterial color="#4c2f20" roughness={0.85} />
  </T.Mesh>
  <T.Mesh position={[0, 1.6, 6.8]}>
    <T.BoxGeometry args={[2.6, 1.4, 0.08]} />
    <T.MeshStandardMaterial color="#f0c578" transparent opacity={0.18} />
  </T.Mesh>
</T.Group>
