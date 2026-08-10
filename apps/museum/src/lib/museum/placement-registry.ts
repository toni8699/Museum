import type { Object3D } from 'three';
import type { Vec3 } from '$lib/types/museum';

/** Ephemeral editor placement roots — never part of scene JSON / snapshots. */
export type EditorPlacementRegistry = {
	registerPlacementRoot: (id: string, root: Object3D) => void;
	unregisterPlacementRoot: (id: string, root: Object3D) => void;
	notifyPlacementRootChanged?: (id: string) => void;
	/**
	 * Phase 1a — prefer session per-axis scale over document scalar so
	 * `EditorPlacementRoot` does not snap independent gizmo writes to uniform.
	 * Bump `scaleVersion` whenever the lookup result can change.
	 */
	getPlacementScale?: (id: string) => number | Vec3;
	/** Reactive version counter for session scale-vector memory. */
	scaleVersion?: number;
};
