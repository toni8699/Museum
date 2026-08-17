/**
 * H1 S7 — layout target descriptors and baseline-relative delta math.
 *
 * S7 keeps layout gizmo editing detached: a layout selection resolves a pure,
 * renderer-neutral `LayoutGizmoTargetDescriptor` (tested math) but no live
 * layout adapter is handed to the host until S8 supplies its atomic candidate
 * session. This module therefore:
 *
 *  - resolves all five layout identities (room / wall / opening / interior
 *    anchor / object) from authored `LayoutDocument` + `CompiledLayoutGeometry`
 *    into a proxy pose + `EditorGizmoPolicy` + captured baseline;
 *  - derives raw, finite, baseline-relative `LayoutGizmoDelta`s (never
 *    compounding from a previous delta);
 *  - returns `null` for stale/read-only identities — never a proxy attached to
 *    a reloaded/undone identity.
 *
 * No document/state mutation, no Three/Svelte/DOM. `$lib/layout/**` stays
 * renderer-neutral; this module only reads it.
 */

import type { EditorGizmoPolicy } from './editor-gizmo-contract';
import type { LayoutSelection } from '../layout/layout-interaction';
import type { LayoutDocument, LayoutRoom, LayoutVec2 } from '$lib/layout/layout-types';
import type {
	CompiledLayoutGeometry,
	CompiledRoom,
	CompiledWall
} from '$lib/layout/layout-geometry-types';
import { geometryId } from '$lib/layout/layout-geometry-types';
import { pointAlongSamples } from '$lib/layout/layout-geometry-curve';
import type { Vec3 } from '$lib/types/museum';

/** A pose TransformControls would read/write on a session-only proxy object. */
export type LayoutGizmoProxyPose = {
	position: Vec3;
	rotation: Vec3;
	scale: Vec3;
};

/**
 * Captured authored values (plus the initial proxy pose) that
 * `deriveLayoutGizmoDelta` compares the current proxy pose against. S8 also
 * consumes these to build a candidate document from the immutable baseline.
 */
export type LayoutGizmoBaseline =
	| { kind: 'room'; position: Vec3; yaw: number }
	| { kind: 'wall'; position: Vec3 }
	| {
			kind: 'opening';
			position: Vec3;
			/** Three.js positive-Y yaw of the compiled tangent (local X axis). */
			yaw: number;
			width: number;
			height: number;
			sillHeight: number;
	  }
	| { kind: 'interiorAnchor'; point: LayoutVec2 }
	| { kind: 'object'; position: Vec3; rotation: Vec3; dimensions: Vec3 };

export type LayoutGizmoTargetDescriptor = {
	/** Collision-safe tuple key (an existing compiled `geometryId`). */
	key: string;
	selection: Exclude<LayoutSelection, { kind: 'none' }>;
	/** Initial proxy pose at resolve time. */
	proxyPose: LayoutGizmoProxyPose;
	policy: EditorGizmoPolicy;
	baseline: LayoutGizmoBaseline;
};

/**
 * Raw, finite, baseline-relative delta. S8 owns clamps, neighbor-overlap
 * checks, structural/geometry/compile/mesh validation, last-valid preview,
 * and the atomic layout-history commit.
 */
export type LayoutGizmoDelta =
	| { kind: 'room'; translation: LayoutVec2; yaw: number }
	| { kind: 'wall'; translation: LayoutVec2 }
	| { kind: 'opening'; centerShiftX: number; width: number; height: number }
	| { kind: 'interiorAnchor'; translation: LayoutVec2 }
	| { kind: 'object'; position: Vec3; rotation: Vec3; dimensions: Vec3 };

/** Fresh arrays per descriptor — proxy poses are session-owned, never shared. */
function identityPose(position: Vec3): LayoutGizmoProxyPose {
	return { position, rotation: [0, 0, 0], scale: [1, 1, 1] };
}

const ALL_PLANAR_AXES: ReadonlySet<'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz'> = new Set([
	'x',
	'y',
	'z',
	'xy',
	'xz',
	'yz',
	'xyz'
]);

/**
 * Room: translate x/z/xz or rotate y (room Y rotation), world space. Room Y
 * translation, room scale, and every other rotate axis are absent at control
 * level.
 */
const ROOM_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'rotate']),
	allowedAxes: (mode) => (mode === 'translate' ? new Set(['x', 'z', 'xz']) : new Set(['y'])),
	space: () => 'world',
	scaleControl: 'hidden'
};

