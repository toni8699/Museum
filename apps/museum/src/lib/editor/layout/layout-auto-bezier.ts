import type { DraftSegment, LayoutInteriorAnchor, LayoutVec2 } from './layout-types';

export const LAYOUT_AUTO_BEZIER_ALPHA = 0.5;

export type AutoBezierSegment = Extract<DraftSegment, { kind: 'auto-bezier' }>;

export type { LayoutInteriorAnchor };

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
		return [
			{
				start,
				handleOut: lerp(start, end, 1 / 3),
				handleIn: lerp(start, end, 2 / 3),
				end
			}
		];
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
		{
			start: segment.start,
			handleOut: segment.handleOut,
			handleIn: segment.handleIn,
			end: segment.end
		},
		0.5
	);
	return {
		id: segment.id,
		kind: 'auto-bezier',
		start: clonePoint(segment.start),
		end: clonePoint(segment.end),
		interiorAnchors: [
			{
				id: nextInteriorAnchorId(segment.id, []),
				point: mid
			}
		]
	};
}

export function nextInteriorAnchorId(segmentId: string, existing: readonly LayoutInteriorAnchor[]): string {
	const used = new Set(existing.map((anchor) => anchor.id));
	let index = existing.length + 1;
	while (used.has(`${segmentId}:anchor:${index}`)) index += 1;
	return `${segmentId}:anchor:${index}`;
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

function clonePoint(point: LayoutVec2): LayoutVec2 {
	return [point[0], point[1]];
}

function samePoint(a: LayoutVec2, b: LayoutVec2): boolean {
	return a[0] === b[0] && a[1] === b[1];
}

function distance(a: LayoutVec2, b: LayoutVec2): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function lerp(a: LayoutVec2, b: LayoutVec2, amount: number): LayoutVec2 {
	return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
}

function add(a: LayoutVec2, b: LayoutVec2): LayoutVec2 {
	return [a[0] + b[0], a[1] + b[1]];
}

function subtract(a: LayoutVec2, b: LayoutVec2): LayoutVec2 {
	return [a[0] - b[0], a[1] - b[1]];
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
