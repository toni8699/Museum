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
