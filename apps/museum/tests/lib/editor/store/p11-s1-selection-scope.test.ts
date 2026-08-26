import { describe, expect, it } from 'vitest';
import { chopinRuntime } from '$lib/content/chopin-project';
import { createFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { cameraTimelineEdgePlayheadAtProgress } from '$lib/editor/camera/editor-camera-timeline';

/**
 * P11.1 — selection-driven scope transitions (supersedes P8 D1 / P3B Group C
 * "selection never changes preview scope" and the P8 S5 leave-Sequence-playing
 * rule). Contract under test:
 * - Camera/Edge selection enters the matching PAUSED director scope, never autoplays
 * - Sequence-playing selection pauses Sequence into the selected scope without
 *   Stop teardown, preserving project state and `lastSequencePlayhead`
 * - Current-edge handoff maps the Sequence playhead onto local physical progress
 * - Explicit Preview Sequence remains the sole whole-route entry
 */
describe('P11.1 selection-driven preview scopes', () => {
	it('selecting a Camera enters paused Camera scope; never autoplays, no history entry', () => {
		const store = createFixtureEditorStore();
		const documentBefore = store.document;
		expect(store.canUndo).toBe(false);

		expect(store.selectionActions.selectNavigationNode('tour-a')).toBe(true);

		expect(store.cameraPreview).toMatchObject({
			kind: 'camera',
			nodeId: 'tour-a',
			mode: 'director',
			transport: 'paused'
		});
		expect(store.cameraPreview?.playhead).toBe(0);
		expect(store.canUndo).toBe(false);
		expect(store.statusMessage).toBeNull();
		expect(store.document).toBe(documentBefore);
	});

	it('selecting an Edge enters paused Edge scope at local zero (forward default)', () => {
		const store = createFixtureEditorStore();

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);

		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: 'tour-a-b',
			direction: 'forward',
			mode: 'director',
			transport: 'paused',
			playhead: 0
		});
	});

	it('selecting another Edge follows canonical selection — no independent active-edge identity', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectConnection('tour-a-b');
		const firstRunId = store.cameraPreview?.runId;

		expect(store.selectionActions.selectConnection('tour-b-paris')).toBe(true);

		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: 'tour-b-paris',
			transport: 'paused'
		});
		expect(store.cameraPreview?.runId).not.toBe(firstRunId);
	});

	it('selecting a Camera while an Edge scope is active enters static Camera scope', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectConnection('tour-a-b');

		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);

		expect(store.cameraPreview).toMatchObject({
			kind: 'camera',
			nodeId: 'tour-paris',
			transport: 'paused'
		});
	});

	it('re-selecting the active scope is idempotent — runId and playhead preserved', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectConnection('tour-a-b');
		const runId = store.cameraPreview!.runId;
		expect(store.setCameraPreviewPlayhead(0.4)).toBe(true);

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(false);

		expect(store.cameraPreview).toMatchObject({ kind: 'edge', runId, playhead: 0.4 });
	});

	it('re-selecting the currently-playing edge auto-pauses it in place (runId + playhead kept)', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.playCameraPreview()).toBe(true);
		store.setCameraPreviewPlayhead(0.25);
		const runId = store.cameraPreview!.runId;

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);

		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			runId,
			playhead: 0.25,
			transport: 'paused'
		});
	});

	it('P11 supersedes P8 S5: selecting an Edge while Sequence plays pauses into Edge scope, snapshots lastSequencePlayhead, no Stop teardown', () => {
		const store = createFixtureEditorStore();
		expect(store.seekCameraTimeline(0.37)).toBe(true);
		const priorPlayhead = store.cameraTimelinePlayhead;
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'playing' });
		const documentBefore = store.document;

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);

		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: 'tour-a-b',
			transport: 'paused'
		});
		expect(store.lastSequencePlayhead).toBeCloseTo(priorPlayhead, 6);
		expect(store.document).toBe(documentBefore);
		expect(store.statusMessage).toBeNull();
	});

	it('current-edge handoff: selecting the edge under the Sequence playhead maps local physical progress', () => {
		const store = createFixtureEditorStore();
		expect(store.seekCameraTimeline(0.02)).toBe(true);
		const priorPlayhead = store.cameraTimelinePlayhead;
		expect(store.previewSequence('director')).toBe(true);

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);

		const timeline = store.getCameraTimeline();
		expect(timeline).not.toBeNull();
		const expectedLocal = cameraTimelineEdgePlayheadAtProgress(
			timeline!,
			'tour-a-b',
			'forward',
			priorPlayhead
		);
		expect(expectedLocal).not.toBeNull();
		expect(store.cameraPreview).toMatchObject({ kind: 'edge', transport: 'paused' });
		expect(store.cameraPreview!.playhead).toBeCloseTo(expectedLocal!, 6);
	});

	it('stale mapping falls back to local zero when the selected edge is elsewhere on the ruler', () => {
		const store = createFixtureEditorStore();
		expect(store.seekCameraTimeline(0.98)).toBe(true);
		expect(store.previewSequence('director')).toBe(true);

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);

		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: 'tour-a-b',
			transport: 'paused',
			playhead: 0
		});
	});

	it('explicit Preview Sequence remains the sole whole-route entry — entity selection never creates Sequence scope', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-a');
		expect(store.cameraPreview?.kind).toBe('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.cameraPreview?.kind).toBe('edge');
	});

	it('unbuildable Sequence does not block Edge scope (§9: valid Edge stays usable)', () => {
		const doc = cloneFixtureDocument();
		doc.navigationNodes.forEach((node) => {
			delete (node as { nextNodeId?: string }).nextNodeId;
			delete (node as { previousNodeId?: string }).previousNodeId;
		});
		const store = createEditorStore({ document: doc, rooms: chopinRuntime.rooms });
		expect(store.getCameraTimeline()).toBeNull();

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);

		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: 'tour-a-b',
			direction: 'forward',
			transport: 'paused',
			playhead: 0
		});
	});

	it('selection-driven entry preserves Plan↔3D continuity fields (direction + discovery mirror)', () => {
		const store = createFixtureEditorStore();

		store.selectionActions.selectCameraConnectionDirection('tour-a-b', 'reverse');

		expect(store.activeCameraConnectionId).toBe('tour-a-b');
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: 'tour-a-b',
			direction: 'reverse',
			fromNodeId: 'tour-b',
			toNodeId: 'tour-a',
			transport: 'paused'
		});
	});

	it('review fix — edge selection creates no document/history entry', () => {
		const store = createFixtureEditorStore();
		const documentBefore = store.document;
		expect(store.canUndo).toBe(false);

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);

		expect(store.cameraPreview).toMatchObject({ kind: 'edge', transport: 'paused' });
		expect(store.canUndo).toBe(false);
		expect(store.document).toBe(documentBefore);
	});

	it('review fix — selection is barred inside the stop/restore ritual (isCameraPreviewStopping)', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-a');
		let sawNodeBar = false;
		let sawEdgeBar = false;
		store.setCameraPreviewRestorer(() => {
			sawNodeBar = store.selectionActions.selectNavigationNode('tour-d') === false;
			sawEdgeBar =
				store.selectionActions.selectCameraConnectionDirection('tour-a-b', 'forward') ===
				false;
			return true;
		});

		expect(store.stopCameraPreview()).toBe(true);
		// The bars held during teardown, and selection works normally again after.
		expect(sawNodeBar).toBe(true);
		expect(sawEdgeBar).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-d')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'camera', nodeId: 'tour-d' });
	});

	it('review fix — a failed scope install does not snapshot lastSequencePlayhead', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.seekCameraTimeline(0.37)).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);

		// Drive the seam directly with a target whose connection record is gone:
		// every validation failure (record OR route) must return BEFORE the
		// Sequence playhead snapshot commits.
		store.document.connections = store.document.connections.filter(
			(c) => c.id !== 'tour-a-b'
		);
		expect(
			(store as any).installSelectionPreviewScope({
				kind: 'edge',
				connectionId: 'tour-a-b',
				direction: 'forward'
			})
		).toBe(false);

		// Sequence was never left → the saved playhead must stay untouched.
		expect(store.lastSequencePlayhead).toBeNull();
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'paused' });

		// Restore the record and retry through the real selection flow — now the
		// snapshot commits with the successful leave.
		const doc = cloneFixtureDocument();
		store.document.connections = [
			...store.document.connections,
			doc.connections.find((c) => c.id === 'tour-a-b')!
		];
		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);
		expect(store.lastSequencePlayhead).toBeCloseTo(0.37, 6);
		expect(store.cameraPreview).toMatchObject({ kind: 'edge', transport: 'paused' });
	});
});
