<script lang="ts">
	import { getRoom } from '$lib/content/rooms';
	import type { MuseumRoomId } from '$lib/types/museum';
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { MOUSE, type PerspectiveCamera } from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import {
		createEditorRoomCameraFrame,
		EDITOR_CAMERA_FOV,
		EDITOR_NEUTRAL_CAMERA_POSITION,
		EDITOR_NEUTRAL_CAMERA_TARGET,
		EDITOR_NEUTRAL_MAX_DISTANCE,
		EDITOR_NEUTRAL_MIN_DISTANCE
	} from './editor-camera';

	let {
		selectedRoomId,
		focusVersion,
		panEnabled
	}: {
		selectedRoomId: MuseumRoomId | null;
		focusVersion: number;
		panEnabled: boolean;
	} = $props();

	const editorMouseButtons = {
		LEFT: MOUSE.ROTATE,
		MIDDLE: MOUSE.PAN,
		RIGHT: MOUSE.PAN
	};

	let camera = $state<PerspectiveCamera>();
	let orbitControls = $state<ThreeOrbitControls>();
	const frame = $derived(
		selectedRoomId ? createEditorRoomCameraFrame(getRoom(selectedRoomId)) : null
	);

	$effect(() => {
		void focusVersion;
		const currentCamera = camera;
		const controls = orbitControls;
		const currentFrame = frame;
		if (!currentCamera || !controls || !currentFrame) return;

		currentCamera.position.set(...currentFrame.position);
		controls.target.set(...currentFrame.target);
		controls.minDistance = currentFrame.minDistance;
		controls.maxDistance = currentFrame.maxDistance;
		controls.update();
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
	enablePan={panEnabled}
	mouseButtons={editorMouseButtons}
	target={frame?.target ?? EDITOR_NEUTRAL_CAMERA_TARGET}
	minDistance={frame?.minDistance ?? EDITOR_NEUTRAL_MIN_DISTANCE}
	maxDistance={frame?.maxDistance ?? EDITOR_NEUTRAL_MAX_DISTANCE}
/>
