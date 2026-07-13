import type { Intersection, Material, Mesh, Object3D } from 'three';

/** Shared opacity floor for normal and Alt selection hit filtering. */
export const NEAR_INVISIBLE_OPACITY = 0.05;

export type EditorPlacementUserData = {
	editorEntity: 'placement';
	placementId: string;
};

export type SelectionHitInfo = {
	/** Effective opacity of the hit material (1 if unknown / non-mesh). */
	opacity: number;
	/** Climbed placement id, if any. */
	placementId: string | null;
};

export function isEditorPlacementUserData(
	value: unknown
): value is EditorPlacementUserData {
	if (!value || typeof value !== 'object') return false;
	const data = value as Record<string, unknown>;
	return data.editorEntity === 'placement' && typeof data.placementId === 'string';
}

/** Climb parents for `userData.editorEntity === 'placement'`. */
export function findPlacementIdFromObject(object: Object3D | null): string | null {
	let current: Object3D | null = object;
	while (current) {
		if (isEditorPlacementUserData(current.userData)) {
			return current.userData.placementId;
		}
		current = current.parent;
	}
	return null;
}

function materialOpacity(material: Material | undefined): number {
	if (!material) return 1;
	if ('opacity' in material && typeof material.opacity === 'number') {
		return material.opacity;
	}
	return 1;
}

/** Resolve hit material opacity; non-mesh objects count as fully opaque. */
export function getHitOpacity(object: Object3D, materialIndex?: number): number {
	const mesh = object as Mesh;
	if (!mesh.isMesh) return 1;

	const { material } = mesh;
	if (Array.isArray(material)) {
		const index = materialIndex ?? 0;
		return materialOpacity(material[index] ?? material[0]);
	}
	return materialOpacity(material);
}

export function selectionHitFromIntersection(hit: Intersection): SelectionHitInfo {
	return {
		opacity: getHitOpacity(hit.object, hit.face?.materialIndex),
		placementId: findPlacementIdFromObject(hit.object)
	};
}

export function filterEffectiveHits(hits: SelectionHitInfo[]): SelectionHitInfo[] {
	return hits.filter((hit) => hit.opacity >= NEAR_INVISIBLE_OPACITY);
}

/** First-seen unique placement ids from effective hits, preserving order. */
export function uniquePlacementIdsInOrder(hits: SelectionHitInfo[]): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();

	for (const hit of filterEffectiveHits(hits)) {
		if (!hit.placementId || seen.has(hit.placementId)) continue;
		seen.add(hit.placementId);
		ids.push(hit.placementId);
	}

	return ids;
}

/**
 * Normal click: first effective hit wins.
 * Placement ancestor → select id; otherwise deselect (locked / empty).
 */
export function resolveNormalSelection(
	hits: SelectionHitInfo[]
): { action: 'select'; id: string } | { action: 'deselect' } {
	const effective = filterEffectiveHits(hits);
	const first = effective[0];
	if (!first) return { action: 'deselect' };
	if (first.placementId) return { action: 'select', id: first.placementId };
	return { action: 'deselect' };
}

/**
 * Alt-cycle next id.
 * - empty → undefined (no change)
 * - current absent → first
 * - current present → next with wrap
 */
export function nextPlacementCycleId(
	currentId: string | null,
	ids: string[]
): string | undefined {
	if (ids.length === 0) return undefined;
	const index = currentId == null ? -1 : ids.indexOf(currentId);
	if (index === -1) return ids[0];
	return ids[(index + 1) % ids.length];
}
