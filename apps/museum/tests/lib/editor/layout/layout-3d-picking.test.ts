import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { buildRoomWallMesh, type IndexedWallMesh, type Layout3dPickRange } from '$lib/layout/wall-mesh-builder';
import {
	buildLayout3dTriangleIndex,
	layoutAnchorHelperPlacements,
	resolveLayout3dHits,
	type Layout3dHitCandidate,
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

describe('H1 S6 — resolveLayout3dHits', () => {
	function indexMap(mesh: IndexedWallMesh): ReadonlyMap<string, Layout3dPickIndex> {
		return new Map([[mesh.roomId, buildLayout3dTriangleIndex(mesh)]]);
	}

	/** First triangle index of the first pick range matching the predicate. */
	function firstTriangleOf(
		mesh: IndexedWallMesh,
		predicate: (range: Layout3dPickRange) => boolean
	): number {
		const range = mesh.pickRanges.find(predicate);
		if (!range) throw new Error('fixture has no matching pick range');
		return range.start / 3;
	}

	const wallHit = (mesh: IndexedWallMesh, triangleIndex: number, distance: number): Layout3dHitCandidate => ({
		kind: 'wall-triangle',
		roomId: mesh.roomId,
		triangleIndex,
		distance
	});

	const objectHit = (objectId: string, distance: number): Layout3dHitCandidate => ({
		kind: 'object',
		objectId,
		distance
	});

	const anchorHit = (
		roomId: string,
		segmentId: string,
		anchorId: string,
		distance: number
	): Layout3dHitCandidate => ({ kind: 'anchor', roomId, segmentId, anchorId, distance });

	const roomHit = (
		roomId: string,
		surface: 'floor' | 'ceiling',
		distance: number
	): Layout3dHitCandidate => ({ kind: 'room-surface', roomId, surface, distance });

	it('nearest-visible wins: a near wall beats a far object and a near object beats a far wall', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const indices = indexMap(mesh);
		const wallTriangle = firstTriangleOf(mesh, (range) => range.kind === 'wall');

		expect(
			resolveLayout3dHits(indices, [wallHit(mesh, wallTriangle, 2), objectHit('obj', 3)])
		).toMatchObject({ selection: { kind: 'wall' }, distance: 2 });

		expect(
			resolveLayout3dHits(indices, [objectHit('obj', 2), wallHit(mesh, wallTriangle, 3)])
		).toEqual({ selection: { kind: 'object', objectId: 'obj' }, distance: 2 });
	});

	it('same-depth priority is anchor → opening → object → wall → room, both input orders', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const indices = indexMap(mesh);
		const openingTriangle = firstTriangleOf(mesh, (range) => range.kind === 'opening');
		const wallTriangle = firstTriangleOf(mesh, (range) => range.kind === 'wall');

		const anchor = anchorHit('room-openings', 'room-openings:wall:0', 'anchor:1', 2);
		const opening = wallHit(mesh, openingTriangle, 2);
		const object = objectHit('obj', 2);
		const wall = wallHit(mesh, wallTriangle, 2);
		const room = roomHit('room-openings', 'floor', 2);

		const ordered: Layout3dHitCandidate[] = [room, wall, object, opening, anchor];
		const reversed: Layout3dHitCandidate[] = [anchor, opening, object, wall, room];
		for (const hits of [ordered, reversed]) {
			expect(resolveLayout3dHits(indices, hits)).toEqual({
				selection: {
					kind: 'interiorAnchor',
					roomId: 'room-openings',
					segmentId: 'room-openings:wall:0',
					anchorId: 'anchor:1'
				},
				distance: 2
			});
		}

		// Pairwise spot checks of the ordering.
		expect(resolveLayout3dHits(indices, [wall, opening])?.selection.kind).toBe('opening');
		expect(resolveLayout3dHits(indices, [room, object])?.selection.kind).toBe('object');
		expect(resolveLayout3dHits(indices, [room, wall])?.selection.kind).toBe('wall');
		expect(resolveLayout3dHits(indices, [wall, object])?.selection.kind).toBe('object');
	});

	it('a Δd > eps pair is decided by distance, not semantic priority', () => {
		const indices = new Map<string, Layout3dPickIndex>();
		// A distant anchor (highest priority) loses to a nearer room (lowest).
		expect(
			resolveLayout3dHits(indices, [
				roomHit('r1', 'floor', 2),
				anchorHit('r1', 'r1:wall:0', 'anchor:1', 2.1)
			])
		).toEqual({ selection: { kind: 'room', roomId: 'r1' }, distance: 2 });
	});

	it('maps wall side/lintel/bridge triangles to wall selections and opening surfaces to opening selections', () => {
		const mesh = buildMesh(g1ProfileMatrixDocument());
		const indices = indexMap(mesh);
		const resolve = buildLayout3dTriangleIndex(mesh);

		// Wall surfaces: `side` here (the profile matrix's lintels are all
		// opening-owned); `bridge` is covered by the dedicated bridge test below.
		for (const surface of ['side'] as const) {
			const triangle = firstTriangleOf(
				mesh,
				(range) => range.kind === 'wall' && range.surface === surface
			);
			const ref = resolve(triangle)!;
			expect(ref.kind).toBe('wall');
			expect(resolveLayout3dHits(indices, [wallHit(mesh, triangle, 1)])).toEqual({
				selection: { kind: 'wall', roomId: ref.roomId, segmentId: ref.segmentId },
				distance: 1
			});
		}

		for (const surface of ['jamb', 'sill', 'lintel', 'arch-reveal'] as const) {
			const triangle = firstTriangleOf(
				mesh,
				(range) => range.kind === 'opening' && range.surface === surface
			);
			const ref = resolve(triangle)!;
			if (ref.kind !== 'opening') throw new Error(`expected opening ref, got ${ref.kind}`);
			expect(resolveLayout3dHits(indices, [wallHit(mesh, triangle, 1)])).toEqual({
				selection: {
					kind: 'opening',
					roomId: ref.roomId,
					segmentId: ref.segmentId,
					openingId: ref.openingId
				},
				distance: 1
			});
		}
	});

	it('keeps bridge triangles owned by the current wall (bridge → wall, never the neighbor)', () => {
		const mesh = buildMesh(g1LineRectangleDocument(), { miterLimit: 1 });
		const indices = indexMap(mesh);
		const resolve = buildLayout3dTriangleIndex(mesh);
		const triangle = firstTriangleOf(
			mesh,
			(range) => range.kind === 'wall' && range.surface === 'bridge'
		);
		const ref = resolve(triangle)!;
		expect(ref).toMatchObject({ kind: 'wall', surface: 'bridge' });
		expect(resolveLayout3dHits(indices, [wallHit(mesh, triangle, 1)])).toEqual({
			selection: { kind: 'wall', roomId: ref.roomId, segmentId: ref.segmentId },
			distance: 1
		});
	});

	it('resolves floor and ceiling candidates to the room selection', () => {
		const indices = new Map<string, Layout3dPickIndex>();
		expect(
			resolveLayout3dHits(indices, [roomHit('r1', 'floor', 1)])
		).toEqual({ selection: { kind: 'room', roomId: 'r1' }, distance: 1 });
		expect(
			resolveLayout3dHits(indices, [roomHit('r1', 'ceiling', 2)])
		).toEqual({ selection: { kind: 'room', roomId: 'r1' }, distance: 2 });
	});

	it('drops unresolvable wall-triangles instead of promoting them', () => {
		const mesh = buildMesh(g1MultipleOpeningsDocument());
		const indices = indexMap(mesh);
		const triangleCount = mesh.indices.length / 3;

		expect(resolveLayout3dHits(indices, [wallHit(mesh, triangleCount, 1)])).toBeNull();
		expect(resolveLayout3dHits(indices, [wallHit(mesh, -1, 1)])).toBeNull();
		expect(
			resolveLayout3dHits(indices, [
				{ kind: 'wall-triangle', roomId: 'unknown', triangleIndex: 0, distance: 1 }
			])
		).toBeNull();

		// An unresolvable near hit never shadows a farther valid candidate.
		expect(
			resolveLayout3dHits(indices, [
				wallHit(mesh, triangleCount, 0.5),
				objectHit('obj', 2)
			])
		).toEqual({ selection: { kind: 'object', objectId: 'obj' }, distance: 2 });
	});

	it('resolves equal-priority equal-depth ties by stable input order, deterministically', () => {
		const indices = new Map<string, Layout3dPickIndex>();
		const first = objectHit('obj-a', 2);
		const second = objectHit('obj-b', 2);

		const resolved = resolveLayout3dHits(indices, [first, second]);
		expect(resolved).toEqual({ selection: { kind: 'object', objectId: 'obj-a' }, distance: 2 });
		// Repeated calls agree, and input order is the tie-breaker.
		expect(resolveLayout3dHits(indices, [first, second])).toEqual(resolved);
		expect(resolveLayout3dHits(indices, [second, first])).toEqual({
			selection: { kind: 'object', objectId: 'obj-b' },
			distance: 2
		});
	});
});
