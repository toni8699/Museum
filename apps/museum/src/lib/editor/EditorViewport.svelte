<script lang="ts">
	import { Canvas } from '@threlte/core';
	import MuseumScene from '$lib/museum/MuseumScene.svelte';
	import type { EditorPlacementRegistry } from '$lib/museum/placement-registry';
	import EditorCameraRig from './EditorCameraRig.svelte';
	import EditorSelection from './EditorSelection.svelte';
	import EditorSelectionHelper from './EditorSelectionHelper.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const placementRegistry: EditorPlacementRegistry = {
		registerPlacementRoot: (id, root) => store.registerPlacementRoot(id, root),
		unregisterPlacementRoot: (id, root) => store.unregisterPlacementRoot(id, root),
		notifyPlacementRootChanged: (id) => store.notifyPlacementRootChanged(id)
	};
</script>

<div class="viewport" aria-label="Museum editor viewport">
	<Canvas dpr={[1, 1.5]} shadows>
		<MuseumScene
			scene={store.scene}
			state={store.state}
			showNavigationNodes={false}
			ambientIntensity={store.ambientIntensity}
			directionalIntensity={store.directionalIntensity}
			fogEnabled={store.fogEnabled}
			fogNear={store.fogNear}
			fogFar={store.fogFar}
			{placementRegistry}
			forceParisAssets
		>
			{#snippet camera(_graph, _state)}
				<EditorCameraRig />
			{/snippet}
		</MuseumScene>
		<EditorSelection {store} />
		<EditorSelectionHelper {store} />
	</Canvas>
</div>

<style>
	.viewport {
		width: 100%;
		height: 100%;
		min-height: 0;
		background: #050508;
	}

	.viewport :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
