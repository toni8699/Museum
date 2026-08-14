import type { LayoutDocument } from '$lib/layout/layout-types';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import {
	buildPlanRenderModel,
	type PlanRenderModel,
	type PlanRenderPrimitive
} from '$lib/layout/plan-render-model';
import type { CompiledLayoutGeometry, LayoutBounds2 } from '$lib/layout/layout-geometry-types';
import { buildRoomWallMesh, type WallMeshSectionRef, type WallMeshSurfaceKey } from '$lib/layout/wall-mesh-builder';
import { chopinRoomPresentation } from '$lib/content/chopin-room-presentation';
import { timeOp } from './bench-harness';
import type { BenchProvenance, BenchSample, BenchTier, BenchTierResult } from './bench-types';

export type BrowserTierOptions = {
	pixelsPerMeter?: number;
	warmup?: number;
	samples?: number;
	/**
	 * Render-policy factory for the wall-mesh topology estimates. Defaults to
	 * `visitorWallMeshPolicy`; the recorder passes the production Chopin policy
	 * (real presentation tints + bespoke-room exclusion) so the estimates match
	 * the live `LayoutMuseumShell` scene instead of a synthetic per-room tint.
	 */
	policyFactory?: WallMeshRenderPolicyFactory;
};

/**
 * Browser-tier Plan metrics. Deterministic and DOM-free: it renders the
 * `PlanRenderModel` to an SVG string (world→screen with a Y flip) so the same
 * function runs in vitest and the browser. `three-*-estimate` metrics are
 * analytical chord-box topology estimates derived from compiled solid spans
 * (the naive one-box-per-span shape G4 targets) — NOT live `renderer.info`
 * reads; live WebGL counters live in `three-stats.ts` and are wired by the
 * `/dev/perf` page. The `plan-render-work-*` metrics are synchronous model→SVG
 * render-work proxies, not measured rAF frame times (a real scripted viewport
 * driver is a follow-up).
 */

const DEFAULT_PPM = 60;
const MARGIN = 24;

export function renderPlanModelToSvg(model: PlanRenderModel, pixelsPerMeter: number = DEFAULT_PPM): string {
	const bounds: LayoutBounds2 = model.bounds ?? { min: [0, 0], max: [10, 10] };
	const width = Math.ceil((bounds.max[0] - bounds.min[0]) * pixelsPerMeter + MARGIN * 2);
	const height = Math.ceil((bounds.max[1] - bounds.min[1]) * pixelsPerMeter + MARGIN * 2);
	let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
	for (const layer of model.layers) {
		for (const primitive of layer.primitives) svg += renderPrimitive(primitive, bounds, pixelsPerMeter);
	}
	return `${svg}</svg>`;
}

function renderPrimitive(primitive: PlanRenderPrimitive, bounds: LayoutBounds2, ppm: number): string {
	switch (primitive.kind) {
		case 'polygon':
			return `<polygon class="${primitive.style}" points="${primitive.points.map((point) => screenPoint(point, bounds, ppm).join(',')).join(' ')}"/>`;
		case 'polyline': {
			const points = primitive.points.map((point) => screenPoint(point, bounds, ppm));
			if (primitive.endOffsetPx) {
				const last = points.at(-1)!;
				points[points.length - 1] = [last[0] + primitive.endOffsetPx[0], last[1] + primitive.endOffsetPx[1]];
			}
			return `<polyline class="${primitive.style}" points="${points.map((point) => point.join(',')).join(' ')}"/>`;
		}
		case 'circle': {
			const [x, y] = screenPoint(primitive.center, bounds, ppm);
			const cx = x + (primitive.offsetPx?.[0] ?? 0);
			const cy = y + (primitive.offsetPx?.[1] ?? 0);
			return `<circle class="${primitive.style}" cx="${round(cx)}" cy="${round(cy)}" r="${primitive.radiusPx}"/>`;
		}
		case 'text': {
			const [x, y] = screenPoint(primitive.anchor, bounds, ppm);
			const tx = x + (primitive.offsetPx?.[0] ?? 0);
			const ty = y + (primitive.offsetPx?.[1] ?? 0);
			const escaped = primitive.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			return `<text class="${primitive.style}" x="${round(tx)}" y="${round(ty)}">${escaped}</text>`;
		}
	}
}

