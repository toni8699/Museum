import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { assertWindingAgreesWithNormals, buildRoomWallMesh, type IndexedWallMesh } from '$lib/layout/wall-mesh-builder';
import {
	g1DocumentWithRooms,
	g1LShapedDocument,
	g1LineRectangleDocument,
	g1LineSegments,
	g1MultipleOpeningsDocument,
	g1Opening,
	g1ProfileMatrixDocument,
	g1RectangleRoom
} from './__fixtures__/layout-g1-fixtures';
import type { CompiledRoom, CompiledWall } from '$lib/layout/layout-geometry-types';
import type { CurveSample } from '$lib/layout/layout-geometry-curve';
import type { LayoutVec2 } from '$lib/layout/layout-types';

function compileRoom(document: ReturnType<typeof g1LineRectangleDocument>): CompiledRoom {
	const geometry = compileLayoutGeometry(document).geometry;
	const room = geometry.rooms[0];
	if (!room) throw new Error('fixture compiled to no room');
	return room;
}

/** Assert every geometric edge (by quantized position) is shared by exactly `expected` triangles. */
function assertEdgeMultiplicity(mesh: IndexedWallMesh, expected: number): void {
	const grid = 1e-4;
	const id = new Map<string, number>();
	let next = 0;
	function vid(index: number): number {
		const x = mesh.positions[index * 3]!;
		const y = mesh.positions[index * 3 + 1]!;
		const z = mesh.positions[index * 3 + 2]!;
		const key = `${Math.round(x / grid)},${Math.round(y / grid)},${Math.round(z / grid)}`;
		let value = id.get(key);
		if (value === undefined) {
			value = next++;
			id.set(key, value);
		}
		return value;
	}
	const edges = new Map<string, number>();
	for (let i = 0; i < mesh.indices.length; i += 3) {
		const tri = [vid(mesh.indices[i]!), vid(mesh.indices[i + 1]!), vid(mesh.indices[i + 2]!)];
		for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]] as const) {
			const key = a < b ? `${a},${b}` : `${b},${a}`;
			edges.set(key, (edges.get(key) ?? 0) + 1);
		}
	}
	for (const [key, count] of edges) expect(count, `edge ${key}`).toBe(expected);
}

/** Count every geometric edge (by quantized position) by how many triangles own it. */
function edgeMultiplicityCounts(mesh: IndexedWallMesh): Record<number, number> {
	const grid = 1e-4;
	const id = new Map<string, number>();
	let next = 0;
	function vid(index: number): number {
		const x = mesh.positions[index * 3]!;
		const y = mesh.positions[index * 3 + 1]!;
		const z = mesh.positions[index * 3 + 2]!;
		const key = `${Math.round(x / grid)},${Math.round(y / grid)},${Math.round(z / grid)}`;
		let value = id.get(key);
		if (value === undefined) { value = next++; id.set(key, value); }
		return value;
	}
	const edges = new Map<string, number>();
	for (let i = 0; i < mesh.indices.length; i += 3) {
		const tri = [vid(mesh.indices[i]!), vid(mesh.indices[i + 1]!), vid(mesh.indices[i + 2]!)];
		for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]] as const) {
			const key = a < b ? `${a},${b}` : `${b},${a}`;
			edges.set(key, (edges.get(key) ?? 0) + 1);
		}
	}
	const counts: Record<number, number> = {};
	for (const count of edges.values()) counts[count] = (counts[count] ?? 0) + 1;
	return counts;
}

/** Assert every geometric edge is shared by exactly 1 or 2 triangles (manifold, possibly with boundary). */
function assertManifoldWithBoundary(mesh: IndexedWallMesh): void {
	const grid = 1e-4;
	const id = new Map<string, number>();
	let next = 0;
	function vid(index: number): number {
		const x = mesh.positions[index * 3]!;
		const y = mesh.positions[index * 3 + 1]!;
		const z = mesh.positions[index * 3 + 2]!;
		const key = `${Math.round(x / grid)},${Math.round(y / grid)},${Math.round(z / grid)}`;
		let value = id.get(key);
		if (value === undefined) { value = next++; id.set(key, value); }
		return value;
	}
	const edges = new Map<string, number>();
	for (let i = 0; i < mesh.indices.length; i += 3) {
		const tri = [vid(mesh.indices[i]!), vid(mesh.indices[i + 1]!), vid(mesh.indices[i + 2]!)!];
		for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]] as const) {
			const key = a < b ? `${a},${b}` : `${b},${a}`;
			edges.set(key, (edges.get(key) ?? 0) + 1);
		}
	}
	for (const [key, count] of edges) {
		expect(count, `edge ${key}`).toBeGreaterThanOrEqual(1);
		expect(count, `edge ${key}`).toBeLessThanOrEqual(2);
	}
}

