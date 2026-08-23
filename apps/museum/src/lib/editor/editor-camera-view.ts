
import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type {
	MuseumSceneDocument,
	SceneCameraViewKeyframe,
	SceneConnection
} from '$lib/content/scene';
import type {
	CameraConnectionDirection,
	MuseumRoomId,
	Vec3
} from '$lib/types/museum';
import type { Vector3Like } from '$lib/museum/navigation/camera-motion';
import {
	createDraftConnectionPositionPath,
	isWorldPointInsideRoomXZ
} from './editor-camera-path';

export const EDITOR_CAMERA_VIEW_PROGRESS_EPSILON = 1e-6;
export const EDITOR_CAMERA_VIEW_MOVE_EPSILON = 1e-4;

/**
 * Mirror a directional view track onto the opposite travel: reverse key order,
 * remap progress → 1 - progress, copy look-at / FOV / room ownership, fresh IDs.
 */
export function mirrorCameraViewTrack(
	connectionId: string,
	sourceTrack: readonly SceneCameraViewKeyframe[],
	destination: CameraConnectionDirection,
	occupiedIds: Iterable<string>
): SceneCameraViewKeyframe[] {
	const occupied = new Set(occupiedIds);
	return [...sourceTrack].reverse().map((keyframe) => {
		const id = allocateCameraViewKeyframeId(connectionId, destination, occupied);
		occupied.add(id);
		return {
			id,
			progress: 1 - keyframe.progress,
			cameraTarget: [...keyframe.cameraTarget] as Vec3,
			...(keyframe.roomId === undefined ? {} : { roomId: keyframe.roomId }),
			fov: keyframe.fov
		};
	});
}

/**
 * Seed reverse from forward when reverse is empty and forward has keys.
 * Mutates `connection` in place; caller must own the document transaction.
 * Returns true when reverse was written.
 */
export function seedEmptyReverseViewTrack(connection: SceneConnection): boolean {
	const forward = connection.viewTracks?.forward ?? [];
	const reverse = connection.viewTracks?.reverse ?? [];
	if (forward.length === 0 || reverse.length > 0) return false;
	return syncReverseViewTrackFromForward(connection);
}

/**
 * Replace reverse with a full mirror of the current forward track.
 * Mutates `connection` in place; caller must own the document transaction.
 */
export function syncReverseViewTrackFromForward(connection: SceneConnection): boolean {
	const forward = connection.viewTracks?.forward ?? [];
	if (forward.length === 0) return false;
	const occupied = new Set(forward.map((keyframe) => keyframe.id));
	connection.viewTracks ??= { forward: [], reverse: [] };
	connection.viewTracks.reverse = mirrorCameraViewTrack(
		connection.id,
		forward,
		'reverse',
		occupied
	);
	return true;
}

function isVectorTuple(
	value: Vector3Like
): value is readonly [number, number, number] {
	return Array.isArray(value);
}

function cloneFiniteVec3(value: Vector3Like, label: string): Vec3 {
	const components = isVectorTuple(value)
		? value
		: [value.x, value.y, value.z];
	if (
		components.length !== 3 ||
		components.some((component) => !Number.isFinite(component))
	) {
		throw new Error(`${label} must contain exactly three finite numbers`);
	}
	return [components[0], components[1], components[2]];
}

/** Smallest free direction-local ID, unique across both tracks. */
export function allocateCameraViewKeyframeId(
	connectionId: string,
	direction: CameraConnectionDirection,
	existingIds: Iterable<string>
) {
	const occupied = new Set(existingIds);
	for (let index = 1; ; index += 1) {
		const candidate = `${connectionId}-view-${direction}-${String(index).padStart(2, '0')}`;
		if (!occupied.has(candidate)) return candidate;
	}
}

export function findSceneCameraViewKeyframe(
	document: MuseumSceneDocument,
	connectionId: string,
	direction: CameraConnectionDirection,
	keyframeId: string
): SceneCameraViewKeyframe | null {
	const connection = document.connections.find(
		(candidate) => candidate.id === connectionId
	);
	return (
		connection?.viewTracks?.[direction].find(
			(keyframe) => keyframe.id === keyframeId
		) ?? null
	);
}

export function getSceneCameraViewKeyframeWorldTarget(
	keyframe: SceneCameraViewKeyframe,
	rooms: LayoutRoomRegistry
): Vec3 {
	return keyframe.roomId
		? rooms.point(keyframe.roomId, keyframe.cameraTarget)
		: [...keyframe.cameraTarget];
}

/**
 * S10.1 closeout — orbit a look target around an eye by yaw (world Y) then
 * pitch (local X): the turntable aim mapping shared by camera-node rotate and
 * view-breakpoint Aim. Roll is not representable (an aim has no roll) and the
 * eye→target radius is preserved exactly. Pure, renderer-neutral tuple math —
 * no Three/DOM/Svelte imports.
 */
export function orbitWorldLookTarget(
	eye: Vec3,
	target: Vec3,
	yaw: number,
	pitch: number
): Vec3 {
	const offsetX = target[0] - eye[0];
	const offsetY = target[1] - eye[1];
	const offsetZ = target[2] - eye[2];
	// Pitch about the local X axis first, then yaw about world Y.
	const cosPitch = Math.cos(pitch);
	const sinPitch = Math.sin(pitch);
	const pitchedY = offsetY * cosPitch - offsetZ * sinPitch;
	const pitchedZ = offsetY * sinPitch + offsetZ * cosPitch;
	const cosYaw = Math.cos(yaw);
	const sinYaw = Math.sin(yaw);
	const finalX = offsetX * cosYaw + pitchedZ * sinYaw;
	const finalZ = -offsetX * sinYaw + pitchedZ * cosYaw;
	return [eye[0] + finalX, eye[1] + pitchedY, eye[2] + finalZ];
}

/** Preserve existing coordinate ownership while moving a target in world space. */
export function writeSceneCameraViewKeyframeWorldTarget(
	keyframe: SceneCameraViewKeyframe,
	worldTarget: Vector3Like,
	rooms: LayoutRoomRegistry
) {
	const target = cloneFiniteVec3(worldTarget, 'Camera view target');
	keyframe.cameraTarget = keyframe.roomId
		? rooms.localPoint(keyframe.roomId, target)
		: target;
	return keyframe;
}

/** New targets use active-room coordinates only when inside its yaw-aware footprint. */
export function createSceneCameraViewKeyframeAtWorldTarget(
	id: string,
	progress: number,
	worldTarget: Vector3Like,
	fov: number,
	activeRoomId: MuseumRoomId | null | undefined,
	rooms: LayoutRoomRegistry
): SceneCameraViewKeyframe {
	const target = cloneFiniteVec3(worldTarget, 'Camera view target');
	if (activeRoomId && isWorldPointInsideRoomXZ(activeRoomId, target, rooms)) {
		return {
			id,
			progress,
			roomId: activeRoomId,
			cameraTarget: rooms.localPoint(activeRoomId, target),
			fov
		};
	}
	return { id, progress, cameraTarget: target, fov };
}

/** Exact shared position curve in this direction; no independent marker math. */
export function getSceneCameraViewKeyframeWorldPosition(
	document: MuseumSceneDocument,
	connectionId: string,
	direction: CameraConnectionDirection,
	progress: number,
	rooms: LayoutRoomRegistry
): Vec3 {
	if (!Number.isFinite(progress)) {
		throw new Error('Camera view progress must be finite');
	}
	const path = createDraftConnectionPositionPath(
		document,
		connectionId,
		direction,
		rooms
	);
	return path.getPointAt(progress).toArray() as Vec3;
}
