/**
 * `scale-vector` — pure helpers for uniform ↔ independent scale mode (Phase 1a).
 *
 * Owns the data model behind `PlacementTransform.scaleMode/scaleVector/scaleScalar`.
 * No Three.js imports — operates on `Vec3` numbers. Tests use plain `Vector3` or
 * numeric tuples.
 *
 * Two ways to render "scale":
 *   - `scaleScalar: number`  → uniform mode, applied identically to x/y/z.
 *   - `scaleVector: [x, y, z]` → independent mode, per-axis values.
 *
 * The schema-v6 visitor path only ever carries `placement.scale: number`; the
 * editor transform map owns the vector. `normalizeScale` collapses to scalar
 * when all three components are equal (within ε), so visitor render is
 * always self-consistent.
 */

import type { Vec3 } from '$lib/types/museum';

export type ScaleMode = 'uniform' | 'independent';

export const MIN_PLACEMENT_SCALE = 0.01;

/** Two components are considered equal when their difference is below this ε. */
export const SCALE_UNIFORM_EPSILON = 1e-6;

/** Components within ±0.0005 are treated as equal by helper consumers (UI / inspector). */
export const SCALE_VALUES_TOLERANCE = 0.0005;

/** True when a single `number` is a usable uniform scale value (positive, finite). */
export function isUniformValue(value: number): boolean {
	return Number.isFinite(value) && value >= MIN_PLACEMENT_SCALE;
}

/** True when a 3-component vector is uniform (all three components equal within ε). */
export function isUniformVector(vector: Vec3): boolean {
	if (!vector.every(isUniformValue)) return false;
	return (
		Math.abs(vector[0] - vector[1]) < SCALE_UNIFORM_EPSILON &&
		Math.abs(vector[1] - vector[2]) < SCALE_UNIFORM_EPSILON
	);
}

/** Arithmetic mean of a 3-component vector; useful for visitor scalar fallback. */
export function averageScale(vector: Vec3): number {
	return (vector[0] + vector[1] + vector[2]) / 3;
}

/**
 * Pick the scalar/vector representation based on the active scale mode.
 *
 * Independent mode always emits a vector (round-trips verbatim).
 * Uniform mode collapses any vector to scalar (drops the vector).
 * Fallbacks:
 *   - missing uniform scalar → 1
 *   - missing independent vector → [1, 1, 1]
 */
export function normalizeScale(input: {
	mode: ScaleMode;
	scalar: number | null;
	vector: Vec3 | null;
}): { scaleScalar: number; scaleVector: Vec3 | null } {
	if (input.mode === 'independent') {
		const v = input.vector ?? [1, 1, 1];
		return {
			scaleScalar: averageScale(v),
			scaleVector: [v[0], v[1], v[2]] as Vec3
		};
	}
	const candidate = input.scalar ?? 1;
	const scalar = isUniformValue(candidate) ? candidate : 1;
	return { scaleScalar: scalar, scaleVector: null };
}

/**
 * Cluster-level dominant mode: tie → uniform (preserves default), independent
 * only wins when strictly more members report independent than uniform.
 */
export function dominantMode(
	members: readonly { scaleMode: ScaleMode; scaleVector: Vec3 | null }[]
): ScaleMode {
	if (members.length === 0) return 'uniform';
	let independentCount = 0;
	let uniformCount = 0;
	for (const member of members) {
		if (member.scaleMode === 'independent' && member.scaleVector) independentCount++;
		else uniformCount++;
	}
	return independentCount > uniformCount ? 'independent' : 'uniform';
}

/**
 * Resolve the scale prop for `EditorPlacementRoot`.
 *
 * Schema v6 only persists a scalar (`entity.scale`), and independent mode
 * writes the axis average there as a visitor fallback. If the editor session
 * still holds a per-axis vector, that vector MUST win — otherwise Threlte
 * re-binds the scalar onto the placement Group and snaps gizmo / inspector
 * independent writes back to uniform.
 */
export function resolveEditorPlacementScale(
	documentScale: number | undefined,
	sessionVector: Vec3 | null
): number | Vec3 {
	if (sessionVector) return [sessionVector[0], sessionVector[1], sessionVector[2]] as Vec3;
	return documentScale ?? 1;
}

/** Strict vector equality (used when deciding whether to collapse a vector back to scalar).
 *  Uses the looser display tolerance because callers (UI / inspector) compare
 *  user-typed numeric fields, not Three's per-axis basis writes. */
export function scaleVectorEquals(a: Vec3 | null, b: Vec3 | null): boolean {
	if (a === null && b === null) return true;
	if (a === null || b === null) return false;
	for (let i = 0; i < 3; i++)
		if (Math.abs(a[i]! - b[i]!) > SCALE_VALUES_TOLERANCE) return false;
	return true;
}
