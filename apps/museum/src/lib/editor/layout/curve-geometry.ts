import { autoBezierAnchorPoints, compileAutoBezierAnchors, type CubicBezierShape } from './layout-auto-bezier';
import type { DraftSegment, LayoutVec2 } from './layout-types';

export const CURVE_ENDPOINT_EPSILON = 1e-6;
export const CURVE_FLATNESS_TOLERANCE = 0.01;
export const CURVE_MAX_SAMPLE_SPAN = 0.25;
export const CURVE_SELF_INTERSECTION_TOLERANCE = 1e-4;

export type { CubicBezierShape };

export type CurveSample = {
	point: LayoutVec2;
	distance: number;
	tangent: LayoutVec2;
	normal: LayoutVec2;
	t: number;
};

export type CurveDistanceResult = {
	point: LayoutVec2;
	distance: number;
	tangent: LayoutVec2;
	normal: LayoutVec2;
	t: number;
};

export type SampledSegment = {
	segmentId: string;
	length: number;
	samples: CurveSample[];
};

export function cubicBezierPoint(segment: CubicBezierShape, t: number): LayoutVec2 {
	const u = 1 - clamp01(t);
	const tt = clamp01(t);
	return [
		u * u * u * segment.start[0] + 3 * u * u * tt * segment.handleOut[0] + 3 * u * tt * tt * segment.handleIn[0] + tt * tt * tt * segment.end[0],
		u * u * u * segment.start[1] + 3 * u * u * tt * segment.handleOut[1] + 3 * u * tt * tt * segment.handleIn[1] + tt * tt * tt * segment.end[1]
	];
}

export function cubicBezierDerivative(segment: CubicBezierShape, t: number): LayoutVec2 {
	const u = 1 - clamp01(t);
	const tt = clamp01(t);
	return [
		3 * u * u * (segment.handleOut[0] - segment.start[0]) + 6 * u * tt * (segment.handleIn[0] - segment.handleOut[0]) + 3 * tt * tt * (segment.end[0] - segment.handleIn[0]),
		3 * u * u * (segment.handleOut[1] - segment.start[1]) + 6 * u * tt * (segment.handleIn[1] - segment.handleOut[1]) + 3 * tt * tt * (segment.end[1] - segment.handleIn[1])
	];
}

export function segmentPointAt(segment: DraftSegment, t: number): LayoutVec2 {
	if (segment.kind === 'line') {
		const amount = clamp01(t);
		return [
			segment.start[0] + (segment.end[0] - segment.start[0]) * amount,
			segment.start[1] + (segment.end[1] - segment.start[1]) * amount
		];
	}
	return autoBezierPointAt(segment, t);
}

export function segmentTangentAt(segment: DraftSegment, t: number): LayoutVec2 {
	if (segment.kind === 'line') return normalize([segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]], [1, 0]);
	return normalize(autoBezierDerivativeAt(segment, t), fallbackTangent(segment));
}

export function segmentLength(segment: DraftSegment): number {
	return sampleSegment(segment).length;
}

export function sampleSegment(
	segment: DraftSegment,
	options: { flatnessTolerance?: number; maxSampleSpan?: number; maxDepth?: number } = {}
): SampledSegment {
	const flatnessTolerance = options.flatnessTolerance ?? CURVE_FLATNESS_TOLERANCE;
	const maxSampleSpan = options.maxSampleSpan ?? CURVE_MAX_SAMPLE_SPAN;
	const maxDepth = options.maxDepth ?? 12;
	if (segment.kind === 'line') {
		const parameters = lineParameters(segment, maxSampleSpan);
		return buildSampledSegment(
			segment.id,
			parameters.map((t) => ({ point: segmentPointAt(segment, t), t })),
			segment
		);
	}

	const cubics = compileAutoBezierAnchors(autoBezierAnchorPoints(segment));
	const pointsWithT: { point: LayoutVec2; t: number }[] = [];
	for (const [cubicIndex, cubic] of cubics.entries()) {
		const localParameters = adaptiveParameters(cubic, flatnessTolerance, maxSampleSpan, maxDepth);
		for (const [parameterIndex, localT] of localParameters.entries()) {
			if (cubicIndex > 0 && parameterIndex === 0) continue;
			const globalT = cubics.length <= 1 ? localT : (cubicIndex + localT) / cubics.length;
			pointsWithT.push({ point: cubicBezierPoint(cubic, localT), t: globalT });
		}
	}
	if (pointsWithT.length === 0) {
		pointsWithT.push({ point: [...segment.start], t: 0 }, { point: [...segment.end], t: 1 });
	}
	return buildSampledSegment(segment.id, pointsWithT, segment);
}

