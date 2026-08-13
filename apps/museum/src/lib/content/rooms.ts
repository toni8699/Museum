/**
 * @deprecated Editor compatibility projection. Production visitor code must use
 * `chopinRuntime.rooms`; no architecture is authored in this module.
 */
import { chopinRuntime } from './chopin-project';
import { getChopinRoomPresentation } from './chopin-room-presentation';
import type {
	MuseumRoom,
	MuseumRoomId,
	RoomOpening,
	RoomOpeningSide,
	Vec3
} from '$lib/types/museum';

const SIDES = ['neg-z', 'pos-x', 'pos-z', 'neg-x'] as const satisfies readonly RoomOpeningSide[];

export const museumRooms: MuseumRoom[] = chopinRuntime.rooms.entries.map((entry) => {
	const presentation = getChopinRoomPresentation(entry.id);
	const localBoundary = entry.room.boundary.segments.map((segment) =>
		chopinRuntime.rooms.localPoint(entry.id, [segment.start[0], entry.floor.elevation, segment.start[1]])
	);
	const minX = Math.min(...localBoundary.map((point) => point[0]));
	const maxX = Math.max(...localBoundary.map((point) => point[0]));
	const minZ = Math.min(...localBoundary.map((point) => point[2]));
	const maxZ = Math.max(...localBoundary.map((point) => point[2]));
	const segmentById = new Map(entry.room.boundary.segments.map((segment, index) => [segment.id, { segment, index }]));
	const openings: RoomOpening[] = entry.room.openings.flatMap((opening) => {
		const found = segmentById.get(opening.segmentId);
		if (!found) return [];
		const side = SIDES[found.index];
		if (!side) return [];
		const length = Math.hypot(
			found.segment.end[0] - found.segment.start[0],
			found.segment.end[1] - found.segment.start[1]
		);
		const halfOpening = opening.width / 2;
		const centeredOffset = side === 'neg-z' || side === 'pos-x'
			? opening.offset - length / 2 + halfOpening
			: length / 2 - opening.offset - halfOpening;
		return [{
			id: opening.id.replace(`opening:${entry.id}:`, ''),
			side,
			...(Math.abs(centeredOffset) <= 1e-12 ? {} : { offset: centeredOffset }),
			width: opening.width,
			height: opening.height,
			kind: opening.kind === 'door' ? 'door' : 'sightline'
		} satisfies RoomOpening];
	});
	return {
		id: entry.id,
		title: entry.name,
		...(presentation.subtitle ? { subtitle: presentation.subtitle } : {}),
		mood: presentation.mood ?? '',
		position: [...entry.position],
		rotation: [...entry.rotation],
		dimensions: [cleanDimension(maxX - minX), entry.floor.height, cleanDimension(maxZ - minZ)],
		openings,
		color: presentation.color,
		accentColor: presentation.accentColor
	};
});

export const roomById = new Map<MuseumRoomId, MuseumRoom>(museumRooms.map((room) => [room.id, room]));

export function getRoom(id: MuseumRoomId): MuseumRoom {
	const room = roomById.get(id);
	if (!room) throw new Error(`Unknown museum room: ${id}`);
	return room;
}

export function roomPoint(roomId: MuseumRoomId, localPoint: Vec3): Vec3 {
	return chopinRuntime.rooms.point(roomId, localPoint);
}

export function roomLocalPoint(roomId: MuseumRoomId, worldPoint: Vec3): Vec3 {
	return chopinRuntime.rooms.localPoint(roomId, worldPoint);
}

export function isWorldPointInsideRoomXZ(
	roomId: MuseumRoomId,
	worldPoint: Vec3,
	epsilon = 1e-6
): boolean {
	const room = getRoom(roomId);
	const [localX, , localZ] = roomLocalPoint(roomId, worldPoint);
	return Math.abs(localX) <= room.dimensions[0] / 2 + epsilon &&
		Math.abs(localZ) <= room.dimensions[2] / 2 + epsilon;
}

function cleanDimension(value: number): number {
	return Math.round(value * 1e12) / 1e12;
}
