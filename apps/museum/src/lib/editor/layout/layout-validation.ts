import type { DraftSegment, LayoutDocument, LayoutFloor, LayoutRoom, LayoutVec2 } from './layout-types';
import {
	LAYOUT_GEOMETRY_EPSILON,
	lineLength,
	openingIntervals
} from './draft-geometry';

export type LayoutGeometryIssue = {
	path: string;
	code: string;
	message: string;
	targetId?: string;
};

export function validateLineRoom(
	room: LayoutRoom,
	floor: LayoutFloor,
	path = `rooms.${room.id}`
): LayoutGeometryIssue[] {
	const issues: LayoutGeometryIssue[] = [];
	const segments = room.boundary.segments;

	if (floor.height <= 0 || !Number.isFinite(floor.height)) {
		issues.push({
			path: 'floor.height',
			code: 'invalid_floor_height',
			message: 'Floor height must be finite and greater than zero',
			targetId: floor.id
		});
	}
	if (segments.length < 3) {
		issues.push({
			path: `${path}.boundary.segments`,
			code: 'too_few_segments',
			message: 'A room boundary needs at least three segments',
			targetId: room.id
		});
	}

	const lineSegments: Extract<DraftSegment, { kind: 'line' }>[] = [];
	for (const [index, segment] of segments.entries()) {
		if (segment.kind !== 'line') {
			issues.push({
				path: `${path}.boundary.segments[${index}]`,
				code: 'bezier-deferred',
				message: 'Bezier geometry is deferred until A3',
				targetId: segment.id
			});
			continue;
		}

		if (!isFinitePoint(segment.start) || !isFinitePoint(segment.end)) {
			issues.push({
				path: `${path}.boundary.segments[${index}]`,
				code: 'non_finite_endpoint',
				message: 'Line endpoints must be finite',
				targetId: segment.id
			});
		}
		if (lineLength(segment.start, segment.end) <= LAYOUT_GEOMETRY_EPSILON) {
			issues.push({
				path: `${path}.boundary.segments[${index}]`,
				code: 'zero_length_segment',
				message: 'Line segment must have non-zero length',
				targetId: segment.id
			});
		}
		lineSegments.push(segment);
	}

	if (lineSegments.length === segments.length && segments.length >= 3) {
		for (let index = 0; index < segments.length; index += 1) {
			const current = segments[index]!;
			const next = segments[(index + 1) % segments.length]!;
			if (current.kind !== 'line' || next.kind !== 'line') continue;
			if (!pointsEqual(current.end, next.start)) {
				issues.push({
					path: `${path}.boundary.segments[${index}].end`,
					code: 'disconnected_boundary',
					message: `Segment does not connect to ${next.id}.`,
					targetId: current.id
				});
			}
		}

		for (let first = 0; first < lineSegments.length; first += 1) {
			for (let second = first + 1; second < lineSegments.length; second += 1) {
				if (areAdjacent(first, second, lineSegments.length)) continue;
				const a = lineSegments[first]!;
				const b = lineSegments[second]!;
				if (segmentsIntersect(a.start, a.end, b.start, b.end)) {
					issues.push({
						path: `${path}.boundary.segments`,
						code: 'self_intersection',
						message: `Segments ${a.id} and ${b.id} intersect.`,
						targetId: room.id
					});
				}
			}
		}
	}

	const lineById = new Map(lineSegments.map((segment) => [segment.id, segment]));
	const openingsBySegment = new Map<string, LayoutRoom['openings']>();
	for (const [index, opening] of room.openings.entries()) {
		const segment = lineById.get(opening.segmentId);
		if (!segment) {
			issues.push({
				path: `${path}.openings[${index}].segmentId`,
				code: 'opening_segment_invalid',
				message: 'Opening must reference an A1 line segment.',
				targetId: opening.id
			});
			continue;
		}
		if (!Number.isFinite(opening.offset) || opening.offset < 0) {
			issues.push({
				path: `${path}.openings[${index}].offset`,
				code: 'opening_offset_invalid',
				message: 'Opening offset must be finite and non-negative.',
				targetId: opening.id
			});
		}
		if (!Number.isFinite(opening.width) || opening.width <= 0) {
			issues.push({
				path: `${path}.openings[${index}].width`,
				code: 'opening_width_invalid',
				message: 'Opening width must be finite and greater than zero.',
				targetId: opening.id
			});
		}
		if (!Number.isFinite(opening.height) || opening.height <= 0) {
			issues.push({
				path: `${path}.openings[${index}].height`,
				code: 'opening_height_invalid',
				message: 'Opening height must be finite and greater than zero.',
				targetId: opening.id
			});
		}
		if (!Number.isFinite(opening.sillHeight) || opening.sillHeight < 0) {
			issues.push({
				path: `${path}.openings[${index}].sillHeight`,
				code: 'opening_sill_invalid',
				message: 'Opening sill height must be finite and non-negative.',
				targetId: opening.id
			});
		}
		if (
			Number.isFinite(opening.sillHeight) &&
			Number.isFinite(opening.height) &&
			opening.sillHeight + opening.height > floor.height + LAYOUT_GEOMETRY_EPSILON
		) {
			issues.push({
				path: `${path}.openings[${index}]`,
				code: 'opening_over_height',
				message: 'Opening top exceeds floor height.',
				targetId: opening.id
			});
		}

		const segmentLength = lineLength(segment.start, segment.end);
		if (opening.offset + opening.width > segmentLength + LAYOUT_GEOMETRY_EPSILON) {
			issues.push({
				path: `${path}.openings[${index}]`,
				code: 'opening_out_of_bounds',
				message: 'Opening interval exceeds its wall segment.',
				targetId: opening.id
			});
		}
		const existing = openingsBySegment.get(opening.segmentId) ?? [];
		existing.push(opening);
		openingsBySegment.set(opening.segmentId, existing);
	}

	for (const [segmentId, openings] of openingsBySegment) {
		const segment = lineById.get(segmentId);
		if (!segment) continue;
		const intervals = openingIntervals(segment, openings);
		for (let index = 1; index < intervals.length; index += 1) {
			const previous = intervals[index - 1]!;
			const current = intervals[index]!;
			if (current.startDistance < previous.endDistance - LAYOUT_GEOMETRY_EPSILON) {
				issues.push({
					path: `${path}.openings`,
					code: 'opening_overlap',
					message: `Openings ${previous.openingId} and ${current.openingId} overlap.`,
					targetId: segmentId
				});
			}
		}
	}

	return issues;
}