/** Assert no vertex lies in the interior of a non-incident geometric edge (no T-junctions). */
function assertNoTjunctions(mesh: IndexedWallMesh): void {
	const grid = 1e-4;
	const points: [number, number, number][] = [];
	const id = new Map<string, number>();
	function vid(index: number): number {
		const x = mesh.positions[index * 3]!;
		const y = mesh.positions[index * 3 + 1]!;
		const z = mesh.positions[index * 3 + 2]!;
		const key = `${Math.round(x / grid)},${Math.round(y / grid)},${Math.round(z / grid)}`;
		let value = id.get(key);
		if (value === undefined) { value = points.length; id.set(key, value); points.push([x, y, z]); }
		return value;
	}
	const edges = new Map<string, [number, number]>();
	for (let i = 0; i < mesh.indices.length; i += 3) {
		const tri = [vid(mesh.indices[i]!), vid(mesh.indices[i + 1]!), vid(mesh.indices[i + 2]!)!];
		for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]] as const) {
			const key = a < b ? `${a},${b}` : `${b},${a}`;
			if (!edges.has(key)) edges.set(key, [Math.min(a, b), Math.max(a, b)]);
		}
	}
	for (let v = 0; v < points.length; v += 1) {
		const p = points[v]!;
		for (const [a, b] of edges.values()) {
			if (a === v || b === v) continue;
			if (pointOnSegment(p, points[a]!, points[b]!)) {
				throw new Error(`T-junction: vertex ${v} (${p.join(',')}) lies on edge ${a}–${b}`);
			}
		}
	}
}

function pointOnSegment(p: [number, number, number], a: [number, number, number], b: [number, number, number]): boolean {
	const abx = b[0] - a[0];
	const aby = b[1] - a[1];
	const abz = b[2] - a[2];
	const len2 = abx * abx + aby * aby + abz * abz;
	if (len2 <= 1e-12) return false;
	const t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / len2;
	if (t < -1e-3 || t > 1 + 1e-3) return false;
	const cx = a[0] + t * abx - p[0];
	const cy = a[1] + t * aby - p[1];
	const cz = a[2] + t * abz - p[2];
	const tol = 1e-3;
	return cx * cx + cy * cy + cz * cz <= tol * tol;
}

function assertFinite(mesh: IndexedWallMesh): void {
	for (const value of mesh.positions) expect(Number.isFinite(value)).toBe(true);
	for (const value of mesh.normals) expect(Number.isFinite(value)).toBe(true);
	for (const value of mesh.uvs) expect(Number.isFinite(value)).toBe(true);
}

function lintelMinY(mesh: IndexedWallMesh, openingId: string): number {
	let min = Infinity;
	for (const range of mesh.sectionToRange) {
		if (range.kind !== 'lintel' || range.openingId !== openingId) continue;
		for (let k = range.start; k < range.start + range.count; k += 1) {
			const index = mesh.indices[k]!;
			min = Math.min(min, mesh.positions[index * 3 + 1]!);
		}
	}
	return min;
}

/** Highest lintel vertex strictly below the wall top — the arch apex height. */
function lintelUndersideApexY(mesh: IndexedWallMesh, openingId: string, wallTop: number): number {
	let max = -Infinity;
	for (const range of mesh.sectionToRange) {
		if (range.kind !== 'lintel' || range.openingId !== openingId) continue;
		for (let k = range.start; k < range.start + range.count; k += 1) {
			const index = mesh.indices[k]!;
			const y = mesh.positions[index * 3 + 1]!;
			if (y < wallTop - 1e-3) max = Math.max(max, y);
		}
	}
	return max;
}

