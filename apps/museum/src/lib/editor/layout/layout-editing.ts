import type { DraftSegment, LayoutInteriorAnchor, LayoutRoom, LayoutVec2 } from '$lib/layout/layout-types';
import { nextInteriorAnchorId } from '$lib/layout/layout-geometry-curve';
import { sampleSegment, segmentLength } from '$lib/layout/layout-geometry-curve';

export function roomPoints(room: LayoutRoom): LayoutVec2[] {
	return room.boundary.segments.map((segment) => [...segment.start] as LayoutVec2);
}

export function roomBoundarySamples(room: LayoutRoom): LayoutVec2[] {
	return room.boundary.segments.flatMap((segment) => sampleSegment(segment).samples.slice(0, -1).map((sample) => [...sample.point] as LayoutVec2));
}

export function translateRoom(room: LayoutRoom, delta: LayoutVec2): LayoutRoom {
	return replaceRoomPoints(room, roomPoints(room).map(([x, z]) => [x + delta[0], z + delta[1]]));
}

export function replaceRoomVertex(room: LayoutRoom, vertexIndex: number, point: LayoutVec2): LayoutRoom {
	const points = roomPoints(room);
	if (vertexIndex < 0 || vertexIndex >= points.length) return room;
	points[vertexIndex] = [...point];
	return replaceRoomPoints(room, points);
}

function remapPointInChordFrame(
	oldStart: LayoutVec2,
	oldEnd: LayoutVec2,
	point: LayoutVec2,
	newStart: LayoutVec2,
	newEnd: LayoutVec2
): LayoutVec2 {
	const oldDx = oldEnd[0] - oldStart[0];
	const oldDz = oldEnd[1] - oldStart[1];
	const oldLen = Math.hypot(oldDx, oldDz);
	const newDx = newEnd[0] - newStart[0];
	const newDz = newEnd[1] - newStart[1];
	const newLen = Math.hypot(newDx, newDz);
	if (oldLen <= 1e-6 || newLen <= 1e-6) {
		return [(newStart[0] + newEnd[0]) / 2, (newStart[1] + newEnd[1]) / 2];
	}
	const ox = oldDx / oldLen;
	const oz = oldDz / oldLen;
	const px = -oz;
	const pz = ox;
	const hx = point[0] - oldStart[0];
	const hz = point[1] - oldStart[1];
	const alongFrac = (hx * ox + hz * oz) / oldLen;
	const perp = hx * px + hz * pz;
	const scale = newLen / oldLen;
	const nx = newDx / newLen;
	const nz = newDz / newLen;
	const npx = -nz;
	const npz = nx;
	return [newStart[0] + alongFrac * newDx + perp * scale * npx, newStart[1] + alongFrac * newDz + perp * scale * npz];
}

export function replaceRoomPoints(room: LayoutRoom, points: readonly LayoutVec2[]): LayoutRoom {
	if (points.length !== room.boundary.segments.length) return room;
	return {
		...room,
		boundary: {
			...room.boundary,
			segments: room.boundary.segments.map((segment, index) => {
				const oldStart = segment.start;
				const oldEnd = segment.end;
				const start = [...points[index]!] as LayoutVec2;
				const end = [...points[(index + 1) % points.length]!] as LayoutVec2;
				if (segment.kind === 'line') return { ...segment, start, end };
				return {
					...segment,
					start,
					end,
					interiorAnchors: segment.interiorAnchors.map((anchor) => ({
						...anchor,
						point: remapPointInChordFrame(oldStart, oldEnd, anchor.point, start, end)
					}))
				};
			})
		}
	};
}

export function convertLineSegmentToAutoBezier(
	segment: Extract<DraftSegment, { kind: 'line' }>,
	interiorAnchors: readonly LayoutInteriorAnchor[] = []
): Extract<DraftSegment, { kind: 'auto-bezier' }> {
	return {
		id: segment.id,
		kind: 'auto-bezier',
		start: [...segment.start],
		end: [...segment.end],
		interiorAnchors: interiorAnchors.map((anchor) => ({
			id: anchor.id,
			point: [...anchor.point] as LayoutVec2
		}))
	};
}

