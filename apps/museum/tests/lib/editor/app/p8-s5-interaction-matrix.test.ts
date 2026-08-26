import { describe, expect, it } from 'vitest';

import { chopinRuntime } from '$lib/content/chopin-project';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { EditorViewState } from '$lib/editor/app/editor-view-state.svelte';
import { createFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';

/**
 * P8 S5 — interaction matrix for the §G edge-case rows that were untested:
 * Plan↔3D preservation (D2), strict undo/redo prune through the facade path
 * (D3), sequence-edited-while-previewing (D4), and delete-selected-edge.
 * Pure test slice per the folded design — no commands, FSM, or UI changes.
 *
 * Fixture note: flow-order edges (`tour-a-b` etc.) cannot be deleted
 * (`guided_connection` failure), so the delete/undo rows use an extra
 * Unsequenced connection (`tour-b-free-e`) that is never on the flow
 * timeline — the S3 pattern.
 */

/**
 * Add free node E (Unsequenced) with two connections (`tour-b-free-e` and
 * `tour-paris-free-e`), both off the flow timeline. Two edges so deleting
 * either one never strands E (the disconnected-graph check rejects a
 * deletion that leaves a previously-connected node isolated).
 */
function addFreeNodeWithConnection(document: ReturnType<typeof cloneFixtureDocument>) {
	document.navigationNodes.push({
		id: 'free-e',
		roomId: 'paris',
		label: 'Free E',
		position: [5, 1.65, 5],
		cameraTarget: [5, 1.25, 2],
		fov: 54,
		connectedNodeIds: ['tour-b', 'tour-paris']
	} as any);
	for (const partner of ['tour-b', 'tour-paris']) {
		const node = document.navigationNodes.find((n) => n.id === partner)!;
		if (!node.connectedNodeIds.includes('free-e')) node.connectedNodeIds.push('free-e');
	}
	document.connections.push(
		{
			id: 'tour-b-free-e',
			fromNodeId: 'tour-b',
			toNodeId: 'free-e',
			clearance: 0.35,
			positionPath: { kind: 'rounded-polyline', anchors: [] }
		} as any,
		{
			id: 'tour-paris-free-e',
			fromNodeId: 'tour-paris',
			toNodeId: 'free-e',
			clearance: 0.35,
			positionPath: { kind: 'rounded-polyline', anchors: [] }
		} as any
	);
	return 'tour-b-free-e';
}

function documentWithOffFlowConnection() {
	const document = cloneFixtureDocument();
	return { document, connId: addFreeNodeWithConnection(document) };
}

/**
 * Composition mirroring `EditorApp`'s workspace mapping (EditorApp.svelte:130-145):
 * both Camera cells keep the camera workspace (G3), so `setWorkspace`'s
 * preview-stop / timeline-expansion side effects never fire on Camera
 * Plan ↔ 3D toggles. Only the camera-domain branch is exercised here.
 */
function wired() {
	const store = createFixtureEditorStore();
	const viewState = new EditorViewState();
	function syncWorkspace() {
		if (viewState.domain === 'camera') store.setWorkspace('camera');
	}
	return { store, viewState, syncWorkspace };
}

describe('P8 S5 interaction matrix — §G rows', () => {
	it('Plan ↔ 3D switch preserves an active edge preview: same runId, transport, scope, direction, playhead, selection (D2)', () => {
		const { store, viewState, syncWorkspace } = wired();
		viewState.setDomain('camera');
		syncWorkspace();
		expect(store.currentWorkspace).toBe('camera');

		const connId = store.document.connections[0]!.id;
		store.selectionActions.selectConnection(connId);
		expect(store.previewEdge(connId, 'forward', 'director')).toBe(true);

		const before = {
			runId: store.cameraPreview!.runId,
			transport: store.cameraPreview!.transport,
			playhead: store.cameraPreview!.playhead,
			scope: store.previewScope,
			selection: store.navigationSelection,
			cameraPlayhead: store.cameraTimelinePlayhead,
			direction: (store.cameraPreview as { direction?: string }).direction
		};

		// Camera 3D → Plan: the shared-view switch must not stop or reset the preview.
		viewState.setView('camera', 'plan');
		syncWorkspace();
		expect(store.currentWorkspace).toBe('camera');
		expect(store.cameraPreview).not.toBeNull();
		expect(store.cameraPreview!.runId).toBe(before.runId);
		expect(store.cameraPreview!.transport).toBe(before.transport);
		expect(store.cameraPreview!.playhead).toBe(before.playhead);
		expect(store.previewScope).toBe(before.scope);
		expect((store.cameraPreview as { direction?: string }).direction).toBe(before.direction);
		expect(store.navigationSelection).toEqual(before.selection);
		expect(store.cameraTimelinePlayhead).toBe(before.cameraPlayhead);

		// And back Plan → Camera 3D.
		viewState.setView('camera', '3d');
		syncWorkspace();
		expect(store.cameraPreview!.runId).toBe(before.runId);
		expect(store.previewScope).toBe('edge');
		expect(store.navigationSelection).toEqual(before.selection);
	});

	it('Plan ↔ 3D switch preserves a playing sequence preview: not stopped, not reset (D2)', () => {
		const { store, viewState, syncWorkspace } = wired();
		viewState.setDomain('camera');
		syncWorkspace();
		expect(store.currentWorkspace).toBe('camera');

		expect(store.seekCameraTimeline(0.4)).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview?.kind).toBe('sequence');
		expect(store.cameraPreview!.transport).toBe('playing');
		const runId = store.cameraPreview!.runId;
		const playhead = store.cameraTimelinePlayhead;

		viewState.setView('camera', 'plan');
		syncWorkspace();
		expect(store.cameraPreview).not.toBeNull();
		expect(store.cameraPreview!.runId).toBe(runId);
		expect(store.cameraPreview!.transport).toBe('playing');
		expect(store.previewScope).toBe('sequence');
		expect(store.cameraTimelinePlayhead).toBe(playhead);

		viewState.setView('camera', '3d');
		syncWorkspace();
		expect(store.cameraPreview!.runId).toBe(runId);
		expect(store.cameraPreview!.transport).toBe('playing');
		expect(store.cameraTimelinePlayhead).toBe(playhead);
	});

	it('Deleting the selected edge stops the preview, clears the captured route + repeat, sets a status message (§G: deleting selected edge)', () => {
		const { document, connId } = documentWithOffFlowConnection();
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		store.selectionActions.selectConnection(connId);
		expect(store.previewEdge(connId, 'forward', 'director')).toBe(true);
		expect(store.setEdgePreviewRepeat(true)).toBe(true);
		const runId = store.cameraPreview!.runId;
		expect(store.getCapturedCameraPreviewRoute(runId)).not.toBeNull();
		expect(store.edgeRepeat).toBe(true);

		expect(store.deleteConnection(connId)).toBe(true);
		expect(store.cameraPreview).toBeNull();
		expect(store.getCapturedCameraPreviewRoute(runId)).toBeNull();
		expect(store.edgeRepeat).toBe(false);
		expect(store.document.connections.some((c) => c.id === connId)).toBe(false);
		expect(store.statusMessage).toContain('Deleted camera connection');
	});

	it('Undo restores the deleted edge with a clean preview state; redo re-deletes (D3 strict facade path)', () => {
		const { document, connId } = documentWithOffFlowConnection();
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		expect(store.previewEdge(connId, 'forward', 'director')).toBe(true);
		const runId = store.cameraPreview!.runId;
		expect(store.deleteConnection(connId)).toBe(true);
		expect(store.cameraPreview).toBeNull();
		expect(store.getCapturedCameraPreviewRoute(runId)).toBeNull();

		// undo → connection restored, timeline still builds, no stale preview/route.
		expect(store.undo()).toBe(true);
		expect(store.document.connections.some((c) => c.id === connId)).toBe(true);
		expect(store.getCameraTimeline()).not.toBeNull();
		expect(store.cameraPreview).toBeNull();
		expect(store.getCapturedCameraPreviewRoute(runId)).toBeNull();

		// redo → deleted again, clean state.
		expect(store.redo()).toBe(true);
		expect(store.document.connections.some((c) => c.id === connId)).toBe(false);
		expect(store.cameraPreview).toBeNull();
		expect(store.statusMessage).toContain('Deleted camera connection');
	});

	it('Sequence edited while previewing: paused tour hard-resets on ANY document edit (D4)', () => {
		const { document, connId } = documentWithOffFlowConnection();
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		expect(store.seekCameraTimeline(0.5)).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.cameraPreview!.transport).toBe('paused');
		const runId = store.cameraPreview!.runId;
		expect(store.cameraTimelinePlayhead).toBeCloseTo(0.5, 6);

		expect(store.deleteConnection(connId)).toBe(true);
		// Hard reset (P8 S5 owner decision): any document replace while a
		// Director preview is paused stops it — even an off-flow delete that
		// leaves the tour timeline fully resolvable. No re-resolution, no
		// runId bump, no silent pose drift; the user re-runs the preview.
		expect(store.cameraPreview).toBeNull();
		expect(store.getCapturedCameraPreviewRoute(runId)).toBeNull();
		expect(store.getCameraTimeline()).not.toBeNull();
	});

	it('Sequence edited while previewing: undo while paused hard-resets with a status message (D4)', () => {
		const { document, connId } = documentWithOffFlowConnection();
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		// A prior edit so undo() has a history entry.
		expect(store.deleteConnection(connId)).toBe(true);
		expect(store.document.connections.some((c) => c.id === connId)).toBe(false);
		// Pause a tour, then undo the earlier edit.
		expect(store.seekCameraTimeline(0.4)).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.cameraPreview!.transport).toBe('paused');
		const runId = store.cameraPreview!.runId;

		expect(store.undo()).toBe(true);
		// The undo replaces the document while paused → hard reset + message.
		expect(store.cameraPreview).toBeNull();
		expect(store.getCapturedCameraPreviewRoute(runId)).toBeNull();
		expect(store.statusMessage).toContain('Camera preview stopped');
		expect(store.document.connections.some((c) => c.id === connId)).toBe(true);
	});

	it('Sequence edited while previewing: playing tour auto-pauses into topology mutation (D4)', () => {
		const { document, connId } = documentWithOffFlowConnection();
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview!.transport).toBe('playing');

		// P11.2 (DEL) — a playing Director tour auto-pauses in place, then the
		// deletion proceeds through the release chain: the paused tour touches
		// the deleted topology, so it force-stops (P8 S5 teardown preserved).
		expect(store.deleteConnection(connId)).toBe(true);
		expect(store.document.connections.some((c) => c.id === connId)).toBe(false);
		expect(store.cameraPreview).toBeNull();
		expect(store.undo()).toBe(true);
		expect(store.document.connections.some((c) => c.id === connId)).toBe(true);
	});
});
