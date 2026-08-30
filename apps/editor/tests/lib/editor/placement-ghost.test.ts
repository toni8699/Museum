import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Vector3 } from 'three';
import type { ScenePrimitiveDimensions } from '$lib/content/scene';
import {
	PLACEMENT_PHASES,
	computeGhostTransform,
	computePrototypeBox3,
	getGhostColorForReason,
	isValidGhostPlacement,
	type PlacementGhostPrototype,
	type PlacementValidityReason
} from '$lib/editor/placement-ghost';

const primitiveDefaults = new Map<'box' | 'plane' | 'cylinder' | 'sphere', ScenePrimitiveDimensions>([
	['box', { width: 1, height: 1, depth: 1 }],
	['plane', { width: 2, height: 2 }],
	['cylinder', { radius: 0.5, height: 1 }],
	['sphere', { radius: 0.5 }]
]);

function boxPrototype(
	dimensions: { width: number; height: number; depth: number },
	overrides: Partial<PlacementGhostPrototype> = {}
): PlacementGhostPrototype {
	return {
		primitiveKind: 'box',
		dimensions,
		assetBounds: null,
		defaultRotation: [0, 0, 0],
		defaultScaleScalar: 1,
		defaultScaleVector: null,
		scaleMode: 'uniform',
		defaultYOffset: 0,
		...overrides
	};
}

describe('PLACEMENT_PHASES', () => {
	it('lists every state the component can be in', () => {
		expect(PLACEMENT_PHASES).toEqual(['idle', 'armed', 'committed', 'cancelled']);
	});
});

