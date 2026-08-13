<script lang="ts">
  import type { Snippet } from 'svelte';
  import { T } from '@threlte/core';
  import { interactivity } from '@threlte/extras';
  import { museumRooms } from '$lib/content/rooms';
  import type { LayoutDocument } from '$lib/layout/layout-types';
  import { validateLayoutDocument } from '$lib/layout/layout-codec';
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
  import LayoutMuseumShell from './layout/LayoutMuseumShell.svelte';
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
  import type { EditorPlacementRegistry } from './placement-registry';

  const EDITOR_PARIS_ACTIVATION = {
    preloadParisHero: true,
    loadParisSalon: true,
    routePassesParis: true
  } as const;

  let {
    scene = museumScene,
    state = museumState,
    camera,
    showNavigationNodes = true,
    ambientIntensity = 0.2,
    directionalIntensity = 0.7,
    fogEnabled = true,
    fogNear = 22,
    fogFar = 54,
    placementRegistry,
    forceParisAssets = false,
    showArchitecture = true,
    architectureSource = 'rooms.ts',
    layout
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
    /** Editor-only placement root registry; omitted on visitor `/museum`. */
    placementRegistry?: EditorPlacementRegistry;
    /** Editor overview: load all Paris GLBs regardless of tour room. */
    forceParisAssets?: boolean;
    /** Editor layout mode can keep the shared camera while hiding scene geometry. */
    showArchitecture?: boolean;
    architectureSource?: 'rooms.ts' | 'layout';
    layout?: LayoutDocument;
  } = $props();

  const layoutForRuntime = $derived.by(() => {
    if (architectureSource !== 'layout') return undefined;
    if (!layout) throw new Error("MuseumScene architectureSource='layout' requires a LayoutDocument");
    const validation = validateLayoutDocument(layout);
    if (!validation.success) {
      throw new Error(`Invalid layout architecture: ${validation.issues[0]!.path} — ${validation.issues[0]!.message}`);
    }
    return validation.document;
  });

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
  {#if architectureSource === 'layout'}
    <LayoutMuseumShell layout={layoutForRuntime!} />
  {:else}
    <MuseumShell rooms={museumRooms} />
  {/if}
  <CentralChamber />

  <EntranceRoom />
  <PolandRoom />
  <DepartureRoom />
  <ParisSalon preloadHero={parisActivation.preloadParisHero} />
  <MuseumEntities
    {scene}
    preloadParisHero={parisActivation.preloadParisHero}
    loadParisSalon={parisActivation.loadParisSalon}
    {placementRegistry}
  />
  <WorkshopRoom />
  <MusicChamber />
  <LegacyRoom />

  {#if showNavigationNodes}
    {#each scene.navigationNodes as node (node.id)}
      <NavigationNode {node} {state} />
    {/each}
  {/if}
{/if}
