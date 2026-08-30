<script lang="ts">
  import { T } from '@threlte/core';
</script>

<T.Mesh name="MuseumGroundPlinth" position={[0, -0.08, 0]}>
  <T.CylinderGeometry args={[22, 22, 0.05, 96]} />
  <T.MeshStandardMaterial color="#0e0d11" roughness={0.92} />
</T.Mesh>
