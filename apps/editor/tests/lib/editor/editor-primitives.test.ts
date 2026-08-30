import { describe, expect, it } from 'vitest';
import {
	createPrimitiveEntity,
	defaultPrimitiveDimensions,
	PRIMITIVE_LIBRARY,
	validatePrimitiveDimensions
} from '$lib/editor/editor-primitives';

describe('editor-primitives', () => {
	it('lists the four built-in shape kinds', () => {
		expect(PRIMITIVE_LIBRARY.map((item) => item.kind)).toEqual([
			'box',
			'plane',
			'cylinder',
			'sphere'
		]);
	});

	it('builds conservative default entities', () => {
		const box = createPrimitiveEntity({
			id: 'box-1',
			kind: 'box',
			roomId: 'workshop',
			position: [1, 0, 2]
		});
		expect(box).toMatchObject({
			kind: 'primitive',
			primitive: 'box',
			name: 'Box',
			roomId: 'workshop',
			position: [1, 0, 2],
			rotation: [0, 0, 0],
			dimensions: { width: 1, height: 1, depth: 1 },
			materialId: 'wood-walnut',
			castShadow: true,
			receiveShadow: true
		});
		expect(defaultPrimitiveDimensions('sphere')).toEqual({ radius: 0.5 });
	});

	it('rejects non-positive dimensions and exact-key mismatches', () => {
		expect(validatePrimitiveDimensions('box', { width: 1, height: 0, depth: 1 })).toMatch(
			/greater than zero/
		);
		expect(validatePrimitiveDimensions('sphere', { radius: Number.NaN })).toMatch(
			/greater than zero/
		);
		expect(validatePrimitiveDimensions('plane', { width: 2, height: 1 })).toBeNull();
		expect(
			validatePrimitiveDimensions('sphere', { radius: 1, height: 2 } as never)
		).toMatch(/only radius/);
	});
});
