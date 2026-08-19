import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';

/** Shared wall material buckets — one instance per selection bucket, not per chord. */
/**
 * Default wall albedo matches the concept sketch's dark charcoal walls
 * (sampled pixels ≈ #4d4d4f) and the visitor's neutral room presentation
 * (#4b4b52), so the editor preview, visitor shell, and design sketches agree.
 */
export const WALL_MATERIAL_DEFAULT = new MeshStandardMaterial({
	color: '#4d4d4f',
	roughness: 0.82,
	metalness: 0
});
export const WALL_MATERIAL_WALL_SELECTED = new MeshStandardMaterial({
	color: '#d6b35f',
	roughness: 0.82,
	metalness: 0
});
export const WALL_MATERIAL_OPENING_SELECTED = new MeshStandardMaterial({
	color: '#f1d99a',
	roughness: 0.82,
	metalness: 0
});

/**
 * Shared floor material for layout preview floors. The default albedo matches
 * the concept sketch's gray floor family (slightly lighter than the walls so
 * the two surfaces stay distinguishable) and is adjustable per-session via
 * `session.floorColor` (see LayoutPreviewScene).
 */
export const FLOOR_MATERIAL = new MeshStandardMaterial({
	color: '#57575d',
	roughness: 0.9,
	metalness: 0
});

/**
 * Shared selection-highlight overlays for the layout preview. Module-level so
 * every preview mount reuses the same two materials — per-mount allocation
 * would leak GPU resources across workspace switches (the scene remounts and
 * never disposes them).
 */
export const WALL_HIGHLIGHT_MATERIAL = new MeshBasicMaterial({
	color: '#d6b35f',
	transparent: true,
	opacity: 0.45,
	depthWrite: false,
	side: DoubleSide
});
export const OPENING_HIGHLIGHT_MATERIAL = new MeshBasicMaterial({
	color: '#f1d99a',
	transparent: true,
	opacity: 0.5,
	depthWrite: false,
	side: DoubleSide
});

/**
 * follow-up — hover preview overlays. Distinct cyan tint (vs. the gold
 * selection shell) so the surface a click would select is visible before the
 * click. Module-level singletons like the selection materials, so workspace
 * remounts cannot leak GPU resources.
 */
export const WALL_HOVER_MATERIAL = new MeshBasicMaterial({
	color: '#6fc3ff',
	transparent: true,
	opacity: 0.3,
	depthWrite: false,
	side: DoubleSide
});
export const OPENING_HOVER_MATERIAL = new MeshBasicMaterial({
	color: '#8fd6ff',
	transparent: true,
	opacity: 0.34,
	depthWrite: false,
	side: DoubleSide
});

/** Hover accent tint shared by layout objects and interior-anchor helpers. */
export const LAYOUT_HOVER_COLOR = '#6fc3ff';

export type WallMaterialKey = 'default' | 'wall-selected' | 'opening-selected';

/**
 * Resolve a wall solid span to its material bucket. Opening selection wins over
 * wall selection; unselected spans fall back to the default bucket.
 */
export function wallSectionMaterialKey(
	selectedOpeningId: string | null,
	selectedSegmentId: string | null,
	segmentId: string,
	openingId?: string
): WallMaterialKey {
	if (openingId !== undefined && openingId === selectedOpeningId) return 'opening-selected';
	if (segmentId === selectedSegmentId) return 'wall-selected';
	return 'default';
}

export function wallMaterialForKey(key: WallMaterialKey): MeshStandardMaterial {
	switch (key) {
		case 'wall-selected':
			return WALL_MATERIAL_WALL_SELECTED;
		case 'opening-selected':
			return WALL_MATERIAL_OPENING_SELECTED;
		default:
			return WALL_MATERIAL_DEFAULT;
	}
}
