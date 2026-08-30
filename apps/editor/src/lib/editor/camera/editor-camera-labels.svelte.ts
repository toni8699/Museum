/**
 * P1.7 — Camera 3D node-label shared state (shell spec "Viewport MUST show").
 *
 * The canvas-side `EditorCameraLabelProjector` projects each navigation
 * node's world position into CSS-pixel viewport coordinates every frame and
 * writes them here; the HTML overlay (`EditorCameraLabelsOverlay`) reads the
 * state reactively. Same writer/overlay split as the orientation gizmo.
 * Purely display: nothing here intercepts pointer events or raycasts.
 */

export type CameraNodeLabelScreen = {
	nodeId: string;
	/** CSS-pixel position within the 3D viewport (x right, y down). */
	x: number;
	y: number;
	/** True when the node is behind the camera or off-screen — skip rendering. */
	occluded: boolean;
	/** 1-based main-flow order, or null when off the main flow. */
	order: number | null;
	unsequenced: boolean;
};

export const editorCameraLabels = $state<{
	ready: boolean;
	labels: CameraNodeLabelScreen[];
}>({
	ready: false,
	labels: []
});
