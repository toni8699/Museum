import { describe, expect, it } from 'vitest';
import {
	MIN_PLACEMENT_SCALE,
	SCALE_UNIFORM_EPSILON,
	SCALE_VALUES_TOLERANCE,
	averageScale,
	dominantMode,
	isUniformValue,
	isUniformVector,
	normalizeScale,
	resolveEditorPlacementScale,
	scaleVectorEquals
} from './scale-vector';

describe('isUniformValue', () => {
	it('rejects NaN, zero, and negative numbers', () => {
		expect(isUniformValue(Number.NaN)).toBe(false);
		expect(isUniformValue(0)).toBe(false);
		expect(isUniformValue(-1)).toBe(false);
		expect(isUniformValue(-MIN_PLACEMENT_SCALE / 2)).toBe(false);
	});

	it('accepts positive finite numbers above MIN_PLACEMENT_SCALE', () => {
		expect(isUniformValue(MIN_PLACEMENT_SCALE)).toBe(true);
		expect(isUniformValue(0.5)).toBe(true);
		expect(isUniformValue(1)).toBe(true);
		expect(isUniformValue(100)).toBe(true);
	});

	it('rejects values below MIN_PLACEMENT_SCALE', () => {
		expect(isUniformValue(MIN_PLACEMENT_SCALE / 2)).toBe(false);
		expect(isUniformValue(0.001)).toBe(false);
	});
});

describe('isUniformVector', () => {
	it('three equal components → uniform', () => {
		expect(isUniformVector([1, 1, 1])).toBe(true);
		expect(isUniformVector([0.5, 0.5, 0.5])).toBe(true);
	});

	it('components within ε → uniform', () => {
		expect(isUniformVector([1, 1 + SCALE_UNIFORM_EPSILON * 0.5, 1])).toBe(true);
		expect(isUniformVector([2, 2 + SCALE_UNIFORM_EPSILON * 0.9, 2])).toBe(true);
	});

	it('components differing by more than ε → independent', () => {
		expect(isUniformVector([1, 1.1, 1])).toBe(false);
		expect(isUniformVector([5, 3, 0.05])).toBe(false);
		expect(isUniformVector([1.5001, 1.4999, 1.5])).toBe(false);
	});

	it('rejects any non-positive component', () => {
		expect(isUniformVector([0, 0, 0])).toBe(false);
		expect(isUniformVector([1, -1, 1])).toBe(false);
		expect(isUniformVector([MIN_PLACEMENT_SCALE / 2, MAX_OK(), MAX_OK()])).toBe(false);
	});
});

describe('averageScale', () => {
	it('returns the arithmetic mean', () => {
		expect(averageScale([1, 1, 1])).toBe(1);
		expect(averageScale([6, 0.1, 6])).toBeCloseTo((6 + 0.1 + 6) / 3, 6);
		expect(averageScale([2, 4, 6])).toBe(4);
	});

	it('handles tiny vectors consistently', () => {
		expect(averageScale([0.01, 0.01, 0.01])).toBeCloseTo(0.01, 6);
	});
});

describe('normalizeScale', () => {
	it('uniform + scalar → scalar only, no vector', () => {
		expect(normalizeScale({ mode: 'uniform', scalar: 2, vector: null })).toEqual({
			scaleScalar: 2,
			scaleVector: null
		});
	});

	it('independent + Vec3 → vector + averaged scalar', () => {
		expect(normalizeScale({ mode: 'independent', scalar: 1, vector: [6, 0.1, 6] })).toEqual({
			scaleScalar: (6 + 0.1 + 6) / 3,
			scaleVector: [6, 0.1, 6]
		});
	});

	it('independent + null vector → defaults to [1, 1, 1]', () => {
		expect(normalizeScale({ mode: 'independent', scalar: null, vector: null })).toEqual({
			scaleScalar: 1,
			scaleVector: [1, 1, 1]
		});
	});

	it('uniform mode ignores incoming vector', () => {
		expect(normalizeScale({ mode: 'uniform', scalar: 1.5, vector: [5, 3, 0.05] })).toEqual({
			scaleScalar: 1.5,
			scaleVector: null
		});
	});

	it('uniform mode falls back to 1 when scalar is invalid', () => {
		expect(normalizeScale({ mode: 'uniform', scalar: null, vector: null })).toEqual({
			scaleScalar: 1,
			scaleVector: null
		});
		expect(normalizeScale({ mode: 'uniform', scalar: -1, vector: null })).toEqual({
			scaleScalar: 1,
			scaleVector: null
		});
	});
});

describe('dominantMode', () => {
	const identity = [1, 1, 1] as const;
	const stretched = [5, 3, 0.05] as const;

	it('all uniform → uniform', () => {
		expect(
			dominantMode([
				{ scaleMode: 'uniform', scaleVector: null },
				{ scaleMode: 'uniform', scaleVector: null }
			])
		).toBe('uniform');
	});

	it('all independent → independent', () => {
		expect(
			dominantMode([
				{ scaleMode: 'independent', scaleVector: [...identity] },
				{ scaleMode: 'independent', scaleVector: [...stretched] }
			])
		).toBe('independent');
	});

	it('tie → uniform (conservative fallback)', () => {
		expect(
			dominantMode([
				{ scaleMode: 'independent', scaleVector: [...identity] },
				{ scaleMode: 'uniform', scaleVector: null }
			])
		).toBe('uniform');
	});

	it('majority independent → independent', () => {
		expect(
			dominantMode([
				{ scaleMode: 'independent', scaleVector: [...identity] },
				{ scaleMode: 'independent', scaleVector: [...stretched] },
				{ scaleMode: 'uniform', scaleVector: null }
			])
		).toBe('independent');
	});

	it('empty cluster → uniform', () => {
		expect(dominantMode([])).toBe('uniform');
	});
});

describe('resolveEditorPlacementScale', () => {
	// EditorPlacementRoot must prefer the session vector over the document
	// scalar average — otherwise Threlte re-binds `entity.scale` (visitor
	// fallback) and snaps independent gizmo / inspector writes back to uniform.
	it('session vector wins over document scalar average', () => {
		expect(resolveEditorPlacementScale(2.68, [5, 3, 0.05])).toEqual([5, 3, 0.05]);
	});

	it('falls back to document scalar when no session vector', () => {
		expect(resolveEditorPlacementScale(1.5, null)).toBe(1.5);
	});

	it('falls back to 1 when document scale is absent and no vector', () => {
		expect(resolveEditorPlacementScale(undefined, null)).toBe(1);
	});
});

describe('scaleVectorEquals', () => {
	it('two nulls → equal', () => {
		expect(scaleVectorEquals(null, null)).toBe(true);
	});

	it('one null, one non-null → not equal', () => {
		expect(scaleVectorEquals(null, [1, 1, 1])).toBe(false);
		expect(scaleVectorEquals([1, 1, 1], null)).toBe(false);
	});

	it('equal vectors → true', () => {
		expect(scaleVectorEquals([1, 2, 3], [1, 2, 3])).toBe(true);
		expect(scaleVectorEquals([1, 2, 3], [1 + SCALE_VALUES_TOLERANCE * 0.5, 2, 3])).toBe(true);
	});

	it('vectors beyond tolerance → not equal', () => {
		expect(scaleVectorEquals([1.5, 1, 1], [1, 1, 1])).toBe(false);
		expect(scaleVectorEquals([1, 2, 3], [1, 2, 3.5])).toBe(false);
	});
});

// Helper kept local to the test file so the assertion reads as "valid + near minimum".
function MAX_OK() {
	return MIN_PLACEMENT_SCALE;
}
