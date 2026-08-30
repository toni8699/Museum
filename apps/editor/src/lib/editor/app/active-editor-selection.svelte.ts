/**
 * One active selection domain at the editor composition root.
 *
 * The editor keeps three parallel selection slots with their own types and
 * owners: `EditorSelectionStore.workspace` (scene placement/cluster),
 * `EditorSelectionStore.navigation` (camera), and `LayoutInteractionState
 * .selection` (Plan layout). The workspace/nav pair already cross-clears inside
 * the reducer; the missing boundary is `layout ↔ (scene | camera)`. This module
 * owns that boundary:
 *
 * - `deriveActiveSelection` — pure mapping from the current **domain** + the
 *   three slots to exactly one domain (`layout` | `scene` | `camera` | `none`).
 *   P1.1 (shell inversion, §A) made the mapping **domain-gated**: the camera
 *   domain reads only the navigation slot (scene/layout slots are memory,
 *   never active there); the scene domain reads layout > scene and ignores the
 *   navigation slot. Room-only placement is *context, not actionable* and
 *   never counts as an active domain.
 * - `EditorActiveSelectionStore` — composition-root facade exposing `active`
 *   (derived through the domain gate), `deselectActive()` (clears whichever
 *   domain is active), and `reset()` (clears all three slots explicitly for
 *   import/reset). The shell constructs `EditorViewState` **before** this
 *   store so the gate can read `domain`.
 *
 * Activation itself stays in the source stores: `EditorSelectionStore` fires
 * the `onSelectionActivate` hook (wired through `createEditorStore`
 * options) on actionable scene/camera picks, and the editor shell clears the
 * scene slot when `layoutInteraction.selection` becomes actionable. This module
 * therefore adapts the stores without merging their types, and the machinery
 * stays domain-generic so the P2 Plan staging mode can route Plan
 * scene-activation through it without rework.
 */

import {
	clearLayoutSelection,
	type ArrangeOwner,
	type LayoutInteractionState,
	type LayoutSelection,
	type PlanViewMode
} from '../layout/layout-interaction';
import type { NavigationSelection, WorkspaceSelection } from '../editor-types';
import type { EditorStore } from '../editor-store.svelte';
import type { EditorViewState } from './editor-view-state.svelte';

/** Context key so editor children (hierarchy, selection, gizmo) can read `active`. */
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
 * Pure mapping from the current domain + the three source slots to the one
 * active domain (P1.1 domain gate, §A.1 §4):
 *
 * - **camera** domain → navigation slot if non-none, else `none` (scene/layout
 *   slots are memory, never active).
 * - **scene** domain → Layout Plan keeps layout > scene priority; Staging Plan
 *   gives authority to the Scene placement slot. The navigation slot stays
 *   memory while Scene is active.
 *
 * View switches never change the result (the slots are untouched); domain
 * switches re-gate which slot is active.
 */
export function deriveActiveSelection(
	domain: 'scene' | 'camera',
	workspace: WorkspaceSelection,
	navigation: NavigationSelection,
	layoutSelection: LayoutSelection,
	planViewMode: PlanViewMode = 'layout',
	arrangeOwner: ArrangeOwner = null
): ActiveEditorSelection {
	if (domain === 'camera') {
		if (navigation.kind !== 'none') {
			return { domain: 'camera', selection: navigation };
		}
		return { domain: 'none' };
	}
	// P10 — Arrange (staging) is owner-aware: an eligible Layout-object slot
	// activates the layout domain, an actionable Scene slot activates scene.
	// Structural layout selections (room/wall/opening) stay memory here, and
	// the remembered owner never falls back to the other slot.
	if (planViewMode === 'staging') {
		if (arrangeOwner === 'layout-object') {
			return layoutSelection.kind === 'object'
				? { domain: 'layout', selection: layoutSelection }
				: { domain: 'none' };
		}
		if (arrangeOwner === 'scene') {
			return isWorkspaceSelectionActionable(workspace)
				? { domain: 'scene', selection: workspace }
				: { domain: 'none' };
		}
		if (layoutSelection.kind === 'object') {
			return { domain: 'layout', selection: layoutSelection };
		}
		return isWorkspaceSelectionActionable(workspace)
			? { domain: 'scene', selection: workspace }
			: { domain: 'none' };
	}
	if (layoutSelection.kind !== 'none') {
		return { domain: 'layout', selection: layoutSelection };
	}
	if (isWorkspaceSelectionActionable(workspace)) {
		return { domain: 'scene', selection: workspace };
	}
	return { domain: 'none' };
}

