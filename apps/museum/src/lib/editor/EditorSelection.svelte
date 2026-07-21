<script lang="ts">
	import { onMount } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { useOrbitControls } from '@threlte/extras';
	import { roomLocalPoint } from '$lib/content/rooms';
	import type { Vec3 } from '$lib/types/museum';
	import { Plane, Raycaster, Vector2, Vector3, type Intersection } from 'three';
	import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import {
		createDraftConnectionPositionPath,
		EDITOR_CAMERA_PATH_MOVE_EPSILON,
		findNearestCurveProgress,
		getCameraPathInsertionIndex,
		getScenePathAnchorWorldPosition
	} from './editor-camera-path';
	import {
		findNavigationSelectionFromObject,
		resolveNormalSelection,
		selectionHitFromIntersection,
		uniquePlacementIdsInOrder,
		type EditorNavigationSelection
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
	const editorOrbitControls = useOrbitControls();
	const raycaster = new Raycaster();
	const pointerNdc = new Vector2();
	const dragPlane = new Plane();
	const dragPlaneNormal = new Vector3(0, 1, 0);
	const dragIntersection = new Vector3();
	const cameraForward = new Vector3();
	const sampledPathPoint = new Vector3();

	const DRAG_THRESHOLD_PX = 4;

	type NormalPointerSession = {
		kind: 'normal';
		pointerId: number;
		startX: number;
		startY: number;
		suppressClick: boolean;
		orbitWasEnabled: boolean | null;
	};

	type PathNavigationSelection =
		| { kind: 'connection'; connectionId: string }
		| { kind: 'anchor'; connectionId: string; anchorId: string };

	type PathHit = {
		hit: Intersection;
		selection: PathNavigationSelection;
	};

	type PathPointerSession = {
		kind: 'path';
		pointerId: number;
		startX: number;
		startY: number;
		connectionId: string;
		anchorId: string | null;
		initialProgress: number;
		initialWorld: Vec3;
		lastWorld: Vec3;
		dragging: boolean;
		originalNavigationSelection: EditorNavigationSelection;
		originalPlacementIds: string[];
		originalClusterId: string | null;
		orbitWasEnabled: boolean | null;
	};

	let pointerSession: NormalPointerSession | PathPointerSession | null = null;

	function releaseCapture(pointerId: number) {
		if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
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

	function raycast(event: PointerEvent) {
		const currentCamera = camera.current;
		if (!currentCamera) return [];
		toNdc(event);
		raycaster.setFromCamera(pointerNdc, currentCamera);
		return raycaster.intersectObjects(scene.children, true);
	}

	function isFloorPlacementActive() {
		return Boolean(
			store.pendingPlacementAssetId ||
				store.pendingNavigationCommand?.kind === 'place-connected-node'
		);
	}

	function restoreOrbit(active: { orbitWasEnabled: boolean | null }) {
		if (active.orbitWasEnabled === null || !editorOrbitControls.current) return;
		editorOrbitControls.current.enabled = active.orbitWasEnabled;
	}

	function restoreSelection(active: PathPointerSession) {
		store.navigationSelection = active.originalNavigationSelection;
		store.selectedPlacementIds = [...active.originalPlacementIds];
		store.selectedClusterId = active.originalClusterId;
	}

	function clearPointerSession() {
		const active = pointerSession;
		pointerSession = null;
		if (!active) return;
		releaseCapture(active.pointerId);
		restoreOrbit(active);
	}

	function cancelPathDrag() {
		const active = pointerSession;
		if (!active || active.kind !== 'path') return false;
		pointerSession = null;
		if (active.dragging) {
			store.setDirectPathInteractionActive(false);
			store.cancelDocumentTransaction();
		}
		restoreSelection(active);
		releaseCapture(active.pointerId);
		restoreOrbit(active);
		store.setNavigationHover(null);
		return true;
	}

	function activePathHit(event: PointerEvent): PathHit | null {
		if (
			event.altKey ||
			store.isDocumentMutationBlocked ||
			store.pendingPlacementAssetId ||
			store.pendingNavigationCommand
		) {
			return null;
		}
		const navigationHits = raycast(event).map((hit) => ({
			hit,
			selection: findNavigationSelectionFromObject(hit.object)
		}));
		if (navigationHits.some((result) => result.selection?.kind === 'node')) {
			return null;
		}
		if (
			navigationHits.some(
				(result) => result.selection?.kind === 'view-keyframe'
			)
		) {
			return null;
		}
		for (const result of navigationHits) {
			if (result.selection?.kind === 'anchor') {
				return { hit: result.hit, selection: result.selection };
			}
		}
		for (const result of navigationHits) {
			if (result.selection?.kind === 'connection') {
				return { hit: result.hit, selection: result.selection };
			}
		}
		return null;
	}

	function updateHover(event: PointerEvent) {
		if (pointerSession?.kind === 'path') return;
		const result = activePathHit(event);
		if (!result) {
			store.setNavigationHover(null);
			return;
		}
		store.setNavigationHover(
			result.selection.connectionId,
			result.selection.kind === 'anchor' ? result.selection.anchorId : null
		);
	}

	function beginPathPointer(event: PointerEvent, result: NonNullable<ReturnType<typeof activePathHit>>) {
		const selection = result.selection;
		let initialWorld: Vec3;
		let anchorId: string | null = null;
		let initialProgress = 0;
		if (selection.kind === 'anchor') {
			const anchor = store.document.connections
				.find((connection) => connection.id === selection.connectionId)
				?.positionPath.anchors.find((candidate) => candidate.id === selection.anchorId);
			if (!anchor) return false;
			anchorId = anchor.id;
			initialWorld = getScenePathAnchorWorldPosition(anchor);
		} else {
			const path = createDraftConnectionPositionPath(
				store.document,
				selection.connectionId
			);
			initialProgress = findNearestCurveProgress(path, result.hit.point);
			path.getPointAt(initialProgress, sampledPathPoint);
			initialWorld = sampledPathPoint.toArray() as Vec3;
		}

		const orbitWasEnabled = editorOrbitControls.current?.enabled ?? null;
		if (editorOrbitControls.current) editorOrbitControls.current.enabled = false;
		pointerSession = {
			kind: 'path',
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			connectionId: selection.connectionId,
			anchorId,
			initialProgress,
			initialWorld: [...initialWorld],
			lastWorld: [...initialWorld],
			dragging: false,
			originalNavigationSelection: store.navigationSelection,
			originalPlacementIds: [...store.selectedPlacementIds],
			originalClusterId: store.selectedClusterId,
			orbitWasEnabled
		};
		dragPlane.setFromNormalAndCoplanarPoint(
			dragPlaneNormal,
			new Vector3(...initialWorld)
		);
		canvas.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopImmediatePropagation();
		return true;
	}

	function beginDirectPathDrag(active: PathPointerSession) {
		if (!store.beginDocumentTransaction()) return false;
		if (!active.anchorId) {
			store.selectConnection(active.connectionId);
			store.convertConnectionDraft(active.connectionId);
			const smoothPath = createDraftConnectionPositionPath(
				store.document,
				active.connectionId
			);
			const insertionIndex = getCameraPathInsertionIndex(
				smoothPath,
				active.initialProgress
			);
			active.anchorId = store.insertConnectionAnchorAtWorldPoint(
				active.connectionId,
				insertionIndex,
				active.initialWorld
			);
			if (!active.anchorId) {
				store.cancelDocumentTransaction();
				restoreSelection(active);
				return false;
			}
		} else {
			store.selectAnchor(active.connectionId, active.anchorId);
		}
		active.dragging = true;
		store.setDirectPathInteractionActive(true);
		return true;
	}

	function dragPathToPointer(event: PointerEvent, active: PathPointerSession) {
		const currentCamera = camera.current;
		if (!currentCamera || !active.anchorId) return;
		toNdc(event);
		raycaster.setFromCamera(pointerNdc, currentCamera);
		if (!raycaster.ray.intersectPlane(dragPlane, dragIntersection)) return;
		const next: Vec3 = [dragIntersection.x, active.initialWorld[1], dragIntersection.z];
		active.lastWorld = next;
		store.updateConnectionAnchorWorldPoint(
			active.connectionId,
			active.anchorId,
			next
		);
	}

	function finishPathPointer(active: PathPointerSession) {
		pointerSession = null;
		if (!active.dragging) {
			if (active.anchorId) store.selectAnchor(active.connectionId, active.anchorId);
			else store.selectConnection(active.connectionId);
		} else {
			const moved = Math.hypot(
				active.lastWorld[0] - active.initialWorld[0],
				active.lastWorld[1] - active.initialWorld[1],
				active.lastWorld[2] - active.initialWorld[2]
			) > EDITOR_CAMERA_PATH_MOVE_EPSILON;
			store.setDirectPathInteractionActive(false);
			if (moved) {
				if (!store.commitDocumentTransaction()) restoreSelection(active);
			} else {
				store.cancelDocumentTransaction();
				restoreSelection(active);
			}
		}
		releaseCapture(active.pointerId);
		restoreOrbit(active);
	}

	function applySelectionFromPointer(event: PointerEvent) {
		if (store.isDocumentMutationBlocked) return;
		const currentCamera = camera.current;
		if (!currentCamera) return;

		const intersections = raycast(event);
		const pendingNavigation = store.pendingNavigationCommand;
		if (pendingNavigation?.kind === 'place-connected-node') {
			const floorHit = findPlaceableFloorIntersection(
				intersections,
				pendingNavigation.roomId
			);
			if (!floorHit) {
				store.setStatusMessage(`Click a placeable ${pendingNavigation.roomId} floor`);
				return;
			}
			currentCamera.getWorldDirection(cameraForward);
			store.createPendingNavigationNodeAt(
				floorHit.point.toArray() as Vec3,
				cameraForward.toArray() as Vec3
			);
			return;
		}

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
			return;
		}

		const result = resolveNormalSelection(hits);
		if (result.action === 'select-camera') {
			if (store.cameraSelection?.nodeId !== result.selection.nodeId) {
				store.selectNavigationNode(result.selection.nodeId);
			}
			store.selectCameraHandle(result.selection.handle);
		} else if (result.action === 'select-navigation') {
			if (result.selection.kind === 'connection') {
				store.selectConnection(result.selection.connectionId);
			} else if (result.selection.kind === 'anchor') {
				store.selectAnchor(result.selection.connectionId, result.selection.anchorId);
			} else if (result.selection.kind === 'view-keyframe') {
				store.selectViewKeyframe(
					result.selection.connectionId,
					result.selection.direction,
					result.selection.keyframeId
				);
			} else {
				store.selectNavigationNode(result.selection.nodeId);
				store.selectCameraHandle(result.selection.handle);
			}
		} else if (result.action === 'select') {
			if (event.shiftKey) {
				store.togglePlacement(result.id);
			} else {
				store.selectPlacement(result.id);
			}
		} else if (!event.shiftKey) {
			store.deselect();
		}
	}

	function onPointerDown(event: PointerEvent) {
		if (store.isDocumentMutationBlocked || event.button !== 0) return;
		if (transformControls?.axis || transformControls?.dragging) return;
		if (pointerSession) {
			if (pointerSession.kind === 'path') cancelPathDrag();
			else clearPointerSession();
			return;
		}

		const pathHit = activePathHit(event);
		if (pathHit && beginPathPointer(event, pathHit)) return;

		let orbitWasEnabled: boolean | null = null;
		if (isFloorPlacementActive()) {
			orbitWasEnabled = editorOrbitControls.current?.enabled ?? null;
			if (editorOrbitControls.current) editorOrbitControls.current.enabled = false;
			event.preventDefault();
			event.stopImmediatePropagation();
		}

		pointerSession = {
			kind: 'normal',
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			suppressClick: false,
			orbitWasEnabled
		};
		canvas.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		const active = pointerSession;
		if (!active || event.pointerId !== active.pointerId) {
			updateHover(event);
			return;
		}
		const dx = event.clientX - active.startX;
		const dy = event.clientY - active.startY;
		const crossedThreshold =
			dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
		if (active.kind === 'normal') {
			if (crossedThreshold) active.suppressClick = true;
			return;
		}

		event.preventDefault();
		event.stopImmediatePropagation();
		if (!active.dragging && crossedThreshold && !beginDirectPathDrag(active)) {
			cancelPathDrag();
			return;
		}
		if (active.dragging) dragPathToPointer(event, active);
	}

	function onPointerUp(event: PointerEvent) {
		if (event.button !== 0) return;
		const active = pointerSession;
		if (!active || event.pointerId !== active.pointerId) return;
		if (active.kind === 'path') {
			event.preventDefault();
			event.stopImmediatePropagation();
			finishPathPointer(active);
			return;
		}

		if (active.orbitWasEnabled !== null) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}

		const shouldSelect =
			!active.suppressClick &&
			!transformControls?.axis &&
			!transformControls?.dragging &&
			pointerEventInsideCanvas(event);
		clearPointerSession();
		if (shouldSelect) applySelectionFromPointer(event);
	}

	function onPointerCancel(event: PointerEvent) {
		if (pointerSession?.pointerId !== event.pointerId) return;
		if (pointerSession.kind === 'path') cancelPathDrag();
		else clearPointerSession();
	}

	function onLostPointerCapture(event: PointerEvent) {
		if (pointerSession?.pointerId !== event.pointerId) return;
		if (pointerSession.kind === 'path') cancelPathDrag();
		else {
			const active = pointerSession;
			pointerSession = null;
			restoreOrbit(active);
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !cancelPathDrag()) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	function onWindowBlur() {
		if (pointerSession?.kind === 'path') cancelPathDrag();
		else if (pointerSession?.kind === 'normal' && pointerSession.orbitWasEnabled !== null) {
			clearPointerSession();
		}
	}

	function onPointerLeave() {
		store.setNavigationHover(null);
	}

	onMount(() => {
		store.setDirectPathDragCanceler(cancelPathDrag);
		canvas.addEventListener('pointerdown', onPointerDown, true);
		canvas.addEventListener('pointermove', onPointerMove, true);
		canvas.addEventListener('pointerup', onPointerUp, true);
		canvas.addEventListener('pointercancel', onPointerCancel, true);
		canvas.addEventListener('lostpointercapture', onLostPointerCapture);
		canvas.addEventListener('pointerleave', onPointerLeave);
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('blur', onWindowBlur);

		return () => {
			if (pointerSession?.kind === 'path') cancelPathDrag();
			else clearPointerSession();
			store.setDirectPathDragCanceler(null);
			store.setNavigationHover(null);
			canvas.removeEventListener('pointerdown', onPointerDown, true);
			canvas.removeEventListener('pointermove', onPointerMove, true);
			canvas.removeEventListener('pointerup', onPointerUp, true);
			canvas.removeEventListener('pointercancel', onPointerCancel, true);
			canvas.removeEventListener('lostpointercapture', onLostPointerCapture);
			canvas.removeEventListener('pointerleave', onPointerLeave);
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('blur', onWindowBlur);
		};
	});
</script>
