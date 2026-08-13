import type { LayoutDocument, LayoutRoom, LayoutVec2 } from './layout-types';
import { roomBoundarySamples } from './layout-editing';
import { validateLayoutDocument } from '$lib/layout/layout-codec';
import { hasBlockingLayoutIssues, validateLayoutDocumentGeometry } from './layout-validation';
import { normalizeLayoutRoomYaw } from '$lib/layout/layout-room-frame';

export type LayoutRoomUnitTransform = {
	translation: LayoutVec2;
	yaw: number;
};

export type LayoutRoomUnitTransformResult =
	| { success: true; document: LayoutDocument; pivot: LayoutVec2 }
	| { success: false; message: string };

const EPSILON = 1e-9;

/**
 * Rigidly transforms one room, its authored frame, curved anchors, and owned objects.
 */
export function transformLayoutRoomUnit(
	document: LayoutDocument,
	roomId: string,
	transform: LayoutRoomUnitTransform
): LayoutRoomUnitTransformResult {
	if (!Number.isFinite(transform.translation[0]) || !Number.isFinite(transform.translation[1])) {
		return { success: false, message: 'Room translation must be finite' };
	}
	if (!Number.isFinite(transform.yaw)) return { success: false, message: 'Room rotation must be finite' };
	const inputValidation = validateLayoutDocument(document);
	if (!inputValidation.success) {
		return { success: false, message: inputValidation.issues[0]?.message ?? 'Invalid layout document' };
	}
	const canonicalDocument = inputValidation.document;
	const located = findRoom(canonicalDocument, roomId);
	if (!located) return { success: false, message: `Room '${roomId}' no longer exists` };
	const pivot = sampledPolygonCentroid(located.room);
	const next = cloneJson(canonicalDocument);
	const nextLocated = findRoom(next, roomId);
	if (!nextLocated) return { success: false, message: `Room '${roomId}' no longer exists` };

	nextLocated.floor.rooms = nextLocated.floor.rooms.map((room) =>
		room.id === roomId ? transformRoom(room, pivot, transform) : room
	);
	next.objects = next.objects.map((object) => {
		if (object.roomId !== roomId) return object;
		const [x, z] = rotateAround([object.position[0], object.position[2]], pivot, transform.yaw);
		return {
			...object,
			position: [
				x + transform.translation[0],
				object.position[1],
				z + transform.translation[1]
			],
			rotation: [object.rotation[0], object.rotation[1] + transform.yaw, object.rotation[2]]
		};
	});

	const structural = validateLayoutDocument(next);
	if (!structural.success) return { success: false, message: structural.issues[0]?.message ?? 'Invalid layout document' };
	const geometryIssues = validateLayoutDocumentGeometry(structural.document);
	if (hasBlockingLayoutIssues(geometryIssues)) {
		return { success: false, message: geometryIssues[0]?.message ?? 'Room transform creates invalid geometry' };
	}
	return { success: true, document: structural.document, pivot };
}

export function layoutRoomUnitPivot(room: LayoutRoom): LayoutVec2 {
	return sampledPolygonCentroid(room);
}

function transformRoom(
	room: LayoutRoom,
	pivot: LayoutVec2,
	transform: LayoutRoomUnitTransform
): LayoutRoom {
	return {
		...room,
		frame: {
			origin: transformPoint(room.frame.origin, pivot, transform),
			yaw: normalizeLayoutRoomYaw(room.frame.yaw + transform.yaw)
		},
		boundary: {
			...room.boundary,
			segments: room.boundary.segments.map((segment) => ({
				...segment,
				start: transformPoint(segment.start, pivot, transform),
				end: transformPoint(segment.end, pivot, transform),
				...(segment.kind === 'auto-bezier'
					? { interiorAnchors: segment.interiorAnchors.map((anchor) => ({ ...anchor, point: transformPoint(anchor.point, pivot, transform) })) }
					: {})
			}))
		}
	};
}

function transformPoint(
	point: LayoutVec2,
	pivot: LayoutVec2,
	transform: LayoutRoomUnitTransform
): LayoutVec2 {
	const [x, z] = rotateAround(point, pivot, transform.yaw);
	return [x + transform.translation[0], z + transform.translation[1]];
}

/** Three.js positive +Y rotation convention in X/Z plan coordinates. */
function rotateAround(point: LayoutVec2, pivot: LayoutVec2, yaw: number): LayoutVec2 {
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	const x = point[0] - pivot[0];
	const z = point[1] - pivot[1];
	return [pivot[0] + cos * x + sin * z, pivot[1] - sin * x + cos * z];
}

function sampledPolygonCentroid(room: LayoutRoom): LayoutVec2 {
	const points = roomBoundarySamples(room);
	if (points.length < 3) return averagePoint(points);
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
	if (Math.abs(twiceArea) <= EPSILON) return averagePoint(points);
	return [x / (3 * twiceArea), z / (3 * twiceArea)];
}

function averagePoint(points: readonly LayoutVec2[]): LayoutVec2 {
	if (points.length === 0) return [0, 0];
	return [
		points.reduce((sum, point) => sum + point[0], 0) / points.length,
		points.reduce((sum, point) => sum + point[1], 0) / points.length
	];
}

function findRoom(document: LayoutDocument, roomId: string): { floor: LayoutDocument['floors'][number]; room: LayoutRoom } | null {
	for (const floor of document.floors) {
		const room = floor.rooms.find((candidate) => candidate.id === roomId);
		if (room) return { floor, room };
	}
	return null;
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
