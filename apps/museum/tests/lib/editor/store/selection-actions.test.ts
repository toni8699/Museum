import { describe, expect, it } from 'vitest';

import { EditorSelectionStore } from '$lib/editor/store/selection-store.svelte';
import { EditorSessionState } from '$lib/editor/store/session-state.svelte';
import {
	EditorSelectionActions,
	type EditorSelectionActionsHost
} from '$lib/editor/store/selection-actions.svelte';
import type { SceneDocument, SceneObjectCluster } from '$lib/content/scene';
import type { EditorTransformMode } from '$lib/editor/editor-transform';

/**
 * Minimal fake composition root. Mirrors the god-file facade reads (which are
 * themselves derived from the selection reducer) and stubs the side-effect
 * channels so the controller can be exercised without the 4.8k-line store.
 */
function createHarness(
	objects: Array<{ id: string; roomId: string }> = [],
	initialMode: EditorTransformMode = 'translate'
) {
	const selection = new EditorSelectionStore();
	selection.bindSession(new EditorSessionState());

	const document = {
		textures: [],
		materials: [],
		entities: objects.map((object) => ({
			kind: 'model' as const,
			name: object.id,
			...object
		})),
		connections: [],
		navigationNodes: [],
		clusters: [] as SceneObjectCluster[]
	} as unknown as SceneDocument;

	let transformMode: EditorTransformMode = initialMode;
	const guards = {
		isDocumentMutationBlocked: false,
		isEditorInteractionActive: false,
		isCameraFramingMutationBlocked: false
	};
	const host: EditorSelectionActionsHost = {
		get isDocumentMutationBlocked() {
			return guards.isDocumentMutationBlocked;
		},
		get isEditorInteractionActive() {
			return guards.isEditorInteractionActive;
		},
		get isRelic() {
			return false;
		},
		get isCameraFramingMutationBlocked() {
			return guards.isCameraFramingMutationBlocked;
		},
		get pendingNavigationCommand() {
			return null;
		},
		get pendingNavigationNode() {
			return undefined;
		},
		get document() {
			return document;
		},
		get cameraSelection() {
			const n = selection.navigation;
			return n.kind === 'node' ? { nodeId: n.nodeId, handle: n.handle } : null;
		},
		get currentWorkspace() {
			return 'scene' as const;
		},
		get cameraPreview() {
			return null;
		},
		get isCameraPreviewStopping() {
			return false;
		},
		get isDocumentTransactionActive() {
			return false;
		},
		get activeCameraConnectionId() {
			return selection.discoveryConnectionId;
		},
		get activeCameraDirection() {
			return selection.discoveryDirection;
		},
		get navigationSelection() {
			const n = selection.navigation;
			return n.kind === 'none' ? null : (n as never);
		},
		get selectedRoomId() {
			const w = selection.workspace;
			return w.kind === 'none' ? null : w.roomId;
		},
		get selectedPlacementId() {
			const w = selection.workspace;
			return w.kind === 'placement' ? (w.ids.at(-1) ?? null) : null;
		},
		get selectedPlacementIds() {
			const w = selection.workspace;
			return w.kind === 'placement' ? w.ids : [];
		},
		get selectedClusterId() {
			const w = selection.workspace;
			return w.kind === 'cluster' ? w.clusterId : null;
		},
		get clusters() {
			return document.clusters ?? [];
		},
		get transformMode() {
			return transformMode;
		},
		set transformMode(value) {
			transformMode = value;
		},
		isPendingNavigationNode: () => false,
		connectPendingNavigationNode: () => false,
		cancelAssetPlacement: () => false,
		cancelPendingFrame: () => {},
		clearCameraFocusRequest: () => {},
		setStatusMessage: () => {},
		focusNavigationNode: () => true,
		focusPlacement: () => true,
		focusSelection: () => true,
		ensureRoomTreeExpanded: () => {},
		ensureClusterTreeExpanded: () => {},
		isPlacementSelectable: (id: string) => {
			const roomId = host.selectedRoomId;
			return document.entities.some(
				(object) => object.id === id && (object as { roomId: string }).roomId === roomId
			);
		},
			seekSequencePreviewForNode: () => false,
			installRelicSelectionScope: () => false,
			requestAuthoringPause: () => true,
		requestFramingPause: () => true
	};

	const actions = new EditorSelectionActions(selection, host);
	return {
		actions,
		selection,
		host,
		guards,
			getTransformMode: () => transformMode
	};
}

