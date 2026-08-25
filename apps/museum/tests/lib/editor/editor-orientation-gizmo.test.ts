import { describe, expect, it } from 'vitest';
import { deriveCardinalFace } from '$lib/editor/editor-orientation-gizmo.svelte';

describe('deriveCardinalFace (P3B.2)', () => {
	it('picks the dominant axis with its sign', () => {
		expect(deriveCardinalFace({ x: 10, y: 2, z: 3 })).toBe('+X');
		expect(deriveCardinalFace({ x: -8, y: 1, z: 4 })).toBe('-X');
		expect(deriveCardinalFace({ x: 2, y: 9, z: 3 })).toBe('+Y');
		expect(deriveCardinalFace({ x: 1, y: -6, z: 2 })).toBe('-Y');
		expect(deriveCardinalFace({ x: 2, y: 3, z: 7 })).toBe('+Z');
		expect(deriveCardinalFace({ x: 1, y: 4, z: -9 })).toBe('-Z');
	});

	it('breaks ties deterministically toward X, then Y', () => {
		expect(deriveCardinalFace({ x: 5, y: 5, z: 2 })).toBe('+X');
		expect(deriveCardinalFace({ x: 3, y: 5, z: 5 })).toBe('+Y');
	});

	it('handles exact axis alignment and a zero vector', () => {
		expect(deriveCardinalFace({ x: 0, y: -12, z: 0 })).toBe('-Y');
		expect(deriveCardinalFace({ x: 0, y: 0, z: 0 })).toBe('+X');
	});
});
