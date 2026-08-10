/**
 * `placement-ghost` — pure helpers + types for the placement ghost preview
 * (Phase 1b).
 *
 * The `placement-ghost.svelte` component consumes these to draw a wireframe
 * OBB that follows the cursor once an item is armed. The component handles per-frame
 * cursor projection + Three binding; this module owns:
 *   - `PlacementGhostPrototype` — what gets armed (kind, dimensions, scaleVector, ...).
 *   - `PlacementPhase` — armature state machine (idle/armed/committed/cancelled).
 *   - Validity reasons + color mapping per spec §2 table.
 *   - Vector math + color lookup helpers.
 *
 * Three.js `Box3`/`Matrix4` flow through the helpers; tests exercise them
 * with real Three objects (mirrors `obb-util.test.ts`).
 */

import { Box3, Euler, Matrix4, Vector3 } from 'three';
import type { Vec3 } from '$lib/types/museum';
import type { ScenePrimitiveDimensions, ScenePrimitiveKind } from '$lib/content/scene';

/** What the user is about to place. Consumed by `placement-ghost.svelte` + the
 * placement mutator's `armPlacement(prototype)` factory. */
export type PlacementGhostPrototype = {
	/** Discriminator for what the live mesh the asset/shape will become. */
	primitiveKind: 'box' | 'plane' | 'cylinder' | 'sphere' | 'model';
	/** Parametric dimensions for primitives. Ignored when kind === 'model'. */
	dimensions: ScenePrimitiveDimensions | null;
	/** Bounds of the imported asset (1×1×1 normalization post-defaultScale). */
	assetBounds: Vec3 | null;
	/** Yaw/pitch/roll rotation the ghost adopts on first arm and on every commit. */
	defaultRotation: Vec3;
	/** Uniform-mode scalar; carried as-is when scaleMode === 'uniform'. */
	defaultScaleScalar: number;
	/** Independent-mode vector (null when scaleMode === 'uniform'). */
	defaultScaleVector: Vec3 | null;
	/** 'uniform' renders a single Scale field; 'independent' renders X/Y/Z. */
	scaleMode: 'uniform' | 'independent';
	/** Ground / ceiling / wall offset along the ghost's local Y axis. */
	defaultYOffset: number;
};

/** Component-side state machine. */
export const PLACEMENT_PHASES = ['idle', 'armed', 'committed', 'cancelled'] as const;
export type PlacementPhase = (typeof PLACEMENT_PHASES)[number];

/** Why the current ghost position is invalid (=> colour + opacity). */
export type PlacementValidityReason =
	| 'ok'
	| 'no-floor'
	| 'off-grid'
	| 'off-room-bounds'
	| 'collision';

export type PlacementValidity = {
	isValid: boolean;
	reason: PlacementValidityReason;
	ghostPosition: Vec3 | null;
	ghostRotation: Vec3;
};

/**
 * Compute the placement-local Box3 for a prototype. Always axis-aligned in
 * prototype local space; rotation + scale are applied per-frame on the ghost
 * matrix.
 *
 * Asset kind falls back to `assetBounds` (1×1×1 placeholder if null). Primitive
 * kinds use `defaultPrimitiveDimensions(kind)`.
 */
