import {
	isWorldPointInsideRoomXZ,
	roomLocalPoint,
	roomPoint
} from '$lib/content/rooms';
import type {
	MuseumSceneDocument,
	SceneConnection,
	ScenePathAnchor
} from '$lib/content/scene';
import {
	createCameraPositionPath,
	type CameraPositionPathPart,
	type Vector3Like
} from '$lib/museum/navigation/camera-motion';
import type { MuseumRoomId, Vec3 } from '$lib/types/museum';
import type { CameraConnectionDirection } from '$lib/types/museum';
import { CurvePath, MathUtils, Vector3 } from 'three';

export const EDITOR_CAMERA_PATH_SAMPLES_PER_METER = 8;
export const EDITOR_CAMERA_PATH_MIN_SAMPLES = 32;
export const EDITOR_CAMERA_PATH_MAX_SAMPLES = 512;
export const EDITOR_CAMERA_PATH_COARSE_STEPS = 128;
export const EDITOR_CAMERA_PATH_REFINEMENT_STEPS = 12;
export const EDITOR_CAMERA_PATH_MOVE_EPSILON = 1e-4;

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

function resolveScenePoint(point: { position: Vec3; roomId?: MuseumRoomId }): Vec3 {
	return point.roomId ? roomPoint(point.roomId, point.position) : [...point.position];
}

function getDraftConnection(
	document: MuseumSceneDocument,
	connectionId: string
): SceneConnection {
	const connection = document.connections.find((candidate) => candidate.id === connectionId);
	if (!connection) throw new Error(`Unknown scene connection: ${connectionId}`);
	return connection;
}

function getDraftNode(document: MuseumSceneDocument, nodeId: string) {
	const node = document.navigationNodes.find((candidate) => candidate.id === nodeId);
	if (!node) throw new Error(`Unknown navigation node in scene connection: ${nodeId}`);
	return node;
}

/**
 * Resolve one draft connection without validating or rebuilding the full runtime graph.
 * Returned endpoint/interior tuples are fresh world-space values.
 */
export function resolveDraftConnectionPathPart(
	document: MuseumSceneDocument,
	connectionId: string
): CameraPositionPathPart {
	const connection = getDraftConnection(document, connectionId);
	const fromNode = getDraftNode(document, connection.fromNodeId);
	const toNode = getDraftNode(document, connection.toNodeId);
	const points = [
		roomPoint(fromNode.roomId, fromNode.position),
		...connection.positionPath.anchors.map(resolveScenePoint),
		roomPoint(toNode.roomId, toNode.position)
	];

	return connection.positionPath.kind === 'rounded-polyline'
		? {
				kind: 'rounded-polyline',
				points,
				clearance: connection.clearance
			}
		: { kind: 'auto-bezier', anchors: points };
}

/** Build exact shared visitor/editor curve for one live draft connection. */
export function createDraftConnectionPositionPath(
	document: MuseumSceneDocument,
	connectionId: string,
	direction: CameraConnectionDirection = 'forward'
) {
	const part = resolveDraftConnectionPathPart(document, connectionId);
	if (direction === 'reverse') {
		return createCameraPositionPath([
			part.kind === 'rounded-polyline'
				? {
						...part,
						points: [...part.points].reverse()
					}
				: {
						...part,
						anchors: [...part.anchors].reverse()
					}
		]);
	}
	return createCameraPositionPath([part]);
}

/** Smallest free deterministic ID, keeping two digits until index 100. */
export function allocateCameraPathAnchorId(
	connectionId: string,
	existingAnchorIds: Iterable<string>
) {
	const occupied = new Set(existingAnchorIds);
	for (let index = 1; ; index += 1) {
		const candidate = `${connectionId}-anchor-${String(index).padStart(2, '0')}`;
		if (!occupied.has(candidate)) return candidate;
	}
}

/** Resolve stable selection IDs against the current draft after undo/redo. */
export function findScenePathAnchor(
	document: MuseumSceneDocument,
	connectionId: string,
	anchorId: string
): ScenePathAnchor | null {
	const connection = document.connections.find((candidate) => candidate.id === connectionId);
	return connection?.positionPath.anchors.find((anchor) => anchor.id === anchorId) ?? null;
}

/** Read an authored anchor in world space without exposing its stored coordinate basis. */
export function getScenePathAnchorWorldPosition(anchor: ScenePathAnchor): Vec3 {
	return resolveScenePoint(anchor);
}

/**
 * Update one authored anchor from world space. Existing room ownership is retained even
 * when the new point leaves that room's footprint.
 */
export function writeScenePathAnchorWorldPosition(
	anchor: ScenePathAnchor,
	worldPosition: Vector3Like
) {
	const point = cloneFiniteVec3(worldPosition, 'Camera path anchor position');
	anchor.position = anchor.roomId ? roomLocalPoint(anchor.roomId, point) : point;
	return anchor;
}

/**
 * New anchors belong to the active room only when their initial world hit is inside its
 * yaw-aware XZ footprint. Otherwise they remain world-space anchors.
 */
