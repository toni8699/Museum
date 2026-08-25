import type { PerspectiveCamera } from 'three';
import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { consumeEditorOrbitInertia, type EditorOrbitControlsLike } from './camera/editor-camera';
import type { CardinalSnapMotion } from '../museum/navigation/camera-motion';
import type { CardinalView } from './camera/editor-camera';
import type { OrientationProjectionSnapshot } from './editor-orientation-projection';
import type { OrientationSnapStartPose } from './editor-orientation-interaction';

/**
 * P3B.2 — Scene 3D orientation box shared state (writer/overlay split, same
 * pattern as `editor-camera-labels.svelte.ts`).
 *
 * The canvas-side `EditorOrientationGizmoProjector` publishes the active
 * viewport camera + OrbitControls refs plus an immutable camera-projected
 * geometry snapshot; the DOM overlay (`EditorOrientationGizmo`) reads that
 * state reactively and snaps through the P3B.1/P3B.4 cardinal snap contract.
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

/** An in-flight P3B.4 cardinal snap driven by the projector's frame task. */
export type ActiveOrientationSnap = {
	face: CardinalView;
	motion: CardinalSnapMotion;
	elapsedMs: number;
	/** Last applied sampler pose — the retarget start basis. */
	lastSample: OrientationSnapStartPose | null;
};

/**
 * Non-reactive by design: the projector advances and clears the active flight
 * every frame inside its Canvas task, and the overlay only reads/writes it
 * synchronously on activation or teardown — Svelte reactivity would be pure
 * overhead (the rotating cube already derives from the camera via snapshots).
 * The motion itself comes from `createEditorCardinalSnapMotion` in the single
 * camera-motion authority; this holder stores no trajectory of its own.
 */
export const editorOrientationSnapRuntime: { active: ActiveOrientationSnap | null } = {
	active: null
};

/**
 * P3B.4 — cancel an in-flight snap with a **non-terminal OrbitControls
 * handoff**.
 *
 * A mid-flight camera carries an interpolated `camera.up` (e.g. halfway
 * between global +Y and the +Y cardinal's `(0, 0, -1)` roll reference).
 * OrbitControls caches its orbit-basis quaternion from `camera.up` at
 * construction, but each `update()` still calls `lookAt` with the live
 * `camera.up`. Clearing the runtime alone would therefore leak the tilted
 * lookAt/up reference into manual orbit, context switches, preview takeover,
 * and teardown — a visible roll pop. This keeps the current eye/target (no
 * landing), restores the canonical global +Y up reference, drains damped
 * residue against the normalized pose, and re-derives orientation
 * deterministically through the same lookAt epsilon guard the instant
 * commit's handoff uses.
 *
 * No-op when no flight is active; with refs unavailable it degrades to a raw
 * clear (nothing to normalize). Retargeting must NOT call this — it replaces
 * the flight from the last applied sample while the interpolated up is still
 * legitimate.
 */
export function cancelEditorOrientationSnap(
	camera: PerspectiveCamera | null,
	controls: EditorOrbitControlsLike | null
): void {
	if (!editorOrientationSnapRuntime.active) return;
	editorOrientationSnapRuntime.active = null;
	if (!camera || !controls) return;
	camera.up.set(0, 1, 0);
	consumeEditorOrbitInertia(controls);
	camera.up.set(0, 1, 0);
	camera.updateMatrixWorld(true);
}
