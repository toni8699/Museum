<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { useOrbitControls } from '@threlte/extras';
	import { Vector3, type PerspectiveCamera } from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { editorOrientationGizmo } from './editor-orientation-gizmo.svelte';
	import {
		orientationProjectionMateriallyChanged,
		projectOrientationGeometry,
		type OrientationProjectionInput,
		type OrientationProjectionSnapshot
	} from './editor-orientation-projection';

	// P3B.2 — canvas-side writer for the Scene 3D orientation box. Runs inside
	// the Canvas: every relevant frame it samples immutable camera orientation
	// values, projects the cube/axes through the pure geometry helper, and
	// publishes only material changes. Never renders a mesh, raycasts, or
	// intercepts pointer events — the DOM overlay owns graphic + hit targets.
	const { camera } = useThrelte();
	const controls = useOrbitControls();
	const eyeDirection = new Vector3();
	let lastSample: OrientationProjectionInput | null = null;
	let lastPublished: OrientationProjectionSnapshot | null = null;

	function sampleExactlyMatchesPrevious(sample: OrientationProjectionInput): boolean {
		if (lastSample === null) return false;
		return (
			sample.cameraQuaternion.every((value, index) => value === lastSample!.cameraQuaternion[index]) &&
			sample.eyeDirection.every((value, index) => value === lastSample!.eyeDirection[index])
		);
	}

	useTask(() => {
		const currentCamera = camera.current as PerspectiveCamera | null;
		const currentControls = controls.current as ThreeOrbitControls | null;
		if (!currentCamera || !currentControls) {
			editorOrientationGizmo.ready = false;
			if (editorOrientationGizmo.camera !== null) editorOrientationGizmo.camera = null;
			if (editorOrientationGizmo.controls !== null) editorOrientationGizmo.controls = null;
			if (editorOrientationGizmo.snapshot !== null) editorOrientationGizmo.snapshot = null;
			lastSample = null;
			lastPublished = null;
			return;
		}
		if (editorOrientationGizmo.camera !== currentCamera) {
			editorOrientationGizmo.camera = currentCamera;
		}
		if (editorOrientationGizmo.controls !== currentControls) {
			editorOrientationGizmo.controls = currentControls;
		}
		eyeDirection.copy(currentCamera.position).sub(currentControls.target).normalize();
		const sample: OrientationProjectionInput = {
			cameraQuaternion: [
				currentCamera.quaternion.x,
				currentCamera.quaternion.y,
				currentCamera.quaternion.z,
				currentCamera.quaternion.w
			],
			eyeDirection: [eyeDirection.x, eyeDirection.y, eyeDirection.z]
		};
		if (!sampleExactlyMatchesPrevious(sample)) {
			lastSample = sample;
			const snapshot = projectOrientationGeometry(sample);
			if (orientationProjectionMateriallyChanged(lastPublished, snapshot)) {
				lastPublished = snapshot;
				editorOrientationGizmo.snapshot = snapshot;
			}
		}
		editorOrientationGizmo.ready = editorOrientationGizmo.snapshot !== null;
	});
</script>
