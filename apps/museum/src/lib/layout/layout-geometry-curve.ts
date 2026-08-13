import type { DraftSegment, LayoutInteriorAnchor, LayoutVec2 } from './layout-types';

export const CURVE_ENDPOINT_EPSILON = 1e-6;
export const CURVE_FLATNESS_TOLERANCE = 0.01;
export const CURVE_MAX_SAMPLE_SPAN = 0.25;
export const CURVE_SELF_INTERSECTION_TOLERANCE = 1e-4;
export const LAYOUT_AUTO_BEZIER_ALPHA = 0.5;
export const MAX_CURVE_SAMPLES_PER_SEGMENT = 100_000;

export class LayoutGeometrySamplingError extends Error {
	constructor(
		public readonly code: 'sampling_length_invalid' | 'sampling_budget_exceeded' | 'sampling_output_invalid',
		message: string
	) {
		super(message);
		this.name = 'LayoutGeometrySamplingError';
	}
}

export type AutoBezierSegment = Extract<DraftSegment, { kind: 'auto-bezier' }>;

export type CubicBezierShape = {
	start: LayoutVec2;
	handleOut: LayoutVec2;
	handleIn: LayoutVec2;
	end: LayoutVec2;
};

export type LegacyBezierSegment = {
	id: string;
	kind: 'bezier';
	start: LayoutVec2;
	handleOut: LayoutVec2;
	handleIn: LayoutVec2;
	end: LayoutVec2;
};

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

export function autoBezierAnchorPoints(segment: AutoBezierSegment): LayoutVec2[] {
	return [segment.start, ...segment.interiorAnchors.map((anchor) => anchor.point), segment.end];
}

export function compileAutoBezierAnchors(points: readonly LayoutVec2[]): CubicBezierShape[] {
	if (points.length === 0) return [];
	if (points.length === 1) {
		const point = clonePoint(points[0]!);
		return [{ start: point, handleOut: clonePoint(point), handleIn: clonePoint(point), end: clonePoint(point) }];
	}
	if (points.length === 2 && !samePoint(points[0]!, points[1]!)) {
		const start = clonePoint(points[0]!);
		const end = clonePoint(points[1]!);
		return [{ start, handleOut: lerp(start, end, 1 / 3), handleIn: lerp(start, end, 2 / 3), end }];
	}

	const tangents = points.map((_point, index) => createAutomaticTangent(points, index));
	const cubics: CubicBezierShape[] = [];
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = clonePoint(points[index]!);
		const end = clonePoint(points[index + 1]!);
		const interval = centripetalInterval(start, end);
		if (interval === 0) {
			cubics.push({ start, handleOut: clonePoint(start), handleIn: clonePoint(end), end });
			continue;
		}
		cubics.push({
			start,
			handleOut: addScaled(start, tangents[index]!, interval / 3),
			handleIn: addScaled(end, tangents[index + 1]!, -interval / 3),
			end
		});
	}
	return cubics;
}

export function legacyBezierToAutoBezier(segment: LegacyBezierSegment): AutoBezierSegment {
	const mid = evaluateCubicBezierPoint(
		{ start: segment.start, handleOut: segment.handleOut, handleIn: segment.handleIn, end: segment.end },
		0.5
	);
	return {
		id: segment.id,
		kind: 'auto-bezier',
		start: clonePoint(segment.start),
		end: clonePoint(segment.end),
		interiorAnchors: [{ id: nextInteriorAnchorId(segment.id, []), point: mid }]
	};
}

