import {
	cloneFixtureDocument,
	loadFixtureScene
} from '../content/__fixtures__/load-fixture-scene';
import { chopinRuntime } from '$lib/content/chopin-project';
import {
	createNavigationGraph,
	resolveSceneDocument as resolveSceneDocumentWithRooms
} from '$lib/content/scene';
import {
	createCameraMotion,
	createCameraMotionSample,
	sampleCameraMotion
} from '$lib/museum/navigation/camera-motion';
import { getCameraConnectionRoute } from '$lib/museum/navigation/camera-route';
import { createEditorCameraTimeline } from '$lib/editor/editor-camera-timeline';
import {
	resolveConnectionEdgeMotions,
	resolveDirectedEdgeMotion,
	resolveDirectedEdgeMotionByDirection
} from '$lib/editor/editor-directed-edge-motion';
import { describe, expect, it } from 'vitest';

const resolveSceneDocument = (input: unknown) =>
	resolveSceneDocumentWithRooms(input, chopinRuntime.rooms);

/** Pose tuple (position + target + fov) for sample comparison. */
const poseOf = (sample: ReturnType<typeof createCameraMotionSample>) => ({
	position: sample.position.toArray(),
	target: sample.target.toArray(),
	fov: sample.fov
});

const posesMatch = (
	left: ReturnType<typeof createCameraMotionSample>,
	right: ReturnType<typeof createCameraMotionSample>
) => {
	expect(poseOf(left).position).toEqual(poseOf(right).position);
	expect(poseOf(left).target).toEqual(poseOf(right).target);
	expect(poseOf(left).fov).toBeCloseTo(poseOf(right).fov, 9);
};

describe('resolveDirectedEdgeMotion — exact directed routes', () => {
	it('resolves a forward connection with its orientation and a finite motion', () => {
		const { graph } = loadFixtureScene();
		const resolved = resolveDirectedEdgeMotion(graph, 'tour-a-b', 'tour-a', 'tour-b');

		expect(resolved).toMatchObject({
			connectionId: 'tour-a-b',
			direction: 'forward',
			fromNodeId: 'tour-a',
			toNodeId: 'tour-b'
		});
		expect(resolved.route.nodeIds).toEqual(['tour-a', 'tour-b']);
		expect(resolved.durationFallback).toBe(false);
		expect(Number.isFinite(resolved.motion.durationSeconds)).toBe(true);
		expect(resolved.motion.durationSeconds).toBeGreaterThan(0);
	});

	it('resolves the reverse direction when the node pair is swapped', () => {
		const { graph } = loadFixtureScene();
		const resolved = resolveDirectedEdgeMotion(graph, 'tour-a-b', 'tour-b', 'tour-a');

		expect(resolved).toMatchObject({
			direction: 'reverse',
			fromNodeId: 'tour-b',
			toNodeId: 'tour-a'
		});
		expect(resolved.route.nodeIds).toEqual(['tour-b', 'tour-a']);
	});

	it('rejects a node pair that matches neither orientation', () => {
		const { graph } = loadFixtureScene();
		expect(() =>
			resolveDirectedEdgeMotion(graph, 'tour-a-b', 'tour-paris', 'tour-d')
		).toThrow(/joins tour-a ↔ tour-b/);
	});

	it('rejects an unknown connection', () => {
		const { graph } = loadFixtureScene();
		expect(() => resolveDirectedEdgeMotion(graph, 'nope', 'tour-a', 'tour-b')).toThrow(
			/Unknown camera connection/
		);
	});

	it('P8 S1 — resolves an edge whose endpoint is Unsequenced (no flow links)', () => {
		const document = cloneFixtureDocument();
		const paris = document.navigationNodes.find((node) => node.id === 'tour-paris')!;
		document.navigationNodes.push({
			id: 'tour-e',
			roomId: 'workshop',
			label: 'Tour E: Unsequenced',
			position: [1, 1.65, 1],
			cameraTarget: [0, 1.25, -3],
			fov: 54,
			connectedNodeIds: ['tour-paris']
		});
		// Adjacency is reciprocal even though E carries no order links.
		paris.connectedNodeIds = [...paris.connectedNodeIds, 'tour-e'];
		document.connections.push({
			id: 'tour-paris-e',
			fromNodeId: 'tour-paris',
			toNodeId: 'tour-e',
			clearance: 0.35,
			positionPath: {
				kind: 'rounded-polyline',
				anchors: [
					{ id: 'tour-paris-e-anchor-01', roomId: 'paris', position: [-2, 1.65, 2] },
					{ id: 'tour-paris-e-anchor-02', roomId: 'workshop', position: [2, 1.65, 0] }
				]
			}
		});

		const graph = createNavigationGraph(resolveSceneDocument(document));
		// No getFlowRoute/isFlowNode involvement: an Unsequenced endpoint is not
		// on the flow, yet its real connection resolves as a directed edge.
		const resolved = resolveDirectedEdgeMotion(graph, 'tour-paris-e', 'tour-paris', 'tour-e');
		expect(resolved).toMatchObject({
			direction: 'forward',
			fromNodeId: 'tour-paris',
			toNodeId: 'tour-e'
		});
		expect(resolved.motion.durationSeconds).toBeGreaterThan(0);
	});
});

