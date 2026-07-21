import type { NavigationGraph } from '$lib/content/scene';
import type { CameraConnectionDirection } from '$lib/types/museum';
import {
	cameraMotionEdgeProgressAtProgress,
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion,
	sampleCameraMotion,
	type CameraMotionSample,
	type CameraMotion
} from '$lib/museum/navigation/camera-motion';
import {
	getCameraConnectionRoute,
	getGuidedCameraRoute
} from '$lib/museum/navigation/camera-route';

const TIMELINE_EPSILON = 1e-9;

export type EditorCameraTimelineEdge = {
	connectionId: string;
	direction: CameraConnectionDirection;
	fromNodeId: string;
	toNodeId: string;
	startSeconds: number;
	endSeconds: number;
	durationSeconds: number;
	motions: Record<CameraConnectionDirection, CameraMotion>;
};

export type EditorCameraTimelineNodeBoundary = {
	nodeId: string;
	boundaryIndex: number;
	timeSeconds: number;
	progress: number;
};

export type EditorCameraTimeline = {
	startNodeId: string;
	durationSeconds: number;
	edges: EditorCameraTimelineEdge[];
	nodeBoundaries: EditorCameraTimelineNodeBoundary[];
};

export type EditorCameraTimelineLocation = {
	edge: EditorCameraTimelineEdge;
	edgeIndex: number;
	playhead: number;
	progress: number;
};

function clamp01(value: number) {
	return Math.min(1, Math.max(0, value));
}

function timelineProgressAtSeconds(timeline: EditorCameraTimeline, seconds: number) {
	return timeline.durationSeconds <= TIMELINE_EPSILON
		? 0
		: clamp01(seconds / timeline.durationSeconds);
}

function findGuidedStart(graph: NavigationGraph, preferredStartNodeId: string) {
	const guidedNodes = graph.navigationNodes.filter(
		(node) => node.nextNodeId !== undefined && node.previousNodeId !== undefined
	);
	if (guidedNodes.length === 0) {
		throw new Error('The camera timeline requires a guided tour');
	}
	return (
		guidedNodes.find((node) => node.id === preferredStartNodeId) ?? guidedNodes[0]
	);
}

/**
 * Build timeline timing from exact oriented connection routes. This indexes the
 * checked graph; route geometry and sampling remain owned by camera-route/motion.
 */
export function createEditorCameraTimeline(
	graph: NavigationGraph,
	preferredStartNodeId = 'entrance-start'
): EditorCameraTimeline {
	const start = findGuidedStart(graph, preferredStartNodeId);
	const guidedRoute = getGuidedCameraRoute(start.id, graph);
	const edges: EditorCameraTimelineEdge[] = [];
	let elapsedSeconds = 0;

	for (const routeEdge of guidedRoute.edges) {
		const connection = graph.connections.find(
			(candidate) => candidate.id === routeEdge.connectionId
		);
		if (!connection) {
			throw new Error(`Unknown camera connection: ${routeEdge.connectionId}`);
		}
		const forwardMotion = createCameraMotion(
			getCameraConnectionRoute(connection.id, 'forward', graph)
		);
		const reverseMotion = createCameraMotion(
			getCameraConnectionRoute(connection.id, 'reverse', graph)
		);
		const motion =
			routeEdge.direction === 'forward' ? forwardMotion : reverseMotion;
		const durationSeconds = motion.durationSeconds;
		edges.push({
			connectionId: connection.id,
			direction: routeEdge.direction,
			fromNodeId: routeEdge.fromNodeId,
			toNodeId: routeEdge.toNodeId,
			startSeconds: elapsedSeconds,
			endSeconds: elapsedSeconds + durationSeconds,
			durationSeconds,
			motions: { forward: forwardMotion, reverse: reverseMotion }
		});
		elapsedSeconds += durationSeconds;
	}

	const nodeBoundaries = guidedRoute.nodeIds.map(
		(nodeId, boundaryIndex): EditorCameraTimelineNodeBoundary => {
			const timeSeconds =
				boundaryIndex === edges.length
					? elapsedSeconds
					: edges[boundaryIndex]?.startSeconds ?? 0;
			return {
				nodeId,
				boundaryIndex,
				timeSeconds,
				progress:
					elapsedSeconds <= TIMELINE_EPSILON
						? boundaryIndex / Math.max(1, edges.length)
						: timeSeconds / elapsedSeconds
			};
		}
	);

	return {
		startNodeId: start.id,
		durationSeconds: elapsedSeconds,
		edges,
		nodeBoundaries
	};
}

export function findEditorCameraTimelineEdge(
	timeline: EditorCameraTimeline,
	connectionId: string
) {
	return timeline.edges.find((edge) => edge.connectionId === connectionId);
}

