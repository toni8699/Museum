import {
	createNavigationGraph,
	museumSceneDocument,
	resolveSceneDocument,
	type MuseumSceneDocument,
	type RuntimeMuseumScene
} from '$lib/content/scene';
import { createMuseumState, type MuseumStateStore } from '$lib/state/museum-state.svelte';

/** Deep-clone a scene document so the session never mutates the checked-in JSON singleton. */
export function cloneMuseumSceneDocument(
	document: MuseumSceneDocument
): MuseumSceneDocument {
	return JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
}

/**
 * Editor session store. Phase 1 owns a mutable document clone and a dedicated
 * visitor-state pair for MuseumScene wiring.
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

	get lighting(): EditorLightingSettings {
		return {
			ambientIntensity: this.ambientIntensity,
			directionalIntensity: this.directionalIntensity,
			fogEnabled: this.fogEnabled,
			fogNear: this.fogNear,
			fogFar: this.fogFar
		};
	}

	applyLightingPreset(preset: EditorLightingSettings) {
		this.ambientIntensity = preset.ambientIntensity;
		this.directionalIntensity = preset.directionalIntensity;
		this.fogEnabled = preset.fogEnabled;
		this.fogNear = preset.fogNear;
		this.fogFar = preset.fogFar;
	}
}

export function createMuseumEditorStore() {
	return new MuseumEditorStore();
}

export type { MuseumSceneDocument, RuntimeMuseumScene };
