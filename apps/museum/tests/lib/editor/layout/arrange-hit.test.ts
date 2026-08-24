import { describe, expect, it } from 'vitest';
import { resolveArrangeHit } from '$lib/editor/layout/arrange-hit';
import type { LayoutVec2 } from '$lib/layout/layout-types';

function square(minX: number, minZ: number, maxX: number, maxZ: number): LayoutVec2[] {
	return [
		[minX, minZ],
		[maxX, minZ],
		[maxX, maxZ],
		[minX, maxZ]
	];
}

const LAYOUT_OBJECT_A = { objectId: 'layout-object-1', points: square(0, 0, 2, 2), selected: false };
const SCENE_ENTITY_A = { entityId: 'scene-entity-a', points: square(4, 0, 6, 2), selected: false };
const SCENE_ENTITY_B = { entityId: 'scene-entity-b', points: square(5, 0, 7, 2), selected: false };

describe('resolveArrangeHit (P10.1 owner-aware priority)', () => {
	it('resolves a lone Layout-object containment to the layout owner', () => {
		expect(resolveArrangeHit({ point: [1, 1], layoutObjects: [LAYOUT_OBJECT_A], sceneFootprints: [], edgeHaloMeters: 0.1 }))
			.toEqual({ owner: 'layout-object', objectId: 'layout-object-1' });
	});

	it('resolves a lone Scene footprint containment to the scene owner', () => {
		expect(resolveArrangeHit({ point: [5, 1], layoutObjects: [], sceneFootprints: [SCENE_ENTITY_A], edgeHaloMeters: 0.1 }))
			.toEqual({ owner: 'scene', entityId: 'scene-entity-a' });
	});

	it('Scene wins an unselected cross-owner overlap (layer 6 above layer 5)', () => {
		const overlapping = square(0.5, 0.5, 1.5, 1.5);
		expect(
			resolveArrangeHit({
				point: [1, 1],
				layoutObjects: [{ ...LAYOUT_OBJECT_A, points: overlapping }],
				sceneFootprints: [{ ...SCENE_ENTITY_A, points: overlapping }],
				edgeHaloMeters: 0.1
			})
		).toEqual({ owner: 'scene', entityId: 'scene-entity-a' });
	});

	it('a selected member of the active Layout-object selection wins over an unselected topmost Scene footprint', () => {
		const overlapping = square(0.5, 0.5, 1.5, 1.5);
		expect(
			resolveArrangeHit({
				point: [1, 1],
				layoutObjects: [{ ...LAYOUT_OBJECT_A, points: overlapping, selected: true }],
				sceneFootprints: [{ ...SCENE_ENTITY_A, points: overlapping, selected: false }],
				edgeHaloMeters: 0.1
			})
		).toEqual({ owner: 'layout-object', objectId: 'layout-object-1' });
	});

	it('a selected Scene member wins over an unselected Layout object (active-owner selection only)', () => {
		const overlapping = square(0.5, 0.5, 1.5, 1.5);
		expect(
			resolveArrangeHit({
				point: [1, 1],
				layoutObjects: [{ ...LAYOUT_OBJECT_A, points: overlapping, selected: false }],
				sceneFootprints: [{ ...SCENE_ENTITY_A, points: overlapping, selected: true }],
				edgeHaloMeters: 0.1
			})
		).toEqual({ owner: 'scene', entityId: 'scene-entity-a' });
	});

	it('Scene multi-select: any member under the pointer wins, resolved by same-owner stable (topmost) order', () => {
		// Both footprints contain the point; the later-projected one renders topmost.
		expect(
			resolveArrangeHit({
				point: [5.5, 1],
				layoutObjects: [],
				sceneFootprints: [
					{ ...SCENE_ENTITY_A, selected: true },
					{ ...SCENE_ENTITY_B, selected: true }
				],
				edgeHaloMeters: 0.1
			})
		).toEqual({ owner: 'scene', entityId: 'scene-entity-b' });
	});

	it('containment beats edge halo: a contained Layout object wins even while another Scene footprint is near its edge', () => {
		expect(
			resolveArrangeHit({
				point: [1, 1],
				layoutObjects: [LAYOUT_OBJECT_A],
				sceneFootprints: [{ ...SCENE_ENTITY_A, points: square(1.5, 1.5, 3.5, 3.5) }],
				edgeHaloMeters: 1
			})
		).toEqual({ owner: 'layout-object', objectId: 'layout-object-1' });
	});

	it('falls back to the Scene edge halo only when nothing contains the pointer', () => {
		expect(
			resolveArrangeHit({
				point: [6.3, 1],
				layoutObjects: [LAYOUT_OBJECT_A],
				sceneFootprints: [SCENE_ENTITY_A],
				edgeHaloMeters: 0.5
			})
		).toEqual({ owner: 'scene', entityId: 'scene-entity-a' });
	});

	it('never applies the edge halo to Layout objects (Plan object hits are containment-only)', () => {
		expect(
			resolveArrangeHit({
				point: [2.3, 1],
				layoutObjects: [LAYOUT_OBJECT_A],
				sceneFootprints: [],
				edgeHaloMeters: 0.5
			})
		).toBeNull();
	});

	it('returns null on empty input and on a bare miss', () => {
		expect(resolveArrangeHit({ point: [10, 10], layoutObjects: [], sceneFootprints: [], edgeHaloMeters: 0 })).toBeNull();
		expect(resolveArrangeHit({ point: [10, 10], layoutObjects: [LAYOUT_OBJECT_A], sceneFootprints: [SCENE_ENTITY_A], edgeHaloMeters: 0.01 })).toBeNull();
	});
});