export function insertInteriorAnchorOnSegment(
	segment: DraftSegment,
	point: LayoutVec2
): Extract<DraftSegment, { kind: 'auto-bezier' }> {
	const auto =
		segment.kind === 'line'
			? convertLineSegmentToAutoBezier(segment)
			: {
					...segment,
					start: [...segment.start] as LayoutVec2,
					end: [...segment.end] as LayoutVec2,
					interiorAnchors: segment.interiorAnchors.map((anchor) => ({
						id: anchor.id,
						point: [...anchor.point] as LayoutVec2
					}))
				};
	const sampled = sampleSegment(auto);
	const nextId = nextInteriorAnchorId(auto.id, auto.interiorAnchors);
	const nextAnchor = { id: nextId, point: [...point] as LayoutVec2 };
	const ordered = [...auto.interiorAnchors, nextAnchor].sort((left, right) => {
		const leftDistance = projectDistanceAlong(sampled, left.point);
		const rightDistance = projectDistanceAlong(sampled, right.point);
		return leftDistance - rightDistance || left.id.localeCompare(right.id);
	});
	return { ...auto, interiorAnchors: ordered };
}

export function updateInteriorAnchorOnSegment(
	segment: Extract<DraftSegment, { kind: 'auto-bezier' }>,
	anchorId: string,
	point: LayoutVec2
): Extract<DraftSegment, { kind: 'auto-bezier' }> {
	return {
		...segment,
		interiorAnchors: segment.interiorAnchors.map((anchor) =>
			anchor.id === anchorId ? { ...anchor, point: [...point] as LayoutVec2 } : anchor
		)
	};
}

export function deleteInteriorAnchorOnSegment(
	segment: Extract<DraftSegment, { kind: 'auto-bezier' }>,
	anchorId: string
): DraftSegment {
	const interiorAnchors = segment.interiorAnchors.filter((anchor) => anchor.id !== anchorId);
	if (interiorAnchors.length === 0) {
		return {
			id: segment.id,
			kind: 'line',
			start: [...segment.start],
			end: [...segment.end]
		};
	}
	return { ...segment, interiorAnchors };
}

function projectDistanceAlong(
	sampled: ReturnType<typeof sampleSegment>,
	point: LayoutVec2
): number {
	let bestDistance = Number.POSITIVE_INFINITY;
	let bestAlong = 0;
	for (let index = 1; index < sampled.samples.length; index += 1) {
		const start = sampled.samples[index - 1]!;
		const end = sampled.samples[index]!;
		const dx = end.point[0] - start.point[0];
		const dz = end.point[1] - start.point[1];
		const squared = dx * dx + dz * dz;
		const rawT = squared > 0 ? ((point[0] - start.point[0]) * dx + (point[1] - start.point[1]) * dz) / squared : 0;
		const amount = Math.min(1, Math.max(0, rawT));
		const projected: LayoutVec2 = [start.point[0] + dx * amount, start.point[1] + dz * amount];
		const distanceToPath = Math.hypot(point[0] - projected[0], point[1] - projected[1]);
		const along = start.distance + (end.distance - start.distance) * amount;
		if (distanceToPath < bestDistance) {
			bestDistance = distanceToPath;
			bestAlong = along;
		}
	}
	return bestAlong;
}

export function roomBounds(room: LayoutRoom): { minX: number; minZ: number; maxX: number; maxZ: number; width: number; height: number } {
	const points = roomBoundarySamples(room);
	const minX = Math.min(...points.map(([x]) => x));
	const maxX = Math.max(...points.map(([x]) => x));
	const minZ = Math.min(...points.map(([, z]) => z));
	const maxZ = Math.max(...points.map(([, z]) => z));
	return { minX, minZ, maxX, maxZ, width: maxX - minX, height: maxZ - minZ };
}

export function roomEdgeLength(room: LayoutRoom, edgeIndex: number): number {
	const segment = room.boundary.segments[edgeIndex];
	return segment ? segmentLength(segment) : 0;
}

export function pointInRoom(point: LayoutVec2, room: LayoutRoom): boolean {
	const points = roomBoundarySamples(room);
	let inside = false;
	for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
		const [x, z] = points[index]!;
		const [previousX, previousZ] = points[previous]!;
		const intersects = z > point[1] !== previousZ > point[1] && point[0] < ((previousX - x) * (point[1] - z)) / (previousZ - z) + x;
		if (intersects) inside = !inside;
	}
	return inside;
}
