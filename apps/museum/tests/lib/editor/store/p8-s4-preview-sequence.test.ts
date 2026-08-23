import { describe, expect, it } from 'vitest';
import { createFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	createEditorCameraTimeline,
	cameraTimelineProgressAtEdgePlayhead,
	getEditorCameraScheduleLocation,
	getEditorCameraTimelineLocation,
	sampleEditorCameraSchedule
} from '$lib/editor/editor-camera-timeline';
import { useCameraTimeline } from '$lib/editor/hooks/use-camera-timeline.svelte';
import { createCameraMotionSample } from '$lib/museum/navigation/camera-motion';

describe('P8 S4 — boundary epsilon (scrub + playback)', () => {
	it('scrub onto a node boundary from below/above resolves the correct edge + direction and writes the playhead', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const timeline = createEditorCameraTimeline(store.state.graph);
		const boundary = timeline.nodeBoundaries.find((b) => b.nodeId === 'tour-paris')!;
		const incoming = timeline.edges.find((e) => e.toNodeId === 'tour-paris')!;
		const outgoing = timeline.edges.find((e) => e.fromNodeId === 'tour-paris')!;
		expect(incoming.connectionId).not.toBe(outgoing.connectionId);

		// From below the boundary the incoming edge ends at playhead 1…
		const below = getEditorCameraTimelineLocation(timeline, boundary.progress - 1e-9);
		expect(below.edge.connectionId).toBe(incoming.connectionId);
		expect(below.playhead).toBeCloseTo(1, 6);

		// …from above, the outgoing edge starts at playhead 0.
		const above = getEditorCameraTimelineLocation(timeline, boundary.progress + 1e-9);
		expect(above.edge.connectionId).toBe(outgoing.connectionId);
		expect(above.playhead).toBeCloseTo(0, 6);

		expect(store.seekCameraTimeline(boundary.progress - 1e-9)).toBe(true);
		expect(store.cameraTimelinePlayhead).toBeCloseTo(boundary.progress - 1e-9, 6);
		expect(store.seekCameraTimeline(boundary.progress + 1e-9)).toBe(true);
		expect(store.cameraTimelinePlayhead).toBeCloseTo(boundary.progress + 1e-9, 6);
	});
});

describe('P8 S4 — global seconds domain / local-progress continuation', () => {
	it('scrub into any transition resolves exact local progress; Play continues there (not at 0)', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const timeline = createEditorCameraTimeline(store.state.graph);
		const progress = cameraTimelineProgressAtEdgePlayhead(timeline, 'tour-b-paris', 'forward', 0.5);
		expect(progress).not.toBeNull();

		expect(store.seekCameraTimeline(progress!)).toBe(true);
		expect(store.cameraTimelinePlayhead).toBeCloseTo(progress!, 6);

		// The same point in the seconds domain resolves the same edge.
		const seconds = progress! * timeline.durationSeconds;
		const schedule = getEditorCameraScheduleLocation(timeline, seconds);
		expect(schedule.edge.connectionId).toBe('tour-b-paris');

		// Exact local progress in the motion domain (no-hold fixture collapses
		// the schedule walk to end poses, so use the motion-span mapping).
		const location = getEditorCameraTimelineLocation(timeline, progress!);
		expect(location.edge.connectionId).toBe('tour-b-paris');
		expect(location.playhead).toBeCloseTo(0.5, 4);

		// Preview Sequence carries the scrubbed position into playback — no reset to 0.
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview?.kind).toBe('sequence');
		expect(store.cameraPreview?.playhead).toBeCloseTo(progress!, 6);
		expect(store.cameraTimelinePlayhead).toBeCloseTo(progress!, 6);
	});
});

describe('P8 S4 — end-of-sequence Replay', () => {
	it('complete → play restarts at 0 with a new runId', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewSequence('director')).toBe(true);
		const runId = store.cameraPreview!.runId;
		expect(store.markCameraPreviewStarted(runId, 100)).toBe(true);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.cameraPreview).toMatchObject({ transport: 'complete', playhead: 1 });
		expect(store.cameraTimelinePlayhead).toBe(1);

		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview).toMatchObject({ transport: 'playing', playhead: 0 });
		expect(store.cameraPreview!.runId).not.toBe(runId);
	});
});

