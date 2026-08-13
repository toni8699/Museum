<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { chopinRuntime, type MuseumRuntime } from '$lib/content/chopin-project';
  import {
    createMuseumState,
    type MuseumStateStore
  } from '$lib/state/museum-state.svelte';
  import MuseumScene from './MuseumScene.svelte';

  let {
    runtime = chopinRuntime,
    state = createMuseumState(runtime.graph)
  }: {
    runtime?: MuseumRuntime;
    state?: MuseumStateStore;
  } = $props();
</script>

<div class="canvas-shell" aria-label="Interactive 3D Chopin museum">
  <Canvas dpr={[1, 1.5]} shadows>
    <MuseumScene {runtime} {state} />
  </Canvas>
</div>

<style>
  .canvas-shell {
    position: absolute;
    inset: 0;
    background: #050508;
  }
</style>
