import type { EditorViewMode } from './editor-view-mode';

/**
 * peer editor domains (P1.1 shell inversion — §A). Scene and camera stop being
 * 3D sub-contexts and become top-level peer domains over one shared
 * `Plan | 3D` view axis.
 */
export type EditorDomain = 'scene' | 'camera';

/**
 * top-level shell view state (the domain×view matrix).
 *
 * Owner decision 2026-08-21 (P1.7 follow-up): the Plan|3D view is **shared**
 * across domains — switching `Scene ↔ Camera` keeps the current view, and a
 * `Plan ↔ 3D` switch applies to both domains. The viewport never snaps
 * between Plan and 3D on a domain change. This is a pure state holder: the
 * shell maps these onto the legacy store's `currentWorkspace` +
 * `layoutInteraction.viewMode`, and applies the store's interaction/transaction
 * guards at the call site (the setters here only enforce the no-op-on-same-value
 * rule).
 */
export class EditorViewState {
	// Owner-amended boot state: Scene domain in Plan (was per-domain memory:
	// scene → Plan, camera → 3D).
	domain = $state<EditorDomain>('scene');
	view = $state<EditorViewMode>('plan');

	/** the shared view — the only user-facing view switch. */
	get activeView(): EditorViewMode {
		return this.view;
	}

	setDomain(domain: EditorDomain): boolean {
		if (domain === this.domain) return false;
		this.domain = domain;
		return true;
	}

	/**
	 * Set the shared view. The `domain` argument is retained for call-site
	 * compatibility (the segmented control passes the active domain) but no
	 * longer scopes the write — both domains share one view.
	 */
	setView(_domain: EditorDomain, mode: EditorViewMode): boolean {
		if (mode === this.view) return false;
		this.view = mode;
		return true;
	}
}
