<script lang="ts">
  import { T } from '@threlte/core';
  import type { MuseumConnection, Vec3 } from '$lib/types/museum';

  let { connections }: { connections: MuseumConnection[] } = $props();

  const lineOffsets = [-0.32, -0.16, 0, 0.16, 0.32];
  const routeSegments = $derived(
    connections.flatMap((connection) =>
      connection.positionWaypoints.slice(0, -1).map((point, index) => {
        const next = connection.positionWaypoints[index + 1];
        const dx = next[0] - point[0];
        const dz = next[2] - point[2];
        const length = Math.hypot(dx, dz);

        return {
          id: `${connection.id}-${index}`,
          midpoint: [(point[0] + next[0]) / 2, 0.095, (point[2] + next[2]) / 2] as Vec3,
          length,
          angle: Math.atan2(dx, dz)
        };
      })
    )
  );
</script>

<T.Group>
  {#each routeSegments as segment (segment.id)}
    <T.Group position={segment.midpoint} rotation={[0, segment.angle, 0]}>
      {#each lineOffsets as offset}
        <T.Mesh position={[offset, 0, 0]}>
          <T.BoxGeometry args={[0.025, 0.025, segment.length]} />
          <T.MeshBasicMaterial color="#d6b35f" transparent opacity={0.58} />
        </T.Mesh>
      {/each}
    </T.Group>
  {/each}
</T.Group>
