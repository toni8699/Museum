<script lang="ts">
  import { T } from '@threlte/core';
</script>

  <T.PointLight position={[0, 2.8, 0]} color="#f6f0df" intensity={12} distance={9} />
  <T.PointLight position={[-3.2, 2.2, -2.4]} color="#d5b16b" intensity={6} distance={8} />
  {#each [-3.2, -1.6, 1.6, 3.2] as x, i}
    <T.Mesh position={[x, 1.2 + i * 0.18, -3.2]}>
      <T.BoxGeometry args={[1.0, 1.0, 0.08]} />
      <T.MeshStandardMaterial color="#f1efe7" transparent opacity={0.34 + i * 0.06} roughness={0.86} />
    </T.Mesh>
  {/each}
  {#each [[-2.2, 1.2], [0, 1.9], [2.2, 1.2]] as bench}
    <T.Group position={[bench[0], 0, bench[1]]}>
      <T.Mesh position={[0, 0.45, 0]}>
        <T.BoxGeometry args={[1.05, 0.16, 0.42]} />
        <T.MeshStandardMaterial color="#2a2622" roughness={0.76} />
      </T.Mesh>
      <T.Mesh position={[0, 0.2, 0]}>
        <T.BoxGeometry args={[0.08, 0.4, 0.08]} />
        <T.MeshStandardMaterial color="#2a2622" roughness={0.76} />
      </T.Mesh>
    </T.Group>
  {/each}
  <T.Mesh position={[-4.4, 2, -0.2]}>
    <T.BoxGeometry args={[0.08, 2.8, 3.2]} />
    <T.MeshStandardMaterial color="#d6b35f" transparent opacity={0.2} />
  </T.Mesh>
