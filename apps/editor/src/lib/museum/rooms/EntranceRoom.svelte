<script lang="ts">
  import { T } from '@threlte/core';
</script>

  <T.PointLight position={[0, 2.7, -1.8]} color="#8c79b8" intensity={10} distance={8} />
  <T.Mesh position={[0, 2, -3.2]}>
    <T.BoxGeometry args={[3.8, 3.2, 0.06]} />
    <T.MeshStandardMaterial color="#6e5fa0" transparent opacity={0.32} roughness={0.96} />
  </T.Mesh>
  <T.Mesh position={[0, 1.0, -3.6]}>
    <T.BoxGeometry args={[2.1, 0.58, 0.95]} />
    <T.MeshStandardMaterial color="#050505" roughness={0.5} metalness={0.12} />
  </T.Mesh>
  <T.Mesh position={[0.2, 1.42, -3.95]} rotation={[-0.24, 0, 0]}>
    <T.BoxGeometry args={[2.0, 0.08, 1.0]} />
    <T.MeshStandardMaterial color="#070707" roughness={0.42} />
  </T.Mesh>
  {#each [-0.55, -0.28, 0, 0.28, 0.55] as x}
    <T.Mesh position={[x, 0.08, 0.9]}>
      <T.BoxGeometry args={[0.035, 0.035, 5.4]} />
      <T.MeshBasicMaterial color="#d6b35f" transparent opacity={0.5} />
    </T.Mesh>
  {/each}
  {#each [-2.2, 2.2] as x}
    <T.Mesh position={[x, 2.05, 0.2]}>
      <T.BoxGeometry args={[0.08, 2.4, 0.8]} />
      <T.MeshStandardMaterial color="#cbb28f" transparent opacity={0.3} />
    </T.Mesh>
  {/each}
