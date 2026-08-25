<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useTask, useThrelte } from '@threlte/core';
	import { useOrbitControls } from '@threlte/extras';
	import { Vector3, type PerspectiveCamera } from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import {
		cancelEditorOrientationSnap,
		editorOrientationGizmo,
		editorOrientationSnapRuntime
	} from './editor-orientation-gizmo.svelte';
	import {
		orientationProjectionMateriallyChanged,
		projectOrientationGeometry,
		type OrientationProjectionInput,
		type OrientationProjectionSnapshot
	} from './editor-orientation-projection';
	import { toOrientationSnapStartPose } from './editor-orientation-interaction';

	// P3B.2/P3B.4 — canvas-side writer for the Scene 3D orientation box. Runs
	// inside the Canvas: every relevant frame it samples immutable camera
	// orientation values, projects the cube/axes through the pure geometry
	// helper, publishes only material changes, and advances an active P3B.4
	// cardinal snap flight through `createEditorCardinalSnapMotion` (the single
	// motion authority). Never renders a mesh or raycasts — the DOM overlay owns
	// graphic + hit targets.
	const { camera } = useThrelte();
	const controls = useOrbitControls();
	const eyeDirection = new Vector3();
	let lastSample: OrientationProjectionInput | null = null;
	let lastPublished: OrientationProjectionSnapshot | null = null;
	let attachedControls: ThreeOrbitControls | null = null;

	function sampleExactlyMatchesPrevious(sample: OrientationProjectionInput): boolean {
		if (lastSample === null) return false;
		return (
			sample.cameraQuaternion.every((value, index) => value === lastSample!.cameraQuaternion[index]) &&
			sample.eyeDirection.every((value, index) => value === lastSample!.eyeDirection[index])
		);
	}

	// P3B.4 — a legitimate viewport gesture (orbit/pan/zoom drag) cancels the
	// active snap immediately; OrbitControls receives 1:1 manual authority.
	// The cancellation is a non-terminal handoff (global +Y restore + residue
	// drain) so an interrupted ±Y flight cannot leak its interpolated roll
	// into the orbit frame. Programmatic `controls.update()` never fires
	// 'start'.
	function interruptActiveSnap() {
		cancelEditorOrientationSnap(
			camera.current as PerspectiveCamera | null,
			attachedControls ?? editorOrientationGizmo.controls
		);
	}

	// Raw clear — landing only: the pose was already normalized by the landing
	// handoff below, so another drain would be a redundant update.
	function clearLandedSnap() {
		editorOrientationSnapRuntime.active = null;
	}

	function attachOrbitCancel(next: ThreeOrbitControls | null) {
		if (attachedControls === next) return;
		attachedControls?.removeEventListener('start', interruptActiveSnap);
		attachedControls = next;
		next?.addEventListener('start', interruptActiveSnap);
	}

	/**
	 * P3B.4 — advance and apply the active snap flight.
	 *
	 * Mid-flight frames write the sampled pose directly (up → position →
	 * lookAt → controls target); Threlte's damping task re-derives an equivalent
	 * orientation from that same state, so task order does not matter while the
	 * user is hands-off. The landing frame replays the exact instant-commit
	 * handoff — settle `controls.update()` against the cardinal pose, then
	 * restore the global +Y pole — pinned by
	 * `tests/lib/editor/camera/polar-orbit-handoff.test.ts`.
	 */
	function applyActiveSnap(
		currentCamera: PerspectiveCamera,
		currentControls: ThreeOrbitControls,
		deltaSeconds: number
	) {
		const active = editorOrientationSnapRuntime.active;
		if (!active) return;
		const durationMs = Math.max(active.motion.durationMs, 1e-6);
		active.elapsedMs = Math.min(active.elapsedMs + deltaSeconds * 1000, durationMs);
		const progress = active.elapsedMs / durationMs;
		const sample = active.motion.sample(progress);
		active.lastSample = toOrientationSnapStartPose(sample.position, sample.target, sample.up);
		currentCamera.up.copy(sample.up);
		currentCamera.position.copy(sample.position);
		currentCamera.lookAt(sample.target);
		currentControls.target.copy(sample.target);
		currentCamera.updateMatrixWorld(true);
		if (progress >= 1) {
			currentControls.update();
			currentCamera.up.set(0, 1, 0);
			currentCamera.updateMatrixWorld(true);
			clearLandedSnap();
		}
	}

	useTask((delta) => {
		const currentCamera = camera.current as PerspectiveCamera | null;
		const currentControls = controls.current as ThreeOrbitControls | null;
		if (!currentCamera || !currentControls) {
			// Refs vanished mid-flight (canvas teardown): hand off through the
			// last published pair before dropping them, so the camera never
			// keeps an interpolated pole. The helper degrades to a raw clear
			// when no published pair exists.
			cancelEditorOrientationSnap(
				editorOrientationGizmo.camera,
				editorOrientationGizmo.controls
			);
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
		attachOrbitCancel(currentControls);
		applyActiveSnap(currentCamera, currentControls, delta ?? 0);
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

	onDestroy(() => {
		attachOrbitCancel(null);
		interruptActiveSnap();
	});
</script>
