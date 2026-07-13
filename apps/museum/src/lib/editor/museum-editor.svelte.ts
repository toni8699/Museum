import {
	createNavigationGraph,
	museumSceneDocument,
	resolveSceneDocument,
	type MuseumSceneDocument,
	type RuntimeMuseumScene
} from '$lib/content/scene';
import { createMuseumState, type MuseumStateStore } from '$lib/state/museum-state.svelte';
import { untrack } from 'svelte';
import type { Object3D } from 'three';
import { nextPlacementCycleId } from './editor-selection';

/** Deep-clone a scene document so the session never mutates the checked-in JSON singleton. */
export function cloneMuseumSceneDocument(
	document: MuseumSceneDocument
): MuseumSceneDocument {
	return JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
}

/**
 * Editor session store. Owns a mutable document clone, selection, and an
 * ephemeral placement-root registry (Three.js refs — never snapshotted).
 *
 * Scene/state are resolved once at construction so `state.graph` shares array
 * identity with `scene` (required by `assertNavigationGraphMatchesScene`).
 * Later mutation phases must rebuild graph + state when node IDs or topology
 * change — do not put `createMuseumState` inside `$derived`.
 */
/** Visitor MuseumScene defaults — used by the editor “Visitor” lighting preset. */
export const EDITOR_VISITOR_LIGHTING = {
	ambientIntensity: 0.2,
	directionalIntensity: 0.7,
	fogEnabled: true,
	fogNear: 22,
	fogFar: 54
} as const;

/** Brighter overview defaults for editing (fog off so distant rooms stay readable). */
export const EDITOR_BRIGHT_LIGHTING = {
	ambientIntensity: 0.65,
	directionalIntensity: 1.15,
	fogEnabled: false,
	fogNear: 22,
	fogFar: 54
} as const;

export type EditorLightingSettings = {
	ambientIntensity: number;
	directionalIntensity: number;
	fogEnabled: boolean;
	fogNear: number;
	fogFar: number;
};

export class MuseumEditorStore {
	document = $state(cloneMuseumSceneDocument(museumSceneDocument));
	scene: RuntimeMuseumScene;
	state: MuseumStateStore;

	/** Document-backed selection; may be set before the Object3D root registers. */
	selectedPlacementId = $state<string | null>(null);

	/**
	 * Ephemeral Three.js roots. Not `$state`, not serialized, not part of
	 * future undo snapshots. Bump `registryVersion` on every mutate.
	 */
	#placementRoots = new Map<string, Object3D>();
	registryVersion = $state(0);

	/** Session-only; never written to museum-scene.json. */
	ambientIntensity = $state<number>(EDITOR_BRIGHT_LIGHTING.ambientIntensity);
	directionalIntensity = $state<number>(EDITOR_BRIGHT_LIGHTING.directionalIntensity);
	fogEnabled = $state<boolean>(EDITOR_BRIGHT_LIGHTING.fogEnabled);
	fogNear = $state<number>(EDITOR_BRIGHT_LIGHTING.fogNear);
	fogFar = $state<number>(EDITOR_BRIGHT_LIGHTING.fogFar);

	constructor() {
		this.scene = resolveSceneDocument(this.document);
		this.state = createMuseumState(createNavigationGraph(this.scene), 'paris-seat');
	}

	get objectCount() {
		return this.document.objects.length;
	}

	get nodeCount() {
		return this.document.navigationNodes.length;
	}

	get selectedObject() {
		const id = this.selectedPlacementId;
		if (!id) return undefined;
		return this.document.objects.find((object) => object.id === id);
	}

	applyLightingPreset(preset: EditorLightingSettings) {
		this.ambientIntensity = preset.ambientIntensity;
		this.directionalIntensity = preset.directionalIntensity;
		this.fogEnabled = preset.fogEnabled;
		this.fogNear = preset.fogNear;
		this.fogFar = preset.fogFar;
	}

	/** Validates against the session document, not the Object3D registry. */
	selectPlacement(id: string) {
		const exists = this.document.objects.some((object) => object.id === id);
		if (!exists) return;
		this.selectedPlacementId = id;
	}

	deselect() {
		this.selectedPlacementId = null;
	}

	/**
	 * Alt-cycle among ordered unique placement ids.
	 * Empty list → no change; absent current → first; else next with wrap.
	 */
	cyclePlacement(ids: string[]) {
		const next = nextPlacementCycleId(this.selectedPlacementId, ids);
		if (next === undefined) return;
		this.selectPlacement(next);
	}

	#bumpRegistryVersion() {
		// `+=` reads and writes; callers run from `$effect` (EditorPlacementRoot).
		// Untrack so the register effect does not subscribe to registryVersion and loop.
		untrack(() => {
			this.registryVersion += 1;
		});
	}

	registerPlacementRoot(id: string, root: Object3D) {
		if (this.#placementRoots.get(id) === root) return;
		this.#placementRoots.set(id, root);
		this.#bumpRegistryVersion();
	}

	unregisterPlacementRoot(id: string, root: Object3D) {
		if (this.#placementRoots.get(id) !== root) return;
		this.#placementRoots.delete(id);
		this.#bumpRegistryVersion();
	}

	/** Notify consumers that a registered root's contents/bounds may have changed. */
	notifyPlacementRootChanged(id: string) {
		if (!this.#placementRoots.has(id)) return;
		this.#bumpRegistryVersion();
	}

	getPlacementRoot(id: string): Object3D | undefined {
		void this.registryVersion;
		return this.#placementRoots.get(id);
	}
}

export function createMuseumEditorStore() {
	return new MuseumEditorStore();
}

export type { MuseumSceneDocument, RuntimeMuseumScene };
