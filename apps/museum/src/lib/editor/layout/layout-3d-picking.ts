/**
 * H1 S5 — pure 3D layout pick identity + reverse index.
 *
 * Consumes the additive `IndexedWallMesh.pickRanges` the builder emits and
 * turns it into O(1) triangle → pick-owner resolution (built once per mesh
 * generation, cached by the editor's preview state), plus the editor-only
 * interior-anchor helper placements. This module is deliberately
 * renderer-neutral: **no Three/DOM/Svelte imports** (same rule as `$lib/layout/**`
 * and the pure `plan-hit.ts` precedent under `$lib/editor/layout`). S6's
 * centralized 3D selection coordinator raycasts against the tagged meshes and
 * resolves each hit triangle through `buildLayout3dTriangleIndex`.
 */

import type { IndexedWallMesh, Layout3dPickRange, Layout3dTriangleRef } from '$lib/layout/wall-mesh-builder';
import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';
import type { LayoutSelection } from './layout-interaction';

export type { Layout3dPickRange, Layout3dTriangleRef } from '$lib/layout/wall-mesh-builder';

/** A triangle-index resolver: `triangleIndex` in `[0, indices.length / 3)`. Out-of-range → null. */
export type Layout3dPickIndex = (triangleIndex: number) => Layout3dTriangleRef | null;

/**
 * Build the dense triangle → pick-owner reverse index for one mesh.
 *
 * `pickRanges` is guaranteed by the builder to be a sorted, non-overlapping
 * partition of the index buffer; this function validates that invariant
 * (gap/overlap/uncovered/unaligned throws — a development guard mirroring
 * `assertWindingAgreesWithNormals`, so a builder regression fails loudly
 * instead of silently mis-picking in S6) and returns a closure over a dense
 * `Uint32Array`. Build **once per mesh generation**, never per raycast.
 */
export function buildLayout3dTriangleIndex(mesh: IndexedWallMesh): Layout3dPickIndex {
	const triangleCount = mesh.indices.length / 3;
	if (!Number.isInteger(triangleCount)) {
		throw new Error(`wall mesh ${mesh.roomId}: index count ${mesh.indices.length} is not a multiple of 3`);
	}

	// Deduplicate refs into a table; triangleToRef stores 1-based table indices
	// so 0 can never alias a real ref (every triangle is covered).
	const refTable: Layout3dTriangleRef[] = [];
	const refKeyToIndex = new Map<string, number>();
	const triangleToRef = new Uint32Array(triangleCount);

	let cursor = 0; // triangles consumed so far
	for (const range of mesh.pickRanges) {
		const startTriangle = range.start / 3;
		const countTriangles = range.count / 3;
		if (!Number.isInteger(startTriangle) || !Number.isInteger(countTriangles)) {
			throw new Error(
				`wall mesh ${mesh.roomId}: pick range ${JSON.stringify(range)} is not triangle-aligned`
			);
		}
		if (startTriangle !== cursor) {
			throw new Error(
				`wall mesh ${mesh.roomId}: pickRanges gap or overlap at triangle ${cursor} (range starts at ${startTriangle})`
			);
		}
		cursor += countTriangles;
		if (cursor > triangleCount) {
			throw new Error(
				`wall mesh ${mesh.roomId}: pickRanges exceed the index buffer (${cursor} > ${triangleCount} triangles)`
			);
		}

		// Dedupe on the pick-owner ref only — never on start/count, or every
		// range would get its own table entry.
		const ref: Layout3dTriangleRef =
			range.kind === 'opening'
				? {
						kind: 'opening',
						roomId: range.roomId,
						segmentId: range.segmentId,
						openingId: range.openingId,
						surface: range.surface
				  }
				: { kind: 'wall', roomId: range.roomId, segmentId: range.segmentId, surface: range.surface };
		const refKey = JSON.stringify(ref);
		let refIndex = refKeyToIndex.get(refKey);
		if (refIndex === undefined) {
			refIndex = refTable.length;
			refTable.push(ref);
			refKeyToIndex.set(refKey, refIndex);
		}
		for (let t = startTriangle; t < cursor; t += 1) {
			triangleToRef[t] = refIndex + 1;
		}
	}

	if (cursor !== triangleCount) {
		throw new Error(
			`wall mesh ${mesh.roomId}: pickRanges cover ${cursor} of ${triangleCount} triangles — every emitted triangle must have exactly one pick owner`
		);
	}

	return (triangleIndex: number): Layout3dTriangleRef | null => {
		if (triangleIndex < 0 || triangleIndex >= triangleCount) return null;
		const refIndex = triangleToRef[triangleIndex]! - 1;
		return refTable[refIndex] ?? null;
	};
}

