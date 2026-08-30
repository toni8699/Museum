import type { Room, Vec3 } from '$lib/types/scene';
import { VISITOR_CAMERA_PROJECTION } from '@portfolio/camera-core';
import type { LayoutBounds3 } from '$lib/layout/layout-geometry-types';
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

export type CardinalView = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

/** A fallback eye/target pair used when the active orbit pose is invalid. */
export type EditorCardinalFallback = {
	position: Vector3;
	target: Vector3;
};

/** Resolves a canonical fallback eye/target pair, or null when none is valid. */
export type EditorCardinalFallbackResolver = () => EditorCardinalFallback | null;

/**
 * Builds the P3B.1 composed fallback resolver: step 2 frames the given layout
 * bounds, step 3 falls back to the neutral editor pose.
 *
 * The live orbit vectors are used only as the framing *direction*, and only
 * when they form a valid basis — this resolver runs precisely when that pose
 * is invalid (non-finite/degenerate), so otherwise the neutral gaze direction
 * stands in (`createEditorBoundsCameraFrame`'s degenerate guard cannot recover
 * a non-finite input: `NaN < eps` is false). Frame outputs are validated before
 * return so a poisoned frame can never block the neutral fallback.
 */
export function createEditorBoundsNeutralFallback(
	layoutBounds: LayoutBounds3 | null,
	currentPosition: Vector3,
	currentTarget: Vector3,
	options: EditorBoundsCameraFrameOptions = {}
): EditorCardinalFallbackResolver {
	return () => {
		const neutralPose: EditorCardinalFallback = {
			position: new Vector3(...EDITOR_NEUTRAL_CAMERA_POSITION),
			target: new Vector3(...EDITOR_NEUTRAL_CAMERA_TARGET)
		};
		if (!layoutBounds) return neutralPose;

		const validLiveBasis =
			isFiniteVector3(currentPosition) &&
			isFiniteVector3(currentTarget) &&
			currentPosition.distanceToSquared(currentTarget) > 1e-8;
		const frame = createEditorBoundsCameraFrame(
			new Box3(
				new Vector3(...layoutBounds.min),
				new Vector3(...layoutBounds.max)
			),
			validLiveBasis ? currentPosition : neutralPose.position,
			validLiveBasis ? currentTarget : neutralPose.target,
			options
		);
		if (
			frame &&
			frame.position.every(Number.isFinite) &&
			frame.target.every(Number.isFinite)
		) {
			return {
				position: new Vector3(...frame.position),
				target: new Vector3(...frame.target)
			};
		}
		return neutralPose;
	};
}

/**
 * Owner-approved P3B.1 mapping. A face label is the side of the target where
 * the eye sits: `eye = target + faceDirection × distance`.
 */
export const CARDINAL_FACE_TO_EYE: Record<CardinalView, Vec3> = {
	'+X': [1, 0, 0],
	'-X': [-1, 0, 0],
	'+Y': [0, 1, 0],
	'-Y': [0, -1, 0],
	'+Z': [0, 0, 1],
	'-Z': [0, 0, -1]
};

/** Deterministic roll reference used inside the snap `lookAt` (DS §8). */
export const CARDINAL_FACE_UP: Record<CardinalView, Vec3> = {
	'+X': [0, 1, 0],
	'-X': [0, 1, 0],
	'+Y': [0, 0, -1],
	'-Y': [0, 0, 1],
	'+Z': [0, 1, 0],
	'-Z': [0, 1, 0]
};

/** Minimum acceptable eye-target distance; anything at or below this is degenerate. */
export const EDITOR_CARDINAL_MIN_DISTANCE = 1e-4;

