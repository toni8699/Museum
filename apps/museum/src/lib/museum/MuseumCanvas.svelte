<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { museumScene, type RuntimeMuseumScene } from '$lib/content/scene';
  import {
    museumState,
    type MuseumStateStore
  } from '$lib/state/museum-state.svelte';
  import MuseumScene from './MuseumScene.svelte';

  let {
    scene = museumScene,
    state = museumState
  }: {
    scene?: RuntimeMuseumScene;
    state?: MuseumStateStore;
  } = $props();
</script>

<div class="canvas-shell" aria-label="Interactive 3D Chopin museum">
  <Canvas dpr={[1, 1.5]} shadows>
    <MuseumScene {scene} {state} />
  </Canvas>
</div>

<style>
  .canvas-shell {
    position: absolute;
    inset: 0;
    background: #050508;
  }
</style>
