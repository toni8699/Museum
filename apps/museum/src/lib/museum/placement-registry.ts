import type { Object3D } from 'three';

/** Ephemeral editor placement roots — never part of scene JSON / snapshots. */
export type EditorPlacementRegistry = {
	registerPlacementRoot: (id: string, root: Object3D) => void;
	unregisterPlacementRoot: (id: string, root: Object3D) => void;
	notifyPlacementRootChanged?: (id: string) => void;
};
