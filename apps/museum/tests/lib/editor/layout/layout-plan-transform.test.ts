import { describe, expect, it } from 'vitest';

import {
	buildPlanGrid,
	buildPlanRulerTicks,
	buildSegmentedScaleBar,
	constrainToAngle,
	createPlanViewportState,
	framePlanViewport,
	planScreenToWorld,
	snapToGrid,
	worldToPlanScreen,
	zoomPlanViewport
} from '$lib/editor/layout/layout-plan-transform';

describe('layout plan transform', () => {
	it('round-trips world and screen coordinates', () => {
		const state = createPlanViewportState();
		state.width = 1000;
		state.height = 600;
		framePlanViewport(state, [[-4, -2], [6, 8]]);
		const world = [2.5, 3.25] as [number, number];
		const roundTrip = planScreenToWorld(state, worldToPlanScreen(state, world));
		expect(roundTrip[0]).toBeCloseTo(world[0]);
		expect(roundTrip[1]).toBeCloseTo(world[1]);
	});

	it('keeps the world point below a zoom anchor stable', () => {
		const state = createPlanViewportState();
		const anchor = [250, 180] as [number, number];
		const before = planScreenToWorld(state, anchor);
		zoomPlanViewport(state, 2, anchor);
		expect(planScreenToWorld(state, anchor)).toEqual(before);
	});

	it('snaps to quarter-meter grid and fifteen-degree angles', () => {
		expect(snapToGrid([1.12, -0.13])).toEqual([1, -0.25]);
		const constrained = constrainToAngle([0, 0], [1, 0.3]);
		expect(Math.atan2(constrained[1], constrained[0]) * 180 / Math.PI).toBeCloseTo(15);
		expect(Math.hypot(...constrained)).toBeCloseTo(Math.hypot(1, 0.3));
	});

	it('builds major and minor grid lines', () => {
		const state = createPlanViewportState();
		const grid = buildPlanGrid(state);
		expect(grid.length).toBeGreaterThan(0);
		expect(grid.some((line) => line.major)).toBe(true);
		expect(grid.some((line) => !line.major)).toBe(true);
	});

	it('lods minor grid lines when they would be visually dense', () => {
		const state = createPlanViewportState();
		state.pixelsPerMeter = 10;
		const grid = buildPlanGrid(state);
		expect(grid.some((line) => !line.major)).toBe(false);
		expect(grid.some((line) => line.major)).toBe(true);
	});

	it('builds readable X/Z ruler ticks', () => {
		const state = createPlanViewportState();
		state.width = 800;
		state.height = 600;
		state.center = [0, 0];
		state.pixelsPerMeter = 40;
		const xTicks = buildPlanRulerTicks(state, 'x');
		const zTicks = buildPlanRulerTicks(state, 'z');
		expect(xTicks.length).toBeGreaterThan(0);
		expect(zTicks.length).toBeGreaterThan(0);
		expect(xTicks[1].pixel - xTicks[0].pixel).toBeGreaterThanOrEqual(40);
	});

	it('builds a segmented scale bar with a readable length across zooms', () => {
		for (let pixelsPerMeter = 2; pixelsPerMeter <= 2000; pixelsPerMeter *= 2) {
			const scale = buildSegmentedScaleBar(pixelsPerMeter);
			const width = scale.segments.reduce((sum, segment) => sum + segment.widthPixel, 0);
			expect(width).toBeGreaterThanOrEqual(80);
			expect(width).toBeLessThanOrEqual(140);
		}
	});

	it('gives every grid line a unique id even when start points coincide', () => {
		const state = createPlanViewportState();
		const grid = buildPlanGrid(state);
		const startKeys = grid.map((line) => `${line.start[0]}:${line.start[1]}`);
		expect(new Set(startKeys).size).toBeLessThan(grid.length);
		const ids = grid.map((line) => line.id);
		expect(new Set(ids).size).toBe(grid.length);
	});
});
