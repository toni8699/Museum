import type { LayoutVec2 } from '$lib/layout/layout-types';
import { distanceToPlanPolygonEdge, pointInPlanPolygon } from './plan-scene-hit';

/**
 * Pure owner-aware Arrange hit resolution (P10.1).
 *
 * Composes existing Layout Plan render identities (object footprints) with the
 * shipped P2 Scene footprints into one pointer candidate set. The pinned
 * priority is:
 *
 *   1. containment before edge halo (halo applies to Scene footprints only —
 *      Plan object hits are containment-only, matching `resolvePlanHit`);
 *   2. a member of the **active owner selection** under the pointer wins;
 *   3. otherwise visual topmost wins (Scene layer 6 renders above Layout layer 5);
 *   4. stable render order breaks same-owner ties (last rendered = topmost).
 *
 * `selected` flags are supplied by the caller and must mean *member of the
 * active owner's selection* — never the inactive slot's memory. No Svelte, DOM,
 * or view-transform imports; the caller converts the halo from CSS pixels.
 */

export type ArrangeHitTarget =
	| { owner: 'layout-object'; objectId: string }
	| { owner: 'scene'; entityId: string };

export type ArrangeLayoutObjectCandidate = {
	objectId: string;
	points: LayoutVec2[];
	/** Member of the active Layout-object selection. */
	selected: boolean;
};

export type ArrangeSceneCandidate = {
	entityId: string;
	points: LayoutVec2[];
	/** Member of the active Scene selection. */
	selected: boolean;
};

export function resolveArrangeHit(input: {
	point: LayoutVec2;
	layoutObjects: readonly ArrangeLayoutObjectCandidate[];
	sceneFootprints: readonly ArrangeSceneCandidate[];
	/** Already converted from CSS pixels by the caller. */
	edgeHaloMeters: number;
}): ArrangeHitTarget | null {
	const { point, layoutObjects, sceneFootprints, edgeHaloMeters } = input;

	// Collect layout + scene containment in render order (layout document order
	// first, then Scene projection order) so the final "last wins" pass matches
	// SVG's last-rendered-is-topmost rule. Scene footprints are a higher layer,
	// so they are appended after layout objects.
	const candidates: { target: ArrangeHitTarget; selected: boolean }[] = [];
	for (const object of layoutObjects) {
		if (pointInPlanPolygon(point, object.points)) {
			candidates.push({
				target: { owner: 'layout-object', objectId: object.objectId },
				selected: object.selected
			});
		}
	}
	for (const footprint of sceneFootprints) {
		if (pointInPlanPolygon(point, footprint.points)) {
			candidates.push({
				target: { owner: 'scene', entityId: footprint.entityId },
				selected: footprint.selected
			});
		}
	}

	// No containment: Scene footprint edge halo only (Plan objects have no halo).
	if (candidates.length === 0) {
		if (!Number.isFinite(edgeHaloMeters) || edgeHaloMeters < 0) return null;
		for (let index = sceneFootprints.length - 1; index >= 0; index -= 1) {
			const footprint = sceneFootprints[index]!;
			if (distanceToPlanPolygonEdge(point, footprint.points) <= edgeHaloMeters) {
				return { owner: 'scene', entityId: footprint.entityId };
			}
		}
		return null;
	}

	// Selected-under-pointer wins: keep only members of the active selection
	// when any candidate is one. The inactive slot's memory never counts.
	const selected = candidates.filter((candidate) => candidate.selected);
	const pool = selected.length > 0 ? selected : candidates;

	// Visual topmost: Scene footprints (layer 6) beat layout objects (layer 5).
	const scenePool = pool.filter((candidate) => candidate.target.owner === 'scene');
	const finalPool = scenePool.length > 0 ? scenePool : pool;

	// Stable render order breaks ties: last rendered is topmost.
	return finalPool.at(-1)!.target;
}
