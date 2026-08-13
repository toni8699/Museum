import type { DraftSegment, LayoutOpening, LayoutRoom } from './layout-types';
import { segmentLength } from './curve-geometry';

export type LayoutOpeningKind = LayoutOpening['kind'];

export type SegmentProjection = {
	point: [number, number];
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

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
