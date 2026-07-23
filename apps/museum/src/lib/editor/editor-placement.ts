import { degreesToRadians } from './editor-transform';
import { roomById } from '$lib/content/rooms';
import type { MuseumRoomId } from '$lib/types/museum';
import {
	Box3,
	Raycaster,
	Vector3,
	type Intersection,
	type Object3D
} from 'three';

export const TRANSLATION_SNAP_STEPS = [0.01, 0.05, 0.1, 0.5, 1.0] as const;
export const ROTATION_SNAP_DEGREES_OPTIONS = [1, 5, 15, 45, 90] as const;

export const DEFAULT_TRANSLATION_SNAP = 0.1;
export const DEFAULT_ROTATION_SNAP_DEGREES = 15;

/** Ignore near-zero grounding deltas so already-on-floor drops create no history. */
export const GROUND_EPSILON = 1e-4;
export const FLOOR_RAY_EPSILON = 0.02;
export const MAX_DROP_DISTANCE = 50;

export type EditorSurfaceUserData = {
	type: 'floor';
	placeable: boolean;
	roomId?: string;
};

export type FloorHit = {
	point: Vector3;
	distance: number;
	object: Object3D;
};

export type PlaceableFloorIntersection = {
	intersection: Intersection;
	roomId: MuseumRoomId;
};

export function rotationSnapRadians(degrees: number) {
	return degreesToRadians(degrees);
}

export function isEditorPlaceableFloor(object: Object3D): boolean {
	const surface = object.userData?.editorSurface as EditorSurfaceUserData | undefined;
	return (
		object.userData?.surfaceType === 'floor' &&
		surface?.type === 'floor' &&
		surface.placeable === true
	);
}

export function getEditorPlaceableFloor(
	object: Object3D,
	roomId?: string
): Object3D | null {
	let current: Object3D | null = object;
	while (current) {
		if (isEditorPlaceableFloor(current)) {
			const surface = current.userData.editorSurface as EditorSurfaceUserData;
			if (!roomId || surface.roomId === roomId) return current;
		}
		current = current.parent;
	}
	return null;
}

/** Intersections are already nearest-first; accept only exact semantic floor metadata. */
export function findPlaceableFloorIntersection(
	intersections: Intersection[],
	roomId?: MuseumRoomId
): PlaceableFloorIntersection | null {
	for (const hit of intersections) {
		const floor = getEditorPlaceableFloor(hit.object, roomId);
		if (!floor) continue;
		const surface = floor.userData.editorSurface as EditorSurfaceUserData;
		if (!surface.roomId || !roomById.has(surface.roomId as MuseumRoomId)) continue;
		return {
			intersection: hit,
			roomId: surface.roomId as MuseumRoomId
		};
	}
	return null;
}

export function getPlacementWorldBounds(root: Object3D): Box3 {
	root.updateWorldMatrix(true, true);
	return new Box3().setFromObject(root);
}

export function calculateGroundDeltaY(bounds: Box3, floorY: number) {
	return floorY - bounds.min.y;
}

export function snapRoomLocalPosition(
	root: Object3D,
	step: number,
	options: { snapY?: boolean } = {}
) {
	if (!(step > 0) || !Number.isFinite(step)) return;
	root.position.x = Math.round(root.position.x / step) * step;
	if (options.snapY ?? true) {
		root.position.y = Math.round(root.position.y / step) * step;
	}
	root.position.z = Math.round(root.position.z / step) * step;
}

/**
 * Apply a world-space Y delta to a placement root, converting through any parent.
 */
export function applyWorldYDeltaToPlacement(root: Object3D, deltaY: number) {
	if (!Number.isFinite(deltaY) || Math.abs(deltaY) < GROUND_EPSILON) return;

	const world = new Vector3();
	root.getWorldPosition(world);
	world.y += deltaY;

	if (root.parent) {
		root.parent.worldToLocal(world);
	}

	root.position.copy(world);
}

function isDescendantOf(object: Object3D, ancestor: Object3D) {
	let current: Object3D | null = object;
	while (current) {
		if (current === ancestor) return true;
		current = current.parent;
	}
	return false;
}

function climbToPlaceableFloor(object: Object3D): Object3D | null {
	return getEditorPlaceableFloor(object);
}

function collectRayOrigins(bounds: Box3): Vector3[] {
	const min = bounds.min;
	const max = bounds.max;
	const center = bounds.getCenter(new Vector3());
	const y = max.y + FLOOR_RAY_EPSILON;

	return [
		new Vector3(center.x, y, center.z),
		new Vector3(min.x, y, min.z),
		new Vector3(min.x, y, max.z),
		new Vector3(max.x, y, min.z),
		new Vector3(max.x, y, max.z)
	];
}

/**
 * Limit grounding raycasts to tagged floor subtrees. The editor scene also contains
 * screen-space Line2 helpers whose raycast implementation requires a camera.
 */
function collectPlaceableFloorRaycastTargets(targets: Object3D[]): Object3D[] {
	const floorTargets: Object3D[] = [];
	for (const target of targets) {
		target.traverse((object) => {
			if (getEditorPlaceableFloor(object)) floorTargets.push(object);
		});
	}
	return floorTargets;
}

