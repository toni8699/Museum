import { describe, expect, it } from 'vitest';

import { roomsToLayout } from '$lib/editor/layout/rooms-to-layout';
import {
	convertLineSegmentToAutoBezier,
	insertInteriorAnchorOnSegment,
	pointInRoom,
	replaceRoomPoints,
	replaceRoomVertex,
	roomBounds,
	roomEdgeLength,
	roomPoints,
	translateRoom
} from '$lib/editor/layout/layout-editing';
import type { DraftSegment, LayoutRoom } from '$lib/editor/layout/layout-types';

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

	it('converts line walls to auto-bezier with empty interiors', () => {
		const line = room.boundary.segments[0]!;
		if (line.kind !== 'line') throw new Error('expected line');
		const converted = convertLineSegmentToAutoBezier(line);
		expect(converted).toMatchObject({ kind: 'auto-bezier', start: line.start, end: line.end, interiorAnchors: [] });
	});

	it('keeps interior anchors in the chord frame after vertex edits', () => {
		const line = room.boundary.segments.find((segment) => segment.kind === 'line')!;
		const convertedRoom: LayoutRoom = {
			...room,
			boundary: {
				...room.boundary,
				segments: room.boundary.segments.map((segment) =>
					segment.id === line.id && segment.kind === 'line'
						? insertInteriorAnchorOnSegment(segment, [
								(segment.start[0] + segment.end[0]) / 2,
								(segment.start[1] + segment.end[1]) / 2
							])
						: segment
				)
			}
		};
		const points = roomPoints(convertedRoom);
		points[1] = [points[1]![0] + 2, points[1]![1] + 1];
		const edited = replaceRoomPoints(convertedRoom, points);
		const curve = edited.boundary.segments.find((segment) => segment.id === line.id) as Extract<
			DraftSegment,
			{ kind: 'auto-bezier' }
		>;
		const chordDx = curve.end[0] - curve.start[0];
		const chordDz = curve.end[1] - curve.start[1];
		const length = Math.hypot(chordDx, chordDz);
		const anchor = curve.interiorAnchors[0]!;
		const cross =
			(anchor.point[0] - curve.start[0]) * chordDz - (anchor.point[1] - curve.start[1]) * chordDx;
		expect(Math.abs(cross)).toBeLessThan(1e-6 * Math.max(length, 1));
	});
});