export class EditorActiveSelectionStore {
	readonly #store: EditorStore;
	readonly #layoutInteraction: LayoutInteractionState;
	readonly #viewState: EditorViewState;
	readonly #clearLayoutSelection: () => void;

	constructor(
		store: EditorStore,
		layoutInteraction: LayoutInteractionState,
		viewState: EditorViewState,
		clearLayoutSelectionCallback: () => void
	) {
		this.#store = store;
		this.#layoutInteraction = layoutInteraction;
		this.#viewState = viewState;
		this.#clearLayoutSelection = clearLayoutSelectionCallback;
	}

	/** Exactly one active domain, derived through the domain gate from the untouched source slots. */
	active = $derived.by<ActiveEditorSelection>(() =>
		deriveActiveSelection(
			this.#viewState.domain,
			this.#store.selection.workspace,
			this.#store.selection.navigation,
			this.#layoutInteraction.selection,
			this.#viewState.activeView === 'plan' ? this.#layoutInteraction.planViewMode : 'layout',
			this.#layoutInteraction.arrangeOwner
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

	/** Clear Scene placement selection only; Layout and Camera memories survive. */
	deselectSceneSelection(): boolean {
		if (this.#viewState.domain !== 'scene' || !isWorkspaceSelectionActionable(this.#store.selection.workspace)) {
			return false;
		}
		this.#store.selectionActions.clearPlacementSelection();
		return true;
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
	 * the shell's layout-activation hook: when a Plan pick makes the
	 * layout selection actionable, detach any actionable scene pick.
	 * `clearPlacementSelection` keeps the room context and `setNavigation({kind:
	 * 'none'})` is non-actionable, so the store hook never fires and this
	 * cannot loop. Testable independently of the shell `$effect`.
	 *
	 * P1.1 (deliberate change, §A.1 §4): the **navigation slot is no longer
	 * cleared here** — it is camera-domain memory and must survive Scene layout
	 * work (a camera pick made in Camera → 3D stays restorable after a Scene →
	 * Plan drafting session). The legacy reducer's workspace↔navigation
	 * cross-clear stays (out of scope): a *scene* pick still drops a camera
	 * pick and vice versa — documented degradation, not a regression.
	 *
	 * Idempotent by construction (S4 regression): the shell effect calls this
	 * on every layout-selection change, and `selectedRoomId` reads
	 * `selection.workspace` reactively — an unconditional `setWorkspace` write
	 * of a fresh object makes the effect re-run (read → write → re-run),
	 * spinning into Svelte's `effect_update_depth_exceeded` freeze on the
	 * first room/wall/opening pick. The workspace slot is therefore written
	 * only when it actually changes from the detach target.
	 */
	onLayoutSelectionChanged(): void {
		if (this.#layoutInteraction.selection.kind === 'none') return;
		// Both slots are durable memory in Scene Plan. A latent Layout change
		// must not detach the authoritative Scene pick while Staging is active.
		if (
			this.#viewState.domain === 'scene' &&
			this.#viewState.activeView === 'plan' &&
			this.#layoutInteraction.planViewMode === 'staging'
		) return;
		const roomId = this.#store.selectedRoomId;
		const roomOnlyWorkspace: WorkspaceSelection =
			roomId === null
				? { kind: 'none' }
				: { kind: 'placement', ids: [], clusterId: null, roomId };
		const workspace = this.#store.selection.workspace;
		const alreadyDetached =
			workspace.kind === 'none' ||
			(workspace.kind === 'placement' &&
				workspace.ids.length === 0 &&
				workspace.clusterId === null &&
				workspace.roomId === roomId);
		if (!alreadyDetached) {
			this.#store.selection.setWorkspace(roomOnlyWorkspace);
		}
	}
}
