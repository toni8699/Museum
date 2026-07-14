<script lang="ts">
	import { untrack } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import {
		GROUND_EPSILON,
		groundPlacementToFloor
	} from './editor-placement';
	import { placementTransformFromObject } from './editor-transform';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		transformControls
	}: {
		store: MuseumEditorStore;
		transformControls?: { dragging?: boolean } | undefined;
	} = $props();

	const { scene } = useThrelte();

	function isEditableTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
	}

	function dropSelectedToFloor() {
		const id = store.selectedPlacementId;
		if (!id) {
			store.setStatusMessage('Select a placement to drop to floor');
			return;
		}

		const root = store.getPlacementRoot(id);
		if (!root) {
			store.setStatusMessage('Placement root is not ready');
			return;
		}

		const result = groundPlacementToFloor(root, [scene]);
		if (!result.grounded) {
			store.setStatusMessage('No floor below selection');
			return;
		}

		if (Math.abs(result.deltaY) < GROUND_EPSILON) {
			return;
		}

		store.commitPlacementTransform(id, placementTransformFromObject(root));
	}

	$effect(() => {
		const requestId = store.dropToFloorRequestId;
		if (requestId === 0) return;
		untrack(() => dropSelectedToFloor());
	});

	$effect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (isEditableTarget(event.target)) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key.toLowerCase() !== 'g') return;
			if (transformControls?.dragging) return;
			if (!store.selectedPlacementId) return;

			event.preventDefault();
			store.requestDropToFloor();
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>
