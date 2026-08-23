import type { SceneObjectPlacement } from '$lib/content/scene';
import type { Vec3 } from '$lib/types/scene';
import type { Object3D } from 'three';
import type { EditorCameraSelection } from './editor-selection';
import type { EditorNavigationSelection } from './editor-selection';
import {
	MIN_PLACEMENT_SCALE as SCALE_MIN,
	SCALE_UNIFORM_EPSILON,
	averageScale,
	isUniformVector,
	type ScaleMode
} from './scale-vector';

export type { ScaleMode } from './scale-vector';
export {
	MIN_PLACEMENT_SCALE,
	SCALE_UNIFORM_EPSILON,
	resolveEditorPlacementScale
} from './scale-vector';

export type EditorTransformMode = 'translate' | 'rotate' | 'scale';

/**
 * Phase 1a — `PlacementTransform` now carries scale mode + vector in addition
 * to the existing scalar field. `scale` and `scaleScalar` always hold the
 * same number; the dual field exists so existing callers keep working while
 * the spec / future schema work reads `scaleScalar` for clarity.
 *
 * Schema v6 only ever persists `placement.scale: number`; `placementTransform`
 * is editor-session only. Visitor falls back to reading `placement.scale`
 * (the schema scalar) — independent-scaled placements render at uniform 1×.
 * Closes at schema v7.
 */
