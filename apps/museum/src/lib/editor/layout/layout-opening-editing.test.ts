import { describe, expect, it } from 'vitest';

import { createA1RectangleDocument } from './layout-a1-fixtures';
import {
	appendRoomOpening,
	createDefaultOpening,
	findRoomOpening,
	nextOpeningId,
	openingContainsOffset,
	projectPointToSegment,
	removeRoomOpening,
	replaceRoomOpening,
	snapSegmentOffset,
	updateLayoutOpening
} from './layout-opening-editing';

const room = createA1RectangleDocument().floors[0]!.rooms[0]!;
const segment = room.boundary.segments[0]!;

if (segment.kind !== 'line') throw new Error('Expected line fixture');

describe('A2.3 opening editing', () => {
	it('projects points to horizontal, vertical, and rotated segments', () => {
		expect(projectPointToSegment([2, 3], [0, 0], [6, 0])).toMatchObject({
			point: [2, 0],
			offset: 2,
			distance: 3
		});
		expect(projectPointToSegment([3, 2], [3, 0], [3, 4])).toMatchObject({
			point: [3, 2],
			offset: 2,
			distance: 0
		});
		expect(projectPointToSegment([2, 1], [0, 0], [4, 4]).point).toEqual([1.5, 1.5]);
	});

	it('snaps along-segment offsets and clamps to segment bounds', () => {
		expect(snapSegmentOffset(2.13, 6)).toBe(2.25);
		expect(snapSegmentOffset(99, 6)).toBe(6);
		expect(snapSegmentOffset(-1, 6)).toBe(0);
	});

	it('creates centered rectangular door and window defaults', () => {
		const door = createDefaultOpening({ id: 'door', segment, kind: 'door', clickOffset: 3 });
		const window = createDefaultOpening({ id: 'window', segment, kind: 'window', clickOffset: 3 });
		expect(door).toMatchObject({ segmentId: segment.id, kind: 'door', offset: 2.55, width: 0.9, height: 2.1, sillHeight: 0, profile: 'rectangular' });
		expect(window).toMatchObject({ kind: 'window', offset: 2.4, width: 1.2, height: 1.2, sillHeight: 1, profile: 'rectangular' });
	});

	it('centers and clamps a default opening near a wall endpoint', () => {
		const opening = createDefaultOpening({ id: 'door', segment, kind: 'door', clickOffset: 0.1 });
		expect(opening.offset).toBe(0);
	});

	it('updates fields without changing stable opening identity', () => {
		const opening = createDefaultOpening({ id: 'door', segment, kind: 'door', clickOffset: 3 });
		const updated = updateLayoutOpening(opening, { offset: 1.25, width: 1.1, height: 2.2, sillHeight: 0.2 });
		expect(updated).toMatchObject({ id: 'door', segmentId: segment.id, offset: 1.25, width: 1.1, height: 2.2, sillHeight: 0.2 });
	});

	it('adds, finds, replaces, and removes only the requested opening', () => {
		const door = createDefaultOpening({ id: 'door', segment, kind: 'door', clickOffset: 1 });
		const window = createDefaultOpening({ id: 'window', segment, kind: 'window', clickOffset: 5 });
		const withOpenings = appendRoomOpening(appendRoomOpening(room, door), window);
		expect(findRoomOpening(withOpenings, 'window')).toEqual(window);
		const moved = replaceRoomOpening(withOpenings, updateLayoutOpening(door, { width: 1 }));
		expect(findRoomOpening(moved, 'door')?.width).toBe(1);
		expect(removeRoomOpening(moved, 'door').openings).toEqual([window]);
	});

	it('returns a stable unused opening ID', () => {
		const withOpening = appendRoomOpening(room, { id: 'opening:room-rectangle:door:1', segmentId: segment.id, kind: 'door', offset: 1, width: 1, height: 2, sillHeight: 0, profile: 'rectangular' });
		expect(nextOpeningId(withOpening, 'door')).toBe('opening:room-rectangle:door:2');
	});

	it('detects offsets inside opening intervals', () => {
		const opening = createDefaultOpening({ id: 'door', segment, kind: 'door', clickOffset: 3 });
		expect(openingContainsOffset(opening, opening.offset + 0.1)).toBe(true);
		expect(openingContainsOffset(opening, opening.offset - 0.1)).toBe(false);
	});
});
