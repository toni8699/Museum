import { describe, expect, expectTypeOf, it } from 'vitest';

import { createMuseumEditorStore, type MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	EditorActiveSelectionStore,
	deriveActiveSelection,
	isWorkspaceSelectionActionable,
	type ActiveEditorSelection
} from '$lib/editor/h1/active-editor-selection.svelte';
import {
	clearLayoutSelection,
	createLayoutInteractionState,
	selectLayoutRoom,
	type LayoutInteractionState,
	type LayoutSelection
} from '$lib/editor/layout/layout-interaction';
import type {
	NavigationSelection,
	WorkspaceSelection
} from '$lib/editor/museum-editor.types';
import { cloneFixtureDocumentWithEntityCount } from '../editor-test-utils';

/**
 * H1 S3 — one active selection domain at the composition root.
 *
 * Wires the `onSelectionActivate` seam exactly like `H1EditorApp` does: the
 * store fires it on actionable scene/camera picks, and the callback clears the
 * shell-owned layout selection. The `EditorActiveSelectionStore` wraps the same
 * store + `LayoutInteractionState`.
 */
function wired(): {
	store: MuseumEditorStore;
	layoutInteraction: LayoutInteractionState;
	activeSelection: EditorActiveSelectionStore;
} {
	const layoutInteraction = createLayoutInteractionState();
	const store = createMuseumEditorStore({
		document: cloneFixtureDocumentWithEntityCount(3),
		onSelectionActivate: () => clearLayoutSelection(layoutInteraction)
	});
	const activeSelection = new EditorActiveSelectionStore(
		store,
		layoutInteraction,
		() => clearLayoutSelection(layoutInteraction)
	);
	return { store, layoutInteraction, activeSelection };
}

describe('H1 S3 — deriveActiveSelection', () => {
	const placement: WorkspaceSelection = {
		kind: 'placement',
		ids: ['a'],
		clusterId: null,
		roomId: 'paris'
	};
	const cluster: WorkspaceSelection = { kind: 'cluster', clusterId: 'c', roomId: 'paris' };
	const connection: NavigationSelection = {
		kind: 'connection',
		connectionId: 'conn-a',
		direction: 'forward'
	};
	const room: LayoutSelection = { kind: 'room', roomId: 'room-a' };

	it('maps each slot to its one domain', () => {
		expect(
			deriveActiveSelection({ kind: 'none' }, { kind: 'none' }, { kind: 'none' })
		).toEqual({ domain: 'none' });
		// Room-only placement is *context, not actionable*.
		expect(
			deriveActiveSelection(
				{ kind: 'placement', ids: [], clusterId: null, roomId: 'paris' },
				{ kind: 'none' },
				{ kind: 'none' }
			)
		).toEqual({ domain: 'none' });
		expect(deriveActiveSelection(placement, { kind: 'none' }, { kind: 'none' })).toEqual({
			domain: 'scene',
			selection: placement
		});
		expect(deriveActiveSelection(cluster, { kind: 'none' }, { kind: 'none' })).toEqual({
			domain: 'scene',
			selection: cluster
		});
		expect(deriveActiveSelection({ kind: 'none' }, connection, { kind: 'none' })).toEqual({
			domain: 'camera',
			selection: connection
		});
		expect(deriveActiveSelection({ kind: 'none' }, { kind: 'none' }, room)).toEqual({
			domain: 'layout',
			selection: room
		});
	});

	it('resolves legacy multi-actionable states by priority layout > scene > camera', () => {
		expect(deriveActiveSelection(placement, connection, room)).toEqual({
			domain: 'layout',
			selection: room
		});
		expect(deriveActiveSelection(placement, connection, { kind: 'none' })).toEqual({
			domain: 'scene',
			selection: placement
		});
		expect(deriveActiveSelection({ kind: 'none' }, connection, { kind: 'none' })).toEqual({
			domain: 'camera',
			selection: connection
		});
	});

	it('isWorkspaceSelectionActionable treats room-only placement as latent', () => {
		expect(isWorkspaceSelectionActionable({ kind: 'none' })).toBe(false);
		expect(
			isWorkspaceSelectionActionable({ kind: 'placement', ids: [], clusterId: null, roomId: 'paris' })
		).toBe(false);
		expect(isWorkspaceSelectionActionable(placement)).toBe(true);
		expect(isWorkspaceSelectionActionable(cluster)).toBe(true);
	});

	it('pins the ActiveEditorSelection union shape', () => {
		expectTypeOf<ActiveEditorSelection>().toEqualTypeOf<
			| { domain: 'none' }
			| { domain: 'layout'; selection: LayoutSelection }
			| { domain: 'scene'; selection: WorkspaceSelection }
			| { domain: 'camera'; selection: NavigationSelection }
		>();
	});
});

