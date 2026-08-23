import { CAMERA_FOV, type Vec3 } from '$lib/types/scene';
import { Vector3, type Vector3Like } from 'three';

export const EDITOR_CAMERA_FRUSTUM_MIN_DEPTH = 2;
export const EDITOR_CAMERA_FRUSTUM_MAX_DEPTH = 8;
export const EDITOR_CAMERA_FRAMING_MOVE_EPSILON = 1e-4;
export const EDITOR_CAMERA_FRAMING_FOV_EPSILON = 1e-3;

const WORLD_UP = new Vector3(0, 1, 0);
const FALLBACK_UP = new Vector3(0, 0, 1);

export type EditorCameraFramingGeometry = {
	depth: number;
	center: Vec3;
	topHandle: Vec3;
	bottomHandle: Vec3;
	corners: [Vec3, Vec3, Vec3, Vec3];
};

type CameraFramingPoint = Vector3Like | readonly [number, number, number];

function finiteVector(value: CameraFramingPoint, label: string) {
	const vector =
		'x' in value
			? new Vector3(value.x, value.y, value.z)
			: new Vector3(value[0], value[1], value[2]);
	if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
		throw new Error(`${label} must contain finite coordinates`);
	}
	return vector;
}

export function clampEditorCameraFrustumDepth(distance: number) {
	if (!Number.isFinite(distance)) {
		throw new Error('Camera target distance must be finite');
	}
	return Math.min(
		EDITOR_CAMERA_FRUSTUM_MAX_DEPTH,
		Math.max(EDITOR_CAMERA_FRUSTUM_MIN_DEPTH, distance)
	);
}

export function createEditorCameraFramingBasis(
	position: CameraFramingPoint,
	target: CameraFramingPoint
) {
	const eye = finiteVector(position, 'Camera position');
	const aim = finiteVector(target, 'Camera target');
	const forward = aim.clone().sub(eye);
	if (forward.lengthSq() <= 1e-12) {
		throw new Error('Camera position and target must differ');
	}
	forward.normalize();
	const referenceUp =
		Math.abs(forward.dot(WORLD_UP)) > 0.999 ? FALLBACK_UP : WORLD_UP;
	const right = forward.clone().cross(referenceUp).normalize();
	const up = right.clone().cross(forward).normalize();
	return { eye, forward, right, up };
}

export function createEditorCameraFramingGeometry(
	position: CameraFramingPoint,
	target: CameraFramingPoint,
	fov: number,
	aspect: number
): EditorCameraFramingGeometry {
	if (
		!Number.isFinite(fov) ||
		fov < CAMERA_FOV.min ||
		fov > CAMERA_FOV.max
	) {
		throw new Error('Camera FOV is outside the supported range');
	}
	if (!Number.isFinite(aspect) || aspect <= 0) {
		throw new Error('Camera aspect must be positive');
	}
	const basis = createEditorCameraFramingBasis(position, target);
	const distance = basis.eye.distanceTo(finiteVector(target, 'Camera target'));
	const depth = clampEditorCameraFrustumDepth(distance);
	const center = basis.eye.clone().addScaledVector(basis.forward, depth);
	const halfHeight = depth * Math.tan((fov * Math.PI) / 360);
	const halfWidth = halfHeight * aspect;
	const topHandle = center.clone().addScaledVector(basis.up, halfHeight);
	const bottomHandle = center.clone().addScaledVector(basis.up, -halfHeight);
	const corners = [
		center.clone().addScaledVector(basis.right, -halfWidth).addScaledVector(basis.up, halfHeight),
		center.clone().addScaledVector(basis.right, halfWidth).addScaledVector(basis.up, halfHeight),
		center.clone().addScaledVector(basis.right, halfWidth).addScaledVector(basis.up, -halfHeight),
		center.clone().addScaledVector(basis.right, -halfWidth).addScaledVector(basis.up, -halfHeight)
	] as const;
	return {
		depth,
		center: center.toArray(),
		topHandle: topHandle.toArray(),
		bottomHandle: bottomHandle.toArray(),
		corners: corners.map((corner) => corner.toArray()) as [
			Vec3,
			Vec3,
			Vec3,
			Vec3
		]
	};
}

/**
 * Line-segment vertex list for a finite frustum: four eye→corner rays plus the
 * four rectangle edges that close the FOV plane. Shared by the selected-object
 * framing helper and the preview virtual-camera frustum so both render exactly
 * the same projection.
 */
export function createEditorCameraFrustumLinePoints(
	eye: CameraFramingPoint,
	geometry: EditorCameraFramingGeometry
): Vector3[] {
	const origin = finiteVector(eye, 'Camera position');
	const corners = geometry.corners.map((corner) => new Vector3(...corner));
	const points: Vector3[] = [];
	for (const corner of corners) points.push(origin.clone(), corner);
	for (let index = 0; index < corners.length; index += 1) {
		points.push(corners[index]!, corners[(index + 1) % corners.length]!);
	}
	return points;
}

export function verticalFovFromEditorCameraFrustumPoint(
	position: CameraFramingPoint,
	target: CameraFramingPoint,
	point: CameraFramingPoint
) {
	const basis = createEditorCameraFramingBasis(position, target);
	const distance = basis.eye.distanceTo(finiteVector(target, 'Camera target'));
	const depth = clampEditorCameraFrustumDepth(distance);
	const center = basis.eye.clone().addScaledVector(basis.forward, depth);
	const offset = Math.abs(finiteVector(point, 'FOV handle point').sub(center).dot(basis.up));
	const fov = (Math.atan2(offset, depth) * 360) / Math.PI;
	return Math.min(CAMERA_FOV.max, Math.max(CAMERA_FOV.min, fov));
}
