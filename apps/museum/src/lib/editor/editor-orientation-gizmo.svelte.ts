/**
 * S10.1.7 — XYZ orientation gizmo shared state.
 *
 * The canvas-side `EditorOrientationGizmo` writes the orbit camera's world
 * orientation (projected onto screen space) here every frame; the HTML overlay
 * in the 3D shell reads it reactively. The gizmo is a non-interactive
 * indicator: it always shows the *viewed* orientation, never the transform
 * gizmo's space.
 */

export type OrientationAxisScreen = {
	/** Normalized screen-space direction (x right, y down in CSS pixels). */
	x: number;
	y: number;
	/** 0..1 — how edge-on the axis is; near 0 when the axis is nearly parallel to the view. */
	visibility: number;
};

export const editorOrientationGizmo = $state<{
	ready: boolean;
	x: OrientationAxisScreen;
	y: OrientationAxisScreen;
	z: OrientationAxisScreen;
}>({
	ready: false,
	x: { x: 1, y: 0, visibility: 1 },
	y: { x: 0, y: -1, visibility: 1 },
	z: { x: 0, y: 0, visibility: 0 }
});
