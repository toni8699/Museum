import { describe, expect, it } from 'vitest';
import { createEmptyLayoutDocument } from '$lib/layout/layout-codec';
import { deleteLayoutRoom } from '$lib/editor/layout/layout-room-editing';
import type { LayoutDocument, LayoutOpening, LayoutRoom } from '$lib/layout/layout-types';

function room(id: string): LayoutRoom {
	return {
		id,
		name: id,
		frame: { origin: [0, 0], yaw: 0 },
		boundary: {
			closed: true,
			segments: [{ id: `${id}-seg-1`, kind: 'line', start: [0, 0], end: [4, 0] }]
		},
		wallThickness: 0.2,
		floorThickness: 0.2,
		ceilingThickness: 0.2,
		openings: []
	};
}

function fixture(): LayoutDocument {
	const document = createEmptyLayoutDocument();
	document.floors = [
		{
			id: 'floor-1',
			name: 'Ground',
			elevation: 0,
			height: 3,
			rooms: [room('room-a'), room('room-b')]
		},
		{
			id: 'floor-2',
			name: 'Upper',
			elevation: 3,
			height: 3,
			rooms: [room('room-c')]
		}
	];
	document.objects = [
		{ id: 'obj-b', kind: 'box', position: [1, 0.5, 1], rotation: [0, 0, 0], dimensions: [1, 1, 1], roomId: 'room-b' },
		{ id: 'obj-free', kind: 'box', position: [9, 0.5, 9], rotation: [0, 0, 0], dimensions: [1, 1, 1] }
	];
	const door: LayoutOpening = {
		id: 'op-door',
		segmentId: 'room-a-seg-1',
		kind: 'door',
		offset: 0.5,
		width: 0.9,
		height: 2.1,
		sillHeight: 0,
		profile: 'rectangular',
		connectsRoomIds: ['room-a', 'room-b']
	};
	document.floors[0]!.rooms[0]!.openings = [door];
	return document;
}

describe('layout room deletion (pure)', () => {
	it('removes the room from its floor and leaves other floors untouched', () => {
		const document = fixture();
		const next = deleteLayoutRoom(document, 'room-b');
		expect(next).not.toBeNull();
		expect(next!.floors[0]!.rooms.map((room) => room.id)).toEqual(['room-a']);
		expect(next!.floors[1]!.rooms.map((room) => room.id)).toEqual(['room-c']);
	});

	it('deletes layout objects owned by the room and keeps unowned ones', () => {
		const document = fixture();
		const next = deleteLayoutRoom(document, 'room-b')!;
		expect(next.objects.map((object) => object.id)).toEqual(['obj-free']);
	});

	it('clears portal relations on other rooms’ doors referencing the deleted room', () => {
		const document = fixture();
		const next = deleteLayoutRoom(document, 'room-b')!;
		expect(next.floors[0]!.rooms[0]!.openings[0]).toMatchObject({ id: 'op-door', kind: 'door' });
		expect('connectsRoomIds' in next.floors[0]!.rooms[0]!.openings[0]!).toBe(false);
	});

	it('keeps portal relations that do not reference the deleted room', () => {
		const document = fixture();
		const next = deleteLayoutRoom(document, 'room-c')!;
		expect(next.floors[0]!.rooms[0]!.openings[0]!.connectsRoomIds).toEqual(['room-a', 'room-b']);
	});

	it('deleting the owner room removes the door with it', () => {
		const document = fixture();
		const next = deleteLayoutRoom(document, 'room-a')!;
		expect(next.floors[0]!.rooms.map((room) => room.id)).toEqual(['room-b']);
		expect(next.floors[0]!.rooms[0]!.openings).toEqual([]);
	});

	it('deleting the last room leaves an empty (codec-valid) layout document', () => {
		const document = createEmptyLayoutDocument();
		document.floors = [{ id: 'floor-1', name: 'Ground', elevation: 0, height: 3, rooms: [room('only')] }];
		const next = deleteLayoutRoom(document, 'only');
		expect(next?.floors[0]!.rooms).toEqual([]);
		expect(next?.objects).toEqual([]);
	});

	it('returns null for an unknown room and never mutates the input', () => {
		const document = fixture();
		const before = JSON.stringify(document);
		expect(deleteLayoutRoom(document, 'missing')).toBeNull();
		expect(JSON.stringify(document)).toBe(before);
	});
});
