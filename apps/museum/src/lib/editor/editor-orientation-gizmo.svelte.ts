import type { PerspectiveCamera } from 'three';
import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
};

export const editorOrientationGizmo = $state<EditorOrientationGizmoState>({
	ready: false,
	camera: null,
	controls: null,
	snapshot: null
});
