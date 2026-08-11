import { describe, expect, it } from 'vitest';

import { roomsToLayout } from './rooms-to-layout';
import {
	pointInRoom,
	replaceRoomVertex,
	roomBounds,
	roomEdgeLength,
	roomPoints,
	translateRoom
} from './layout-editing';

describe('layout editing', () => {
	const room = roomsToLayout().floors[0]!.rooms[0]!;

	it('translates all room points while preserving stable segment ids', () => {
		const moved = translateRoom(room, [2, -3]);
		expect(roomPoints(moved)[0]).toEqual([roomPoints(room)[0]![0] + 2, roomPoints(room)[0]![1] - 3]);
		expect(moved.boundary.segments.map((segment) => segment.id)).toEqual(
			room.boundary.segments.map((segment) => segment.id)
		);
	});

	it('updates vertex and adjacent segment endpoints', () => {
		const moved = replaceRoomVertex(room, 1, [10, 20]);
		expect(moved.boundary.segments[1]!.start).toEqual([10, 20]);
		expect(moved.boundary.segments[0]!.end).toEqual([10, 20]);
	});

	it('computes bounds, edge length, and containment', () => {
		const points = [[0, 0], [4, 0], [4, 3], [0, 3]] as [number, number][];
		const rectangle = replaceRoomVertex(replaceRoomVertex(replaceRoomVertex(room, 0, points[0]!), 1, points[1]!), 2, points[2]!);
		const finalRoom = replaceRoomVertex(rectangle, 3, points[3]!);
		expect(roomBounds(finalRoom)).toMatchObject({ minX: 0, minZ: 0, width: 4, height: 3 });
		expect(roomEdgeLength(finalRoom, 0)).toBe(4);
		expect(pointInRoom([2, 1], finalRoom)).toBe(true);
		expect(pointInRoom([8, 1], finalRoom)).toBe(false);
	});
});
