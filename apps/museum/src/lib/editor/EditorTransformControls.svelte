<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { useOrbitControls } from '@threlte/extras';
	import { roomLocalPoint } from '$lib/content/rooms';
	import type { Vec3 } from '$lib/types/museum';
	import { Group, Matrix4, Vector3 } from 'three';
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

	let {
		store,
		controls = $bindable()
	}: {
		store: MuseumEditorStore;
		controls?: ThreeTransformControls;
	} = $props();

	const { scene, camera: threlteCamera, dom, invalidate } = useThrelte();
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
				store.isDocumentMutationBlocked || store.directPathInteractionActive,
			pendingPlacement: Boolean(
				store.pendingPlacementAssetId || store.pendingNavigationCommand
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
		transformControls.mode = navigationTarget ? 'translate' : store.transformMode;
		transformControls.space = 'world';
		transformControls.translationSnap = null;
		transformControls.rotationSnap =
			navigationTarget ? null : effectiveRotationSnap;
		invalidate();
	});

	$effect(() => {
		void store.selectionKey;
		void store.registryVersion;
		void store.historyVersion;
		if (session) return;
		resetSessionPivot(pivot, selectedRoots);
	});

	function beginTransform() {
		const target = activeTarget;
		if (!target) return;
		if (!store.beginDocumentTransaction()) return;

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
				session = {
					kind: 'camera',
					nodeId: target.nodeId,
					handle: target.handle,
					root,
					startWorldPosition,
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
			const node = store.document.navigationNodes.find(
				(candidate) => candidate.id === active.nodeId
			);
			if (!node) return;
			const world = active.root.getWorldPosition(new Vector3()).toArray() as Vec3;
			store.updateNavigationNodePoint(
				active.nodeId,
				active.handle,
				roomLocalPoint(node.roomId, world)
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
			enforceUniformObjectScale(pivot, transformControls.axis ?? null);
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
			active.members
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
		resetSessionPivot(pivot, store.getPlacementRoots());
		restoreOrbitAfterTransform(active);
	}

	function cancelNavigationTransform() {
		const active = session;
		if (!active || active.kind === 'placement') return false;
		transformControls.reset();
		session = null;
		store.setTransformInteractionActive(false);
		store.cancelDocumentTransaction();
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
		resetSessionPivot(pivot, store.getPlacementRoots());
		restoreOrbitAfterTransform(active);
		return true;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Shift') shiftHeld = true;
		if (event.key === 'Escape' && cancelNavigationTransform()) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	function clearShift() {
		shiftHeld = false;
	}

	$effect(() => {
		store.setTransformCanceler(cancelTransform);
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('keyup', clearShift);
		window.addEventListener('blur', clearShift);
		return () => {
			store.setTransformCanceler(null);
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('keyup', clearShift);
			window.removeEventListener('blur', clearShift);
		};
	});

	const onTransformChange = () => invalidate();
	transformControls.addEventListener('change', onTransformChange);
	transformControls.addEventListener('mouseDown', beginTransform);
	transformControls.addEventListener('objectChange', previewTransform);
	transformControls.addEventListener('mouseUp', finishTransform);

	onDestroy(() => {
		pivot.removeFromParent();
		store.setTransformInteractionActive(false);
		if (session) {
			const active = session;
			session = null;
			store.cancelDocumentTransaction();
			restoreOrbitAfterTransform(active);
		}
		transformControls.removeEventListener('change', onTransformChange);
		transformControls.removeEventListener('mouseDown', beginTransform);
		transformControls.removeEventListener('objectChange', previewTransform);
		transformControls.removeEventListener('mouseUp', finishTransform);
		transformControls.detach();
		transformHelper.removeFromParent();
		transformControls.dispose();
		controls = undefined;
	});
</script>
