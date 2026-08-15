/**
 * H1 S3 — one active selection domain at the editor composition root.
 *
 * The editor keeps three parallel selection slots with their own types and
 * owners: `EditorSelectionStore.workspace` (scene placement/cluster),
 * `EditorSelectionStore.navigation` (camera), and `LayoutInteractionState
 * .selection` (Plan layout). The workspace/nav pair already cross-clears inside
 * the reducer; the missing boundary is `layout ↔ (scene | camera)`. This module
 * owns that boundary:
 *
 * - `deriveActiveSelection` — pure mapping from the three slots to exactly one
 *   domain (`layout` | `scene` | `camera` | `none`). Room-only placement is
 *   *context, not actionable* and never counts as an active domain. For legacy
 *   multi-actionable states the priority is deterministic: layout > scene >
 *   camera.
 * - `EditorActiveSelectionStore` — composition-root facade exposing `active`
 *   (derived), `deselectActive()` (clears whichever domain is active), and
 *   `reset()` (clears all three slots explicitly for import/reset).
 *
 * Activation itself stays in the source stores: `EditorSelectionStore` fires
 * the `onSelectionActivate` hook (wired through `createMuseumEditorStore`
 * options) on actionable scene/camera picks, and the H1 shell clears the
 * scene/camera slots when `layoutInteraction.selection` becomes actionable.
 * This module therefore adapts the stores without merging their types, and the
 * machinery stays domain-generic so the post-H1 Plan staging mode (C1) can
 * route Plan scene-activation through it without rework.
 */

import { clearLayoutSelection, type LayoutInteractionState, type LayoutSelection } from '../layout/layout-interaction';
import type { NavigationSelection, WorkspaceSelection } from '../museum-editor.types';
import type { MuseumEditorStore } from '../museum-editor.svelte';

/** Context key so H1 children (S4 hierarchy, S6 selection, S7 gizmo) can read `active`. */
export const ACTIVE_EDITOR_SELECTION_KEY = Symbol('active-editor-selection');

export type ActiveEditorSelection =
	| { domain: 'none' }
	| { domain: 'layout'; selection: LayoutSelection }
	| { domain: 'scene'; selection: WorkspaceSelection }
	| { domain: 'camera'; selection: NavigationSelection };

/** Scene placement/cluster picks that count as *actionable* (room-only is latent context). */
export function isWorkspaceSelectionActionable(workspace: WorkspaceSelection): boolean {
	return (
		workspace.kind === 'cluster' ||
		(workspace.kind === 'placement' && workspace.ids.length > 0)
	);
}

/**
 * Pure mapping from the three source slots to the one active domain.
 * Deterministic priority for (legacy) multi-actionable states: layout > scene >
 * camera, then `none`.
 */
export function deriveActiveSelection(
	workspace: WorkspaceSelection,
	navigation: NavigationSelection,
	layoutSelection: LayoutSelection
): ActiveEditorSelection {
	if (layoutSelection.kind !== 'none') {
		return { domain: 'layout', selection: layoutSelection };
	}
	if (isWorkspaceSelectionActionable(workspace)) {
		return { domain: 'scene', selection: workspace };
	}
	if (navigation.kind !== 'none') {
		return { domain: 'camera', selection: navigation };
	}
	return { domain: 'none' };
}

export class EditorActiveSelectionStore {
	readonly #store: MuseumEditorStore;
	readonly #layoutInteraction: LayoutInteractionState;
	readonly #clearLayoutSelection: () => void;

	constructor(
		store: MuseumEditorStore,
		layoutInteraction: LayoutInteractionState,
		clearLayoutSelectionCallback: () => void
	) {
		this.#store = store;
		this.#layoutInteraction = layoutInteraction;
		this.#clearLayoutSelection = clearLayoutSelectionCallback;
		// H1 S3 — construction-time convergence: H1 boot is all-empty (the
		// activation hooks enforce exclusivity from the first pick), but a future
		// consumer may construct the wrapper over a legacy multi-actionable
		// state. Keep the highest-priority domain and clear the surplus slots so
		// the derived read and the slots agree.
		this.#convergeLegacyState();
	}

	#convergeLegacyState(): void {
		const workspace = this.#store.selection.workspace;
		const navigation = this.#store.selection.navigation;
		const layoutSelection = this.#layoutInteraction.selection;
		const actionableCount =
			(layoutSelection.kind !== 'none' ? 1 : 0) +
			(isWorkspaceSelectionActionable(workspace) ? 1 : 0) +
			(navigation.kind !== 'none' ? 1 : 0);
		// Priority layout > scene > camera. Camera can never win here: with
		// layout and workspace both non-actionable, a camera pick is the only
		// actionable domain (count 1) and we return above.
		if (actionableCount <= 1) return;
		if (layoutSelection.kind !== 'none') {
			this.#store.selection.setWorkspace({ kind: 'none' });
			this.#store.selection.setNavigation({ kind: 'none' });
		} else {
			this.#clearLayoutSelection();
			this.#store.selection.setNavigation({ kind: 'none' });
		}
	}

	/** Exactly one active domain, derived from the three untouched source slots. */
	active = $derived.by<ActiveEditorSelection>(() =>
		deriveActiveSelection(
			this.#store.selection.workspace,
			this.#store.selection.navigation,
			this.#layoutInteraction.selection
		)
	);

	/**
	 * Clear whichever domain is currently active. Scene/camera route through
	 * `selectionActions.deselect()` (keeps its `isDocumentMutationBlocked ||
	 * isEditorInteractionActive` guard); layout routes through
	 * `clearLayoutSelection` (unguarded, and it cancels any in-flight room
	 * edit). Guard parity is inherited per domain, intentionally.
	 */
	deselectActive(): boolean {
		const active = this.active;
		if (active.domain === 'none') return false;
		if (active.domain === 'layout') {
			this.#clearLayoutSelection();
			return true;
		}
		return this.#store.selectionActions.deselect();
	}

	/**
	 * Clear all three slots explicitly — used after import/reset so the boot
	 * document begins with no active selection anywhere. Not the
	 * room-context-preserving `clearPlacementSelection()`: reset means reset.
	 * Note: the writes here are non-actionable, so they never re-fire the
	 * `onSelectionActivate` hook (no feedback loop).
	 */
	reset(): void {
		this.#clearLayoutSelection();
		this.#store.selection.setWorkspace({ kind: 'none' });
		this.#store.selection.setNavigation({ kind: 'none' });
	}

	/**
	 * H1 S3 — the shell's layout-activation hook: when a Plan pick makes the
	 * layout selection actionable, detach any actionable scene/camera pick.
	 * `clearPlacementSelection` keeps the room context and `setNavigation({kind:
	 * 'none'})` is non-actionable, so the store hook never fires and this
	 * cannot loop. Testable independently of the shell `$effect`.
	 */
	onLayoutSelectionChanged(): void {
		if (this.#layoutInteraction.selection.kind === 'none') return;
		this.#store.selectionActions.clearPlacementSelection();
		this.#store.selection.setNavigation({ kind: 'none' });
	}
}

