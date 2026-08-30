import type { LayoutVec2 } from '$lib/layout/layout-types';

/** ShapeGeometry lies in XY. Floor rotation -90° maps shape Y to world -Z. */
export function floorShapePoints(points: readonly LayoutVec2[]): LayoutVec2[] {
	return points.map(([x, z]) => [x, -z]);
}

/** Ceiling rotation +90° maps shape Y to world +Z. */
export function ceilingShapePoints(points: readonly LayoutVec2[]): LayoutVec2[] {
	return points.map(([x, z]) => [x, z]);
}