export function getEditorCameraTimelineLocation(
	timeline: EditorCameraTimeline,
	progress: number
): EditorCameraTimelineLocation {
	if (!Number.isFinite(progress)) {
		throw new Error('Camera timeline progress must be finite');
	}
	if (timeline.edges.length === 0) {
		throw new Error('The camera timeline has no guided edges');
	}
	const clamped = clamp01(progress);
	const seconds = clamped * timeline.durationSeconds;
	let edgeIndex = timeline.edges.findIndex(
		(edge) => seconds < edge.endSeconds - TIMELINE_EPSILON
	);
	if (edgeIndex < 0) edgeIndex = timeline.edges.length - 1;
	const edge = timeline.edges[edgeIndex];
	const playhead =
		edge.durationSeconds <= TIMELINE_EPSILON
			? clamped >= 1
				? 1
				: 0
			: clamp01((seconds - edge.startSeconds) / edge.durationSeconds);
	return { edge, edgeIndex, playhead, progress: clamped };
}

/** Sample the exact oriented connection motion used at this guided-tour time. */
export function sampleEditorCameraTimeline(
	timeline: EditorCameraTimeline,
	progress: number,
	output: CameraMotionSample
) {
	const location = getEditorCameraTimelineLocation(timeline, progress);
	sampleCameraMotion(
		location.edge.motions[location.edge.direction],
		location.playhead,
		output
	);
	return location;
}

/** Map an oriented edge-local motion playhead onto the global guided ruler. */
export function cameraTimelineProgressAtEdgePlayhead(
	timeline: EditorCameraTimeline,
	connectionId: string,
	direction: CameraConnectionDirection,
	playhead: number
) {
	if (!Number.isFinite(playhead)) {
		throw new Error('Camera edge playhead must be finite');
	}
	const edge = findEditorCameraTimelineEdge(timeline, connectionId);
	if (!edge) return null;
	const focusedMotion = edge.motions[direction];
	const focusedEdgeProgress = cameraMotionEdgeProgressAtProgress(
		focusedMotion,
		0,
		clamp01(playhead)
	);
	const guidedEdgeProgress =
		direction === edge.direction ? focusedEdgeProgress : 1 - focusedEdgeProgress;
	const guidedPlayhead = cameraMotionProgressAtEdgeProgress(
		edge.motions[edge.direction],
		0,
		guidedEdgeProgress
	);
	return timelineProgressAtSeconds(
		timeline,
		edge.startSeconds + guidedPlayhead * edge.durationSeconds
	);
}

/** Map a persisted exact-edge progress value onto the global guided ruler. */
export function cameraTimelineProgressAtEdgeProgress(
	timeline: EditorCameraTimeline,
	connectionId: string,
	direction: CameraConnectionDirection,
	edgeProgress: number
) {
	if (!Number.isFinite(edgeProgress)) {
		throw new Error('Camera edge progress must be finite');
	}
	const edge = findEditorCameraTimelineEdge(timeline, connectionId);
	if (!edge) return null;
	const playhead = cameraMotionProgressAtEdgeProgress(
		edge.motions[direction],
		0,
		clamp01(edgeProgress)
	);
	return cameraTimelineProgressAtEdgePlayhead(
		timeline,
		connectionId,
		direction,
		playhead
	);
}

/** Resolve a global ruler point to an exact oriented connection playhead. */
export function cameraTimelineEdgePlayheadAtProgress(
	timeline: EditorCameraTimeline,
	connectionId: string,
	direction: CameraConnectionDirection,
	progress: number
) {
	const edge = findEditorCameraTimelineEdge(timeline, connectionId);
	if (!edge) return null;
	const seconds = clamp01(progress) * timeline.durationSeconds;
	const guidedPlayhead =
		edge.durationSeconds <= TIMELINE_EPSILON
			? 0
			: clamp01((seconds - edge.startSeconds) / edge.durationSeconds);
	const guidedEdgeProgress = cameraMotionEdgeProgressAtProgress(
		edge.motions[edge.direction],
		0,
		guidedPlayhead
	);
	const focusedEdgeProgress =
		direction === edge.direction ? guidedEdgeProgress : 1 - guidedEdgeProgress;
	return cameraMotionProgressAtEdgeProgress(
		edge.motions[direction],
		0,
		focusedEdgeProgress
	);
}

/** Resolve a global ruler point to persisted progress on one directional edge track. */
export function cameraTimelineEdgeProgressAtProgress(
	timeline: EditorCameraTimeline,
	connectionId: string,
	direction: CameraConnectionDirection,
	progress: number
) {
	const edge = findEditorCameraTimelineEdge(timeline, connectionId);
	const playhead = cameraTimelineEdgePlayheadAtProgress(
		timeline,
		connectionId,
		direction,
		progress
	);
	if (!edge || playhead === null) return null;
	return cameraMotionEdgeProgressAtProgress(
		edge.motions[direction],
		0,
		playhead
	);
}
