import { describe, expect, it } from 'vitest';

import {
	lineLength,
	openingIntervals,
	splitWallAroundOpenings
} from './draft-geometry';

describe('A1 draft geometry', () => {
	const segment = { id: 'wall-a', kind: 'line' as const, start: [0, 0] as [number, number], end: [10, 0] as [number, number] };

	it('computes line length', () => {
		expect(lineLength([0, 0], [3, 4])).toBe(5);
	});

	it('sorts opening intervals by segment distance', () => {
		const intervals = openingIntervals(segment, [
			{ id: 'opening-b', segmentId: 'wall-a', kind: 'door', offset: 6, width: 2, height: 2, sillHeight: 0, profile: 'rectangular' },
			{ id: 'opening-a', segmentId: 'wall-a', kind: 'door', offset: 1, width: 2, height: 2, sillHeight: 0, profile: 'rectangular' }
		]);
		expect(intervals.map((interval) => interval.openingId)).toEqual(['opening-a', 'opening-b']);
		expect(intervals[0]).toMatchObject({ startDistance: 1, endDistance: 3 });
	});

	it('splits a wall into side and lintel sections', () => {
		const sections = splitWallAroundOpenings(
			segment,
			[{ id: 'door', segmentId: 'wall-a', kind: 'door', offset: 4, width: 2, height: 2, sillHeight: 0, profile: 'rectangular' }],
			3
		);
		expect(sections).toEqual([
			{ kind: 'side', startDistance: 0, endDistance: 4, bottomY: 0, topY: 3 },
			{ kind: 'lintel', startDistance: 4, endDistance: 6, bottomY: 2, topY: 3, openingId: 'door' },
			{ kind: 'side', startDistance: 6, endDistance: 10, bottomY: 0, topY: 3 }
		]);
	});

	it('retains lower sill and upper lintel sections for windows', () => {
		const sections = splitWallAroundOpenings(
			segment,
			[{ id: 'window', segmentId: 'wall-a', kind: 'window', offset: 2, width: 2, height: 1, sillHeight: 1, profile: 'rectangular' }],
			3
		);
		expect(sections).toContainEqual({ kind: 'side', startDistance: 2, endDistance: 4, bottomY: 0, topY: 1, openingId: 'window' });
		expect(sections).toContainEqual({ kind: 'lintel', startDistance: 2, endDistance: 4, bottomY: 2, topY: 3, openingId: 'window' });
	});
});
