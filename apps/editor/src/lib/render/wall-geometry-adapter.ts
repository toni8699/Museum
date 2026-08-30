import { BufferAttribute, BufferGeometry, Float32BufferAttribute, type Material } from 'three';
import type { IndexedWallMesh, WallMeshSurfaceKey } from '$lib/layout/wall-mesh-builder';

/**
 * A material the adapter holds for one surface class. `material` is used as-is
 * (never disposed by the adapter); `release` is a factory-provided lease the
 * adapter invokes exactly once on disposal, for ref-counted/acquired variants
 * such as `acquireMaterialVariant`. Factories that allocate their own throwaway
 * material may omit `release` and free it themselves, or return a `release` that
 * disposes it — the adapter never calls `material.dispose()`.
 */
export type ResolvedWallMaterial = {
	material: Material;
	release?: () => void;
};

export type WallMeshMaterialFactory = (
	surfaceKey: WallMeshSurfaceKey,
	mesh: IndexedWallMesh
) => ResolvedWallMaterial;

export type WallBufferGeometry = {
	/** One `addGroup` per `IndexedWallMesh.materialGroup`, materialIndex in index order. */
	geometry: BufferGeometry;
	/** Parallel to `geometry.groups` — one resolved material per surface class. */
	materials: Material[];
	/** Disposes the geometry and invokes each factory `release()` exactly once. Idempotent. */
	dispose: () => void;
};

/**
 * Wrap an `IndexedWallMesh` into a renderable `THREE.BufferGeometry`. The
 * builder's `materialGroups` are index-space, surface-major ranges, so each
 * becomes one `addGroup` entry and one material — draw calls collapse to
 * distinct surface classes, not section count. `sectionToRange`/`wallRanges`
 * are carried on `geometry.userData` for future picking; they are metadata and
 * never create geometry groups.
 */
export function toWallBufferGeometry(mesh: IndexedWallMesh, resolve: WallMeshMaterialFactory): WallBufferGeometry {
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3));
	geometry.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3));
	geometry.setAttribute('uv', new Float32BufferAttribute(mesh.uvs, 2));
	geometry.setIndex(new BufferAttribute(mesh.indices, 1));
	geometry.boundingBox = null;
	geometry.boundingSphere = null;
	geometry.userData.sectionToRange = mesh.sectionToRange;
	geometry.userData.wallRanges = mesh.wallRanges;
	geometry.userData.pickRanges = mesh.pickRanges;

	const materials: Material[] = [];
	const releases: Array<() => void> = [];
	for (const [materialIndex, group] of mesh.materialGroups.entries()) {
		const resolved = resolve(group.surfaceKey, mesh);
		materials.push(resolved.material);
		if (resolved.release) releases.push(resolved.release);
		geometry.addGroup(group.start, group.count, materialIndex);
	}

	let disposed = false;
	function dispose(): void {
		if (disposed) return;
		disposed = true;
		geometry.dispose();
		for (const release of releases) release();
	}

	return { geometry, materials, dispose };
}

/** One index-space range: triangles to shell or address as a unit. */
export type WallMeshIndexRange = { start: number; count: number };

/**
 * All index ranges belonging to one wall `segmentId`. A wall spans many
 * sections (side + sill + lintel), so this is a range *set*, not one range.
 */
export function matchWallRanges(mesh: IndexedWallMesh, segmentId: string): WallMeshIndexRange[] {
	return mesh.wallRanges.find((wall) => wall.segmentId === segmentId)?.ranges ?? [];
}

/**
 * All index ranges belonging to one `openingId` — sill (side) + lintel
 * sections. `sectionToRange` carries `openingId` on those sections.
 */
export function matchOpeningRanges(mesh: IndexedWallMesh, openingId: string): WallMeshIndexRange[] {
	return mesh.sectionToRange
		.filter((section) => section.openingId === openingId)
		.map((section) => ({ start: section.start, count: section.count }));
}

/**
 * Build a thin, translucent highlight shell over the given index ranges: the
 * same indexed topology as the base mesh, but every vertex offset outward along
 * its normal by `shellOffset` so it sits just proud of the wall without
 * z-fighting. The returned geometry owns its typed arrays (dispose it on
 * selection change, clear, and unmount); it shares no buffers with the base
 * mesh, so the base mesh stays immutable during selection.
 */
export function buildWallHighlightMesh(
	mesh: IndexedWallMesh,
	ranges: readonly WallMeshIndexRange[],
	shellOffset = 0.02
): BufferGeometry {
	const indices: number[] = [];
	for (const range of ranges) {
		for (let i = range.start; i < range.start + range.count; i += 1) indices.push(mesh.indices[i]!);
	}

	const vertexCount = mesh.positions.length / 3;
	const positions = new Float32Array(mesh.positions.length);
	for (let v = 0; v < vertexCount; v += 1) {
		positions[v * 3] = mesh.positions[v * 3]! + mesh.normals[v * 3]! * shellOffset;
		positions[v * 3 + 1] = mesh.positions[v * 3 + 1]! + mesh.normals[v * 3 + 1]! * shellOffset;
		positions[v * 3 + 2] = mesh.positions[v * 3 + 2]! + mesh.normals[v * 3 + 2]! * shellOffset;
	}

	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3));
	geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
	geometry.boundingBox = null;
	geometry.boundingSphere = null;
	return geometry;
}
