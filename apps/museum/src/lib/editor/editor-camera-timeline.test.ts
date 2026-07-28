import {
	createNavigationGraph,
	museumSceneDocument,
	resolveSceneDocument
} from '$lib/content/scene';
import {
	cameraMotionEdgeProgressAtProgress,
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion,
	createCameraMotionSample,
	sampleCameraMotion
} from '$lib/museum/navigation/camera-motion';
import { getCameraRoute } from '$lib/museum/navigation/camera-route';
import { describe, expect, it } from 'vitest';
import { cloneMuseumSceneDocument } from './museum-editor.svelte';
import {
	cameraTimelineEdgePlayheadAtProgress,
	cameraTimelineEdgeProgressAtProgress,
	cameraTimelineProgressAtEdgeProgress,
	createEditorCameraTimeline,
	getEditorCameraScheduleLocation,
	getEditorCameraTimelineLocation,
	sampleEditorCameraSchedule,
	sampleEditorCameraTimeline
} from './editor-camera-timeline';

describe('editor camera timeline index', () => {
	it('indexes one complete guided cycle including the final return edge', () => {
		const graph = createNavigationGraph(resolveSceneDocument(museumSceneDocument));
		const timeline = createEditorCameraTimeline(graph);

		expect(timeline.startNodeId).toBe('entrance-start');
		expect(timeline.edges).toHaveLength(9);
		expect(timeline.nodeBoundaries).toHaveLength(10);
		expect(timeline.nodeBoundaries[0]).toMatchObject({
			nodeId: 'entrance-start',
			progress: 0
		});
		expect(timeline.nodeBoundaries.at(-1)).toMatchObject({
			nodeId: 'entrance-start',
			progress: 1
		});
		expect(timeline.edges.at(-1)).toMatchObject({
			fromNodeId: 'legacy-return',
			toNodeId: 'entrance-start'
		});
		expect(timeline.durationSeconds).toBeGreaterThan(0);

		for (const [index, edge] of timeline.edges.entries()) {
			expect(edge.motionStartSeconds).toBe(
				index === 0 ? 0 : timeline.edges[index - 1]!.motionEndSeconds
			);
			expect(edge.motionDurationSeconds).toBeGreaterThan(0);
			expect(edge.motionEndSeconds).toBe(
				edge.motionStartSeconds + edge.motionDurationSeconds
			);
		}
	});

	it('maps forward and reverse key progress onto the same physical ruler point', () => {
		const graph = createNavigationGraph(resolveSceneDocument(museumSceneDocument));
		const timeline = createEditorCameraTimeline(graph);
		const connectionId = timeline.edges[0]!.connectionId;
		const forward = cameraTimelineProgressAtEdgeProgress(
			timeline,
			connectionId,
			'forward',
			0.31
		);
		const reverse = cameraTimelineProgressAtEdgeProgress(
			timeline,
			connectionId,
			'reverse',
			0.69
		);

		expect(forward).not.toBeNull();
		expect(reverse).toBeCloseTo(forward!, 8);
		const reversePlayhead = cameraTimelineEdgePlayheadAtProgress(
			timeline,
			connectionId,
			'reverse',
			reverse!
		)!;
		expect(
			cameraMotionEdgeProgressAtProgress(
				timeline.edges[0]!.motions.reverse,
				0,
				reversePlayhead
			)
		).toBeCloseTo(0.69, 8);
	});

	it('maps timeline drag positions back to directional persisted edge progress', () => {
		const graph = createNavigationGraph(resolveSceneDocument(museumSceneDocument));
		const timeline = createEditorCameraTimeline(graph);
		const connectionId = timeline.edges[0]!.connectionId;

		for (const direction of ['forward', 'reverse'] as const) {
			const rulerProgress = cameraTimelineProgressAtEdgeProgress(
				timeline,
				connectionId,
				direction,
				0.37
			)!;
			expect(
				cameraTimelineEdgeProgressAtProgress(
					timeline,
					connectionId,
					direction,
					rulerProgress
				)
			).toBeCloseTo(0.37, 8);
		}
	});

	it('samples an authored framing key through the shared motion compiler', () => {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
		const connection = document.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: 'timeline-forward-key',
					progress: 0.42,
					cameraTarget: [100, 2, 100],
					fov: 47
				}
			],
			reverse: []
		};
		const timeline = createEditorCameraTimeline(
			createNavigationGraph(resolveSceneDocument(document))
		);
		const edge = timeline.edges.find(
			(candidate) => candidate.connectionId === connection.id
		)!;
		const playhead = cameraMotionProgressAtEdgeProgress(
			edge.motions.forward,
			0,
			0.42
		);
		const sample = createCameraMotionSample();
		sampleCameraMotion(edge.motions.forward, playhead, sample);

		expect(sample.target.toArray()).toEqual([100, 2, 100]);
		expect(sample.fov).toBe(47);
		const globalProgress = cameraTimelineProgressAtEdgeProgress(
			timeline,
			connection.id,
			'forward',
			0.42
		)!;
		const location = getEditorCameraTimelineLocation(timeline, globalProgress);
		expect(location.edge.connectionId).toBe(connection.id);
		expect(location.playhead).toBeCloseTo(playhead, 8);
	});

	it('samples the same exact connection motion used by the live visitor', () => {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
		const connection = document.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: 'exact-edge-forward-key',
					progress: 0.42,
					cameraTarget: [100, 2, 100],
					fov: 47
				}
			],
			reverse: []
		};
		const graph = createNavigationGraph(resolveSceneDocument(document));
		const timeline = createEditorCameraTimeline(graph);
		const globalProgress = cameraTimelineProgressAtEdgeProgress(
			timeline,
			connection.id,
			'forward',
			0.42
		)!;
		const timelineSample = createCameraMotionSample();
		const location = sampleEditorCameraTimeline(
			timeline,
			globalProgress,
			timelineSample
		);
		const visitorSample = createCameraMotionSample();
		const startNode = graph.nodeById.get(location.edge.fromNodeId)!;
		const visitorMotion = createCameraMotion(
			getCameraRoute(location.edge.fromNodeId, location.edge.toNodeId, graph),
			{
				position: startNode.position,
				target: startNode.cameraTarget,
				fov: startNode.fov
			}
		);
		sampleCameraMotion(
			visitorMotion,
			location.playhead,
			visitorSample
		);

		expect(timelineSample.position.toArray()).toEqual(visitorSample.position.toArray());
		expect(timelineSample.target.toArray()).toEqual([100, 2, 100]);
		expect(timelineSample.target.toArray()).toEqual(visitorSample.target.toArray());
		expect(timelineSample.fov).toBe(47);
		expect(timelineSample.fov).toBe(visitorSample.fov);
	});

	it('lands on each authored node pose before the next exact edge starts', () => {
		const graph = createNavigationGraph(resolveSceneDocument(museumSceneDocument));
		const timeline = createEditorCameraTimeline(graph);
		const sample = createCameraMotionSample();

		for (const boundary of timeline.nodeBoundaries.slice(1, -1)) {
			sampleEditorCameraTimeline(timeline, boundary.progress, sample);
			const node = graph.nodeById.get(boundary.nodeId)!;
			for (const [index, value] of sample.position.toArray().entries()) {
				expect(value).toBeCloseTo(node.position[index]!, 10);
			}
			for (const [index, value] of sample.target.toArray().entries()) {
				expect(value).toBeCloseTo(node.cameraTarget[index]!, 10);
			}
			expect(sample.fov).toBeCloseTo(node.fov, 10);
		}
	});

	it('matches live visitor sampling across every guided connection', () => {
		const graph = createNavigationGraph(resolveSceneDocument(museumSceneDocument));
		const timeline = createEditorCameraTimeline(graph);
		const timelineSample = createCameraMotionSample();
		const visitorSample = createCameraMotionSample();

		for (const edge of timeline.edges) {
			const startNode = graph.nodeById.get(edge.fromNodeId)!;
			const visitorMotion = createCameraMotion(
				getCameraRoute(edge.fromNodeId, edge.toNodeId, graph),
				{
					position: startNode.position,
					target: startNode.cameraTarget,
					fov: startNode.fov
				}
			);
			for (const progress of [0, 0.17, 0.5, 0.83, 1]) {
				sampleCameraMotion(edge.motions[edge.direction], progress, timelineSample);
				sampleCameraMotion(visitorMotion, progress, visitorSample);
				for (const [index, value] of timelineSample.position.toArray().entries()) {
					expect(value).toBeCloseTo(visitorSample.position.getComponent(index), 10);
				}
				for (const [index, value] of timelineSample.target.toArray().entries()) {
					expect(value).toBeCloseTo(visitorSample.target.getComponent(index), 10);
				}
				expect(timelineSample.fov).toBeCloseTo(visitorSample.fov, 10);
			}
		}
	});

	it('rejects a broken reciprocal guided link instead of guessing', () => {
		const scene = resolveSceneDocument(museumSceneDocument);
		const navigationNodes = scene.navigationNodes.map((node) => ({
			...node,
			position: [...node.position] as [number, number, number],
			cameraTarget: [...node.cameraTarget] as [number, number, number],
			connectedNodeIds: [...node.connectedNodeIds]
		}));
		const poland = navigationNodes.find((node) => node.id === 'poland-threshold')!;
		poland.previousNodeId = 'legacy-return';
		const graph = {
			navigationNodes,
			connections: scene.connections,
			nodeById: new Map(navigationNodes.map((node) => [node.id, node]))
		};

		expect(() => createEditorCameraTimeline(graph)).toThrow(/not reciprocal/);
	});

	it('extends the schedule with destination-node holds and respects authored overrides', () => {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
		(document as { version: 4 }).version = 4;
		const target = document.navigationNodes.find((node) => node.id === 'poland-threshold')!;
		target.holdSeconds = 14.5;
		const first = document.connections.find((c) => c.id === 'entrance-poland')!;
		first.timing = { forward: { durationSeconds: 9.25, easing: 'ease-in' } };

		const timeline = createEditorCameraTimeline(
			createNavigationGraph(resolveSceneDocument(document))
		);

		const firstEdge = timeline.edges[0]!;
		expect(firstEdge.motionDurationSeconds).toBe(9.25);
		expect(firstEdge.holdSeconds).toBe(14.5);
		expect(firstEdge.motionEndSeconds - firstEdge.motionStartSeconds).toBe(9.25);
		expect(firstEdge.holdEndSeconds).toBe(firstEdge.motionEndSeconds + 14.5);
		expect(timeline.totalHoldSeconds).toBeGreaterThanOrEqual(14.5);
		expect(timeline.durationSeconds).toBe(
			timeline.motionDurationSeconds + timeline.totalHoldSeconds
		);
		expect(timeline.nodeBoundaries[0]?.progress).toBe(0);
		expect(timeline.nodeBoundaries.at(-1)?.progress).toBe(1);
	});

	it('lands on the destination pose and reports a zero-progress hold tail without movement', () => {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
		(document as { version: 4 }).version = 4;
		const poland = document.navigationNodes.find((node) => node.id === 'poland-threshold')!;
		poland.holdSeconds = 6;
		const timeline = createEditorCameraTimeline(
			createNavigationGraph(resolveSceneDocument(document))
		);
		const firstEdge = timeline.edges[0]!;
		const intoHold = firstEdge.motionEndSeconds + 2;
		const location = getEditorCameraScheduleLocation(timeline, intoHold);
		expect(location.isHolding).toBe(true);
		expect(location.holdingNodeId).toBe('poland-threshold');
		expect(location.edgePlayhead).toBe(1);
		expect(location.holdProgress).toBeCloseTo(2 / 6, 8);

		const before = createCameraMotionSample();
		const after = createCameraMotionSample();
		sampleEditorCameraSchedule(timeline, firstEdge.motionEndSeconds, before);
		sampleEditorCameraSchedule(timeline, firstEdge.motionEndSeconds + 5.9, after);
		for (const [index] of before.position.toArray().entries()) {
			expect(after.position.getComponent(index)).toBeCloseTo(
				before.position.getComponent(index),
				10
			);
		}
		for (const [index] of before.target.toArray().entries()) {
			expect(after.target.getComponent(index)).toBeCloseTo(
				before.target.getComponent(index),
				10
			);
		}
		expect(after.fov).toBeCloseTo(before.fov, 10);
	});

	it('collapses every motion span to its end pose under reduced motion', () => {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
		(document as { version: 4 }).version = 4;
		document.navigationNodes.forEach((node, index) => {
			if (index % 2 === 0) node.holdSeconds = 4;
		});
		const timeline = createEditorCameraTimeline(
			createNavigationGraph(resolveSceneDocument(document))
		);
		const sample = createCameraMotionSample();
		const midMotion = createCameraMotionSample();

		offTheEnd: {
			const oob = getEditorCameraScheduleLocation(
				timeline,
				timeline.motionDurationSeconds + 1000,
				true
			);
			expect(oob.edgeIndex).toBe(timeline.edges.length - 1);
			expect(oob.edgePlayhead).toBe(1);
			expect(oob.isHolding).toBe(false);
		}

		for (const [edgeIndex, edge] of timeline.edges.entries()) {
			sampleEditorCameraSchedule(timeline, edge.motionEndSeconds, sample, true);
			sampleCameraMotion(edge.motions[edge.direction], 1, midMotion);
			expect(sample.position.toArray()).toEqual(midMotion.position.toArray());
			expect(sample.target.toArray()).toEqual(midMotion.target.toArray());
			expect(sample.fov).toBeCloseTo(midMotion.fov, 10);
			const reduced = getEditorCameraScheduleLocation(timeline, edge.motionEndSeconds + edge.holdSeconds + 1, true);
			expect(reduced.isHolding).toBe(false);
			expect(reduced.edgePlayhead).toBe(1);
			expect(reduced.edgeIndex).toBeGreaterThanOrEqual(edgeIndex);
		}
	});
});
