<script lang="ts">
	import { onMount } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { roomLocalPoint } from '$lib/content/rooms';
	import type { Vec3 } from '$lib/types/museum';
	import { Raycaster, Vector2 } from 'three';
	import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import {
		resolveNormalSelection,
		selectionHitFromIntersection,
		uniquePlacementIdsInOrder
	} from './editor-selection';
	import { findPlaceableFloorIntersection } from './editor-placement';

	let {
		store,
		transformControls
	}: {
		store: MuseumEditorStore;
		transformControls?: TransformControls;
	} = $props();

	const { camera, scene, canvas } = useThrelte();
	const raycaster = new Raycaster();
	const pointerNdc = new Vector2();

	const DRAG_THRESHOLD_PX = 4;

	let activePointerId: number | null = null;
	let pointerDownX = 0;
	let pointerDownY = 0;
	let activePointerCount = 0;
	let suppressClick = false;

	function releaseCapture(pointerId: number) {
		if (canvas.hasPointerCapture(pointerId)) {
			canvas.releasePointerCapture(pointerId);
		}
	}

	function clearPendingPointer() {
		if (activePointerId !== null) {
			releaseCapture(activePointerId);
		}
		activePointerId = null;
		suppressClick = false;
	}

	function pointerEventInsideCanvas(event: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		return (
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom
		);
	}

	function toNdc(event: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	}

	function applySelectionFromPointer(event: PointerEvent) {
		if (store.cameraPreview) return;
		const currentCamera = camera.current;
		if (!currentCamera) return;

		toNdc(event);
		raycaster.setFromCamera(pointerNdc, currentCamera);
		const intersections = raycaster.intersectObjects(scene.children, true);

		if (store.pendingPlacementAssetId) {
			const floorHit = findPlaceableFloorIntersection(intersections, 'paris');
			if (!floorHit) {
				store.setStatusMessage('Click a placeable Paris floor');
				return;
			}
			const worldPoint = floorHit.point.toArray() as Vec3;
			store.createPendingPlacementAt(roomLocalPoint('paris', worldPoint));
			return;
		}

		const hits = intersections.map(selectionHitFromIntersection);

		if (event.altKey) {
			store.cyclePlacement(uniquePlacementIdsInOrder(hits));
			if (store.selectedPlacementId) store.focusPlacement(store.selectedPlacementId);
			return;
		}

		const result = resolveNormalSelection(hits);
		if (result.action === 'select-camera') {
			if (store.cameraSelection?.nodeId !== result.selection.nodeId) {
				store.selectNavigationNode(result.selection.nodeId);
			}
			store.selectCameraHandle(result.selection.handle);
		} else if (result.action === 'select') {
			if (event.shiftKey) {
				store.togglePlacement(result.id);
			} else {
				store.selectPlacement(result.id);
				store.focusPlacement(result.id);
			}
		} else {
			if (!event.shiftKey) store.deselect();
		}
	}

	function onPointerDown(event: PointerEvent) {
		if (store.cameraPreview || event.button !== 0) return;
		if (transformControls?.axis || transformControls?.dragging) {
			suppressClick = true;
			return;
		}

		activePointerCount += 1;
		if (activePointerCount > 1) {
			suppressClick = true;
			if (activePointerId !== null) {
				releaseCapture(activePointerId);
				activePointerId = null;
			}
			return;
		}

		activePointerId = event.pointerId;
		pointerDownX = event.clientX;
		pointerDownY = event.clientY;
		suppressClick = false;
		canvas.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (activePointerId === null || event.pointerId !== activePointerId) return;
		const dx = event.clientX - pointerDownX;
		const dy = event.clientY - pointerDownY;
		if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
			suppressClick = true;
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (event.button !== 0) return;

		const wasActive = activePointerId === event.pointerId;
		const shouldSelect =
			wasActive &&
			!suppressClick &&
			!transformControls?.axis &&
			!transformControls?.dragging &&
			pointerEventInsideCanvas(event);

		activePointerCount = Math.max(0, activePointerCount - 1);

		if (event.pointerId === activePointerId) {
			clearPendingPointer();
		}

		if (shouldSelect) {
			applySelectionFromPointer(event);
		}
	}

	function onPointerCancel(event: PointerEvent) {
		activePointerCount = Math.max(0, activePointerCount - 1);
		if (event.pointerId === activePointerId) {
			clearPendingPointer();
		}
	}

	onMount(() => {
		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerCancel);

		return () => {
			clearPendingPointer();
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', onPointerCancel);
		};
	});
</script>
