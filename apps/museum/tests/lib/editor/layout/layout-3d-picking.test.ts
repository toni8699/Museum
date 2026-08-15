import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { buildRoomWallMesh, type IndexedWallMesh, type Layout3dPickRange } from '$lib/layout/wall-mesh-builder';
import {
	buildLayout3dTriangleIndex,
	layoutAnchorHelperPlacements,
	type Layout3dPickIndex
} from '$lib/editor/layout/layout-3d-picking';
import {
	g1AutoBezierDocument,
	g1DocumentWithRooms,
	g1LShapedDocument,
	g1LineRectangleDocument,
	g1MultipleOpeningsDocument,
	g1Opening,
	g1ProfileMatrixDocument,
	g1RectangleRoom
} from '../../layout/__fixtures__/layout-g1-fixtures';
import type { CompiledRoom } from '$lib/layout/layout-geometry-types';
import type { LayoutDocument } from '$lib/layout/layout-types';

function compileRoom(document: LayoutDocument): CompiledRoom {
	const room = compileLayoutGeometry(document).geometry.rooms[0];
	if (!room) throw new Error('fixture compiled to no room');
	return room;
}

function buildMesh(document: LayoutDocument, options: { miterLimit?: number } = {}): IndexedWallMesh {
	const result = buildRoomWallMesh(compileRoom(document), { assertWinding: true, ...options });
	if (!result.mesh) throw new Error(`builder rejected fixture: ${result.issues.map((issue) => issue.code).join(', ')}`);
	return result.mesh;
}

/** Assert pickRanges is a sorted, non-overlapping, complete partition of the index buffer. */
function assertPickPartition(mesh: IndexedWallMesh): void {
	expect(mesh.pickRanges.length).toBeGreaterThan(0);
	let cursor = 0;
	for (const range of mesh.pickRanges) {
		expect(range.start).toBe(cursor);
		expect(range.count).toBeGreaterThan(0);
		expect(range.count % 3).toBe(0);
		cursor += range.count;
	}
	expect(cursor).toBe(mesh.indices.length);
	for (let i = 1; i < mesh.pickRanges.length; i += 1) {
		expect(mesh.pickRanges[i]!.start).toBeGreaterThan(mesh.pickRanges[i - 1]!.start);
	}
}

/** Every triangle resolves to exactly one non-null owner; out-of-range → null. */
function assertEveryTriangleResolves(mesh: IndexedWallMesh, resolve: Layout3dPickIndex): void {
	const triangleCount = mesh.indices.length / 3;
	for (let t = 0; t < triangleCount; t += 1) {
		expect(resolve(t), `triangle ${t}`).not.toBeNull();
	}
	expect(resolve(-1)).toBeNull();
	expect(resolve(triangleCount)).toBeNull();
}

const PARTITION_FIXTURES: Array<[string, LayoutDocument, { miterLimit?: number }?]> = [
	['plain rectangle', g1LineRectangleDocument()],
	['l-shape', g1LShapedDocument()],
	['opening matrix', g1MultipleOpeningsDocument()],
	['profile matrix', g1ProfileMatrixDocument()],
	['forced-bevel rectangle', g1LineRectangleDocument(), { miterLimit: 1 }],
	['both-open miter (profile difference)', g1DocumentWithRooms([
		g1RectangleRoom('room-mm', 0, 0, 6, 4, [
			g1Opening('door-a', 'room-mm:wall:0', 'door', 5.1, 0.9, 2.1, 0),
			g1Opening('door-b', 'room-mm:wall:1', 'door', 0, 0.9, 2.4, 0)
		])
	])],
	['arched corner opening', g1DocumentWithRooms([
		g1RectangleRoom('room-arch', 0, 0, 6, 4, [
			g1Opening('arch-0', 'room-arch:wall:0', 'door', 0, 1.4, 2.4, 0, 'rounded')
		])
	])]
];