describe('H1 S3 — onSelectionActivate seam', () => {
	it('fires only for actionable picks; deselect and room-only never fire', () => {
		const fired: string[] = [];
		const store = createMuseumEditorStore({
			document: cloneFixtureDocumentWithEntityCount(3),
			onSelectionActivate: () => fired.push('activate')
		});
		const entityId = store.document.entities[0]!.id;
		const nodeId = store.document.navigationNodes[0]!.id;

		// Room-only latent mode: no fire.
		expect(store.selectionActions.selectRoom('paris')).toBe(true);
		expect(fired).toEqual([]);

		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(fired).toEqual(['activate']);

		expect(store.selectionActions.selectNavigationNode(nodeId)).toBe(true);
		expect(fired).toEqual(['activate', 'activate']);

		store.selectionActions.deselect();
		expect(fired).toEqual(['activate', 'activate']);
	});

	it('defaults to a no-op so the frozen relic is untouched', () => {
		const store = createMuseumEditorStore({ document: cloneFixtureDocumentWithEntityCount(1) });
		const entityId = store.document.entities[0]!.id;
		expect(() => store.selectionActions.selectPlacement(entityId)).not.toThrow();
		expect(store.selectedPlacementIds).toEqual([entityId]);
	});
});

describe('H1 S3 — EditorActiveSelectionStore exclusivity', () => {
	it('an actionable scene pick clears a surviving layout selection', () => {
		const { store, layoutInteraction, activeSelection } = wired();
		// A layout selection survives the Plan → 3D view switch.
		selectLayoutRoom(layoutInteraction, 'room-a');
		expect(activeSelection.active).toEqual({
			domain: 'layout',
			selection: { kind: 'room', roomId: 'room-a' }
		});

		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
		expect(activeSelection.active.domain).toBe('scene');
	});

	it('a camera pick clears a surviving layout selection', () => {
		const { store, layoutInteraction, activeSelection } = wired();
		selectLayoutRoom(layoutInteraction, 'room-a');

		const nodeId = store.document.navigationNodes[0]!.id;
		expect(store.selectionActions.selectNavigationNode(nodeId)).toBe(true);
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
		expect(activeSelection.active.domain).toBe('camera');
	});

	it('activating the layout domain detaches scene and camera picks', () => {
		const { store, layoutInteraction, activeSelection } = wired();
		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(store.selectionActions.selectNavigationNode(store.document.navigationNodes[0]!.id)).toBe(true);
		// The nav pick demoted the workspace pick to room-only (reducer invariant).
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.navigationSelection).not.toBeNull();

		// A Plan pick activates the layout domain (the shell $effect calls this).
		selectLayoutRoom(layoutInteraction, 'room-a');
		activeSelection.onLayoutSelectionChanged();

		expect(store.navigationSelection).toBeNull();
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.selectedRoomId).toBe('paris'); // room context kept
		expect(activeSelection.active).toEqual({
			domain: 'layout',
			selection: { kind: 'room', roomId: 'room-a' }
		});
	});

	it('onLayoutSelectionChanged no-ops while the layout selection is none', () => {
		const { store, activeSelection } = wired();
		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		activeSelection.onLayoutSelectionChanged();
		// Clearing the layout selection must never clear the scene pick.
		expect(store.selectedPlacementIds).toEqual([entityId]);
	});

	it('onLayoutSelectionChanged is idempotent — no fresh workspace write once detached (S4 freeze regression)', () => {
		// The shell effect calls this on every layout-selection change, and it
		// reads `selection.workspace` reactively (through `selectedRoomId`). An
		// unconditional setWorkspace of a new object makes the effect re-run
		// forever (Svelte `effect_update_depth_exceeded` = the reported Plan
		// freeze on room/wall/opening picks). After the first detach, a second
		// call must not write a new workspace object at all.
		const { store, layoutInteraction, activeSelection } = wired();
		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		selectLayoutRoom(layoutInteraction, 'room-a');

		activeSelection.onLayoutSelectionChanged();
		const workspaceAfterFirst = store.selection.workspace;
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.selectedRoomId).toBe('paris');

		activeSelection.onLayoutSelectionChanged();
		expect(store.selection.workspace).toBe(workspaceAfterFirst);
		expect(store.selectedPlacementIds).toEqual([]);
	});
});

describe('H1 S3 — deselectActive', () => {
	it('no-ops on domain none', () => {
		const { activeSelection } = wired();
		expect(activeSelection.deselectActive()).toBe(false);
	});

	it('clears only the active domain; scene deselect keeps room context as today', () => {
		const { store, layoutInteraction, activeSelection } = wired();

		const entityId = store.document.entities[0]!.id;
		store.selectionActions.selectPlacement(entityId);
		expect(activeSelection.deselectActive()).toBe(true);
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.selectedRoomId).toBe('paris');
		expect(activeSelection.active.domain).toBe('none');

		selectLayoutRoom(layoutInteraction, 'room-a');
		expect(activeSelection.deselectActive()).toBe(true);
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
	});

	it('inherits per-domain guards: scene blocked during preview, layout clears anyway', () => {
		const { store, layoutInteraction, activeSelection } = wired();
		const entityId = store.document.entities[0]!.id;

		// Scene branch inherits deselect()'s isDocumentMutationBlocked guard.
		// previewGuidedTour starts a *playing* tour preview without touching
		// the selection slots, so the scene pick stays active while blocked.
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(store.previewGuidedTour()).toBe(true);
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(activeSelection.deselectActive()).toBe(false);
		expect(store.selectedPlacementIds).toEqual([entityId]);
		store.stopCameraPreview();

		// Layout branch is unguarded — pinned as intentional asymmetry.
		selectLayoutRoom(layoutInteraction, 'room-a');
		expect(store.previewGuidedTour()).toBe(true);
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(activeSelection.deselectActive()).toBe(true);
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
		store.stopCameraPreview();
	});
});

