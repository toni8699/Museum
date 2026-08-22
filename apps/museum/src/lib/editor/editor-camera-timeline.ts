import type { NavigationGraph } from '$lib/content/scene';
import type { CameraConnectionDirection } from '$lib/types/museum';
import {
	cameraMotionEdgeProgressAtProgress,
	cameraMotionProgressAtEdgeProgress,
	sampleCameraMotion,
	type CameraMotionSample,
	type CameraMotion
} from '$lib/museum/navigation/camera-motion';
import { getFlowRoute } from '$lib/museum/navigation/camera-route';
import { isFlowNode } from '$lib/content/scene';
import { EDITOR_GUIDED_TOUR_START_NODE_ID } from './editor-navigation-graph';
import { resolveConnectionEdgeMotions } from './editor-directed-edge-motion';

const TIMELINE_EPSILON = 1e-9;

/**
 * One guided edge in the timeline.
 *
 * Each edge owns a `motionStartSeconds`/`motionEndSeconds`/derived
 * `motionDurationSeconds` range covering the camera transition **only**.
 * The destination node's authored `holdSeconds` forms a zero-position-motion
 * tail that ends at `holdEndSeconds`.
 */
export type EditorCameraTimelineEdge = {
	connectionId: string;
	direction: CameraConnectionDirection;
	fromNodeId: string;
	toNodeId: string;
	motionStartSeconds: number;
	motionEndSeconds: number;
	/** Derived: {@link motionEndSeconds} - {@link motionStartSeconds}. */
	motionDurationSeconds: number;
	holdSeconds: number;
	holdEndSeconds: number;
	motions: Record<CameraConnectionDirection, CameraMotion>;
};

/** Read the per-edge motion span as a single scalar. */
function edgeMotionDuration(edge: EditorCameraTimelineEdge) {
	return edge.motionEndSeconds - edge.motionStartSeconds;
}

export type EditorCameraTimelineNodeBoundary = {
	nodeId: string;
	boundaryIndex: number;
	timeSeconds: number;
	progress: number;
	/** The edge this boundary lands after; undefined only for the tour-start boundary. */
	edgeId?: string;
};

export type EditorCameraTimeline = {
	startNodeId: string;
	/** Total seconds including every authored hold. Reduced motion collapses this to Σ(motionSpanSeconds). */
	durationSeconds: number;
	/** Total motion span seconds, excluding holds. */
	motionDurationSeconds: number;
	/** Sum of all destination hold seconds across the cycle. */
	totalHoldSeconds: number;
	edges: EditorCameraTimelineEdge[];
	nodeBoundaries: EditorCameraTimelineNodeBoundary[];
};

export type EditorCameraTimelineLocation = {
	edge: EditorCameraTimelineEdge;
	edgeIndex: number;
	playhead: number;
	progress: number;
};

export type EditorCameraScheduleLocation = {
	edge: EditorCameraTimelineEdge;
	edgeIndex: number;
	/** Progress within the edge's motion span (0..1). May be 1 once we are inside the destination hold. */
	edgePlayhead: number;
	progress: number;
	/** True while `seconds` is inside the destination hold span (zero-position-motion). */
	isHolding: boolean;
	holdingNodeId: string | null;
	/** Progress within the active hold span (0..1). Zero outside the hold. */
	holdProgress: number;
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
	const flowNodes = graph.navigationNodes.filter(isFlowNode);
	if (flowNodes.length === 0) {
		throw new Error('The camera timeline requires a flow');
	}
	const seed =
		flowNodes.find((node) => node.id === preferredStartNodeId) ?? flowNodes[0];
	// Walk previous-links to the component head. If the walk returns to the
	// seed, the component is a legacy closed cycle — keep the seed as the start
	// so the derived chain preserves its display order (getFlowRoute derives
	// the loop closing edge separately).
	const seen = new Set([seed.id]);
	let cursor = seed;
	while (cursor.previousNodeId !== undefined) {
		const previous = graph.nodeById.get(cursor.previousNodeId);
		if (!previous || !isFlowNode(previous)) break;
		if (previous.id === seed.id) return seed;
		if (seen.has(previous.id)) break;
		seen.add(previous.id);
		cursor = previous;
	}
	return cursor;
}