/** Editor-only qualified interior-anchor helper placement (world-space position at room floor height). */
export type LayoutAnchorHelperPlacement = {
	roomId: string;
	segmentId: string;
	anchorId: string;
	position: [number, number, number];
};

/**
 * Project every compiled interior-anchor query point to its room's floor
 * elevation (the umbrella's "authored anchor point projected at room floor /
 * editor helper height"). Source is `geometry.queries.points` filtered to
 * `kind === 'interior-anchor'` — the compiler emits those only for auto-bezier
 * segments, so non-bezier walls never produce helpers and identity is
 * qualified, never coordinate-guessed.
 */
export function layoutAnchorHelperPlacements(
	geometry: CompiledLayoutGeometry
): LayoutAnchorHelperPlacement[] {
	const elevationByRoom = new Map<string, number>(
		geometry.rooms.map((room) => [room.roomId, room.floorElevation])
	);
	const placements: LayoutAnchorHelperPlacement[] = [];
	for (const point of geometry.queries.points) {
		if (point.kind !== 'interior-anchor') continue;
		placements.push({
			roomId: point.roomId,
			segmentId: point.segmentId,
			anchorId: point.sourceId,
			position: [point.point[0], elevationByRoom.get(point.roomId) ?? 0, point.point[1]]
		});
	}
	return placements;
}

// =====================================================================
// H1 S6 — centralized 3D layout selection (pure resolution + candidate
// extraction). The S6 coordinator reuses the S5 `layout3dPickIndexByRoom`
// cache: raycast hits become `Layout3dHitCandidate`s structurally (no `three`
// import — `RaycastHitLike` is a local shape) and `resolveLayout3dHits`
// arbitrates nearest-visible + same-depth semantic priority into the existing
// `LayoutSelection` union. Keep this module renderer-neutral: the purity test
// above covers everything below automatically.
// =====================================================================

/**
 * Same-depth noise band in meters. Not a tie-breaker *toward* layout: at
 * `|Δd| ≤ ε` the cross-domain comparator hands the click to the visible
 * content, never the background surface. Within the layout candidate set the
 * band defines the semantic tie group (anchor → opening → object → wall →
 * room). 1e-4 is measured: coincident faces raycast ~1e-15 apart while the
 * nearest genuinely distinct geometry (anchor helper +2 cm, wall thickness
 * 0.2 m) sits 4+ orders of magnitude outside it.
 */
export const LAYOUT_3D_SAME_DEPTH_EPSILON = 1e-4;

/** Umbrella contract, exact shape (see the H1 umbrella plan). */
export type Layout3dHitCandidate =
	| { kind: 'object'; objectId: string; distance: number }
	| { kind: 'anchor'; roomId: string; segmentId: string; anchorId: string; distance: number }
	| { kind: 'wall-triangle'; roomId: string; triangleIndex: number; distance: number }
	| { kind: 'room-surface'; roomId: string; surface: 'floor' | 'ceiling'; distance: number };

/** A resolved layout selection paired with its winning ray distance (cross-domain arbitration needs both). */
export type Layout3dResolvedHit = {
	selection: LayoutSelection;
	distance: number;
};

/** Structural intersection object: only the fields the coordinator reads. */
export type RaycastHitObjectLike = {
	userData: unknown;
	parent: RaycastHitObjectLike | null;
};

/** Structural intersection shape — never `three.Intersection`, so purity holds. */
export type RaycastHitLike = {
	object: RaycastHitObjectLike;
	distance: number;
	faceIndex?: number | null;
};

type RaycastHitUserData = Record<string, unknown>;

