<script lang="ts">
  /**
   * @deprecated Prefer `MuseumEntities` — Phase 4.2 shared entity renderer.
   * Kept as a thin alias so stray imports keep model-parity rendering.
   */
  import type { RuntimeMuseumScene } from '$lib/content/scene';
  import type { EditorPlacementRegistry } from './placement-registry';
  import MuseumEntities from './MuseumEntities.svelte';

  let {
    scene,
    preloadParisHero = false,
    loadParisSalon = false,
    placementRegistry
  }: {
    scene: RuntimeMuseumScene;
    preloadParisHero?: boolean;
    loadParisSalon?: boolean;
    placementRegistry?: EditorPlacementRegistry;
  } = $props();
</script>

<MuseumEntities
  {scene}
  {preloadParisHero}
  {loadParisSalon}
  {placementRegistry}
/>
