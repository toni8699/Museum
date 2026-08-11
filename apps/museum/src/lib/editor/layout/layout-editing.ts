import type { LayoutRoom, LayoutVec2 } from './layout-types';

export function roomPoints(room: LayoutRoom): LayoutVec2[] {
	return room.boundary.segments.map((segment) => [...segment.start] as LayoutVec2);
}

export function translateRoom(room: LayoutRoom, delta: LayoutVec2): LayoutRoom {
	return replaceRoomPoints(room, roomPoints(room).map(([x, z]) => [x + delta[0], z + delta[1]]));
}

export function replaceRoomVertex(
	room: LayoutRoom,
	vertexIndex: number,
	point: LayoutVec2
): LayoutRoom {
	const points = roomPoints(room);
	if (vertexIndex < 0 || vertexIndex >= points.length) return room;
	points[vertexIndex] = [...point];
	return replaceRoomPoints(room, points);
}

export function replaceRoomPoints(room: LayoutRoom, points: readonly LayoutVec2[]): LayoutRoom {
	if (points.length !== room.boundary.segments.length) return room;
	return {
		...room,
		boundary: {
			...room.boundary,
			segments: room.boundary.segments.map((segment, index) => {
				const start = [...points[index]!] as LayoutVec2;
				const end = [...points[(index + 1) % points.length]!] as LayoutVec2;
				return { ...segment, start, end };
			})
		}
	};
}

export function roomBounds(room: LayoutRoom): {
	minX: number;
	minZ: number;
	maxX: number;
	maxZ: number;
	width: number;
	height: number;
} {
	const points = roomPoints(room);
	const minX = Math.min(...points.map(([x]) => x));
	const maxX = Math.max(...points.map(([x]) => x));
	const minZ = Math.min(...points.map(([, z]) => z));
	const maxZ = Math.max(...points.map(([, z]) => z));
	return { minX, minZ, maxX, maxZ, width: maxX - minX, height: maxZ - minZ };
}

export function roomEdgeLength(room: LayoutRoom, edgeIndex: number): number {
	const segment = room.boundary.segments[edgeIndex];
	if (!segment || segment.kind !== 'line') return 0;
	return Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]);
}

export function pointInRoom(point: LayoutVec2, room: LayoutRoom): boolean {
	const points = roomPoints(room);
	let inside = false;
	for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
		const [x, z] = points[index]!;
		const [previousX, previousZ] = points[previous]!;
		const intersects =
			z > point[1] !== previousZ > point[1] &&
			point[0] < ((previousX - x) * (point[1] - z)) / (previousZ - z) + x;
		if (intersects) inside = !inside;
	}
	return inside;
}
