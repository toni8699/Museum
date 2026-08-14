import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';

/** Shared wall material buckets — one instance per selection bucket, not per chord. */
export const WALL_MATERIAL_DEFAULT = new MeshStandardMaterial({
	color: '#a99d89',
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

/** Shared floor material for layout preview floors. */
export const FLOOR_MATERIAL = new MeshStandardMaterial({
	color: '#6b6254',
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
