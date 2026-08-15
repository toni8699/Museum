import type { Intersection, Material, Mesh, Object3D } from 'three';
import type { CameraConnectionDirection } from '$lib/types/museum';

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

export type EditorNavigationSelection =
	| null
	| ({ kind: 'node' } & EditorCameraSelection)
	| {
			kind: 'connection';
			connectionId: string;
	  }
	| {
			kind: 'anchor';
			connectionId: string;
			anchorId: string;
	  }
	| {
			kind: 'view-keyframe';
			connectionId: string;
			direction: CameraConnectionDirection;
			keyframeId: string;
	  };

export type EditorCameraConnectionUserData = {
	editorEntity: 'camera-connection';
	connectionId: string;
};

export type EditorCameraAnchorUserData = {
	editorEntity: 'camera-anchor';
	connectionId: string;
	anchorId: string;
};

export type EditorCameraViewKeyframeUserData = {
	editorEntity: 'camera-view-keyframe';
	connectionId: string;
	direction: CameraConnectionDirection;
	keyframeId: string;
	viewHandle: 'position' | 'target';
};

export type EditorCameraViewKeyframeHandle = {
	connectionId: string;
	direction: CameraConnectionDirection;
	keyframeId: string;
	viewHandle: 'position' | 'target';
};

export type EditorCameraFovHandleUserData =
	| {
			editorEntity: 'camera-fov-handle';
			owner: 'node';
			nodeId: string;
			side: 'top' | 'bottom';
	  }
	| {
			editorEntity: 'camera-fov-handle';
			owner: 'view-keyframe';
			connectionId: string;
			direction: CameraConnectionDirection;
			keyframeId: string;
			side: 'top' | 'bottom';
	  };

export type EditorCameraFovHandle =
	| {
			owner: 'node';
			nodeId: string;
			side: 'top' | 'bottom';
	  }
	| {
			owner: 'view-keyframe';
			connectionId: string;
			direction: CameraConnectionDirection;
			keyframeId: string;
			side: 'top' | 'bottom';
	  };

export type SelectionHitInfo = {
	/** Effective opacity of the hit material (1 if unknown / non-mesh). */
	opacity: number;
	/** Climbed placement id, if any. */
	placementId: string | null;
	/** Climbed camera helper, if any. Absent on legacy/manual hit fixtures. */
	cameraSelection?: EditorCameraSelection | null;
	/** Any climbed navigation helper, including path connections and anchors. */
	navigationSelection?: EditorNavigationSelection;
	/** H1 S6 — raycast distance in meters. Runtime intersections always set it; absent on legacy/manual fixtures. */
	distance?: number;
};

export type NormalSelectionResult =
	| { action: 'select'; id: string }
	| { action: 'select-camera'; selection: EditorCameraSelection }
	| { action: 'select-navigation'; selection: Exclude<EditorNavigationSelection, null> }
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

export function isEditorCameraConnectionUserData(
	value: unknown
): value is EditorCameraConnectionUserData {
	if (!value || typeof value !== 'object') return false;
	const data = value as Record<string, unknown>;
	return (
		data.editorEntity === 'camera-connection' &&
		typeof data.connectionId === 'string'
	);
}

export function isEditorCameraAnchorUserData(
	value: unknown
): value is EditorCameraAnchorUserData {
	if (!value || typeof value !== 'object') return false;
	const data = value as Record<string, unknown>;
	return (
		data.editorEntity === 'camera-anchor' &&
		typeof data.connectionId === 'string' &&
		typeof data.anchorId === 'string'
	);
}

export function isEditorCameraViewKeyframeUserData(
	value: unknown
): value is EditorCameraViewKeyframeUserData {
	if (!value || typeof value !== 'object') return false;
	const data = value as Record<string, unknown>;
	return (
		data.editorEntity === 'camera-view-keyframe' &&
		typeof data.connectionId === 'string' &&
		(data.direction === 'forward' || data.direction === 'reverse') &&
		typeof data.keyframeId === 'string' &&
		(data.viewHandle === 'position' || data.viewHandle === 'target')
	);
}

