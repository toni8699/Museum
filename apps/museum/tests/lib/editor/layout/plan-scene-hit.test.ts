import { describe, expect, it } from 'vitest';
import type { LayoutVec2 } from '$lib/layout/layout-types';
import {
	PLAN_SCENE_HIT_HALO_PX,
	pointInPlanPolygon,
	resolvePlanSceneHit,
	resolvePlanSceneHitAtZoom
} from '$lib/editor/layout/plan-scene-hit';
import type { PlanSceneFootprint } from '$lib/editor/layout/plan-scene-footprint';

function footprint(entityId: string, points: LayoutVec2[]): PlanSceneFootprint {
	return { key: `scene:${entityId}`, entityId, roomId: 'room-a', kind: 'primitive', points };
}

const square = (min: number, max: number): LayoutVec2[] => [
	[min, min],
	[max, min],
	[max, max],
	[min, max]
];

describe('resolvePlanSceneHit', () => {
	it('resolves containment before edge halo', () => {
		const under = footprint('under', square(0, 4));
		const top = footprint('top', square(2, 6));

		// Point lies inside both. Reverse document/render order wins.
		expect(resolvePlanSceneHit([under, top], [3, 3], 0.5)?.entityId).toBe('top');
		// Point lies in under and within top's edge halo. Containment pass still wins.
		expect(resolvePlanSceneHit([under, top], [1.9, 3], 0.5)).toMatchObject({
			entityId: 'under',
			reason: 'containment'
		});
	});

	it('uses reverse order for overlap without cycling', () => {
		const footprints = [footprint('first', square(0, 4)), footprint('second', square(0, 4))];
		expect(resolvePlanSceneHit(footprints, [2, 2], 0)?.entityId).toBe('second');
		expect(resolvePlanSceneHit(footprints, [2, 2], 0)?.entityId).toBe('second');
	});

	it('keeps six CSS-pixel halo invariant across zoom', () => {
		const footprints = [footprint('chair', square(0, 2))];
		const point: LayoutVec2 = [2 + (PLAN_SCENE_HIT_HALO_PX / 100) * 0.9, 1];
		expect(resolvePlanSceneHitAtZoom(footprints, point, 100)?.reason).toBe('edge-halo');
		expect(resolvePlanSceneHitAtZoom(footprints, [2 + (PLAN_SCENE_HIT_HALO_PX / 200) * 0.9, 1], 200)?.reason).toBe('edge-halo');
		expect(resolvePlanSceneHitAtZoom(footprints, [2 + (PLAN_SCENE_HIT_HALO_PX / 100) * 1.1, 1], 100)).toBeNull();
	});

	it('supports concave polygons and boundary containment', () => {
		const concave: LayoutVec2[] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];
		expect(pointInPlanPolygon([0, 2], concave)).toBe(true);
		expect(pointInPlanPolygon([3, 3], concave)).toBe(false);
	});
});
