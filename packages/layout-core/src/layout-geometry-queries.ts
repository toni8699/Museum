import type { LayoutVec2 } from './layout-types';
import type {
	CompiledLayoutGeometry,
	CompiledQueryAabb,
	CompiledQueryPoint,
	CompiledQueryPolygon,
	CompiledQuerySpan,
	LayoutBounds2
} from './layout-geometry-types';
import { pointInPolygon } from './layout-geometry-objects';

export type { CompiledQueryPoint, CompiledQuerySpan, CompiledQueryPolygon, CompiledQueryAabb };

export type QueryGeometryBuilder = {
	points: CompiledQueryPoint[];
	spans: CompiledQuerySpan[];
	polygons: CompiledQueryPolygon[];
	aabbs: CompiledQueryAabb[];
};

export function createQueryGeometryBuilder(): QueryGeometryBuilder {
	return { points: [], spans: [], polygons: [], aabbs: [] };
}

export function bounds2(minX: number, minZ: number, maxX: number, maxZ: number): LayoutBounds2 {
	return { min: [minX, minZ], max: [maxX, maxZ] };
}

export function polygonBounds2(polygon: readonly LayoutVec2[]): LayoutBounds2 | null {
	if (polygon.length === 0) return null;
	let minX = Infinity;
	let minZ = Infinity;
	let maxX = -Infinity;
	let maxZ = -Infinity;
	for (const [x, z] of polygon) {
		minX = Math.min(minX, x);
		minZ = Math.min(minZ, z);
		maxX = Math.max(maxX, x);
		maxZ = Math.max(maxZ, z);
	}
	return bounds2(minX, minZ, maxX, maxZ);
}

export type QueryProjection = {
	span: CompiledQuerySpan;
	point: LayoutVec2;
	offset: number;
	distance: number;
	t: number;
};

/** Nearest-span projection over compiled query spans (linear reference). */
export function projectPointToSpans(point: LayoutVec2, spans: readonly CompiledQuerySpan[]): QueryProjection | null {
	let best: QueryProjection | null = null;
	for (const span of spans) {
		const dx = span.end[0] - span.start[0];
		const dz = span.end[1] - span.start[1];
		const squared = dx * dx + dz * dz;
		const rawT = squared > 0 ? ((point[0] - span.start[0]) * dx + (point[1] - span.start[1]) * dz) / squared : 0;
		const amount = Math.min(1, Math.max(0, rawT));
		const projected: LayoutVec2 = [span.start[0] + dx * amount, span.start[1] + dz * amount];
		const distanceToPath = Math.hypot(point[0] - projected[0], point[1] - projected[1]);
		const offset = span.startDistance + (span.endDistance - span.startDistance) * amount;
		const t = (span.startT ?? 0) + ((span.endT ?? span.startT ?? 0) - (span.startT ?? 0)) * amount;
		if (!best || distanceToPath < best.distance) {
			best = { span, point: projected, offset, distance: distanceToPath, t };
		}
	}
	return best;
}

export function findPolygonContaining(point: LayoutVec2, polygons: readonly CompiledQueryPolygon[]): CompiledQueryPolygon | null {
	for (const polygon of [...polygons].reverse()) {
		if (pointInPolygon(point, polygon.polygon)) return polygon;
	}
	return null;
}

/** Flat compiled query records exposed for consumers + a future spatial index. */
export function compiledQueryGeometry(geometry: CompiledLayoutGeometry) {
	return geometry.queries;
}
