import type { DraftSegment, LayoutDocument, LayoutFloor, LayoutRoom, LayoutVec2 } from './layout-types';
import { buildArchProfile } from './arch-profile';
import { CURVE_ENDPOINT_EPSILON, CURVE_SELF_INTERSECTION_TOLERANCE, sampleSegment, sampledPolylineIntersects, sampledPolylineSelfIntersects } from './curve-geometry';
import { LAYOUT_GEOMETRY_EPSILON, openingIntervals } from './draft-geometry';
import { segmentLength } from './curve-geometry';

export type LayoutGeometryIssue = {
	path: string;
	code: string;
	message: string;
	targetId?: string;
	severity?: 'warning' | 'error';
};

export function validateLineRoom(room: LayoutRoom, floor: LayoutFloor, path = `rooms.${room.id}`): LayoutGeometryIssue[] {
	return validateLayoutRoomGeometry(room, floor, path);
}

export function validateLayoutRoomGeometry(room: LayoutRoom, floor: LayoutFloor, path = `rooms.${room.id}`): LayoutGeometryIssue[] {
	const issues: LayoutGeometryIssue[] = [];
	const segments = room.boundary.segments;
	if (floor.height <= 0 || !Number.isFinite(floor.height)) {
		issues.push({ path: 'floor.height', code: 'invalid_floor_height', message: 'Floor height must be finite and greater than zero', targetId: floor.id });
	}
	if (segments.length < 3) {
		issues.push({ path: `${path}.boundary.segments`, code: 'too_few_segments', message: 'A room boundary needs at least three segments', targetId: room.id });
	}

	const sampled = new Map<string, ReturnType<typeof sampleSegment>>();
	for (const [index, segment] of segments.entries()) {
		if (!isFiniteSegment(segment)) {
			issues.push({ path: `${path}.boundary.segments[${index}]`, code: 'non_finite_endpoint', message: 'Segment points and interior anchors must be finite', targetId: segment.id });
			continue;
		}
		const sampledSegment = sampleSegment(segment);
		sampled.set(segment.id, sampledSegment);
		if (sampledSegment.length <= CURVE_ENDPOINT_EPSILON) {
			issues.push({ path: `${path}.boundary.segments[${index}]`, code: 'zero_length_segment', message: 'Segment must have non-zero effective length', targetId: segment.id });
		}
	}

	if (segments.length >= 3) {
		for (let index = 0; index < segments.length; index += 1) {
			const current = segments[index]!;
			const next = segments[(index + 1) % segments.length]!;
			if (!pointsEqual(current.end, next.start)) {
				issues.push({ path: `${path}.boundary.segments[${index}].end`, code: 'disconnected_boundary', message: `Segment does not connect to ${next.id}.`, targetId: current.id });
			}
		}
		for (let first = 0; first < segments.length; first += 1) {
			const firstSamples = sampled.get(segments[first]!.id)?.samples ?? [];
			if (sampledPolylineSelfIntersects(firstSamples, CURVE_SELF_INTERSECTION_TOLERANCE)) {
				issues.push({ path: `${path}.boundary.segments[${first}]`, code: 'self_intersection', message: `Segment ${segments[first]!.id} intersects itself.`, targetId: room.id });
			}
			for (let second = first + 1; second < segments.length; second += 1) {
				const secondSamples = sampled.get(segments[second]!.id)?.samples ?? [];
				const sharedEndpoint = areAdjacent(first, second, segments.length)
					? first === 0 && second === segments.length - 1
						? segments[first]!.start
						: segments[first]!.end
					: undefined;
				if (sampledPolylineIntersects(firstSamples, secondSamples, CURVE_SELF_INTERSECTION_TOLERANCE, sharedEndpoint)) {
					issues.push({ path: `${path}.boundary.segments`, code: 'self_intersection', message: `Segments ${segments[first]!.id} and ${segments[second]!.id} intersect.`, targetId: room.id });
				}
			}
		}
	}

	const openingsBySegment = new Map<string, LayoutRoom['openings']>();
	for (const [index, opening] of room.openings.entries()) {
		const segment = segments.find((candidate) => candidate.id === opening.segmentId);
		if (!segment) {
			issues.push({ path: `${path}.openings[${index}].segmentId`, code: 'opening_segment_invalid', message: 'Opening must reference a room boundary segment.', targetId: opening.id });
			continue;
		}
		if (!Number.isFinite(opening.offset) || opening.offset < 0) issues.push({ path: `${path}.openings[${index}].offset`, code: 'opening_offset_invalid', message: 'Opening offset must be finite and non-negative.', targetId: opening.id });
		if (!Number.isFinite(opening.width) || opening.width <= 0) issues.push({ path: `${path}.openings[${index}].width`, code: 'opening_width_invalid', message: 'Opening width must be finite and greater than zero.', targetId: opening.id });
		if (!Number.isFinite(opening.height) || opening.height <= 0) issues.push({ path: `${path}.openings[${index}].height`, code: 'opening_height_invalid', message: 'Opening height must be finite and greater than zero.', targetId: opening.id });
		if (!Number.isFinite(opening.sillHeight) || opening.sillHeight < 0) issues.push({ path: `${path}.openings[${index}].sillHeight`, code: 'opening_sill_invalid', message: 'Opening sill height must be finite and non-negative.', targetId: opening.id });
		if (Number.isFinite(opening.sillHeight) && Number.isFinite(opening.height) && opening.sillHeight + opening.height > floor.height + LAYOUT_GEOMETRY_EPSILON) issues.push({ path: `${path}.openings[${index}]`, code: 'opening_over_height', message: 'Opening top exceeds floor height.', targetId: opening.id });
		if (Number.isFinite(opening.width) && Number.isFinite(opening.height)) {
			const profileResult = buildArchProfile(opening.profile, opening.width, opening.height);
			for (const profileIssue of profileResult.issues) issues.push({ path: `${path}.openings[${index}].profile`, code: profileIssue.code, message: profileIssue.message, targetId: opening.id });
		}
		const length = sampled.get(segment.id)?.length ?? segmentLength(segment);
		if (opening.offset + opening.width > length + LAYOUT_GEOMETRY_EPSILON) issues.push({ path: `${path}.openings[${index}]`, code: 'opening_out_of_bounds', message: 'Opening interval exceeds its wall segment.', targetId: opening.id });
		const existing = openingsBySegment.get(segment.id) ?? [];
		existing.push(opening);
		openingsBySegment.set(segment.id, existing);
	}

	for (const [segmentId, openings] of openingsBySegment) {
		const segment = segments.find((candidate) => candidate.id === segmentId);
		if (!segment) continue;
		const intervals = openingIntervals(segment, openings);
		for (let index = 1; index < intervals.length; index += 1) {
			const previous = intervals[index - 1]!;
			const current = intervals[index]!;
			if (current.startDistance < previous.endDistance - LAYOUT_GEOMETRY_EPSILON) issues.push({ path: `${path}.openings`, code: 'opening_overlap', message: `Openings ${previous.openingId} and ${current.openingId} overlap.`, targetId: segmentId });
		}
	}
	return issues;
}

