import { describe, expect, it } from 'vitest';
import { chopinRuntime } from '$lib/content/chopin-project';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { useCameraTimeline } from '$lib/editor/hooks/use-camera-timeline.svelte';
import { createFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';

function addUnsequencedCamera() {
	const document = cloneFixtureDocument();
	const template = document.navigationNodes[0]!;
	document.navigationNodes.push({
		...template,
		id: 'free-camera',
		label: 'Free Camera',
		connectedNodeIds: [],
		nextNodeId: undefined,
		previousNodeId: undefined
	});
	return document;
}

function boundaryAt(store: ReturnType<typeof createFixtureEditorStore>, nodeId: string, occurrence = 0) {
	const timeline = store.getCameraTimeline();
	if (!timeline) throw new Error('fixture timeline unavailable');
	const boundary = timeline.nodeBoundaries.filter((item) => item.nodeId === nodeId)[occurrence];
	if (!boundary) throw new Error(`missing ${nodeId} boundary ${occurrence}`);
	return boundary;
}

/**
 * P12.2 migration of the P11.1 pins. Selection is now selection-only except
 * for a sequenced-node click while Sequence is active; explicit Preview Edge
 * / Preview Camera commands own scope entry.
 */
describe('P12.2 selection matrix', () => {
	it('ordinary node selection changes selection only; it does not install Camera scope', () => {
		const store = createFixtureEditorStore();

		expect(store.selectionActions.selectNavigationNode('tour-a')).toBe(true);
		expect(store.navigationSelection).toMatchObject({ kind: 'node', nodeId: 'tour-a' });
		expect(store.cameraPreview).toBeNull();
	});

	it('ordinary Edge selection changes selection only; it does not install Edge scope', () => {
		const store = createFixtureEditorStore();

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);
		expect(store.navigationSelection).toMatchObject({
			kind: 'connection',
			connectionId: 'tour-a-b'
		});
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.cameraPreview).toBeNull();
	});

	it('Edge selection stays selection-only while Sequence plays', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('visitor')).toBe(true);
		const before = { ...store.cameraPreview! };

		expect(store.selectionActions.selectConnection('tour-b-paris')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			runId: before.runId,
			transport: 'playing',
			playhead: before.playhead
		});
	});

	it('sequenced-node selection stays selection-only in Edge scope', () => {
		const store = createFixtureEditorStore();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		const before = { ...store.cameraPreview! };

		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			runId: before.runId,
			transport: 'paused',
			playhead: before.playhead
		});
	});

	it('unsequenced-node selection stays selection-only in Sequence scope', () => {
		const store = createEditorStore({ document: addUnsequencedCamera(), rooms: chopinRuntime.rooms });
		expect(store.previewSequence('visitor')).toBe(true);
		const before = { ...store.cameraPreview! };

		expect(store.selectionActions.selectNavigationNode('free-camera')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			runId: before.runId,
			transport: 'playing',
			playhead: before.playhead
		});
	});

	it('sequenced-node click in Sequence seeks its boundary, pauses, and suppresses focus framing', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('director')).toBe(true);
		const focusVersion = store.cameraFocusVersion;
		const boundary = boundaryAt(store, 'tour-b');

		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			transport: 'paused',
			playhead: boundary.progress
		});
		expect(store.cameraTimelinePlayhead).toBeCloseTo(boundary.progress, 8);
		expect(store.navigationSelection).toMatchObject({ kind: 'node', nodeId: 'tour-b' });
		expect(store.cameraFocusVersion).toBe(focusVersion);
	});

	it('re-clicking a selected sequenced node while playing still seeks and pauses', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('director')).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.2)).toBe(true);
		const runId = store.cameraPreview!.runId;
		const boundary = boundaryAt(store, 'tour-b');

		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			runId,
			transport: 'paused',
			playhead: boundary.progress
		});
	});

	it('re-clicking a selected node is a no-op only when already paused at its exact boundary', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('director')).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(true);
		const runId = store.cameraPreview!.runId;
		const playhead = store.cameraPreview!.playhead;

		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(false);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			runId,
			transport: 'paused',
			playhead
		});
	});

	it('timeline node-dot selection seeks exactly once and keeps Sequence scope', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('director')).toBe(true);
		const timeline = store.getCameraTimeline()!;
		const boundary = timeline.nodeBoundaries.find((item) => item.nodeId === 'tour-b')!;

		expect(store.selectCameraTimelineNode('tour-b', boundary.boundaryIndex)).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'paused' });
		expect(store.cameraTimelinePlayhead).toBeCloseTo(boundary.progress, 8);
	});

	it('generic loop-node selection chooses the nearest occurrence', () => {
		const store = createFixtureEditorStore();
		const timeline = store.getCameraTimeline()!;
		const occurrences = timeline.nodeBoundaries.filter((item) => item.nodeId === 'tour-a');
		expect(occurrences).toHaveLength(2);
		expect(store.previewSequence('director')).toBe(true);
		const last = occurrences.at(-1)!;
		expect(store.seekSequencePreview(0.9)).toBe(true);

		expect(store.selectionActions.selectNavigationNode('tour-a')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'paused' });
		expect(store.cameraTimelinePlayhead).toBeCloseTo(last.progress, 8);
	});

	it('a post-gap Sequence keeps its evaluable prefix and exposes the last boundary', () => {
		const store = createFixtureEditorStore();
		store.state.graph.connections = store.state.graph.connections.filter(
			(connection) => connection.id !== 'tour-b-paris'
		);

		expect(store.previewSequence('director')).toBe(true);
		const api = useCameraTimeline(store);
		const last = api.timelineResult.lastEvaluableBoundary!;
		expect(api.timelineResult.diagnostic).toEqual({
			kind: 'gap',
			fromNodeId: 'tour-b',
			toNodeId: 'tour-paris'
		});
		const timeline = api.timelineResult.timeline;
		expect(timeline && 'edges' in timeline ? timeline.edges : []).toHaveLength(1);
		expect(last.nodeId).toBe('tour-b');

		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			transport: 'paused',
			playhead: last.progress
		});

		expect(store.previewSequence('director')).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			transport: 'paused',
			playhead: last.progress
		});
	});

	it('a gap before the first edge leaves Sequence unavailable', () => {
		const store = createFixtureEditorStore();
		store.state.graph.connections = store.state.graph.connections.filter(
			(connection) => connection.id !== 'tour-a-b'
		);

		expect(store.previewSequence('director')).toBe(false);
		expect(store.cameraPreview).toBeNull();
		expect(useCameraTimeline(store).timelineResult).toMatchObject({
			timeline: null,
			diagnostic: { kind: 'gap', fromNodeId: 'tour-a', toNodeId: 'tour-b' },
			lastEvaluableBoundary: null
		});
	});

	it('invalid and true no-op seeks do not pause an active preview', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('visitor')).toBe(true);
		const current = store.cameraPreview!.playhead;

		expect(store.seekSequencePreview(Number.NaN)).toBe(false);
		expect(store.seekSequencePreviewForNode('missing-node')).toBe(false);
		expect(store.seekSequencePreview(current)).toBe(false);
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'playing', playhead: current });
	});

	it('explicit Preview Edge selects the Edge and is the only ordinary Edge-scope entry', () => {
		const store = createFixtureEditorStore();
		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);
		expect(store.cameraPreview).toBeNull();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(store.navigationSelection).toMatchObject({
			kind: 'connection',
			connectionId: 'tour-a-b'
		});
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: 'tour-a-b',
			transport: 'paused',
			playhead: 0
		});
	});

	it('Preview Camera is available for an unsequenced node and commits its selection', () => {
		const store = createEditorStore({ document: addUnsequencedCamera(), rooms: chopinRuntime.rooms });

		expect(store.previewCamera('free-camera', 'director')).toBe(true);
		expect(store.navigationSelection).toMatchObject({ kind: 'node', nodeId: 'free-camera' });
		expect(store.cameraPreview).toMatchObject({
			kind: 'camera',
			nodeId: 'free-camera',
			transport: 'paused',
			playhead: 0
		});
	});

	it('Preview Camera rejects a sequenced node and points to Sequence inspection', () => {
		const store = createFixtureEditorStore();

		expect(store.previewCamera('tour-a', 'director')).toBe(false);
		expect(store.cameraPreview).toBeNull();
		expect(store.statusMessage).toMatch(/Sequence scope/i);
	});

	it('transport seek and step pause both modes without changing scope or selection', () => {
		const sequence = createFixtureEditorStore();
		expect(sequence.previewSequence('visitor')).toBe(true);
		const sequenceSelection = sequence.navigationSelection;
		expect(sequence.stepCameraPreview(1)).toBe(true);
		expect(sequence.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'paused' });
		expect(sequence.navigationSelection).toEqual(sequenceSelection);

		const edge = createFixtureEditorStore();
		expect(edge.previewEdge('tour-a-b', 'forward', 'visitor')).toBe(true);
		const edgeSelection = edge.navigationSelection;
		expect(edge.seekEdgePreview(0.4)).toBe(true);
		expect(edge.cameraPreview).toMatchObject({ kind: 'edge', transport: 'paused', playhead: 0.4 });
		expect(edge.navigationSelection).toEqual(edgeSelection);
	});
});