function isFiniteVector3(vector: Vector3): boolean {
	return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function clampCardinalDistance(
	distance: number,
	controls: EditorOrbitControlsLike
): number | null {
	const min = Number.isFinite(controls.minDistance) ? controls.minDistance : -Infinity;
	const max = Number.isFinite(controls.maxDistance) ? controls.maxDistance : Infinity;
	const clamped = clamp(distance, min, max);
	if (!Number.isFinite(clamped) || clamped <= EDITOR_CARDINAL_MIN_DISTANCE) return null;
	return clamped;
}

/**
 * Consume pending damped rotate/pan residue against the current pose. A
 * released orbit fling leaves inertia inside OrbitControls that the next
 * `controls.update()` applies, so an exact pose commit must drain it first —
 * before the commit resolves its eye/target — or the snap drifts off the
 * cardinal alignment (and the per-frame damping task keeps drifting it).
 * Disabling damping makes a single update consume the full remaining delta
 * at once; the prior flag is restored even if `update` throws.
 *
 * Also shared by the P3B.4 orientation-widget cancellation handoff, which
 * drains residue after restoring the global +Y pole so an interrupted flight
 * stays put under the per-frame damping task.
 */
export function consumeEditorOrbitInertia(controls: EditorOrbitControlsLike): void {
	const enableDamping = controls.enableDamping;
	try {
		controls.enableDamping = false;
		controls.update();
	} finally {
		controls.enableDamping = enableDamping;
	}
}

/** Validated current orbit basis (settled target + clamped distance), or null. */
function resolveCurrentCardinalBasis(
	camera: PerspectiveCamera,
	controls: EditorOrbitControlsLike
): { target: Vector3; distance: number } | null {
	const currentDistance = camera.position.distanceTo(controls.target);
	if (
		isFiniteVector3(controls.target) &&
		Number.isFinite(currentDistance) &&
		currentDistance > EDITOR_CARDINAL_MIN_DISTANCE
	) {
		const distance = clampCardinalDistance(currentDistance, controls);
		if (distance !== null) return { target: controls.target.clone(), distance };
	}
	return null;
}

/** Validated injected-fallback basis, or null. The resolver runs once per call. */
function resolveFallbackBasis(
	controls: EditorOrbitControlsLike,
	fallback: EditorCardinalFallbackResolver
): { target: Vector3; distance: number } | null {
	const candidate = fallback();
	if (candidate && isFiniteVector3(candidate.target) && isFiniteVector3(candidate.position)) {
		const fallbackDistance = candidate.position.distanceTo(candidate.target);
		if (
			Number.isFinite(fallbackDistance) &&
			fallbackDistance > EDITOR_CARDINAL_MIN_DISTANCE
		) {
			const distance = clampCardinalDistance(fallbackDistance, controls);
			if (distance !== null) return { target: candidate.target.clone(), distance };
		}
	}
	return null;
}

/**
 * P3B.4 two-phase split — phase 1 (basis resolution). Resolves and validates
 * the committed `{target, distance}` across the active settled orbit pose and
 * the injected fallback, draining pending damped inertia between them exactly
 * like the instant commit. Returns null — with zero camera/controls mutation —
 * when no viable basis exists; a viable resolution guarantees the commit.
 *
 * Phase 2 is either the atomic instant commit (`snapEditorViewToCardinal`) or
 * the animated path (`createEditorCardinalSnapMotion` in the camera-motion
 * authority, driven by the orientation widget's per-frame task).
 */
export function resolveEditorCardinalSnapBasis(
	camera: PerspectiveCamera,
	controls: EditorOrbitControlsLike,
	fallback: EditorCardinalFallbackResolver = () => null
): { target: Vector3; distance: number } | null {
	const initial =
		resolveCurrentCardinalBasis(camera, controls) ??
		resolveFallbackBasis(controls, fallback);
	if (!initial) return null;
	consumeEditorOrbitInertia(controls);
	return resolveCurrentCardinalBasis(camera, controls) ?? initial;
}

/**
 * Owner-approved P3B.1 cardinal snap. Instantly repositions the editor camera
 * to look at the target from the requested cardinal side, preserving projection,
 * FOV, zoom, near/far, OrbitControls limits/config, selection, tool, document,
 * and history. Session-local viewport presentation only.
 *
 * Target/distance are resolved via the shared phase-1 helper
 * (`resolveEditorCardinalSnapBasis`) before commit, so a failed snap returns
 * `false` without mutating the camera — basis resolution is the only failure
 * exit, and the injected resolver runs at most once per snap. Only a viable
 * snap consumes pending damped orbit/pan inertia against the pre-snap pose
 * before that resolution (a released fling must not displace the committed
 * eye/target), so the resolved distance reflects the settled controls state.
 * The table `camera.up` is used only inside the commit `lookAt`; after commit
 * it is restored to `(0, 1, 0)` so subsequent orbit drags keep the standard
 * `+Y` pole.
 *
 * Fallback authority (cited): callers build the injected resolver from the
 * existing framing APIs in this module — `createEditorBoundsCameraFrame` (or a
 * node/placement/room variant) for step 2, and the neutral editor pose
 * `EDITOR_NEUTRAL_CAMERA_POSITION` / `EDITOR_NEUTRAL_CAMERA_TARGET` for step 3.
 * The helper never computes its own bounds or magic distance.
 */
export function snapEditorViewToCardinal(
	face: CardinalView,
	camera: PerspectiveCamera,
	controls: EditorOrbitControlsLike,
	fallback: EditorCardinalFallbackResolver = () => null
): boolean {
	const direction = CARDINAL_FACE_TO_EYE[face];
	const up = CARDINAL_FACE_UP[face];
	// Atomic no-op: resolve the viable basis before mutating anything. This is
	// the only failure exit — once the flush inside phase 1 has run, a commit
	// is guaranteed.
	const pose = resolveEditorCardinalSnapBasis(camera, controls, fallback);
	if (!pose) return false;

	camera.up.set(up[0], up[1], up[2]);
	camera.position
		.copy(pose.target)
		.addScaledVector(new Vector3(direction[0], direction[1], direction[2]), pose.distance);
	camera.lookAt(pose.target);
	controls.target.copy(pose.target);
	// The pose is already clamped into controls min/max, so this update cannot
	// re-clamp; the min/max swap dance of the director-observer helper is not
	// needed here.
	controls.update();
	// Post-snap orbit pole: restore +Y after the update (not before) so the
	// update's internal lookAt keeps the table roll instead of re-deriving it
	// through the epsilon guard while the view is polar.
	camera.up.set(0, 1, 0);
	return true;
}

function rotateLocalOffset(room: Room, offset: Vec3): Vec3 {
	const yaw = room.rotation[1];
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	const [x, y, z] = offset;
	return [x * cos + z * sin, y, -x * sin + z * cos];
}

/**
 * frame a compiled layout room's `bounds3` AABB through the generic
 * bounds path (the placement/selection frame). Axis-aligned by construction;
 * unlike `createEditorRoomCameraFrame` it does not follow an authored yaw, and
 * it accepts drafted (non-Chopin) rooms.
 */
export function createEditorRoomBoundsCameraFrame(
	bounds: LayoutBounds3,
	currentPosition: Vector3,
	currentTarget: Vector3,
	options: EditorBoundsCameraFrameOptions = {}
): EditorBoundsCameraFrame | null {
	return createEditorBoundsCameraFrame(
		new Box3(
			new Vector3(bounds.min[0], bounds.min[1], bounds.min[2]),
			new Vector3(bounds.max[0], bounds.max[1], bounds.max[2])
		),
		currentPosition,
		currentTarget,
		options
	);
}

/** Deterministic whole-room framing that follows the room's authored yaw. */
export function createEditorRoomCameraFrame(
	room: Room,
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