describe('buildRoomWallMesh', () => {
	it('builds a closed manifold for a plain rectangle room', () => {
		const room = compileRoom(g1LineRectangleDocument());
		const result = buildRoomWallMesh(room);
		expect(result.issues).toEqual([]);
		const mesh = result.mesh!;
		assertFinite(mesh);
		expect(mesh.indices.length).toBeGreaterThan(0);
		expect(mesh.indices.length % 3).toBe(0);
		expect(mesh.materialGroups.map((group) => group.surfaceKey)).toEqual(['side']);
		expect(mesh.materialGroups[0]!.count).toBe(mesh.indices.length);
		expect(mesh.sectionToRange.length).toBe(4);
		expect(mesh.sectionToRange.every((range) => range.kind === 'side')).toBe(true);
		assertEdgeMultiplicity(mesh, 2);
	});

	it('welds corners watertight on an L-shaped room', () => {
		const room = compileRoom(g1LShapedDocument());
		const result = buildRoomWallMesh(room);
		expect(result.issues).toEqual([]);
		const mesh = result.mesh!;
		assertFinite(mesh);
		assertEdgeMultiplicity(mesh, 2);
		// Walls are centered on the room centerline (±thickness/2), matching
		// LayoutMuseumShell: the outer faces extend half-thickness past the polygon.
		const half = room.wallThickness / 2;
		expect(mesh.bounds.min[0]).toBeCloseTo(-half, 3);
		expect(mesh.bounds.max[0]).toBeCloseTo(6 + half, 3);
		expect(mesh.bounds.max[2]).toBeCloseTo(6 + half, 3);
		expect(mesh.bounds.max[1]).toBeCloseTo(3, 3);
	});

	it('builds a watertight 2-manifold with boundary around opening fixtures (no T-junctions)', () => {
		for (const document of [g1LineRectangleDocument(), g1LShapedDocument(), g1MultipleOpeningsDocument(), g1ProfileMatrixDocument()]) {
			const room = compileRoom(document);
			const mesh = buildRoomWallMesh(room).mesh!;
			assertManifoldWithBoundary(mesh);
			assertNoTjunctions(mesh);
		}
	});

	it('keeps collinear wall junctions as separate vertices when wall-local u resets', () => {
		// Closed rectangle whose bottom edge is two COLLINEAR walls A (0,0)->(2,0)
		// and B (2,0)->(4,0) meeting at (2,0). Their shared corner must not weld,
		// because wall A ends at u=2 while wall B restarts at u=0.
		const walls = [
			fabricateWall('A', [[0, 0], [2, 0]], 0.16),
			fabricateWall('B', [[2, 0], [4, 0]], 0.16),
			fabricateWall('C', [[4, 0], [4, 2]], 0.16),
			fabricateWall('D', [[4, 2], [0, 2]], 0.16),
			fabricateWall('E', [[0, 2], [0, 0]], 0.16)
		];
		const room = fabricateRoom(walls);
		const mesh = buildRoomWallMesh(room).mesh!;
		const junctionU = new Set<number>();
		for (let v = 0; v < mesh.positions.length / 3; v += 1) {
			const x = mesh.positions[v * 3]!;
			const z = mesh.positions[v * 3 + 2]!;
			const nx = mesh.normals[v * 3]!;
			const ny = mesh.normals[v * 3 + 1]!;
			const nz = mesh.normals[v * 3 + 2]!;
			const isFrontFace = Math.abs(nx) < 1e-3 && Math.abs(ny) < 1e-3 && nz > 0.5;
			if (isFrontFace && Math.abs(x - 2) < 1e-3 && z > 0.05) junctionU.add(mesh.uvs[v * 2]!);
		}
		expect(junctionU).toEqual(new Set([2, 0]));
	});

	it('emits lintel surfaces and reveals for doors and windows', () => {
		const room = compileRoom(g1MultipleOpeningsDocument());
		const result = buildRoomWallMesh(room);
		expect(result.issues).toEqual([]);
		const mesh = result.mesh!;
		assertFinite(mesh);
		expect(mesh.materialGroups.map((group) => group.surfaceKey)).toEqual(['side', 'lintel']);
		expect(mesh.sectionToRange.some((range) => range.kind === 'lintel')).toBe(true);
		// Door + two windows: their jambs are reveal faces beyond the section ranges.
		const wallWithOpenings = mesh.wallRanges.find((range) => range.ranges.length > 1);
		expect(wallWithOpenings).toBeDefined();
	});

	it('keeps arch lintel undersides at the spring height, not the flat lintel bottom', () => {
		const room = compileRoom(g1ProfileMatrixDocument());
		const result = buildRoomWallMesh(room);
		expect(result.issues).toEqual([]);
		const mesh = result.mesh!;
		const rectangular = lintelMinY(mesh, 'rect'); // door, sill 0, height 2.4 → flat underside at 2.4
		const rounded = lintelMinY(mesh, 'rounded'); // window, sill 1, height 1.8, rise 0.7 → spring at 2.1
		expect(rectangular).toBeCloseTo(2.4, 3);
		expect(rounded).toBeCloseTo(2.1, 3);
		expect(rounded).toBeLessThan(rectangular - 0.2);
	});

	it('tessellates arch undersides from profile knots so the apex survives', () => {
		const room = compileRoom(g1ProfileMatrixDocument());
		const mesh = buildRoomWallMesh(room).mesh!;
		const wallTop = room.ceilingElevation;
		// Door: flat underside at 2.4. Rounded + pointed windows (sill 1, height 1.8)
		// rise to an apex of 2.8 that must land on a profile knot, not between
		// the 0.25 m wall samples (which would clip the apex to ~2.75).
		expect(lintelUndersideApexY(mesh, 'rect', wallTop)).toBeCloseTo(2.4, 3);
		expect(lintelUndersideApexY(mesh, 'rounded', wallTop)).toBeCloseTo(2.8, 3);
		expect(lintelUndersideApexY(mesh, 'pointed', wallTop)).toBeCloseTo(2.8, 3);
	});

	it('tilts sloped arch underside normals with the profile slope', () => {
		const room = compileRoom(g1ProfileMatrixDocument());
		const mesh = buildRoomWallMesh(room).mesh!;
		let tilted = 0;
		for (let v = 0; v < mesh.normals.length / 3; v += 1) {
			const nx = mesh.normals[v * 3]!;
			const ny = mesh.normals[v * 3 + 1]!;
			const nz = mesh.normals[v * 3 + 2]!;
			if (ny < -1e-3 && Math.hypot(nx, nz) > 1e-3) tilted += 1;
		}
		expect(tilted).toBeGreaterThan(0);
	});

	it('rejects walls closer than their combined thickness (offset overlap)', () => {
		// A 0.1 m-wide corridor with 0.16 m walls: opposite walls overlap.
		const thin = g1RectangleRoom('room-thin', 0, 0, 0.1, 4);
		const document = g1DocumentWithRooms([thin]);
		const room = compileRoom(document);
		const result = buildRoomWallMesh(room);
		expect(result.mesh).toBeUndefined();
		expect(result.issues.some((issue) => issue.code === 'wall_clearance_insufficient')).toBe(true);
	});

	it('rejects a self-folding hairpin wall (narrow neck)', () => {
		const wall = fabricateWall('hairpin', [[0, 0], [1, 0], [1, 0.02], [0, 0.02]], 0.16);
		const room = fabricateRoom([wall]);
		const result = buildRoomWallMesh(room);
		expect(result.mesh).toBeUndefined();
		expect(result.issues.length).toBeGreaterThan(0);
	});

	it('rejects rooms with no walls or invalid thickness', () => {
		const empty = fabricateRoom([]);
		expect(buildRoomWallMesh(empty).issues.some((issue) => issue.code === 'room_no_walls')).toBe(true);
		const zeroThickness = fabricateRoom([fabricateWall('w', [[0, 0], [1, 0], [1, 1], [0, 1]], 0)]);
		expect(buildRoomWallMesh(zeroThickness).issues.some((issue) => issue.code === 'wall_thickness_invalid')).toBe(true);
	});

	it('winds every triangle to agree with its stored normal (winding guard)', () => {
		for (const document of [g1LineRectangleDocument(), g1LShapedDocument(), g1MultipleOpeningsDocument(), g1ProfileMatrixDocument()]) {
			const room = compileRoom(document);
			const result = buildRoomWallMesh(room, { assertWinding: true });
			expect(result.issues).toEqual([]);
			expect(result.mesh!.indices.length).toBeGreaterThan(0);
		}
	});

	it('assertWindingAgreesWithNormals throws on a reversed triangle', () => {
		const room = compileRoom(g1LineRectangleDocument());
		const mesh = buildRoomWallMesh(room).mesh!;
		const flipped: IndexedWallMesh = { ...mesh, indices: new Uint32Array(mesh.indices) };
		[flipped.indices[1], flipped.indices[2]] = [flipped.indices[2]!, flipped.indices[1]!];
		expect(() => assertWindingAgreesWithNormals(flipped)).toThrow(/winds opposite/);
	});

	it('keeps the builder free of Svelte, DOM, and Three imports', () => {
		const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/lib/layout/wall-mesh-builder.ts'), 'utf8');
		expect(source).not.toMatch(/from\s+['"](three|svelte|@threlte|\$app)['"]/);
		expect(source).not.toMatch(/\$lib\/editor|\$lib\/museum|\bdocument\.|\bwindow\./);
	});

	it('produces metric, floor-anchored UVs', () => {
		const room = compileRoom(g1LineRectangleDocument());
		const mesh = buildRoomWallMesh(room).mesh!;
		const ceiling = room.ceilingElevation - room.floorElevation;
		for (let i = 0; i < mesh.uvs.length; i += 2) {
			expect(mesh.uvs[i]!).toBeGreaterThanOrEqual(-1e-6);
			expect(mesh.uvs[i + 1]!).toBeGreaterThanOrEqual(-1e-6);
			expect(mesh.uvs[i + 1]!).toBeLessThanOrEqual(ceiling + 1e-6);
		}
	});

	it('builds watertight beveled corners past the miter limit (forced bevel)', () => {
		// A 90° corner's miter apex sits at thickness/2 · √2 ≈ 0.113; miterLimit 1
		// forces every corner into the bevel path. The bridge must close the wedge
		// (front chamfer + caps) while every wall stays on its own offset line.
		const room = compileRoom(g1DocumentWithRooms([g1RectangleRoom('room-bev', 0, 0, 6, 4)]));
		const result = buildRoomWallMesh(room, { miterLimit: 1, assertWinding: true });
		expect(result.issues).toEqual([]);
		const mesh = result.mesh!;
		assertFinite(mesh);
		assertEdgeMultiplicity(mesh, 2);
		// Bridge faces are metadata-only: they must not leak into sectionToRange
		// (the reviewer's contract) nor create a second material group.
		expect(mesh.sectionToRange.length).toBe(4);
		expect(mesh.materialGroups.map((group) => group.surfaceKey)).toEqual(['side']);
		// Bridge geometry is still reachable through the shared wallRanges entry.
		expect(mesh.wallRanges.some((wall) => wall.ranges.length > 1)).toBe(true);
	});

	it('bevels acute and concave (reflex) corners watertight', () => {
		// Rhombus: acute ~63° corners (long miter apexes) — beveled at limit 1.
		// Notch: a V-notch with a reflex corner whose outer apex is long — beveled.
		for (const document of [rhombusDocument(), notchDocument()]) {
			const room = compileRoom(document);
			const result = buildRoomWallMesh(room, { miterLimit: 1, assertWinding: true });
			expect(result.issues).toEqual([]);
			const mesh = result.mesh!;
			assertFinite(mesh);
			assertEdgeMultiplicity(mesh, 2);
		}
	});

	it('keeps collinear continuations mitered (no bevel, no fold)', () => {
		// Two collinear walls meeting at (2,0): the junction continues straight.
		// Even under an aggressive miter limit the corner must stay a miter
		// continuation (a0 ≈ b0), never a fold or a zero-width bevel bridge.
		const walls = [
			fabricateWall('A', [[0, 0], [2, 0]], 0.16),
			fabricateWall('B', [[2, 0], [4, 0]], 0.16),
			fabricateWall('C', [[4, 0], [4, 2]], 0.16),
			fabricateWall('D', [[4, 2], [0, 2]], 0.16),
			fabricateWall('E', [[0, 2], [0, 0]], 0.16)
		];
		const room = fabricateRoom(walls);
		const result = buildRoomWallMesh(room, { miterLimit: 1 });
		expect(result.issues).toEqual([]);
		assertEdgeMultiplicity(result.mesh!, 2);
	});

	it('rejects a 180° junction fold with a structured issue', () => {
		// Wall B doubles back on wall A at (2,0): the boundary retraces itself.
		// The offset-overlap detector rejects it before faces are built — the
		// corner computation additionally carries a `wall_corner_fold` backstop
		// for junctions whose individual offset polylines are clean.
		const walls = [
			fabricateWall('A', [[0, 0], [2, 0]], 0.16),
			fabricateWall('B', [[2, 0], [1, 0]], 0.16),
			fabricateWall('C', [[1, 0], [1, 2]], 0.16),
			fabricateWall('D', [[1, 2], [0, 2]], 0.16),
			fabricateWall('E', [[0, 2], [0, 0]], 0.16)
		];
		const room = fabricateRoom(walls);
		const result = buildRoomWallMesh(room);
		expect(result.mesh).toBeUndefined();
		expect(result.issues.length).toBeGreaterThan(0);
	});

	it('welds endpoint door openings at mitered and beveled corners', () => {
		// Door at offset 0 (the wall's start) and a second door meeting the same
		// corner from the adjacent wall (both-open). Both the mitered and the
		// beveled (miterLimit 1) variants must be edge-clean manifolds.
		const single = g1DocumentWithRooms([
			g1RectangleRoom('room-d0', 0, 0, 6, 4, [g1Opening('door-0', 'room-d0:wall:0', 'door', 0, 0.9, 2.1, 0)])
		]);
		const both = g1DocumentWithRooms([
			g1RectangleRoom('room-vb', 0, 0, 6, 4, [
				g1Opening('door-a', 'room-vb:wall:0', 'door', 5.1, 0.9, 2.1, 0),
				g1Opening('door-b', 'room-vb:wall:1', 'door', 0, 0.9, 2.1, 0)
			])
		]);
		for (const [document, options] of [
			[single, undefined],
			[single, { miterLimit: 1 }],
			[both, { miterLimit: 1 }]
		] as const) {
			const room = compileRoom(document);
			const result = buildRoomWallMesh(room, { assertWinding: true, ...options });
			expect(result.issues).toEqual([]);
			const mesh = result.mesh!;
			assertFinite(mesh);
			assertEdgeMultiplicity(mesh, 2);
		}
	});

	it('closes sloped arch undersides at band crossings (profile matrix is fully watertight)', () => {
		const room = compileRoom(g1ProfileMatrixDocument());
		const result = buildRoomWallMesh(room, { assertWinding: true });
		expect(result.issues).toEqual([]);
		const mesh = result.mesh!;
		assertFinite(mesh);
		// Arch/band intersections + triangle collapse: every geometric edge is
		// shared by exactly two triangles, even with a floor-level door and
		// rounded/pointed windows whose arches cross the room breakpoints.
		assertEdgeMultiplicity(mesh, 2);
	});

	it('merges a both-open miter corner into one void (no interior jamb)', () => {
		// Two equal doors meeting at a shared miter corner form a single L-shaped
		// void: both corner jambs are interior and must be suppressed, leaving a
		// watertight manifold where every edge is owned by exactly two triangles.
		const room = compileRoom(g1DocumentWithRooms([
			g1RectangleRoom('room-vb', 0, 0, 6, 4, [
				g1Opening('door-a', 'room-vb:wall:0', 'door', 5.1, 0.9, 2.1, 0),
				g1Opening('door-b', 'room-vb:wall:1', 'door', 0, 0.9, 2.1, 0)
			])
		]));
		const result = buildRoomWallMesh(room, { assertWinding: true });
		expect(result.issues).toEqual([]);
		const mesh = result.mesh!;
		assertFinite(mesh);
		assertEdgeMultiplicity(mesh, 2);
	});

	it('closes mismatched both-open miter corners with a profile-difference reveal', () => {
		// Different door heights at the shared corner: the taller door's void
		// exposes the shorter door's lintel end over the mismatched band, which
		// must be closed by a reveal cap (not a full interior jamb).
		const room = compileRoom(g1DocumentWithRooms([
			g1RectangleRoom('room-mm', 0, 0, 6, 4, [
				g1Opening('door-a', 'room-mm:wall:0', 'door', 5.1, 0.9, 2.1, 0),
				g1Opening('door-b', 'room-mm:wall:1', 'door', 0, 0.9, 2.4, 0)
			])
		]));
		const result = buildRoomWallMesh(room, { assertWinding: true });
		expect(result.issues).toEqual([]);
		const mesh = result.mesh!;
		assertFinite(mesh);
		assertEdgeMultiplicity(mesh, 2);
	});

	it('keeps arched corner openings watertight (miter and bevel)', () => {
		const document = g1DocumentWithRooms([
			g1RectangleRoom('room-arch', 0, 0, 6, 4, [
				g1Opening('arch-0', 'room-arch:wall:0', 'door', 0, 1.4, 2.4, 0, 'rounded')
			])
		]);
		for (const options of [undefined, { miterLimit: 1 }] as const) {
			const room = compileRoom(document);
			const result = buildRoomWallMesh(room, { assertWinding: true, ...options });
			expect(result.issues).toEqual([]);
			const mesh = result.mesh!;
			assertFinite(mesh);
			assertEdgeMultiplicity(mesh, 2);
		}
	});
});

describe('H1 S5 — pickRanges pick metadata', () => {
	it('emits pickRanges as a sorted partition covering every emitted triangle', () => {
		const fixtures: Array<[ReturnType<typeof g1LineRectangleDocument>, { miterLimit?: number }?]> = [
			[g1LineRectangleDocument(), undefined],
			[g1LShapedDocument(), undefined],
			[g1MultipleOpeningsDocument(), undefined],
			[g1ProfileMatrixDocument(), undefined],
			[g1LineRectangleDocument(), { miterLimit: 1 }],
			[
				g1DocumentWithRooms([
					g1RectangleRoom('room-mm', 0, 0, 6, 4, [
						g1Opening('door-a', 'room-mm:wall:0', 'door', 5.1, 0.9, 2.1, 0),
						g1Opening('door-b', 'room-mm:wall:1', 'door', 0, 0.9, 2.4, 0)
					])
				]),
				undefined
			]
		];
		for (const [document, options] of fixtures) {
			const mesh = buildRoomWallMesh(compileRoom(document), options).mesh!;
			expect(mesh.pickRanges.length).toBeGreaterThan(0);
			let cursor = 0;
			for (const range of mesh.pickRanges) {
				expect(range.start).toBe(cursor);
				expect(range.count % 3).toBe(0);
				cursor += range.count;
			}
			expect(cursor).toBe(mesh.indices.length);
		}
	});

	it('tags every plain-rectangle triangle as wall side with authored room/segment identity', () => {
		const room = compileRoom(g1LineRectangleDocument());
		const mesh = buildRoomWallMesh(room).mesh!;
		expect(
			mesh.pickRanges.every(
				(range) => range.kind === 'wall' && range.surface === 'side' && range.roomId === room.roomId
			)
		).toBe(true);
		expect(new Set(mesh.pickRanges.map((range) => range.segmentId)).size).toBe(4);
	});

	it('tags sill, lintel, arch-reveal, and jamb surfaces with the owning opening', () => {
		const mesh = buildRoomWallMesh(compileRoom(g1ProfileMatrixDocument())).mesh!;
		const byOpening = new Map<string, Set<string>>();
		const wallSurfaces = new Set<string>();
		for (const range of mesh.pickRanges) {
			if (range.kind === 'opening') {
				const surfaces = byOpening.get(range.openingId) ?? new Set<string>();
				surfaces.add(range.surface);
				byOpening.set(range.openingId, surfaces);
			} else {
				wallSurfaces.add(range.surface);
			}
		}

		// Door (sill 0) never emits a sill strip; windows (sill 1) do.
		expect(byOpening.get('rect')!.has('sill')).toBe(false);
		expect(byOpening.get('rounded')!.has('sill')).toBe(true);
		expect(byOpening.get('pointed')!.has('sill')).toBe(true);
		// Every opening carries jamb + lintel band/top + arch underside.
		for (const [openingId, surfaces] of byOpening) {
			expect(surfaces.has('jamb'), openingId).toBe(true);
			expect(surfaces.has('lintel'), openingId).toBe(true);
			expect(surfaces.has('arch-reveal'), openingId).toBe(true);
		}
		// Compiler lintels always carry openingId, so no wall 'lintel' surface.
		expect(wallSurfaces).toEqual(new Set(['side']));

		// Underside triangles face downward; jamb triangles are vertical planes.
		let archRevealDownward = 0;
		let jambVertical = 0;
		for (const range of mesh.pickRanges) {
			if (range.kind !== 'opening') continue;
			for (let t = range.start / 3; t < (range.start + range.count) / 3; t += 1) {
				const index = mesh.indices[t * 3]!;
				const ny = mesh.normals[index * 3 + 1]!;
				if (range.surface === 'arch-reveal' && ny < -1e-3) archRevealDownward += 1;
				if (range.surface === 'jamb' && Math.abs(ny) < 1e-3) jambVertical += 1;
			}
		}
		expect(archRevealDownward).toBeGreaterThan(0);
		expect(jambVertical).toBeGreaterThan(0);
	});

	it('assigns corner bridges exclusively to the current/start wall, never the neighbor', () => {
		const mesh = buildRoomWallMesh(
			compileRoom(g1DocumentWithRooms([g1RectangleRoom('room-bev', 0, 0, 6, 4)])),
			{ miterLimit: 1 }
		).mesh!;
		const bridges = mesh.pickRanges.filter((range) => range.kind === 'wall' && range.surface === 'bridge');
		// Every corner is beveled at miterLimit 1 → four bridges, one per wall start.
		expect(bridges).toHaveLength(4);

		// Corner (0,0) is wall 0's START and wall 3's END. The bridge there must
		// be owned by wall 0 only — the shared wallRanges entry names both walls,
		// but the pick owner is exclusively the current/start wall.
		const corners: Array<[[number, number], string]> = [
			[[0, 0], 'room-bev:wall:0'],
			[[6, 0], 'room-bev:wall:1'],
			[[6, 4], 'room-bev:wall:2'],
			[[0, 4], 'room-bev:wall:3']
		];
		for (const [[cx, cz], expectedSegment] of corners) {
			const owners = new Set<string>();
			for (const range of bridges) {
				for (let t = range.start / 3; t < (range.start + range.count) / 3; t += 1) {
					const [x, z] = triangleCentroidPlan(mesh, t);
					if (Math.hypot(x - cx, z - cz) <= 0.15) owners.add(range.segmentId);
				}
			}
			expect([...owners]).toEqual([expectedSegment]);
		}
	});

	it('owns the both-open miter profile-difference reveal by the current/start wall', () => {
		const document = g1DocumentWithRooms([
			g1RectangleRoom('room-mm', 0, 0, 6, 4, [
				g1Opening('door-a', 'room-mm:wall:0', 'door', 5.1, 0.9, 2.1, 0),
				g1Opening('door-b', 'room-mm:wall:1', 'door', 0, 0.9, 2.4, 0)
			])
		]);
		const mesh = buildRoomWallMesh(compileRoom(document), { assertWinding: true }).mesh!;
		// Corner (6,0) is wall 0's END and wall 1's START; the mismatched-heights
		// reveal cap closing the merged void is a bridge owned by wall 1 only.
		const owners = new Set<string>();
		for (const range of mesh.pickRanges) {
			if (range.kind !== 'wall' || range.surface !== 'bridge') continue;
			for (let t = range.start / 3; t < (range.start + range.count) / 3; t += 1) {
				const [x, z] = triangleCentroidPlan(mesh, t);
				if (Math.hypot(x - 6, z) <= 0.15) owners.add(range.segmentId);
			}
		}
		expect(owners.size).toBeGreaterThan(0);
		expect([...owners]).toEqual(['room-mm:wall:1']);
	});
});

function triangleCentroidPlan(mesh: IndexedWallMesh, triangleIndex: number): [number, number] {
	const ia = mesh.indices[triangleIndex * 3]!;
	const ib = mesh.indices[triangleIndex * 3 + 1]!;
	const ic = mesh.indices[triangleIndex * 3 + 2]!;
	return [
		(mesh.positions[ia * 3]! + mesh.positions[ib * 3]! + mesh.positions[ic * 3]!) / 3,
		(mesh.positions[ia * 3 + 2]! + mesh.positions[ib * 3 + 2]! + mesh.positions[ic * 3 + 2]!) / 3
	];
}

function rhombusDocument(): ReturnType<typeof g1DocumentWithRooms> {
	const room = g1RectangleRoom('room-rhombus', 0, 0, 6, 4);
	room.boundary.segments = g1LineSegments(
		[
			[0, 0],
			[6, 0],
			[11.638, 2.052],
			[5.638, 2.052]
		],
		'room-rhombus:wall'
	);
	return g1DocumentWithRooms([room]);
}

function notchDocument(): ReturnType<typeof g1DocumentWithRooms> {
	const room = g1RectangleRoom('room-notch', 0, 0, 6, 4);
	room.boundary.segments = g1LineSegments(
		[
			[0, 0],
			[6, 0],
			[6, 1],
			[4, 1.5],
			[4, 5],
			[0, 5]
		],
		'room-notch:wall'
	);
	return g1DocumentWithRooms([room]);
}

function fabricateWall(segmentId: string, points: readonly LayoutVec2[], thickness: number): CompiledWall {
	const samples: CurveSample[] = [];
	let distance = 0;
	for (let i = 0; i < points.length; i += 1) {
		const point = points[i]!;
		if (i > 0) distance += Math.hypot(point[0] - points[i - 1]![0], point[1] - points[i - 1]![1]);
		const prev = points[i - 1] ?? point;
		const next = points[i + 1] ?? point;
		const tx = next[0] - prev[0];
		const tz = next[1] - prev[1];
		const magnitude = Math.hypot(tx, tz) || 1;
		samples.push({
			point: [...point] as LayoutVec2,
			distance,
			tangent: [tx / magnitude, tz / magnitude],
			normal: [-tz / magnitude, tx / magnitude],
			t: 0
		});
	}
	const length = distance;
	return {
		id: '',
		cacheKey: '',
		segmentId,
		thickness,
		length,
		samples,
		sections: [{ kind: 'side', startDistance: 0, endDistance: length, bottomY: 0, topY: 3 }],
		solidSpans: [],
		openings: [],
		solidCenterlinePolylines: [],
		bounds2: { min: [0, 0], max: [0, 0] },
		bounds3: { min: [0, 0, 0], max: [0, 0, 0] }
	} as unknown as CompiledWall;
}

function fabricateRoom(walls: CompiledWall[]): CompiledRoom {
	return {
		id: '',
		cacheKey: '',
		roomId: 'room-fabricated',
		floorElevation: 0,
		ceilingElevation: 3,
		floorThickness: 0.1,
		ceilingThickness: 0.1,
		wallThickness: walls[0]?.thickness ?? 0.16,
		floorPolygon: [],
		ceilingPolygon: [],
		walls,
		openings: [],
		bounds2: { min: [0, 0], max: [1, 1] },
		bounds3: { min: [0, 0, 0], max: [1, 3, 1] }
	} as unknown as CompiledRoom;
}
