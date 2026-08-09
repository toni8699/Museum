import { describe, expect, it } from 'vitest';

import { EditorSelectionStore } from './selection-store.svelte';
import { EditorSessionState } from './session-state.svelte';
import {
	EditorSelectionActions,
	type EditorSelectionActionsHost
} from './selection-actions.svelte';
import type { MuseumSceneDocument, SceneObjectCluster } from '$lib/content/scene';
import type { EditorTransformMode } from '../editor-transform';

/**
 * Minimal fake composition root. Mirrors the god-file facade reads (which are
 * themselves derived from the selection reducer) and stubs the side-effect
 * channels so the controller can be exercised without the 4.8k-line store.
 */
function createHarness(objects: Array<{ id: string; roomId: string }> = []) {
	const selection = new EditorSelectionStore();
	selection.bindSession(new EditorSessionState());

	const document = {
		version: 6,
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
	} as unknown as MuseumSceneDocument;

	let transformMode: EditorTransformMode = 'translate';
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
		getCapturedCameraPreviewRoute: () => null,
		setCameraPreviewPlayhead: () => false,
		syncCameraTimelineForNode: () => {},
		showCameraTimelineNodePose: () => {},
		syncCameraTimelineForConnection: () => {},
		showCameraTimelineConnectionPose: () => {}
	};

	const actions = new EditorSelectionActions(selection, host);
	return { actions, selection, host, guards, getTransformMode: () => transformMode };
}

describe('EditorSelectionActions', () => {
	it('selectRoom then selectPlacement sets a placement workspace and rotate mode', () => {
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
		expect(getTransformMode()).toBe('rotate');
	});

	it('mutation guard blocks selection and leaves the reducer untouched', () => {
		const { actions, selection, guards } = createHarness([{ id: 'p1', roomId: 'paris' }]);
		actions.selectRoom('paris');
		guards.isDocumentMutationBlocked = true;

		expect(actions.selectPlacement('p1')).toBe(false);
		expect(selection.workspace).toEqual({
			kind: 'placement',
			ids: [],
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