describe('buildLayout3dTriangleIndex', () => {
	it('resolves every triangle to exactly one non-null pick owner across every fixture', () => {
		for (const [name, document, options] of PARTITION_FIXTURES) {
			const mesh = buildMesh(document, options);
			assertPickPartition(mesh);
			assertEveryTriangleResolves(mesh, buildLayout3dTriangleIndex(mesh));
			expect(mesh.roomId, name).toBe(mesh.pickRanges[0]!.roomId);
		}
	});

	it('merges disjoint runs of the same pick owner into one dense ref table entry', () => {
		// A lintel section emits alternating 'lintel' band/top and 'arch-reveal'
		// underside runs per clip interval. They are distinct pickRanges entries
		// but must dedupe to the same table ref.
		const mesh = buildMesh(g1ProfileMatrixDocument());
		const resolve = buildLayout3dTriangleIndex(mesh);
		const archReveals = mesh.pickRanges.filter(
			(range) => range.kind === 'opening' && range.surface === 'arch-reveal' && range.openingId === 'rounded'
		);
		expect(archReveals.length).toBeGreaterThan(1);
		const resolved = archReveals.map((range) => resolve(range.start / 3));
		for (const ref of resolved.slice(1)) {
			expect(ref).toEqual(resolved[0]);
		}
	});

	it('throws on a gapped partition (development guard)', () => {
		const mesh = buildMesh(g1LineRectangleDocument());
		const withGap: IndexedWallMesh = {
			...mesh,
			pickRanges: mesh.pickRanges.filter((_, index) => index !== Math.floor(mesh.pickRanges.length / 2))
		};
		expect(() => buildLayout3dTriangleIndex(withGap)).toThrow(/gap or overlap/);
	});

	it('throws on an overlapping partition', () => {
		const mesh = buildMesh(g1LineRectangleDocument());
		const first = mesh.pickRanges[0]!;
		const overlapped: Layout3dPickRange = { ...first, start: first.start + 3, count: first.count - 3 };
		const withOverlap: IndexedWallMesh = { ...mesh, pickRanges: [overlapped, ...mesh.pickRanges.slice(1)] };
		expect(() => buildLayout3dTriangleIndex(withOverlap)).toThrow(/gap or overlap/);
	});

	it('throws when pickRanges leave triangles uncovered', () => {
		const mesh = buildMesh(g1LineRectangleDocument());
		const last = mesh.pickRanges.at(-1)!;
		const truncated: IndexedWallMesh = {
			...mesh,
			pickRanges: [...mesh.pickRanges.slice(0, -1), { ...last, count: last.count - 3 }]
		};
		expect(() => buildLayout3dTriangleIndex(truncated)).toThrow(/cover/);
	});

	it('throws on a range that is not triangle-aligned', () => {
		const mesh = buildMesh(g1LineRectangleDocument());
		const misaligned: IndexedWallMesh = {
			...mesh,
			pickRanges: [{ ...mesh.pickRanges[0]!, count: mesh.pickRanges[0]!.count - 1 }]
		};
		expect(() => buildLayout3dTriangleIndex(misaligned)).toThrow(/triangle-aligned/);
	});

	it('throws on a non-triangle-aligned index buffer', () => {
		const mesh = buildMesh(g1LineRectangleDocument());
		const broken: IndexedWallMesh = { ...mesh, indices: mesh.indices.slice(0, -1) };
		expect(() => buildLayout3dTriangleIndex(broken)).toThrow(/multiple of 3/);
	});
});

describe('layoutAnchorHelperPlacements', () => {
	it('lifts auto-bezier interior anchors to the owning room floor elevation with qualified identity', () => {
		const { geometry } = compileLayoutGeometry(g1AutoBezierDocument());
		const placements = layoutAnchorHelperPlacements(geometry);
		expect(placements).toHaveLength(1);
		expect(placements[0]).toEqual({
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			anchorId: 'room-rectangle:wall:0:anchor:1',
			position: [3, 0, -1]
		});
	});

	it('projects anchors at the room floor elevation, not world origin', () => {
		const document = g1AutoBezierDocument();
		document.floors[0]!.elevation = 2.5;
		const { geometry } = compileLayoutGeometry(document);
		const placements = layoutAnchorHelperPlacements(geometry);
		expect(placements).toHaveLength(1);
		expect(placements[0]!.position).toEqual([3, 2.5, -1]);
	});

	it('never emits helpers for non-auto-bezier walls (compiler only records interior-anchor for beziers)', () => {
		const { geometry } = compileLayoutGeometry(g1LineRectangleDocument());
		expect(layoutAnchorHelperPlacements(geometry)).toEqual([]);
	});
});

describe('layout-3d-picking purity', () => {
	it('imports no Three, Svelte, DOM, or $app/$lib/museum modules', () => {
		const source = readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '../../../../src/lib/editor/layout/layout-3d-picking.ts'),
			'utf8'
		);
		expect(source).not.toMatch(/from\s+['\"](three|svelte|@threlte|\$app)['\"]/);
		expect(source).not.toMatch(/\$lib\/museum|\$lib\/editor\/(?!layout)|\bdocument\.|\bwindow\./);
	});

	it('is reachable without importing renderer modules', () => {
		// The pure module builds a working index from a builder mesh — a smoke
		// that its import graph stays within $lib/layout + itself.
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const resolve = buildLayout3dTriangleIndex(mesh);
		expect(resolve(0)).not.toBeNull();
	});
});
