import type { SceneObjectPlacement } from '$lib/content/scene';
import type { Vec3 } from '$lib/types/museum';
import type { Object3D } from 'three';

export type EditorTransformMode = 'translate' | 'rotate' | 'scale';

export type PlacementTransform = {
	position: Vec3;
	rotation: Vec3;
	scale: number;
};

export const MIN_PLACEMENT_SCALE = 0.01;
const UNIT_SCALE_EPSILON = 1e-6;

export function radiansToDegrees(value: number) {
	return (value * 180) / Math.PI;
}

export function degreesToRadians(value: number) {
	return (value * Math.PI) / 180;
}

export function placementTransformFromDocument(
	placement: SceneObjectPlacement
): PlacementTransform {
	return {
		position: [...placement.position],
		rotation: [...placement.rotation],
		scale: placement.scale ?? 1
	};
}

export function placementTransformFromObject(root: Object3D): PlacementTransform {
	return {
		position: [root.position.x, root.position.y, root.position.z],
		rotation: [root.rotation.x, root.rotation.y, root.rotation.z],
		scale: Math.max(MIN_PLACEMENT_SCALE, root.scale.x)
	};
}

export function isValidPlacementTransform(transform: PlacementTransform) {
	return (
		transform.position.every(Number.isFinite) &&
		transform.rotation.every(Number.isFinite) &&
		Number.isFinite(transform.scale) &&
		transform.scale >= MIN_PLACEMENT_SCALE
	);
}

/** Apply one scalar to the root and return it. TransformControls exposes X/Y/Z/XYZ in scale mode. */
export function enforceUniformObjectScale(root: Object3D, axis: string | null) {
	const component =
		axis === 'Y' ? root.scale.y : axis === 'Z' ? root.scale.z : root.scale.x;
	const scalar = Number.isFinite(component)
		? Math.max(MIN_PLACEMENT_SCALE, component)
		: MIN_PLACEMENT_SCALE;
	root.scale.setScalar(scalar);
	return scalar;
}

export function writePlacementTransform(
	placement: SceneObjectPlacement,
	transform: PlacementTransform
) {
	if (!isValidPlacementTransform(transform)) return false;
	placement.position = [...transform.position];
	placement.rotation = [...transform.rotation];
	if (Math.abs(transform.scale - 1) <= UNIT_SCALE_EPSILON) {
		delete placement.scale;
	} else {
		placement.scale = transform.scale;
	}
	return true;
}
