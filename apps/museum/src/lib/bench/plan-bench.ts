import type { LayoutDocument, LayoutVec2 } from '$lib/layout/layout-types';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { buildPlanRenderModel } from '$lib/layout/plan-render-model';
import { buildRoomWallMesh } from '$lib/layout/wall-mesh-builder';
import type { CompiledLayoutGeometry, CompiledQueryPoint } from '$lib/layout/layout-geometry-types';
// Pure hit resolver (imports only $lib/layout/**; no Svelte/DOM/Three). Used here
// so the Node tier measures the real locked-priority hit path rather than a stub.
import { resolvePlanHit } from '$lib/editor/layout/plan-hit';
import { timeOp } from '$lib/bench/bench-harness';
import { BENCH_METHOD_VERSION } from './bench-types';
import type { BenchProvenance, BenchSample, BenchTier, BenchTierResult } from './bench-types';

export type NodeTierOptions = {
	warmup: number;
	samples: number;
	/** World-space probe points for hit/snap timing. */
	hitPoints: number;
	/** World-space hit/snap tolerance in meters. */
	tolerance: number;
};

export const DEFAULT_NODE_OPTIONS: NodeTierOptions = {
	warmup: 2,
	samples: 5,
	hitPoints: 200,
	tolerance: 0.2
};

/** Provenance for a Node-tier run; commit SHA is best-effort from the environment. */
export function makeNodeProvenance(partial: Partial<BenchProvenance> = {}): BenchProvenance {
	const env = typeof process !== 'undefined' ? process.env : {};
	return {
		commitSha: env.GIT_SHA ?? env.CODEBUFF_SHA ?? 'local',
		date: new Date().toISOString(),
		deviceProfile: env.BENCH_DEVICE_PROFILE ?? 'node',
		warmup: DEFAULT_NODE_OPTIONS.warmup,
		samples: DEFAULT_NODE_OPTIONS.samples,
		methodVersion: BENCH_METHOD_VERSION,
		...partial
	};
}

/**
 * Measure the deterministic Node tier for one fixture. Compiles the document
 * once to a stable `CompiledLayoutGeometry` for the model/hit/snap metrics,
 * then times each concern with warm-up and repeated samples. `seed` is the
 * fixture generator seed (reported in provenance); it is omitted for the
 * checked-in `chopin` project.
 */
export function measureNodeTier(
	fixture: LayoutDocument,
	tier: BenchTier,
	provenance: BenchProvenance,
	options: NodeTierOptions = DEFAULT_NODE_OPTIONS,
	seed?: number
): BenchTierResult {
	const compiled = compileLayoutGeometry(fixture).geometry;
	const samples: BenchSample[] = [];
	const roomCount = countRooms(fixture);
	const probeSeed = tierSeed(tier);
	// Stamp the actual run configuration so the report reflects what ran.
	const effectiveProvenance: BenchProvenance = { ...provenance, warmup: options.warmup, samples: options.samples };

	// 1. Whole-document compile (the G1 `compileLayoutGeometry` path).
	const compileTime = timeOp(() => compileLayoutGeometry(fixture), options);
	samples.push(timeSample('layout-compile', compileTime));

	// 2. Plan render-model build (the G2 `buildPlanRenderModel` path).
	const modelTime = timeOp(() => buildPlanRenderModel(compiled), options);
	samples.push(timeSample('plan-render-build', modelTime));

	// 2b. Procedural wall-mesh build (the G4 `buildRoomWallMesh` path): one
	// watertight indexed mesh per room. This is the deterministic topology cost
	// that replaces the retired chord-box span derivation.
	const wallBuild = timeOp(() => buildAllWallMeshes(compiled), options);
	samples.push(timeSample('wall-mesh-build', wallBuild));

	// 3–4. Hit test and snapping-query latency over deterministic world points.
	const points = samplePlanPoints(compiled, options.hitPoints, probeSeed);
	const hitTime = timeOp(
		() => {
			for (const point of points) resolvePlanHit(compiled.queries, point, options.tolerance);
		},
		{ ...options, iterations: 1 }
	);
	samples.push(timeSample('hit-test', perPoint(hitTime, points.length)));
	const snapTime = timeOp(
		() => {
			for (const point of points) nearestQueryPoint(compiled.queries.points, point, options.tolerance);
		},
		{ ...options, iterations: 1 }
	);
	samples.push(timeSample('snap-query', perPoint(snapTime, points.length)));

	// 5. Compiled-data footprint, measured as the deterministic serialized size
	// of the compiled geometry (an environment-independent proxy for retained
	// memory; avoids GC noise while staying reproducible across runs).
	samples.push({
		metric: 'compiled-memory',
		unit: 'bytes',
		value: JSON.stringify(compiled).length
	});

	// 6. Cache-key footprint: the total UTF-16 code units of the stored `cacheKey`
	// strings across compiled entities and query records (JS string memory is
	// UTF-16, so `length` is the honest allocation measure). `layout-geometry.ts`
	// derives every `cacheKey` via `JSON.stringify`, so this deterministic count
	// is the allocation backlog #10 (lazy/cheaper cacheKey) targets and will
	// shrink if cache keys stop embedding full input JSON.
	samples.push({ metric: 'cache-key-code-units', unit: 'count', value: cacheKeyCodeUnits(compiled) });

	return {
		tier,
		...(seed === undefined ? {} : { seed }),
		roomCount,
		provenance: effectiveProvenance,
		samples
	};
}

