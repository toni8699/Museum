<script lang="ts">
  import { T } from '@threlte/core';
  import { getRoom } from '$lib/content/rooms';
  import type { Vec3 } from '$lib/types/museum';

  const room = getRoom('workshop');

  const floatingNotes = [
    [3.2, 1.1, 1.2],
    [4.2, 1.8, 0.1],
    [2.4, 2.4, -1.1]
  ] satisfies Vec3[];
</script>

<T.Group position={room.position} rotation={room.rotation}>
  <T.PointLight position={[-2, 2.8, 0]} color="#ffe0aa" intensity={13} distance={9} />
  <T.PointLight position={[3.4, 2.4, 0]} color="#b7d8ef" intensity={9} distance={8} />
  <T.Mesh position={[-2.7, 0.78, -1.4]}>
    <T.BoxGeometry args={[2.1, 0.2, 1.0]} />
    <T.MeshStandardMaterial color="#5c4028" roughness={0.78} />
  </T.Mesh>
  <T.Mesh position={[-2.7, 0.94, -1.4]} rotation={[-0.08, 0.08, 0]}>
    <T.BoxGeometry args={[1.5, 0.035, 0.82]} />
    <T.MeshStandardMaterial color="#efe2c6" roughness={0.92} />
  </T.Mesh>
  <T.Mesh position={[-4.7, 2.0, 0.8]}>
    <T.BoxGeometry args={[0.08, 2.2, 2.7]} />
    <T.MeshStandardMaterial color="#b7d8ef" transparent opacity={0.3} />
  </T.Mesh>
  {#each [-1.6, -0.8, 0, 0.8, 1.6] as y, i}
    <T.Mesh position={[2.8, 1.2 + y * 0.45, -0.4 + i * 0.35]} rotation={[0, 0.25, 0]}>
      <T.BoxGeometry args={[2.6, 0.035, 0.035]} />
      <T.MeshBasicMaterial color="#b7d8ef" transparent opacity={0.62} />
    </T.Mesh>
  {/each}
  {#each floatingNotes as note}
    <T.Mesh position={note}>
      <T.SphereGeometry args={[0.11, 16, 12]} />
      <T.MeshBasicMaterial color="#d6b35f" />
    </T.Mesh>
  {/each}
</T.Group>
