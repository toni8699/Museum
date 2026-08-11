import { describe, expect, it } from 'vitest';

import { ceilingShapePoints, floorShapePoints } from './layout-preview-geometry';

describe('layout preview geometry mapping', () => {
	it('compensates floor ShapeGeometry Z inversion', () => {
		const points = [[2, 3], [-4, 5]] as [number, number][];
		expect(floorShapePoints(points)).toEqual([[2, -3], [-4, -5]]);
	});

	it('keeps ceiling shape points in world X/Z order', () => {
		expect(ceilingShapePoints([[2, 3]])).toEqual([[2, 3]]);
	});
});
