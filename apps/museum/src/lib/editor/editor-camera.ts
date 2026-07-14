import type { MuseumRoom, Vec3 } from '$lib/types/museum';
import { Box3, Sphere, Vector3, type Object3D } from 'three';

export const EDITOR_CAMERA_FOV = 50;
export const EDITOR_NEUTRAL_CAMERA_POSITION: Vec3 = [0, 18, 24];
export const EDITOR_NEUTRAL_CAMERA_TARGET: Vec3 = [0, 1, 0];
/** Closest orbit radius — small enough to inspect placement details. */
export const EDITOR_MIN_ORBIT_DISTANCE = 0.2;
export const EDITOR_NEUTRAL_MIN_DISTANCE = 1;
export const EDITOR_NEUTRAL_MAX_DISTANCE = 60;
export const EDITOR_FRAME_PADDING = 1.2;
export const EDITOR_PAN_BASE_SPEED = 0.7;
export const EDITOR_PAN_REFERENCE_DISTANCE = 8;
export const EDITOR_PAN_MAX_BOOST = 5;

export type EditorRoomCameraFrame = {
	position: Vec3;
	target: Vec3;
	radius: number;
	minDistance: number;
	maxDistance: number;
};

export type EditorBoundsCameraFrame = EditorRoomCameraFrame;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/** Boost panning only for close inspection; overview distances stay near the base speed. */
export function createEditorPanSpeed(
	cameraTargetDistance: number,
	basePanSpeed = EDITOR_PAN_BASE_SPEED,
	referenceDistance = EDITOR_PAN_REFERENCE_DISTANCE,
	maxBoost = EDITOR_PAN_MAX_BOOST
) {
	const safeDistance = Math.max(Number.EPSILON, cameraTargetDistance);
	return basePanSpeed * clamp(referenceDistance / safeDistance, 1, maxBoost);
}

export function createEditorBoundsCameraFrame(
	bounds: Box3,
	currentPosition: Vector3,
	currentTarget: Vector3,
	options: {
		fovDegrees?: number;
		aspect?: number;
		padding?: number;
		minDistance?: number;
		maxDistance?: number;
	} = {}
): EditorBoundsCameraFrame | null {
	if (bounds.isEmpty()) return null;

	const fovDegrees = options.fovDegrees ?? EDITOR_CAMERA_FOV;
	const aspect = Math.max(0.01, options.aspect ?? 1);
	const padding = Math.max(1, options.padding ?? EDITOR_FRAME_PADDING);
	const minDistance = Math.max(EDITOR_MIN_ORBIT_DISTANCE, options.minDistance ?? 0.35);
	const maxDistance = Math.max(minDistance, options.maxDistance ?? EDITOR_NEUTRAL_MAX_DISTANCE);
	const verticalHalfFov = (fovDegrees * Math.PI) / 360;
	const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
	const effectiveHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
	const sphere = bounds.getBoundingSphere(new Sphere());
	if (!Number.isFinite(sphere.radius)) return null;

	const target = bounds.getCenter(new Vector3());
	const offsetDirection = currentPosition.clone().sub(currentTarget);
	if (offsetDirection.lengthSq() < 1e-8) offsetDirection.set(0, 0.35, 1);
	offsetDirection.normalize();
	const requiredDistance =
		sphere.radius <= 1e-6
			? minDistance
			: (sphere.radius * padding) / Math.sin(effectiveHalfFov);
	const distance = clamp(requiredDistance, minDistance, maxDistance);
	const position = target.clone().addScaledVector(offsetDirection, distance);

	return {
		position: position.toArray() as Vec3,
		target: target.toArray() as Vec3,
		radius: sphere.radius,
		minDistance: EDITOR_MIN_ORBIT_DISTANCE,
		maxDistance
	};
}

export function createEditorPlacementCameraFrame(
	root: Object3D,
	currentPosition: Vector3,
	currentTarget: Vector3,
	options?: Parameters<typeof createEditorBoundsCameraFrame>[3]
) {
	root.updateWorldMatrix(true, true);
	return createEditorBoundsCameraFrame(
		new Box3().setFromObject(root),
		currentPosition,
		currentTarget,
		options
	);
}

function rotateLocalOffset(room: MuseumRoom, offset: Vec3): Vec3 {
	const yaw = room.rotation[1];
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	const [x, y, z] = offset;
	return [x * cos + z * sin, y, -x * sin + z * cos];
}

/** Deterministic whole-room framing that follows the room's authored yaw. */
export function createEditorRoomCameraFrame(
	room: MuseumRoom,
	fovDegrees = EDITOR_CAMERA_FOV
): EditorRoomCameraFrame {
	const [width, height, depth] = room.dimensions;
	const radius = Math.hypot(width, height, depth) / 2;
	const halfFovRadians = (fovDegrees * Math.PI) / 360;
	const distance = (radius / Math.sin(halfFovRadians)) * 1.05;
	const target: Vec3 = [room.position[0], room.position[1] + height / 2, room.position[2]];

	const localDirectionLength = Math.hypot(0.55, 1);
	const localOffset: Vec3 = [
		0,
		(distance * 0.55) / localDirectionLength,
		distance / localDirectionLength
	];
	const worldOffset = rotateLocalOffset(room, localOffset);

	return {
		position: [
			target[0] + worldOffset[0],
			target[1] + worldOffset[1],
			target[2] + worldOffset[2]
		],
		target,
		radius,
		minDistance: EDITOR_MIN_ORBIT_DISTANCE,
		maxDistance: distance * 1.5
	};
}
