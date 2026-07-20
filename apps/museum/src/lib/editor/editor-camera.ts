import type { MuseumRoom, Vec3 } from '$lib/types/museum';
import { VISITOR_CAMERA_PROJECTION } from '$lib/museum/navigation/camera-motion';
import { Box3, Sphere, Vector3, type Object3D, type PerspectiveCamera } from 'three';

export const EDITOR_CAMERA_FOV = 50;
export const EDITOR_NEUTRAL_CAMERA_POSITION: Vec3 = [0, 18, 24];
export const EDITOR_NEUTRAL_CAMERA_TARGET: Vec3 = [0, 1, 0];
/** Closest orbit radius — small enough to inspect placement details. */
export const EDITOR_MIN_ORBIT_DISTANCE = 0.2;
export const EDITOR_NEUTRAL_MIN_DISTANCE = 1;
export const EDITOR_NEUTRAL_MAX_DISTANCE = 60;
export const EDITOR_FRAME_PADDING = 1.2;
/** World-space padding around the authored eye/target pair when framing a camera node. */
export const EDITOR_NODE_FRAME_EXPANSION = 0.5;
export const EDITOR_PAN_BASE_SPEED = 0.7;
export const EDITOR_PAN_REFERENCE_DISTANCE = 8;
export const EDITOR_PAN_MAX_BOOST = 5;
export const EDITOR_DIRECTOR_OBSERVER_OFFSET: Vec3 = [6, 5, 7];

export type EditorRoomCameraFrame = {
	position: Vec3;
	target: Vec3;
	radius: number;
	minDistance: number;
	maxDistance: number;
};

export type EditorBoundsCameraFrame = EditorRoomCameraFrame;

/** The OrbitControls surface needed to capture and restore an editor camera pose. */
export type EditorOrbitControlsLike = {
	target: Vector3;
	minDistance: number;
	maxDistance: number;
	enabled: boolean;
	enableDamping: boolean;
	update: () => unknown;
};

/**
 * A preview-safe editor orbit snapshot. The viewport aspect is intentionally absent:
 * the current render size remains authoritative when preview ends.
 */
export type EditorOrbitPose = Readonly<{
	position: Vector3;
	target: Vector3;
	zoom: number;
	fov: number;
	near: number;
	far: number;
	minDistance: number;
	maxDistance: number;
	enabled: boolean;
	enableDamping: boolean;
}>;

export type EditorBoundsCameraFrameOptions = {
	fovDegrees?: number;
	aspect?: number;
	padding?: number;
	minDistance?: number;
	maxDistance?: number;
};

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
	options: EditorBoundsCameraFrameOptions = {}
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

/** Frames the authored world-space eye/target pair, including coincident points. */
export function createEditorNodeCameraFrame(
	position: Vector3,
	target: Vector3,
	currentPosition: Vector3,
	currentTarget: Vector3,
	options: EditorBoundsCameraFrameOptions = {}
): EditorBoundsCameraFrame | null {
	const bounds = new Box3()
		.setFromPoints([position, target])
		.expandByScalar(EDITOR_NODE_FRAME_EXPANSION);
	return createEditorBoundsCameraFrame(bounds, currentPosition, currentTarget, options);
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

/** Capture before any preview-related camera or controls mutation. */
export function captureEditorOrbitPose(
	camera: PerspectiveCamera,
	controls: EditorOrbitControlsLike
): EditorOrbitPose {
	return {
		position: camera.position.clone(),
		target: controls.target.clone(),
		zoom: camera.zoom,
		fov: camera.fov,
		near: camera.near,
		far: camera.far,
		minDistance: controls.minDistance,
		maxDistance: controls.maxDistance,
		enabled: controls.enabled,
		enableDamping: controls.enableDamping
	};
}

/** Place the editor observer at a deterministic oblique top-down Director pose. */
export function recenterEditorDirectorObserver(
	camera: PerspectiveCamera,
	controls: EditorOrbitControlsLike,
	visitorPosition: Vector3,
	offset: Vec3 = EDITOR_DIRECTOR_OBSERVER_OFFSET
) {
	controls.target.copy(visitorPosition);
	camera.position
		.copy(visitorPosition)
		.add(new Vector3(offset[0], offset[1], offset[2]));
	const minDistance = controls.minDistance;
	const maxDistance = controls.maxDistance;
	controls.minDistance = 0;
	controls.maxDistance = Number.POSITIVE_INFINITY;
	controls.update();
	controls.minDistance = minDistance;
	controls.maxDistance = maxDistance;
}

/** Translate observer and Orbit target by virtual-camera world delta. */
export function followEditorDirectorObserver(
	camera: PerspectiveCamera,
	controls: EditorOrbitControlsLike,
	previousVisitorPosition: Vector3,
	visitorPosition: Vector3,
	delta = new Vector3()
) {
	delta.copy(visitorPosition).sub(previousVisitorPosition);
	if (delta.lengthSq() <= Number.EPSILON) return false;
	camera.position.add(delta);
	controls.target.add(delta);
	return true;
}

/** Disable OrbitControls, flush damping once, then apply the visitor projection. */
export function prepareEditorCameraPreview(
	camera: PerspectiveCamera,
	controls: EditorOrbitControlsLike
): void {
	controls.enabled = false;
	controls.enableDamping = false;
	controls.update();

	camera.fov = VISITOR_CAMERA_PROJECTION.fov;
	camera.near = VISITOR_CAMERA_PROJECTION.near;
	camera.far = VISITOR_CAMERA_PROJECTION.far;
	camera.zoom = 1;
	camera.updateProjectionMatrix();
}

/**
 * Restore editor orbit state in the order required by OrbitControls. Aspect is not
 * restored so a resize that occurred during preview is retained.
 */
export function restoreEditorOrbitPose(
	camera: PerspectiveCamera,
	controls: EditorOrbitControlsLike,
	pose: EditorOrbitPose
): void {
	controls.enabled = false;
	controls.enableDamping = false;

	camera.position.copy(pose.position);
	camera.zoom = pose.zoom;
	camera.fov = pose.fov;
	camera.near = pose.near;
	camera.far = pose.far;
	controls.target.copy(pose.target);

	camera.updateProjectionMatrix();

	controls.minDistance = 0;
	controls.maxDistance = Number.POSITIVE_INFINITY;
	controls.update();

	controls.minDistance = pose.minDistance;
	controls.maxDistance = pose.maxDistance;
	controls.enableDamping = pose.enableDamping;
	controls.enabled = pose.enabled;
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
