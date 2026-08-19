import type { EditorViewMode } from './editor-view-mode';

/**
 * peer editor domains (P1.1 shell inversion — §A). Scene and camera stop being
 * 3D sub-contexts and become top-level peer domains, each owning a `Plan | 3D`
 * view pair in fixed `[Plan | 3D]` order.
 */
export type EditorDomain = 'scene' | 'camera';

/**
 * top-level shell view state (the domain×view matrix).
 *
 * `domain` is the primary, always-visible switcher (`Scene | Camera`); each
 * domain owns one view memory (`sceneView` / `cameraView`), so a Plan ↔ 3D
 * switch never leaks across domains. `activeView` is the current domain's
 * view. This is a pure state holder: the shell maps these onto the legacy
 * store's `currentWorkspace` + `layoutInteraction.viewMode`, and applies the
 * store's interaction/transaction guards at the call site (the setters here
 * only enforce the no-op-on-same-value rule).
 */
export class EditorViewState {
	// boot defaults per §A: scene domain, scene view Plan, camera view 3D.
	domain = $state<EditorDomain>('scene');
	sceneView = $state<EditorViewMode>('plan');
	cameraView = $state<EditorViewMode>('3d');

	/** the current domain's view — the only user-facing view switch. */
	activeView = $derived.by<EditorViewMode>(() =>
		this.domain === 'scene' ? this.sceneView : this.cameraView
	);

	setDomain(domain: EditorDomain): boolean {
		if (domain === this.domain) return false;
		this.domain = domain;
		return true;
	}

	setView(domain: EditorDomain, mode: EditorViewMode): boolean {
		if (domain === 'scene') {
			if (mode === this.sceneView) return false;
			this.sceneView = mode;
		} else {
			if (mode === this.cameraView) return false;
			this.cameraView = mode;
		}
		return true;
	}
}