describe('P8 S4 — holds', () => {
	it('schedule keeps the destination pose through the hold span; completes at 1', () => {
		const doc = cloneFixtureDocument();
		const tourParis = doc.navigationNodes.find((n) => n.id === 'tour-paris')!;
		(tourParis as any).holdSeconds = 1.5;
		const store = createMuseumEditorStore({ document: doc });
		store.setWorkspace('camera');
		const timeline = createEditorCameraTimeline(store.state.graph);
		const edge = timeline.edges.find((e) => e.connectionId === 'tour-b-paris')!;
		expect(edge.holdSeconds).toBe(1.5);

		const motionEnd = edge.motionEndSeconds;
		const sEnd = createCameraMotionSample();
		sampleEditorCameraSchedule(timeline, motionEnd, sEnd);
		const sHold = createCameraMotionSample();
		const loc = sampleEditorCameraSchedule(timeline, motionEnd + 0.5, sHold);
		expect(loc.isHolding).toBe(true);
		expect(loc.edgePlayhead).toBe(1);
		expect(sEnd.position.distanceTo(sHold.position)).toBeLessThan(1e-4);

		expect(store.previewSequence('director')).toBe(true);
		const runId = store.cameraPreview!.runId;
		expect(store.markCameraPreviewStarted(runId, 100)).toBe(true);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.cameraPreview?.playhead).toBe(1);
	});
});

describe('P8 S4 — one/two-node flows', () => {
	function oneNodeDocument() {
		const doc = cloneFixtureDocument();
		// Single free node — no order links, no connections. A valid document
		// cannot hold a 1-node flow chain (order links must be reciprocal, and
		// `walkFlowChain` requires the start to have a nextNodeId), so the
		// one-node case resolves to the unbuildable/null-timeline path.
		doc.navigationNodes = [
			{
				...doc.navigationNodes.find((n) => n.id === 'tour-a')!,
				nextNodeId: undefined,
				previousNodeId: undefined,
				connectedNodeIds: []
			}
		] as any;
		doc.connections = [];
		return doc;
	}

	function twoNodeDocument() {
		const doc = cloneFixtureDocument();
		doc.navigationNodes = [
			{
				...doc.navigationNodes.find((n) => n.id === 'tour-a')!,
				nextNodeId: 'tour-b',
				previousNodeId: undefined,
				connectedNodeIds: ['tour-b']
			},
			{
				...doc.navigationNodes.find((n) => n.id === 'tour-b')!,
				nextNodeId: undefined,
				previousNodeId: 'tour-a',
				connectedNodeIds: ['tour-a']
			}
		] as any;
		doc.connections = doc.connections.filter((c) => c.id === 'tour-a-b');
		return doc;
	}

	it('one-node flow — static/no-motion: timeline unbuildable (no fake edge), seek no-ops, previewSequence fails gracefully', () => {
		const store = createMuseumEditorStore({ document: oneNodeDocument() });
		store.setWorkspace('camera');
		expect(store.getCameraTimeline()).toBeNull();

		expect(store.seekCameraTimeline(0.5)).toBe(false);
		expect(store.cameraTimelinePlayhead).toBe(0);

		expect(store.previewSequence('director')).toBe(false);
		expect(store.cameraPreview).toBeNull();
	});

	it('two-node flow — exactly one edge, no loop, plays once and completes at 1', () => {
		const store = createMuseumEditorStore({ document: twoNodeDocument() });
		store.setWorkspace('camera');
		expect(store.flowLoopConnectionId).toBeNull();
		const timeline = createEditorCameraTimeline(store.state.graph);
		expect(timeline.edges).toHaveLength(1);
		expect(timeline.edges[0]!.connectionId).toBe('tour-a-b');
		expect(timeline.durationSeconds).toBeGreaterThan(0);

		expect(store.previewSequence('director')).toBe(true);
		const runId = store.cameraPreview!.runId;
		expect(store.markCameraPreviewStarted(runId, 100)).toBe(true);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.cameraPreview).toMatchObject({ transport: 'complete', playhead: 1 });
	});
});

