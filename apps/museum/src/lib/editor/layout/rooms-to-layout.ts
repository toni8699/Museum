import type { MuseumRoom, RoomOpeningSide } from '$lib/types/museum';
import { museumRooms, roomPoint } from '$lib/content/rooms';

import type {
	DraftSegment,
	LayoutDocument,
	LayoutFloor,
	LayoutOpening,
	LayoutRoom,
	LayoutVec2
} from './layout-types';

export const CHOPIN_LAYOUT_FLOOR_ID = 'floor-ground';
export const CHOPIN_LAYOUT_FALLBACK_FLOOR_NAME = 'Ground Floor';
export const CHOPIN_LAYOUT_WALL_THICKNESS = 0.16;
export const CHOPIN_LAYOUT_FLOOR_THICKNESS = 0.1;
export const CHOPIN_LAYOUT_CEILING_THICKNESS = 0.1;

const SIDE_ORDER: readonly RoomOpeningSide[] = ['neg-z', 'pos-x', 'pos-z', 'neg-x'];

type LocalPoint2 = [number, number];

/**
 * Compile today's static room architecture into the editor's layout document.
 *
 * Output coordinates are world X/Z coordinates. This preserves the authored
 * room poses while making the result independent from `rooms.ts` transforms.
 * Opening semantics remain geometry-only until B4 adds explicit portal links.
 */
export function roomsToLayout(rooms: readonly MuseumRoom[] = museumRooms): LayoutDocument {
	const floorHeight = rooms.reduce(
		(maxHeight, room) => Math.max(maxHeight, room.dimensions[1]),
		0
	);

	return {
		formatVersion: 1,
		units: 'meters',
		floors: [
			{
				id: CHOPIN_LAYOUT_FLOOR_ID,
				name: CHOPIN_LAYOUT_FALLBACK_FLOOR_NAME,
				elevation: 0,
				height: floorHeight,
				rooms: rooms.map(compileRoom)
			}
		],
		objects: []
	};
}

function compileRoom(room: MuseumRoom): LayoutRoom {
	const segments = createRoomSegments(room);
	const segmentBySide = new Map<RoomOpeningSide, DraftSegment>(
		SIDE_ORDER.map((side, index) => [side, segments[index]!])
	);

	return {
		id: room.id,
		name: room.title,
		boundary: { closed: true, segments },
		wallThickness: CHOPIN_LAYOUT_WALL_THICKNESS,
		floorThickness: CHOPIN_LAYOUT_FLOOR_THICKNESS,
		ceilingThickness: CHOPIN_LAYOUT_CEILING_THICKNESS,
		openings: room.openings.map((opening) =>
			compileOpening(room, opening, segmentBySide.get(opening.side)!)
		)
	};
}

function createRoomSegments(room: MuseumRoom): DraftSegment[] {
	const [width, , depth] = room.dimensions;
	const halfWidth = width / 2;
	const halfDepth = depth / 2;
	const localCorners: Record<RoomOpeningSide, [LocalPoint2, LocalPoint2]> = {
		'neg-z': [
			[-halfWidth, -halfDepth],
			[halfWidth, -halfDepth]
		],
		'pos-x': [
			[halfWidth, -halfDepth],
			[halfWidth, halfDepth]
		],
		'pos-z': [
			[halfWidth, halfDepth],
			[-halfWidth, halfDepth]
		],
		'neg-x': [
			[-halfWidth, halfDepth],
			[-halfWidth, -halfDepth]
		]
	};

	return SIDE_ORDER.map((side) => {
		const [start, end] = localCorners[side];
		return {
			id: `room:${room.id}:wall:${side}`,
			kind: 'line',
			start: toLayoutPoint(room, start),
			end: toLayoutPoint(room, end)
		};
	});
}

function compileOpening(
	room: MuseumRoom,
	opening: MuseumRoom['openings'][number],
	segment: DraftSegment
): LayoutOpening {
	if (segment.kind !== 'line') {
		throw new Error(`Expected compiled room segment to be a line: ${segment.id}`);
	}

	const segmentLength = distance2(segment.start, segment.end);
	const centeredOffset = opening.offset ?? 0;
	const offset = centeredOffsetToDistance(opening.side, centeredOffset, opening.width, segmentLength);

	return {
		id: `opening:${room.id}:${opening.id}`,
		segmentId: segment.id,
		kind: opening.kind === 'door' ? 'door' : 'window',
		offset,
		width: opening.width,
		height: opening.height,
		sillHeight: 0,
		profile: 'rectangular'
	};
}

function centeredOffsetToDistance(
	side: RoomOpeningSide,
	centeredOffset: number,
	openingWidth: number,
	segmentLength: number
): number {
	const halfLength = segmentLength / 2;
	const halfOpening = openingWidth / 2;
	const fromSegmentStart = side === 'neg-z' || side === 'pos-x';
	return fromSegmentStart
		? halfLength + centeredOffset - halfOpening
		: halfLength - centeredOffset - halfOpening;
}

function toLayoutPoint(room: MuseumRoom, [x, z]: LocalPoint2): LayoutVec2 {
	const worldPoint = roomPoint(room.id, [x, 0, z]);
	return [worldPoint[0], worldPoint[2]];
}

function distance2(start: LayoutVec2, end: LayoutVec2): number {
	return Math.hypot(end[0] - start[0], end[1] - start[1]);
}
