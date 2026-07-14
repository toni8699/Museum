<script lang="ts">
	import { Canvas } from '@threlte/core';
	import MuseumScene from '$lib/museum/MuseumScene.svelte';
	import type { EditorPlacementRegistry } from '$lib/museum/placement-registry';
	import EditorCameraRig from './EditorCameraRig.svelte';
	import EditorSelection from './EditorSelection.svelte';
	import EditorSelectionHelper from './EditorSelectionHelper.svelte';
	import EditorTransformControls from './EditorTransformControls.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

	let { store }: { store: MuseumEditorStore } = $props();

	const placementRegistry: EditorPlacementRegistry = {
		registerPlacementRoot: (id, root) => store.registerPlacementRoot(id, root),
		unregisterPlacementRoot: (id, root) => store.unregisterPlacementRoot(id, root),
		notifyPlacementRootChanged: (id) => store.notifyPlacementRootChanged(id)
	};

	let transformControls = $state<TransformControls>();
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
				<EditorCameraRig
					selectedRoomId={store.selectedRoomId}
					focusVersion={store.cameraFocusVersion}
					panEnabled={store.cameraPanEnabled}
				/>
			{/snippet}
		</MuseumScene>
		<EditorSelection {store} {transformControls} />
		<!-- Selection-bound Three helpers must be disposed and recreated for a new root. -->
		{#key store.selectedPlacementId}
			<EditorSelectionHelper {store} />
			<EditorTransformControls {store} bind:controls={transformControls} />
		{/key}
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
