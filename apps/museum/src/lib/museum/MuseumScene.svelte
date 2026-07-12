<script lang="ts">
  import { T } from '@threlte/core';
  import { interactivity } from '@threlte/extras';
  import { museumRooms, navigationConnections, navigationNodes } from '$lib/content/rooms';
  import MuseumShell from './layout/MuseumShell.svelte';
  import CentralChamber from './layout/CentralChamber.svelte';
  import StaffPath from './layout/StaffPath.svelte';
  import NavigationNode from './navigation/NavigationNode.svelte';
  import CameraDirector from './navigation/CameraDirector.svelte';
  import EntranceRoom from './rooms/EntranceRoom.svelte';
  import PolandRoom from './rooms/PolandRoom.svelte';
  import DepartureRoom from './rooms/DepartureRoom.svelte';
  import ParisSalon from './rooms/ParisSalon.svelte';
  import WorkshopRoom from './rooms/WorkshopRoom.svelte';
  import MusicChamber from './rooms/MusicChamber.svelte';
  import LegacyRoom from './rooms/LegacyRoom.svelte';

  interactivity();
</script>

<CameraDirector />

<T.Color attach="background" args={[0x050508]} />
<T.Fog attach="fog" args={[0x050508, 22, 54]} />
<T.AmbientLight intensity={0.2} />
<T.DirectionalLight position={[2, 8, 5]} color="#c9d1df" intensity={0.7} />

<MuseumShell rooms={museumRooms} />
<StaffPath connections={navigationConnections} />
<CentralChamber />

<EntranceRoom />
<PolandRoom />
<DepartureRoom />
<ParisSalon />
<WorkshopRoom />
<MusicChamber />
<LegacyRoom />

{#each navigationNodes as node (node.id)}
  <NavigationNode {node} />
{/each}
