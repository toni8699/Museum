<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getNode } from '$lib/content/scene';
	import type { NavigationGraph } from '$lib/content/scene';
	import { getRoom, roomPoint } from '$lib/content/rooms';
	import {
		CAMERA_FOV_UPDATE_EPSILON,
		VISITOR_CAMERA_PROJECTION,
		createCameraMotion,
		type CameraMotion
	} from '$lib/museum/navigation/camera-motion';
	import { T, useTask, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import {
		Box3,
		BoxGeometry,
		CameraHelper,
		MOUSE,
		Mesh,
		MeshBasicMaterial,
		Vector3,
		type Material,
		type PerspectiveCamera
	} from 'three';
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
	import {
		getSceneCameraViewKeyframeWorldPosition,
		getSceneCameraViewKeyframeWorldTarget
	} from './editor-camera-view';
	import {
		useDirectorPreview,
		useVisitorPreview
	} from './hooks/use-camera-preview.svelte';
	import type {
		EditorCameraPreview,
		EditorCameraPreviewMode,
		MuseumEditorStore
	} from './museum-editor.svelte';

	let {
		store,
		graph
	}: {
		store: MuseumEditorStore;
		graph: NavigationGraph;
	} = $props();

	// Store instance is stable for the editor session; hooks close over field getters.
	// svelte-ignore state_referenced_locally
	const director = useDirectorPreview(store);
	// svelte-ignore state_referenced_locally
	const visitor = useVisitorPreview(store, director);
	const previewSample = director.sample;
	const previewPosition = director.position;
	const previewTarget = director.target;

	const { scene, invalidate } = useThrelte();
	const editorMouseButtons = {
		LEFT: MOUSE.ROTATE,
		MIDDLE: MOUSE.PAN,
		RIGHT: MOUSE.PAN
	};

	let camera = $state<PerspectiveCamera>();
	let virtualCamera = $state<PerspectiveCamera>();
	let orbitControls = $state<ThreeOrbitControls>();
	let ownedCamera: PerspectiveCamera | undefined;
	let ownedOrbitControls: ThreeOrbitControls | undefined;
	let orbitDampingTaskEnabled = $state(true);
	let orbitPose: EditorOrbitPose | null = null;
	let directorOrbitPose: EditorOrbitPose | null = null;
	let activePreviewMode: EditorCameraPreviewMode | null = null;
	let activePreviewRunId: number | null = null;
	let activeMotion: CameraMotion | null = null;
	let virtualCameraHelper: CameraHelper | null = null;
	let virtualCameraBody: Mesh | null = null;
	let handledRecenterVersion = -1;
	let hasLastVirtualPosition = false;
	const lastVirtualPosition = new Vector3();
	const followDelta = new Vector3();
	const framedNodePosition = new Vector3();
	const framedNodeTarget = new Vector3();
	type ActiveCameraPreview = Exclude<EditorCameraPreview, null>;

	function applyPausedFramingOverride(preview: ActiveCameraPreview) {
		if (preview.transport !== 'paused') return;
		const selection = store.navigationSelection;
		if (
			selection?.kind === 'node' &&
			preview.kind === 'node' &&
			preview.nodeId === selection.nodeId
		) {
			const node = store.selectedNavigationNode;
			if (!node) return;
			previewPosition.set(...roomPoint(node.roomId, node.position));
			previewTarget.set(...roomPoint(node.roomId, node.cameraTarget));
			previewSample.fov = node.fov;
			return;
		}
		if (
			selection?.kind === 'view-keyframe' &&
			preview.kind === 'connection' &&
			preview.connectionId === selection.connectionId &&
			preview.direction === selection.direction
		) {
			const keyframe = store.selectedViewKeyframe;
			if (!keyframe || keyframe.id !== selection.keyframeId) return;
			previewPosition.set(
				...getSceneCameraViewKeyframeWorldPosition(
					store.document,
					selection.connectionId,
					selection.direction,
					keyframe.progress
				)
			);
			previewTarget.set(...getSceneCameraViewKeyframeWorldTarget(keyframe));
			previewSample.fov = keyframe.fov;
		}
	}

	function showLegacyDirectorHelper(preview: ActiveCameraPreview) {
		const selection = store.navigationSelection;
		const selectedFraming =
			selection?.kind === 'node' || selection?.kind === 'view-keyframe';
		return (
			preview.mode === 'director' &&
			(preview.transport === 'playing' || !selectedFraming)
		);
	}

	function applyPreviewPose(currentCamera: PerspectiveCamera) {
		currentCamera.position.copy(previewPosition);
		currentCamera.lookAt(previewTarget);
		if (Math.abs(currentCamera.fov - previewSample.fov) > CAMERA_FOV_UPDATE_EPSILON) {
			currentCamera.fov = previewSample.fov;
			currentCamera.updateProjectionMatrix();
		}
		currentCamera.updateMatrixWorld();
	}

	function applyVirtualPose() {
		if (!virtualCamera) return;
		applyPreviewPose(virtualCamera);
		virtualCameraHelper?.update();
	}

	function syncDirectorObserver(currentCamera: PerspectiveCamera, controls: ThreeOrbitControls) {
		if (handledRecenterVersion !== director.recenterVersion) {
			director.recenter(currentCamera, controls);
			handledRecenterVersion = director.recenterVersion;
			hasLastVirtualPosition = true;
			lastVirtualPosition.copy(previewPosition);
			invalidate();
			return;
		}
		if (director.followEnabled && hasLastVirtualPosition) {
			if (
				director.follow(
					currentCamera,
					controls,
					lastVirtualPosition,
					followDelta
				)
			) {
				invalidate();
			}
		}
		hasLastVirtualPosition = true;
		lastVirtualPosition.copy(previewPosition);
	}

	function clearPreviewRuntime() {
		activePreviewRunId = null;
		activePreviewMode = null;
		activeMotion = null;
		directorOrbitPose = null;
		hasLastVirtualPosition = false;
		handledRecenterVersion = -1;
		if (virtualCameraHelper) virtualCameraHelper.visible = false;
		if (virtualCameraBody) virtualCameraBody.visible = false;
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

	function disposeVirtualCameraHelper() {
		if (virtualCameraBody) {
			virtualCameraBody.removeFromParent();
			virtualCameraBody.geometry.dispose();
			const materials = Array.isArray(virtualCameraBody.material)
				? virtualCameraBody.material
				: [virtualCameraBody.material];
			for (const material of materials as Material[]) material.dispose();
			virtualCameraBody = null;
		}
		if (virtualCameraHelper) {
			virtualCameraHelper.removeFromParent();
			virtualCameraHelper.geometry.dispose();
			const materials = Array.isArray(virtualCameraHelper.material)
				? virtualCameraHelper.material
				: [virtualCameraHelper.material];
			for (const material of materials as Material[]) material.dispose();
			virtualCameraHelper = null;
		}
	}

	$effect(() => {
		if (camera) ownedCamera = camera;
		if (orbitControls) ownedOrbitControls = orbitControls;
	});

	$effect(() => {
		const currentVirtualCamera = virtualCamera;
		if (!currentVirtualCamera) return;
		disposeVirtualCameraHelper();
		currentVirtualCamera.name = 'EditorVirtualVisitorCamera';
		currentVirtualCamera.raycast = () => undefined as never;
		const helper = new CameraHelper(currentVirtualCamera);
		helper.name = 'EditorVirtualVisitorCameraFrustum';
		helper.raycast = () => undefined as never;
		helper.renderOrder = 1000;
		const body = new Mesh(
			new BoxGeometry(0.28, 0.2, 0.38),
			new MeshBasicMaterial({ color: 0xffcf67, wireframe: true, depthTest: false })
		);
		body.name = 'EditorVirtualVisitorCameraBody';
		body.position.z = 0.12;
		body.raycast = () => undefined as never;
		body.renderOrder = 1001;
		helper.visible = false;
		body.visible = false;
		currentVirtualCamera.add(body);
		scene.add(helper);
		virtualCameraHelper = helper;
		virtualCameraBody = body;
		invalidate();
		return disposeVirtualCameraHelper;
	});

	$effect(() => {
		store.setCameraPreviewRestorer(restoreOrbitIfNeeded);
		return () => store.setCameraPreviewRestorer(null);
	});

	$effect(() => {
		const preview = director.preview;
		const reducedMotion = visitor.reducedMotion;
		const currentCamera = camera;
		const currentVirtualCamera = virtualCamera;
		const controls = orbitControls;
		if (!currentCamera || !currentVirtualCamera || !controls) return;

		if (!preview) {
			restoreOrbitIfNeeded();
			return;
		}

		try {
			orbitPose ??= captureEditorOrbitPose(currentCamera, controls);
			const modeChanged = activePreviewMode !== preview.mode;
			if (modeChanged && preview.mode === 'visitor') {
				if (activePreviewMode === 'director') {
					directorOrbitPose = captureEditorOrbitPose(currentCamera, controls);
				}
				orbitDampingTaskEnabled = false;
				prepareEditorCameraPreview(currentCamera, controls);
			} else if (modeChanged && preview.mode === 'director') {
				const observerPose = directorOrbitPose ??
					(activePreviewMode === 'visitor' ? orbitPose : null);
				if (observerPose) {
					orbitDampingTaskEnabled = false;
					restoreEditorOrbitPose(currentCamera, controls, observerPose);
					orbitDampingTaskEnabled = observerPose.enableDamping;
					handledRecenterVersion = directorOrbitPose
						? director.recenterVersion
						: -1;
				} else {
					handledRecenterVersion = -1;
				}
			}
			activePreviewMode = preview.mode;
			const showLegacyHelper = showLegacyDirectorHelper(preview);
			if (virtualCameraHelper) virtualCameraHelper.visible = showLegacyHelper;
			if (virtualCameraBody) virtualCameraBody.visible = showLegacyHelper;

			if (activePreviewRunId === preview.runId) return;
			activePreviewRunId = preview.runId;
			if (preview.kind === 'node') {
				const node = getNode(preview.nodeId, graph);
				previewPosition.set(...node.position);
				previewTarget.set(...node.cameraTarget);
				previewSample.fov = node.fov;
				activeMotion = null;
			} else if (preview.kind === 'tour') {
				activeMotion = null;
				if (!director.sampleMotion(preview, preview.playhead, activeMotion)) {
					throw new Error('The guided camera timeline is unavailable');
				}
			} else {
				const route = store.getCapturedCameraPreviewRoute(preview.runId);
				if (!route) throw new Error('Camera preview route capture is unavailable');
				activeMotion = createCameraMotion(route);
				director.sampleMotion(preview, preview.playhead, activeMotion);
			}
			applyPausedFramingOverride(preview);
			applyVirtualPose();
			if (preview.mode === 'visitor') applyPreviewPose(currentCamera);
			else syncDirectorObserver(currentCamera, controls);

			if (preview.kind !== 'node' && preview.transport === 'playing') {
				const durationSeconds = director.durationSeconds(preview, activeMotion);
				if (durationSeconds === 0 || reducedMotion) {
					if (!director.sampleMotion(preview, 1, activeMotion)) {
						throw new Error('Camera preview motion is unavailable');
					}
					applyVirtualPose();
					if (preview.mode === 'visitor') applyPreviewPose(currentCamera);
					else syncDirectorObserver(currentCamera, controls);
					store.markCameraPreviewStarted(preview.runId, performance.now());
					store.completeCameraPreview(preview.runId);
				} else {
					store.markCameraPreviewStarted(
						preview.runId,
						performance.now() - preview.playhead * durationSeconds * 1000
					);
				}
			}
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
		void director.preview;
		const currentCamera = camera;
		const controls = orbitControls;
		if (!currentCamera || !controls || director.preview) return;

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
		} else if (store.cameraFocusKind === 'navigation-node' && store.cameraFocusNodeId) {
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

		const preview = director.preview;
		if (preview && activePreviewRunId === preview.runId) {
			let reachedEnd = false;
			if (preview.kind !== 'node') {
				let progress = preview.playhead;
				if (preview.transport === 'playing' && preview.startedAtMs !== null) {
					const durationSeconds = director.durationSeconds(preview, activeMotion);
					progress = durationSeconds === 0
						? 1
						: (performance.now() - preview.startedAtMs) /
							(1000 * durationSeconds);
					if (progress >= 1) {
						progress = 1;
						reachedEnd = true;
					}
					store.setCameraPreviewPlayhead(progress, preview.runId);
				}
				director.sampleMotion(preview, progress, activeMotion);
			}
			applyPausedFramingOverride(preview);
			const showLegacyHelper = showLegacyDirectorHelper(preview);
			if (virtualCameraHelper) virtualCameraHelper.visible = showLegacyHelper;
			if (virtualCameraBody) virtualCameraBody.visible = showLegacyHelper;
			applyVirtualPose();
			if (preview.mode === 'visitor') applyPreviewPose(currentCamera);
			else syncDirectorObserver(currentCamera, controls);
			if (
				preview.kind !== 'node' &&
				preview.transport === 'playing' &&
				reachedEnd
			) {
				store.completeCameraPreview(preview.runId);
			}
			return;
		}

		controls.panSpeed = createEditorPanSpeed(
			currentCamera.position.distanceTo(controls.target)
		);
	});

	onDestroy(() => {
		const restored = restoreOrbitIfNeeded();
		if (restored && director.preview) store.stopCameraPreview();
		store.setCameraPreviewRestorer(null);
		disposeVirtualCameraHelper();
	});
</script>

<T.PerspectiveCamera
	bind:ref={camera}
	attach={false}
	makeDefault
	position={EDITOR_NEUTRAL_CAMERA_POSITION}
	fov={EDITOR_CAMERA_FOV}
	near={0.05}
	far={120}
/>
<T.PerspectiveCamera
	bind:ref={virtualCamera}
	attach={false}
	fov={VISITOR_CAMERA_PROJECTION.fov}
	near={VISITOR_CAMERA_PROJECTION.near}
	far={VISITOR_CAMERA_PROJECTION.far}
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
