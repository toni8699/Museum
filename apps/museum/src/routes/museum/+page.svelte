<script lang="ts">
  import MuseumCanvas from '$lib/museum/MuseumCanvas.svelte';
  import MuseumHUD from '$lib/museum/ui/MuseumHUD.svelte';
  import { chopinRuntime } from '$lib/content/chopin-project';
  import { createRuntimeState } from '$lib/state/runtime-state.svelte';

  const runtime = chopinRuntime;
  const state = createRuntimeState(runtime.graph);
</script>

<svelte:head>
  <title>Chopin Museum — Paris Salon</title>
</svelte:head>

<main class="museum-page">
  <MuseumCanvas {runtime} {state} />
  <MuseumHUD {runtime} {state} />
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