export function pointAtDistance(sampled: SampledSegment, distanceAlong: number): CurveDistanceResult {
	const samples = sampled.samples;
	if (samples.length === 0) return { point: [0, 0], distance: 0, tangent: [1, 0], normal: [0, 1], t: 0 };
	if (samples.length === 1 || sampled.length <= CURVE_ENDPOINT_EPSILON) return { ...samples[0]!, point: [...samples[0]!.point] };
	const target = Math.min(sampled.length, Math.max(0, distanceAlong));
	let high = samples.length - 1;
	let low = 0;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (samples[middle]!.distance < target) low = middle + 1;
		else high = middle;
	}
	const endIndex = Math.max(1, low);
	const start = samples[endIndex - 1]!;
	const end = samples[endIndex]!;
	const span = end.distance - start.distance;
	const amount = span > CURVE_ENDPOINT_EPSILON ? (target - start.distance) / span : 0;
	const tangent = normalize(lerp(start.tangent, end.tangent, amount), start.tangent);
	return {
		point: lerp(start.point, end.point, amount),
		distance: target,
		tangent,
		normal: [-tangent[1], tangent[0]],
		t: start.t + (end.t - start.t) * amount
	};
}

export function projectPointToSampledSegment(point: LayoutVec2, sampled: SampledSegment): CurveDistanceResult & { distanceToPath: number } {
	let best: CurveDistanceResult & { distanceToPath: number } | null = null;
	for (let index = 1; index < sampled.samples.length; index += 1) {
		const start = sampled.samples[index - 1]!;
		const end = sampled.samples[index]!;
		const dx = end.point[0] - start.point[0];
		const dz = end.point[1] - start.point[1];
		const squared = dx * dx + dz * dz;
		const rawT = squared > 0 ? ((point[0] - start.point[0]) * dx + (point[1] - start.point[1]) * dz) / squared : 0;
		const amount = Math.min(1, Math.max(0, rawT));
		const projected = [start.point[0] + dx * amount, start.point[1] + dz * amount] as LayoutVec2;
		const tangent = normalize(lerp(start.tangent, end.tangent, amount), start.tangent);
		const candidate = {
			point: projected,
			distance: start.distance + (end.distance - start.distance) * amount,
			tangent,
			normal: [-tangent[1], tangent[0]] as LayoutVec2,
			t: start.t + (end.t - start.t) * amount,
			distanceToPath: distance(point, projected)
		};
		if (!best || candidate.distanceToPath < best.distanceToPath) best = candidate;
	}
	return best ?? { ...pointAtDistance(sampled, 0), distanceToPath: distance(point, sampled.samples[0]?.point ?? [0, 0]) };
}

export function sampledPolylineIntersects(
	first: readonly CurveSample[],
	second: readonly CurveSample[],
	tolerance = CURVE_SELF_INTERSECTION_TOLERANCE,
	ignoreSharedEndpoint?: LayoutVec2
): boolean {
	for (let firstIndex = 1; firstIndex < first.length; firstIndex += 1) {
		for (let secondIndex = 1; secondIndex < second.length; secondIndex += 1) {
			const firstStart = first[firstIndex - 1]!.point;
			const firstEnd = first[firstIndex]!.point;
			const secondStart = second[secondIndex - 1]!.point;
			const secondEnd = second[secondIndex]!.point;
			if (ignoreSharedEndpoint && ((samePoint(firstEnd, ignoreSharedEndpoint, tolerance) && samePoint(secondStart, ignoreSharedEndpoint, tolerance)) || (samePoint(firstStart, ignoreSharedEndpoint, tolerance) && samePoint(secondEnd, ignoreSharedEndpoint, tolerance)))) continue;
			if (polylineSegmentsIntersect(firstStart, firstEnd, secondStart, secondEnd, tolerance)) return true;
		}
	}
	return false;
}

