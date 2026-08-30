import { describe, expect, it } from 'vitest';

import {
	compileAutoBezierAnchors,
	legacyBezierToAutoBezier,
	nextInteriorAnchorId
} from '$lib/layout/layout-geometry-curve';

describe('layout auto-bezier', () => {
	it('compiles two anchors to a straight cubic', () => {
		const cubics = compileAutoBezierAnchors([
			[0, 0],
			[6, 0]
		]);
		expect(cubics).toHaveLength(1);
		expect(cubics[0]).toEqual({
			start: [0, 0],
			handleOut: [2, 0],
			handleIn: [4, 0],
			end: [6, 0]
		});
	});

	it('compiles three anchors into two cubics that pass through the bend', () => {
		const cubics = compileAutoBezierAnchors([
			[0, 0],
			[2, -2],
			[4, 0]
		]);
		expect(cubics).toHaveLength(2);
		expect(cubics[0]!.start).toEqual([0, 0]);
		expect(cubics[0]!.end).toEqual([2, -2]);
		expect(cubics[1]!.start).toEqual([2, -2]);
		expect(cubics[1]!.end).toEqual([4, 0]);
	});

	it('migrates legacy bezier to auto-bezier with an interior at cubic t=0.5', () => {
		const migrated = legacyBezierToAutoBezier({
			id: 'curve-a',
			kind: 'bezier',
			start: [0, 0],
			handleOut: [1, -2],
			handleIn: [3, -2],
			end: [4, 0]
		});
		expect(migrated).toMatchObject({
			id: 'curve-a',
			kind: 'auto-bezier',
			start: [0, 0],
			end: [4, 0]
		});
		expect(migrated.interiorAnchors).toHaveLength(1);
		expect(migrated.interiorAnchors[0]!.id).toBe('curve-a:anchor:1');
		expect(migrated.interiorAnchors[0]!.point).toEqual([2, -1.5]);
	});

	it('allocates stable unique interior anchor ids', () => {
		expect(nextInteriorAnchorId('wall-a', [])).toBe('wall-a:anchor:1');
		expect(
			nextInteriorAnchorId('wall-a', [{ id: 'wall-a:anchor:1', point: [1, 0] }])
		).toBe('wall-a:anchor:2');
	});
});
