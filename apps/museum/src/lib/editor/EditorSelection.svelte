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
		createEditorCameraFramingBasis,
		clampEditorCameraFrustumDepth,
		EDITOR_CAMERA_FRAMING_FOV_EPSILON,
		EDITOR_CAMERA_FRAMING_MOVE_EPSILON,
		verticalFovFromEditorCameraFrustumPoint
	} from './editor-camera-framing';
	import {
		findCameraFovHandleFromObject,
		findCameraSelectionFromObject,
		findCameraViewKeyframeHandleFromObject,
		findNavigationSelectionFromObject,
		findPlacementIdFromObject,
		findPriorityCameraViewKeyframeHandle,
		resolveNormalSelection,
		resolveNormalSelectionWithHit,
		selectionHitFromIntersection,
		uniquePlacementIdsInOrder,
		type EditorNavigationSelection
	} from './editor-selection';
	import {
		layoutCandidatesFromIntersections,
		type Layout3dHitCandidate
	} from './layout/layout-3d-picking';
	import {
		firstRenderablePlacementId,
		TEXTURE_DRAG_MIME
	} from './editor-textures';
	import {
		getSceneCameraViewKeyframeWorldPosition,
		getSceneCameraViewKeyframeWorldTarget
	} from './editor-camera-view';
	import { findPlaceableFloorIntersection } from './editor-placement';
	import { getContext } from 'svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';

	let {
		store,
		transformControls,
		onDeselect,
		onLayoutPick,
		onLayoutHover
	}: {
		store: MuseumEditorStore;
		transformControls?: TransformControls;
		/** deselect the *active* domain (default: scene-owned deselect, so the frozen relic is untouched). */
		onDeselect?: () => void;
		/**
		 * optional layout-pick branch. Absent on the relic mount (frozen
		 * behavior). When present, the click flow resolves the normal result
		 * once, then offers the candidates + the actionable scene/camera source
		 * distance (or null) to this callback; a `true` return commits a layout
		 * selection, otherwise the already-resolved normal result applies.
		 */
		onLayoutPick?: (
			candidates: readonly Layout3dHitCandidate[],
			competingSceneDistance: number | null
		) => boolean;
		/**
		 * follow-up — optional layout-hover branch. Same candidate
		 * extraction + cross-domain arbitration as `onLayoutPick`, but fires on
		 * pointer move (before a click) and writes nothing: the shell tints the
		 * surface under the cursor. Passed empty candidates to clear.
		 */
		onLayoutHover?: (
			candidates: readonly Layout3dHitCandidate[],
			competingSceneDistance: number | null
		) => void;
	} = $props();

	const { camera, scene, canvas } = useThrelte();
	const editorOrbitControls = useOrbitControls();
	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);
	const raycaster = new Raycaster();
	const pointerNdc = new Vector2();
	const dragPlane = new Plane();
	const dragPlaneNormal = new Vector3(0, 1, 0);
	const dragIntersection = new Vector3();
	const viewDragPlane = new Plane();
	const viewDragPlaneNormal = new Vector3();
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

	type ViewKeyframePointerSession = {
		kind: 'view-keyframe';
		pointerId: number;
		startX: number;
		startY: number;
		dragging: boolean;
		orbitWasEnabled: boolean | null;
	};

	type FramingOwner =
		| { owner: 'node'; nodeId: string }
		| {
				owner: 'view-keyframe';
				connectionId: string;
				direction: 'forward' | 'reverse';
				keyframeId: string;
		  };

	type FramingPointerSession = {
		kind: 'framing';
		interaction: 'target' | 'fov';
		owner: FramingOwner;
		pointerId: number;
		startX: number;
		startY: number;
		dragging: boolean;
		pending: boolean;
		initialTarget: Vec3;
		initialFov: number;
		lastTarget: Vec3;
		lastFov: number;
		orbitWasEnabled: boolean | null;
	};

	let pointerSession:
		| NormalPointerSession
		| PathPointerSession
		| ViewKeyframePointerSession
		| FramingPointerSession
		| null = null;
	let externalKeyDragOrbitWasEnabled: boolean | null = null;

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

	/** Phase 5.2 — accepts PointerEvent and DragEvent alike. */
	type PointerLike = { clientX: number; clientY: number };

	function toNdc(event: PointerLike) {
		const rect = canvas.getBoundingClientRect();
		pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	}

	function raycast(event: PointerLike) {
		const currentCamera = camera.current;
		if (!currentCamera) return [];
		toNdc(event);
		raycaster.setFromCamera(pointerNdc, currentCamera);
		return raycaster.intersectObjects(scene.children, true);
	}

	function isFloorPlacementActive() {
		return Boolean(
			store.pendingPlacementAssetId ||
				store.pendingPlacementPrimitiveKind ||
			store.pendingPlacementLightKind ||
				store.pendingNavigationCommand?.kind === 'place-camera'
		);
	}

	function restoreOrbit(active: { orbitWasEnabled: boolean | null }) {
		if (active.orbitWasEnabled === null || !editorOrbitControls.current) return;
		editorOrbitControls.current.enabled = active.orbitWasEnabled;
	}

	function restoreSelection(active: PathPointerSession) {
		// P7.1 — the three legacy bridging writes collapsed into the
		// guard-free session-restore adapter.
		store.selectionActions.restoreSelectionSnapshot({
			navigation: active.originalNavigationSelection,
			placementIds: [...active.originalPlacementIds],
			clusterId: active.originalClusterId
		});
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

	function cancelViewKeyframeDrag() {
		const active = pointerSession;
		if (!active || active.kind !== 'view-keyframe') return false;
		pointerSession = null;
		store.cancelViewKeyframeProgressDrag();
		releaseCapture(active.pointerId);
		restoreOrbit(active);
		store.setNavigationHover(null);
		return true;
	}

	function restorePendingFraming(active: FramingPointerSession) {
		if (!active.pending || active.owner.owner !== 'node') return;
		const node = store.selectedNavigationNode;
		if (!node || node.id !== active.owner.nodeId) return;
		if (active.interaction === 'target') {
			store.updateNavigationNodePoint(
				node.id,
				'target',
				store.rooms.localPoint(node.roomId, active.initialTarget)
			);
		} else {
			store.updateSelectedNodeFov(active.initialFov);
		}
	}

	function cancelFramingDrag() {
		const active = pointerSession;
		if (!active || active.kind !== 'framing') return false;
		pointerSession = null;
		if (active.dragging) {
			if (active.pending) restorePendingFraming(active);
			else store.cancelDocumentTransaction();
			store.setDirectFramingInteractionActive(false);
		}
		releaseCapture(active.pointerId);
		restoreOrbit(active);
		return true;
	}

	function cancelDirectDrag() {
		return cancelFramingDrag() || cancelViewKeyframeDrag() || cancelPathDrag();
	}

	function activeFramingHandleHit(event: PointerEvent) {
		if (
			event.altKey ||
			store.currentWorkspace !== 'camera' ||
			store.isCameraFramingMutationBlocked ||
			store.isEditorInteractionActive ||
			store.pendingPlacementAssetId ||
			store.pendingPlacementPrimitiveKind ||
			store.pendingPlacementLightKind ||
			(store.pendingNavigationCommand &&
				store.pendingNavigationCommand.kind !== 'connect-pending-node')
		) {
			return null;
		}
		const objects = raycast(event).map((hit) => hit.object);
		for (const object of objects) {
			const camera = findCameraSelectionFromObject(object);
			if (camera?.handle === 'target') {
				return {
					interaction: 'target' as const,
					owner: { owner: 'node' as const, nodeId: camera.nodeId }
				};
			}
			const keyframe = findCameraViewKeyframeHandleFromObject(object);
			if (keyframe?.viewHandle === 'target') {
				return {
					interaction: 'target' as const,
					owner: {
						owner: 'view-keyframe' as const,
						connectionId: keyframe.connectionId,
						direction: keyframe.direction,
						keyframeId: keyframe.keyframeId
					}
				};
			}
		}
		for (const object of objects) {
			const fov = findCameraFovHandleFromObject(object);
			if (!fov) continue;
			return {
				interaction: 'fov' as const,
				owner:
					fov.owner === 'node'
						? { owner: 'node' as const, nodeId: fov.nodeId }
						: {
								owner: 'view-keyframe' as const,
								connectionId: fov.connectionId,
								direction: fov.direction,
								keyframeId: fov.keyframeId
						  }
			};
		}
		return null;
	}

	function framingPose(owner: FramingOwner) {
		if (owner.owner === 'node') {
			const node = store.selectedNavigationNode;
			if (!node || node.id !== owner.nodeId) return null;
			return {
				position: store.rooms.point(node.roomId, node.position),
				target: store.rooms.point(node.roomId, node.cameraTarget),
				fov: node.fov,
				pending: store.isPendingNavigationNode(node.id)
			};
		}
		const selection = store.navigationSelection;
		const keyframe = store.selectedViewKeyframe;
		if (
			selection?.kind !== 'view-keyframe' ||
			selection.connectionId !== owner.connectionId ||
			selection.direction !== owner.direction ||
			selection.keyframeId !== owner.keyframeId ||
			!keyframe
		) {
			return null;
		}
		return {
			position: getSceneCameraViewKeyframeWorldPosition(
				store.document,
				owner.connectionId,
				owner.direction,
				keyframe.progress,
				store.rooms
			),
			target: getSceneCameraViewKeyframeWorldTarget(keyframe, store.rooms),
			fov: keyframe.fov,
			pending: false
		};
	}

	function beginFramingPointer(
		event: PointerEvent,
		hit: NonNullable<ReturnType<typeof activeFramingHandleHit>>
	) {
		if (hit.owner.owner === 'node') {
			if (store.cameraSelection?.nodeId !== hit.owner.nodeId) return false;
			if (hit.interaction === 'target') store.selectionActions.selectCameraHandle('target');
		}
		const pose = framingPose(hit.owner);
		if (!pose) return false;
		const currentCamera = camera.current;
		if (!currentCamera) return false;
		if (hit.interaction === 'target') {
			currentCamera.getWorldDirection(viewDragPlaneNormal).normalize();
			viewDragPlane.setFromNormalAndCoplanarPoint(
				viewDragPlaneNormal,
				new Vector3(...pose.target)
			);
		} else {
			const basis = createEditorCameraFramingBasis(
				new Vector3(...pose.position),
				new Vector3(...pose.target)
			);
			const depth = clampEditorCameraFrustumDepth(
				new Vector3(...pose.position).distanceTo(new Vector3(...pose.target))
			);
			const center = basis.eye.clone().addScaledVector(basis.forward, depth);
			viewDragPlane.setFromNormalAndCoplanarPoint(basis.forward, center);
		}
		const orbitWasEnabled = editorOrbitControls.current?.enabled ?? null;
		if (editorOrbitControls.current) editorOrbitControls.current.enabled = false;
		pointerSession = {
			kind: 'framing',
			interaction: hit.interaction,
			owner: hit.owner,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			dragging: false,
			pending: pose.pending,
			initialTarget: [...pose.target],
			initialFov: pose.fov,
			lastTarget: [...pose.target],
			lastFov: pose.fov,
			orbitWasEnabled
		};
		canvas.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopImmediatePropagation();
		return true;
	}

	function beginDirectFramingDrag(active: FramingPointerSession) {
		if (!active.pending && !store.beginCameraFramingTransaction()) return false;
		active.dragging = true;
		store.setDirectFramingInteractionActive(true);
		return true;
	}

	function dragFramingToPointer(event: PointerEvent, active: FramingPointerSession) {
		const currentCamera = camera.current;
		const pose = framingPose(active.owner);
		if (!currentCamera || !pose) return;
		toNdc(event);
		raycaster.setFromCamera(pointerNdc, currentCamera);
		if (!raycaster.ray.intersectPlane(viewDragPlane, dragIntersection)) return;
		if (active.interaction === 'target') {
			const worldTarget = dragIntersection.toArray() as Vec3;
			const changed =
				active.owner.owner === 'node'
					? store.updateNavigationNodePoint(
							active.owner.nodeId,
							'target',
							store.rooms.localPoint(
								store.selectedNavigationNode!.roomId,
								worldTarget
							)
					  )
					: store.updateSelectedViewKeyframeTargetWorldPoint(worldTarget);
			if (changed) active.lastTarget = [...worldTarget];
			return;
		}
		const fov = verticalFovFromEditorCameraFrustumPoint(
			new Vector3(...pose.position),
			new Vector3(...pose.target),
			dragIntersection
		);
		const changed =
			active.owner.owner === 'node'
				? store.updateSelectedNodeFov(fov)
				: store.updateSelectedViewKeyframeFov(fov);
		if (changed) active.lastFov = fov;
	}

	function finishFramingPointer(active: FramingPointerSession) {
		pointerSession = null;
		if (active.dragging) {
			const changed =
				active.interaction === 'target'
					? Math.hypot(
							active.lastTarget[0] - active.initialTarget[0],
							active.lastTarget[1] - active.initialTarget[1],
							active.lastTarget[2] - active.initialTarget[2]
					  ) > EDITOR_CAMERA_FRAMING_MOVE_EPSILON
					: Math.abs(active.lastFov - active.initialFov) >
						EDITOR_CAMERA_FRAMING_FOV_EPSILON;
			store.setDirectFramingInteractionActive(false);
			if (!active.pending) {
				if (changed) store.commitDocumentTransaction();
				else store.cancelDocumentTransaction();
			}
		}
		releaseCapture(active.pointerId);
		restoreOrbit(active);
	}

	function activeViewKeyframeHit(event: PointerEvent) {
		if (
			event.altKey ||
			store.currentWorkspace !== 'camera' ||
			store.isDocumentMutationBlocked ||
			store.isEditorInteractionActive ||
			store.pendingPlacementAssetId ||
			store.pendingPlacementPrimitiveKind ||
			store.pendingPlacementLightKind ||
			store.pendingNavigationCommand
		) {
			return null;
		}
		return findPriorityCameraViewKeyframeHandle(
			raycast(event).map((hit) => hit.object)
		);
	}

	function beginViewKeyframePointer(
		event: PointerEvent,
		result: NonNullable<ReturnType<typeof activeViewKeyframeHit>>
	) {
		const handle = result;
		const currentCamera = camera.current;
		if (handle.viewHandle !== 'position' || !currentCamera) return false;
		const keyframe = store.document.connections
			.find((connection) => connection.id === handle.connectionId)
			?.viewTracks?.[handle.direction].find(
				(candidate) => candidate.id === handle.keyframeId
			);
		if (!keyframe) return false;
		const initialWorld = createDraftConnectionPositionPath(
			store.document,
			handle.connectionId,
			handle.direction,
			store.rooms
		).getPointAt(keyframe.progress, new Vector3());
		currentCamera.getWorldDirection(viewDragPlaneNormal).normalize();
		viewDragPlane.setFromNormalAndCoplanarPoint(
			viewDragPlaneNormal,
			initialWorld
		);
		if (!store.beginViewKeyframeProgressDrag(handle)) return false;

		const orbitWasEnabled = editorOrbitControls.current?.enabled ?? null;
		if (editorOrbitControls.current) editorOrbitControls.current.enabled = false;
		pointerSession = {
			kind: 'view-keyframe',
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			dragging: false,
			orbitWasEnabled
		};
		canvas.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopImmediatePropagation();
		return true;
	}

	function dragViewKeyframeToPointer(event: PointerEvent) {
		const currentCamera = camera.current;
		if (!currentCamera) return;
		toNdc(event);
		raycaster.setFromCamera(pointerNdc, currentCamera);
		if (!raycaster.ray.intersectPlane(viewDragPlane, dragIntersection)) return;
		store.updateViewKeyframeProgressDrag(dragIntersection);
	}

	function finishViewKeyframePointer(active: ViewKeyframePointerSession) {
		pointerSession = null;
		store.commitViewKeyframeProgressDrag();
		releaseCapture(active.pointerId);
		restoreOrbit(active);
	}

	function activePathHit(event: PointerEvent): PathHit | null {
		if (
			event.altKey ||
			store.isDocumentMutationBlocked ||
			store.pendingPlacementAssetId ||
			store.pendingPlacementPrimitiveKind ||
			store.pendingPlacementLightKind ||
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
		updatePlacementHover(event);
		if (
			pointerSession?.kind === 'path' ||
			pointerSession?.kind === 'view-keyframe' ||
			pointerSession?.kind === 'framing'
		)
			return;
		updateLayoutHover(event);
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

	// Phase 6.1 Q4 — placement hover drives the dim-white half-opacity outline.
	// Raycasts every placement root (selected or not), finds the deepest
	// intersection, publishes the id to `interactionStore.hoverTargetId`.
	/**
	 * follow-up — resolve the layout surface under the cursor on pointer
	 * move, mirroring the click arbitration exactly (one raycast, same
	 * `resolveNormalSelectionWithHit` source-distance rule). Placement, Alt,
	 * mutation-blocked, and gizmo-drag states clear the hover rather than
	 * preview a pick the click would never commit.
	 */
	function updateLayoutHover(event: PointerEvent) {
		if (!onLayoutHover) return;
		if (
			store.isDocumentMutationBlocked ||
			isFloorPlacementActive() ||
			transformControls?.dragging ||
			transformControls?.axis ||
			event.altKey
		) {
			onLayoutHover([], null);
			return;
		}
		const currentCamera = camera.current;
		if (!currentCamera) {
			onLayoutHover([], null);
			return;
		}
		const intersections = raycast(event);
		const hits = intersections.map(selectionHitFromIntersection);
		const normal = resolveNormalSelectionWithHit(hits);
		const competingSceneDistance =
			normal.result.action === 'deselect' ? null : (normal.sourceHit?.distance ?? null);
		onLayoutHover(layoutCandidatesFromIntersections(intersections), competingSceneDistance);
	}

	function updatePlacementHover(event: PointerEvent) {
		if (!interactionStore) return;
		const currentCamera = camera.current;
		if (!currentCamera) {
			interactionStore.setHoverTarget(null);
			return;
		}
		toNdc(event);
		raycaster.setFromCamera(pointerNdc, currentCamera);
		const allIds = store.document.entities.map((entity) => entity.id);
		const roots = store.getPlacementRoots(allIds);
		if (roots.length === 0) {
			if (interactionStore.hoverTargetId !== null) interactionStore.setHoverTarget(null);
			return;
		}
		const intersects = raycaster.intersectObjects(roots, true);
		const first = intersects[0]?.object ?? null;
		const id = findPlacementIdFromObject(first);
		if (id !== interactionStore.hoverTargetId) interactionStore.setHoverTarget(id);
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
			initialWorld = getScenePathAnchorWorldPosition(anchor, store.rooms);
		} else {
			const path = createDraftConnectionPositionPath(
				store.document,
				selection.connectionId,
				'forward',
				store.rooms
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
			store.selectionActions.selectConnection(active.connectionId);
			store.convertConnectionDraft(active.connectionId);
			const smoothPath = createDraftConnectionPositionPath(
				store.document,
				active.connectionId,
				'forward',
				store.rooms
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
			store.selectionActions.selectAnchor(active.connectionId, active.anchorId);
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
			if (active.anchorId) store.selectionActions.selectAnchor(active.connectionId, active.anchorId);
			else store.selectionActions.selectConnection(active.connectionId);
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
		if (pendingNavigation?.kind === 'place-camera') {
			// accept any project-layout room floor, not just Chopin rooms.
			const floorHit = findPlaceableFloorIntersection(
				intersections,
				undefined,
				(id) => store.rooms.has(id)
			);
			if (!floorHit) {
				store.setStatusMessage('Click a tagged museum-room floor');
				return;
			}
			currentCamera.getWorldDirection(cameraForward);
			store.createPendingNavigationNodeAt(
				floorHit.roomId,
				floorHit.intersection.point.toArray() as Vec3,
				cameraForward.toArray() as Vec3
			);
			return;
		}

		if (store.pendingPlacementPrimitiveKind) {
			// accept any project-layout room floor, not just Chopin rooms.
			const floorHit = findPlaceableFloorIntersection(
				intersections,
				undefined,
				(id) => store.rooms.has(id)
			);
			if (!floorHit) {
				store.setStatusMessage('Click a tagged museum-room floor');
				return;
			}
			const worldPoint = floorHit.intersection.point.toArray() as Vec3;
			store.createPendingPrimitiveAt(
				floorHit.roomId,
				store.rooms.localPoint(floorHit.roomId, worldPoint)
			);
			return;
		}

		if (store.pendingPlacementLightKind) {
			// accept any project-layout room floor, not just Chopin rooms.
			const floorHit = findPlaceableFloorIntersection(
				intersections,
				undefined,
				(id) => store.rooms.has(id)
			);
			if (!floorHit) {
				store.setStatusMessage('Click a tagged museum-room floor');
				return;
			}
			const worldPoint = floorHit.intersection.point.toArray() as Vec3;
			store.createPendingLightAt(
				floorHit.roomId,
				store.rooms.localPoint(floorHit.roomId, worldPoint)
			);
			return;
		}

		if (store.pendingPlacementAssetId) {
			if (store.isRelic) {
				const floorHit = findPlaceableFloorIntersection(intersections, 'paris');
				if (!floorHit) {
					store.setStatusMessage('Click a placeable Paris floor');
					return;
				}
				const worldPoint = floorHit.intersection.point.toArray() as Vec3;
				store.createPendingPlacementAt(roomLocalPoint('paris', worldPoint), 'paris');
				return;
			}
			// resolve the clicked floor's room through the live registry
			// (drafted rooms included), mirroring the primitive/light branch below.
			const floorHit = findPlaceableFloorIntersection(
				intersections,
				undefined,
				(id) => store.rooms.has(id)
			);
			if (!floorHit) {
				store.setStatusMessage('Click a tagged museum-room floor to place');
				return;
			}
			const worldPoint = floorHit.intersection.point.toArray() as Vec3;
			store.createPendingPlacementAt(
				store.rooms.localPoint(floorHit.roomId, worldPoint),
				floorHit.roomId
			);
			return;
		}

		const hits = intersections.map(selectionHitFromIntersection);

		if (event.altKey) {
			store.cyclePlacement(uniquePlacementIdsInOrder(hits));
			return;
		}

		// the layout branch reuses this one `intersections` list (no
		// second raycast). Resolve the normal result once with its source hit,
		// then offer the candidates to the callback; only when it declines do we
		// fall through to the existing dispatch with the already-resolved result.
		const normal = onLayoutPick ? resolveNormalSelectionWithHit(hits) : null;
		if (normal && onLayoutPick) {
			const candidates = layoutCandidatesFromIntersections(intersections);
			const competingSceneDistance =
				normal.result.action === 'deselect'
					? null
					: (normal.sourceHit?.distance ?? null);
			if (onLayoutPick(candidates, competingSceneDistance)) return;
		}

		const result = normal ? normal.result : resolveNormalSelection(hits);
		if (result.action === 'select-camera') {
			if (store.cameraSelection?.nodeId !== result.selection.nodeId) {
				store.selectionActions.selectNavigationNode(result.selection.nodeId);
			}
			store.selectionActions.selectCameraHandle(result.selection.handle);
		} else if (result.action === 'select-navigation') {
			if (result.selection.kind === 'connection') {
				store.selectionActions.selectConnection(result.selection.connectionId);
			} else if (result.selection.kind === 'anchor') {
				store.selectionActions.selectAnchor(result.selection.connectionId, result.selection.anchorId);
			} else if (result.selection.kind === 'view-keyframe') {
				store.selectCameraTimelineViewKeyframe(
					result.selection.connectionId,
					result.selection.direction,
					result.selection.keyframeId
				);
			} else {
				store.selectionActions.selectNavigationNode(result.selection.nodeId);
				store.selectionActions.selectCameraHandle(result.selection.handle);
			}
		} else if (result.action === 'select') {
			// Phase 6.1 section 8 — Unity-grade modifier dispatch:
			//   shift   → add  (merge with current selection)
			//   ctrl/cmd → toggle  (add if absent, remove if present)
			//   none    → select-only
			if (event.shiftKey) {
				const next = new Set([...store.selectedPlacementIds, result.id]);
				store.selectionActions.selectPlacements([...next]);
			} else if (event.metaKey || event.ctrlKey) {
				store.selectionActions.togglePlacement(result.id);
			} else {
				store.selectionActions.selectPlacement(result.id);
			}
			interactionStore?.dispatch({
				type: 'CLICK',
				target: result.id,
				shift: event.shiftKey,
				meta: event.metaKey || event.ctrlKey
			});
		} else if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
			// an empty click clears whichever domain is active (a layout
			// selection may have survived into 3D); default keeps the legacy
			// scene-owned deselect for the relic.
			if (onDeselect) onDeselect();
			else store.selectionActions.deselect();
			interactionStore?.dispatch({
				type: 'CLICK',
				target: null,
				shift: false,
				meta: false
			});
		}
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		if (transformControls?.axis || transformControls?.dragging) return;
		if (pointerSession) {
			if (
				pointerSession.kind === 'path' ||
				pointerSession.kind === 'view-keyframe' ||
				pointerSession.kind === 'framing'
			) {
				cancelDirectDrag();
			}
			else clearPointerSession();
			return;
		}

		const framingHit = activeFramingHandleHit(event);
		if (framingHit && beginFramingPointer(event, framingHit)) return;
		if (store.isDocumentMutationBlocked) return;

		const viewKeyframeHit = activeViewKeyframeHit(event);
		if (
			viewKeyframeHit?.viewHandle === 'position' &&
			beginViewKeyframePointer(event, viewKeyframeHit)
		) return;

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
		if (active.kind === 'framing') {
			if (
				!active.dragging &&
				crossedThreshold &&
				!beginDirectFramingDrag(active)
			) {
				cancelFramingDrag();
				return;
			}
			if (active.dragging) dragFramingToPointer(event, active);
			return;
		}
		if (active.kind === 'view-keyframe') {
			if (crossedThreshold) active.dragging = true;
			if (active.dragging) dragViewKeyframeToPointer(event);
			return;
		}
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
		if (active.kind === 'framing') {
			event.preventDefault();
			event.stopImmediatePropagation();
			finishFramingPointer(active);
			return;
		}
		if (active.kind === 'path') {
			event.preventDefault();
			event.stopImmediatePropagation();
			finishPathPointer(active);
			return;
		}
		if (active.kind === 'view-keyframe') {
			event.preventDefault();
			event.stopImmediatePropagation();
			finishViewKeyframePointer(active);
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
		if (
			pointerSession.kind === 'path' ||
			pointerSession.kind === 'view-keyframe' ||
			pointerSession.kind === 'framing'
		) {
			cancelDirectDrag();
		}
		else clearPointerSession();
	}

	function onLostPointerCapture(event: PointerEvent) {
		if (pointerSession?.pointerId !== event.pointerId) return;
		if (
			pointerSession.kind === 'path' ||
			pointerSession.kind === 'view-keyframe' ||
			pointerSession.kind === 'framing'
		) {
			cancelDirectDrag();
		}
		else {
			const active = pointerSession;
			pointerSession = null;
			restoreOrbit(active);
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !cancelDirectDrag()) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	function onWindowBlur() {
		if (
			pointerSession?.kind === 'path' ||
			pointerSession?.kind === 'view-keyframe' ||
			pointerSession?.kind === 'framing'
		) cancelDirectDrag();
		else if (pointerSession?.kind === 'normal' && pointerSession.orbitWasEnabled !== null) {
			clearPointerSession();
		}
	}

	function onPointerLeave() {
		store.setNavigationHover(null);
		if (onLayoutHover) onLayoutHover([], null);
	}

	/**
	 * Phase 5.2 — texture library → viewport drop. Only the custom texture
	 * MIME participates; camera-tree and timeline drops stay untouched.
	 */
	function onDragOver(event: DragEvent) {
		if (event.dataTransfer?.types.includes(TEXTURE_DRAG_MIME)) {
			event.preventDefault();
		}
	}

	function onTextureDrop(event: DragEvent) {
		const textureId = event.dataTransfer?.getData(TEXTURE_DRAG_MIME);
		if (!textureId) return;
		event.preventDefault();
		event.stopPropagation();
		const currentCamera = camera.current;
		if (!currentCamera) return;
		const entityId = firstRenderablePlacementId(
			raycast(event).map(selectionHitFromIntersection),
			store.document.entities
		);
		if (!entityId) {
			store.setStatusMessage('Drop a texture on a model or primitive');
			return;
		}
		store.requestTextureAssignment(entityId, textureId);
	}

	$effect(() => {
		const activeDrag = store.viewKeyframeProgressDrag;
		const activePointer = pointerSession;
		if (activePointer?.kind === 'view-keyframe' && !activeDrag) {
			pointerSession = null;
			releaseCapture(activePointer.pointerId);
			restoreOrbit(activePointer);
		}
		if (
			activeDrag &&
			activePointer?.kind !== 'view-keyframe' &&
			externalKeyDragOrbitWasEnabled === null &&
			editorOrbitControls.current
		) {
			externalKeyDragOrbitWasEnabled = editorOrbitControls.current.enabled;
			editorOrbitControls.current.enabled = false;
		} else if (
			(!activeDrag || activePointer?.kind === 'view-keyframe') &&
			externalKeyDragOrbitWasEnabled !== null &&
			editorOrbitControls.current
		) {
			editorOrbitControls.current.enabled = externalKeyDragOrbitWasEnabled;
			externalKeyDragOrbitWasEnabled = null;
		}
	});

	onMount(() => {
		store.setDirectPathDragCanceler(cancelDirectDrag);
		canvas.addEventListener('pointerdown', onPointerDown, true);
		canvas.addEventListener('pointermove', onPointerMove, true);
		canvas.addEventListener('pointerup', onPointerUp, true);
		canvas.addEventListener('pointercancel', onPointerCancel, true);
		canvas.addEventListener('lostpointercapture', onLostPointerCapture);
		canvas.addEventListener('pointerleave', onPointerLeave);
		canvas.addEventListener('dragover', onDragOver, true);
		canvas.addEventListener('drop', onTextureDrop, true);
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('blur', onWindowBlur);

		return () => {
			if (
				pointerSession?.kind === 'path' ||
				pointerSession?.kind === 'view-keyframe' ||
				pointerSession?.kind === 'framing'
			) cancelDirectDrag();
			else clearPointerSession();
			if (
				externalKeyDragOrbitWasEnabled !== null &&
				editorOrbitControls.current
			) {
				editorOrbitControls.current.enabled = externalKeyDragOrbitWasEnabled;
				externalKeyDragOrbitWasEnabled = null;
			}
			store.setDirectPathDragCanceler(null);
			store.setNavigationHover(null);
			canvas.removeEventListener('pointerdown', onPointerDown, true);
			canvas.removeEventListener('pointermove', onPointerMove, true);
			canvas.removeEventListener('pointerup', onPointerUp, true);
			canvas.removeEventListener('pointercancel', onPointerCancel, true);
			canvas.removeEventListener('lostpointercapture', onLostPointerCapture);
			canvas.removeEventListener('pointerleave', onPointerLeave);
			canvas.removeEventListener('dragover', onDragOver, true);
			canvas.removeEventListener('drop', onTextureDrop, true);
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('blur', onWindowBlur);
		};
	});
</script>
