<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { Vector3 } from 'three';
	import { editorCameraLabels, type CameraNodeLabelScreen } from './editor-camera-labels.svelte';
	import type { CameraNodeLabelKind } from './editor-camera-labels';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	// P1.7 — shell spec "Viewport MUST show": guided sequence numbering +
	// unsequenced distinction in Camera 3D. Runs inside the Canvas: each frame
	// it resolves every navigation node's world position through the store's
	// runtime scene (same source the camera-handle markers use) and publishes
	// CSS-pixel viewport coordinates to the shared module state the HTML
	// overlay reads. Never renders a mesh, never raycasts, never intercepts
	// pointer events.
	let {
		store,
		kinds
	}: {
		store: MuseumEditorStore;
		kinds: CameraNodeLabelKind[];
	} = $props();

	const { camera, canvas } = useThrelte();
	const worldPoint = new Vector3();
	const viewPoint = new Vector3();
	const ndcPoint = new Vector3();

	function sameScreen(a: CameraNodeLabelScreen, b: Omit<CameraNodeLabelScreen, 'nodeId'>) {
		return (
			a.x === b.x &&
			a.y === b.y &&
			a.occluded === b.occluded &&
			a.order === b.order &&
			a.unsequenced === b.unsequenced
		);
	}

	useTask(() => {
		const current = camera.current;
		if (!current || kinds.length === 0) {
			if (editorCameraLabels.labels.length !== 0) editorCameraLabels.labels = [];
			editorCameraLabels.ready = current !== undefined;
			return;
		}
		current.updateMatrixWorld();
		const width = Math.max(1, canvas.clientWidth);
		const height = Math.max(1, canvas.clientHeight);
		const next: CameraNodeLabelScreen[] = [];
		for (const kind of kinds) {
			const runtime = store.getRuntimeNavigationNode(kind.nodeId);
			if (!runtime) continue;
			worldPoint.set(...runtime.position).project(current);
			// Camera space: the camera looks down -Z, so a positive view-space Z
			// sits behind the camera — its NDC flip is meaningless, hide it.
			viewPoint.set(...runtime.position).applyMatrix4(current.matrixWorldInverse);
			ndcPoint.copy(viewPoint).applyMatrix4(current.projectionMatrix);
			const offscreen =
				ndcPoint.x < -1.15 || ndcPoint.x > 1.15 || ndcPoint.y < -1.15 || ndcPoint.y > 1.15;
			next.push({
				nodeId: kind.nodeId,
				x: (worldPoint.x * 0.5 + 0.5) * width,
				y: (-worldPoint.y * 0.5 + 0.5) * height,
				occluded: viewPoint.z > 0 || offscreen,
				order: kind.order,
				unsequenced: kind.unsequenced
			});
		}
		const previous = editorCameraLabels.labels;
		let changed = previous.length !== next.length;
		if (!changed) {
			for (let index = 0; index < next.length; index += 1) {
				if (!sameScreen(previous[index]!, next[index]!)) {
					changed = true;
					break;
				}
			}
		}
		if (changed) editorCameraLabels.labels = next;
		editorCameraLabels.ready = true;
	});
</script>