export function sampledPolylineSelfIntersects(
	samples: readonly CurveSample[],
	tolerance = CURVE_SELF_INTERSECTION_TOLERANCE
): boolean {
	for (let firstIndex = 0; firstIndex < samples.length - 1; firstIndex += 1) {
		for (let secondIndex = firstIndex + 2; secondIndex < samples.length - 1; secondIndex += 1) {
			if (firstIndex === 0 && secondIndex === samples.length - 2) continue;
			if (polylineSegmentsIntersect(samples[firstIndex]!.point, samples[firstIndex + 1]!.point, samples[secondIndex]!.point, samples[secondIndex + 1]!.point, tolerance)) return true;
		}
	}
	return false;
}

function buildSampledSegment(
	segmentId: string,
	pointsWithT: readonly { point: LayoutVec2; t: number }[],
	segment: DraftSegment
): SampledSegment {
	const points = pointsWithT.map((entry) => entry.point);
	const distances = [0];
	for (let index = 1; index < points.length; index += 1) {
		distances.push(distances[index - 1]! + distance(points[index - 1]!, points[index]!));
	}
	const length = distances.at(-1) ?? 0;
	const samples = pointsWithT.map((entry, index) => {
		const tangent = tangentFromSamples(points, index, segment, entry.t);
		return {
			point: [...entry.point] as LayoutVec2,
			distance: distances[index]!,
			tangent,
			normal: [-tangent[1], tangent[0]] as LayoutVec2,
			t: entry.t
		};
	});
	return { segmentId, length, samples };
}

function autoBezierPointAt(segment: Extract<DraftSegment, { kind: 'auto-bezier' }>, t: number): LayoutVec2 {
	const { cubic, localT } = resolveAutoBezierCubic(segment, t);
	return cubicBezierPoint(cubic, localT);
}

function autoBezierDerivativeAt(segment: Extract<DraftSegment, { kind: 'auto-bezier' }>, t: number): LayoutVec2 {
	const { cubic, localT } = resolveAutoBezierCubic(segment, t);
	return cubicBezierDerivative(cubic, localT);
}

function resolveAutoBezierCubic(
	segment: Extract<DraftSegment, { kind: 'auto-bezier' }>,
	t: number
): { cubic: CubicBezierShape; localT: number } {
	const cubics = compileAutoBezierAnchors(autoBezierAnchorPoints(segment));
	if (cubics.length === 0) {
		return {
			cubic: { start: [...segment.start], handleOut: [...segment.start], handleIn: [...segment.end], end: [...segment.end] },
			localT: clamp01(t)
		};
	}
	if (cubics.length === 1) return { cubic: cubics[0]!, localT: clamp01(t) };
	const clamped = clamp01(t);
	const scaled = clamped * cubics.length;
	const index = Math.min(cubics.length - 1, Math.floor(scaled));
	const localT = index === cubics.length - 1 ? scaled - index : Math.min(1, scaled - index);
	return { cubic: cubics[index]!, localT };
}

function lineParameters(segment: Extract<DraftSegment, { kind: 'line' }>, maxSampleSpan: number): number[] {
	const length = Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]);
	if (length <= CURVE_ENDPOINT_EPSILON) return [0, 1];
	const steps = Math.max(1, Math.ceil(length / Math.max(maxSampleSpan, CURVE_ENDPOINT_EPSILON)));
	const parameters: number[] = [];
	for (let index = 0; index <= steps; index += 1) parameters.push(index / steps);
	return parameters;
}

function adaptiveParameters(
	segment: CubicBezierShape,
	flatnessTolerance: number,
	maxSampleSpan: number,
	maxDepth: number
): number[] {
	const result: number[] = [0];
	function visit(t0: number, t1: number, depth: number): void {
		const p0 = cubicBezierPoint(segment, t0);
		const p1 = cubicBezierPoint(segment, t1);
		const tm = (t0 + t1) / 2;
		const pm = cubicBezierPoint(segment, tm);
		const flatness = distanceToLine(pm, p0, p1);
		const chord = distance(p0, p1);
		if (depth < maxDepth && (flatness > flatnessTolerance || chord > maxSampleSpan)) {
			visit(t0, tm, depth + 1);
			visit(tm, t1, depth + 1);
			return;
		}
		result.push(t1);
	}
	visit(0, 1, 0);
	return [...new Set(result)].sort((a, b) => a - b);
}

