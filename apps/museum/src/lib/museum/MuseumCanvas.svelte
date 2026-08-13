<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { museumScene, type RuntimeMuseumScene } from '$lib/content/scene';
  import { chopinLayout } from '$lib/content/chopin-layout';
  import type { LayoutDocument } from '$lib/layout/layout-types';
  import {
    museumState,
    type MuseumStateStore
  } from '$lib/state/museum-state.svelte';
  import MuseumScene from './MuseumScene.svelte';

  const queryArchitectureSource = import.meta.env.DEV && typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('architecture') === 'layout'
    ? 'layout'
    : 'rooms.ts';

  let {
    scene = museumScene,
    state = museumState,
    architectureSource = queryArchitectureSource,
    layout: providedLayout
  }: {
    scene?: RuntimeMuseumScene;
    state?: MuseumStateStore;
    architectureSource?: 'rooms.ts' | 'layout';
    layout?: LayoutDocument;
  } = $props();

  const runtimeLayout = $derived<LayoutDocument | undefined>(
    architectureSource === 'layout' ? providedLayout ?? chopinLayout : undefined
  );
</script>

<div class="canvas-shell" aria-label="Interactive 3D Chopin museum">
  <Canvas dpr={[1, 1.5]} shadows>
    <MuseumScene {scene} {state} {architectureSource} layout={runtimeLayout} />
  </Canvas>
</div>

<style>
  .canvas-shell {
    position: absolute;
    inset: 0;
    background: #050508;
  }
</style>
