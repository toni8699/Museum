import type { LayoutVec2 } from '$lib/layout/layout-types';
import type { PlanCameraAuthoringProjection } from '$lib/layout/plan-render-model';

/**
 * Pure Camera Plan hit resolution (P1.5). Resolves a world-space plan point
 * against the Camera-authoring projection using the locked priority node →
 * visible interior anchor → connection curve → null (empty backdrop).
 * Tolerances are screen-space CSS-px constants converted through
 * `pixelsPerMeter`, so zoom never makes selection unusable. No Svelte, DOM,
 * or view-transform imports.
 */

export const CAMERA_PLAN_NODE_HIT_RADIUS_PX = 11;
export const CAMERA_PLAN_ANCHOR_HIT_RADIUS_PX = 8;
export const CAMERA_PLAN_EDGE_HIT_RADIUS_PX = 6;

export type CameraPlanHit =
	| { kind: 'node'; nodeId: string }
	| { kind: 'anchor'; connectionId: string; anchorId: string }
	| { kind: 'edge'; connectionId: string }
	| null;

/** Distance from `point` to the nearest point on a 2D polyline. */
export function pointToPolylineDistance(
	polyline: readonly LayoutVec2[],
	point: LayoutVec2
): number {
	let best = Number.POSITIVE_INFINITY;
	for (let index = 0; index + 1 < polyline.length; index += 1) {
		const start = polyline[index]!;
		const end = polyline[index + 1]!;
		best = Math.min(best, pointToSegmentDistance(start, end, point));
	}
	return polyline.length > 0 ? best : Number.POSITIVE_INFINITY;
}

/** Distance from `point` to the closed segment `a`–`b`. */
export function pointToSegmentDistance(
	a: LayoutVec2,
	b: LayoutVec2,
	point: LayoutVec2
): number {
	const dx = b[0] - a[0];
	const dz = b[1] - a[1];
	const lengthSquared = dx * dx + dz * dz;
	if (lengthSquared <= 1e-12) {
		return Math.hypot(point[0] - a[0], point[1] - a[1]);
	}
	const t = Math.min(
		1,
		Math.max(
			0,
			((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared
		)
	);
	return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz));
}

/** Normalized arc-length progress of the nearest polyline point (for curve insertion). */
export function nearestPolylineProgress(
	polyline: readonly LayoutVec2[],
	point: LayoutVec2
): number {
	if (polyline.length <= 1) return 0;
	let bestSegment = 0;
	let bestT = 0;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (let index = 0; index + 1 < polyline.length; index += 1) {
		const start = polyline[index]!;
		const end = polyline[index + 1]!;
		const dx = end[0] - start[0];
		const dz = end[1] - start[1];
		const lengthSquared = dx * dx + dz * dz;
		const t =
			lengthSquared <= 1e-12
				? 0
				: Math.min(
						1,
						Math.max(
							0,
							((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) /
								lengthSquared
						)
				  );
		const distance = pointToSegmentDistance(start, end, point);
		if (distance < bestDistance) {
			bestDistance = distance;
			bestSegment = index;
			bestT = t;
		}
	}
	return (bestSegment + bestT) / (polyline.length - 1);
}

/**
 * Resolve the camera hit for a world-space plan point. `pixelsPerMeter` is
 * the live viewport scale; each tolerance is a screen-px constant converted
 * to world units.
 */
export function resolveCameraPlanHit(
	projection: PlanCameraAuthoringProjection,
	point: LayoutVec2,
	pixelsPerMeter: number
): CameraPlanHit {
	const scale = Math.max(Number.EPSILON, pixelsPerMeter);

	let nodeHit: CameraPlanHit = null;
	let nodeDistance = CAMERA_PLAN_NODE_HIT_RADIUS_PX / scale;
	for (const node of projection.nodes) {
		const distance = Math.hypot(
			node.point[0] - point[0],
			node.point[1] - point[1]
		);
		if (distance <= nodeDistance) {
			nodeHit = { kind: 'node', nodeId: node.nodeId };
			nodeDistance = distance;
		}
	}
	if (nodeHit) return nodeHit;

	let anchorHit: CameraPlanHit = null;
	let anchorDistance = CAMERA_PLAN_ANCHOR_HIT_RADIUS_PX / scale;
	for (const anchor of projection.anchors) {
		const distance = Math.hypot(
			anchor.point[0] - point[0],
			anchor.point[1] - point[1]
		);
		if (distance <= anchorDistance) {
			anchorHit = {
				kind: 'anchor',
				connectionId: anchor.connectionId,
				anchorId: anchor.anchorId
			};
			anchorDistance = distance;
		}
	}
	if (anchorHit) return anchorHit;

	let edgeHit: CameraPlanHit = null;
	let edgeDistance = CAMERA_PLAN_EDGE_HIT_RADIUS_PX / scale;
	for (const connection of projection.connections) {
		const distance = pointToPolylineDistance(connection.polyline, point);
		if (distance <= edgeDistance) {
			edgeHit = { kind: 'edge', connectionId: connection.connectionId };
			edgeDistance = distance;
		}
	}
	return edgeHit;
}
