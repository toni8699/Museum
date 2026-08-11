import type { DraftSegment, LayoutOpening, LayoutRoom, LayoutVec2 } from './layout-types';
import { lineLength } from './draft-geometry';
import {
	pointAtDistance,
	projectPointToSampledSegment,
	sampleSegment,
	segmentLength,
	type CurveSample
} from './curve-geometry';

export type LayoutOpeningKind = LayoutOpening['kind'];

export type SegmentProjection = {
	point: LayoutVec2;
	offset: number;
	distance: number;
	t: number;
};

export type LayoutOpeningPatch = Partial<Pick<LayoutOpening, 'offset' | 'width' | 'height' | 'sillHeight' | 'kind' | 'profile'>>;

export const LAYOUT_OPENING_SNAP = 0.25;
export const LAYOUT_PLAN_HIT_RADIUS_PX = 12;

const OPENING_DEFAULTS: Record<LayoutOpeningKind, Pick<LayoutOpening, 'width' | 'height' | 'sillHeight'>> = {
	door: { width: 0.9, height: 2.1, sillHeight: 0 },
	window: { width: 1.2, height: 1.2, sillHeight: 1 }
};

export function projectPointToSegment(point: LayoutVec2, start: LayoutVec2, end: LayoutVec2): SegmentProjection {
	return projectLine(point, start, end);
}

export function projectPointToDraftSegment(point: LayoutVec2, segment: DraftSegment): SegmentProjection {
	const sampled = projectPointToSampledSegment(point, sampleSegment(segment));
	return { point: sampled.point, offset: sampled.distance, distance: sampled.distanceToPath, t: sampled.t };
}

export function segmentPointAtOffset(segment: DraftSegment, offset: number): LayoutVec2 {
	if (segment.kind === 'line') {
		const length = lineLength(segment.start, segment.end);
		if (length <= 0) return [...segment.start];
		const t = clamp(offset / length, 0, 1);
		return [segment.start[0] + (segment.end[0] - segment.start[0]) * t, segment.start[1] + (segment.end[1] - segment.start[1]) * t];
	}
	return pointAtDistance(sampleSegment(segment), offset).point;
}

export function snapSegmentOffset(offset: number, segmentLengthValue: number, snapSize = LAYOUT_OPENING_SNAP): number {
	if (!Number.isFinite(offset) || !Number.isFinite(segmentLengthValue) || segmentLengthValue <= 0) return 0;
	if (!Number.isFinite(snapSize) || snapSize <= 0) return clamp(offset, 0, segmentLengthValue);
	return clamp(Math.round(offset / snapSize) * snapSize, 0, segmentLengthValue);
}

export function openingInterval(opening: LayoutOpening): { start: number; end: number } {
	return { start: opening.offset, end: opening.offset + opening.width };
}

export function openingContainsOffset(opening: LayoutOpening, offset: number, tolerance = 0): boolean {
	const interval = openingInterval(opening);
	return offset >= interval.start - tolerance && offset <= interval.end + tolerance;
}

export function offsetInsideOpeningIntervals(
	offset: number,
	openings: readonly Pick<LayoutOpening, 'offset' | 'width'>[],
	epsilon = 1e-6
): boolean {
	return openings.some((opening) => {
		const start = opening.offset;
		const end = opening.offset + opening.width;
		return offset >= start - epsilon && offset <= end + epsilon;
	});
}

/** Split sampled wall centerline at opening interval endpoints (keeps solid stubs; never culls whole wall). */
export function wallPolylinesAroundOpenings(
	samples: readonly CurveSample[],
	openings: readonly Pick<LayoutOpening, 'offset' | 'width'>[]
): LayoutVec2[][] {
	if (samples.length === 0) return [];
	if (samples.length === 1) return [[[...samples[0]!.point] as LayoutVec2]];
	const length = samples.at(-1)!.distance;
	const cuts = new Set<number>([0, length]);
	for (const opening of openings) {
		cuts.add(clamp(opening.offset, 0, length));
		cuts.add(clamp(opening.offset + opening.width, 0, length));
	}
	const sortedCuts = [...cuts].sort((a, b) => a - b);
	const polylines: LayoutVec2[][] = [];
	for (let index = 1; index < sortedCuts.length; index += 1) {
		const start = sortedCuts[index - 1]!;
		const end = sortedCuts[index]!;
		if (end - start <= 1e-6) continue;
		const mid = (start + end) / 2;
		if (offsetInsideOpeningIntervals(mid, openings)) continue;
		const points = samplesInDistanceRange(samples, start, end);
		if (points.length >= 2) polylines.push(points);
	}
	return polylines;
}

