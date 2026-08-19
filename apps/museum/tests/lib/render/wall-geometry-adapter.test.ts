import { describe, expect, it, vi } from 'vitest';
import { MeshBasicMaterial, type Material } from 'three';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { buildRoomWallMesh, type IndexedWallMesh } from '$lib/layout/wall-mesh-builder';
import {
	buildWallHighlightMesh,
	matchOpeningRanges,
	matchWallRanges,
	toWallBufferGeometry,
	type WallMeshMaterialFactory
} from '$lib/render/wall-geometry-adapter';
import { g1LineRectangleDocument, g1MultipleOpeningsDocument } from '../layout/__fixtures__/layout-g1-fixtures';

function buildMesh(document: ReturnType<typeof g1LineRectangleDocument>): IndexedWallMesh {
	const room = compileLayoutGeometry(document).geometry.rooms[0];
	if (!room) throw new Error('fixture compiled to no room');
	const result = buildRoomWallMesh(room);
	if (!result.mesh) throw new Error(`builder rejected fixture: ${result.issues.map((issue) => issue.code).join(', ')}`);
	return result.mesh;
}

function recordingFactory(): {
	factory: WallMeshMaterialFactory;
	calls: Array<{ surfaceKey: string }>;
} {
	const calls: Array<{ surfaceKey: string }> = [];
	const factory: WallMeshMaterialFactory = (surfaceKey) => {
		calls.push({ surfaceKey });
		return { material: new MeshBasicMaterial() };
	};
	return { factory, calls };
}

describe('toWallBufferGeometry', () => {
	it('maps positions/normals/uvs/indices into BufferGeometry attributes', () => {
		const mesh = buildMesh(g1LineRectangleDocument());
		const { geometry } = toWallBufferGeometry(mesh, () => ({ material: new MeshBasicMaterial() }));

		expect(geometry.getAttribute('position').count).toBe(mesh.positions.length / 3);
		expect(geometry.getAttribute('normal').count).toBe(mesh.normals.length / 3);
		expect(geometry.getAttribute('uv').count).toBe(mesh.uvs.length / 2);
		expect(geometry.getIndex()!.count).toBe(mesh.indices.length);
	});

	it('creates one group per materialGroup with index-space ranges', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const { geometry, materials } = toWallBufferGeometry(mesh, () => ({ material: new MeshBasicMaterial() }));

		expect(geometry.groups.length).toBe(mesh.materialGroups.length);
		expect(materials.length).toBe(mesh.materialGroups.length);
		geometry.groups.forEach((group, index) => {
			const source = mesh.materialGroups[index]!;
			expect(group.start).toBe(source.start);
			expect(group.count).toBe(source.count);
			expect(group.materialIndex).toBe(index);
		});
	});

	it('resolves each surface key once per materialGroup and keeps materials parallel', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const { factory, calls } = recordingFactory();
		const { materials } = toWallBufferGeometry(mesh, factory);

		expect(calls.map((call) => call.surfaceKey)).toEqual(mesh.materialGroups.map((group) => group.surfaceKey));
		expect(materials.length).toBe(mesh.materialGroups.length);
	});

	it('carries sectionToRange on geometry.userData for picking', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const { geometry } = toWallBufferGeometry(mesh, () => ({ material: new MeshBasicMaterial() }));
		expect(geometry.userData.sectionToRange).toBe(mesh.sectionToRange);
		expect(geometry.userData.wallRanges).toBe(mesh.wallRanges);
	});

	it('carries pickRanges on userData and never adds geometry groups', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const { geometry } = toWallBufferGeometry(mesh, () => ({ material: new MeshBasicMaterial() }));

		expect(geometry.userData.pickRanges).toBe(mesh.pickRanges);
		// pickRanges is additive metadata: the draw-call structure is untouched.
		expect(geometry.groups.length).toBe(mesh.materialGroups.length);
		expect(mesh.pickRanges.length).toBeGreaterThan(0);
	});

	it('dispose releases each material once, is idempotent, and never disposes materials', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const releases: Array<ReturnType<typeof vi.fn>> = [];
		const materials: Material[] = [];
		const factory: WallMeshMaterialFactory = () => {
			const material = new MeshBasicMaterial();
			materials.push(material);
			const release = vi.fn(() => undefined);
			releases.push(release);
			return { material, release };
		};

		const { dispose } = toWallBufferGeometry(mesh, factory);
		const releaseCount = mesh.materialGroups.length;
		expect(releases.length).toBe(releaseCount);

		dispose();
		for (const release of releases) expect(release).toHaveBeenCalledTimes(1);

		// Idempotent: a second dispose does not re-invoke any release.
		dispose();
		for (const release of releases) expect(release).toHaveBeenCalledTimes(1);

		// The adapter never disposes the factory's materials (shared caches stay alive).
		for (const material of materials) {
			const disposeSpy = vi.spyOn(material, 'dispose');
			expect(disposeSpy).not.toHaveBeenCalled();
		}
	});

	it('omits release calls for factories that return no lease', () => {
		const mesh = buildMesh(g1LineRectangleDocument());
		const { dispose } = toWallBufferGeometry(mesh, () => ({ material: new MeshBasicMaterial() }));
		expect(() => dispose()).not.toThrow();
	});
});

describe('selection range overlays', () => {
	it('matchWallRanges returns the full range set for a segment and nothing for unknown ids', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const wallWithOpenings = mesh.wallRanges.find((wall) => wall.ranges.length > 1)!;
		const ranges = matchWallRanges(mesh, wallWithOpenings.segmentId);
		expect(ranges).toEqual(wallWithOpenings.ranges);
		expect(ranges.length).toBeGreaterThan(1);
		expect(matchWallRanges(mesh, 'unknown:segment')).toEqual([]);
	});

	it('matchOpeningRanges returns the sill + lintel ranges for one opening', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const lintelRef = mesh.sectionToRange.find((section) => section.kind === 'lintel' && section.openingId)!;
		const ranges = matchOpeningRanges(mesh, lintelRef.openingId!);
		expect(ranges.length).toBeGreaterThan(0);
		expect(ranges.every((range) => range.count > 0)).toBe(true);
		expect(matchOpeningRanges(mesh, 'unknown:opening')).toEqual([]);
	});

	it('buildWallHighlightMesh offsets every vertex along its normal and keeps the matched index set', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const wallWithOpenings = mesh.wallRanges.find((wall) => wall.ranges.length > 1)!;
		const ranges = matchWallRanges(mesh, wallWithOpenings.segmentId);

		const geometry = buildWallHighlightMesh(mesh, ranges, 0.02);
		const expectedIndexCount = ranges.reduce((sum, range) => sum + range.count, 0);
		expect(geometry.getIndex()!.count).toBe(expectedIndexCount);

		const positions = geometry.getAttribute('position').array as Float32Array;
		const firstIndex = mesh.indices[ranges[0]!.start]!;
		expect(positions[firstIndex * 3]!).toBeCloseTo(
			mesh.positions[firstIndex * 3]! + mesh.normals[firstIndex * 3]! * 0.02,
			4
		);
	});
});
