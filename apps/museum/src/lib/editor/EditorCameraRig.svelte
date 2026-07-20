<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getNode } from '$lib/content/scene';
	import type { NavigationGraph } from '$lib/content/scene';
	import { getRoom } from '$lib/content/rooms';
	import {
		CAMERA_FOV_UPDATE_EPSILON,
		createCameraMotion,
		createCameraMotionSample,
		sampleCameraMotion,
		type CameraMotion
	} from '$lib/museum/navigation/camera-motion';
	import { T, useTask } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { Box3, MOUSE, Vector3, type PerspectiveCamera } from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import {
		createEditorBoundsCameraFrame,
		createEditorNodeCameraFrame,
		createEditorPanSpeed,
		createEditorRoomCameraFrame,
		captureEditorOrbitPose,
		EDITOR_CAMERA_FOV,
		EDITOR_NEUTRAL_CAMERA_POSITION,
		EDITOR_NEUTRAL_CAMERA_TARGET,
		EDITOR_NEUTRAL_MAX_DISTANCE,
		EDITOR_NEUTRAL_MIN_DISTANCE,
		prepareEditorCameraPreview,
		restoreEditorOrbitPose,
		type EditorOrbitPose
	} from './editor-camera';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		graph
	}: {
		store: MuseumEditorStore;
		graph: NavigationGraph;
	} = $props();

	const editorMouseButtons = {
		LEFT: MOUSE.ROTATE,
		MIDDLE: MOUSE.PAN,
		RIGHT: MOUSE.PAN
	};

	let camera = $state<PerspectiveCamera>();
	let orbitControls = $state<ThreeOrbitControls>();
	let ownedCamera: PerspectiveCamera | undefined;
	let ownedOrbitControls: ThreeOrbitControls | undefined;
	// This also drives Threlte's internal OrbitControls update task. Mutating only
	// controls.enableDamping would leave that task running during direct preview.
	let orbitDampingTaskEnabled = $state(true);
	let orbitPose: EditorOrbitPose | null = null;
	let activePreviewRunId: number | null = null;
	let activeMotion: CameraMotion | null = null;
	const previewSample = createCameraMotionSample();
	const previewPosition = previewSample.position;
	const previewTarget = previewSample.target;
	const framedNodePosition = new Vector3();
	const framedNodeTarget = new Vector3();

	function applyPreviewPose(currentCamera: PerspectiveCamera) {
		currentCamera.position.copy(previewPosition);
		currentCamera.lookAt(previewTarget);
		if (Math.abs(currentCamera.fov - previewSample.fov) > CAMERA_FOV_UPDATE_EPSILON) {
			currentCamera.fov = previewSample.fov;
			currentCamera.updateProjectionMatrix();
		}
	}

	function clearPreviewRuntime() {
		activePreviewRunId = null;
		activeMotion = null;
	}

	function restoreOrbitIfNeeded() {
		const currentCamera = camera ?? ownedCamera;
		const controls = orbitControls ?? ownedOrbitControls;
		if (!orbitPose) {
			clearPreviewRuntime();
			return true;
		}
		if (!currentCamera || !controls) return false;
		const pose = orbitPose;
		orbitDampingTaskEnabled = false;
		restoreEditorOrbitPose(currentCamera, controls, pose);
		orbitDampingTaskEnabled = pose.enableDamping;
		orbitPose = null;
		clearPreviewRuntime();
		return true;
	}

	$effect(() => {
		if (camera) ownedCamera = camera;
		if (orbitControls) ownedOrbitControls = orbitControls;
	});

	$effect(() => {
		store.setCameraPreviewRestorer(restoreOrbitIfNeeded);
		return () => store.setCameraPreviewRestorer(null);
	});

	$effect(() => {
		const preview = store.cameraPreview;
		const currentCamera = camera;
		const controls = orbitControls;
		if (!currentCamera || !controls) return;

		if (!preview) {
			restoreOrbitIfNeeded();
			return;
		}
		if (activePreviewRunId === preview.runId) return;

		try {
			orbitPose ??= captureEditorOrbitPose(currentCamera, controls);
			orbitDampingTaskEnabled = false;
			prepareEditorCameraPreview(currentCamera, controls);
			activePreviewRunId = preview.runId;

			if (preview.kind === 'node') {
				const node = getNode(preview.nodeId, graph);
				previewPosition.set(...node.position);
				previewTarget.set(...node.cameraTarget);
				previewSample.fov = node.fov;
				activeMotion = null;
				applyPreviewPose(currentCamera);
				return;
			}

			const route = store.getCapturedCameraPreviewRoute(preview.runId);
			if (!route) throw new Error('Camera preview route capture is unavailable');
			activeMotion = createCameraMotion(route);
			const startsComplete = activeMotion.durationSeconds === 0;
			sampleCameraMotion(
				activeMotion,
				startsComplete ? 1 : 0,
				previewSample
			);
			applyPreviewPose(currentCamera);
			store.markCameraPreviewStarted(preview.runId, performance.now());
			if (startsComplete) store.completeCameraPreview(preview.runId);
		} catch (error) {
			store.setStatusMessage(
				error instanceof Error ? error.message : 'Camera preview could not start'
			);
			store.stopCameraPreview();
		}
	});

	$effect(() => {
		const cameraFocusVersion = store.cameraFocusVersion;
		void store.registryVersion;
		void store.pendingFrameVersion;
		void store.cameraPreview;
		const currentCamera = camera;
		const controls = orbitControls;
		if (!currentCamera || !controls || store.cameraPreview) return;

		let frame = null;
		const pendingFrameIds = [...store.pendingFramePlacementIds];
		if (pendingFrameIds.length > 0) {
			const roots = store.getPlacementRoots(pendingFrameIds);
			if (roots.length !== pendingFrameIds.length) return;
			const bounds = new Box3();
			for (const root of roots) {
				root.updateWorldMatrix(true, true);
				bounds.expandByObject(root);
			}
			frame = createEditorBoundsCameraFrame(
				bounds,
				currentCamera.position,
				controls.target,
				{ fovDegrees: currentCamera.fov, aspect: currentCamera.aspect }
			);
		} else if (
			store.cameraFocusKind === 'navigation-node' &&
			store.cameraFocusNodeId
		) {
			const node = getNode(store.cameraFocusNodeId, graph);
			framedNodePosition.set(...node.position);
			framedNodeTarget.set(...node.cameraTarget);
			frame = createEditorNodeCameraFrame(
				framedNodePosition,
				framedNodeTarget,
				currentCamera.position,
				controls.target,
				{ fovDegrees: currentCamera.fov, aspect: currentCamera.aspect }
			);
		} else if (store.cameraFocusKind === 'room' && store.selectedRoomId) {
			frame = createEditorRoomCameraFrame(getRoom(store.selectedRoomId));
		} else if (store.cameraFocusKind) {
			const ids =
				store.cameraFocusKind === 'placement' && store.cameraFocusPlacementId
					? [store.cameraFocusPlacementId]
					: store.selectedPlacementIds;
			const roots = store.getPlacementRoots(ids);
			if (roots.length !== ids.length || roots.length === 0) return;
			const bounds = new Box3();
			for (const root of roots) {
				root.updateWorldMatrix(true, true);
				bounds.expandByObject(root);
			}
			frame = createEditorBoundsCameraFrame(
				bounds,
				currentCamera.position,
				controls.target,
				{ fovDegrees: currentCamera.fov, aspect: currentCamera.aspect }
			);
		}
		if (!frame) return;

		currentCamera.position.set(...frame.position);
		controls.target.set(...frame.target);
		controls.minDistance = frame.minDistance;
		controls.maxDistance = frame.maxDistance;
		controls.update();
		if (pendingFrameIds.length > 0) store.consumePendingFrame(pendingFrameIds);
		else store.consumeCameraFocus(cameraFocusVersion);
	});

	useTask(() => {
		const currentCamera = camera;
		const controls = orbitControls;
		if (!currentCamera || !controls) return;

		const preview = store.cameraPreview;
		if (preview && activePreviewRunId === preview.runId) {
			if (preview.kind === 'node') {
				applyPreviewPose(currentCamera);
				return;
			}
			if (!activeMotion || preview.startedAtMs === null) return;

			const progress =
				activeMotion.durationSeconds === 0
					? 1
					: (performance.now() - preview.startedAtMs) /
						(1000 * activeMotion.durationSeconds);
			if (preview.completed || progress >= 1) {
				sampleCameraMotion(activeMotion, 1, previewSample);
				applyPreviewPose(currentCamera);
				if (!preview.completed) store.completeCameraPreview(preview.runId);
				return;
			}

			sampleCameraMotion(activeMotion, progress, previewSample);
			applyPreviewPose(currentCamera);
			return;
		}

		controls.panSpeed = createEditorPanSpeed(
			currentCamera.position.distanceTo(controls.target)
		);
	});

	onDestroy(() => {
		const restored = restoreOrbitIfNeeded();
		if (restored && store.cameraPreview) store.stopCameraPreview();
		store.setCameraPreviewRestorer(null);
	});
</script>

<T.PerspectiveCamera
	bind:ref={camera}
	makeDefault
	position={EDITOR_NEUTRAL_CAMERA_POSITION}
	fov={EDITOR_CAMERA_FOV}
	near={0.05}
	far={120}
/>
<OrbitControls
	bind:ref={orbitControls}
	enableDamping={orbitDampingTaskEnabled}
	enablePan={store.cameraPanEnabled}
	mouseButtons={editorMouseButtons}
	target={EDITOR_NEUTRAL_CAMERA_TARGET}
	minDistance={EDITOR_NEUTRAL_MIN_DISTANCE}
	maxDistance={EDITOR_NEUTRAL_MAX_DISTANCE}
/>