describe('P8 S4 — loop-topology derivation', () => {
	it('real tail→head closing connection is a timeline edge; edgeRepeat never alters topology', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.flowLoopConnectionId).toBe('tour-d-a');
		const timeline = createEditorCameraTimeline(store.state.graph);
		expect(timeline.edges).toHaveLength(4);
		expect(timeline.edges.at(-1)!.connectionId).toBe('tour-d-a');
		const durationBefore = timeline.durationSeconds;

		// An edgeRepeat auto-restart cycle must not touch the guided timeline.
		const connId = store.document.connections[0]!.id;
		expect(store.previewEdge(connId, 'forward')).toBe(true);
		expect(store.setEdgePreviewRepeat(true)).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		const runId = store.cameraPreview!.runId;
		expect(store.markCameraPreviewStarted(runId, 100)).toBe(true);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing'); // auto-restarted

		const after = createEditorCameraTimeline(store.state.graph);
		expect(after.edges).toHaveLength(4);
		expect(after.durationSeconds).toBe(durationBefore);
		expect(store.flowLoopConnectionId).toBe('tour-d-a');
	});

	it('breaking the closing tour link drops the closing edge (no-loop variant)', () => {
		const doc = cloneFixtureDocument();
		// The validator pairs adjacency with connection records, so remove the
		// record AND the adjacency, and break the reciprocal tour links.
		doc.connections = doc.connections.filter((c) => c.id !== 'tour-d-a');
		const tourA = doc.navigationNodes.find((n) => n.id === 'tour-a')!;
		tourA.previousNodeId = undefined;
		tourA.connectedNodeIds = tourA.connectedNodeIds.filter((id) => id !== 'tour-d');
		const tourD = doc.navigationNodes.find((n) => n.id === 'tour-d')!;
		tourD.nextNodeId = undefined;
		tourD.connectedNodeIds = tourD.connectedNodeIds.filter((id) => id !== 'tour-a');
		const store = createMuseumEditorStore({ document: doc });
		store.setWorkspace('camera');
		expect(store.flowLoopConnectionId).toBeNull();
		const timeline = createEditorCameraTimeline(store.state.graph);
		expect(timeline.edges).toHaveLength(3);
		expect(timeline.edges.at(-1)!.connectionId).toBe('tour-paris-d');
	});
});

describe('P8 S4 — context-sensitive play demoted', () => {
	it('sequence play is sequence-transport only — reverse + selected connection no longer hijacks to edge transport', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const conn = store.document.connections[0]!;
		store.selectionActions.selectCameraConnectionDirection(conn.id, 'forward');
		expect(store.toggleCameraEdgeReverse()).toBe(true);
		expect(store.activeCameraDirection).toBe('reverse');

		useCameraTimeline(store).toggleTourPlayback();
		expect(store.cameraPreview?.kind).toBe('sequence');
		expect(store.cameraPreview?.transport).toBe('playing');

		// Explicit edge transport stays available via the EdgeRuler command path.
		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.previewEdge(conn.id, 'reverse')).toBe(true);
		expect(store.cameraPreview?.kind).toBe('edge');
		const preview = store.cameraPreview as Extract<typeof store.cameraPreview, { kind: 'edge' }>;
		expect(preview.direction).toBe('reverse');
	});
});

describe('P8 S4 — previewSequence restore (S2 D6 regression)', () => {
	it('valid lastSequencePlayhead → tour installs at the restored playhead', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.seekCameraTimeline(0.42)).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);
		const saved = store.cameraTimelinePlayhead;
		const connId = store.document.connections[0]!.id;
		expect(store.previewEdge(connId, 'forward')).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview?.kind).toBe('sequence');
		expect(store.cameraTimelinePlayhead).toBeCloseTo(saved, 6);
	});

	it('P7.5 — facade cameraTimelinePlayhead reads through the timeline controller owned field', () => {
		const store = createFixtureEditorStore();
		expect(store.cameraTimelinePlayhead).toBe(
			store.cameraTimelineController.cameraTimelinePlayhead
		);
		expect(store.seekCameraTimeline(0.37)).toBe(true);
		expect(store.cameraTimelineController.cameraTimelinePlayhead).toBeCloseTo(0.37, 6);
		expect(store.cameraTimelinePlayhead).toBe(
			store.cameraTimelineController.cameraTimelinePlayhead
		);
	});
});
