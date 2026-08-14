import { describe, expect, it } from 'vitest';

import { createA1RectangleDocument } from './layout-a1-fixtures';
import {
	appendRoomOpening,
	createDefaultOpening,
	findRoomOpening,
	nextOpeningId,
	openingContainsOffset,
	removeRoomOpening,
	replaceRoomOpening,
	snapSegmentOffset
} from '$lib/editor/layout/layout-opening-editing';
import { wallPolylinesAroundOpenings } from '$lib/layout/layout-geometry-openings';
import type { CurveSample } from '$lib/editor/layout/curve-geometry';

const room = createA1RectangleDocument().floors[0]!.rooms[0]!;
const segment = room.boundary.segments[0]!;

if (segment.kind !== 'line') throw new Error('Expected line fixture');

describe('A2.3 opening editing', () => {
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

	it('adds, finds, replaces, and removes only the requested opening', () => {
		const door = createDefaultOpening({ id: 'door', segment, kind: 'door', clickOffset: 1 });
		const window = createDefaultOpening({ id: 'window', segment, kind: 'window', clickOffset: 5 });
		const withOpenings = appendRoomOpening(appendRoomOpening(room, door), window);
		expect(findRoomOpening(withOpenings, 'window')).toEqual(window);
		const moved = replaceRoomOpening(withOpenings, { ...door, width: 1 });
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

	it('splits wall samples around openings', () => {
		const samples: CurveSample[] = [
			{ point: [0, 0], distance: 0, tangent: [1, 0], normal: [0, 1], t: 0 },
			{ point: [1, 0], distance: 1, tangent: [1, 0], normal: [0, 1], t: 0.25 },
			{ point: [2, 0], distance: 2, tangent: [1, 0], normal: [0, 1], t: 0.5 },
			{ point: [3, 0], distance: 3, tangent: [1, 0], normal: [0, 1], t: 0.75 },
			{ point: [4, 0], distance: 4, tangent: [1, 0], normal: [0, 1], t: 1 }
		];
		const opening = { offset: 1.5, width: 1 };
		expect(wallPolylinesAroundOpenings(samples, [opening])).toEqual([
			[
				[0, 0],
				[1, 0],
				[1.5, 0]
			],
			[
				[2.5, 0],
				[3, 0],
				[4, 0]
			]
		]);
	});

	it('keeps solid stubs when a centered door would otherwise erase a coarse wall', () => {
		const samples: CurveSample[] = [
			{ point: [0, 0], distance: 0, tangent: [1, 0], normal: [0, 1], t: 0 },
			{ point: [6, 0], distance: 6, tangent: [1, 0], normal: [0, 1], t: 1 }
		];
		const polylines = wallPolylinesAroundOpenings(samples, [{ offset: 2.55, width: 0.9 }]);
		expect(polylines).toHaveLength(2);
		expect(polylines[0]!.at(-1)![0]).toBeCloseTo(2.55);
		expect(polylines[1]![0]![0]).toBeCloseTo(3.45);
	});
});
