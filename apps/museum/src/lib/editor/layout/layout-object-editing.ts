import type { Vec3 } from '$lib/types/museum';
import type { LayoutDocument, LayoutObject, LayoutRoom, LayoutVec2 } from './layout-types';
import {
	describeLayoutObject,
	findHitLayoutObject,
	type LayoutObjectDescriptor
} from '$lib/layout/layout-geometry-objects';

export { describeLayoutObject, findHitLayoutObject };
export type { LayoutObjectDescriptor };
export type { LayoutObjectAabb } from '$lib/layout/layout-geometry-objects';

export type AuthoredLayoutObjectKind = Exclude<LayoutObject['kind'], 'profile'>;

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

export type LayoutPrimitiveGeometry = {
	position: Vec3;
	dimensions: Vec3;
};

/** Derive a floor-relative primitive from a transient Plan gesture. */
export function primitiveObjectGeometry(
	kind: Exclude<AuthoredLayoutObjectKind, 'plane'>,
	start: LayoutVec2,
	current: LayoutVec2,
	floorElevation: number,
	snapEnabled = false
): LayoutPrimitiveGeometry | null {
	const first = snapEnabled ? snapLayoutPlanPoint(start) : start;
	const last = snapEnabled ? snapLayoutPlanPoint(current) : current;
	if (!first.every(Number.isFinite) || !last.every(Number.isFinite)) return null;
	if (kind === 'box') {
		const width = Math.abs(last[0] - first[0]);
		const depth = Math.abs(last[1] - first[1]);
		if (width <= 1e-6 || depth <= 1e-6) return null;
		return {
			position: [(first[0] + last[0]) / 2, floorElevation + 0.5, (first[1] + last[1]) / 2],
			dimensions: [width, 1, depth]
		};
	}
	const radius = Math.hypot(last[0] - first[0], last[1] - first[1]);
	if (radius <= 1e-6) return null;
	return {
		position: [first[0], floorElevation + 0.5, first[1]],
		dimensions: [radius * 2, 1, radius * 2]
	};
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
