import type { EditorViewMode } from './editor-view-mode';

/**
 * 3D sub-contexts. Scene and camera stop being top-level workspaces and
 * become tool/panel contexts *inside* the one 3D view. The drafted layout
 * architecture renders in 3D unconditionally (via `LayoutPreviewScene`), so
 * there is no separate "layout" context — "Layout" is the top-level Plan view.
 */
export type Editor3dContext = 'scene' | 'camera';

/**
 * top-level shell view state.
 *
 * `viewMode` is the only user-facing top-level switch — `Plan | 3D`. `3d`
 * hosts scene and camera as session-only tool/panel contexts. This is a pure
 * state holder: the shell maps these onto the legacy store's
 * `currentWorkspace` + `layoutInteraction.viewMode`, and applies the store's
 * interaction/transaction guards at the call site (the setters here only
 * enforce the no-op-on-same-value rule).
 */
export class EditorViewState {
	// the editor boots into the empty Plan canvas.
	viewMode = $state<EditorViewMode>('plan');
	active3dContext = $state<Editor3dContext>('scene');

	setViewMode(mode: EditorViewMode): boolean {
		if (mode === this.viewMode) return false;
		this.viewMode = mode;
		return true;
	}

	set3dContext(context: Editor3dContext): boolean {
		if (context === this.active3dContext) return false;
		this.active3dContext = context;
		return true;
	}
}