export function nextInteriorAnchorId(segmentId: string, existing: readonly LayoutInteriorAnchor[]): string {
	const used = new Set(existing.map((anchor) => anchor.id));
	let index = existing.length + 1;
	while (used.has(`${segmentId}:anchor:${index}`)) index += 1;
	return `${segmentId}:anchor:${index}`;
}

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
	options: {
		flatnessTolerance?: number;
		maxSampleSpan?: number;
		maxDepth?: number;
		maxSamples?: number;
	} = {}
): SampledSegment {
	const flatnessTolerance = options.flatnessTolerance ?? CURVE_FLATNESS_TOLERANCE;
	const maxSampleSpan = options.maxSampleSpan ?? CURVE_MAX_SAMPLE_SPAN;
	const maxDepth = options.maxDepth ?? 12;
	const maxSamples = options.maxSamples ?? MAX_CURVE_SAMPLES_PER_SEGMENT;
	assertFiniteSamplingInput(segment);
	if (segment.kind === 'line') {
		const parameters = lineParameters(segment, maxSampleSpan, maxSamples);
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
			if (pointsWithT.length >= maxSamples) {
				throw new LayoutGeometrySamplingError(
					'sampling_budget_exceeded',
					`Segment requires more than ${maxSamples} curve samples.`
				);
			}
			const globalT = cubics.length <= 1 ? localT : (cubicIndex + localT) / cubics.length;
			const point = cubicBezierPoint(cubic, localT);
			if (!point.every(Number.isFinite)) {
				throw new LayoutGeometrySamplingError(
					'sampling_output_invalid',
					'Segment sampling produced a non-finite point.'
				);
			}
			pointsWithT.push({ point, t: globalT });
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

/** Points along a compiled sample range [start, end] including exact clipped endpoints. */
export function samplePolylineInRange(
	samples: readonly CurveSample[],
	startDistance: number,
	endDistance: number
): LayoutVec2[] {
	if (samples.length === 0 || endDistance <= startDistance + 1e-6) return [];
	const points: LayoutVec2[] = [pointAlongSamples(samples, startDistance)];
	for (const sample of samples) {
		if (sample.distance > startDistance + 1e-6 && sample.distance < endDistance - 1e-6) {
			points.push([...sample.point] as LayoutVec2);
		}
	}
	points.push(pointAlongSamples(samples, endDistance));
	return points;
}

export function pointAlongSamples(samples: readonly CurveSample[], distanceAlong: number): LayoutVec2 {
	if (samples.length === 0) return [0, 0];
	if (samples.length === 1) return [...samples[0]!.point] as LayoutVec2;
	const target = Math.min(samples.at(-1)!.distance, Math.max(0, distanceAlong));
	for (let index = 1; index < samples.length; index += 1) {
		const start = samples[index - 1]!;
		const end = samples[index]!;
		if (target <= end.distance + 1e-9) {
			const span = end.distance - start.distance;
			const amount = span > 1e-9 ? (target - start.distance) / span : 0;
			return [
				start.point[0] + (end.point[0] - start.point[0]) * amount,
				start.point[1] + (end.point[1] - start.point[1]) * amount
			];
		}
	}
	return [...samples.at(-1)!.point] as LayoutVec2;
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

function lineParameters(
	segment: Extract<DraftSegment, { kind: 'line' }>,
	maxSampleSpan: number,
	maxSamples: number
): number[] {
	const dx = segment.end[0] - segment.start[0];
	const dz = segment.end[1] - segment.start[1];
	const length = Math.hypot(dx, dz);
	if (!Number.isFinite(length)) {
		throw new LayoutGeometrySamplingError(
			'sampling_length_invalid',
			'Segment derived length must be finite.'
		);
	}
	if (length <= CURVE_ENDPOINT_EPSILON) return [0, 1];
	const steps = Math.max(1, Math.ceil(length / Math.max(maxSampleSpan, CURVE_ENDPOINT_EPSILON)));
	if (!Number.isSafeInteger(steps) || steps + 1 > maxSamples) {
		throw new LayoutGeometrySamplingError(
			'sampling_budget_exceeded',
			`Segment requires more than ${maxSamples} curve samples.`
		);
	}
	const parameters: number[] = [];
	for (let index = 0; index <= steps; index += 1) parameters.push(index / steps);
	return parameters;
}

function assertFiniteSamplingInput(segment: DraftSegment): void {
	const points = segment.kind === 'line'
		? [segment.start, segment.end]
		: [segment.start, ...segment.interiorAnchors.map((anchor) => anchor.point), segment.end];
	if (!points.every((point) => point.every(Number.isFinite))) {
		throw new LayoutGeometrySamplingError(
			'sampling_output_invalid',
			'Segment points must be finite before sampling.'
		);
	}
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1]!;
		const current = points[index]!;
		const dx = current[0] - previous[0];
		const dz = current[1] - previous[1];
		if (!Number.isFinite(dx) || !Number.isFinite(dz) || !Number.isFinite(Math.hypot(dx, dz))) {
			throw new LayoutGeometrySamplingError(
				'sampling_length_invalid',
				'Segment derived length must be finite.'
			);
		}
	}
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

function evaluateCubicBezierPoint(segment: CubicBezierShape, t: number): LayoutVec2 {
	const tt = Math.min(1, Math.max(0, t));
	const u = 1 - tt;
	return [
		u * u * u * segment.start[0] + 3 * u * u * tt * segment.handleOut[0] + 3 * u * tt * tt * segment.handleIn[0] + tt * tt * tt * segment.end[0],
		u * u * u * segment.start[1] + 3 * u * u * tt * segment.handleOut[1] + 3 * u * tt * tt * segment.handleIn[1] + tt * tt * tt * segment.end[1]
	];
}

function createAutomaticTangent(points: readonly LayoutVec2[], index: number): LayoutVec2 {
	const point = points[index]!;
	const previous = nearestDistinctPoint(points, index, -1);
	const next = nearestDistinctPoint(points, index, 1);

	if (!previous && !next) return [0, 0];

	if (!previous) {
		const interval = centripetalInterval(point, next!);
		return divide(subtract(next!, point), interval);
	}

	if (!next) {
		const interval = centripetalInterval(previous, point);
		return divide(subtract(point, previous), interval);
	}

	const previousInterval = centripetalInterval(previous, point);
	const nextInterval = centripetalInterval(point, next);
	const incoming = scale(subtract(point, previous), nextInterval / previousInterval);
	const outgoing = scale(subtract(next, point), previousInterval / nextInterval);
	return divide(add(incoming, outgoing), previousInterval + nextInterval);
}

function nearestDistinctPoint(
	points: readonly LayoutVec2[],
	index: number,
	direction: -1 | 1
): LayoutVec2 | null {
	const point = points[index]!;
	for (
		let candidateIndex = index + direction;
		candidateIndex >= 0 && candidateIndex < points.length;
		candidateIndex += direction
	) {
		const candidate = points[candidateIndex]!;
		if (!samePoint(candidate, point)) return candidate;
	}
	return null;
}

function centripetalInterval(from: LayoutVec2, to: LayoutVec2): number {
	return Math.pow(distance(from, to), LAYOUT_AUTO_BEZIER_ALPHA);
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

function samePoint(a: LayoutVec2, b: LayoutVec2, tolerance = 0): boolean {
	return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

function clonePoint(point: LayoutVec2): LayoutVec2 {
	return [point[0], point[1]];
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

function add(a: LayoutVec2, b: LayoutVec2): LayoutVec2 {
	return [a[0] + b[0], a[1] + b[1]];
}

function scale(vector: LayoutVec2, amount: number): LayoutVec2 {
	return [vector[0] * amount, vector[1] * amount];
}

function addScaled(point: LayoutVec2, direction: LayoutVec2, amount: number): LayoutVec2 {
	return [point[0] + direction[0] * amount, point[1] + direction[1] * amount];
}

function divide(vector: LayoutVec2, divisor: number): LayoutVec2 {
	if (divisor === 0) return [0, 0];
	return [vector[0] / divisor, vector[1] / divisor];
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
