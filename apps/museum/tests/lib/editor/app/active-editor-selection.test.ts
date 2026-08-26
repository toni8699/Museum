import { describe, expect, expectTypeOf, it } from 'vitest';

import { chopinRuntime } from '$lib/content/chopin-project';
import { createEditorStore, type EditorStore } from '$lib/editor/editor-store.svelte';
import {
	EditorActiveSelectionStore,
	deriveActiveSelection,
	isWorkspaceSelectionActionable,
	type ActiveEditorSelection
} from '$lib/editor/app/active-editor-selection.svelte';
import { EditorViewState } from '$lib/editor/app/editor-view-state.svelte';
import {
	clearLayoutSelection,
	createLayoutInteractionState,
	setPlanViewMode,
	selectLayoutObject,
	selectLayoutRoom,
	type LayoutInteractionState,
	type LayoutSelection
} from '$lib/editor/layout/layout-interaction';
import type {
	NavigationSelection,
	WorkspaceSelection
} from '$lib/editor/editor-types';
import { cloneFixtureDocumentWithEntityCount } from '../editor-test-utils';

/**
 * one active selection domain at the composition root.
 *
 * Wires the `onSelectionActivate` seam exactly like `EditorApp` does: the
 * store fires it on actionable scene/camera picks, and the callback clears the
 * shell-owned layout selection. The `EditorActiveSelectionStore` wraps the same
 * store + `LayoutInteractionState` + `EditorViewState` (constructed first, as
 * the shell does — the store's domain gate reads `viewState.domain`).
 */
function wired(): {
	store: EditorStore;
	layoutInteraction: LayoutInteractionState;
	viewState: EditorViewState;
	activeSelection: EditorActiveSelectionStore;
} {
	const layoutInteraction = createLayoutInteractionState();
	const viewState = new EditorViewState();
	const store = createEditorStore({
		document: cloneFixtureDocumentWithEntityCount(3),
		rooms: chopinRuntime.rooms,
		onSelectionActivate: (source) => {
			const stagingScenePick =
				source === 'workspace' &&
				viewState.domain === 'scene' &&
				viewState.activeView === 'plan' &&
				layoutInteraction.planViewMode === 'staging';
			if (!stagingScenePick) clearLayoutSelection(layoutInteraction);
		}
	});
	const activeSelection = new EditorActiveSelectionStore(
		store,
		layoutInteraction,
		viewState,
		() => clearLayoutSelection(layoutInteraction)
	);
	return { store, layoutInteraction, viewState, activeSelection };
}

