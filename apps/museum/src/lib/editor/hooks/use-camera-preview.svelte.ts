/**
 * Slice 8 — camera-preview hooks for `EditorCameraRig`.
 *
 * Wraps facade preview slots (`cameraPreview`, follow, recenter) plus shared
 * sampling so the rig reaches fewer store fields directly.
 */

import {
	createCameraMotionSample,
	sampleCameraMotion,
	type CameraMotion
} from '$lib/museum/navigation/camera-motion';
import {
	followEditorDirectorObserver,
	recenterEditorDirectorObserver
} from '../camera/editor-camera';
import { sampleEditorCameraTimeline } from '../camera/editor-camera-timeline';
import type {
	EditorCameraPreview,
	EditorStore
} from '../editor-store.svelte';
import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type ActiveCameraPreview = Exclude<EditorCameraPreview, null>;

type PreviewSampler = {
	readonly preview: EditorCameraPreview;
	readonly reducedMotion: boolean;
	sample: ReturnType<typeof createCameraMotionSample>;
	position: Vector3;
	target: Vector3;
	durationSeconds: (
		preview: ActiveCameraPreview,
		motion: CameraMotion | null
	) => number;
	sampleMotion: (
		preview: ActiveCameraPreview,
		playhead: number,
		activeMotion: CameraMotion | null
	) => boolean;
};

function createPreviewSampler(store: EditorStore): PreviewSampler {
	const sample = createCameraMotionSample();

	function durationSeconds(preview: ActiveCameraPreview, motion: CameraMotion | null) {
		return preview.kind === 'sequence'
			? (store.getCameraTimeline()?.durationSeconds ?? 0)
			: (motion?.durationSeconds ?? 0);
	}

	function sampleMotion(
		preview: ActiveCameraPreview,
		playhead: number,
		activeMotion: CameraMotion | null
	) {
		if (preview.kind === 'sequence') {
			const timeline = store.getCameraTimeline();
			if (!timeline) return false;
			sampleEditorCameraTimeline(timeline, playhead, sample);
			return true;
		}
		if (!activeMotion) return false;
		sampleCameraMotion(activeMotion, playhead, sample);
		return true;
	}

	return {
		get preview() {
			return store.cameraPreview;
		},
		get reducedMotion() {
			return store.state.reducedMotion;
		},
		sample,
		position: sample.position,
		target: sample.target,
		durationSeconds,
		sampleMotion
	};
}

export function useDirectorPreview(store: EditorStore) {
	const base = createPreviewSampler(store);

	function recenter(camera: PerspectiveCamera, controls: ThreeOrbitControls) {
		recenterEditorDirectorObserver(camera, controls, base.position);
	}

	function follow(
		camera: PerspectiveCamera,
		controls: ThreeOrbitControls,
		lastVirtualPosition: Vector3,
		followDelta: Vector3
	) {
		return followEditorDirectorObserver(
			camera,
			controls,
			lastVirtualPosition,
			base.position,
			followDelta
		);
	}

	return {
		get preview() {
			return base.preview;
		},
		get reducedMotion() {
			return base.reducedMotion;
		},
		get followEnabled() {
			return store.cameraPreviewFollowEnabled;
		},
		get recenterVersion() {
			return store.cameraPreviewRecenterVersion;
		},
		sample: base.sample,
		position: base.position,
		target: base.target,
		durationSeconds: base.durationSeconds,
		sampleMotion: base.sampleMotion,
		recenter,
		follow
	};
}

export function useVisitorPreview(
	store: EditorStore,
	shared?: ReturnType<typeof useDirectorPreview>
) {
	const base = shared ?? createPreviewSampler(store);
	return {
		get preview() {
			return store.cameraPreview;
		},
		get reducedMotion() {
			return base.reducedMotion;
		},
		sample: base.sample,
		position: base.position,
		target: base.target,
		durationSeconds: base.durationSeconds,
		sampleMotion: base.sampleMotion
	};
}
