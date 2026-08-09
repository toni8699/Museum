import { Box3, Object3D, Vector3 } from 'three';

import { getCombinedWorldBounds } from './editor-cluster-transform';

export type PlacementId = string;

export type PivotMode = 'center' | 'active-object';

export type PivotResolutionResult =
	| { kind: 'active-object'; root: Object3D }
	| { kind: 'center'; anchor: Object3D };

/**
 * Resolve the multi-select pivot object.
 *
 * Centre mode returns a synthetic anchor at the centroid of all roots.
 * Active Object mode returns the placement root whose id is the
 * most-recently-touched (matches the editor's "lastSelectedId").
 *
 * Single-select and empty-selection are not handled here — return null and
 * the caller dispatches its own logic (current behaviour: single-select
 * pivots the selected root, empty detaches the gizmo).
 */
export function resolveMultiSelectPivot(
	roots: Object3D[],
	lastSelectedId: PlacementId | null,
	pivotMode: PivotMode,
	rootIdResolver: (root: Object3D) => PlacementId | null
): PivotResolutionResult | null {
	if (roots.length === 0) return null;
	if (pivotMode === 'active-object' && lastSelectedId) {
		const match = roots.find((root) => rootIdResolver(root) === lastSelectedId);
		if (match) return { kind: 'active-object', root: match };
	}
	// Fallback: centroid bbox.
	const bounds = getCombinedWorldBounds(roots);
	if (bounds.isEmpty()) return null;
	const anchor = new Object3D();
	anchor.name = 'EditorSelectionPivotCentroid';
	anchor.position.copy(bounds.getCenter(new Vector3()));
	anchor.rotation.set(0, 0, 0);
	anchor.scale.setScalar(1);
	return { kind: 'center', anchor };
}

/**
 * Diagnostic helper for tests + external introspection.
 */
export function pivotResolutionSummary(roots: Object3D[]): {
	hasCenter: boolean;
	bounds: Box3;
} {
	return {
		hasCenter: roots.length > 0,
		bounds: getCombinedWorldBounds(roots)
	};
}