/** Wall: translate x/z/xz only, world space. */
const WALL_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate']),
	allowedAxes: () => new Set(['x', 'z', 'xz']),
	space: () => 'world',
	scaleControl: 'hidden'
};

/** Opening: translate local X; scale x/y/xy with fixed-independent dimensions. */
const OPENING_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'scale']),
	allowedAxes: (mode) => (mode === 'translate' ? new Set(['x']) : new Set(['x', 'y', 'xy'])),
	space: () => 'local',
	scaleControl: 'fixed-independent'
};

/** Interior anchor: translate x/z/xz only, world space. */
const INTERIOR_ANCHOR_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate']),
	allowedAxes: () => new Set(['x', 'z', 'xz']),
	space: () => 'world',
	scaleControl: 'hidden'
};

/** Layout object: full modes; translate world, rotate/scale local. */
const OBJECT_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'rotate', 'scale']),
	allowedAxes: () => ALL_PLANAR_AXES,
	space: (mode) => (mode === 'translate' ? 'world' : 'local'),
	scaleControl: 'fixed-independent'
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Normalize `-0` → `+0` (the compiled `-atan2` yields `-0` for axis-aligned tangents). */
function normalizeZero(value: number): number {
	return Object.is(value, -0) ? 0 : value;
}

function findRoom(layout: LayoutDocument, roomId: string): { floorId: string; room: LayoutRoom } | null {
	for (const floor of layout.floors) {
		const room = floor.rooms.find((candidate) => candidate.id === roomId);
		if (room) return { floorId: floor.id, room };
	}
	return null;
}

function findCompiledRoom(geometry: CompiledLayoutGeometry, roomId: string): CompiledRoom | null {
	return geometry.rooms.find((candidate) => candidate.roomId === roomId) ?? null;
}

function findCompiledWall(compiledRoom: CompiledRoom, segmentId: string): CompiledWall | null {
	return compiledRoom.walls.find((candidate) => candidate.segmentId === segmentId) ?? null;
}

/**
 * Shoelace polygon centroid over the compiled floor polygon (identical to the
 * sampled authored-room centroid `transformLayoutRoomUnit` pivots around —
 * the centroid is invariant under inserting collinear edge samples, so the
 * compiled polygon and `roomBoundarySamples` agree). Fallback: average point.
 */
function polygonCentroid(points: readonly LayoutVec2[]): LayoutVec2 {
	if (points.length === 0) return [0, 0];
	let twiceArea = 0;
	let x = 0;
	let z = 0;
	for (let index = 0; index < points.length; index += 1) {
		const current = points[index]!;
		const next = points[(index + 1) % points.length]!;
		const cross = current[0] * next[1] - next[0] * current[1];
		twiceArea += cross;
		x += (current[0] + next[0]) * cross;
		z += (current[1] + next[1]) * cross;
	}
	if (Math.abs(twiceArea) <= 1e-9) {
		return [
			points.reduce((sum, point) => sum + point[0], 0) / points.length,
			points.reduce((sum, point) => sum + point[1], 0) / points.length
		];
	}
	return [x / (3 * twiceArea), z / (3 * twiceArea)];
}

function resolveRoom(
	layout: LayoutDocument,
	geometry: CompiledLayoutGeometry,
	selection: Extract<LayoutSelection, { kind: 'room' }>
): LayoutGizmoTargetDescriptor | null {
	const found = findRoom(layout, selection.roomId);
	const compiled = findCompiledRoom(geometry, selection.roomId);
	if (!found || !compiled) return null;
	const centroid = polygonCentroid(compiled.floorPolygon);
	const position: Vec3 = [centroid[0], compiled.floorElevation, centroid[1]];
	return {
		key: compiled.id,
		selection,
		proxyPose: identityPose(position),
		policy: ROOM_POLICY,
		baseline: { kind: 'room', position: [...position] as Vec3, yaw: 0 }
	};
}