export function hasBlockingLayoutIssues(issues: readonly LayoutGeometryIssue[]): boolean {
	return issues.some((issue) => issue.severity !== 'warning');
}

export function validateLayoutDocumentGeometry(document: LayoutDocument): LayoutGeometryIssue[] {
	const issues: LayoutGeometryIssue[] = [];
	for (const [floorIndex, floor] of document.floors.entries()) {
		for (const [roomIndex, room] of floor.rooms.entries()) issues.push(...validateLayoutRoomGeometry(room, floor, `floors[${floorIndex}].rooms[${roomIndex}]`));
	}
	return issues;
}

function isFiniteSegment(segment: DraftSegment): boolean {
	const points =
		segment.kind === 'line'
			? [segment.start, segment.end]
			: [segment.start, segment.end, ...segment.interiorAnchors.map((anchor) => anchor.point)];
	return points.every((point) => point.every((value) => Number.isFinite(value)));
}

function pointsEqual(a: LayoutVec2, b: LayoutVec2): boolean {
	return Math.abs(a[0] - b[0]) <= LAYOUT_GEOMETRY_EPSILON && Math.abs(a[1] - b[1]) <= LAYOUT_GEOMETRY_EPSILON;
}
function areAdjacent(first: number, second: number, count: number): boolean {
	return second === first + 1 || (first === 0 && second === count - 1);
}