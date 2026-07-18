import type { SceneObjectPlacement } from '$lib/content/scene';
import type { Vec3 } from '$lib/types/museum';
import type { Object3D } from 'three';
import type { EditorCameraSelection } from './editor-selection';

export type EditorTransformMode = 'translate' | 'rotate' | 'scale';

export type PlacementTransform = {
	position: Vec3;
	rotation: Vec3;
	scale: number;
};

export type ActiveTransformTarget =
	| { kind: 'placement'; key: string; object: Object3D }
	| {
			kind: 'camera';
			key: string;
			object: Object3D;
			nodeId: string;
			handle: EditorCameraSelection['handle'];
	  }
	| null;

export function getActiveTransformTarget(input: {
	previewActive: boolean;
	pendingPlacement: boolean;
	placementKey: string;
	placementObject?: Object3D;
	cameraSelection: EditorCameraSelection | null;
	cameraObject?: Object3D;
}): ActiveTransformTarget {
	if (input.previewActive || input.pendingPlacement) return null;
	if (input.cameraSelection) {
		return input.cameraObject
			? {
					kind: 'camera',
					key: `camera:${input.cameraSelection.nodeId}:${input.cameraSelection.handle}`,
					object: input.cameraObject,
					nodeId: input.cameraSelection.nodeId,
					handle: input.cameraSelection.handle
			  }
			: null;
	}
	if (input.placementObject) {
		return {
			kind: 'placement',
			key: `placement:${input.placementKey}`,
			object: input.placementObject
		};
	}
	return null;
}

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