function resolveWall(
	layout: LayoutDocument,
	geometry: CompiledLayoutGeometry,
	selection: Extract<LayoutSelection, { kind: 'wall' }>
): LayoutGizmoTargetDescriptor | null {
	const found = findRoom(layout, selection.roomId);
	const compiled = findCompiledRoom(geometry, selection.roomId);
	const compiledWall = compiled ? findCompiledWall(compiled, selection.segmentId) : null;
	if (!found || !compiled || !compiledWall) return null;
	// Compiled half-arc-length center, vertically centered floor↔ceiling.
	const center = pointAlongSamples(compiledWall.samples, compiledWall.length / 2);
	const midY = (compiled.floorElevation + compiled.ceilingElevation) / 2;
	const position: Vec3 = [center[0], midY, center[1]];
	return {
		key: compiledWall.id,
		selection,
		proxyPose: identityPose(position),
		policy: WALL_POLICY,
		baseline: { kind: 'wall', position: [...position] as Vec3 }
	};
}

function resolveOpening(
	layout: LayoutDocument,
	geometry: CompiledLayoutGeometry,
	selection: Extract<LayoutSelection, { kind: 'opening' }>
): LayoutGizmoTargetDescriptor | null {
	const found = findRoom(layout, selection.roomId);
	const opening = found?.room.openings.find(
		(candidate) => candidate.id === selection.openingId && candidate.segmentId === selection.segmentId
	);
	const compiled = findCompiledRoom(geometry, selection.roomId);
	const compiledOpening = compiled?.openings.find((candidate) => candidate.openingId === selection.openingId);
	if (!found || !opening || !compiled || !compiledOpening) return null;
	// Compiled opening bottom-center: `center.point` at floor + sill, local X
	// along the compiled tangent (never derived from mesh triangles).
	const { point } = compiledOpening.center;
	const yaw = normalizeZero(compiledOpening.center.yaw);
	const position: Vec3 = [point[0], compiled.floorElevation + opening.sillHeight, point[1]];
	return {
		key: compiledOpening.id,
		selection,
		proxyPose: { position, rotation: [0, yaw, 0], scale: [1, 1, 1] },
		policy: OPENING_POLICY,
		baseline: {
			kind: 'opening',
			position: [...position] as Vec3,
			yaw,
			width: opening.width,
			height: opening.height,
			sillHeight: opening.sillHeight
		}
	};
}

function resolveInteriorAnchor(
	layout: LayoutDocument,
	geometry: CompiledLayoutGeometry,
	selection: Extract<LayoutSelection, { kind: 'interiorAnchor' }>
): LayoutGizmoTargetDescriptor | null {
	const found = findRoom(layout, selection.roomId);
	const segment = found?.room.boundary.segments.find((candidate) => candidate.id === selection.segmentId);
	const anchor =
		segment?.kind === 'auto-bezier'
			? segment.interiorAnchors.find((candidate) => candidate.id === selection.anchorId)
			: undefined;
	const compiled = findCompiledRoom(geometry, selection.roomId);
	if (!found || !segment || !anchor || !compiled) return null;
	const position: Vec3 = [anchor.point[0], compiled.floorElevation, anchor.point[1]];
	const key = geometryId([
		'layout-interior-anchor',
		found.floorId,
		selection.roomId,
		selection.segmentId,
		selection.anchorId
	]);
	return {
		key,
		selection,
		proxyPose: identityPose(position),
		policy: INTERIOR_ANCHOR_POLICY,
		baseline: { kind: 'interiorAnchor', point: [...anchor.point] as LayoutVec2 }
	};
}

function resolveObject(
	layout: LayoutDocument,
	geometry: CompiledLayoutGeometry,
	selection: Extract<LayoutSelection, { kind: 'object' }>
): LayoutGizmoTargetDescriptor | null {
	const object = layout.objects.find((candidate) => candidate.id === selection.objectId);
	const compiled = geometry.objects.find((candidate) => candidate.objectId === selection.objectId);
	if (!object || !compiled) return null;
	// Read-only profile objects never resolve a draggable target.
	if (object.kind === 'profile' || compiled.readonly) return null;
	const position = [...object.position] as Vec3;
	const rotation = [...object.rotation] as Vec3;
	return {
		key: compiled.id,
		selection,
		// Stored transforms, unit proxy scale — dimensions come from the
		// baseline scaled independently by the proxy scale.
		proxyPose: { position, rotation, scale: [1, 1, 1] },
		policy: OBJECT_POLICY,
		baseline: {
			kind: 'object',
			position: [...position] as Vec3,
			rotation: [...rotation] as Vec3,
			dimensions: [...object.dimensions] as Vec3
		}
	};
}