describe('deriveActiveSelection (P1.1 domain gate)', () => {
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

	it('scene domain maps each slot to its one domain; navigation is ignored', () => {
		expect(
			deriveActiveSelection('scene', { kind: 'none' }, { kind: 'none' }, { kind: 'none' })
		).toEqual({ domain: 'none' });
		// Room-only placement is *context, not actionable*.
		expect(
			deriveActiveSelection(
				'scene',
				{ kind: 'placement', ids: [], clusterId: null, roomId: 'paris' },
				{ kind: 'none' },
				{ kind: 'none' }
			)
		).toEqual({ domain: 'none' });
		expect(deriveActiveSelection('scene', placement, { kind: 'none' }, { kind: 'none' })).toEqual({
			domain: 'scene',
			selection: placement
		});
		expect(deriveActiveSelection('scene', cluster, { kind: 'none' }, { kind: 'none' })).toEqual({
			domain: 'scene',
			selection: cluster
		});
		expect(deriveActiveSelection('scene', { kind: 'none' }, connection, { kind: 'none' })).toEqual({
			domain: 'none'
		});
		expect(deriveActiveSelection('scene', { kind: 'none' }, { kind: 'none' }, room)).toEqual({
			domain: 'layout',
			selection: room
		});
	});

	it('scene domain resolves multi-actionable states by layout > scene; navigation slot ignored', () => {
		expect(deriveActiveSelection('scene', placement, connection, room)).toEqual({
			domain: 'layout',
			selection: room
		});
		expect(deriveActiveSelection('scene', placement, connection, { kind: 'none' })).toEqual({
			domain: 'scene',
			selection: placement
		});
	});

	it('Scene Plan staging routes active authority to Scene while preserving Layout memory', () => {
		expect(
			deriveActiveSelection('scene', placement, { kind: 'none' }, room, 'staging')
		).toEqual({ domain: 'scene', selection: placement });
		expect(
			deriveActiveSelection('scene', { kind: 'none' }, { kind: 'none' }, room, 'staging')
		).toEqual({ domain: 'none' });
	});

	it('camera domain reads the navigation slot only; scene/layout slots are memory', () => {
		expect(deriveActiveSelection('camera', { kind: 'none' }, connection, { kind: 'none' })).toEqual({
			domain: 'camera',
			selection: connection
		});
		// camera + layout actionable → camera wins (layout is memory).
		expect(deriveActiveSelection('camera', { kind: 'none' }, connection, room)).toEqual({
			domain: 'camera',
			selection: connection
		});
		// camera + scene actionable → camera wins (scene is memory).
		expect(deriveActiveSelection('camera', placement, connection, { kind: 'none' })).toEqual({
			domain: 'camera',
			selection: connection
		});
		// camera without navigation → none, even with scene/layout actionable.
		expect(deriveActiveSelection('camera', placement, { kind: 'none' }, room)).toEqual({
			domain: 'none'
		});
		expect(deriveActiveSelection('camera', placement, { kind: 'none' }, { kind: 'none' })).toEqual({
			domain: 'none'
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
});	describe('P10 Arrange owner routing', () => {
		const placement: WorkspaceSelection = {
			kind: 'placement',
			ids: ['scene-entity-a'],
			clusterId: null,
			roomId: 'paris'
		};
		const room: LayoutSelection = { kind: 'room', roomId: 'room-a' };

		it('staging + layout-object owner activates an eligible object slot; structural selections never fall back to Scene', () => {
			expect(
				deriveActiveSelection(
					'scene',
					{ kind: 'none' },
					{ kind: 'none' },
					{ kind: 'object', objectId: 'layout-object-1' },
					'staging',
					'layout-object'
				)
			).toEqual({ domain: 'layout', selection: { kind: 'object', objectId: 'layout-object-1' } });
			expect(
				deriveActiveSelection(
					'scene',
					placement,
					{ kind: 'none' },
					room,
					'staging',
					'layout-object'
				)
			).toEqual({ domain: 'none' });
		});

		it('staging + scene owner activates the actionable Scene slot; the Layout slot stays memory', () => {
			expect(
				deriveActiveSelection(
					'scene',
					placement,
					{ kind: 'none' },
					{ kind: 'object', objectId: 'layout-object-1' },
					'staging',
					'scene'
				)
			).toEqual({ domain: 'scene', selection: placement });
			expect(
				deriveActiveSelection(
					'scene',
					{ kind: 'none' },
					{ kind: 'none' },
					{ kind: 'object', objectId: 'layout-object-1' },
					'staging',
					'scene'
				)
			).toEqual({ domain: 'none' });
		});

		it('staging without a remembered owner derives object-first, then Scene', () => {
			expect(
				deriveActiveSelection(
					'scene',
					{ kind: 'none' },
					{ kind: 'none' },
					{ kind: 'object', objectId: 'layout-object-1' },
					'staging'
				)
			).toEqual({ domain: 'layout', selection: { kind: 'object', objectId: 'layout-object-1' } });
			expect(deriveActiveSelection('scene', placement, { kind: 'none' }, { kind: 'none' }, 'staging')).toEqual({
				domain: 'scene',
				selection: placement
			});
		});
	});

	describe('onSelectionActivate seam', () => {
	it('fires only for actionable picks; deselect and room-only never fire', () => {
		const fired: string[] = [];
		const store = createEditorStore({
		document: cloneFixtureDocumentWithEntityCount(3),
		rooms: chopinRuntime.rooms,
		onSelectionActivate: (source) => fired.push(source)
		});
		const entityId = store.document.entities[0]!.id;
		const nodeId = store.document.navigationNodes[0]!.id;

		// Room-only latent mode: no fire.
		expect(store.selectionActions.selectRoom('paris')).toBe(true);
		expect(fired).toEqual([]);

		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(fired).toEqual(['workspace']);

		expect(store.selectionActions.selectNavigationNode(nodeId)).toBe(true);
		expect(fired).toEqual(['workspace', 'navigation']);

		store.selectionActions.deselect();
		expect(fired).toEqual(['workspace', 'navigation']);
	});

	it('defaults to a no-op so the frozen relic is untouched', () => {
		const store = createEditorStore({
			document: cloneFixtureDocumentWithEntityCount(1),
			rooms: chopinRuntime.rooms
		});
		const entityId = store.document.entities[0]!.id;
		expect(() => store.selectionActions.selectPlacement(entityId)).not.toThrow();
		expect(store.selectedPlacementIds).toEqual([entityId]);
	});
});

describe('EditorActiveSelectionStore exclusivity', () => {
	it('mode switch changes authority without clearing either slot', () => {
		const { store, layoutInteraction, activeSelection } = wired();
		const entityId = store.document.entities[0]!.id;
		// Populate both source slots directly so this test isolates mode gating.
		store.selection.workspace = {
			kind: 'placement',
			ids: [entityId],
			clusterId: null,
			roomId: store.document.entities[0]!.roomId
		};
		selectLayoutRoom(layoutInteraction, 'room-a');
		const workspace = JSON.stringify(store.selection.workspace);
		const layout = JSON.stringify(layoutInteraction.selection);

		setPlanViewMode(layoutInteraction, 'staging');
		expect(activeSelection.active.domain).toBe('scene');
		expect(JSON.stringify(store.selection.workspace)).toBe(workspace);
		expect(JSON.stringify(layoutInteraction.selection)).toBe(layout);

		setPlanViewMode(layoutInteraction, 'layout');
		expect(activeSelection.active.domain).toBe('layout');
		expect(JSON.stringify(store.selection.workspace)).toBe(workspace);
		expect(JSON.stringify(layoutInteraction.selection)).toBe(layout);
	});

	it('an actionable Staging pick preserves the remembered Layout slot through the real reducer seam', () => {
		const { store, layoutInteraction, viewState, activeSelection } = wired();
		viewState.setView('scene', 'plan');
		selectLayoutRoom(layoutInteraction, 'room-a');
		setPlanViewMode(layoutInteraction, 'staging');

		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(layoutInteraction.selection).toEqual({ kind: 'room', roomId: 'room-a' });
		expect(activeSelection.active.domain).toBe('scene');

		activeSelection.onLayoutSelectionChanged();
		expect(store.selectedPlacementIds).toEqual([entityId]);
	});

	it('P10: an Arrange layout-object pick routes the active domain to layout while preserving the Scene slot', () => {
		const { store, layoutInteraction, viewState, activeSelection } = wired();
		viewState.setView('scene', 'plan');
		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		setPlanViewMode(layoutInteraction, 'staging');
		layoutInteraction.arrangeOwner = 'layout-object';
		selectLayoutObject(layoutInteraction, 'layout-object-1');

		expect(activeSelection.active).toEqual({
			domain: 'layout',
			selection: { kind: 'object', objectId: 'layout-object-1' }
		});
		// The Scene slot survives as memory (Arrange never mirrors selection).
		expect(store.selectedPlacementIds).toEqual([entityId]);
	});

	it('an actionable scene pick clears a surviving layout selection', () => {
		const { store, layoutInteraction, activeSelection, viewState } = wired();
		viewState.setView('scene', '3d');
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

	it('a camera pick clears a surviving layout selection and activates in the Camera domain', () => {
		const { store, layoutInteraction, activeSelection, viewState } = wired();
		selectLayoutRoom(layoutInteraction, 'room-a');

		const nodeId = store.document.navigationNodes[0]!.id;
		expect(store.selectionActions.selectNavigationNode(nodeId)).toBe(true);
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
		// P1.1 domain gate: in the Scene domain the navigation slot is memory,
		// never active.
		expect(activeSelection.active.domain).toBe('none');
		// Enter the Camera domain: the pick becomes the active domain.
		viewState.setDomain('camera');
		expect(activeSelection.active).toEqual({
			domain: 'camera',
			selection: { kind: 'node', nodeId, handle: 'position' }
		});
	});

	it('activating the layout domain detaches the scene pick and preserves the navigation slot (P1.1 memory)', () => {
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

		// P1.1 deliberate change: the navigation slot is camera-domain memory
		// and survives Scene layout work.
		expect(store.navigationSelection).not.toBeNull();
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

describe('deselectActive', () => {
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

	it('clears selection during preview in both domains (P11.2 AA)', () => {
		const { store, layoutInteraction, activeSelection } = wired();
		const entityId = store.document.entities[0]!.id;

		// P11.2 — deselect is AA: the scene branch no longer inherits the
		// mutation guard (selection never needs Stop); layout stays unguarded.
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(store.previewSequence()).toBe(true);
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(activeSelection.deselectActive()).toBe(true);
		expect(store.selectedPlacementIds).toEqual([]);
		store.stopCameraPreview();

		// Layout branch is unguarded — pinned as intentional asymmetry.
		selectLayoutRoom(layoutInteraction, 'room-a');
		expect(store.previewSequence()).toBe(true);
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(activeSelection.deselectActive()).toBe(true);
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
		store.stopCameraPreview();
	});
});

describe('construction-time behavior (P1.1 domain-gated memory, G2)', () => {
	// The reducer keeps workspace↔navigation mutually exclusive (a nav pick
	// demotes a real workspace pick to room-only), so the multi-actionable
	// scene+camera state can only be built by direct field writes — exactly the
	// defensive case the old convergence existed for. G2: the wrapper no longer
	// clears surplus slots; the domain gate alone decides the active read and
	// no inactive domain's memory is ever destroyed.
	function storeWithAllSlots() {
		const layoutInteraction = createLayoutInteractionState();
		const store = createEditorStore({
			document: cloneFixtureDocumentWithEntityCount(3),
		rooms: chopinRuntime.rooms
		});
		const entityId = store.document.entities[0]!.id;
		const nodeId = store.document.navigationNodes[0]!.id;
		store.selection.workspace = {
			kind: 'placement',
			ids: [entityId],
			clusterId: null,
			roomId: 'paris'
		};
		store.selection.navigation = { kind: 'node', nodeId, handle: 'position' };
		layoutInteraction.selection = { kind: 'room', roomId: 'room-a' };
		return { layoutInteraction, store, entityId, nodeId };
	}

	it('never destroys surplus slots: the camera domain reads the navigation slot; layout/scene stay memory', () => {
		const { layoutInteraction, store, nodeId } = storeWithAllSlots();
		const viewState = new EditorViewState();
		viewState.setDomain('camera');

		const activeSelection = new EditorActiveSelectionStore(
			store,
			layoutInteraction,
			viewState,
			() => clearLayoutSelection(layoutInteraction)
		);

		expect(activeSelection.active).toEqual({
			domain: 'camera',
			selection: { kind: 'node', nodeId, handle: 'position' }
		});
		// No slot destroyed — all three remain memory for their domains.
		expect(store.selectedPlacementIds).toEqual([store.document.entities[0]!.id]);
		expect(store.navigationSelection).toEqual({ kind: 'node', nodeId, handle: 'position' });
		expect(layoutInteraction.selection).toEqual({ kind: 'room', roomId: 'room-a' });
	});

	it('scene domain: layout > scene; the navigation slot stays untouched memory', () => {
		const { layoutInteraction, store, nodeId } = storeWithAllSlots();
		const viewState = new EditorViewState();

		const activeSelection = new EditorActiveSelectionStore(
			store,
			layoutInteraction,
			viewState,
			() => clearLayoutSelection(layoutInteraction)
		);

		expect(activeSelection.active).toEqual({
			domain: 'layout',
			selection: { kind: 'room', roomId: 'room-a' }
		});
		expect(store.selectedPlacementIds).toEqual([store.document.entities[0]!.id]);
		expect(store.navigationSelection).toEqual({ kind: 'node', nodeId, handle: 'position' });
	});

	it('scene domain with scene + camera memory: active is scene; the navigation slot stays memory', () => {
		const layoutInteraction = createLayoutInteractionState();
		const store = createEditorStore({
			document: cloneFixtureDocumentWithEntityCount(3),
		rooms: chopinRuntime.rooms
		});
		const entityId = store.document.entities[0]!.id;
		const nodeId = store.document.navigationNodes[0]!.id;
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
			new EditorViewState(),
			() => clearLayoutSelection(layoutInteraction)
		);

		expect(activeSelection.active.domain).toBe('scene');
		expect(store.selectedPlacementIds).toEqual([entityId]);
		expect(store.navigationSelection).toEqual({ kind: 'node', nodeId, handle: 'position' });
		expect(layoutInteraction.selection).toEqual({ kind: 'none' });
	});
});

describe('reset() and domain/view-switch preservation', () => {
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

	it('a layout selection survives view and domain switches (slots untouched; the gate re-gates)', () => {
		const { store, layoutInteraction, activeSelection, viewState } = wired();
		selectLayoutRoom(layoutInteraction, 'room-a');

		// Scene → 3D: layout stays active (view switch never touches the slots).
		viewState.setView('scene', '3d');
		expect(activeSelection.active).toEqual({
			domain: 'layout',
			selection: { kind: 'room', roomId: 'room-a' }
		});

		// Camera domain: the layout slot is memory; nothing is active.
		viewState.setDomain('camera');
		viewState.setView('camera', '3d');
		expect(activeSelection.active).toEqual({ domain: 'none' });

		// Back to Scene: the layout selection is restored.
		viewState.setDomain('scene');
		expect(activeSelection.active).toEqual({
			domain: 'layout',
			selection: { kind: 'room', roomId: 'room-a' }
		});
	});

	it('restores a camera selection after Scene layout work (domain-gated memory)', () => {
		const { store, layoutInteraction, activeSelection, viewState } = wired();
		const nodeId = store.document.navigationNodes[0]!.id;

		// Camera domain: select a node.
		viewState.setDomain('camera');
		viewState.setView('camera', '3d');
		expect(store.selectionActions.selectNavigationNode(nodeId)).toBe(true);
		expect(activeSelection.active).toEqual({
			domain: 'camera',
			selection: { kind: 'node', nodeId, handle: 'position' }
		});

		// Scene → Plan layout work: the navigation slot survives.
		viewState.setDomain('scene');
		viewState.setView('scene', 'plan');
		selectLayoutRoom(layoutInteraction, 'room-a');
		activeSelection.onLayoutSelectionChanged();
		expect(store.navigationSelection).toEqual({ kind: 'node', nodeId, handle: 'position' });
		expect(activeSelection.active.domain).toBe('layout');

		// Back to Camera → 3D: the selection is restored.
		viewState.setDomain('camera');
		viewState.setView('camera', '3d');
		expect(activeSelection.active).toEqual({
			domain: 'camera',
			selection: { kind: 'node', nodeId, handle: 'position' }
		});
	});
});
