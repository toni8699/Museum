import {
	isWorldPointInsideRoomXZ,
	roomLocalPoint,
	roomPoint
} from '$lib/content/rooms';
import type {
	MuseumSceneDocument,
	SceneCameraViewKeyframe
} from '$lib/content/scene';
import type {
	CameraConnectionDirection,
	MuseumRoomId,
	Vec3
} from '$lib/types/museum';
import type { Vector3Like } from '$lib/museum/navigation/camera-motion';
import { createDraftConnectionPositionPath } from './editor-camera-path';

export const EDITOR_CAMERA_VIEW_PROGRESS_EPSILON = 1e-6;
export const EDITOR_CAMERA_VIEW_MOVE_EPSILON = 1e-4;

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
	keyframe: SceneCameraViewKeyframe
): Vec3 {
	return keyframe.roomId
		? roomPoint(keyframe.roomId, keyframe.cameraTarget)
		: [...keyframe.cameraTarget];
}

/** Preserve existing coordinate ownership while moving a target in world space. */
export function writeSceneCameraViewKeyframeWorldTarget(
	keyframe: SceneCameraViewKeyframe,
	worldTarget: Vector3Like
) {
	const target = cloneFiniteVec3(worldTarget, 'Camera view target');
	keyframe.cameraTarget = keyframe.roomId
		? roomLocalPoint(keyframe.roomId, target)
		: target;
	return keyframe;
}

/** New targets use active-room coordinates only when inside its yaw-aware footprint. */
export function createSceneCameraViewKeyframeAtWorldTarget(
	id: string,
	progress: number,
	worldTarget: Vector3Like,
	fov: number,
	activeRoomId: MuseumRoomId | null | undefined
): SceneCameraViewKeyframe {
	const target = cloneFiniteVec3(worldTarget, 'Camera view target');
	if (activeRoomId && isWorldPointInsideRoomXZ(activeRoomId, target)) {
		return {
			id,
			progress,
			roomId: activeRoomId,
			cameraTarget: roomLocalPoint(activeRoomId, target),
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
	progress: number
): Vec3 {
	if (!Number.isFinite(progress)) {
		throw new Error('Camera view progress must be finite');
	}
	const path = createDraftConnectionPositionPath(
		document,
		connectionId,
		direction
	);
	return path.getPointAt(progress).toArray() as Vec3;
}
