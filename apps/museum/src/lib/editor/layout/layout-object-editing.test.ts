import { describe, expect, it } from 'vitest';
import { createEmptyLayoutDocument } from './layout-codec';
import {
	createLayoutObject,
	defaultLayoutObjectDimensions,
	deleteLayoutObject,
	describeLayoutObject,
	findHitLayoutObject,
	floorObjectPosition,
	isKnownLayoutRoomId,
	nextLayoutObjectId,
	patchLayoutObject,
	primitiveObjectGeometry,
	snapLayoutPlanPoint
} from './layout-object-editing';

describe('layout object editing', () => {
	it('provides locked authored defaults and elevated-floor center placement', () => {
		expect(defaultLayoutObjectDimensions('plane')).toEqual([2, 0.01, 2]);
		expect(floorObjectPosition([1.12, 2.13], 4, [1, 2, 1], true)).toEqual([1, 5, 2.25]);
		expect(snapLayoutPlanPoint([0.37, -0.37])).toEqual([0.25, -0.25]);
	});

	it('derives box and radial primitive geometry from Plan gestures', () => {
		expect(primitiveObjectGeometry('box', [1.1, 2.2], [3.6, 5.2], 2)).toEqual({
			position: [2.35, 2.5, 3.7],
			dimensions: [2.5, 1, 3]
		});
		expect(primitiveObjectGeometry('cylinder', [1, 2], [4, 6], 3, true)).toEqual({
			position: [1, 3.5, 2],
			dimensions: [10, 1, 10]
		});
		expect(primitiveObjectGeometry('sphere', [1, 2], [1, 2], 0)).toBeNull();
	});

	it('allocates collision-free stable IDs', () => {
		const objects = [
			createLayoutObject({ id: 'layout-object-2', kind: 'box', position: [0, 0.5, 0] }),
			createLayoutObject({ id: 'imported-object', kind: 'sphere', position: [0, 0.5, 0] })
		];
		expect(nextLayoutObjectId(objects)).toBe('layout-object-3');
	});

	it('patches and deletes without mutating input', () => {
		const document = createEmptyLayoutDocument();
		document.objects = [createLayoutObject({ id: 'box-a', kind: 'box', position: [0, 0.5, 0] })];
		const patched = patchLayoutObject(document, 'box-a', { position: [2, 0.5, 3], roomId: 'room-a' });
		expect(document.objects[0]!.position).toEqual([0, 0.5, 0]);
		expect(patched?.objects[0]).toMatchObject({ position: [2, 0.5, 3], roomId: 'room-a' });
		expect(deleteLayoutObject(patched!, 'box-a')?.objects).toEqual([]);
	});

	it('derives rotation-aware AABB, footprint, and stable topmost hits', () => {
		const first = createLayoutObject({ id: 'first', kind: 'box', position: [0, 0.5, 0], dimensions: [2, 1, 1] });
		const second = { ...createLayoutObject({ id: 'second', kind: 'box', position: [0, 0.5, 0], dimensions: [2, 1, 1] }), rotation: [0, Math.PI / 2, 0] as [number, number, number] };
		const descriptor = describeLayoutObject(second);
		expect(descriptor.worldAabb.min[0]).toBeCloseTo(-0.5);
		expect(descriptor.worldAabb.max[2]).toBeCloseTo(1);
		expect(descriptor.planFootprint).toHaveLength(4);
		const cylinder = describeLayoutObject({ id: 'cylinder', kind: 'cylinder', position: [0, 0.5, 0], rotation: [0, 0, 0], dimensions: [2, 1, 2] });
		expect(cylinder.planFootprint).toHaveLength(32);
		expect(cylinder.planFootprint[0]).toEqual([1, 0]);
		expect(findHitLayoutObject([describeLayoutObject(first), descriptor], [0, 0])?.objectId).toBe('second');
	});

	it('marks profile placeholders read-only and validates room references', () => {
		const profile = describeLayoutObject({
			id: 'profile-a',
			kind: 'profile',
			position: [0, 0.5, 0],
			rotation: [0, 0, 0],
			dimensions: [1, 1, 1],
			profile: { closed: true, segments: [{ id: 'p', kind: 'line', start: [0, 0], end: [1, 0] }] }
		});
		expect(profile.readonly).toBe(true);
		const document = createEmptyLayoutDocument();
		document.floors = [{ id: 'floor-a', name: 'Floor', elevation: 0, height: 3, rooms: [{ id: 'room-a', name: 'Room', boundary: { closed: true, segments: [] }, wallThickness: 0.1, floorThickness: 0.1, ceilingThickness: 0.1, openings: [] }] }];
		expect(isKnownLayoutRoomId(document, undefined)).toBe(true);
		expect(isKnownLayoutRoomId(document, 'room-a')).toBe(true);
		expect(isKnownLayoutRoomId(document, 'missing')).toBe(false);
	});
});
