<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { useOrbitControls } from '@threlte/extras';
	import { Vector3, type PerspectiveCamera } from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import type { CardinalView } from './camera/editor-camera';
	import { deriveCardinalFace, editorOrientationGizmo } from './editor-orientation-gizmo.svelte';

	// P3B.2 — canvas-side writer for the Scene 3D orientation box. Runs inside
	// the Canvas: every frame it publishes the active viewport camera and
	// OrbitControls refs into the shared module state and derives the nearest
	// cardinal face from the actual eye→target direction. Never renders a
	// mesh, never raycasts, never intercepts pointer events — the DOM overlay
	// owns the widget graphic and its hit targets.
	const { camera } = useThrelte();
	const controls = useOrbitControls();
	const eyeDirection = new Vector3();
	let lastFace: CardinalView | null = null;

	useTask(() => {
		const currentCamera = camera.current as PerspectiveCamera | null;
		const currentControls = controls.current as ThreeOrbitControls | null;
		if (!currentCamera || !currentControls) {
			editorOrientationGizmo.ready = false;
			if (editorOrientationGizmo.camera !== null) editorOrientationGizmo.camera = null;
			if (editorOrientationGizmo.controls !== null) editorOrientationGizmo.controls = null;
			if (editorOrientationGizmo.face !== null) {
				editorOrientationGizmo.face = null;
				lastFace = null;
			}
			return;
		}
		if (editorOrientationGizmo.camera !== currentCamera) {
			editorOrientationGizmo.camera = currentCamera;
		}
		if (editorOrientationGizmo.controls !== currentControls) {
			editorOrientationGizmo.controls = currentControls;
		}
		eyeDirection.copy(currentCamera.position).sub(currentControls.target);
		const face = deriveCardinalFace(eyeDirection);
		if (face !== lastFace) {
			lastFace = face;
			editorOrientationGizmo.face = face;
		}
		editorOrientationGizmo.ready = true;
	});
</script>
