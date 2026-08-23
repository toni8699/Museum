<script lang="ts">
  /**
   * @deprecated Prefer `MuseumEntities` — Phase 4.2 shared entity renderer.
   * Kept as a thin alias so stray imports keep model-parity rendering.
   */
  import type { RuntimeScene } from '$lib/content/scene';
  import { chopinRuntime } from '$lib/content/chopin-project';
  import MuseumEntities from './MuseumEntities.svelte';

  let {
    scene,
    preloadParisHero = false,
    loadParisSalon = false
  }: {
    scene: RuntimeScene;
    preloadParisHero?: boolean;
    loadParisSalon?: boolean;
  } = $props();
</script>

<MuseumEntities
  {scene}
  rooms={chopinRuntime.rooms}
  {preloadParisHero}
  {loadParisSalon}
/>
