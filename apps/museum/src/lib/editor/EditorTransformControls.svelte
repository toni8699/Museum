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

	type TransformSession = PlacementTransformSession | CameraTransformSession;

	let session: TransformSession | null = null;
	let shiftHeld = $state(false);
	const editorOrbitControls = useOrbitControls();
	const selectedRoots = $derived(store.getPlacementRoots());
	const selectedCameraRoot = $derived(store.getSelectedCameraHelperRoot());
	const activeTarget = $derived.by(() =>
		getActiveTransformTarget({
			previewActive: store.isCameraPreviewActive,
			pendingPlacement: Boolean(store.pendingPlacementAssetId),
			placementKey: store.selectionKey,
			placementObject:
				selectedRoots.length > 0 && selectedRoots.length === store.selectedPlacementIds.length
					? pivot
					: undefined,
			cameraSelection: store.cameraSelection,
			cameraObject: selectedCameraRoot
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
		transformControls.mode =
			activeTarget?.kind === 'camera' ? 'translate' : store.transformMode;
		transformControls.space = 'world';
		transformControls.translationSnap = null;
		transformControls.rotationSnap =
			activeTarget?.kind === 'camera' ? null : effectiveRotationSnap;
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

		if (target.kind === 'camera') {
			store.setTransformInteractionActive(true, 'camera');
			const orbitWasEnabled = editorOrbitControls.current?.enabled ?? null;
			if (editorOrbitControls.current) editorOrbitControls.current.enabled = false;
			session = {
				kind: 'camera',
				nodeId: target.nodeId,
				handle: target.handle,
				root: target.object as Group,
				startWorldPosition: target.object.getWorldPosition(new Vector3()),
				orbitWasEnabled
			};
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

		if (active.kind === 'camera') {
			session = null;
			store.setTransformInteractionActive(false);
			store.commitDocumentTransaction();
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

	function cancelCameraTransform() {
		const active = session;
		if (!active || active.kind !== 'camera') return false;
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
		if (active.kind === 'camera') return cancelCameraTransform();
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
		if (event.key === 'Escape' && cancelCameraTransform()) {
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
