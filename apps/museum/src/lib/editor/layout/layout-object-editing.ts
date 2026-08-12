import type { Vec3 } from '$lib/types/museum';
import type { LayoutDocument, LayoutObject, LayoutRoom, LayoutVec2 } from './layout-types';

export type AuthoredLayoutObjectKind = Exclude<LayoutObject['kind'], 'profile'>;

export type LayoutObjectAabb = {
	min: Vec3;
	max: Vec3;
};

export type LayoutObjectDescriptor = {
	objectId: string;
	kind: LayoutObject['kind'];
	position: Vec3;
	rotation: Vec3;
	dimensions: Vec3;
	roomId?: string;
	readonly: boolean;
	worldAabb: LayoutObjectAabb;
	planFootprint: LayoutVec2[];
};

export type LayoutObjectPatch = Partial<
	Pick<LayoutObject, 'position' | 'rotation' | 'dimensions' | 'roomId'>
>;

const DEFAULT_DIMENSIONS: Record<AuthoredLayoutObjectKind, Vec3> = {
	box: [1, 1, 1],
	plane: [2, 0.01, 2],
	cylinder: [1, 1, 1],
	sphere: [1, 1, 1]
};

export function defaultLayoutObjectDimensions(kind: AuthoredLayoutObjectKind): Vec3 {
	return [...DEFAULT_DIMENSIONS[kind]];
}

export function nextLayoutObjectId(objects: readonly LayoutObject[]): string {
	const ids = new Set(objects.map((object) => object.id));
	let index = objects.length + 1;
	while (ids.has(`layout-object-${index}`)) index += 1;
	return `layout-object-${index}`;
}

export function floorObjectPosition(
	point: LayoutVec2,
	floorElevation: number,
	dimensions: Vec3,
	snapEnabled = false
): Vec3 {
	const [x, z] = snapEnabled ? snapLayoutPlanPoint(point) : point;
	return [x, floorElevation + dimensions[1] / 2, z];
}

export function snapLayoutPlanPoint(point: LayoutVec2, step = 0.25): LayoutVec2 {
	return [Math.round(point[0] / step) * step, Math.round(point[1] / step) * step];
}

export function isKnownLayoutRoomId(document: LayoutDocument, roomId: string | undefined): boolean {
	return roomId === undefined || document.floors.some((floor) => floor.rooms.some((room) => room.id === roomId));
}

export function findLayoutRoomWithFloor(
	document: LayoutDocument,
	roomId: string
): { floor: LayoutDocument['floors'][number]; room: LayoutRoom } | null {
	for (const floor of document.floors) {
		const room = floor.rooms.find((candidate) => candidate.id === roomId);
		if (room) return { floor, room };
	}
	return null;
}

export function createLayoutObject(input: {
	id: string;
	kind: AuthoredLayoutObjectKind;
	position: Vec3;
	roomId?: string;
	dimensions?: Vec3;
}): LayoutObject {
	return {
		id: input.id,
		kind: input.kind,
		position: [...input.position],
		rotation: [0, 0, 0],
		dimensions: [...(input.dimensions ?? defaultLayoutObjectDimensions(input.kind))],
		...(input.roomId ? { roomId: input.roomId } : {})
	};
}

export function patchLayoutObject(
	document: LayoutDocument,
	objectId: string,
	patch: LayoutObjectPatch
): LayoutDocument | null {
	const index = document.objects.findIndex((object) => object.id === objectId);
	if (index < 0) return null;
	const current = document.objects[index]!;
	const next: LayoutObject = {
		...current,
		...(patch.position ? { position: [...patch.position] as Vec3 } : {}),
		...(patch.rotation ? { rotation: [...patch.rotation] as Vec3 } : {}),
		...(patch.dimensions ? { dimensions: [...patch.dimensions] as Vec3 } : {})
	};
	if ('roomId' in patch) {
		if (patch.roomId) next.roomId = patch.roomId;
		else delete next.roomId;
	}
	return {
		...document,
		floors: document.floors,
		objects: document.objects.map((object, candidateIndex) =>
			candidateIndex === index ? next : object
		)
	};
}

