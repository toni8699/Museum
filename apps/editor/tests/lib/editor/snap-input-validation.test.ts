import { describe, expect, it } from 'vitest';

import {
	MAX_ROTATION_SNAP_DEGREES,
	MIN_ROTATION_SNAP_DEGREES,
	MIN_TRANSLATION_SNAP_METERS,
	parseRotationSnapDegrees,
	parseTranslationSnapMeters
} from '$lib/editor/snap-input-validation';

describe('snap number-input validation (P21.1 Row 2 precision)', () => {
	it('accepts strictly positive snap distances at or above the 0.01 m floor', () => {
		expect(parseTranslationSnapMeters(0.01)).toBe(0.01);
		expect(parseTranslationSnapMeters(0.25)).toBe(0.25);
		expect(parseTranslationSnapMeters(10)).toBe(10);
		expect(MIN_TRANSLATION_SNAP_METERS).toBe(0.01);
	});

	it('rejects non-finite, zero, and negative snap distances before gizmo state', () => {
		for (const raw of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0.25, -1]) {
			expect(parseTranslationSnapMeters(raw)).toBeNull();
		}
		expect(parseTranslationSnapMeters(0.009)).toBeNull();
	});

	it('accepts rotation snap angles within 1–180° inclusive', () => {
		expect(parseRotationSnapDegrees(1)).toBe(1);
		expect(parseRotationSnapDegrees(15)).toBe(15);
		expect(parseRotationSnapDegrees(180)).toBe(180);
		expect(MIN_ROTATION_SNAP_DEGREES).toBe(1);
		expect(MAX_ROTATION_SNAP_DEGREES).toBe(180);
	});

	it('rejects non-finite, zero, negative, and over-maximum snap angles', () => {
		for (const raw of [Number.NaN, Number.POSITIVE_INFINITY, 0, 0.5, -15, 181, 360]) {
			expect(parseRotationSnapDegrees(raw)).toBeNull();
		}
	});
});
