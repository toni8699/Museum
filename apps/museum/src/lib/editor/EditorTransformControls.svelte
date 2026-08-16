<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { useOrbitControls } from '@threlte/extras';
	import type { Vec3 } from '$lib/types/museum';
	import { Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
	import { TransformControls as ThreeTransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import {
		applyRigidPivotDelta,
		captureMemberTransformBaselines,
		resetSessionPivot,
		snapPivotRoomLocal,
		type MemberTransformBaseline
	} from './editor-cluster-transform';
	import { groundSelectionRigidly, rotationSnapRadians } from './editor-placement';
	import {
		enforceUniformObjectScale,
		getActiveTransformTarget,
		placementTransformFromObject
	} from './editor-transform';
	import { EDITOR_CAMERA_PATH_MOVE_EPSILON } from './editor-camera-path';
	import { EDITOR_CAMERA_VIEW_MOVE_EPSILON } from './editor-camera-view';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';

	let {
		store,
		controls = $bindable()
	}: {
		store: MuseumEditorStore;
		controls?: ThreeTransformControls;
	} = $props();

	const { scene, camera: threlteCamera, dom, invalidate } = useThrelte();
	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);
	const pivot = new Group();
	pivot.name = 'EditorSelectionPivot';
	pivot.userData.editorEntity = 'selection-pivot';
	scene.add(pivot);
	const transformControls = new ThreeTransformControls(threlteCamera.current, dom);
	const transformHelper = transformControls.getHelper();
	scene.add(transformHelper);
	controls = transformControls;

	type PlacementTransformSession = {
		kind: 'placement';
		startPivotWorldMatrix: Matrix4;
		members: MemberTransformBaseline[];
		orbitWasEnabled: boolean | null;
	};

	type CameraTransformSession = {
		kind: 'camera';
		nodeId: string;
		handle: 'position' | 'target';
		root: Group;
		startWorldPosition: Vector3;
		startLocalPoint: Vec3;
		pending: boolean;
		orbitWasEnabled: boolean | null;
	};

	type AnchorTransformSession = {
		kind: 'anchor';
		connectionId: string;
		anchorId: string;
		root: Group;
		startWorldPosition: Vector3;
		orbitWasEnabled: boolean | null;
	};

	type ViewTargetTransformSession = {
		kind: 'view-target';
		connectionId: string;
		direction: 'forward' | 'reverse';
		keyframeId: string;
		root: Group;
		startWorldPosition: Vector3;
		orbitWasEnabled: boolean | null;
	};

	type TransformSession =
		| PlacementTransformSession
		| CameraTransformSession
		| AnchorTransformSession
		| ViewTargetTransformSession;

	let session: TransformSession | null = null;
	let shiftHeld = $state(false);
	const editorOrbitControls = useOrbitControls();
	const selectedRoots = $derived(store.getPlacementRoots());
	const selectedCameraRoot = $derived(store.getSelectedCameraHelperRoot());
	const selectedAnchorRoot = $derived(store.getSelectedAnchorHelperRoot());
	const selectedViewTargetRoot = $derived(
		store.getSelectedViewKeyframeTargetHelperRoot()
	);
	const activeTarget = $derived.by(() =>
		getActiveTransformTarget({
			previewActive:
				store.isDocumentMutationBlocked ||
				store.directPathInteractionActive ||
				store.viewKeyframeProgressDrag !== null ||
				!store.transformGizmoVisible,
			pendingPlacement: Boolean(
				store.pendingPlacementAssetId ||
				store.pendingPlacementPrimitiveKind ||
				store.pendingPlacementLightKind ||
				(store.pendingNavigationCommand &&
					store.pendingNavigationCommand.kind !== 'connect-pending-node')
			),
			placementKey: store.selectionKey,
			placementObject:
				selectedRoots.length > 0 && selectedRoots.length === store.selectedPlacementIds.length
					? pivot
					: undefined,
			navigationSelection: store.navigationSelection,
			cameraObject: selectedCameraRoot,
			anchorObject: selectedAnchorRoot,
			viewTargetObject: selectedViewTargetRoot
		})
	);
	const effectiveRotationSnap = $derived(
		store.rotationSnapEnabled && !shiftHeld
			? rotationSnapRadians(store.rotationSnapDegrees)
			: null
	);

	function resetPivot(roots = selectedRoots) {
		// Phase 6.3 — multi-select gizmo always lands on the centroid
		// (Active Object pivot removed from the toolbar; Center is the
		// single behaviour). Single-select pivots on the placement's own
		// origin so 6.1's local-space rotate intuition is preserved.
		if (!resetSessionPivot(pivot, roots)) return false;
		if (roots.length === 1) {
			const ref = roots[0]!;
			ref.updateWorldMatrix(true, false);
			pivot.quaternion.copy(ref.getWorldQuaternion(new Quaternion()));
			pivot.updateMatrixWorld(true);
		}
		return true;
	}

	$effect(() => {
		transformControls.camera = threlteCamera.current;
	});

	// Target changes always detach first. Configuration is kept in a separate
	// effect so placement snap changes do not churn the attached object.
	$effect(() => {
		const key = activeTarget?.key ?? null;
		const object = activeTarget?.object;
		void key;
		transformControls.detach();
		transformControls.enabled = object != null;
		if (object) transformControls.attach(object);
		invalidate();
	});

	$effect(() => {
		const navigationTarget =
			activeTarget?.kind === 'camera' ||
			activeTarget?.kind === 'anchor' ||
			activeTarget?.kind === 'view-target';
		const interactionMode = interactionStore?.mode ?? store.transformMode;
		transformControls.mode = navigationTarget ? 'translate' : interactionMode;
		// Phase 6.3 — placement gizmos always World space; the World ⇄ Local
		// chip was removed from the toolbar.
		transformControls.space = 'world';
		transformControls.translationSnap = null;
		transformControls.rotationSnap =
			navigationTarget ? null : effectiveRotationSnap;
		invalidate();
	});

// Phase 6.4 — gizmo mode persists across selection-set boundaries and
// across drags. Users explicitly opt into Move / Rotate / Scale via
// toolbar click or W/E/R shortcuts; the previous behaviour of snapping
// back to Move after every drag was dropped per user feedback.


	$effect(() => {
		void store.selectionKey;
		void store.registryVersion;
		void store.historyVersion;
		if (session) return;
		resetPivot();
	});

	function beginTransform() {
		const target = activeTarget;
		if (!target) return;
		const pendingCamera =
			target.kind === 'camera' && store.isPendingNavigationNode(target.nodeId);
		if (!pendingCamera && !store.beginDocumentTransaction()) return;

		if (
			target.kind === 'camera' ||
			target.kind === 'anchor' ||
			target.kind === 'view-target'
		) {
			store.setTransformInteractionActive(true, target.kind);
			const orbitWasEnabled = editorOrbitControls.current?.enabled ?? null;
			if (editorOrbitControls.current) editorOrbitControls.current.enabled = false;
			const root = target.object as Group;
			const startWorldPosition = target.object.getWorldPosition(new Vector3());
			if (target.kind === 'camera') {
				const node = store.selectedNavigationNode;
				if (!node || node.id !== target.nodeId) {
					if (!pendingCamera) store.cancelDocumentTransaction();
					store.setTransformInteractionActive(false);
					return;
				}
				session = {
					kind: 'camera',
					nodeId: target.nodeId,
					handle: target.handle,
					root,
					startWorldPosition,
					startLocalPoint: [...(target.handle === 'position' ? node.position : node.cameraTarget)],
					pending: pendingCamera,
					orbitWasEnabled
				};
			} else if (target.kind === 'anchor') {
				session = {
					kind: 'anchor',
					connectionId: target.connectionId,
					anchorId: target.anchorId,
					root,
					startWorldPosition,
					orbitWasEnabled
				};
			} else {
				session = {
					kind: 'view-target',
					connectionId: target.connectionId,
					direction: target.direction,
					keyframeId: target.keyframeId,
					root,
					startWorldPosition,
					orbitWasEnabled
				};
			}
			return;
		}

		const ids = [...store.selectedPlacementIds];
		const roots = store.getPlacementRoots(ids);
		if (ids.length === 0 || roots.length !== ids.length) {
			store.cancelDocumentTransaction();
			return;
		}
		pivot.updateMatrixWorld(true);
		store.setTransformInteractionActive(true, 'placement');
		const orbitWasEnabled = editorOrbitControls.current?.enabled ?? null;
		if (editorOrbitControls.current) editorOrbitControls.current.enabled = false;
		session = {
			kind: 'placement',
			startPivotWorldMatrix: pivot.matrixWorld.clone(),
			members: captureMemberTransformBaselines(ids, roots),
			orbitWasEnabled
		};
	}

	function restoreOrbitAfterTransform(active: TransformSession) {
		if (active.orbitWasEnabled === null || !editorOrbitControls.current) return;
		editorOrbitControls.current.enabled = active.orbitWasEnabled;
	}

	function previewTransform() {
		const active = session;
		if (!active) return;
		if (active.kind === 'camera') {
			if (!active.nodeId || !active.handle) return;
			const node = store.isPendingNavigationNode(active.nodeId)
				? store.pendingNavigationNode
				: store.document.navigationNodes.find(
						(candidate) => candidate.id === active.nodeId
					);
			if (!node) return;
			const world = active.root.getWorldPosition(new Vector3()).toArray() as Vec3;
			store.updateNavigationNodePoint(
				active.nodeId,
				active.handle,
				store.rooms.localPoint(node.roomId, world)
			);
			return;
		}
		if (active.kind === 'anchor') {
			if (!active.connectionId || !active.anchorId) return;
			const world = active.root.getWorldPosition(new Vector3()).toArray() as Vec3;
			store.updateConnectionAnchorWorldPoint(
				active.connectionId,
				active.anchorId,
				world
			);
			return;
		}
		if (active.kind === 'view-target') {
			const world = active.root.getWorldPosition(new Vector3()).toArray() as Vec3;
			store.updateSelectedViewKeyframeTargetWorldPoint(world);
			return;
		}

		if (store.transformMode === 'scale') {
			// Phase 1a — only enforce single-axis uniform scale when scaleMode
			// is `'uniform'`. Independent mode keeps the gizmo's per-axis
			// writes intact; Three's TransformControls writes per-axis values
			// to pivot.scale, stream unchecked through any axis handle.
			if (interactionStore?.scaleMode === 'uniform') {
				enforceUniformObjectScale(pivot, transformControls.axis ?? null);
			}
		}
		if (store.transformMode === 'translate' && store.translationSnapEnabled && !shiftHeld) {
			snapPivotRoomLocal(
				pivot,
				active.members[0]?.root.parent ?? null,
				store.translationSnap,
				!store.keepOnFloor
			);
		}

		pivot.updateMatrixWorld(true);
		const transforms = applyRigidPivotDelta(
			active.startPivotWorldMatrix,
			pivot.matrixWorld,
			active.members,
			interactionStore?.scaleMode ?? 'uniform'
		);
		for (const [id, transform] of transforms) {
			store.updatePlacementTransform(id, transform);
		}
	}

	function finishTransform() {
		const active = session;
		if (!active) return;
		previewTransform();

		if (
			active.kind === 'camera' ||
			active.kind === 'anchor' ||
			active.kind === 'view-target'
		) {
			session = null;
			store.setTransformInteractionActive(false);
			if (active.kind === 'camera' && active.pending) {
				restoreOrbitAfterTransform(active);
				return;
			}
			if (
				(active.kind === 'anchor' || active.kind === 'view-target') &&
				active.root
					.getWorldPosition(new Vector3())
					.distanceTo(active.startWorldPosition) <=
					(active.kind === 'anchor'
						? EDITOR_CAMERA_PATH_MOVE_EPSILON
						: EDITOR_CAMERA_VIEW_MOVE_EPSILON)
			) {
				store.cancelDocumentTransaction();
				active.root.position.copy(active.startWorldPosition);
			} else {
				store.commitDocumentTransaction();
			}
			restoreOrbitAfterTransform(active);
			return;
		}

		if (store.keepOnFloor) {
			const roots = active.members.map((member) => member.root);
			const result = groundSelectionRigidly(roots, [scene]);
			if (!result.grounded) {
				store.setStatusMessage('No floor below selection');
			} else if (result.deltaY !== 0) {
				for (const member of active.members) {
					store.updatePlacementTransform(
						member.id,
						placementTransformFromObject(member.root)
					);
				}
			}
		}

		session = null;
		store.setTransformInteractionActive(false);
		store.commitDocumentTransaction();
		resetPivot(store.getPlacementRoots());
		restoreOrbitAfterTransform(active);
	}

	function cancelNavigationTransform() {
		const active = session;
		if (!active || active.kind === 'placement') return false;
		transformControls.reset();
		session = null;
		store.setTransformInteractionActive(false);
		if (active.kind === 'camera' && active.pending) {
			store.navigationSelection = {
				kind: 'node',
				nodeId: active.nodeId,
				handle: active.handle
			};
			store.updateNavigationNodePoint(
				active.nodeId,
				active.handle,
				active.startLocalPoint
			);
		} else {
			store.cancelDocumentTransaction();
		}
		active.root.position.copy(active.startWorldPosition);
		transformControls.pointerUp(null);
		restoreOrbitAfterTransform(active);
		return true;
	}

	function cancelTransform() {
		const active = session;
		if (!active) return false;
		if (active.kind !== 'placement') return cancelNavigationTransform();
		transformControls.reset();
		session = null;
		store.setTransformInteractionActive(false);
		store.cancelDocumentTransaction();
		transformControls.pointerUp(null);
		resetPivot(store.getPlacementRoots());
		restoreOrbitAfterTransform(active);
		return true;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Shift') shiftHeld = true;
		// Phase 6.1 Q8 — Esc mid-drag reverts + deselects. H1 S7 rewires the
		// placement branch through DRAG_END { cancelled: true } + a detached
		// ACTIVE_TARGET_CHANGE so the FSM `ESC` event stays shell-level only;
		// navigator/anchor/view-target drags keep `cancelNavigationTransform`
		// (they never entered Dragging).
		if (event.key === 'Escape' && interactionStore?.state === 'Dragging') {
			const snap = interactionStore.dragSnapshot;
			if (snap) {
				for (const t of snap.transforms) {
					const root = store.getPlacementRoot(t.id);
					if (!root) continue;
					root.position.copy(t.position);
					root.quaternion.copy(t.quaternion);
					root.scale.copy(t.scale);
				}
			}
			// Three's TransformControls lacks a public cancelDrag(); flip the
			// private flag so it releases pointer capture. Works on r170 today.
			(transformControls as { dragging?: boolean }).dragging = false;
			interactionStore.clearDragSnapshot();
			// H1 S7 — a live gizmo drag never dispatches the FSM `ESC` event.
			// Route the cancel through the generic DRAG_END { cancelled: true }
			// path (the monolith plays the scene adapter's cancel role until
			// S7 step 3 extracts it), then sync the detached target so the
			// placement deselect lands the FSM in Idle.
			interactionStore.dispatch({ type: 'DRAG_END', cancelled: true });
			store.selectionActions.deselect();
			interactionStore.dispatch({ type: 'ACTIVE_TARGET_CHANGE', targetKey: null });
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		if (event.key === 'Escape' && cancelNavigationTransform()) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	function clearShift() {
		shiftHeld = false;
	}

	// Phase 6.1 Q3 — Ctrl/Cmd while dragging enables snap; releasing it disables
	// snap mid-drag. Snap defaults are off so this is a fully opt-in modifier.
	function onSnapModifierChange(event: KeyboardEvent) {
		if (interactionStore?.state !== 'Dragging' && !transformControls.dragging) return;
		if (event.ctrlKey || event.metaKey) {
			transformControls.translationSnap = store.translationSnap;
			transformControls.rotationSnap = (store.rotationSnapDegrees * Math.PI) / 180;
			transformControls.scaleSnap = store.scaleSnap;
		} else {
			transformControls.translationSnap = 0;
			transformControls.rotationSnap = 0;
			transformControls.scaleSnap = 0;
		}
	}

	$effect(() => {
		store.setTransformCanceler(cancelTransform);
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('keyup', onSnapModifierChange);
		window.addEventListener('blur', clearShift);
		return () => {
			store.setTransformCanceler(null);
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('keyup', onSnapModifierChange);
			window.removeEventListener('blur', clearShift);
		};
	});

	const onTransformChange = () => invalidate();
	transformControls.addEventListener('change', onTransformChange);
	transformControls.addEventListener('mouseDown', beginTransform);
	transformControls.addEventListener('objectChange', previewTransform);
	transformControls.addEventListener('mouseUp', finishTransform);

	// Phase 6.1 — dragging-changed toggles the FSM Dragging state and captures
	// the pre-drag transform snapshot for placement drags. The natural mouseup
	// path (listener above via finishTransform → commitDocumentTransaction)
	// commits a single history entry per drag.
	const onDraggingChanged = (event: { value: unknown }) => {
		const value = event.value === true;
		if (!interactionStore) return;
		if (value) {
			interactionStore.dispatch({ type: 'DRAG_START' });
			if (store.selectedPlacementIds.length > 0) {
				const snap = {
					placementIds: [...store.selectedPlacementIds],
					transforms: store.selectedPlacementIds.map((id) => {
						const root = store.getPlacementRoot(id);
						if (!root) {
							throw new Error(`EditorTransformControls: missing placement root for ${id}`);
						}
						return {
							id,
							position: root.position.clone(),
							quaternion: root.quaternion.clone(),
							scale: root.scale.clone()
						};
					})
				};
				interactionStore.captureDragSnapshot(snap);
			}
			interactionStore.recomputeCursor(true);
		} else {
			// If Esc cleared the snapshot mid-drag, this natural mouseup fires
			// after the FSM already went to Idle; bail to avoid committing.
			if (interactionStore.dragSnapshot === null) {
				interactionStore.recomputeCursor(false);
				return;
			}
			interactionStore.dispatch({ type: 'DRAG_END', cancelled: false });
			interactionStore.clearDragSnapshot();
			interactionStore.recomputeCursor(false);
		}
	};
	transformControls.addEventListener('dragging-changed', onDraggingChanged);

	onDestroy(() => {
		pivot.removeFromParent();
		store.setTransformInteractionActive(false);
		if (session) {
			const active = session;
			session = null;
			if (!(active.kind === 'camera' && active.pending)) {
				store.cancelDocumentTransaction();
			}
			restoreOrbitAfterTransform(active);
		}
		transformControls.removeEventListener('change', onTransformChange);
		transformControls.removeEventListener('mouseDown', beginTransform);
		transformControls.removeEventListener('objectChange', previewTransform);
		transformControls.removeEventListener('mouseUp', finishTransform);
		transformControls.removeEventListener('dragging-changed', onDraggingChanged);
		transformControls.detach();
		transformHelper.removeFromParent();
		transformControls.dispose();
		controls = undefined;
	});
</script>
