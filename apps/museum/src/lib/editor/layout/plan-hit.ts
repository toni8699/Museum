import type { LayoutVec2 } from '$lib/layout/layout-types';
import type { CompiledLayoutQueryGeometry, CompiledQuerySpan } from '$lib/layout/layout-geometry-types';
import { findPolygonContaining, projectPointToSpans } from '$lib/layout/layout-geometry-queries';

/**
 * Pure Plan hit resolution. Resolves a world-space plan point against the
 * compiled query records (points, spans, polygons) using the locked priority:
 * vertex → interior anchor → opening → object → wall → room. No Svelte, DOM,
 * or view-transform imports; the caller supplies a world-space tolerance
 * (screen hit radius ÷ pixels-per-meter).
 */

export type PlanWallProjection = {
	point: LayoutVec2;
	offset: number;
	distance: number;
	t: number;
};

export type PlanHitResult =
	| { kind: 'vertex'; roomId: string; segmentId: string; vertexIndex: number }
	| { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string }
	| { kind: 'opening'; roomId: string; segmentId: string; openingId: string; projection: PlanWallProjection }
	| { kind: 'object'; objectId: string }
	| { kind: 'wall'; roomId: string; segmentId: string; projection: PlanWallProjection }
	| { kind: 'room'; roomId: string }
	| null;

function wallSpansByRoomSegment(queries: CompiledLayoutQueryGeometry): Map<string, Map<string, CompiledQuerySpan[]>> {
	const byRoom = new Map<string, Map<string, CompiledQuerySpan[]>>();
	for (const span of queries.spans) {
		if (span.kind !== 'wall') continue;
		let bySegment = byRoom.get(span.roomId);
		if (!bySegment) {
			bySegment = new Map();
			byRoom.set(span.roomId, bySegment);
		}
		const spans = bySegment.get(span.segmentId) ?? [];
		spans.push(span);
		bySegment.set(span.segmentId, spans);
	}
	return byRoom;
}

function openingSpansByRoom(queries: CompiledLayoutQueryGeometry): Map<string, CompiledQuerySpan[]> {
	const byRoom = new Map<string, CompiledQuerySpan[]>();
	for (const span of queries.spans) {
		if (span.kind !== 'opening') continue;
		const spans = byRoom.get(span.roomId) ?? [];
		spans.push(span);
		byRoom.set(span.roomId, spans);
	}
	return byRoom;
}

/** Room IDs in document order, derived from compiled room-floor polygons. */
function orderedRoomIds(queries: CompiledLayoutQueryGeometry): string[] {
	const ids: string[] = [];
	for (const polygon of queries.polygons) {
		if (polygon.kind === 'room-floor' && polygon.roomId && !ids.includes(polygon.roomId)) {
			ids.push(polygon.roomId);
		}
	}
	return ids;
}

function nearestPointHit(
	queries: CompiledLayoutQueryGeometry,
	point: LayoutVec2,
	tolerance: number,
	kind: 'vertex' | 'interior-anchor'
): PlanHitResult {
	let best: PlanHitResult = null;
	let bestDistance = tolerance;
	for (const record of queries.points) {
		if (record.kind !== kind) continue;
		const distance = Math.hypot(record.point[0] - point[0], record.point[1] - point[1]);
		if (distance <= bestDistance) {
			best =
				kind === 'vertex'
					? { kind: 'vertex', roomId: record.roomId, segmentId: record.segmentId, vertexIndex: record.sourceIndex }
					: { kind: 'interiorAnchor', roomId: record.roomId, segmentId: record.segmentId, anchorId: record.sourceId };
			bestDistance = distance;
		}
	}
	return best;
}

function nearestOpeningHit(
	queries: CompiledLayoutQueryGeometry,
	point: LayoutVec2,
	tolerance: number
): PlanHitResult {
	const wallSpans = wallSpansByRoomSegment(queries);
	const openingSpans = openingSpansByRoom(queries);
	for (const roomId of [...orderedRoomIds(queries)].reverse()) {
		for (const opening of [...(openingSpans.get(roomId) ?? [])].reverse()) {
			const spans = wallSpans.get(roomId)?.get(opening.segmentId) ?? [];
			const projection = projectPointToSpans(point, spans);
			if (!projection || projection.distance > tolerance) continue;
			if (
				projection.offset >= opening.startDistance - tolerance &&
				projection.offset <= opening.endDistance + tolerance
			) {
				return {
					kind: 'opening',
					roomId,
					segmentId: opening.segmentId,
					openingId: opening.openingId!,
					projection: { point: projection.point, offset: projection.offset, distance: projection.distance, t: projection.t }
				};
			}
		}
	}
	return null;
}

