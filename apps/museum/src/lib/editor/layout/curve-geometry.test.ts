import { describe, expect, it } from 'vitest';

import { cubicBezierPoint, pointAtDistance, sampleSegment, segmentLength } from './curve-geometry';
import type { DraftSegment } from './layout-types';

const bowed: DraftSegment = {
	id: 'curve-a',
	kind: 'auto-bezier',
	start: [0, 0],
	end: [4, 0],
	interiorAnchors: [{ id: 'curve-a:anchor:1', point: [2, -1.5] }]
};

const bowedCubic = {
	start: [0, 0] as [number, number],
	handleOut: [1, -2] as [number, number],
	handleIn: [3, -2] as [number, number],
	end: [4, 0] as [number, number]
};

describe('A3 curve geometry', () => {
	it('evaluates cubic endpoints and midpoint', () => {
		expect(cubicBezierPoint(bowedCubic, 0)).toEqual([0, 0]);
		expect(cubicBezierPoint(bowedCubic, 1)).toEqual([4, 0]);
		expect(cubicBezierPoint(bowedCubic, 0.5)).toEqual([2, -1.5]);
	});

	it('samples deterministically with finite ordered distances', () => {
		const first = sampleSegment(bowed);
		const second = sampleSegment(bowed);
		expect(first).toEqual(second);
		expect(first.samples.length).toBeGreaterThan(2);
		expect(first.samples.every((sample) => Number.isFinite(sample.distance))).toBe(true);
		expect(first.samples.map((sample) => sample.distance)).toEqual(
			[...first.samples].sort((a, b) => a.distance - b.distance).map((sample) => sample.distance)
		);
	});

	it('maps opening offsets by arc length and returns tangent/normal', () => {
		const sampled = sampleSegment(bowed);
		const midpoint = pointAtDistance(sampled, sampled.length / 2);
		expect(midpoint.distance).toBeCloseTo(sampled.length / 2);
		expect(Math.hypot(...midpoint.tangent)).toBeCloseTo(1);
		expect(midpoint.normal).toEqual([-midpoint.tangent[1], midpoint.tangent[0]]);
		expect(segmentLength(bowed)).toBeGreaterThan(4);
	});

	it('densifies line samples by max sample span', () => {
		const line = { id: 'line-a', kind: 'line' as const, start: [0, 0] as [number, number], end: [4, 0] as [number, number] };
		const sampled = sampleSegment(line);
		expect(sampled.samples.length).toBeGreaterThan(2);
		expect(sampled.length).toBeCloseTo(4);
		for (let index = 1; index < sampled.samples.length; index += 1) {
			expect(sampled.samples[index]!.distance - sampled.samples[index - 1]!.distance).toBeLessThanOrEqual(0.25 + 1e-9);
		}
	});

	it('densifies auto-bezier samples by flatness and max span', () => {
		const sampled = sampleSegment(bowed);
		expect(sampled.samples.length).toBeGreaterThan(2);
		for (let index = 1; index < sampled.samples.length; index += 1) {
			expect(sampled.samples[index]!.distance - sampled.samples[index - 1]!.distance).toBeLessThanOrEqual(0.25 + 1e-6);
		}
	});
});