describe('EditorSelectionActions', () => {
	it('selectRoom then selectPlacement sets a placement workspace (mode unchanged)', () => {
		// Phase 6.4 — selection does NOT touch transformMode anymore; the
		// user's chosen gizmo mode (initial = translate) persists.
		const { actions, selection, getTransformMode } = createHarness([
			{ id: 'p1', roomId: 'paris' }
		]);

		expect(actions.selectRoom('paris')).toBe(true);
		expect(actions.selectPlacement('p1')).toBe(true);
		expect(selection.workspace).toEqual({
			kind: 'placement',
			ids: ['p1'],
			clusterId: null,
			roomId: 'paris'
		});
		expect(getTransformMode()).toBe('translate'); // not reset to 'rotate'
	});

	it('selection ignores the mutation guard (P11.2 AA — selection never needs Stop)', () => {
		const { actions, selection, guards } = createHarness([{ id: 'p1', roomId: 'paris' }]);
		actions.selectRoom('paris');
		guards.isDocumentMutationBlocked = true;

		expect(actions.selectPlacement('p1')).toBe(true);
		expect(selection.workspace).toEqual({
			kind: 'placement',
			ids: ['p1'],
			clusterId: null,
			roomId: 'paris'
		});
	});

	it('deselect clears the placement pick but retains room context', () => {
		const { actions, selection } = createHarness([{ id: 'p1', roomId: 'paris' }]);
		actions.selectRoom('paris');
		actions.selectPlacement('p1');

		expect(actions.deselect()).toBe(true);
		expect(selection.workspace).toEqual({
			kind: 'placement',
			ids: [],
			clusterId: null,
			roomId: 'paris'
		});
		expect(selection.navigation).toEqual({ kind: 'none' });
	});

	it('togglePlacement adds and removes ids against the current room', () => {
		const { actions, selection } = createHarness([
			{ id: 'p1', roomId: 'paris' },
			{ id: 'p2', roomId: 'paris' }
		]);
		actions.selectRoom('paris');
		actions.selectPlacement('p1');

		expect(actions.togglePlacement('p2')).toBe(true);
		expect(selection.workspace).toMatchObject({ ids: ['p1', 'p2'] });
		expect(actions.togglePlacement('p1')).toBe(true);
		expect(selection.workspace).toMatchObject({ ids: ['p2'] });
	});
});

describe('EditorSelectionActions — lastSelectedId writer hooks', () => {
	it('selectPlacement writes lastSelectedId', () => {
		const { actions } = createHarness([
			{ id: 'p1', roomId: 'paris' },
			{ id: 'p2', roomId: 'paris' }
		]);
		actions.selectRoom('paris');
		actions.selectPlacement('p1');
		expect(actions.lastSelectedId).toBe('p1');
		actions.selectPlacement('p2');
		expect(actions.lastSelectedId).toBe('p2');
	});

	it('togglePlacement writes lastSelectedId when added', () => {
		const { actions } = createHarness([
			{ id: 'p1', roomId: 'paris' },
			{ id: 'p2', roomId: 'paris' }
		]);
		actions.selectRoom('paris');
		actions.selectPlacement('p1');
		actions.togglePlacement('p2');
		expect(actions.lastSelectedId).toBe('p2');
		// toggling 'p2' out does not clear the trace
		actions.togglePlacement('p2');
		expect(actions.lastSelectedId).toBe('p2');
	});

	it('selectPlacements writes the last provided id', () => {
		const { actions } = createHarness([
			{ id: 'a', roomId: 'paris' },
			{ id: 'b', roomId: 'paris' },
			{ id: 'c', roomId: 'paris' }
		]);
		actions.selectRoom('paris');
		actions.selectPlacements(['a', 'b', 'c']);
		expect(actions.lastSelectedId).toBe('c');
	});

	it('deselect clears lastSelectedId', () => {
		const { actions } = createHarness([{ id: 'p1', roomId: 'paris' }]);
		actions.selectRoom('paris');
		actions.selectPlacement('p1');
		expect(actions.lastSelectedId).toBe('p1');
		actions.deselect();
		expect(actions.lastSelectedId).toBeNull();
	});
});

