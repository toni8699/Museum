<script lang="ts">
  import { T } from '@threlte/core';
  import MuseumMaterial from '../materials/MuseumMaterial.svelte';
</script>

<T.Group>
  <T.Mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <T.CircleGeometry args={[5.5, 96]} />
    <MuseumMaterial materialId="wood-walnut" surfaceSize={[11, 11]} />
  </T.Mesh>
  <T.Mesh position={[0, 3.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
    <T.TorusGeometry args={[5.55, 0.08, 10, 96]} />
    <MuseumMaterial materialId="brass-aged" surfaceSize={[1.2, 0.3]} />
  </T.Mesh>
  <T.Mesh position={[0, 1.05, 0]}>
    <T.BoxGeometry args={[2.25, 0.62, 1.05]} />
    <T.MeshStandardMaterial color="#050505" roughness={0.48} metalness={0.15} />
  </T.Mesh>
  <T.Mesh position={[0.1, 1.42, -0.45]} rotation={[-0.32, 0, 0]}>
    <T.BoxGeometry args={[2.15, 0.1, 1.05]} />
    <T.MeshStandardMaterial color="#080808" roughness={0.42} metalness={0.18} />
  </T.Mesh>
  <T.Mesh position={[0, 0.92, 0.62]}>
    <T.BoxGeometry args={[1.8, 0.07, 0.22]} />
    <T.MeshStandardMaterial color="#f5ead0" roughness={0.6} />
  </T.Mesh>
  <T.PointLight position={[0, 2.7, 0]} color="#d6b35f" intensity={22} distance={8} />
</T.Group>