function timeSample(metric: BenchSample['metric'], timing: { value: number; p50: number; p95: number }): BenchSample {
	return { metric, unit: 'ms', value: timing.value, p50: timing.p50, p95: timing.p95 };
}

function perPoint(timing: { value: number; p50: number; p95: number }, count: number): { value: number; p50: number; p95: number } {
	return { value: timing.value / count, p50: timing.p50 / count, p95: timing.p95 / count };
}

function countRooms(document: LayoutDocument): number {
	return document.floors.reduce((sum, floor) => sum + floor.rooms.length, 0);
}

/** Build every room's indexed wall mesh; returns the total index count (a deterministic work proxy). */
function buildAllWallMeshes(compiled: CompiledLayoutGeometry): number {
	let indexCount = 0;
	for (const room of compiled.rooms) {
		const result = buildRoomWallMesh(room);
		if (!result.mesh) {
			const details = result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ');
			throw new Error(`wall mesh build failed for room ${room.roomId}: ${details}`);
		}
		indexCount += result.mesh.indices.length;
	}
	return indexCount;
}

function tierSeed(tier: BenchTier): number {
	switch (tier) {
		case 'chopin':
			return 1;
		case 'small':
			return 11;
		case 'medium':
			return 12;
		default:
			return 13;
	}
}

function cacheKeyCodeUnits(compiled: CompiledLayoutGeometry): number {
	let units = 0;
	for (const floor of compiled.floors) units += floor.cacheKey.length;
	for (const room of compiled.rooms) {
		units += room.cacheKey.length;
		for (const wall of room.walls) {
			units += wall.cacheKey.length;
			for (const opening of wall.openings) units += opening.cacheKey.length;
		}
	}
	for (const object of compiled.objects) units += object.cacheKey.length;
	for (const point of compiled.queries.points) units += point.cacheKey.length;
	for (const span of compiled.queries.spans) units += span.cacheKey.length;
	for (const polygon of compiled.queries.polygons) units += polygon.cacheKey.length;
	for (const aabb of compiled.queries.aabbs) units += aabb.cacheKey.length;
	return units;
}

/** Deterministic LCG for probe-point generation (no fixture dependency). */
function makeRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

function samplePlanPoints(compiled: CompiledLayoutGeometry, count: number, seed: number): LayoutVec2[] {
	const bounds = compiled.bounds;
	const minX = bounds?.min[0] ?? 0;
	const maxX = bounds?.max[0] ?? 10;
	const minZ = bounds?.min[2] ?? 0;
	const maxZ = bounds?.max[2] ?? 10;
	const random = makeRandom(seed);
	const points: LayoutVec2[] = [];
	for (let index = 0; index < count; index += 1) {
		points.push([minX + random() * (maxX - minX), minZ + random() * (maxZ - minZ)]);
	}
	return points;
}

/** Linear nearest-query-point scan: the current O(n) snapping shape (backlog #4). */
function nearestQueryPoint(
	points: readonly CompiledQueryPoint[],
	query: LayoutVec2,
	tolerance: number
): CompiledQueryPoint | null {
	let best: CompiledQueryPoint | null = null;
	let bestDistance = tolerance;
	for (const record of points) {
		const distance = Math.hypot(record.point[0] - query[0], record.point[1] - query[1]);
		if (distance <= bestDistance) {
			best = record;
			bestDistance = distance;
		}
	}
	return best;
}