export function validateLayoutDocumentGeometry(document: LayoutDocument): LayoutGeometryIssue[] {
	const issues: LayoutGeometryIssue[] = [];
	for (const [floorIndex, floor] of document.floors.entries()) {
		for (const [roomIndex, room] of floor.rooms.entries()) {
			issues.push(
				...validateLineRoom(room, floor, `floors[${floorIndex}].rooms[${roomIndex}]`)
			);
		}
	}
	return issues;
}

function isFinitePoint(point: LayoutVec2): boolean {
	return point.every((value) => Number.isFinite(value));
}

function pointsEqual(a: LayoutVec2, b: LayoutVec2): boolean {
	return Math.abs(a[0] - b[0]) <= LAYOUT_GEOMETRY_EPSILON && Math.abs(a[1] - b[1]) <= LAYOUT_GEOMETRY_EPSILON;
}

function areAdjacent(first: number, second: number, count: number): boolean {
	return second === first + 1 || (first === 0 && second === count - 1);
}

function orientation(a: LayoutVec2, b: LayoutVec2, c: LayoutVec2): number {
	return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: LayoutVec2, b: LayoutVec2, point: LayoutVec2): boolean {
	return (
		point[0] >= Math.min(a[0], b[0]) - LAYOUT_GEOMETRY_EPSILON &&
		point[0] <= Math.max(a[0], b[0]) + LAYOUT_GEOMETRY_EPSILON &&
		point[1] >= Math.min(a[1], b[1]) - LAYOUT_GEOMETRY_EPSILON &&
		point[1] <= Math.max(a[1], b[1]) + LAYOUT_GEOMETRY_EPSILON
	);
}

function segmentsIntersect(
	aStart: LayoutVec2,
	aEnd: LayoutVec2,
	bStart: LayoutVec2,
	bEnd: LayoutVec2
): boolean {
	const aToBStart = orientation(aStart, aEnd, bStart);
	const aToBEnd = orientation(aStart, aEnd, bEnd);
	const bToAStart = orientation(bStart, bEnd, aStart);
	const bToAEnd = orientation(bStart, bEnd, aEnd);

	const crosses =
		((aToBStart > LAYOUT_GEOMETRY_EPSILON && aToBEnd < -LAYOUT_GEOMETRY_EPSILON) ||
			(aToBStart < -LAYOUT_GEOMETRY_EPSILON && aToBEnd > LAYOUT_GEOMETRY_EPSILON)) &&
		((bToAStart > LAYOUT_GEOMETRY_EPSILON && bToAEnd < -LAYOUT_GEOMETRY_EPSILON) ||
			(bToAStart < -LAYOUT_GEOMETRY_EPSILON && bToAEnd > LAYOUT_GEOMETRY_EPSILON));
	if (crosses) return true;

	return (
		(Math.abs(aToBStart) <= LAYOUT_GEOMETRY_EPSILON && onSegment(aStart, aEnd, bStart)) ||
		(Math.abs(aToBEnd) <= LAYOUT_GEOMETRY_EPSILON && onSegment(aStart, aEnd, bEnd)) ||
		(Math.abs(bToAStart) <= LAYOUT_GEOMETRY_EPSILON && onSegment(bStart, bEnd, aStart)) ||
		(Math.abs(bToAEnd) <= LAYOUT_GEOMETRY_EPSILON && onSegment(bStart, bEnd, aEnd))
	);
}
