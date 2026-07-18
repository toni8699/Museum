import type { Intersection, Material, Mesh, Object3D } from 'three';

/** Shared opacity floor for normal and Alt selection hit filtering. */
export const NEAR_INVISIBLE_OPACITY = 0.05;

export type EditorPlacementUserData = {
	editorEntity: 'placement';
	placementId: string;
};

export type EditorCameraHandle = 'position' | 'target';

/** Ephemeral viewport tag applied to an eye or target helper root. */
export type EditorCameraHandleUserData = {
	editorEntity: 'camera-handle';
	nodeId: string;
	cameraHandle: EditorCameraHandle;
};

export type EditorCameraSelection = {
	nodeId: string;
	handle: EditorCameraHandle;
};

export type SelectionHitInfo = {
	/** Effective opacity of the hit material (1 if unknown / non-mesh). */
	opacity: number;
	/** Climbed placement id, if any. */
	placementId: string | null;
	/** Climbed camera helper, if any. Absent on legacy/manual hit fixtures. */
	cameraSelection?: EditorCameraSelection | null;
};

export type NormalSelectionResult =
	| { action: 'select'; id: string }
	| { action: 'select-camera'; selection: EditorCameraSelection }
	| { action: 'deselect' };

export function isEditorPlacementUserData(
	value: unknown
): value is EditorPlacementUserData {
	if (!value || typeof value !== 'object') return false;
	const data = value as Record<string, unknown>;
	return data.editorEntity === 'placement' && typeof data.placementId === 'string';
}

export function isEditorCameraHandleUserData(
	value: unknown
): value is EditorCameraHandleUserData {
	if (!value || typeof value !== 'object') return false;
	const data = value as Record<string, unknown>;
	return (
		data.editorEntity === 'camera-handle' &&
		typeof data.nodeId === 'string' &&
		(data.cameraHandle === 'position' || data.cameraHandle === 'target')
	);
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

/** Climb parents for `userData.editorEntity === 'camera-handle'`. */
export function findCameraSelectionFromObject(
	object: Object3D | null
): EditorCameraSelection | null {
	let current: Object3D | null = object;
	while (current) {
		if (isEditorCameraHandleUserData(current.userData)) {
			return {
				nodeId: current.userData.nodeId,
				handle: current.userData.cameraHandle
			};
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
		placementId: findPlacementIdFromObject(hit.object),
		cameraSelection: findCameraSelectionFromObject(hit.object)
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
 * Normal click: an effective camera helper wins over placement geometry.
 * Otherwise the first effective hit keeps the existing placement/deselect rule.
 */
export function resolveNormalSelection(
	hits: SelectionHitInfo[]
): NormalSelectionResult {
	const effective = filterEffectiveHits(hits);
	const cameraHit = effective.find((hit) => hit.cameraSelection);
	if (cameraHit?.cameraSelection) {
		return { action: 'select-camera', selection: cameraHit.cameraSelection };
	}

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
