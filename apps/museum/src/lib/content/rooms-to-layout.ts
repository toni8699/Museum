import type { MuseumRoom, RoomOpeningSide } from '$lib/types/museum';
import { museumRooms, roomPoint } from './rooms';
import type {
  DraftSegment,
  LayoutDocument,
  LayoutFloor,
  LayoutOpening,
  LayoutRoom,
  LayoutVec2
} from '$lib/layout/layout-types';

export const CHOPIN_LAYOUT_FLOOR_ID = 'floor-ground';
export const CHOPIN_LAYOUT_FALLBACK_FLOOR_NAME = 'Ground Floor';
export const CHOPIN_LAYOUT_WALL_THICKNESS = 0.16;
export const CHOPIN_LAYOUT_FLOOR_THICKNESS = 0.1;
export const CHOPIN_LAYOUT_CEILING_THICKNESS = 0.1;

const SIDE_ORDER: readonly RoomOpeningSide[] = ['neg-z', 'pos-x', 'pos-z', 'neg-x'];

const CHOPIN_PORTAL_RELATIONS: Readonly<Record<string, [string, string]>> = {
  'entrance:entrance-from-legacy': ['entrance', 'legacy'],
  'entrance:entrance-to-poland': ['entrance', 'poland'],
  'poland:poland-from-entrance': ['entrance', 'poland'],
  'poland:poland-to-departure': ['departure', 'poland'],
  'departure:departure-from-poland': ['departure', 'poland'],
  'departure:departure-to-paris': ['departure', 'paris'],
  'paris:paris-from-departure': ['departure', 'paris'],
  'paris:paris-to-workshop': ['paris', 'workshop'],
  'workshop:workshop-from-paris': ['paris', 'workshop'],
  'workshop:workshop-to-chamber': ['music-chamber', 'workshop'],
  'legacy:legacy-from-chamber': ['legacy', 'music-chamber'],
  'legacy:legacy-to-entrance': ['entrance', 'legacy']
};

/** Compile static room architecture without importing editor code. */
export function roomsToLayout(rooms: readonly MuseumRoom[] = museumRooms): LayoutDocument {
  const roomIds = new Set(rooms.map((room) => room.id));
  const floorHeight = rooms.reduce((maxHeight, room) => Math.max(maxHeight, room.dimensions[1]), 0);
  const floor: LayoutFloor = {
    id: CHOPIN_LAYOUT_FLOOR_ID,
    name: CHOPIN_LAYOUT_FALLBACK_FLOOR_NAME,
    elevation: 0,
    height: floorHeight,
    rooms: rooms.map((room) => compileRoom(room, roomIds))
  };
  return { formatVersion: 2, units: 'meters', floors: [floor], objects: [] };
}

function compileRoom(room: MuseumRoom, roomIds: ReadonlySet<string>): LayoutRoom {
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
      compileOpening(room, opening, segmentBySide.get(opening.side)!, roomIds)
    )
  };
}

function createRoomSegments(room: MuseumRoom): DraftSegment[] {
  const [width, , depth] = room.dimensions;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const localCorners: Record<RoomOpeningSide, [[number, number], [number, number]]> = {
    'neg-z': [[-halfWidth, -halfDepth], [halfWidth, -halfDepth]],
    'pos-x': [[halfWidth, -halfDepth], [halfWidth, halfDepth]],
    'pos-z': [[halfWidth, halfDepth], [-halfWidth, halfDepth]],
    'neg-x': [[-halfWidth, halfDepth], [-halfWidth, -halfDepth]]
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
  segment: DraftSegment,
  roomIds: ReadonlySet<string>
): LayoutOpening {
  if (segment.kind !== 'line') throw new Error(`Expected compiled room segment to be a line: ${segment.id}`);
  const segmentLength = distance2(segment.start, segment.end);
  const centeredOffset = opening.offset ?? 0;
  const relation = opening.kind === 'door' ? CHOPIN_PORTAL_RELATIONS[`${room.id}:${opening.id}`] : undefined;
  const connectsRoomIds = relation && relation.every((roomId) => roomIds.has(roomId))
    ? [...relation].sort((a, b) => a.localeCompare(b)) as [string, string]
    : undefined;
  return {
    id: `opening:${room.id}:${opening.id}`,
    segmentId: segment.id,
    kind: opening.kind === 'door' ? 'door' : 'window',
    offset: centeredOffsetToDistance(opening.side, centeredOffset, opening.width, segmentLength),
    width: opening.width,
    height: opening.height,
    sillHeight: 0,
    profile: 'rectangular',
    ...(connectsRoomIds ? { connectsRoomIds } : {})
  };
}

function centeredOffsetToDistance(side: RoomOpeningSide, centeredOffset: number, openingWidth: number, segmentLength: number): number {
  const halfLength = segmentLength / 2;
  const halfOpening = openingWidth / 2;
  const fromSegmentStart = side === 'neg-z' || side === 'pos-x';
  return fromSegmentStart
    ? halfLength + centeredOffset - halfOpening
    : halfLength - centeredOffset - halfOpening;
}

function toLayoutPoint(room: MuseumRoom, [x, z]: [number, number]): LayoutVec2 {
  const worldPoint = roomPoint(room.id, [x, 0, z]);
  return [worldPoint[0], worldPoint[2]];
}

function distance2(start: LayoutVec2, end: LayoutVec2): number {
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}