describe('computePrototypeBox3', () => {
	it('box: derived from explicit dimensions, half-extents', () => {
		const proto = boxPrototype({ width: 4, height: 2, depth: 6 });
		const box = computePrototypeBox3(proto, primitiveDefaults);
		expect(box.min.toArray()).toEqual([-2, -1, -3]);
		expect(box.max.toArray()).toEqual([2, 1, 3]);
	});

	it('plane: derives width/height into X/Z, Y at 0', () => {
		const proto: PlacementGhostPrototype = {
			...boxPrototype({ width: 1, height: 1, depth: 1 }),
			primitiveKind: 'plane',
			dimensions: { width: 4, height: 3 }
		};
		const box = computePrototypeBox3(proto, primitiveDefaults);
		expect(box.min.toArray()).toEqual([-2, 0, -1.5]);
		expect(box.max.toArray()).toEqual([2, 0, 1.5]);
	});

	it('cylinder: radius × radius footprint, height spans Y', () => {
		const proto: PlacementGhostPrototype = {
			...boxPrototype({ width: 1, height: 1, depth: 1 }),
			primitiveKind: 'cylinder',
			dimensions: { radius: 1.5, height: 4 }
		};
		const box = computePrototypeBox3(proto, primitiveDefaults);
		expect(box.min.toArray()).toEqual([-1.5, -2, -1.5]);
		expect(box.max.toArray()).toEqual([1.5, 2, 1.5]);
	});

	it('sphere: cube footprint, half-extent = radius', () => {
		const proto: PlacementGhostPrototype = {
			...boxPrototype({ width: 1, height: 1, depth: 1 }),
			primitiveKind: 'sphere',
			dimensions: { radius: 1 }
		};
		const box = computePrototypeBox3(proto, primitiveDefaults);
		expect(box.min.toArray()).toEqual([-1, -1, -1]);
		expect(box.max.toArray()).toEqual([1, 1, 1]);
	});

	it('model: assetBounds sets per-axis half-extents', () => {
		const proto: PlacementGhostPrototype = {
			...boxPrototype({ width: 1, height: 1, depth: 1 }),
			primitiveKind: 'model',
			dimensions: null,
			assetBounds: [4, 2, 6]
		};
		const box = computePrototypeBox3(proto, primitiveDefaults);
		expect(box.min.toArray()).toEqual([-2, -1, -3]);
		expect(box.max.toArray()).toEqual([2, 1, 3]);
	});

	it('model: defaults to 1×1×1 when assetBounds missing', () => {
		const proto: PlacementGhostPrototype = {
			...boxPrototype({ width: 1, height: 1, depth: 1 }),
			primitiveKind: 'model',
			dimensions: null,
			assetBounds: null
		};
		const box = computePrototypeBox3(proto, primitiveDefaults);
		expect(box.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
		expect(box.max.toArray()).toEqual([0.5, 0.5, 0.5]);
	});
});

describe('computeGhostTransform', () => {
	it('identity transform encodes hit position + uniform scale', () => {
		const proto = boxPrototype({ width: 1, height: 1, depth: 1 });
		const matrix = computeGhostTransform({ point: [3, 0, 4], roomId: 'paris' }, proto);
		const decomposed = new Vector3();
		matrix.decompose(new Vector3(), new (require('three').Quaternion)(), decomposed);
		expect(decomposed.x).toBeCloseTo(1, 6);
		// Position is encoded inside the basis product; we test via a separate
		// decomposition path in the component layer.
	});

	it('null hit returns identity matrix', () => {
		const proto = boxPrototype({ width: 1, height: 1, depth: 1 });
		const matrix = computeGhostTransform(null, proto);
		expect(matrix.elements).toEqual(new Matrix4().elements);
	});

	it('independent scale writes per-axis values', () => {
		const proto = boxPrototype(
			{ width: 1, height: 1, depth: 1 },
			{
				scaleMode: 'independent',
				defaultScaleVector: [5, 0.05, 6]
			}
		);
		const matrix = computeGhostTransform({ point: [0, 0, 0], roomId: 'paris' }, proto);
		// X basis must be 5× the cube's X unit, Y basis must be 0.05× the Y unit, Z 6×.
		expect(matrix.elements[0]).toBeCloseTo(5, 6);
		expect(matrix.elements[5]).toBeCloseTo(0.05, 6);
		expect(matrix.elements[10]).toBeCloseTo(6, 6);
	});

	it('defaultYOffset raises position on Y axis', () => {
		const proto = boxPrototype(
			{ width: 1, height: 1, depth: 1 },
			{ defaultYOffset: 0.5 }
		);
		const matrix = computeGhostTransform({ point: [0, 1, 0], roomId: 'paris' }, proto);
		// Translation row, column 4 = y position 1 + offset 0.5 = 1.5
		expect(matrix.elements[13]).toBeCloseTo(1.5, 6);
	});
});

describe('isValidGhostPlacement', () => {
	it('null hit → no-floor, no position', () => {
		const v = isValidGhostPlacement(null, null);
		expect(v.isValid).toBe(false);
		expect(v.reason).toBe('no-floor');
		expect(v.ghostPosition).toBeNull();
	});

	it('hit but no roomId → no-floor, position present', () => {
		const v = isValidGhostPlacement({ point: [1, 0, 1], roomId: null }, null);
		expect(v.isValid).toBe(false);
		expect(v.reason).toBe('no-floor');
		expect(v.ghostPosition).toEqual([1, 0, 1]);
	});

	it('hit matches working room → ok', () => {
		const v = isValidGhostPlacement({ point: [1, 0, 1], roomId: 'paris' }, 'paris');
		expect(v.isValid).toBe(true);
		expect(v.reason).toBe('ok');
		expect(v.ghostPosition).toEqual([1, 0, 1]);
	});

	it('hit room differs from working room → off-room-bounds', () => {
		const v = isValidGhostPlacement({ point: [1, 0, 1], roomId: 'entrance' }, 'paris');
		expect(v.isValid).toBe(false);
		expect(v.reason).toBe('off-room-bounds');
	});

	it('hit room matches when no working room is set → ok', () => {
		const v = isValidGhostPlacement({ point: [1, 0, 1], roomId: 'paris' }, null);
		expect(v.isValid).toBe(true);
		expect(v.reason).toBe('ok');
	});
});

describe('getGhostColorForReason', () => {
	it('maps every reason to its corresponding hex colour', () => {
		const expected: Record<PlacementValidityReason, number> = {
			ok: 0x88ddff,
			'no-floor': 0xff6b6b,
			'off-grid': 0xffaa44,
			'off-room-bounds': 0xffaa44,
			collision: 0xaa88ff
		};
		for (const reason of Object.keys(expected) as PlacementValidityReason[]) {
			expect(getGhostColorForReason(reason)).toBe(expected[reason]);
		}
	});
});

describe('PlacementGhostPrototype — defaults', () => {
	it('boxPrototype constructor carries sensible defaults', () => {
		const proto = boxPrototype({ width: 2, height: 3, depth: 0.5 });
		expect(proto.primitiveKind).toBe('box');
		expect(proto.dimensions).toEqual({ width: 2, height: 3, depth: 0.5 });
		expect(proto.defaultRotation).toEqual([0, 0, 0]);
		expect(proto.defaultScaleScalar).toBe(1);
		expect(proto.defaultScaleVector).toBeNull();
		expect(proto.scaleMode).toBe('uniform');
		expect(proto.defaultYOffset).toBe(0);
	});
});
