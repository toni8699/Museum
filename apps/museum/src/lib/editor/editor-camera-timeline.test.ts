import {
	createNavigationGraph,
	museumSceneDocument,
	resolveSceneDocument
} from '$lib/content/scene';
import {
	cameraMotionEdgeProgressAtProgress,
	cameraMotionProgressAtEdgeProgress,
	createCameraMotionSample,
	sampleCameraMotion
} from '$lib/museum/navigation/camera-motion';
import { describe, expect, it } from 'vitest';
import { cloneMuseumSceneDocument } from './museum-editor.svelte';
import {
	cameraTimelineEdgePlayheadAtProgress,
	cameraTimelineProgressAtEdgeProgress,
	createEditorCameraTimeline,
	getEditorCameraTimelineLocation
} from './editor-camera-timeline';

describe('editor camera timeline index', () => {
	it('indexes one complete guided cycle including the final return edge', () => {
		const graph = createNavigationGraph(resolveSceneDocument(museumSceneDocument));
		const timeline = createEditorCameraTimeline(graph);

		expect(timeline.startNodeId).toBe('entrance-start');
		expect(timeline.edges).toHaveLength(8);
		expect(timeline.nodeBoundaries).toHaveLength(9);
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
			expect(edge.startSeconds).toBe(
				index === 0 ? 0 : timeline.edges[index - 1]!.endSeconds
			);
			expect(edge.durationSeconds).toBeGreaterThan(0);
			expect(edge.endSeconds).toBe(edge.startSeconds + edge.durationSeconds);
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
});
