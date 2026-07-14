import {
	createNavigationGraph,
	museumSceneDocument,
	resolveSceneDocument,
	type MuseumSceneDocument,
	type RuntimeMuseumScene
} from '$lib/content/scene';
import { createMuseumState, type MuseumStateStore } from '$lib/state/museum-state.svelte';
import type { MuseumRoomId } from '$lib/types/museum';
import { untrack } from 'svelte';
import type { Object3D } from 'three';
import { nextPlacementCycleId } from './editor-selection';
import {
	placementTransformFromDocument,
	type EditorTransformMode,
	type PlacementTransform,
	writePlacementTransform
} from './editor-transform';

const HISTORY_LIMIT = 100;

/** Deep-clone a scene document so the session never mutates the checked-in JSON singleton. */
export function cloneMuseumSceneDocument(
	document: MuseumSceneDocument
): MuseumSceneDocument {
	return JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
}

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

function documentsMatch(a: MuseumSceneDocument, b: MuseumSceneDocument) {
	return JSON.stringify(a) === JSON.stringify(b);
}

export class MuseumEditorStore {
	document = $state(cloneMuseumSceneDocument(museumSceneDocument));
	scene = $state.raw<RuntimeMuseumScene>(resolveSceneDocument(this.document));
	state = $state.raw<MuseumStateStore>(
		createMuseumState(createNavigationGraph(this.scene), 'paris-seat')
	);

	selectedRoomId = $state<MuseumRoomId | null>(null);
	selectedPlacementId = $state<string | null>(null);
	transformMode = $state<EditorTransformMode>('rotate');
	cameraFocusVersion = $state(0);
	cameraPanEnabled = $state(true);

	#placementRoots = new Map<string, Object3D>();
	registryVersion = $state(0);

	#past: MuseumSceneDocument[] = [];
	#future: MuseumSceneDocument[] = [];
	#transactionBefore: MuseumSceneDocument | null = null;
	historyVersion = $state(0);

	/** Session-only; never written to museum-scene.json. */
	ambientIntensity = $state<number>(EDITOR_BRIGHT_LIGHTING.ambientIntensity);
	directionalIntensity = $state<number>(EDITOR_BRIGHT_LIGHTING.directionalIntensity);
	fogEnabled = $state<boolean>(EDITOR_BRIGHT_LIGHTING.fogEnabled);
	fogNear = $state<number>(EDITOR_BRIGHT_LIGHTING.fogNear);
	fogFar = $state<number>(EDITOR_BRIGHT_LIGHTING.fogFar);

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

	get selectedTransform() {
		return this.selectedObject
			? placementTransformFromDocument(this.selectedObject)
			: undefined;
	}

	get canUndo() {
		void this.historyVersion;
		return this.#past.length > 0;
	}

	get canRedo() {
		void this.historyVersion;
		return this.#future.length > 0;
	}

	get isDocumentTransactionActive() {
		return this.#transactionBefore !== null;
	}

	applyLightingPreset(preset: EditorLightingSettings) {
		this.ambientIntensity = preset.ambientIntensity;
		this.directionalIntensity = preset.directionalIntensity;
		this.fogEnabled = preset.fogEnabled;
		this.fogNear = preset.fogNear;
		this.fogFar = preset.fogFar;
	}

	selectRoom(id: MuseumRoomId) {
		if (id !== 'paris') return;
		const changed = this.selectedRoomId !== id;
		this.selectedRoomId = id;
		if (changed) this.deselect();
		this.cameraFocusVersion += 1;
	}

	toggleCameraPan() {
		this.cameraPanEnabled = !this.cameraPanEnabled;
	}

	isPlacementSelectable(id: string) {
		if (!this.selectedRoomId) return false;
		return this.document.objects.some(
			(object) => object.id === id && object.roomId === this.selectedRoomId
		);
	}

	selectPlacement(id: string) {
		if (!this.isPlacementSelectable(id)) return;
		if (this.selectedPlacementId !== id) this.transformMode = 'rotate';
		this.selectedPlacementId = id;
	}

	deselect() {
		this.selectedPlacementId = null;
	}

	cyclePlacement(ids: string[]) {
		const selectableIds = ids.filter((id) => this.isPlacementSelectable(id));
		const next = nextPlacementCycleId(this.selectedPlacementId, selectableIds);
		if (next === undefined) return;
		this.selectPlacement(next);
	}

	beginDocumentTransaction() {
		if (this.#transactionBefore) return false;
		this.#transactionBefore = cloneMuseumSceneDocument(this.document);
		return true;
	}

	updatePlacementTransform(id: string, transform: PlacementTransform) {
		const placement = this.document.objects.find((object) => object.id === id);
		if (!placement || !this.isPlacementSelectable(id)) return false;
		return writePlacementTransform(placement, transform);
	}

	commitPlacementTransform(id: string, transform: PlacementTransform) {
		if (!this.beginDocumentTransaction()) return false;
		if (!this.updatePlacementTransform(id, transform)) {
			this.cancelDocumentTransaction();
			return false;
		}
		return this.commitDocumentTransaction();
	}

	commitDocumentTransaction() {
		const before = this.#transactionBefore;
		if (!before) return false;
		this.#transactionBefore = null;

		if (documentsMatch(before, this.document)) return false;
		this.#past.push(before);
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#future = [];
		this.#rebuildRuntime();
		this.#bumpHistoryVersion();
		return true;
	}

	cancelDocumentTransaction() {
		const before = this.#transactionBefore;
		if (!before) return false;
		this.#transactionBefore = null;
		this.#replaceDocument(before);
		return true;
	}

	undo() {
		if (this.#transactionBefore || this.#past.length === 0) return false;
		const previous = this.#past.pop();
		if (!previous) return false;
		this.#future.push(cloneMuseumSceneDocument(this.document));
		if (this.#future.length > HISTORY_LIMIT) this.#future.shift();
		this.#replaceDocument(previous);
		this.#bumpHistoryVersion();
		return true;
	}

	redo() {
		if (this.#transactionBefore || this.#future.length === 0) return false;
		const next = this.#future.pop();
		if (!next) return false;
		this.#past.push(cloneMuseumSceneDocument(this.document));
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#replaceDocument(next);
		this.#bumpHistoryVersion();
		return true;
	}

	#replaceDocument(document: MuseumSceneDocument) {
		this.document = cloneMuseumSceneDocument(document);
		this.#rebuildRuntime();
		if (
			this.selectedPlacementId &&
			!this.isPlacementSelectable(this.selectedPlacementId)
		) {
			this.deselect();
		}
	}

	#rebuildRuntime() {
		const nextScene = resolveSceneDocument(this.document);
		const nextState = createMuseumState(createNavigationGraph(nextScene), 'paris-seat');
		this.scene = nextScene;
		this.state = nextState;
	}

	#bumpHistoryVersion() {
		untrack(() => {
			this.historyVersion += 1;
		});
	}

	#bumpRegistryVersion() {
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