describe('H1 S3 — construction-time convergence', () => {
	it('keeps the layout domain and clears the surplus slots (layout > scene > camera)', () => {
		const layoutInteraction = createLayoutInteractionState();
		const store = createMuseumEditorStore({
			document: cloneFixtureDocumentWithEntityCount(3)
		});
		const entityId = store.document.entities[0]!.id;
		const nodeId = store.document.navigationNodes[0]!.id;
		// Build a legacy multi-actionable state directly on the slots (no hook
		// wired — the wrapper owns the convergence).
		store.selection.setWorkspace({
			kind: 'placement',
			ids: [entityId],
			clusterId: null,
			roomId: 'paris'
		});
		store.selection.setNavigation({ kind: 'node', nodeId, handle: 'position' });
		layoutInteraction.selection = { kind: 'room', roomId: 'room-a' };

		const activeSelection = new EditorActiveSelectionStore(
			store,
			layoutInteraction,
			() => clearLayoutSelection(layoutInteraction)
		);

		expect(activeSelection.active).toEqual({
			domain: 'layout',
			selection: { kind: 'room', roomId: 'room-a' }
		});
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.navigationSelection).toBeNull();
		expect(layoutInteraction.selection).toEqual({ kind: 'room', roomId: 'room-a' });
	});

	it('keeps the scene domain when layout is not actionable (scene > camera)', () => {
		const layoutInteraction = createLayoutInteractionState();
		const store = createMuseumEditorStore({
			document: cloneFixtureDocumentWithEntityCount(3)
		});
		const entityId = store.document.entities[0]!.id;
		const nodeId = store.document.navigationNodes[0]!.id;
		// The reducer normally prevents scene+camera coexistence (a nav pick
		// demotes the workspace pick), so this legacy state can only be built by
		// direct field writes — exactly the defensive case the convergence
		// exists for.
		store.selection.workspace = {
			kind: 'placement',
			ids: [entityId],
			clusterId: null,
			roomId: 'paris'
		};
		store.selection.navigation = { kind: 'node', nodeId, handle: 'position' };

		const activeSelection = new EditorActiveSelectionStore(
			store,
			layoutInteraction,
			() => clearLayoutSelection(layoutInteraction)
		);

		expect(activeSelection.active.domain).toBe('scene');
		expect(store.selectedPlacementIds).toEqual([entityId]);
		expect(store.navigationSelection).toBeNull();
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
	});

	it('leaves a single actionable domain untouched', () => {
		const layoutInteraction = createLayoutInteractionState();
		const store = createMuseumEditorStore({
			document: cloneFixtureDocumentWithEntityCount(3)
		});
		const entityId = store.document.entities[0]!.id;
		store.selection.setWorkspace({
			kind: 'placement',
			ids: [entityId],
			clusterId: null,
			roomId: 'paris'
		});

		const activeSelection = new EditorActiveSelectionStore(
			store,
			layoutInteraction,
			() => clearLayoutSelection(layoutInteraction)
		);

		expect(activeSelection.active.domain).toBe('scene');
		expect(store.selectedPlacementIds).toEqual([entityId]);
		expect(store.navigationSelection).toBeNull();
	});
});

describe('H1 S3 — reset() and view-switch preservation', () => {
	it('reset clears all three slots explicitly to none', () => {
		const { store, layoutInteraction, activeSelection } = wired();
		const entityId = store.document.entities[0]!.id;
		store.selectionActions.selectPlacement(entityId);
		store.selectionActions.selectNavigationNode(store.document.navigationNodes[0]!.id);
		// Re-arm the layout slot after the camera pick cleared it via the hook.
		selectLayoutRoom(layoutInteraction, 'room-a');

		activeSelection.reset();

		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.selectedRoomId).toBeNull();
		expect(store.navigationSelection).toBeNull();
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
		expect(activeSelection.active).toEqual({ domain: 'none' });
	});

	it('a layout selection survives into 3D (view switch never touches the slots)', () => {
		const { store, layoutInteraction, activeSelection } = wired();
		selectLayoutRoom(layoutInteraction, 'room-a');

		// The S1 contract: switching the workspace preserves selection state.
		expect(store.setWorkspace('layout')).toBe(true);
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.setWorkspace('scene')).toBe(true);

		expect(activeSelection.active).toEqual({
			domain: 'layout',
			selection: { kind: 'room', roomId: 'room-a' }
		});
	});
});