/**
 * Build timeline timing from exact oriented connection routes. The per-edge
 * schedule composes motion + the destination node's authored hold into one
 * deterministic global ruler; reduced-motion playback collapses each motion
 * span to its end pose.
 */
export function createEditorCameraTimeline(
	graph: NavigationGraph,
	preferredStartNodeId = EDITOR_GUIDED_TOUR_START_NODE_ID
): EditorCameraTimeline {
	const start = findGuidedStart(graph, preferredStartNodeId);
	// Loop playback is derived (distinct-connection test): when the closing
	// record exists and is not a chain transition, the timeline includes the
	// authored return edge; otherwise the flow plays Once and ends at the tail.
	const guidedRoute = getFlowRoute(start.id, graph, { loop: true });
	const nodeById = graph.nodeById;
	const edges: EditorCameraTimelineEdge[] = [];
	let motionElapsedSeconds = 0;
	let totalElapsedSeconds = 0;

	for (const routeEdge of guidedRoute.edges) {
		// P8 S1 — per-direction motions resolve through the shared directed-edge
		// resolver (authored timing/easing applied exactly once, canonically).
		const motions = resolveConnectionEdgeMotions(graph, routeEdge.connectionId);
		const motion = motions[routeEdge.direction];
		const durationSeconds = motion.durationSeconds;
		const destination = nodeById.get(routeEdge.toNodeId);
		const holdSeconds = destination?.holdSeconds ?? 0;
		const motionStart = totalElapsedSeconds;
		const motionEnd = motionStart + durationSeconds;
		const holdEnd = motionEnd + holdSeconds;
		edges.push({
			connectionId: routeEdge.connectionId,
			direction: routeEdge.direction,
			fromNodeId: routeEdge.fromNodeId,
			toNodeId: routeEdge.toNodeId,
			motionStartSeconds: motionStart,
			motionEndSeconds: motionEnd,
			motionDurationSeconds: durationSeconds,
			holdSeconds,
			holdEndSeconds: holdEnd,
			motions
		});
		motionElapsedSeconds += durationSeconds;
		totalElapsedSeconds = holdEnd;
	}

	const nodeBoundaries: EditorCameraTimelineNodeBoundary[] = guidedRoute.nodeIds.map(
		(nodeId, boundaryIndex): EditorCameraTimelineNodeBoundary => {
			if (boundaryIndex === 0) {
				return {
					nodeId,
					boundaryIndex,
					timeSeconds: 0,
					progress: 0
				};
			}
			const previousEdge = edges[boundaryIndex - 1];
			const landingEdgeId = previousEdge?.connectionId;
			if (boundaryIndex === edges.length) {
				return {
					nodeId,
					boundaryIndex,
					timeSeconds: totalElapsedSeconds,
					progress: 1,
					...((landingEdgeId ?? '').length ? { edgeId: landingEdgeId } : {})
				};
			}
			const landing = previousEdge?.motionEndSeconds ?? 0;
			return {
				nodeId,
				boundaryIndex,
				timeSeconds: landing,
				progress:
					totalElapsedSeconds <= TIMELINE_EPSILON
						? boundaryIndex / Math.max(1, edges.length)
						: landing / totalElapsedSeconds,
				...((landingEdgeId ?? '').length ? { edgeId: landingEdgeId } : {})
			};
		}
	);

	return {
		startNodeId: start.id,
		durationSeconds: totalElapsedSeconds,
		motionDurationSeconds: motionElapsedSeconds,
		totalHoldSeconds: totalElapsedSeconds - motionElapsedSeconds,
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
	const edgeIndex = findMotionSpanEdgeIndex(timeline, seconds);
	const edge = timeline.edges[edgeIndex]!;
	const edgeDuration = edgeMotionDuration(edge);
	const playhead =
		edgeDuration <= TIMELINE_EPSILON
			? clamped >= 1
				? 1
				: 0
			: clamp01((seconds - edge.motionStartSeconds) / edgeDuration);
	return { edge, edgeIndex, playhead, progress: clamped };
}

/** Walk the schedule at a real-time seconds offset, including hold tails. */
export function getEditorCameraScheduleLocation(
	timeline: EditorCameraTimeline,
	seconds: number,
	reducedMotion = false
): EditorCameraScheduleLocation {
	if (!Number.isFinite(seconds)) {
		throw new Error('Camera schedule seconds must be finite');
	}
	if (timeline.edges.length === 0) {
		throw new Error('The camera timeline has no guided edges');
	}
	const reduced = reducedMotion || timeline.totalHoldSeconds <= TIMELINE_EPSILON;
	const epsilon = TIMELINE_EPSILON;
	let activeIndex = timeline.edges.length - 1;
	for (const [index, edge] of timeline.edges.entries()) {
		activeIndex = index;
		const upper = reduced ? edge.motionEndSeconds : edge.holdEndSeconds;
		if (seconds <= upper + epsilon) break;
	}
	const edge = timeline.edges[activeIndex]!;
	const edgeDuration = edgeMotionDuration(edge);
	const inMotionSpan =
		seconds <= edge.motionEndSeconds + epsilon ||
		edgeDuration <= TIMELINE_EPSILON;
	const edgePlayhead = reduced
		? 1
		: inMotionSpan
			? edgeDuration <= TIMELINE_EPSILON
				? 1
				: clamp01((seconds - edge.motionStartSeconds) / edgeDuration)
			: 1;
	const isHolding = !reduced && !inMotionSpan && edge.holdSeconds > TIMELINE_EPSILON;
	const holdProgress = isHolding
		? clamp01((seconds - edge.motionEndSeconds) / edge.holdSeconds)
		: 0;
	const progress = timelineProgressAtSeconds(timeline, seconds);
	return {
		edge,
		edgeIndex: activeIndex,
		edgePlayhead,
		progress,
		isHolding,
		holdingNodeId: edge.toNodeId,
		holdProgress
	};
}

/** Sample the schedule with optional reduced-motion collapse. */
export function sampleEditorCameraSchedule(
	timeline: EditorCameraTimeline,
	seconds: number,
	output: CameraMotionSample,
	reducedMotion = false
): EditorCameraScheduleLocation {
	const location = getEditorCameraScheduleLocation(timeline, seconds, reducedMotion);
	sampleCameraMotion(
		location.edge.motions[location.edge.direction],
		location.edgePlayhead,
		output
	);
	return location;
}

/** Sample the exact oriented connection motion used at this guided-tour progress. */
export function sampleEditorCameraTimeline(
	timeline: EditorCameraTimeline,
	progress: number,
	output: CameraMotionSample
): EditorCameraTimelineLocation {
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
		edge.motionStartSeconds + guidedPlayhead * edgeMotionDuration(edge)
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
	const edgeDuration = edgeMotionDuration(edge);
	const guidedPlayhead =
		edgeDuration <= TIMELINE_EPSILON
			? 0
			: clamp01((seconds - edge.motionStartSeconds) / edgeDuration);
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

function findMotionSpanEdgeIndex(timeline: EditorCameraTimeline, seconds: number) {
	const epsilon = TIMELINE_EPSILON;
	const candidate = timeline.edges.findIndex(
		(edge) => seconds < edge.motionEndSeconds - epsilon
	);
	if (candidate >= 0) return candidate;
	const lastIndex = timeline.edges.length - 1;
	if (seconds >= timeline.edges[lastIndex]!.motionEndSeconds - epsilon) return lastIndex;
	for (let index = timeline.edges.length - 1; index >= 0; index -= 1) {
		const edge = timeline.edges[index]!;
		if (seconds >= edge.motionStartSeconds - epsilon) return index;
	}
	return lastIndex;
}
