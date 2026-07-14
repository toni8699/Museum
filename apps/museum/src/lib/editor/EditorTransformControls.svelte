<script lang="ts">
	import { onDestroy } from 'svelte';
	import { TransformControls } from '@threlte/extras';
	import type { TransformControls as ThreeTransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import {
		enforceUniformObjectScale,
		placementTransformFromObject
	} from './editor-transform';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		controls = $bindable()
	}: {
		store: MuseumEditorStore;
		controls?: ThreeTransformControls;
	} = $props();

	const selectedRoot = $derived.by(() => {
		const id = store.selectedPlacementId;
		return id ? store.getPlacementRoot(id) : undefined;
	});

	let activePlacementId: string | null = null;

	function beginTransform() {
		const id = store.selectedPlacementId;
		if (!id || !selectedRoot) return;
		if (!store.beginDocumentTransaction()) return;
		activePlacementId = id;
	}

	function previewTransform() {
		const id = activePlacementId;
		const root = selectedRoot;
		if (!id || !root) return;

		if (store.transformMode === 'scale') {
			enforceUniformObjectScale(root, controls?.axis ?? null);
		}
		store.updatePlacementTransform(id, placementTransformFromObject(root));
	}

	function finishTransform() {
		if (!activePlacementId) return;
		previewTransform();
		activePlacementId = null;
		store.commitDocumentTransaction();
	}

	onDestroy(() => {
		if (!activePlacementId) return;
		activePlacementId = null;
		store.cancelDocumentTransaction();
	});
</script>

{#if selectedRoot}
	<TransformControls
		bind:controls
		object={selectedRoot}
		mode={store.transformMode}
		space="world"
		autoPauseControls
		onmouseDown={beginTransform}
		onobjectChange={previewTransform}
		onmouseUp={finishTransform}
	/>
{/if}
