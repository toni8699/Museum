<script lang="ts">
  import MuseumCanvas from '$lib/museum/MuseumCanvas.svelte';
  import MuseumHUD from '$lib/museum/ui/MuseumHUD.svelte';
  import { museumScene } from '$lib/content/scene';
  import { museumState } from '$lib/state/museum-state.svelte';

  const scene = museumScene;
  const state = museumState;
</script>

<svelte:head>
  <title>Chopin Museum — Paris Salon</title>
</svelte:head>

<main class="museum-page">
  <MuseumCanvas {scene} {state} />
  <MuseumHUD {scene} {state} />
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #050508;
  }

  .museum-page {
    position: fixed;
    inset: 0;
    overflow: hidden;
  }
</style>
