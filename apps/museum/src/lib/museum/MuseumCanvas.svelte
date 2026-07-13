<script lang="ts">
  import { Canvas } from '@threlte/core';
  import MuseumScene from './MuseumScene.svelte';
</script>

<div class="canvas-shell" aria-label="Interactive 3D Chopin museum">
  <Canvas dpr={[1, 1.5]} shadows>
    <MuseumScene />
  </Canvas>
</div>

<style>
  .canvas-shell {
    position: absolute;
    inset: 0;
    background: #050508;
  }
</style>
