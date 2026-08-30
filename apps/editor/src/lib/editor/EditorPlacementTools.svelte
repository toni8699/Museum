<script lang="ts">
	import { untrack } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { GROUND_EPSILON, groundPlacementToFloor } from './editor-placement';
	import { placementTransformFromObject } from './editor-transform';
	import type { EditorStore } from './editor-store.svelte';

	let { store }: { store: EditorStore } = $props();
	const { scene } = useThrelte();
	let lastHandledDropRequestId = 0;

	function dropSelectionToFloor() {
		const ids = [...store.selectedPlacementIds];
		if (ids.length === 0) {
			store.setStatusMessage('Select one or more placements to drop to floor');
			return;
		}

		const roots = store.getPlacementRoots(ids);
		if (roots.length !== ids.length) {
			store.setStatusMessage('One or more placement roots are not ready');
			return;
		}

		if (!store.beginDocumentTransaction()) return;
		let changed = false;
		let groundedCount = 0;
		for (const [index, root] of roots.entries()) {
			const result = groundPlacementToFloor(root, [scene]);
			if (!result.grounded) continue;
			groundedCount += 1;
			if (Math.abs(result.deltaY) < GROUND_EPSILON) continue;
			changed =
				store.updatePlacementTransform(
					ids[index]!,
					placementTransformFromObject(root)
				) || changed;
		}

		if (groundedCount === 0) store.setStatusMessage('No floor below selection');
		if (changed) store.commitDocumentTransaction();
		else store.cancelDocumentTransaction();
	}

	$effect(() => {
		const requestId = store.dropToFloorRequestId;
		if (requestId === 0 || requestId === lastHandledDropRequestId) return;
		lastHandledDropRequestId = requestId;
		untrack(() => dropSelectionToFloor());
	});
</script>