function nearestWallHit(
	queries: CompiledLayoutQueryGeometry,
	point: LayoutVec2,
	tolerance: number
): PlanHitResult {
	const wallSpans = wallSpansByRoomSegment(queries);
	let best: { roomId: string; segmentId: string; projection: PlanWallProjection } | null = null;
	for (const roomId of [...orderedRoomIds(queries)].reverse()) {
		for (const [segmentId, spans] of wallSpans.get(roomId) ?? []) {
			const projection = projectPointToSpans(point, spans);
			if (!projection || projection.distance > tolerance) continue;
			if (!best || projection.distance < best.projection.distance) {
				best = {
					roomId,
					segmentId,
					projection: { point: projection.point, offset: projection.offset, distance: projection.distance, t: projection.t }
				};
			}
		}
	}
	return best
		? { kind: 'wall', roomId: best.roomId, segmentId: best.segmentId, projection: best.projection }
		: null;
}

/**
 * Resolve the locked-priority hit for a world-space plan point. `options.
 * allowedRoomIds` restricts room hits to authored room candidates (e.g. only
 * first-floor rooms during primitive placement); a contained room outside the
 * set yields no hit.
 */
export function resolvePlanHit(
	queries: CompiledLayoutQueryGeometry,
	point: LayoutVec2,
	tolerance: number,
	options?: { allowedRoomIds?: ReadonlySet<string> }
): PlanHitResult {
	const vertex = nearestPointHit(queries, point, tolerance, 'vertex');
	if (vertex) return vertex;
	const anchor = nearestPointHit(queries, point, tolerance, 'interior-anchor');
	if (anchor) return anchor;
	const opening = nearestOpeningHit(queries, point, tolerance);
	if (opening) return opening;

	const objectPolygon = findPolygonContaining(
		point,
		queries.polygons.filter((polygon) => polygon.kind === 'object-footprint')
	);
	if (objectPolygon?.objectId) {
		return { kind: 'object', objectId: objectPolygon.objectId };
	}

	const wall = nearestWallHit(queries, point, tolerance);
	if (wall) return wall;

	const room = findPlanHitRoom(queries, point, options);
	return room ? { kind: 'room', roomId: room.roomId } : null;
}

/**
 * Room containment only — no vertex/anchor/opening/object/wall priority. Used by
 * primitive placement so a point near a wall still resolves to the containing
 * room, unlike the full selection priority in `resolvePlanHit`.
 */
export function findPlanHitRoom(
	queries: CompiledLayoutQueryGeometry,
	point: LayoutVec2,
	options?: { allowedRoomIds?: ReadonlySet<string> }
): { roomId: string } | null {
	const roomPolygons = options?.allowedRoomIds
		? queries.polygons.filter(
				(polygon) => polygon.kind === 'room-floor' && polygon.roomId && options.allowedRoomIds!.has(polygon.roomId)
			)
		: queries.polygons.filter((polygon) => polygon.kind === 'room-floor');
	const roomPolygon = findPolygonContaining(point, roomPolygons);
	return roomPolygon?.roomId ? { roomId: roomPolygon.roomId } : null;
}

/** Project a point onto one wall segment's compiled spans (linear reference). */
export function projectPointToWall(
	queries: CompiledLayoutQueryGeometry,
	roomId: string,
	segmentId: string,
	point: LayoutVec2
): PlanWallProjection | null {
	const spans = wallSpansByRoomSegment(queries).get(roomId)?.get(segmentId) ?? [];
	const projection = projectPointToSpans(point, spans);
	return projection
		? { point: projection.point, offset: projection.offset, distance: projection.distance, t: projection.t }
		: null;
}

/** Total compiled arc length of one wall segment. */
export function compiledWallLength(
	queries: CompiledLayoutQueryGeometry,
	roomId: string,
	segmentId: string
): number {
	return wallSpansByRoomSegment(queries).get(roomId)?.get(segmentId)?.at(-1)?.endDistance ?? 0;
}