/**
 * Resolve one layout selection into a target descriptor (or `null` for
 * `none`, a stale identity with no authored/compiled counterpart, or a
 * read-only profile object). Pure; never attaches a proxy or mutates state.
 */
export function resolveLayoutGizmoTarget(
	layout: LayoutDocument,
	geometry: CompiledLayoutGeometry,
	selection: LayoutSelection
): LayoutGizmoTargetDescriptor | null {
	switch (selection.kind) {
		case 'none':
			return null;
		case 'room':
			return resolveRoom(layout, geometry, selection);
		case 'wall':
			return resolveWall(layout, geometry, selection);
		case 'opening':
			return resolveOpening(layout, geometry, selection);
		case 'interiorAnchor':
			return resolveInteriorAnchor(layout, geometry, selection);
		case 'object':
			return resolveObject(layout, geometry, selection);
	}
}

// ---------------------------------------------------------------------------
// Delta derivation
// ---------------------------------------------------------------------------

const ANGLE_EPSILON = 1e-9;

/** Wrap an angle delta into [-π, π] (rotation around the same axis is invariant). */
function wrapAngle(angle: number): number {
	const wrapped = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
	return Math.abs(wrapped) <= ANGLE_EPSILON ? 0 : wrapped;
}

function isFinitePose(pose: LayoutGizmoProxyPose): boolean {
	return [...pose.position, ...pose.rotation, ...pose.scale].every(Number.isFinite);
}

/**
 * Derive the raw, finite, baseline-relative delta for a current proxy pose.
 * Every value is compared to the captured descriptor baseline — never to a
 * previous delta, so repeated calls never compound. `null` when the pose is
 * non-finite (defensive: S7 derives raw *finite* deltas only).
 */
export function deriveLayoutGizmoDelta(
	descriptor: LayoutGizmoTargetDescriptor,
	proxyPose: LayoutGizmoProxyPose
): LayoutGizmoDelta | null {
	if (!isFinitePose(proxyPose)) return null;
	const baseline = descriptor.baseline;
	switch (baseline.kind) {
		case 'room':
			return {
				kind: 'room',
				translation: [
					proxyPose.position[0] - baseline.position[0],
					proxyPose.position[2] - baseline.position[2]
				],
				// Positive-Y yaw for `transformLayoutRoomUnit`.
				yaw: wrapAngle(proxyPose.rotation[1] - baseline.yaw)
			};
		case 'wall':
			return {
				kind: 'wall',
				translation: [
					proxyPose.position[0] - baseline.position[0],
					proxyPose.position[2] - baseline.position[2]
				]
			};
		case 'opening': {
			// Local X axis in world space for a rotation-Y = baseline.yaw proxy:
			// [cos(yaw), 0, -sin(yaw)] — exactly the compiled tangent direction.
			const localX = [Math.cos(baseline.yaw), 0, -Math.sin(baseline.yaw)] as const;
			const dx = proxyPose.position[0] - baseline.position[0];
			const dz = proxyPose.position[2] - baseline.position[2];
			return {
				kind: 'opening',
				centerShiftX: dx * localX[0] + dz * localX[2],
				// X scale changes width about center; Y scale changes height
				// with the sill fixed (S8 keeps the bottom at floor + sill).
				width: baseline.width * proxyPose.scale[0],
				height: baseline.height * proxyPose.scale[1]
			};
		}
		case 'interiorAnchor':
			return {
				kind: 'interiorAnchor',
				translation: [
					proxyPose.position[0] - baseline.point[0],
					proxyPose.position[2] - baseline.point[1]
				]
			};
		case 'object':
			return {
				kind: 'object',
				position: [
					proxyPose.position[0] - baseline.position[0],
					proxyPose.position[1] - baseline.position[1],
					proxyPose.position[2] - baseline.position[2]
				],
				rotation: [
					wrapAngle(proxyPose.rotation[0] - baseline.rotation[0]),
					wrapAngle(proxyPose.rotation[1] - baseline.rotation[1]),
					wrapAngle(proxyPose.rotation[2] - baseline.rotation[2])
				],
				// Baseline dimensions multiplied independently by proxy scale.
				dimensions: [
					baseline.dimensions[0] * proxyPose.scale[0],
					baseline.dimensions[1] * proxyPose.scale[1],
					baseline.dimensions[2] * proxyPose.scale[2]
				]
			};
	}
}
