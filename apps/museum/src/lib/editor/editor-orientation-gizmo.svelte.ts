import type { PerspectiveCamera } from 'three';
import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CardinalView } from './camera/editor-camera';
import type { OrientationProjectionSnapshot } from './editor-orientation-projection';

/**
 * P3B.2 — Scene 3D orientation box shared state (writer/overlay split, same
 * pattern as `editor-camera-labels.svelte.ts`).
 *
 * The canvas-side `EditorOrientationGizmoProjector` publishes the active
 * viewport camera + OrbitControls refs plus an immutable camera-projected
 * geometry snapshot; the DOM overlay (`EditorOrientationGizmo`) reads that
 * state reactively and snaps through `snapEditorViewToCardinal`.
 *
 * This module owns no camera pose, no orientation state of its own, and no
 * document/history state. The highlight is derived presentation only: the
 * camera remains the single source of truth.
 */
export type EditorOrientationGizmoState = {
	/** True once the projector has published a usable camera/controls pair. */
	ready: boolean;
	camera: PerspectiveCamera | null;
	controls: ThreeOrbitControls | null;
	snapshot: OrientationProjectionSnapshot | null;
	/** Nearest cardinal face the camera looks from, or null before the first frame. */
	face: CardinalView | null;
};

export const editorOrientationGizmo = $state<EditorOrientationGizmoState>({
	ready: false,
	camera: null,
	controls: null,
	snapshot: null,
	face: null
});

/**
 * Pure — nearest cardinal face of an eye→target direction. The dominant axis
 * wins; ties break toward X, then Y (stable and deterministic). This is the
 * presentation mapping the widget uses to highlight the face the camera is
 * currently closest to.
 */
export function deriveCardinalFace(direction: {
	x: number;
	y: number;
	z: number;
}): CardinalView {
	const ax = Math.abs(direction.x);
	const ay = Math.abs(direction.y);
	const az = Math.abs(direction.z);
	if (ax >= ay && ax >= az) return direction.x >= 0 ? '+X' : '-X';
	if (ay >= az) return direction.y >= 0 ? '+Y' : '-Y';
	return direction.z >= 0 ? '+Z' : '-Z';
}