export function computePrototypeBox3(
	prototype: PlacementGhostPrototype,
	defaults: Map<'box' | 'plane' | 'cylinder' | 'sphere', ScenePrimitiveDimensions>
): Box3 {
	const halfExtent = (size: number) => Math.max(0.01, size / 2);
	switch (prototype.primitiveKind) {
		case 'box': {
			const dims = (prototype.dimensions ?? defaults.get('box')) as
				| { width: number; height: number; depth: number }
				| undefined;
			if (!dims) return new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
			return new Box3(
				new Vector3(-halfExtent(dims.width), -halfExtent(dims.height), -halfExtent(dims.depth)),
				new Vector3(halfExtent(dims.width), halfExtent(dims.height), halfExtent(dims.depth))
			);
		}
		case 'plane': {
			const dims = (prototype.dimensions ?? defaults.get('plane')) as
				| { width: number; height: number }
				| undefined;
			if (!dims) return new Box3(new Vector3(-1, 0, -1), new Vector3(1, 0, 1));
			// Plane sits on the ground — width/depth in X/Z, height is 0.
			return new Box3(
				new Vector3(-halfExtent(dims.width), 0, -halfExtent(dims.height)),
				new Vector3(halfExtent(dims.width), 0, halfExtent(dims.height))
			);
		}
		case 'cylinder': {
			const dims = (prototype.dimensions ?? defaults.get('cylinder')) as
				| { radius: number; height: number }
				| undefined;
			if (!dims) return new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
			return new Box3(
				new Vector3(-dims.radius, -halfExtent(dims.height), -dims.radius),
				new Vector3(dims.radius, halfExtent(dims.height), dims.radius)
			);
		}
		case 'sphere': {
			const dims = (prototype.dimensions ?? defaults.get('sphere')) as
				| { radius: number }
				| undefined;
			const radius = dims?.radius ?? 0.5;
			return new Box3(
				new Vector3(-radius, -radius, -radius),
				new Vector3(radius, radius, radius)
			);
		}
		case 'model': {
			const bounds = prototype.assetBounds ?? [1, 1, 1];
			return new Box3(
				new Vector3(-halfExtent(bounds[0]), -halfExtent(bounds[1]), -halfExtent(bounds[2])),
				new Vector3(halfExtent(bounds[0]), halfExtent(bounds[1]), halfExtent(bounds[2]))
			);
		}
	}
}

/** Compose the ghost's world matrix — position from cursor hit, rotation from
 * prototype, scale (uniform `setScalar` or independent `set(x,y,z)`). */
export function computeGhostTransform(
	hit: { point: Vec3; roomId: string | null } | null,
	prototype: PlacementGhostPrototype
): Matrix4 {
	const matrix = new Matrix4();
	if (!hit) return matrix;

	const [px, py, pz] = hit.point;
	const [rx, ry, rz] = prototype.defaultRotation;
	const euler = new Euler(rx, ry, rz, 'XYZ');
	matrix.makeRotationFromEuler(euler);
	matrix.setPosition(px, py + prototype.defaultYOffset, pz);

	// Compose scale as a basis product (writes on top of the rotation matrix so
	// the OBB corners-line-up remains tight after streaming).
	const sx = prototype.defaultScaleVector
		? prototype.defaultScaleVector[0]
		: prototype.defaultScaleScalar;
	const sy = prototype.defaultScaleVector
		? prototype.defaultScaleVector[1]
		: prototype.defaultScaleScalar;
	const sz = prototype.defaultScaleVector
		? prototype.defaultScaleVector[2]
		: prototype.defaultScaleScalar;
	const scale = new Matrix4().makeScale(sx, sy, sz);
	matrix.multiply(scale);

	return matrix;
}

/** Decide whether a floor hit is a valid placement landing. */
export function isValidGhostPlacement(
	hit: { point: Vec3; roomId: string | null } | null,
	workingRoomId: string | null
): PlacementValidity {
	const ghostRotation: Vec3 = [0, 0, 0];
	if (!hit) {
		return { isValid: false, reason: 'no-floor', ghostPosition: null, ghostRotation };
	}
	if (!hit.roomId) {
		return {
			isValid: false,
			reason: 'no-floor',
			ghostPosition: [hit.point[0], hit.point[1], hit.point[2]],
			ghostRotation
		};
	}
	if (workingRoomId && hit.roomId !== workingRoomId) {
		return {
			isValid: false,
			reason: 'off-room-bounds',
			ghostPosition: [hit.point[0], hit.point[1], hit.point[2]],
			ghostRotation
		};
	}
	return {
		isValid: true,
		reason: 'ok',
		ghostPosition: [hit.point[0], hit.point[1], hit.point[2]],
		ghostRotation
	};
}

/** Hex colour per validity reason. The component multiplies by 0.55 opacity. */
export function getGhostColorForReason(reason: PlacementValidityReason): number {
	switch (reason) {
		case 'ok':
			return 0x88ddff; // light cyan / green
		case 'no-floor':
			return 0xff6b6b; // coral
		case 'off-grid':
		case 'off-room-bounds':
			return 0xffaa44; // amber
		case 'collision':
			return 0xaa88ff; // lavender
	}
}

/** `primitiveKind` accepted by both the helper + the existing mutator. */
export type SupportedPrimitiveKind = Extract<ScenePrimitiveKind, 'box' | 'plane' | 'cylinder' | 'sphere'>;