export function createScenePathAnchorAtWorldPoint(
	id: string,
	worldPosition: Vector3Like,
	activeRoomId: MuseumRoomId | null | undefined
): ScenePathAnchor {
	const point = cloneFiniteVec3(worldPosition, 'Camera path anchor position');
	if (activeRoomId && isWorldPointInsideRoomXZ(activeRoomId, point)) {
		return {
			id,
			roomId: activeRoomId,
			position: roomLocalPoint(activeRoomId, point)
		};
	}
	return { id, position: point };
}

function sampleDistanceSquared(
	path: CurvePath<Vector3>,
	progress: number,
	target: Vector3,
	output: Vector3
) {
	path.getPointAt(progress, output);
	return Number.isFinite(output.x) && Number.isFinite(output.y) && Number.isFinite(output.z)
		? output.distanceToSquared(target)
		: Number.POSITIVE_INFINITY;
}

/**
 * Find nearest normalized visitor-sampling progress: 128 coarse intervals followed by
 * 12 ternary refinements inside the winning interval's two-neighbour bracket.
 */
export function findNearestCurveProgress(
	path: CurvePath<Vector3>,
	worldPosition: Vector3Like
) {
	const targetTuple = cloneFiniteVec3(worldPosition, 'Camera path pick position');
	const target = new Vector3(...targetTuple);
	const sample = new Vector3();
	const length = path.getLength();
	if (!Number.isFinite(length) || length <= Number.EPSILON || path.curves.length === 0) {
		return 0;
	}

	let coarseIndex = 0;
	let coarseDistance = Number.POSITIVE_INFINITY;
	for (let index = 0; index <= EDITOR_CAMERA_PATH_COARSE_STEPS; index += 1) {
		const progress = index / EDITOR_CAMERA_PATH_COARSE_STEPS;
		const distance = sampleDistanceSquared(path, progress, target, sample);
		if (distance < coarseDistance) {
			coarseDistance = distance;
			coarseIndex = index;
		}
	}

	let left = Math.max(0, (coarseIndex - 1) / EDITOR_CAMERA_PATH_COARSE_STEPS);
	let right = Math.min(1, (coarseIndex + 1) / EDITOR_CAMERA_PATH_COARSE_STEPS);
	for (let iteration = 0; iteration < EDITOR_CAMERA_PATH_REFINEMENT_STEPS; iteration += 1) {
		const third = (right - left) / 3;
		const leftProbe = left + third;
		const rightProbe = right - third;
		const leftDistance = sampleDistanceSquared(path, leftProbe, target, sample);
		const rightDistance = sampleDistanceSquared(path, rightProbe, target, sample);
		if (leftDistance <= rightDistance) {
			right = rightProbe;
		} else {
			left = leftProbe;
		}
	}

	const candidates = [
		coarseIndex / EDITOR_CAMERA_PATH_COARSE_STEPS,
		left,
		(left + right) / 2,
		right,
		0,
		1
	];
	let nearestProgress = candidates[0];
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const progress of candidates) {
		const distance = sampleDistanceSquared(path, progress, target, sample);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestProgress = progress;
		}
	}
	return MathUtils.clamp(nearestProgress, 0, 1);
}

/**
 * Convert normalized CurvePath progress to the interior-anchor array index for the
 * containing curve segment. Auto-Bézier paths contain one curve per authored span.
 */
export function getCameraPathInsertionIndex(
	path: CurvePath<Vector3>,
	progress: number
) {
	if (!Number.isFinite(progress)) {
		throw new Error('Camera path progress must be finite');
	}
	if (path.curves.length <= 1) return 0;

	const clampedProgress = MathUtils.clamp(progress, 0, 1);
	const pathLength = path.getLength();
	if (!Number.isFinite(pathLength) || pathLength <= Number.EPSILON) {
		return Math.min(
			Math.floor(clampedProgress * path.curves.length),
			path.curves.length - 1
		);
	}

	// three.js runtime makes `distance` optional, despite @types/three declaring it required.
	// CurvePath.getPointAt(progress) first maps `progress` to this `t`, then getPoint(t)
	// selects a child curve at `t * pathLength`; mirror that exact visitor sampling path.
	const mappedProgress = (
		path.getUtoTmapping as (u: number, distance?: number) => number
	)(clampedProgress);
	const distance = mappedProgress * pathLength;
	const cumulativeLengths = path.getCurveLengths();
	const index = cumulativeLengths.findIndex((curveEnd) => distance <= curveEnd);
	return index < 0 ? path.curves.length - 1 : index;
}

export function getCameraPathVisualSampleCount(path: CurvePath<Vector3>) {
	const length = path.getLength();
	const requested = Number.isFinite(length)
		? Math.ceil(Math.max(0, length) * EDITOR_CAMERA_PATH_SAMPLES_PER_METER)
		: EDITOR_CAMERA_PATH_MIN_SAMPLES;
	return MathUtils.clamp(
		requested,
		EDITOR_CAMERA_PATH_MIN_SAMPLES,
		EDITOR_CAMERA_PATH_MAX_SAMPLES
	);
}
