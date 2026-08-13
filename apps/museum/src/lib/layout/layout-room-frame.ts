import type { Vec3 } from '$lib/types/museum';
import type {
	DraftSegment,
	LayoutFloor,
	LayoutRoom,
	LayoutRoomFrame,
	LayoutVec2
} from './layout-types';

const EPSILON = 1e-9;
const CURVE_STEPS_PER_SPAN = 24;

export function normalizeLayoutRoomYaw(yaw: number): number {
	const normalized = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
	return Object.is(normalized, -0) || Math.abs(normalized) <= Number.EPSILON ? 0 : normalized;
}

/** Deterministic migration frame for layout v1/v2 rooms. */
export function deriveLayoutRoomFrame(room: Pick<LayoutRoom, 'boundary'>): LayoutRoomFrame {
	const points = sampledBoundary(room.boundary.segments);
	return {
		origin: polygonCentroid(points),
		yaw: firstBoundaryYaw(points)
	};
}

export function layoutRoomPoint(
	room: Pick<LayoutRoom, 'frame'>,
	floor: Pick<LayoutFloor, 'elevation'>,
	localPoint: Vec3
): Vec3 {
	const [localX, localY, localZ] = localPoint;
	const cos = Math.cos(room.frame.yaw);
	const sin = Math.sin(room.frame.yaw);
	return [
		room.frame.origin[0] + localX * cos + localZ * sin,
		floor.elevation + localY,
		room.frame.origin[1] - localX * sin + localZ * cos
	];
}

export function layoutRoomLocalPoint(
	room: Pick<LayoutRoom, 'frame'>,
	floor: Pick<LayoutFloor, 'elevation'>,
	worldPoint: Vec3
): Vec3 {
	const deltaX = worldPoint[0] - room.frame.origin[0];
	const deltaZ = worldPoint[2] - room.frame.origin[1];
	const cos = Math.cos(room.frame.yaw);
	const sin = Math.sin(room.frame.yaw);
	return [
		deltaX * cos - deltaZ * sin,
		worldPoint[1] - floor.elevation,
		deltaX * sin + deltaZ * cos
	];
}

function sampledBoundary(segments: readonly DraftSegment[]): LayoutVec2[] {
	return segments.flatMap((segment) => sampleSegmentPoints(segment).slice(0, -1));
}

function sampleSegmentPoints(segment: DraftSegment): LayoutVec2[] {
	if (segment.kind === 'line') return [[...segment.start], [...segment.end]];
	const anchors = [segment.start, ...segment.interiorAnchors.map((anchor) => anchor.point), segment.end];
	if (anchors.length < 2) return [[...segment.start], [...segment.end]];
	const points: LayoutVec2[] = [];
	for (let index = 0; index < anchors.length - 1; index += 1) {
		const p0 = anchors[Math.max(0, index - 1)]!;
		const p1 = anchors[index]!;
		const p2 = anchors[index + 1]!;
		const p3 = anchors[Math.min(anchors.length - 1, index + 2)]!;
		for (let step = 0; step <= CURVE_STEPS_PER_SPAN; step += 1) {
			if (index > 0 && step === 0) continue;
			const t = step / CURVE_STEPS_PER_SPAN;
			points.push(centripetalCatmullRomPoint(p0, p1, p2, p3, t));
		}
	}
	return points;
}

function centripetalCatmullRomPoint(
	p0: LayoutVec2,
	p1: LayoutVec2,
	p2: LayoutVec2,
	p3: LayoutVec2,
	t: number
): LayoutVec2 {
	// Stable centripetal approximation used only to migrate semantic room frames.
	const t0 = 0;
	const t1 = t0 + interval(p0, p1);
	const t2 = t1 + interval(p1, p2);
	const t3 = t2 + interval(p2, p3);
	const u = t1 + (t2 - t1) * t;
	const a1 = interpolate(p0, p1, t0, t1, u);
	const a2 = interpolate(p1, p2, t1, t2, u);
	const a3 = interpolate(p2, p3, t2, t3, u);
	const b1 = interpolate(a1, a2, t0, t2, u);
	const b2 = interpolate(a2, a3, t1, t3, u);
	return interpolate(b1, b2, t1, t2, u);
}

function interval(a: LayoutVec2, b: LayoutVec2): number {
	return Math.max(EPSILON, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
}

function interpolate(
	a: LayoutVec2,
	b: LayoutVec2,
	ta: number,
	tb: number,
	t: number
): LayoutVec2 {
	const span = Math.max(EPSILON, tb - ta);
	return [((tb - t) * a[0] + (t - ta) * b[0]) / span, ((tb - t) * a[1] + (t - ta) * b[1]) / span];
}

function polygonCentroid(points: readonly LayoutVec2[]): LayoutVec2 {
	if (points.length === 0) return [0, 0];
	let twiceArea = 0;
	let x = 0;
	let z = 0;
	for (let index = 0; index < points.length; index += 1) {
		const current = points[index]!;
		const next = points[(index + 1) % points.length]!;
		const cross = current[0] * next[1] - next[0] * current[1];
		twiceArea += cross;
		x += (current[0] + next[0]) * cross;
		z += (current[1] + next[1]) * cross;
	}
	if (Math.abs(twiceArea) <= EPSILON) {
		return [
			points.reduce((sum, point) => sum + point[0], 0) / points.length,
			points.reduce((sum, point) => sum + point[1], 0) / points.length
		];
	}
	return [x / (3 * twiceArea), z / (3 * twiceArea)];
}

function firstBoundaryYaw(points: readonly LayoutVec2[]): number {
	for (let index = 0; index < points.length; index += 1) {
		const current = points[index]!;
		const next = points[(index + 1) % points.length]!;
		const dx = next[0] - current[0];
		const dz = next[1] - current[1];
		if (Math.hypot(dx, dz) > EPSILON) return normalizeLayoutRoomYaw(Math.atan2(-dz, dx));
	}
	return 0;
}
