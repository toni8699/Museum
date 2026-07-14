<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { TransformControls } from '@threlte/extras';
	import type { TransformControls as ThreeTransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import {
		groundPlacementToFloor,
		rotationSnapRadians,
		snapRoomLocalPosition
	} from './editor-placement';
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

	const { scene } = useThrelte();

	const selectedRoot = $derived.by(() => {
		const id = store.selectedPlacementId;
		return id ? store.getPlacementRoot(id) : undefined;
	});

	let activePlacementId: string | null = null;
	let shiftHeld = $state(false);

	const effectiveRotationSnap = $derived(
		store.rotationSnapEnabled && !shiftHeld
			? rotationSnapRadians(store.rotationSnapDegrees)
			: null
	);

	function syncDocumentFromRoot(id: string, root: NonNullable<typeof selectedRoot>) {
		if (store.transformMode === 'scale') {
			enforceUniformObjectScale(root, controls?.axis ?? null);
		}

		if (store.translationSnapEnabled && !shiftHeld) {
			snapRoomLocalPosition(root, store.translationSnap);
		}

		store.updatePlacementTransform(id, placementTransformFromObject(root));
	}

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
		syncDocumentFromRoot(id, root);
	}

	function finishTransform() {
		const id = activePlacementId;
		const root = selectedRoot;
		if (!id || !root) {
			activePlacementId = null;
			return;
		}

		syncDocumentFromRoot(id, root);

		// Ground after snap so Keep on Floor wins over Y quantization.
		if (store.keepOnFloor) {
			const result = groundPlacementToFloor(root, [scene]);
			if (!result.grounded) {
				store.setStatusMessage('No floor below selection');
			} else {
				store.updatePlacementTransform(id, placementTransformFromObject(root));
			}
		}

		activePlacementId = null;
		store.commitDocumentTransaction();
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Shift') shiftHeld = true;
	}

	function onKeyUp(event: KeyboardEvent) {
		if (event.key === 'Shift') shiftHeld = false;
	}

	$effect(() => {
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	});

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
		translationSnap={null}
		rotationSnap={effectiveRotationSnap}
		autoPauseControls
		onmouseDown={beginTransform}
		onobjectChange={previewTransform}
		onmouseUp={finishTransform}
	/>
{/if}
