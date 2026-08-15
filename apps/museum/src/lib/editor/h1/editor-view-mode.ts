/**
 * H1 top-level editor view.
 *
 * `plan` is the 2D SVG drafting surface. `3d` is the unified Threlte canvas
 * that hosts generated architecture, scene entities, and the camera context —
 * scene and camera are contexts *inside* `3d`, not top-level views.
 *
 * Pinned by S0; the shell state that owns this value lands in S1.
 */
export type EditorViewMode = 'plan' | '3d';
