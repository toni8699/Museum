<script lang="ts">
  import type { Snippet } from 'svelte';
  import { T } from '@threlte/core';
  import { interactivity } from '@threlte/extras';
  import { chopinRuntime, type MuseumRuntime } from '$lib/content/chopin-project';
  import type { LayoutDocument } from '$lib/layout/layout-types';
  import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';
  import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
  import type { ChopinRoomPresentation } from '$lib/content/chopin-room-presentation';
  import {
    assertNavigationGraphMatchesScene,
    createNavigationGraph,
    type NavigationGraph,
    type RuntimeMuseumScene
  } from '$lib/content/scene';
  import {
    createMuseumState,
    type MuseumStateStore
  } from '$lib/state/museum-state.svelte';
  import LayoutMuseumShell from './layout/LayoutMuseumShell.svelte';
  import GroundPlinth from './layout/GroundPlinth.svelte';
  import CentralChamber from './layout/CentralChamber.svelte';
  import NavigationNode from './navigation/NavigationNode.svelte';
  import CameraDirector from './navigation/CameraDirector.svelte';
  import { getParisAssetActivation } from './paris-activation';
  import MuseumEntities from './MuseumEntities.svelte';
  import EntranceRoom from './rooms/EntranceRoom.svelte';
  import PolandRoom from './rooms/PolandRoom.svelte';
  import DepartureRoom from './rooms/DepartureRoom.svelte';
  import ParisSalon from './rooms/ParisSalon.svelte';
  import WorkshopRoom from './rooms/WorkshopRoom.svelte';
  import MusicChamber from './rooms/MusicChamber.svelte';
  import LegacyRoom from './rooms/LegacyRoom.svelte';
  import RoomFrame from './RoomFrame.svelte';

  const EDITOR_PARIS_ACTIVATION = {
    preloadParisHero: true,
    loadParisSalon: true,
    routePassesParis: true
  } as const;

  let {
    runtime = chopinRuntime,
    scene = runtime.scene,
    rooms = runtime.rooms,
    layout = runtime.project.layout,
    geometry = runtime.geometry,
    presentation = runtime.presentation,
    state = createMuseumState(runtime.graph),
    camera,
    entityRenderer,
    showNavigationNodes = true,
    ambientIntensity = 0.2,
    directionalIntensity = 0.7,
    fogEnabled = true,
    fogNear = 22,
    fogFar = 54,
    forceParisAssets = false,
    showArchitecture = true
  }: {
    runtime?: MuseumRuntime;
    scene?: RuntimeMuseumScene;
    rooms?: LayoutRoomRegistry;
    layout?: LayoutDocument;
    geometry?: CompiledLayoutGeometry;
    presentation?: Readonly<Record<string, ChopinRoomPresentation>>;
    state?: MuseumStateStore;
    camera?: Snippet<[NavigationGraph, MuseumStateStore]>;
    entityRenderer?: Snippet<[
      RuntimeMuseumScene,
      LayoutRoomRegistry,
      ReturnType<typeof getParisAssetActivation>
    ]>;
    showNavigationNodes?: boolean;
    /** Defaults match visitor lighting. Editor may raise these. */
    ambientIntensity?: number;
    directionalIntensity?: number;
    fogEnabled?: boolean;
    fogNear?: number;
    fogFar?: number;
    /** Editor overview: load all Paris GLBs regardless of tour room. */
    forceParisAssets?: boolean;
    /** Editor layout mode can keep the shared camera while hiding scene geometry. */
    showArchitecture?: boolean;
  } = $props();

  const bespokeRoomIds = $derived(
    Object.entries(presentation).filter(([, value]) => value.shell === 'bespoke').map(([roomId]) => roomId)
  );

  const graph = $derived.by(() => {
    assertNavigationGraphMatchesScene(state.graph, scene);
    return createNavigationGraph(scene);
  });
  const parisActivation = $derived(
    forceParisAssets ? EDITOR_PARIS_ACTIVATION : getParisAssetActivation(state, graph)
  );

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

{#if showArchitecture}
  <GroundPlinth />
  <LayoutMuseumShell {geometry} {presentation} excludedRoomIds={bespokeRoomIds} />

  <RoomFrame room={rooms.getRequired('entrance')}><EntranceRoom /></RoomFrame>
  <RoomFrame room={rooms.getRequired('poland')}><PolandRoom /></RoomFrame>
  <RoomFrame room={rooms.getRequired('departure')}><DepartureRoom /></RoomFrame>
  <RoomFrame room={rooms.getRequired('paris')}>
    <ParisSalon preloadHero={parisActivation.preloadParisHero} />
  </RoomFrame>
  {#if entityRenderer}
    {@render entityRenderer(scene, rooms, parisActivation)}
  {:else}
    <MuseumEntities
      {scene}
      {rooms}
      preloadParisHero={parisActivation.preloadParisHero}
      loadParisSalon={parisActivation.loadParisSalon}
    />
  {/if}
  <RoomFrame room={rooms.getRequired('workshop')}><WorkshopRoom /></RoomFrame>
  <RoomFrame room={rooms.getRequired('music-chamber')}>
    <CentralChamber />
    <MusicChamber />
  </RoomFrame>
  <RoomFrame room={rooms.getRequired('legacy')}><LegacyRoom /></RoomFrame>

  {#if showNavigationNodes}
    {#each scene.navigationNodes as node (node.id)}
      <NavigationNode {node} {state} />
    {/each}
  {/if}
{/if}
