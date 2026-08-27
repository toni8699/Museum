import { describe, expect, it } from 'vitest';
import { chopinRuntime } from '$lib/content/chopin-project';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { useCameraTimeline } from '$lib/editor/hooks/use-camera-timeline.svelte';
import {
	createEditorCameraTimelineResolution
} from '$lib/editor/camera/editor-camera-timeline';
import { resolveFlowRoute } from '$lib/museum/navigation/camera-route';
import { createRelicFixtureEditorStore, createFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';

describe('P12.2 transport and route matrix', () => {
	it('transport seek pauses a playing Observer Sequence without changing selection or scope', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('visitor')).toBe(true);
		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);
		const selection = store.navigationSelection;

		expect(store.seekSequencePreview(0.25)).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			mode: 'visitor',
			transport: 'paused',
			playhead: 0.25
		});
		expect(store.navigationSelection).toEqual(selection);
	});

	it('transport seek pauses a playing Observer Edge without changing selection or scope', () => {
		const store = createFixtureEditorStore();
		expect(store.previewEdge('tour-a-b', 'forward', 'visitor')).toBe(true);
		const selection = store.navigationSelection;

		expect(store.seekEdgePreview(0.35)).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			mode: 'visitor',
			transport: 'paused',
			playhead: 0.35
		});
		expect(store.navigationSelection).toEqual(selection);
	});

	it('step is pure transport in Sequence and Edge scopes, including Observer mode', () => {
		const sequence = createFixtureEditorStore();
		expect(sequence.previewSequence('visitor')).toBe(true);
		const sequenceSelection = sequence.navigationSelection;
		expect(sequence.stepCameraTimeline(1)).toBe(true);
		expect(sequence.cameraPreview).toMatchObject({
			kind: 'sequence',
			transport: 'paused'
		});
		expect(sequence.cameraPreview!.playhead).toBeGreaterThan(0);
		expect(sequence.navigationSelection).toEqual(sequenceSelection);

		const edge = createFixtureEditorStore();
		expect(edge.previewEdge('tour-a-b', 'forward', 'visitor')).toBe(true);
		const edgeSelection = edge.navigationSelection;
		expect(edge.stepCameraTimeline(1)).toBe(true);
		expect(edge.cameraPreview).toMatchObject({ kind: 'edge', transport: 'paused' });
		expect(edge.cameraPreview!.playhead).toBeGreaterThan(0);
		expect(edge.navigationSelection).toEqual(edgeSelection);
	});

	it('invalid and no-op targets leave playing transport untouched', () => {
		const sequence = createFixtureEditorStore();
		expect(sequence.previewSequence('visitor')).toBe(true);
		const sequenceProgress = sequence.cameraPreview!.playhead;
		expect(sequence.seekSequencePreview(Number.NaN)).toBe(false);
		expect(sequence.seekSequencePreviewForNode('missing')).toBe(false);
		expect(sequence.seekSequencePreview(sequenceProgress)).toBe(false);
		expect(sequence.cameraPreview?.transport).toBe('playing');

		const edge = createFixtureEditorStore();
		expect(edge.previewEdge('tour-a-b', 'forward', 'visitor')).toBe(true);
		expect(edge.playCameraPreview()).toBe(true);
		expect(edge.seekEdgePreview(Number.NaN)).toBe(false);
		expect(edge.seekEdgePreview(0)).toBe(false);
		expect(edge.cameraPreview?.transport).toBe('playing');
	});

	it('interaction guard runs before transport pause', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('visitor')).toBe(true);
		store.setTransformInteractionActive(true, 'camera');

		expect(store.seekSequencePreview(0.5)).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');

		store.setTransformInteractionActive(false);
	});

	it('camera-route resolution retains a canonical evaluable prefix and typed gap', () => {
		const store = createFixtureEditorStore();
		store.state.graph.connections = store.state.graph.connections.filter(
			(connection) => connection.id !== 'tour-b-paris'
		);

		const route = resolveFlowRoute('tour-a', store.state.graph, { loop: true });
		expect(route.gap).toEqual({ fromNodeId: 'tour-b', toNodeId: 'tour-paris' });
		expect(route.route?.nodeIds).toEqual(['tour-a', 'tour-b']);
		expect(route.route?.edges).toHaveLength(1);

		const timeline = createEditorCameraTimelineResolution(store.state.graph);
		expect(timeline.diagnostic).toEqual({
			kind: 'gap',
			fromNodeId: 'tour-b',
			toNodeId: 'tour-paris'
		});
		expect(timeline.timeline?.nodeBoundaries.at(-1)?.nodeId).toBe('tour-b');
	});

	it('relic editor preserves P11 selection scopes, Preview Camera, and seek refusal', () => {
		const store = createRelicFixtureEditorStore();
		expect(store.selectionActions.selectNavigationNode('tour-a')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'camera',
			nodeId: 'tour-a',
			transport: 'paused'
		});
		const selection = store.navigationSelection;

		expect(store.previewCamera('tour-a', 'visitor')).toBe(true);
		expect(store.navigationSelection).toEqual(selection);

		expect(store.previewSequence('visitor')).toBe(true);
		const sequencePlayhead = store.cameraPreview!.playhead;
		expect(store.seekSequencePreview(0.5)).toBe(false);
		expect(store.stepCameraPreview(1)).toBe(false);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			mode: 'visitor',
			transport: 'playing',
			playhead: sequencePlayhead
		});

		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			transport: 'paused',
			connectionId: 'tour-a-b'
		});
	});

	it('zero-duration Sequence node click inspects boundary but disables transport', () => {
		const document = cloneFixtureDocument();
		for (const node of document.navigationNodes) node.holdSeconds = 0;
		for (const connection of document.connections) {
			connection.timing = {
				...(connection.timing ?? {}),
				forward: {
					...(connection.timing?.forward ?? {}),
					durationSeconds: 1e-12
				}
			};
		}
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		const timeline = store.getCameraTimeline()!;
		const boundary = timeline.nodeBoundaries.find((candidate) => candidate.nodeId === 'tour-b')!;
		const api = useCameraTimeline(store);

		expect(timeline.durationSeconds).toBeLessThanOrEqual(1e-9);
		expect(store.previewSequence('director')).toBe(true);
		expect(api.canPlay).toBe(false);
		expect(api.scrubDisabled).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(true);
		expect(store.navigationSelection).toMatchObject({ kind: 'node', nodeId: 'tour-b' });
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			transport: 'paused',
			playhead: boundary.progress
		});
		expect(store.cameraTimelinePlayhead).toBe(boundary.progress);
		expect(store.stepCameraTimeline(1)).toBe(false);
		expect(api.canPlay).toBe(false);
	});

	it('idle Sequence shell keeps Play entry but gates scrub and step', () => {
		const store = createFixtureEditorStore();
		const api = useCameraTimeline(store);
		const initialPlayhead = store.cameraTimelinePlayhead;

		expect(api.sequenceActive).toBe(false);
		expect(api.canPlay).toBe(true);
		expect(api.scrubDisabled).toBe(true);
		expect(store.seekCameraTimeline(0.5)).toBe(false);
		expect(store.stepCameraTimeline(1)).toBe(false);
		expect(store.cameraTimelinePlayhead).toBe(initialPlayhead);
		expect(store.cameraPreview).toBeNull();

		api.toggleTourPlayback();
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'playing' });
	});

	it('playing Observer keeps selection enabled but blocks framing writes', () => {
		const document = cloneFixtureDocument();
		const connection = document.connections.find((candidate) => candidate.id === 'tour-a-b')!;
		connection.viewTracks = {
			forward: [
				{
					id: 'observer-key',
					progress: 0.5,
					cameraTarget: [0, 1, 0],
					fov: 50
				}
			],
			reverse: [],
			framingEnvelope: {
				forward: { enterStart: 0.1, enterEnd: 0.2, exitStart: 0.8, exitEnd: 0.9 }
			}
		};
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		expect(store.previewSequence('visitor')).toBe(true);
		const api = useCameraTimeline(store);
		expect(api.selectionDisabled).toBe(false);
		expect(api.framingDisabled).toBe(true);
		expect(
			store.selectCameraTimelineViewKeyframe('tour-a-b', 'forward', 'observer-key')
		).toBe(true);
		expect(store.navigationSelection).toMatchObject({
			kind: 'view-keyframe',
			keyframeId: 'observer-key'
		});
		const before = store.canonicalJson;
		expect(
			store.beginViewKeyframeProgressDrag({
				connectionId: 'tour-a-b',
				direction: 'forward',
				keyframeId: 'observer-key'
			})
		).toBe(false);
		expect(store.beginFramingEnvelopeHandleDrag('tour-a-b', 'forward')).toBe(false);
		expect(store.canonicalJson).toBe(before);
		expect(store.cameraPreview?.transport).toBe('playing');
	});

	it('static Camera preview remains available only for unsequenced nodes', () => {
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
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		expect(store.previewCamera('free-camera', 'director')).toBe(true);
		expect(useCameraTimeline(store).scope).toBe('camera');
		expect(store.previewCamera('tour-a', 'director')).toBe(false);
	});
});