export function deleteLayoutObject(document: LayoutDocument, objectId: string): LayoutDocument | null {
	if (!document.objects.some((object) => object.id === objectId)) return null;
	return { ...document, floors: document.floors, objects: document.objects.filter((object) => object.id !== objectId) };
}

export function describeLayoutObject(object: LayoutObject): LayoutObjectDescriptor {
	const corners = rotatedObjectCorners(object);
	const min: Vec3 = [Infinity, Infinity, Infinity];
	const max: Vec3 = [-Infinity, -Infinity, -Infinity];
	for (const [x, y, z] of corners) {
		min[0] = Math.min(min[0], x);
		min[1] = Math.min(min[1], y);
		min[2] = Math.min(min[2], z);
		max[0] = Math.max(max[0], x);
		max[1] = Math.max(max[1], y);
		max[2] = Math.max(max[2], z);
	}
	return {
		objectId: object.id,
		kind: object.kind,
		position: [...object.position],
		rotation: [...object.rotation],
		dimensions: [...object.dimensions],
		...(object.roomId ? { roomId: object.roomId } : {}),
		readonly: object.kind === 'profile',
		worldAabb: { min, max },
		planFootprint: convexHull(corners.map(([x, , z]) => [x, z] as LayoutVec2))
	};
}

export function findHitLayoutObject(
	descriptors: readonly LayoutObjectDescriptor[],
	point: LayoutVec2
): LayoutObjectDescriptor | null {
	for (const descriptor of [...descriptors].reverse()) {
		if (pointInPolygon(point, descriptor.planFootprint)) return descriptor;
	}
	return null;
}

function rotatedObjectCorners(object: LayoutObject): Vec3[] {
	const [halfX, halfY, halfZ] = object.dimensions.map((value) => value / 2) as Vec3;
	const corners: Vec3[] = [];
	for (const x of [-halfX, halfX]) {
		for (const y of [-halfY, halfY]) {
			for (const z of [-halfZ, halfZ]) {
				const rotated = rotateXyz([x, y, z], object.rotation);
				corners.push([
					rotated[0] + object.position[0],
					rotated[1] + object.position[1],
					rotated[2] + object.position[2]
				]);
			}
		}
	}
	return corners;
}

/** Matches Three.js Euler's default XYZ order. */
function rotateXyz([x, y, z]: Vec3, [rx, ry, rz]: Vec3): Vec3 {
	const a = Math.cos(rx);
	const b = Math.sin(rx);
	const c = Math.cos(ry);
	const d = Math.sin(ry);
	const e = Math.cos(rz);
	const f = Math.sin(rz);
	const ae = a * e;
	const af = a * f;
	const be = b * e;
	const bf = b * f;
	return [
		c * e * x + (-c * f) * y + d * z,
		(af + be * d) * x + (ae - bf * d) * y - b * c * z,
		(bf - ae * d) * x + (be + af * d) * y + a * c * z
	];
}

function convexHull(points: readonly LayoutVec2[]): LayoutVec2[] {
	const unique = [...new Map(points.map((point) => [`${point[0]}:${point[1]}`, point])).values()].sort(
		(a, b) => a[0] - b[0] || a[1] - b[1]
	);
	if (unique.length <= 2) return unique.map((point) => [...point]);
	const cross = (origin: LayoutVec2, a: LayoutVec2, b: LayoutVec2) =>
		(a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
	const lower: LayoutVec2[] = [];
	for (const point of unique) {
		while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
		lower.push(point);
	}
	const upper: LayoutVec2[] = [];
	for (const point of [...unique].reverse()) {
		while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
		upper.push(point);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)].map((point) => [...point]);
}

function pointInPolygon(point: LayoutVec2, polygon: readonly LayoutVec2[]): boolean {
	let inside = false;
	for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
		const currentPoint = polygon[index]!;
		const previousPoint = polygon[previous]!;
		if (
			currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
			point[0] <
				((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
					(previousPoint[1] - currentPoint[1]) +
					currentPoint[0]
		) {
			inside = !inside;
		}
	}
	return inside;
}