function bestValidFloorHit(
	hits: Intersection[],
	excludedRoots: Object3D[],
	preferredRoomId?: string
): FloorHit | null {
	let bestPreferred: FloorHit | null = null;
	let bestFallback: FloorHit | null = null;

	for (const hit of hits) {
		if (excludedRoots.some((root) => isDescendantOf(hit.object, root))) continue;
		const floor = climbToPlaceableFloor(hit.object);
		if (!floor) continue;
		const candidate = {
				point: hit.point.clone(),
				distance: hit.distance,
				object: floor
			};
		const floorRoomId =
			floor.userData?.roomId ??
			(floor.userData?.editorSurface as EditorSurfaceUserData | undefined)?.roomId;
		if (preferredRoomId && floorRoomId === preferredRoomId) {
			if (!bestPreferred || candidate.point.y > bestPreferred.point.y) {
				bestPreferred = candidate;
			}
		} else if (!bestFallback || candidate.point.y > bestFallback.point.y) {
			bestFallback = candidate;
		}
	}

	return bestPreferred ?? bestFallback;
}

export function findFloorBelowBounds(
	bounds: Box3,
	targets: Object3D[],
	excludedRoots: Object3D[],
	preferredRoomId?: string,
	raycaster = new Raycaster()
): FloorHit | null {
	if (bounds.isEmpty()) return null;
	const floorTargets = collectPlaceableFloorRaycastTargets(targets);
	if (floorTargets.length === 0) return null;

	const down = new Vector3(0, -1, 0);
	let best: FloorHit | null = null;

	for (const origin of collectRayOrigins(bounds)) {
		raycaster.set(origin, down);
		raycaster.far = MAX_DROP_DISTANCE;
		const hits = raycaster.intersectObjects(floorTargets, false);
		const candidate = bestValidFloorHit(hits, excludedRoots, preferredRoomId);
		if (!candidate) continue;
		const candidateRoomId =
			candidate.object.userData?.roomId ??
			(candidate.object.userData?.editorSurface as EditorSurfaceUserData | undefined)?.roomId;
		const bestRoomId = best
			? best.object.userData?.roomId ??
				(best.object.userData?.editorSurface as EditorSurfaceUserData | undefined)?.roomId
			: undefined;
		const candidatePreferred = preferredRoomId && candidateRoomId === preferredRoomId;
		const bestPreferred = preferredRoomId && bestRoomId === preferredRoomId;
		if (
			!best ||
			(candidatePreferred && !bestPreferred) ||
			(candidatePreferred === bestPreferred && candidate.point.y > best.point.y)
		) {
			best = candidate;
		}
	}

	return best;
}

/**
 * Raycast downward from the placement bounds against scene objects.
 * Returns the nearest placeable floor hit below the object, or null.
 */
export function findFloorBelowPlacement(
	root: Object3D,
	targets: Object3D[],
	raycaster = new Raycaster()
): FloorHit | null {
	const bounds = getPlacementWorldBounds(root);
	const preferredRoomId = root.userData?.roomId as string | undefined;
	return findFloorBelowBounds(bounds, targets, [root], preferredRoomId, raycaster);
}

/**
 * Move the placement root so its world AABB bottom rests on the floor hit.
 * Returns the applied world Y delta (0 if none).
 */
export function dropPlacementToFloor(root: Object3D, floorHit: FloorHit): number {
	const bounds = getPlacementWorldBounds(root);
	const deltaY = calculateGroundDeltaY(bounds, floorHit.point.y);
	if (Math.abs(deltaY) < GROUND_EPSILON) return 0;
	applyWorldYDeltaToPlacement(root, deltaY);
	return deltaY;
}

/**
 * Ground a placement against the nearest placeable floor below it.
 * Returns false when no valid floor exists.
 */
export function groundPlacementToFloor(
	root: Object3D,
	targets: Object3D[]
): { grounded: boolean; deltaY: number } {
	const floorHit = findFloorBelowPlacement(root, targets);
	if (!floorHit) return { grounded: false, deltaY: 0 };
	const deltaY = dropPlacementToFloor(root, floorHit);
	return { grounded: true, deltaY };
}

/** Ground a selection with one shared world-Y delta, preserving rigid spacing. */
export function groundSelectionRigidly(
	roots: Object3D[],
	targets: Object3D[]
): { grounded: boolean; deltaY: number } {
	if (roots.length === 0) return { grounded: false, deltaY: 0 };
	const bounds = new Box3();
	for (const root of roots) bounds.union(getPlacementWorldBounds(root));
	const preferredRoomId = roots[0]?.userData?.roomId as string | undefined;
	const floorHit = findFloorBelowBounds(bounds, targets, roots, preferredRoomId);
	if (!floorHit) return { grounded: false, deltaY: 0 };
	const deltaY = calculateGroundDeltaY(bounds, floorHit.point.y);
	if (Math.abs(deltaY) < GROUND_EPSILON) return { grounded: true, deltaY: 0 };
	for (const root of roots) applyWorldYDeltaToPlacement(root, deltaY);
	return { grounded: true, deltaY };
}