describe('EditorSelectionActions — Phase 6.4 keep-action invariant', () => {
	// Phase 6.4 removed the auto-reset-to-rotate on every selection-set boundary
	// and dropped the interactionStore.setMode('translate') side-effect in
	// EditorTransformControls. This locks the new contract: explicit user
	// gizmo mode sticks through every selection mutation on the same session.
	function runAction(initialMode: EditorTransformMode, run: (a: EditorSelectionActions) => void) {
		const { actions, getTransformMode } = createHarness([
			{ id: 'p1', roomId: 'paris' },
			{ id: 'p2', roomId: 'paris' }
		]);
		actions.selectRoom('paris');
		// Simulate "user pressed R, now enters Rotate" — set the session
		// transformMode directly (what the toolbar / shortcut handler does).
		const harness = createHarness(
			[{ id: 'p1', roomId: 'paris' }, { id: 'p2', roomId: 'paris' }],
			initialMode
		);
		run(harness.actions);
		return harness.getTransformMode();
	}

	it('selectPlacement does not reset an explicit rotate mode', () => {
		const mode = runAction('rotate', (a) => a.selectPlacement('p1'));
		expect(mode).toBe('rotate');
	});

	it('selectPlacements does not reset an explicit scale mode', () => {
		const mode = runAction('scale', (a) => a.selectPlacements(['p1', 'p2']));
		expect(mode).toBe('scale');
	});

	it('selectCluster does not reset an explicit rotate mode', () => {
		// selectCluster walks the controller's selectCluster path directly —
		// we patch the host to carry one cluster for this test.
		const selection = new EditorSelectionStore();
		selection.bindSession(new EditorSessionState());
		const cluster = {
			id: 'cluster-1',
			name: 'Cluster 1',
			memberIds: ['p1', 'p2'],
			roomId: 'paris'
		} as SceneObjectCluster;
		const document = {
			textures: [],
			materials: [],
			entities: [
				{ kind: 'model', name: 'p1', id: 'p1', roomId: 'paris' },
				{ kind: 'model', name: 'p2', id: 'p2', roomId: 'paris' }
			],
			connections: [],
			navigationNodes: [],
			clusters: [cluster]
		} as unknown as SceneDocument;
		const guards = {
			isDocumentMutationBlocked: false,
			isEditorInteractionActive: false,
			isCameraFramingMutationBlocked: false
		};
		let transformMode: EditorTransformMode = 'rotate';
		const host: EditorSelectionActionsHost = {
			get isDocumentMutationBlocked() {
				return guards.isDocumentMutationBlocked;
			},
			get isEditorInteractionActive() {
				return guards.isEditorInteractionActive;
			},
			get isRelic() {
				return false;
			},
			get isCameraFramingMutationBlocked() {
				return guards.isCameraFramingMutationBlocked;
			},
			get pendingNavigationCommand() {
				return null;
			},
			get pendingNavigationNode() {
				return undefined;
			},
			get document() {
				return document;
			},
			get cameraSelection() {
				return null;
			},
			get currentWorkspace() {
				return 'scene' as const;
			},
			get cameraPreview() {
				return null;
			},
			get isCameraPreviewStopping() {
				return false;
			},
			get isDocumentTransactionActive() {
				return false;
			},
			get activeCameraConnectionId() {
				return selection.discoveryConnectionId;
			},
			get activeCameraDirection() {
				return selection.discoveryDirection;
			},
			get navigationSelection() {
				const n = selection.navigation;
				return n.kind === 'none' ? null : (n as never);
			},
			get selectedRoomId() {
				const w = selection.workspace;
				return w.kind === 'none' ? null : w.roomId;
			},
			get selectedPlacementId() {
				const w = selection.workspace;
				return w.kind === 'placement' ? (w.ids.at(-1) ?? null) : null;
			},
			get selectedPlacementIds() {
				const w = selection.workspace;
				return w.kind === 'placement' ? w.ids : [];
			},
			get selectedClusterId() {
				const w = selection.workspace;
				return w.kind === 'cluster' ? w.clusterId : null;
			},
			get clusters() {
				return document.clusters as SceneObjectCluster[];
			},
			get transformMode() {
				return transformMode;
			},
			set transformMode(v) {
				transformMode = v;
			},
			isPendingNavigationNode: () => false,
			connectPendingNavigationNode: () => false,
			cancelAssetPlacement: () => false,
			cancelPendingFrame: () => {},
			clearCameraFocusRequest: () => {},
			setStatusMessage: () => {},
			focusNavigationNode: () => true,
			focusPlacement: () => true,
			focusSelection: () => true,
			ensureRoomTreeExpanded: () => {},
			ensureClusterTreeExpanded: () => {},
			isPlacementSelectable: (id: string) => {
				const w = selection.workspace;
				const roomId = w.kind === 'none' ? null : w.roomId;
				return document.entities.some(
					(object) =>
						object.id === id && (object as { roomId: string }).roomId === roomId
				);
			},
				seekSequencePreviewForNode: () => false,
				installRelicSelectionScope: () => false,
			requestAuthoringPause: () => true,
			requestFramingPause: () => true
		};
		const actions = new EditorSelectionActions(selection, host);
		actions.selectRoom('paris');
		actions.selectCluster('cluster-1');
		expect(transformMode).toBe('rotate');
	});

	// P7.1 — the guard-free session-restore adapter (the sole survivor of the
	// deleted facade bridging setters). Round-trips the legacy snapshot shape.
	it('restoreSelectionSnapshot round-trips null navigation and restores placement ids', () => {
		const { actions, selection } = createHarness([{ id: 'p1', roomId: 'paris' }]);
		actions.selectRoom('paris');
		actions.selectPlacement('p1');

		actions.restoreSelectionSnapshot({
			navigation: null,
			placementIds: ['p1'],
			clusterId: null
		});
		expect(selection.navigation).toEqual({ kind: 'none' });
		expect(selection.workspace).toEqual({
			kind: 'placement',
			ids: ['p1'],
			clusterId: null,
			roomId: 'paris'
		});
	});

	it('restoreSelectionSnapshot restores cluster id (reducer cross-clears navigation)', () => {
		const { actions, selection } = createHarness([{ id: 'p1', roomId: 'paris' }]);
		actions.selectRoom('paris');

		actions.restoreSelectionSnapshot({
			navigation: { kind: 'connection', connectionId: 'c1' },
			placementIds: [],
			clusterId: 'cl1'
		});
		// Legacy parity: a real workspace pick wins — the reducer's
		// cross-clearing invariant turns navigation off.
		expect(selection.navigation).toEqual({ kind: 'none' });
		expect(selection.workspace).toEqual({
			kind: 'cluster',
			clusterId: 'cl1',
			roomId: 'paris'
		});
	});

	it('restoreSelectionSnapshot restores a navigation selection when no workspace ids are present', () => {
		const { actions, selection } = createHarness([{ id: 'p1', roomId: 'paris' }]);
		actions.selectRoom('paris');

		actions.restoreSelectionSnapshot({
			navigation: { kind: 'anchor', connectionId: 'c1', anchorId: 'a1' },
			placementIds: [],
			clusterId: null
		});
		expect(selection.navigation).toEqual({
			kind: 'anchor',
			connectionId: 'c1',
			anchorId: 'a1'
		});
	});
});
