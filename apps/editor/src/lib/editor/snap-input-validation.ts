/**
 * Snap number-input validation for the Row 2 precision menu.
 *
 * Native `min`/`max` attributes do not stop `oninput` from delivering
 * negative, zero, or over-maximum values, so the toolbar validates before
 * anything reaches gizmo state. Each parser returns the validated value or
 * `null` when the raw input must be rejected (the caller then restores the
 * input from the live store value).
 */

/** Minimum translation snap distance in meters (mirrors the input's `min`). */
export const MIN_TRANSLATION_SNAP_METERS = 0.01;

/** Rotation snap degree bounds (mirror the input's `min`/`max`). */
export const MIN_ROTATION_SNAP_DEGREES = 1;
export const MAX_ROTATION_SNAP_DEGREES = 180;

/** Validated translation snap distance, or `null` to reject the input. */
export function parseTranslationSnapMeters(raw: number): number | null {
	return Number.isFinite(raw) && raw >= MIN_TRANSLATION_SNAP_METERS ? raw : null;
}

/** Validated rotation snap angle in degrees, or `null` to reject the input. */
export function parseRotationSnapDegrees(raw: number): number | null {
	return Number.isFinite(raw) &&
		raw >= MIN_ROTATION_SNAP_DEGREES &&
		raw <= MAX_ROTATION_SNAP_DEGREES
		? raw
		: null;
}