export function isEditorCameraFovHandleUserData(
	value: unknown
): value is EditorCameraFovHandleUserData {
	if (!value || typeof value !== 'object') return false;
	const data = value as Record<string, unknown>;
	if (
		data.editorEntity !== 'camera-fov-handle' ||
		(data.side !== 'top' && data.side !== 'bottom')
	) {
		return false;
	}
	if (data.owner === 'node') return typeof data.nodeId === 'string';
	return (
		data.owner === 'view-keyframe' &&
		typeof data.connectionId === 'string' &&
		(data.direction === 'forward' || data.direction === 'reverse') &&
		typeof data.keyframeId === 'string'
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

/** Climb parents for a camera framing key's derived eye marker or target handle. */
export function findCameraViewKeyframeHandleFromObject(
	object: Object3D | null
): EditorCameraViewKeyframeHandle | null {
	let current: Object3D | null = object;
	while (current) {
		if (isEditorCameraViewKeyframeUserData(current.userData)) {
			return {
				connectionId: current.userData.connectionId,
				direction: current.userData.direction,
				keyframeId: current.userData.keyframeId,
				viewHandle: current.userData.viewHandle
			};
		}
		current = current.parent;
	}
	return null;
}

export function findCameraFovHandleFromObject(
	object: Object3D | null
): EditorCameraFovHandle | null {
	let current: Object3D | null = object;
	while (current) {
		if (isEditorCameraFovHandleUserData(current.userData)) {
			const { editorEntity: _, ...handle } = current.userData;
			return handle;
		}
		current = current.parent;
	}
	return null;
}

/** A framing target owns overlap so its gizmo never starts derived-eye progress drag. */
export function findPriorityCameraViewKeyframeHandle(
	objects: readonly Object3D[]
): EditorCameraViewKeyframeHandle | null {
	const handles = objects
		.map(findCameraViewKeyframeHandleFromObject)
		.filter((handle): handle is EditorCameraViewKeyframeHandle => handle !== null);
	return (
		handles.find((handle) => handle.viewHandle === 'target') ??
		handles.find((handle) => handle.viewHandle === 'position') ??
		null
	);
}

/** Climb parents for any editor-only navigation helper tag. */
export function findNavigationSelectionFromObject(
	object: Object3D | null
): EditorNavigationSelection {
	let current: Object3D | null = object;
	while (current) {
		if (isEditorCameraHandleUserData(current.userData)) {
			return {
				kind: 'node',
				nodeId: current.userData.nodeId,
				handle: current.userData.cameraHandle
			};
		}
		if (isEditorCameraAnchorUserData(current.userData)) {
			return {
				kind: 'anchor',
				connectionId: current.userData.connectionId,
				anchorId: current.userData.anchorId
			};
		}
		if (isEditorCameraViewKeyframeUserData(current.userData)) {
			return {
				kind: 'view-keyframe',
				connectionId: current.userData.connectionId,
				direction: current.userData.direction,
				keyframeId: current.userData.keyframeId
			};
		}
		if (isEditorCameraConnectionUserData(current.userData)) {
			return {
				kind: 'connection',
				connectionId: current.userData.connectionId
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
	const navigationSelection = findNavigationSelectionFromObject(hit.object);
	return {
		opacity: getHitOpacity(hit.object, hit.face?.materialIndex),
		placementId: findPlacementIdFromObject(hit.object),
		cameraSelection:
			navigationSelection?.kind === 'node'
				? {
						nodeId: navigationSelection.nodeId,
						handle: navigationSelection.handle
				  }
				: null,
		navigationSelection,
		distance: hit.distance
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
 * Normal click resolver paired with the exact hit that produced the result.
 * Same opacity filtering + camera/navigation/placement priority as
 * `resolveNormalSelection`; the returned `sourceHit` is the actionable source
 * hit (null for a `deselect`, even when the first effective hit is
 * non-interactive editor chrome). H1 S6 uses the source hit's `distance` for
 * cross-domain nearest-visible arbitration — never nearest-tag guessing.
 */
export function resolveNormalSelectionWithHit(
	hits: SelectionHitInfo[]
): { result: NormalSelectionResult; sourceHit: SelectionHitInfo | null } {
	const effective = filterEffectiveHits(hits);
	const cameraHit = effective.find(
		(hit) => hit.navigationSelection?.kind === 'node' || hit.cameraSelection
	);
	if (cameraHit?.cameraSelection) {
		return {
			result: { action: 'select-camera', selection: cameraHit.cameraSelection },
			sourceHit: cameraHit
		};
	}
	if (cameraHit?.navigationSelection?.kind === 'node') {
		const { nodeId, handle } = cameraHit.navigationSelection;
		return {
			result: { action: 'select-camera', selection: { nodeId, handle } },
			sourceHit: cameraHit
		};
	}

	const anchorHit = effective.find(
		(hit) => hit.navigationSelection?.kind === 'view-keyframe'
	);
	if (anchorHit?.navigationSelection) {
		return {
			result: { action: 'select-navigation', selection: anchorHit.navigationSelection },
			sourceHit: anchorHit
		};
	}

	const pathAnchorHit = effective.find(
		(hit) => hit.navigationSelection?.kind === 'anchor'
	);
	if (pathAnchorHit?.navigationSelection) {
		return {
			result: { action: 'select-navigation', selection: pathAnchorHit.navigationSelection },
			sourceHit: pathAnchorHit
		};
	}

	const connectionHit = effective.find(
		(hit) => hit.navigationSelection?.kind === 'connection'
	);
	if (connectionHit?.navigationSelection) {
		return {
			result: { action: 'select-navigation', selection: connectionHit.navigationSelection },
			sourceHit: connectionHit
		};
	}

	const first = effective[0];
	if (!first) return { result: { action: 'deselect' }, sourceHit: null };
	if (first.placementId) {
		return { result: { action: 'select', id: first.placementId }, sourceHit: first };
	}
	return { result: { action: 'deselect' }, sourceHit: null };
}

/**
 * Normal click: an effective camera helper wins over placement geometry.
 * Otherwise the first effective hit keeps the existing placement/deselect rule.
 * Delegates to `resolveNormalSelectionWithHit`; return shape unchanged.
 */
export function resolveNormalSelection(
	hits: SelectionHitInfo[]
): NormalSelectionResult {
	return resolveNormalSelectionWithHit(hits).result;
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
