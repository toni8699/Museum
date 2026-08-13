import { describe, expect, it } from 'vitest';

import { museumRooms, roomPoint } from '$lib/content/rooms';

import {
	CHOPIN_LAYOUT_CEILING_THICKNESS,
	CHOPIN_LAYOUT_FLOOR_ID,
	CHOPIN_LAYOUT_FLOOR_THICKNESS,
	CHOPIN_LAYOUT_WALL_THICKNESS,
	roomsToLayout
} from './rooms-to-layout';
import { serializeLayoutDocument, validateLayoutDocument } from '$lib/layout/layout-codec';

function compiledRoom(roomId: string) {
	const room = roomsToLayout().floors[0]!.rooms.find((candidate) => candidate.id === roomId);
	if (!room) throw new Error(`Missing compiled room ${roomId}`);
	return room;
}

function compiledOpening(roomId: string, openingId: string) {
	const opening = compiledRoom(roomId).openings.find(
		(candidate) => candidate.id === `opening:${roomId}:${openingId}`
	);
	if (!opening) throw new Error(`Missing compiled opening ${roomId}/${openingId}`);
	return opening;
}

describe('roomsToLayout', () => {
	it('compiles all Chopin rooms into one valid ground-floor document', () => {
		const document = roomsToLayout();
		const result = validateLayoutDocument(document);

		expect(result.success).toBe(true);
		expect(document.floors).toHaveLength(1);
		expect(document.floors[0]).toMatchObject({
			id: CHOPIN_LAYOUT_FLOOR_ID,
			name: 'Ground Floor',
			elevation: 0,
			height: 4.2
		});
		expect(document.floors[0]!.rooms.map((room) => room.id)).toEqual([
			'entrance',
			'poland',
			'departure',
			'paris',
			'workshop',
			'music-chamber',
			'legacy'
		]);
		expect(document.objects).toEqual([]);
		const portalOpenings = document.floors[0]!.rooms.flatMap((room) => room.openings.filter((opening) => opening.connectsRoomIds));
		expect(portalOpenings).toHaveLength(12);
		expect(new Set(portalOpenings.map((opening) => opening.connectsRoomIds!.join('|')))).toEqual(new Set([
			'entrance|legacy',
			'entrance|poland',
			'departure|poland',
			'departure|paris',
			'paris|workshop',
			'music-chamber|workshop',
			'legacy|music-chamber'
		]));
	});

	it('uses stable room wall segment IDs and expected rectangle side order', () => {
		const entrance = compiledRoom('entrance');
		expect(entrance.boundary.segments.map((segment) => segment.id)).toEqual([
			'room:entrance:wall:neg-z',
			'room:entrance:wall:pos-x',
			'room:entrance:wall:pos-z',
			'room:entrance:wall:neg-x'
		]);

		const expectedStart = roomPoint('entrance', [-3.5, 0, -4]);
		const firstSegment = entrance.boundary.segments[0]!;
		expect(firstSegment).toMatchObject({
			kind: 'line',
			start: [expectedStart[0], expectedStart[2]]
		});
	});

	it('preserves rotated room placement in world X/Z boundary coordinates', () => {
		const poland = compiledRoom('poland');
		const expectedStart = roomPoint('poland', [-5, 0, -4.5]);
		expect(poland.boundary.segments[0]!.start).toEqual([expectedStart[0], expectedStart[2]]);
	});

	it('uses current shell dimensions for layout defaults', () => {
		for (const room of roomsToLayout().floors[0]!.rooms) {
			expect(room.wallThickness).toBe(CHOPIN_LAYOUT_WALL_THICKNESS);
			expect(room.floorThickness).toBe(CHOPIN_LAYOUT_FLOOR_THICKNESS);
			expect(room.ceilingThickness).toBe(CHOPIN_LAYOUT_CEILING_THICKNESS);
		}
	});

	it('maps doors to doors and sightlines to rectangular windows', () => {
		expect(compiledOpening('entrance', 'entrance-from-legacy')).toMatchObject({
			kind: 'door',
			profile: 'rectangular'
		});
		expect(compiledOpening('entrance', 'entrance-chamber-view')).toMatchObject({
			kind: 'window',
			profile: 'rectangular'
		});
	});

	it('converts centered shell offsets into non-negative segment distances', () => {
		expect(compiledOpening('entrance', 'entrance-from-legacy').offset).toBeCloseTo(5.3);
		expect(compiledOpening('entrance', 'entrance-to-poland').offset).toBeCloseTo(2.7);
		expect(compiledOpening('departure', 'departure-to-paris').offset).toBeCloseTo(11.6);
		expect(compiledOpening('paris', 'paris-to-workshop').offset).toBeCloseTo(0.2);
		for (const room of roomsToLayout().floors[0]!.rooms) {
			for (const opening of room.openings) {
				expect(opening.offset).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it('preserves every source opening with a stable room-qualified ID', () => {
		const sourceOpenings = museumRooms.flatMap((room) => room.openings);
		const compiledOpenings = roomsToLayout().floors[0]!.rooms.flatMap((room) => room.openings);
		expect(compiledOpenings).toHaveLength(sourceOpenings.length);
		expect(compiledOpenings.map((opening) => opening.id)).toEqual(
			sourceOpenings.map((opening) => `opening:${museumRooms.find((room) => room.openings.includes(opening))!.id}:${opening.id}`)
		);
	});

	it('is deterministic and does not mutate source rooms', () => {
		const before = JSON.stringify(museumRooms);
		const first = roomsToLayout();
		const second = roomsToLayout([...museumRooms]);
		expect(serializeLayoutDocument(first)).toBe(serializeLayoutDocument(second));
		expect(JSON.stringify(museumRooms)).toBe(before);
	});

	it('compiles a selected room subset without hidden global state', () => {
		const document = roomsToLayout([museumRooms[3]!]);
		expect(document.floors[0]!.rooms.map((room) => room.id)).toEqual(['paris']);
		expect(document.floors[0]!.height).toBe(4.2);
	});
});
