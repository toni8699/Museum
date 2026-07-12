<script lang="ts">
  import { T } from '@threlte/core';
  import { getRoom } from '$lib/content/rooms';

  const room = getRoom('poland');
</script>

<T.Group position={room.position} rotation={room.rotation}>
  <T.PointLight position={[0, 2.8, 0]} color="#f0c578" intensity={14} distance={8} />
  <T.Mesh position={[-2.9, 1.25, -2.8]}>
    <T.BoxGeometry args={[2.1, 1.35, 0.12]} />
    <T.MeshStandardMaterial color="#d6bd8c" roughness={0.82} />
  </T.Mesh>
  <T.Mesh position={[-2.9, 1.27, -2.72]}>
    <T.BoxGeometry args={[1.55, 0.9, 0.06]} />
    <T.MeshStandardMaterial color="#5f3b22" roughness={0.9} />
  </T.Mesh>
  <T.Mesh position={[2.4, 0.68, -2.4]}>
    <T.BoxGeometry args={[1.65, 0.52, 0.8]} />
    <T.MeshStandardMaterial color="#18100c" roughness={0.55} />
  </T.Mesh>
  {#each [-2.8, -1.4, 0, 1.4, 2.8] as x, i}
    <T.Mesh position={[x, 0.07, 1.1]} rotation={[0, 0.15 * i, 0]}>
      <T.BoxGeometry args={[0.18, 0.04, 1.4]} />
      <T.MeshBasicMaterial color="#f0c578" transparent opacity={0.52} />
    </T.Mesh>
  {/each}
  <T.Mesh position={[3.9, 2.0, -0.3]}>
    <T.BoxGeometry args={[0.08, 2.2, 2.6]} />
    <T.MeshStandardMaterial color="#d6b35f" transparent opacity={0.22} />
  </T.Mesh>
</T.Group>
