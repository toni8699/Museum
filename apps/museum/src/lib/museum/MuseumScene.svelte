<script lang="ts">
  import type { Snippet } from 'svelte';
  import { T } from '@threlte/core';
  import { interactivity } from '@threlte/extras';
  import { museumRooms } from '$lib/content/rooms';
  import {
    assertNavigationGraphMatchesScene,
    createNavigationGraph,
    museumScene,
    type NavigationGraph,
    type RuntimeMuseumScene
  } from '$lib/content/scene';
  import {
    museumState,
    type MuseumStateStore
  } from '$lib/state/museum-state.svelte';
  import MuseumShell from './layout/MuseumShell.svelte';
  import CentralChamber from './layout/CentralChamber.svelte';
  import StaffPath from './layout/StaffPath.svelte';
  import NavigationNode from './navigation/NavigationNode.svelte';
  import CameraDirector from './navigation/CameraDirector.svelte';
  import { getParisAssetActivation } from './paris-activation';
  import MuseumAssets from './MuseumAssets.svelte';
  import EntranceRoom from './rooms/EntranceRoom.svelte';
  import PolandRoom from './rooms/PolandRoom.svelte';
  import DepartureRoom from './rooms/DepartureRoom.svelte';
  import ParisSalon from './rooms/ParisSalon.svelte';
  import WorkshopRoom from './rooms/WorkshopRoom.svelte';
  import MusicChamber from './rooms/MusicChamber.svelte';
  import LegacyRoom from './rooms/LegacyRoom.svelte';

  let {
    scene = museumScene,
    state = museumState,
    camera,
    showNavigationNodes = true,
    ambientIntensity = 0.2,
    directionalIntensity = 0.7,
    fogEnabled = true,
    fogNear = 22,
    fogFar = 54
  }: {
    scene?: RuntimeMuseumScene;
    state?: MuseumStateStore;
    camera?: Snippet<[NavigationGraph, MuseumStateStore]>;
    showNavigationNodes?: boolean;
    /** Defaults match visitor lighting. Editor may raise these. */
    ambientIntensity?: number;
    directionalIntensity?: number;
    fogEnabled?: boolean;
    fogNear?: number;
    fogFar?: number;
  } = $props();

  const graph = $derived.by(() => {
    assertNavigationGraphMatchesScene(state.graph, scene);
    return createNavigationGraph(scene);
  });
  const parisActivation = $derived(getParisAssetActivation(state, graph));

  interactivity();
</script>

{#if camera}
  {@render camera(graph, state)}
{:else}
  <CameraDirector {graph} {state} />
{/if}

<T.Color attach="background" args={[0x050508]} />
{#if fogEnabled}
  <T.Fog attach="fog" args={[0x050508, fogNear, fogFar]} />
{/if}
<T.AmbientLight intensity={ambientIntensity} />
<T.DirectionalLight position={[2, 8, 5]} color="#c9d1df" intensity={directionalIntensity} />

<MuseumShell rooms={museumRooms} />
<StaffPath connections={scene.connections} />
<CentralChamber />

<EntranceRoom />
<PolandRoom />
<DepartureRoom />
<ParisSalon preloadHero={parisActivation.preloadParisHero} />
<MuseumAssets
  {scene}
  preloadParisHero={parisActivation.preloadParisHero}
  loadParisSalon={parisActivation.loadParisSalon}
/>
<WorkshopRoom />
<MusicChamber />
<LegacyRoom />

{#if showNavigationNodes}
  {#each scene.navigationNodes as node (node.id)}
    <NavigationNode {node} {state} />
  {/each}
{/if}
