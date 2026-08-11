import type { DraftSegment, LayoutOpening, LayoutRoom, LayoutVec2 } from './layout-types';
import { lineLength } from './draft-geometry';

export type LayoutOpeningKind = LayoutOpening['kind'];

export type SegmentProjection = {
	point: LayoutVec2;
	offset: number;
	distance: number;
	t: number;
};

export type LayoutOpeningPatch = Partial<
	Pick<LayoutOpening, 'offset' | 'width' | 'height' | 'sillHeight' | 'kind' | 'profile'>
>;

export const LAYOUT_OPENING_SNAP = 0.25;
export const LAYOUT_PLAN_HIT_RADIUS_PX = 12;

const OPENING_DEFAULTS: Record<LayoutOpeningKind, Pick<LayoutOpening, 'width' | 'height' | 'sillHeight'>> = {
	door: { width: 0.9, height: 2.1, sillHeight: 0 },
	window: { width: 1.2, height: 1.2, sillHeight: 1 }
};

export function projectPointToSegment(
	point: LayoutVec2,
	start: LayoutVec2,
	end: LayoutVec2
): SegmentProjection {
	const dx = end[0] - start[0];
	const dz = end[1] - start[1];
	const squaredLength = dx * dx + dz * dz;
	const rawT = squaredLength > 0 ? ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / squaredLength : 0;
	const t = clamp(rawT, 0, 1);
	const projected: LayoutVec2 = [start[0] + dx * t, start[1] + dz * t];
	return {
		point: projected,
		offset: Math.sqrt(squaredLength) * t,
		distance: Math.hypot(point[0] - projected[0], point[1] - projected[1]),
		t
	};
}

export function segmentPointAtOffset(
	segment: Extract<DraftSegment, { kind: 'line' }>,
	offset: number
): LayoutVec2 {
	const length = lineLength(segment.start, segment.end);
	if (length <= 0) return [...segment.start];
	const t = clamp(offset / length, 0, 1);
	return [
		segment.start[0] + (segment.end[0] - segment.start[0]) * t,
		segment.start[1] + (segment.end[1] - segment.start[1]) * t
	];
}

export function snapSegmentOffset(offset: number, segmentLength: number, snapSize = LAYOUT_OPENING_SNAP): number {
	if (!Number.isFinite(offset) || !Number.isFinite(segmentLength) || segmentLength <= 0) return 0;
	if (!Number.isFinite(snapSize) || snapSize <= 0) return clamp(offset, 0, segmentLength);
	return clamp(Math.round(offset / snapSize) * snapSize, 0, segmentLength);
}

export function openingInterval(opening: LayoutOpening): { start: number; end: number } {
	return { start: opening.offset, end: opening.offset + opening.width };
}

export function openingContainsOffset(
	opening: LayoutOpening,
	offset: number,
	tolerance = 0
): boolean {
	const interval = openingInterval(opening);
	return offset >= interval.start - tolerance && offset <= interval.end + tolerance;
}

export function createDefaultOpening(options: {
	id: string;
	segment: Extract<DraftSegment, { kind: 'line' }>;
	kind: LayoutOpeningKind;
	clickOffset: number;
	snapEnabled?: boolean;
}): LayoutOpening {
	const defaults = OPENING_DEFAULTS[options.kind];
	const segmentLength = lineLength(options.segment.start, options.segment.end);
	const width = Math.min(defaults.width, segmentLength);
	const snappedClickOffset = options.snapEnabled === false
		? clamp(options.clickOffset, 0, segmentLength)
		: snapSegmentOffset(options.clickOffset, segmentLength);
	const offset = clamp(snappedClickOffset - width / 2, 0, Math.max(0, segmentLength - width));
	return {
		id: options.id,
		segmentId: options.segment.id,
		kind: options.kind,
		offset,
		width,
		height: defaults.height,
		sillHeight: defaults.sillHeight,
		profile: 'rectangular'
	};
}

export function updateLayoutOpening(opening: LayoutOpening, patch: LayoutOpeningPatch): LayoutOpening {
	return { ...opening, ...patch };
}

export function replaceRoomOpening(room: LayoutRoom, nextOpening: LayoutOpening): LayoutRoom {
	return {
		...room,
		openings: room.openings.map((opening) => (opening.id === nextOpening.id ? { ...nextOpening } : opening))
	};
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

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
