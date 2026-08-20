import type { NavigationGraph } from '$lib/content/scene';
import type { CameraConnectionDirection } from '$lib/types/museum';
import { createCameraMotion } from '$lib/museum/navigation/camera-motion';
import {
	getCameraConnectionRoute,
	getCameraMotionOptions
} from '$lib/museum/navigation/camera-route';

/**
 * Pure Camera Plan timing display model (P1.5). Every readout is derived from
 * the exact per-direction `CameraMotion` the timeline constructs — the shared
 * route + motion APIs own path length and duration, so the UI never
 * reproduces fallback-duration constants, point-count rules, or path-length
 * math.
 */

export type CameraPlanDirectionTiming = {
	direction: CameraConnectionDirection;
	/** Playback path length in metres (`motion.totalPositionDistance`). */
	pathLengthMeters: number;
	/** Effective duration in seconds (`motion.durationSeconds`, authored or formula). */
	durationSeconds: number;
	/** True when the connection authored `durationSeconds` for this direction. */
	authoredDuration: boolean;
	/** Derived speed; 0 m/s for zero-length or zero-duration paths (never NaN/infinity). */
	speedMetersPerSecond: number;
};

/** Build the timing readout for one direction of one connection. */
export function resolveCameraConnectionTiming(
	connectionId: string,
	direction: CameraConnectionDirection,
	graph: NavigationGraph
): CameraPlanDirectionTiming {
	const connection = graph.connections.find(
		(candidate) => candidate.id === connectionId
	);
	if (!connection) {
		throw new Error(`Unknown camera connection: ${connectionId}`);
	}
	const motion = createCameraMotion(
		getCameraConnectionRoute(connectionId, direction, graph),
		undefined,
		getCameraMotionOptions(connection, direction)
	);
	const pathLengthMeters = motion.totalPositionDistance;
	const durationSeconds = motion.durationSeconds;
	const speedMetersPerSecond =
		pathLengthMeters > 1e-9 &&
		durationSeconds > 1e-9 &&
		Number.isFinite(durationSeconds)
			? pathLengthMeters / durationSeconds
			: 0;
	return {
		direction,
		pathLengthMeters,
		durationSeconds,
		authoredDuration:
			connection.timing?.[direction]?.durationSeconds !== undefined,
		speedMetersPerSecond
	};
}
