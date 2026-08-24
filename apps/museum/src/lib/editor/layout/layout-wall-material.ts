import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { SCENE_PALETTE_HEX } from '../styles/scene-palette';

/**
 * Shared wall material buckets — one instance per selection bucket, not per chord.
 */
// P3.2 — selection/hover language follows the canonical §8 overlay palette:
// selected = `--editor-selection-outline`, hover tier = `--editor-selection-
// outline-hover` (Design-specs §28A state table). Albedo materials below stay
// scene content; only the selection/hover language is tokenized here.
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
	color: SCENE_PALETTE_HEX.selected,
	roughness: 0.82,
	metalness: 0
});
export const WALL_MATERIAL_OPENING_SELECTED = new MeshStandardMaterial({
	color: SCENE_PALETTE_HEX.selected,
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
	color: SCENE_PALETTE_HEX.selected,
	transparent: true,
	opacity: 0.45,
	depthWrite: false,
	side: DoubleSide
});
export const OPENING_HIGHLIGHT_MATERIAL = new MeshBasicMaterial({
	color: SCENE_PALETTE_HEX.selected,
	transparent: true,
	opacity: 0.5,
	depthWrite: false,
	side: DoubleSide
});

/**
 * follow-up — hover preview overlays. Hover-tier blue (vs the selected
 * outline) so the surface a click would select is visible before the click,
 * per the §28A hover/selected state table. Module-level singletons like the
 * selection materials, so workspace remounts cannot leak GPU resources.
 */
export const WALL_HOVER_MATERIAL = new MeshBasicMaterial({
	color: SCENE_PALETTE_HEX.hover,
	transparent: true,
	opacity: 0.3,
	depthWrite: false,
	side: DoubleSide
});
export const OPENING_HOVER_MATERIAL = new MeshBasicMaterial({
	color: SCENE_PALETTE_HEX.hover,
	transparent: true,
	opacity: 0.34,
	depthWrite: false,
	side: DoubleSide
});

/** Hover accent tint shared by layout objects and interior-anchor helpers. */
export const LAYOUT_HOVER_COLOR = SCENE_PALETTE_HEX.hover;

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
