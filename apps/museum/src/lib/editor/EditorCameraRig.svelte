<script lang="ts">
	import { getRoom } from '$lib/content/rooms';
	import { T, useTask } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { Box3, MOUSE, type PerspectiveCamera } from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import {
		createEditorBoundsCameraFrame,
		createEditorPanSpeed,
		createEditorRoomCameraFrame,
		EDITOR_CAMERA_FOV,
		EDITOR_NEUTRAL_CAMERA_POSITION,
		EDITOR_NEUTRAL_CAMERA_TARGET,
		EDITOR_NEUTRAL_MAX_DISTANCE,
		EDITOR_NEUTRAL_MIN_DISTANCE
	} from './editor-camera';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const editorMouseButtons = {
		LEFT: MOUSE.ROTATE,
		MIDDLE: MOUSE.PAN,
		RIGHT: MOUSE.PAN
	};

	let camera = $state<PerspectiveCamera>();
	let orbitControls = $state<ThreeOrbitControls>();

	$effect(() => {
		void store.cameraFocusVersion;
		void store.registryVersion;
		const currentCamera = camera;
		const controls = orbitControls;
		const roomId = store.selectedRoomId;
		if (!currentCamera || !controls || !roomId) return;

		let frame = null;
		if (store.cameraFocusKind === 'room') {
			frame = createEditorRoomCameraFrame(getRoom(roomId));
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
	});

	useTask(() => {
		const currentCamera = camera;
		const controls = orbitControls;
		if (!currentCamera || !controls) return;
		controls.panSpeed = createEditorPanSpeed(
			currentCamera.position.distanceTo(controls.target)
		);
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
	enableDamping
	enablePan={store.cameraPanEnabled}
	mouseButtons={editorMouseButtons}
	target={EDITOR_NEUTRAL_CAMERA_TARGET}
	minDistance={EDITOR_NEUTRAL_MIN_DISTANCE}
	maxDistance={EDITOR_NEUTRAL_MAX_DISTANCE}
/>
