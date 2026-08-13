import { describe, expect, it } from 'vitest';
import { roomsToLayout } from './rooms-to-layout';
import { transformLayoutRoomUnit } from './layout-room-transform';
import type { LayoutDocument } from './layout-types';

function squareDocument(): LayoutDocument {
	return {
		formatVersion: 1,
		units: 'meters',
		floors: [{
			id: 'floor', name: 'Ground', elevation: 0, height: 3,
			rooms: [{
				id: 'room', name: 'Room', wallThickness: 0.1, floorThickness: 0.1, ceilingThickness: 0.1,
				boundary: { closed: true, segments: [
					{ id: 'a', kind: 'line', start: [0, 0], end: [4, 0] },
					{ id: 'b', kind: 'auto-bezier', start: [4, 0], end: [4, 4], interiorAnchors: [{ id: 'bend', point: [5, 2] }] },
					{ id: 'c', kind: 'line', start: [4, 4], end: [0, 4] },
					{ id: 'd', kind: 'line', start: [0, 4], end: [0, 0] }
				] },
				openings: [{ id: 'door', segmentId: 'a', kind: 'door', offset: 1, width: 1, height: 2, sillHeight: 0, profile: 'rectangular' }]
			}]
		}],
		objects: [
			{ id: 'owned', kind: 'box', position: [1, 1, 2], rotation: [0, 0.25, 0], dimensions: [1, 1, 1], roomId: 'room' },
			{ id: 'other', kind: 'sphere', position: [20, 1, 20], rotation: [0, 0, 0], dimensions: [1, 1, 1] },
			{ id: 'free', kind: 'cylinder', position: [30, 1, 30], rotation: [0, 0, 0], dimensions: [1, 1, 1] }
		]
	};
}

describe('transformLayoutRoomUnit', () => {
	it('translates walls, curve anchors, and matching child objects while preserving metadata', () => {
		const document = squareDocument();
		const result = transformLayoutRoomUnit(document, 'room', { translation: [2, -1], yaw: 0 });
		expect(result.success).toBe(true);
		if (!result.success) return;
		const room = result.document.floors[0]!.rooms[0]!;
		expect(room.boundary.segments[0]).toMatchObject({ start: [2, -1], end: [6, -1], id: 'a' });
		expect(room.boundary.segments[1]).toMatchObject({ start: [6, -1], end: [6, 3], id: 'b' });
		expect(room.boundary.segments[1]!.kind === 'auto-bezier' && room.boundary.segments[1]!.interiorAnchors[0]!.point).toEqual([7, 1]);
		expect(room.openings).toEqual(document.floors[0]!.rooms[0]!.openings);
		expect(result.document.objects[0]!.position).toEqual([3, 1, 1]);
		expect(result.document.objects[1]).toEqual(document.objects[1]);
		expect(result.document.objects[2]).toEqual(document.objects[2]);
	});

	it('rotates around sampled boundary centroid and adds exact child yaw', () => {
		const document = squareDocument();
		const curved = document.floors[0]!.rooms[0]!.boundary.segments[1]!;
		if (curved.kind === 'auto-bezier') curved.interiorAnchors[0]!.point = [4, 2];
		const result = transformLayoutRoomUnit(document, 'room', { translation: [0, 0], yaw: Math.PI / 2 });
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.pivot).toEqual([2, 2]);
		const first = result.document.floors[0]!.rooms[0]!.boundary.segments[0]!;
		expect(first.start[0]).toBeCloseTo(0);
		expect(first.start[1]).toBeCloseTo(4);
		expect(first.end[0]).toBeCloseTo(0);
		expect(first.end[1]).toBeCloseTo(0);
		expect(result.document.objects[0]!.position[0]).toBeCloseTo(2);
		expect(result.document.objects[0]!.position[2]).toBeCloseTo(3);
		expect(result.document.objects[0]!.rotation[1]).toBeCloseTo(0.25 + Math.PI / 2);
	});

	it('rejects missing rooms and leaves input untouched', () => {
		const document = roomsToLayout();
		const before = JSON.stringify(document);
		expect(transformLayoutRoomUnit(document, 'missing', { translation: [1, 0], yaw: 0 }).success).toBe(false);
		expect(JSON.stringify(document)).toBe(before);
	});
});