function screenPoint(point: readonly [number, number], bounds: LayoutBounds2, ppm: number): [number, number] {
	return [MARGIN + (point[0] - bounds.min[0]) * ppm, MARGIN + (bounds.max[1] - point[1]) * ppm];
}

export function countSvgElements(svg: string): number {
	const matches = svg.match(/<(polygon|polyline|circle|text)\b/g);
	return matches?.length ?? 0;
}

/**
 * The render policy under which topology counts are meaningful: the surface
 * classifier drives the builder's material groups (draw calls), and the
 * per-room presentation drives material identity (materials are shared per
 * distinct tint). `excludedRoomIds` (bespoke shells) are omitted from the
 * counts, matching the live `LayoutMuseumShell` which skips them before
 * building. Counts derive from the same generated meshes the adapters render,
 * never from a "one box per span" assumption.
 */
export type WallMeshRenderPolicy = {
	classifySurface: (ref: WallMeshSectionRef) => WallMeshSurfaceKey;
	presentation: Readonly<Record<string, { tint: string }>>;
	excludedRoomIds?: readonly string[];
};

export type WallMeshRenderPolicyFactory = (compiled: CompiledLayoutGeometry) => WallMeshRenderPolicy;

export type WallMeshTopology = {
	objectCount: number;
	materialCount: number;
	drawCalls: number;
	triangles: number;
};

/**
 * Default visitor-style policy factory: one surface class per room, materials
 * shared per room tint, no room exclusions. The recorder and `/dev/perf`
 * override this for the Chopin tier with `chopinWallMeshRenderPolicyFactory`
 * (production presentation + bespoke exclusion) so the estimates match the
 * shipped `LayoutMuseumShell` scene.
 */
export function visitorWallMeshPolicy(compiled: CompiledLayoutGeometry): WallMeshRenderPolicy {
	const presentation: Record<string, { tint: string }> = {};
	for (const room of compiled.rooms) presentation[room.roomId] = { tint: deterministicRoomTint(room.roomId) };
	return { classifySurface: () => 'wall', presentation };
}

