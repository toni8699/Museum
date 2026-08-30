import type { NavigationGraph } from '$lib/content/scene';
import type { CameraConnectionDirection, RuntimeConnection } from '$lib/types/scene';
import { createCameraMotion, type CameraMotion } from '@portfolio/camera-core';
import {
	getCameraConnectionRoute,
	getCameraMotionOptions,
	type ResolvedCameraRoute
} from '@portfolio/camera-core';

/**
 * P8 S1 — the canonical directed-edge motion resolver.
 *
 * Every editor path that turns one real connection into camera motion —
 * guided Sequence timeline, direct edge preview, view-key authoring, Plan
 * timing readouts — must resolve through here, so a connection's authored
 * timing/easing produces identical motion no matter which surface samples it
 * (the audit's "editor preview = runtime motion truth" invariant).
 *
 * This composes `getCameraConnectionRoute` + `getCameraMotionOptions` +
 * `createCameraMotion`; it introduces no second motion implementation and is
 * the only place those three are combined for a single directed edge.
 */

export type DirectedEdgeMotion = {
	connectionId: string;
	direction: CameraConnectionDirection;
	fromNodeId: string;
	toNodeId: string;
	route: ResolvedCameraRoute;
	motion: CameraMotion;
	/**
	 * True when the connection authored a duration for this direction but the
	 * value was rejected (non-finite or ≤ 0), so the automatic formula
	 * duration is in effect instead. Never NaN/Infinity either way —
	 * `createCameraMotion` clamps via `resolveCameraMotionDuration`.
	 */
	durationFallback: boolean;
};

export type ResolveDirectedEdgeOptions = {
	/**
	 * Pre-resolved route (e.g. the preview controller's captured snapshot).
	 * When supplied, geometry comes from this route verbatim and only the
	 * connection's timing/easing options are applied on top — preserving the
	 * capture-time freeze contract while keeping authored timing parity.
	 */
	route?: ResolvedCameraRoute;
};

/**
 * Structural view of the connection fields a directed edge resolves from —
 * satisfied by both persisted (`SceneConnection`) and runtime
 * (`RuntimeConnection`) records.
 */
export type DirectedEdgeTimingSource = Pick<
	RuntimeConnection,
	'id' | 'fromNodeId' | 'toNodeId' | 'timing'
>;

/**
 * Core resolver: one connection record + one explicit direction + a resolved
 * route → canonical motion. Pure: no graph lookup, safe for hosts/tests that
 * hold only the document's connection records.
 */
export function resolveDirectedEdgeMotionForConnection(
	connection: DirectedEdgeTimingSource,
	direction: CameraConnectionDirection,
	route: ResolvedCameraRoute
): DirectedEdgeMotion {
	if (direction !== 'forward' && direction !== 'reverse') {
		throw new Error(`Unknown camera connection direction: ${String(direction)}`);
	}
	const fromNodeId = direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
	const toNodeId = direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
	const timing = connection.timing?.[direction];
	const authoredDuration = timing?.durationSeconds;
	const durationFallback =
		typeof authoredDuration === 'number' &&
		!(Number.isFinite(authoredDuration) && authoredDuration > 0);
	return {
		connectionId: connection.id,
		direction,
		fromNodeId,
		toNodeId,
		route,
		motion: createCameraMotion(route, undefined, getCameraMotionOptions(connection, direction)),
		durationFallback
	};
}

/**
 * Graph-based resolver: one connection, one explicit direction. The graph is
 * used for the connection record and for route resolution when
 * {@link ResolveDirectedEdgeOptions.route} is not supplied.
 */
export function resolveDirectedEdgeMotionByDirection(
	graph: NavigationGraph,
	connectionId: string,
	direction: CameraConnectionDirection,
	options: ResolveDirectedEdgeOptions = {}
): DirectedEdgeMotion {
	if (direction !== 'forward' && direction !== 'reverse') {
		throw new Error(`Unknown camera connection direction: ${String(direction)}`);
	}
	const connection = findConnection(graph, connectionId);
	const route = options.route ?? getCameraConnectionRoute(connectionId, direction, graph);
	return resolveDirectedEdgeMotionForConnection(connection, direction, route);
}

/**
 * Orientation-checked resolver: derive the direction from the requested node
 * pair (`from → to`). Throws when the pair does not match either orientation
 * of the connection. Prefer this at authoring boundaries where the user (or
 * a persisted selection) names both endpoints explicitly.
 */
export function resolveDirectedEdgeMotion(
	graph: NavigationGraph,
	connectionId: string,
	fromNodeId: string,
	toNodeId: string,
	options: ResolveDirectedEdgeOptions = {}
): DirectedEdgeMotion {
	const connection = findConnection(graph, connectionId);
	const direction =
		fromNodeId === connection.fromNodeId && toNodeId === connection.toNodeId
			? 'forward'
			: fromNodeId === connection.toNodeId && toNodeId === connection.fromNodeId
				? 'reverse'
				: null;
	if (!direction) {
		throw new Error(
			`Camera connection ${connectionId} joins ${connection.fromNodeId} ↔ ${connection.toNodeId}, not ${fromNodeId} → ${toNodeId}`
		);
	}
	return resolveDirectedEdgeMotionByDirection(graph, connectionId, direction, options);
}

/** Compile both directions of one connection with their authored options. */
export function resolveConnectionEdgeMotions(
	graph: NavigationGraph,
	connectionId: string
): Record<CameraConnectionDirection, CameraMotion> {
	return {
		forward: resolveDirectedEdgeMotionByDirection(graph, connectionId, 'forward').motion,
		reverse: resolveDirectedEdgeMotionByDirection(graph, connectionId, 'reverse').motion
	};
}

function findConnection(graph: NavigationGraph, connectionId: string): RuntimeConnection {
	const connection = graph.connections.find((candidate) => candidate.id === connectionId);
	if (!connection) throw new Error(`Unknown camera connection: ${connectionId}`);
	return connection;
}