function tangentFromSamples(points: readonly LayoutVec2[], index: number, segment: DraftSegment, t: number): LayoutVec2 {
	const tangent = segmentTangentAt(segment, t);
	if (length(tangent) > CURVE_ENDPOINT_EPSILON) return tangent;
	if (index > 0) return normalize(subtract(points[index]!, points[index - 1]!), [1, 0]);
	return index + 1 < points.length ? normalize(subtract(points[index + 1]!, points[index]!), [1, 0]) : [1, 0];
}

function fallbackTangent(segment: Extract<DraftSegment, { kind: 'auto-bezier' }>): LayoutVec2 {
	return normalize(subtract(segment.end, segment.start), [1, 0]);
}

function polylineSegmentsIntersect(a0: LayoutVec2, a1: LayoutVec2, b0: LayoutVec2, b1: LayoutVec2, distanceTolerance: number): boolean {
	const lenA = Math.max(distance(a0, a1), CURVE_ENDPOINT_EPSILON);
	const lenB = Math.max(distance(b0, b1), CURVE_ENDPOINT_EPSILON);
	const orientTolA = distanceTolerance * lenA;
	const orientTolB = distanceTolerance * lenB;
	const firstStart = orientation(a0, a1, b0);
	const firstEnd = orientation(a0, a1, b1);
	const secondStart = orientation(b0, b1, a0);
	const secondEnd = orientation(b0, b1, a1);
	const crosses =
		((firstStart > orientTolA && firstEnd < -orientTolA) || (firstStart < -orientTolA && firstEnd > orientTolA)) &&
		((secondStart > orientTolB && secondEnd < -orientTolB) || (secondStart < -orientTolB && secondEnd > orientTolB));
	if (crosses) return true;
	return (
		(Math.abs(firstStart) <= orientTolA && onSegmentWithTolerance(a0, a1, b0, distanceTolerance)) ||
		(Math.abs(firstEnd) <= orientTolA && onSegmentWithTolerance(a0, a1, b1, distanceTolerance)) ||
		(Math.abs(secondStart) <= orientTolB && onSegmentWithTolerance(b0, b1, a0, distanceTolerance)) ||
		(Math.abs(secondEnd) <= orientTolB && onSegmentWithTolerance(b0, b1, a1, distanceTolerance))
	);
}

function orientation(a: LayoutVec2, b: LayoutVec2, c: LayoutVec2): number {
	return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegmentWithTolerance(a: LayoutVec2, b: LayoutVec2, point: LayoutVec2, tolerance: number): boolean {
	return point[0] >= Math.min(a[0], b[0]) - tolerance && point[0] <= Math.max(a[0], b[0]) + tolerance && point[1] >= Math.min(a[1], b[1]) - tolerance && point[1] <= Math.max(a[1], b[1]) + tolerance;
}

function samePoint(a: LayoutVec2, b: LayoutVec2, tolerance: number): boolean {
	return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

function normalize(vector: LayoutVec2, fallback: LayoutVec2): LayoutVec2 {
	const magnitude = length(vector);
	return magnitude > CURVE_ENDPOINT_EPSILON ? [vector[0] / magnitude, vector[1] / magnitude] : [...fallback];
}

function lerp(a: LayoutVec2, b: LayoutVec2, amount: number): LayoutVec2 {
	return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
}

function subtract(a: LayoutVec2, b: LayoutVec2): LayoutVec2 {
	return [a[0] - b[0], a[1] - b[1]];
}

function distance(a: LayoutVec2, b: LayoutVec2): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function length(vector: LayoutVec2): number {
	return Math.hypot(vector[0], vector[1]);
}

function distanceToLine(point: LayoutVec2, start: LayoutVec2, end: LayoutVec2): number {
	const span = distance(start, end);
	if (span <= CURVE_ENDPOINT_EPSILON) return distance(point, start);
	return Math.abs((end[0] - start[0]) * (start[1] - point[1]) - (start[0] - point[0]) * (end[1] - start[1])) / span;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}