export type PlacementTransform = {
	position: Vec3;
	rotation: Vec3;
	scale: number;
	scaleScalar: number;
	scaleVector: Vec3 | null;
	scaleMode: ScaleMode;
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
	| {
			kind: 'anchor';
			key: string;
			object: Object3D;
			connectionId: string;
			anchorId: string;
	  }
	| {
			kind: 'view-target';
			key: string;
			object: Object3D;
			connectionId: string;
			direction: 'forward' | 'reverse';
			keyframeId: string;
	  }
	| null;

export function getActiveTransformTarget(input: {
	previewActive: boolean;
	pendingPlacement: boolean;
	placementKey: string;
	placementObject?: Object3D;
	cameraSelection?: EditorCameraSelection | null;
	navigationSelection?: EditorNavigationSelection;
	cameraObject?: Object3D;
	anchorObject?: Object3D;
	viewTargetObject?: Object3D;
}): ActiveTransformTarget {
	if (input.previewActive || input.pendingPlacement) return null;
	const navigationSelection =
		input.navigationSelection ??
		(input.cameraSelection
			? { kind: 'node' as const, ...input.cameraSelection }
			: null);
	if (navigationSelection?.kind === 'anchor') {
		return input.anchorObject
			? {
					kind: 'anchor',
					key: `anchor:${navigationSelection.connectionId}:${navigationSelection.anchorId}`,
					object: input.anchorObject,
					connectionId: navigationSelection.connectionId,
					anchorId: navigationSelection.anchorId
			  }
			: null;
	}
	if (navigationSelection?.kind === 'view-keyframe') {
		return input.viewTargetObject
			? {
					kind: 'view-target',
					key: `view-target:${navigationSelection.connectionId}:${navigationSelection.direction}:${navigationSelection.keyframeId}`,
					object: input.viewTargetObject,
					connectionId: navigationSelection.connectionId,
					direction: navigationSelection.direction,
					keyframeId: navigationSelection.keyframeId
			  }
			: null;
	}
	if (navigationSelection?.kind === 'node') {
		return input.cameraObject
			? {
					kind: 'camera',
					key: `camera:${navigationSelection.nodeId}:${navigationSelection.handle}`,
					object: input.cameraObject,
					nodeId: navigationSelection.nodeId,
					handle: navigationSelection.handle
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

const UNIT_SCALE_EPSILON = 1e-6;

export function radiansToDegrees(value: number) {
	return (value * 180) / Math.PI;
}

export function degreesToRadians(value: number) {
	return (value * Math.PI) / 180;
}

export function placementTransformFromDocument(
	placement: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'>,
	overrideScaleVector: Vec3 | null = null
): PlacementTransform {
	const documentScalar = placement.scale ?? 1;
	// Caller can pass a non-null `overrideScaleVector` (e.g. editor-session
	// memory) when the placement has been scaled independently. Schema v6
	// only ever persists a scalar, so the vector lives only in editor memory
	// and is layered back on top of the document read here. `scaleScalar`
	// reverts to the average so visitor render remains self-consistent.
	if (overrideScaleVector === null) {
		return {
			position: [...placement.position],
			rotation: [...placement.rotation],
			scale: documentScalar,
			scaleScalar: documentScalar,
			scaleVector: null,
			scaleMode: 'uniform'
		};
	}
	const sx = Math.max(SCALE_MIN, overrideScaleVector[0]);
	const sy = Math.max(SCALE_MIN, overrideScaleVector[1]);
	const sz = Math.max(SCALE_MIN, overrideScaleVector[2]);
	const uniform = isUniformVector([sx, sy, sz]);
	const average = (sx + sy + sz) / 3;
	return {
		position: [...placement.position],
		rotation: [...placement.rotation],
		scale: documentScalar,
		scaleScalar: average,
		scaleVector: uniform ? null : ([sx, sy, sz] as Vec3),
		scaleMode: uniform ? 'uniform' : 'independent'
	};
}

/**
 * Decompose a Three.js root into a `PlacementTransform`. Whenever the three
 * scale components differ (within ε), the result is `independent` mode with
 * the three-component vector; otherwise the result is `uniform` with the
 * scalar (visitor-friendly) representation.
 */
export function placementTransformFromObject(root: Object3D): PlacementTransform {
	const sx = Math.max(SCALE_MIN, root.scale.x);
	const sy = Math.max(SCALE_MIN, root.scale.y);
	const sz = Math.max(SCALE_MIN, root.scale.z);
	const uniform = isUniformVector([sx, sy, sz]);
	const vector: Vec3 | null = uniform ? null : [sx, sy, sz];
	const scalar = uniform ? sx : averageScale([sx, sy, sz]);
	return {
		position: [root.position.x, root.position.y, root.position.z],
		rotation: [root.rotation.x, root.rotation.y, root.rotation.z],
		scale: scalar,
		scaleScalar: scalar,
		scaleVector: vector,
		scaleMode: uniform ? 'uniform' : 'independent'
	};
}

export function isValidPlacementTransform(transform: PlacementTransform) {
	if (
		!transform.position.every(Number.isFinite) ||
		!transform.rotation.every(Number.isFinite)
	) {
		return false;
	}
	if (!Number.isFinite(transform.scale) || transform.scale < SCALE_MIN) return false;
	if (transform.scaleVector) {
		if (!transform.scaleVector.every((component) => component >= SCALE_MIN)) {
			return false;
		}
	}
	return true;
}

/**
 * Apply one scalar to the root and return it. TransformControls exposes X/Y/Z/XYZ in scale mode.
 *
 * Phase 1a — only enforce when caller hands us scale mode `'uniform'`. Independent
 * mode keeps the Three.js per-axis values untouched (later code can stream OBB
 * corners through the per-axis scale for rotation-aware hover/selection).
 */
export function enforceUniformObjectScale(root: Object3D, axis: string | null) {
	const component =
		axis === 'Y' ? root.scale.y : axis === 'Z' ? root.scale.z : root.scale.x;
	const scalar = Number.isFinite(component)
		? Math.max(SCALE_MIN, component)
		: SCALE_MIN;
	root.scale.setScalar(scalar);
	return scalar;
}

export function writePlacementTransform(
	placement: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'>,
	transform: PlacementTransform
) {
	if (!isValidPlacementTransform(transform)) return false;
	placement.position = [...transform.position];
	placement.rotation = [...transform.rotation];

	// Phase 1a — schema v6 only persists the scalar. Independent mode picks
	// the average of the vector so visitor renders something self-consistent;
	// uniform mode uses the explicit scalar. Both fall back to "field absent"
	// when the resolved value would round-trip to exactly 1.0.
	const scalar =
		transform.scaleMode === 'independent' && transform.scaleVector
			? averageScale(transform.scaleVector)
			: transform.scaleScalar;
	if (Math.abs(scalar - 1) <= UNIT_SCALE_EPSILON) {
		delete placement.scale;
	} else {
		placement.scale = scalar;
	}
	return true;
}