export function samplesInDistanceRange(
	samples: readonly CurveSample[],
	startDistance: number,
	endDistance: number
): LayoutVec2[] {
	if (samples.length === 0 || endDistance <= startDistance + 1e-6) return [];
	const points: LayoutVec2[] = [pointAlongSamples(samples, startDistance)];
	for (const sample of samples) {
		if (sample.distance > startDistance + 1e-6 && sample.distance < endDistance - 1e-6) {
			points.push([...sample.point] as LayoutVec2);
		}
	}
	points.push(pointAlongSamples(samples, endDistance));
	return points;
}

export function pointAlongSamples(samples: readonly CurveSample[], distanceAlong: number): LayoutVec2 {
	if (samples.length === 0) return [0, 0];
	if (samples.length === 1) return [...samples[0]!.point] as LayoutVec2;
	const target = Math.min(samples.at(-1)!.distance, Math.max(0, distanceAlong));
	for (let index = 1; index < samples.length; index += 1) {
		const start = samples[index - 1]!;
		const end = samples[index]!;
		if (target <= end.distance + 1e-9) {
			const span = end.distance - start.distance;
			const amount = span > 1e-9 ? (target - start.distance) / span : 0;
			return [
				start.point[0] + (end.point[0] - start.point[0]) * amount,
				start.point[1] + (end.point[1] - start.point[1]) * amount
			];
		}
	}
	return [...samples.at(-1)!.point] as LayoutVec2;
}

/** Sampled opening centerline for Plan overlay (follows curve, not chord). */
export function openingSamplePolyline(
	segment: DraftSegment,
	opening: Pick<LayoutOpening, 'offset' | 'width'>
): LayoutVec2[] {
	const start = opening.offset;
	const end = opening.offset + opening.width;
	const points: LayoutVec2[] = [[...segmentPointAtOffset(segment, start)]];
	for (const sample of sampleSegment(segment).samples) {
		if (sample.distance > start + 1e-6 && sample.distance < end - 1e-6) {
			points.push([...sample.point] as LayoutVec2);
		}
	}
	points.push([...segmentPointAtOffset(segment, end)]);
	return points;
}

export function createDefaultOpening(options: {
	id: string;
	segment: DraftSegment;
	kind: LayoutOpeningKind;
	clickOffset: number;
	snapEnabled?: boolean;
}): LayoutOpening {
	const defaults = OPENING_DEFAULTS[options.kind];
	const segmentLengthValue = segmentLength(options.segment);
	const width = Math.min(defaults.width, segmentLengthValue);
	const snappedClickOffset = options.snapEnabled === false ? clamp(options.clickOffset, 0, segmentLengthValue) : snapSegmentOffset(options.clickOffset, segmentLengthValue);
	const offset = clamp(snappedClickOffset - width / 2, 0, Math.max(0, segmentLengthValue - width));
	return { id: options.id, segmentId: options.segment.id, kind: options.kind, offset, width, height: defaults.height, sillHeight: defaults.sillHeight, profile: 'rectangular' };
}

export function updateLayoutOpening(opening: LayoutOpening, patch: LayoutOpeningPatch): LayoutOpening {
	return { ...opening, ...patch };
}

export function replaceRoomOpening(room: LayoutRoom, nextOpening: LayoutOpening): LayoutRoom {
	return { ...room, openings: room.openings.map((opening) => (opening.id === nextOpening.id ? { ...nextOpening } : opening)) };
}

export function appendRoomOpening(room: LayoutRoom, opening: LayoutOpening): LayoutRoom {
	return { ...room, openings: [...room.openings, { ...opening }] };
}

export function removeRoomOpening(room: LayoutRoom, openingId: string): LayoutRoom {
	return { ...room, openings: room.openings.filter((opening) => opening.id !== openingId) };
}

export function findRoomOpening(room: LayoutRoom, openingId: string): LayoutOpening | undefined {
	return room.openings.find((opening) => opening.id === openingId);
}

export function nextOpeningId(room: LayoutRoom, kind: LayoutOpeningKind): string {
	const prefix = `opening:${room.id}:${kind}`;
	const ids = new Set(room.openings.map((opening) => opening.id));
	let index = 1;
	while (ids.has(`${prefix}:${index}`)) index += 1;
	return `${prefix}:${index}`;
}

function projectLine(point: LayoutVec2, start: LayoutVec2, end: LayoutVec2): SegmentProjection {
	const dx = end[0] - start[0];
	const dz = end[1] - start[1];
	const squaredLength = dx * dx + dz * dz;
	const rawT = squaredLength > 0 ? ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / squaredLength : 0;
	const t = clamp(rawT, 0, 1);
	const projected: LayoutVec2 = [start[0] + dx * t, start[1] + dz * t];
	return { point: projected, offset: Math.sqrt(squaredLength) * t, distance: Math.hypot(point[0] - projected[0], point[1] - projected[1]), t };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
