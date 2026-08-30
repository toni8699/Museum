<script lang="ts">
  import { T } from '@threlte/core';
  import RoomPortal from '../layout/RoomPortal.svelte';

  const portals = [
    ['Mazurka', 0, '#d6b35f'],
    ['Polonaise', Math.PI / 3, '#d18b56'],
    ['Nocturne', (Math.PI * 2) / 3, '#8ca7d8'],
    ['Étude', Math.PI, '#d8d8d8'],
    ['Prelude', (Math.PI * 4) / 3, '#9ed3bf'],
    ['Ballade', (Math.PI * 5) / 3, '#b68de2']
  ] as const;
</script>

<T.Group>
  {#each portals as portal}
    {@const angle = portal[1]}
    {@const color = portal[2]}
    <RoomPortal
      position={[Math.sin(angle) * 4.65, 0, Math.cos(angle) * 4.65]}
      rotation={[0, angle, 0]}
      width={1.6}
      height={3}
      {color}
    />
  {/each}
</T.Group>