function hitUserData(object: RaycastHitObjectLike): RaycastHitUserData {
	const data = object.userData;
	return data && typeof data === 'object' ? (data as RaycastHitUserData) : {};
}

/** Climb the parent chain for the first node whose `userData` satisfies `match`. */
function climbHitUserData(
	object: RaycastHitObjectLike,
	match: (data: RaycastHitUserData) => boolean
): RaycastHitUserData | null {
	let current: RaycastHitObjectLike | null = object;
	while (current) {
		const data = hitUserData(current);
		if (match(data)) return data;
		current = current.parent;
	}
	return null;
}

/**
 * Convert raw raycast intersections into layout pick candidates. Reads only
 * authored `userData` (surfaceType / editorEntity walk-up), `distance`, and
 * `faceIndex` — never names or coordinate guessing. Everything else (scene
 * entities, camera helpers, grid, lights, the highlight shell, placement
 * ghost) yields no candidate and stays with the scene/camera flow.
 */
export function layoutCandidatesFromIntersections(
	intersections: readonly RaycastHitLike[]
): Layout3dHitCandidate[] {
	const candidates: Layout3dHitCandidate[] = [];
	for (const intersection of intersections) {
		const own = hitUserData(intersection.object);
		const surfaceType = own.surfaceType;
		const roomId = own.roomId;

		// Wall mesh: object-level authored identity (S6 tag). Three's
		// `Mesh.raycast` reports `faceIndex` as the triangle number of the
		// indexed buffer — the S5 index key — so it is copied as-is, never
		// divided.
		if (surfaceType === 'wall' && typeof roomId === 'string') {
			if (typeof intersection.faceIndex === 'number') {
				candidates.push({
					kind: 'wall-triangle',
					roomId,
					triangleIndex: intersection.faceIndex,
					distance: intersection.distance
				});
			}
			continue;
		}

		// Floor/ceiling surfaces → room selection.
		if (
			(surfaceType === 'floor' || surfaceType === 'ceiling') &&
			typeof roomId === 'string'
		) {
			candidates.push({
				kind: 'room-surface',
				roomId,
				surface: surfaceType,
				distance: intersection.distance
			});
			continue;
		}

		// Interior-anchor helper: identity lives on the parent group.
		const anchorData = climbHitUserData(
			intersection.object,
			(data) => data.editorEntity === 'layout-anchor'
		);
		if (
			anchorData &&
			typeof anchorData.roomId === 'string' &&
			typeof anchorData.segmentId === 'string' &&
			typeof anchorData.anchorId === 'string'
		) {
			candidates.push({
				kind: 'anchor',
				roomId: anchorData.roomId,
				segmentId: anchorData.segmentId,
				anchorId: anchorData.anchorId,
				distance: intersection.distance
			});
			continue;
		}

		// Layout object: identity lives on the parent group.
		const objectData = climbHitUserData(
			intersection.object,
			(data) => data.editorEntity === 'layout-object'
		);
		if (objectData && typeof objectData.layoutObjectId === 'string') {
			candidates.push({
				kind: 'object',
				objectId: objectData.layoutObjectId,
				distance: intersection.distance
			});
		}
	}
	return candidates;
}

/** Semantic priority for same-depth ties (lower wins): anchor → opening → object → wall → room. */
function layoutSelectionPriority(selection: LayoutSelection): number {
	switch (selection.kind) {
		case 'interiorAnchor':
			return 0;
		case 'opening':
			return 1;
		case 'object':
			return 2;
		case 'wall':
			return 3;
		case 'room':
			return 4;
		case 'none':
			return 5;
	}
}

/** Map one candidate to a `LayoutSelection`, dropping unresolvable wall-triangles. */
function resolveLayout3dCandidate(
	pickIndices: ReadonlyMap<string, Layout3dPickIndex>,
	hit: Layout3dHitCandidate
): LayoutSelection | null {
	switch (hit.kind) {
		case 'object':
			return { kind: 'object', objectId: hit.objectId };
		case 'anchor':
			return {
				kind: 'interiorAnchor',
				roomId: hit.roomId,
				segmentId: hit.segmentId,
				anchorId: hit.anchorId
			};
		case 'room-surface':
			return { kind: 'room', roomId: hit.roomId };
		case 'wall-triangle': {
			const resolve = pickIndices.get(hit.roomId);
			const ref = resolve?.(hit.triangleIndex);
			if (!ref) return null; // out-of-range / unknown room → dropped, never promoted
			if (ref.kind === 'opening') {
				return {
					kind: 'opening',
					roomId: ref.roomId,
					segmentId: ref.segmentId,
					openingId: ref.openingId
				};
			}
			return { kind: 'wall', roomId: ref.roomId, segmentId: ref.segmentId };
		}
	}
}

