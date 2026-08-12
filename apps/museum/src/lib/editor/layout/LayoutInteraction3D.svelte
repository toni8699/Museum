<script lang="ts">
	import { onMount } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { useOrbitControls } from '@threlte/extras';
	import { Raycaster, Vector2, type Object3D } from 'three';
	import { findPlaceableFloorIntersection } from '../editor-placement';
	import {
		cancelLayoutPendingObject,
		selectLayoutObject,
		setLayoutDraftTool,
		updateLayoutPendingObject,
		type LayoutInteractionState
	} from './layout-interaction';
	import { commitLayoutObject, type LayoutPreviewState } from './layout-preview-state.svelte';

	let {
		preview,
		interaction
	}: {
		preview: LayoutPreviewState;
		interaction: LayoutInteractionState;
	} = $props();

	const { camera, scene, canvas } = useThrelte();
	const orbit = useOrbitControls();
	const raycaster = new Raycaster();
	const pointer = new Vector2();
	let activePointerId: number | null = null;
	let orbitWasEnabled: boolean | null = null;

	function intersections(event: { clientX: number; clientY: number }) {
		const currentCamera = camera.current;
		if (!currentCamera) return [];
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(pointer, currentCamera);
		return raycaster.intersectObjects(scene.children, true);
	}

	function layoutObjectId(object: Object3D): string | null {
		let current: Object3D | null = object;
		while (current) {
			if (current.userData?.editorEntity === 'layout-object') {
				return current.userData.layoutObjectId as string;
			}
			current = current.parent;
		}
		return null;
	}

	function updateGhost(event: PointerEvent) {
		const pending = interaction.pendingObject;
		if (!pending) return;
		const floorHit = findPlaceableFloorIntersection(intersections(event));
		if (!floorHit) {
			updateLayoutPendingObject(interaction, null, undefined, 'Choose a tagged layout floor');
			return;
		}
		updateLayoutPendingObject(
			interaction,
			[
				floorHit.intersection.point.x,
				floorHit.intersection.point.y + pending.dimensions[1] / 2,
				floorHit.intersection.point.z
			],
			floorHit.roomId
		);
	}

	function restoreOrbit() {
		if (orbitWasEnabled !== null && orbit.current) orbit.current.enabled = orbitWasEnabled;
		orbitWasEnabled = null;
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0 || interaction.tool !== 'object' || !interaction.pendingObject) return;
		activePointerId = event.pointerId;
		orbitWasEnabled = orbit.current?.enabled ?? null;
		if (orbit.current) orbit.current.enabled = false;
		canvas.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	function onPointerMove(event: PointerEvent) {
		if (interaction.tool === 'object' && interaction.pendingObject) updateGhost(event);
	}

	function onPointerUp(event: PointerEvent) {
		if (activePointerId === event.pointerId) {
			activePointerId = null;
			updateGhost(event);
			const pending = interaction.pendingObject;
			if (!pending?.valid || !pending.position || !pending.roomId) {
				preview.statusMessage = pending?.message ?? 'Choose a tagged layout floor';
				cancelLayoutPendingObject(interaction);
			} else {
				const result = commitLayoutObject(preview, pending.kind, pending.position, pending.roomId);
				if (result.success) {
					selectLayoutObject(interaction, result.objectId);
					setLayoutDraftTool(interaction, 'select');
					preview.statusMessage = `Created ${pending.kind} object`;
				} else {
					preview.statusMessage = result.message;
					cancelLayoutPendingObject(interaction);
				}
			}
			if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
			restoreOrbit();
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}

		if (event.button !== 0 || interaction.tool !== 'select') return;
		for (const hit of intersections(event)) {
			const objectId = layoutObjectId(hit.object);
			if (!objectId) continue;
			selectLayoutObject(interaction, objectId);
			return;
		}
	}

	function onPointerCancel(event: PointerEvent) {
		if (activePointerId !== event.pointerId) return;
		activePointerId = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		restoreOrbit();
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !interaction.pendingObject) return;
		cancelLayoutPendingObject(interaction);
		if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
			canvas.releasePointerCapture(activePointerId);
		}
		activePointerId = null;
		restoreOrbit();
	}

	onMount(() => {
		canvas.addEventListener('pointerdown', onPointerDown, true);
		canvas.addEventListener('pointermove', onPointerMove, true);
		canvas.addEventListener('pointerup', onPointerUp, true);
		canvas.addEventListener('pointercancel', onPointerCancel, true);
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			canvas.removeEventListener('pointerdown', onPointerDown, true);
			canvas.removeEventListener('pointermove', onPointerMove, true);
			canvas.removeEventListener('pointerup', onPointerUp, true);
			canvas.removeEventListener('pointercancel', onPointerCancel, true);
			window.removeEventListener('keydown', onKeyDown, true);
			restoreOrbit();
		};
	});
</script>
