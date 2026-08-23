<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { chopinRuntime, type Runtime } from '$lib/content/chopin-project';
  import {
    createRuntimeState,
    type RuntimeStateStore
  } from '$lib/state/runtime-state.svelte';
  import MuseumScene from './MuseumScene.svelte';

  let {
    runtime = chopinRuntime,
    state = createRuntimeState(runtime.graph)
  }: {
    runtime?: Runtime;
    state?: RuntimeStateStore;
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
