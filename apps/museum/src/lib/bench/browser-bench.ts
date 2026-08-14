import type { LayoutDocument } from '$lib/layout/layout-types';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import {
	buildPlanRenderModel,
	type PlanRenderModel,
	type PlanRenderPrimitive
} from '$lib/layout/plan-render-model';
import type { CompiledLayoutGeometry, LayoutBounds2 } from '$lib/layout/layout-geometry-types';
import { timeOp } from './bench-harness';
import type { BenchProvenance, BenchSample, BenchTier, BenchTierResult } from './bench-types';

export type BrowserTierOptions = {
	pixelsPerMeter?: number;
	warmup?: number;
	samples?: number;
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

export type AnalyticalThreeCounts = {
	objectCount: number;
	materialCount: number;
	drawCalls: number;
	triangles: number;
};

/** Chord-box resource estimate from compiled solid spans (one box per span). */
export function analyticalThreeCounts(compiled: CompiledLayoutGeometry): AnalyticalThreeCounts {
	let spanCount = 0;
	const wallGroups = new Set<string>();
	for (const room of compiled.rooms) {
		for (const wall of room.walls) {
			if (wall.solidSpans.length > 0) wallGroups.add(`${room.roomId}\u0000${wall.segmentId}`);
			spanCount += wall.solidSpans.length;
		}
	}
	return {
		objectCount: spanCount,
		materialCount: wallGroups.size,
		drawCalls: spanCount,
		triangles: spanCount * 12
	};
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

	// Three regeneration proxy: the solid-span derivation pass the chord-box
	// adapter runs per rebuild (G4 target), without instantiating Three objects.
	const regen = timeOp(() => deriveSpanPass(compiled), { warmup, samples });
	result.push(msSample('three-regen', regen));

	const counts = analyticalThreeCounts(compiled);
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

/** Derive chord-box parameters for every solid span (no Three allocation). */
function deriveSpanPass(compiled: CompiledLayoutGeometry): number {
	let count = 0;
	for (const room of compiled.rooms) {
		for (const wall of room.walls) {
			for (const span of wall.solidSpans) {
				const length = Math.hypot(span.end[0] - span.start[0], span.end[1] - span.start[1]);
				const height = Math.max(0.001, span.topY - span.bottomY);
				count += length + height;
			}
		}
	}
	return count;
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