/** Deterministic valid CSS hex for a room id — stable across runs and never a `THREE.Color` "Unknown color" warning. */
function deterministicRoomTint(roomId: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < roomId.length; i += 1) {
		hash ^= roomId.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	const r = hash & 0xff;
	const g = (hash >>> 8) & 0xff;
	const b = (hash >>> 16) & 0xff;
	const hex = (value: number) => value.toString(16).padStart(2, '0');
	return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Production Chopin render-policy factory: real per-room presentation tints
 * plus the bespoke-room exclusion, so the topology estimates match the live
 * `LayoutMuseumShell` scene (6 rooms) instead of the synthetic per-room tint +
 * all-7-rooms visitor default. Lives here (not in the recorder) because
 * `record-baseline.ts` imports Node builtins and cannot be bundled into the
 * browser `MeasureBrowserTier`/`/dev/perf` path. Built once per measurement
 * from the production presentation constants, never from a second compiled
 * instance.
 */
export function chopinWallMeshRenderPolicyFactory(): WallMeshRenderPolicyFactory {
	const presentation: Record<string, { tint: string }> = {};
	const excludedRoomIds: string[] = [];
	for (const [roomId, room] of Object.entries(chopinRoomPresentation)) {
		presentation[roomId] = { tint: room.color };
		if (room.shell === 'bespoke') excludedRoomIds.push(roomId);
	}
	return () => ({ classifySurface: () => 'wall', presentation, excludedRoomIds });
}

/**
 * Indexed wall-mesh topology estimate: builds every room's `IndexedWallMesh`
 * under the given policy and counts meshes, distinct materials, draw-call
 * groups, and triangles from the real output (the G4 replacement for the old
 * one-box-per-span `analyticalThreeCounts`).
 */
export function estimateWallMeshTopology(
	compiled: CompiledLayoutGeometry,
	policy: WallMeshRenderPolicy
): WallMeshTopology {
	let objectCount = 0;
	let drawCalls = 0;
	let triangles = 0;
	const tints = new Set<string>();
	const excluded = policy.excludedRoomIds ?? [];
	for (const room of compiled.rooms) {
		// Bespoke-shell rooms are omitted here exactly as LayoutMuseumShell
		// omits them before building, so the estimates match the live scene.
		if (excluded.includes(room.roomId)) continue;
		const result = buildRoomWallMesh(room, { classifySurface: policy.classifySurface });
		if (!result.mesh) {
			const details = result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ');
			throw new Error(`wall mesh build failed for room ${room.roomId}: ${details}`);
		}
		objectCount += 1;
		drawCalls += result.mesh.materialGroups.length;
		triangles += result.mesh.indices.length / 3;
		tints.add(policy.presentation[room.roomId]?.tint ?? room.roomId);
	}
	return { objectCount, materialCount: tints.size, drawCalls, triangles };
}

export function measureBrowserTier(
	fixture: LayoutDocument,
	tier: BenchTier,
	provenance: BenchProvenance,
	options: BrowserTierOptions = {},
	seed?: number
): BenchTierResult {
	const ppm = options.pixelsPerMeter ?? DEFAULT_PPM;
	const warmup = options.warmup ?? 2;
	const samples = options.samples ?? 5;
	// Stamp the actual run configuration so the report reflects what ran.
	const effectiveProvenance: BenchProvenance = { ...provenance, warmup, samples };
	const compiled = compileLayoutGeometry(fixture).geometry;
	const model = buildPlanRenderModel(compiled);
	const result: BenchSample[] = [];

	const initial = timeOp(() => renderPlanModelToSvg(model, ppm), { warmup, samples });
	result.push(msSample('plan-render-initial', initial));
	result.push({ metric: 'svg-node-count', unit: 'nodes', value: countSvgElements(renderPlanModelToSvg(model, ppm)) });

	// Synchronous model→SVG render work at a cycling zoom level. This is the
	// deterministic work-per-frame proxy, not a measured rAF frame time; a real
	// scripted viewport driver (PlanSvg DOM paint + rAF loop) is a follow-up.
	let tick = 0;
	const panZoom = timeOp(
		() => {
			tick += 1;
			return renderPlanModelToSvg(model, ppm * (0.5 + ((tick % 5) * 0.25)));
		},
		{ warmup, samples }
	);
	result.push(msSample('plan-render-work-pan-zoom', panZoom));

	// Synchronous rebuild + render work for a transient edit (model rebuild path).
	const edit = timeOp(() => renderPlanModelToSvg(buildPlanRenderModel(compiled), ppm), { warmup, samples });
	result.push(msSample('plan-render-work-edit', edit));

	const policyFactory = options.policyFactory ?? visitorWallMeshPolicy;
	const counts = estimateWallMeshTopology(compiled, policyFactory(compiled));
	result.push({ metric: 'three-object-estimate', unit: 'count', value: counts.objectCount });
	result.push({ metric: 'three-material-estimate', unit: 'count', value: counts.materialCount });
	result.push({ metric: 'three-draw-call-estimate', unit: 'count', value: counts.drawCalls });
	result.push({ metric: 'three-triangle-estimate', unit: 'count', value: counts.triangles });

	// Best-effort browser-exposed memory (Chromium only; absent elsewhere).
	const heap = browserHeapBytes();
	if (heap !== null) result.push({ metric: 'memory-heap', unit: 'bytes', value: heap });

	return {
		tier,
		...(seed === undefined ? {} : { seed }),
		roomCount: countRooms(fixture),
		provenance: effectiveProvenance,
		samples: result
	};
}

function msSample(metric: BenchSample['metric'], timing: { value: number; p50: number; p95: number }): BenchSample {
	return { metric, unit: 'ms', value: timing.value, p50: timing.p50, p95: timing.p95 };
}

function browserHeapBytes(): number | null {
	if (typeof performance === 'undefined') return null;
	const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
	return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
}

function countRooms(document: LayoutDocument): number {
	return document.floors.reduce((sum, floor) => sum + floor.rooms.length, 0);
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