describe('resolveDirectedEdgeMotion — authored timing parity', () => {
	it('applies authored per-direction duration; the other direction stays automatic', () => {
		const document = cloneFixtureDocument();
		const connection = document.connections.find((candidate) => candidate.id === 'tour-a-b')!;
		connection.timing = {
			forward: { durationSeconds: 7.5 },
			reverse: { durationSeconds: 2 }
		};

		const graph = createNavigationGraph(resolveSceneDocument(document));
		const forward = resolveDirectedEdgeMotionByDirection(graph, 'tour-a-b', 'forward');
		const reverse = resolveDirectedEdgeMotionByDirection(graph, 'tour-a-b', 'reverse');

		expect(forward.motion.durationSeconds).toBe(7.5);
		expect(reverse.motion.durationSeconds).toBe(2);
		expect(forward.durationFallback).toBe(false);
	});

	it('falls back to the automatic duration for zero/negative/NaN authored values and signals it', () => {
		const { graph } = loadFixtureScene();
		const automatic =
			createCameraMotion(getCameraConnectionRoute('tour-a-b', 'forward', graph))
				.durationSeconds;

		// Document validation rejects invalid durations upstream, so inject the
		// invalid values straight into the graph record: the resolver is the
		// last line of defense (defense-in-depth, never NaN/Infinity).
		for (const authored of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			const connection = graph.connections.find(
				(candidate) => candidate.id === 'tour-a-b'
			)!;
			connection.timing = { forward: { durationSeconds: authored } };

			const resolved = resolveDirectedEdgeMotionByDirection(graph, 'tour-a-b', 'forward');
			expect(resolved.durationFallback).toBe(true);
			expect(Number.isFinite(resolved.motion.durationSeconds)).toBe(true);
			expect(resolved.motion.durationSeconds).toBeGreaterThan(0);
			expect(resolved.motion.durationSeconds).toBeCloseTo(automatic, 9);
			connection.timing = undefined;
		}
	});

	it('P8 S1 parity — direct edge sampling equals guided-timeline sampling for the same direction', () => {
		const document = cloneFixtureDocument();
		// Authored timing + easing that bare compilation would ignore.
		const connection = document.connections.find((candidate) => candidate.id === 'tour-a-b')!;
		connection.timing = { forward: { durationSeconds: 6.25, easing: 'linear' } };

		const graph = createNavigationGraph(resolveSceneDocument(document));
		const direct = resolveDirectedEdgeMotion(graph, 'tour-a-b', 'tour-a', 'tour-b').motion;
		const timeline = createEditorCameraTimeline(graph);
		const timelineEdge = timeline.edges[0]!;

		expect(timelineEdge.connectionId).toBe('tour-a-b');
		for (const playhead of [0, 0.25, 0.5, 0.75, 1]) {
			const viaDirect = createCameraMotionSample();
			sampleCameraMotion(direct, playhead, viaDirect);
			const viaTimeline = createCameraMotionSample();
			sampleCameraMotion(timelineEdge.motions.forward, playhead, viaTimeline);
			posesMatch(viaDirect, viaTimeline);
		}
	});

	it('P8 S1 parity — options-aware sampling differs from legacy bare compilation under easing', () => {
		const document = cloneFixtureDocument();
		const connection = document.connections.find((candidate) => candidate.id === 'tour-a-b')!;
		connection.timing = { forward: { easing: 'linear' } };

		const graph = createNavigationGraph(resolveSceneDocument(document));
		const resolved = resolveDirectedEdgeMotion(graph, 'tour-a-b', 'tour-a', 'tour-b').motion;
		// The pre-S1 gap: bare compilation dropped the connection's options.
		const bare = createCameraMotion(getCameraConnectionRoute('tour-a-b', 'forward', graph));

		const midResolved = createCameraMotionSample();
		sampleCameraMotion(resolved, 0.3, midResolved);
		const midBare = createCameraMotionSample();
		sampleCameraMotion(bare, 0.3, midBare);
		// Linear vs default smootherstep warps asymmetric progress points →
		// different mid-pose (symmetric easings would agree at exactly 0.5).
		expect(poseOf(midResolved).position).not.toEqual(poseOf(midBare).position);
	});

	it('applies identical sampling to a captured route snapshot and a fresh resolution', () => {
		const document = cloneFixtureDocument();
		const connection = document.connections.find((candidate) => candidate.id === 'tour-a-b')!;
		connection.timing = { forward: { durationSeconds: 4.2, easing: 'ease-in-out' } };

		const graph = createNavigationGraph(resolveSceneDocument(document));
		const fresh = resolveDirectedEdgeMotion(graph, 'tour-a-b', 'tour-a', 'tour-b');
		// Preview controllers hold a deep-cloned snapshot captured at start.
		const capturedRoute = JSON.parse(JSON.stringify(fresh.route));
		const fromSnapshot = resolveDirectedEdgeMotionByDirection(
			graph,
			'tour-a-b',
			'forward',
			{ route: capturedRoute }
		);

		expect(fromSnapshot.motion.durationSeconds).toBeCloseTo(fresh.motion.durationSeconds, 9);
		for (const playhead of [0, 0.5, 1]) {
			const viaFresh = createCameraMotionSample();
			sampleCameraMotion(fresh.motion, playhead, viaFresh);
			const viaSnapshot = createCameraMotionSample();
			sampleCameraMotion(fromSnapshot.motion, playhead, viaSnapshot);
			posesMatch(viaFresh, viaSnapshot);
		}
	});

	it('compiles both directions through the pair helper consistently', () => {
		const { graph } = loadFixtureScene();
		const pair = resolveConnectionEdgeMotions(graph, 'tour-a-b');
		const forward = resolveDirectedEdgeMotionByDirection(graph, 'tour-a-b', 'forward').motion;
		const reverse = resolveDirectedEdgeMotionByDirection(graph, 'tour-a-b', 'reverse').motion;

		expect(pair.forward.durationSeconds).toBe(forward.durationSeconds);
		expect(pair.reverse.durationSeconds).toBe(reverse.durationSeconds);
		// Physical endpoints are mirrored between directions.
		const forwardEnd = createCameraMotionSample();
		sampleCameraMotion(pair.forward, 1, forwardEnd);
		const reverseStart = createCameraMotionSample();
		sampleCameraMotion(pair.reverse, 0, reverseStart);
		posesMatch(forwardEnd, reverseStart);
	});
});