/**
 * Resolve layout candidates into the winning `{ selection, distance }`:
 * nearest-visible wins; within `LAYOUT_3D_SAME_DEPTH_EPSILON` the semantic
 * priority anchor → opening → object → wall → room applies, then stable input
 * order. `null` = no layout selection (background or scene/camera).
 */
export function resolveLayout3dHits(
	pickIndices: ReadonlyMap<string, Layout3dPickIndex>,
	hits: readonly Layout3dHitCandidate[]
): Layout3dResolvedHit | null {
	const resolved: Layout3dResolvedHit[] = [];
	for (const hit of hits) {
		const selection = resolveLayout3dCandidate(pickIndices, hit);
		if (selection) resolved.push({ selection, distance: hit.distance });
	}
	if (resolved.length === 0) return null;

	// Stable ascending sort; equal distances keep input order.
	resolved.sort((a, b) => a.distance - b.distance);
	const nearestDistance = resolved[0]!.distance;
	const tieGroup = resolved.filter(
		(hit) => hit.distance - nearestDistance <= LAYOUT_3D_SAME_DEPTH_EPSILON
	);
	// Stable priority sort: equal priority keeps the distance/input order.
	tieGroup.sort(
		(a, b) => layoutSelectionPriority(a.selection) - layoutSelectionPriority(b.selection)
	);
	return tieGroup[0]!;
}

/**
 * Cross-domain nearest-visible yield rule (pure, shared by the S6 handler and
 * its tests). The layout selection wins only when there is no actionable
 * scene/camera hit (`sceneDistance === null`) or the layout hit is strictly
 * nearer by more than the same-depth epsilon. At `|Δd| ≤ ε` the visible
 * content wins — never the background surface (the epsilon is a noise band,
 * not a tie-breaker toward layout).
 */
export function layoutPickBeatsSceneDistance(
	layoutDistance: number,
	sceneDistance: number | null
): boolean {
	if (sceneDistance === null) return true;
	return layoutDistance < sceneDistance - LAYOUT_3D_SAME_DEPTH_EPSILON;
}

/**
 * H1 S6 deferral (2026-08-16) — direct 3D picks of walls / interior anchors
 * are deferred by decision: a viewport click must not commit them yet, while
 * hierarchy (tree) picks of the same identities stay live and highlight.
 * The resolver still maps wall triangles (the machinery is untouched); this
 * predicate lets the coordinator fall through to the normal scene dispatch
 * instead of committing a wall/anchor selection. Rooms, openings, objects,
 * and `none` remain directly pickable. S6.1 re-enables by flipping this gate.
 */
export function isLayoutDirectPickDeferred(selection: LayoutSelection): boolean {
	return selection.kind === 'wall' || selection.kind === 'interiorAnchor';
}

/**
 * Stable identity key for a resolved layout selection. The hover coordinator
 * re-resolves every pointer move, but the tint overlay must only rebuild when
 * the *identity* under the cursor changes — moving within one wall must not
 * reallocate shell geometry each frame. `null` (no hover) keys to ''.
 */
export function layoutSelectionKey(selection: LayoutSelection | null): string {
	if (!selection) return '';
	switch (selection.kind) {
		case 'none':
			return 'none';
		case 'room':
			return `room:${selection.roomId}`;
		case 'wall':
			return `wall:${selection.roomId}:${selection.segmentId}`;
		case 'opening':
			return `opening:${selection.roomId}:${selection.segmentId}:${selection.openingId}`;
		case 'interiorAnchor':
			return `anchor:${selection.roomId}:${selection.segmentId}:${selection.anchorId}`;
		case 'object':
			return `object:${selection.objectId}`;
	}
}
