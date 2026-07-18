import {
	createNavigationGraph,
	museumSceneDocument,
	resolveSceneDocument,
	type MuseumSceneDocument,
	type RuntimeMuseumScene,
	type SceneObjectCluster
} from '$lib/content/scene';
import { createMuseumState, type MuseumStateStore } from '$lib/state/museum-state.svelte';
import type { MuseumRoomId } from '$lib/types/museum';
import { untrack } from 'svelte';
import type { Object3D } from 'three';
import { nextPlacementCycleId } from './editor-selection';
import {
	DEFAULT_ROTATION_SNAP_DEGREES,
	DEFAULT_TRANSLATION_SNAP
} from './editor-placement';
import {
	placementTransformFromDocument,
	type EditorTransformMode,
	type PlacementTransform,
	writePlacementTransform
} from './editor-transform';

const HISTORY_LIMIT = 100;
const STATUS_MESSAGE_MS = 2500;

/** Deep-clone a scene document so the session never mutates the checked-in JSON singleton. */
export function cloneMuseumSceneDocument(
	document: MuseumSceneDocument
): MuseumSceneDocument {
	const clone = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
	clone.clusters ??= [];
	return clone;
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
	selectedPlacementIds = $state<string[]>([]);
	selectedClusterId = $state<string | null>(null);
	transformMode = $state<EditorTransformMode>('rotate');
	cameraFocusVersion = $state(0);
	cameraFocusKind = $state<'room' | 'placement' | 'selection' | null>(null);
	cameraFocusPlacementId = $state<string | null>(null);
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

	/** Session-only placement tools; excluded from document snapshots and visitor JSON. */
	translationSnapEnabled = $state(true);
	translationSnap = $state(DEFAULT_TRANSLATION_SNAP);
	rotationSnapEnabled = $state(true);
	rotationSnapDegrees = $state(DEFAULT_ROTATION_SNAP_DEGREES);
	keepOnFloor = $state(false);
	statusMessage = $state<string | null>(null);
	dropToFloorRequestId = $state(0);

	#statusMessageTimer: ReturnType<typeof setTimeout> | null = null;

	get objectCount() {
		return this.document.objects.length;
	}

	get clusters(): SceneObjectCluster[] {
		return this.document.clusters ?? [];
	}

	/** Compatibility getter. The ordered selection array is the only mutable source. */
	get selectedPlacementId() {
		return this.selectedPlacementIds.at(-1) ?? null;
	}

	get primaryPlacementId() {
		return this.selectedPlacementId;
	}

	get selectionKey() {
		return `${this.selectedClusterId ?? ''}:${this.selectedPlacementIds.join('|')}`;
	}

	get nodeCount() {
		return this.document.navigationNodes.length;
	}

	get selectedObject() {
		const id = this.selectedPlacementId;
		if (!id) return undefined;
		return this.document.objects.find((object) => object.id === id);
	}

	get selectedCluster() {
		const id = this.selectedClusterId;
		return id ? this.clusters.find((cluster) => cluster.id === id) : undefined;
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

	setStatusMessage(message: string | null) {
		if (this.#statusMessageTimer) {
			clearTimeout(this.#statusMessageTimer);
			this.#statusMessageTimer = null;
		}
		this.statusMessage = message;
		if (!message) return;
		this.#statusMessageTimer = setTimeout(() => {
			this.statusMessage = null;
			this.#statusMessageTimer = null;
		}, STATUS_MESSAGE_MS);
	}

	requestDropToFloor() {
		if (this.selectedPlacementIds.length === 0) {
			this.setStatusMessage('Select a placement to drop to floor');
			return;
		}
		this.dropToFloorRequestId += 1;
	}

	selectRoom(id: MuseumRoomId) {
		if (id !== 'paris') return;
		const changed = this.selectedRoomId !== id;
		this.selectedRoomId = id;
		if (changed) this.deselect();
	}

	focusRoom(id: MuseumRoomId) {
		if (id !== 'paris') return;
		this.cameraFocusKind = 'room';
		this.cameraFocusPlacementId = null;
		this.cameraFocusVersion += 1;
	}

	focusPlacement(id: string) {
		if (!this.isPlacementSelectable(id)) return;
		this.cameraFocusKind = 'placement';
		this.cameraFocusPlacementId = id;
		this.cameraFocusVersion += 1;
	}

	focusSelection() {
		if (this.selectedPlacementIds.length === 0) return;
		this.cameraFocusKind = 'selection';
		this.cameraFocusPlacementId = null;
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
		this.selectedPlacementIds = [id];
		this.selectedClusterId = null;
	}

	selectPlacements(ids: string[]) {
		const next = [...new Set(ids)].filter((id) => this.isPlacementSelectable(id));
		if (next.length === 0) {
			this.deselect();
			return;
		}
		this.selectedPlacementIds = next;
		this.selectedClusterId = null;
		this.transformMode = 'rotate';
	}

	togglePlacement(id: string) {
		if (!this.isPlacementSelectable(id)) return;
		this.selectedClusterId = null;
		if (this.selectedPlacementIds.includes(id)) {
			this.selectedPlacementIds = this.selectedPlacementIds.filter(
				(memberId) => memberId !== id
			);
		} else {
			this.selectedPlacementIds = [...this.selectedPlacementIds, id];
		}
	}

	selectCluster(id: string) {
		const cluster = this.clusters.find((candidate) => candidate.id === id);
		if (!cluster || cluster.roomId !== this.selectedRoomId) return;
		this.selectedClusterId = cluster.id;
		this.selectedPlacementIds = [...cluster.memberIds];
		this.transformMode = 'rotate';
	}

	deselect() {
		this.selectedPlacementIds = [];
		this.selectedClusterId = null;
	}

	cyclePlacement(ids: string[]) {
		const selectableIds = ids.filter((id) => this.isPlacementSelectable(id));
		const next = nextPlacementCycleId(this.selectedPlacementId, selectableIds);
		if (next === undefined) return;
		this.selectPlacement(next);
	}

	selectAllInRoom() {
		const roomId = this.selectedRoomId;
		if (!roomId) return;
		this.selectPlacements(
			this.document.objects
				.filter((object) => object.roomId === roomId)
				.map((object) => object.id)
		);
	}

	createCluster(name?: string) {
		const memberIds = [...this.selectedPlacementIds];
		if (memberIds.length < 2) {
			this.setStatusMessage('Select at least two placements to create a cluster');
			return null;
		}

		const placements = memberIds.map((id) =>
			this.document.objects.find((object) => object.id === id)
		);
		const roomId = placements[0]?.roomId;
		if (!roomId || placements.some((placement) => placement?.roomId !== roomId)) {
			this.setStatusMessage('Cluster members must be in the same room');
			return null;
		}

		const occupiedIds = new Set(this.clusters.flatMap((cluster) => cluster.memberIds));
		if (memberIds.some((id) => occupiedIds.has(id))) {
			this.setStatusMessage('A placement can belong to only one cluster');
			return null;
		}

		const existingIds = new Set(this.clusters.map((cluster) => cluster.id));
		let suffix = this.clusters.length + 1;
		while (existingIds.has(`cluster-${suffix}`)) suffix += 1;
		const cluster: SceneObjectCluster = {
			id: `cluster-${suffix}`,
			name: name?.trim() || `Cluster ${suffix}`,
			roomId,
			memberIds
		};

		if (!this.beginDocumentTransaction()) return null;
		(this.document.clusters ??= []).push(cluster);
		if (!this.commitDocumentTransaction()) return null;
		this.selectCluster(cluster.id);
		this.setStatusMessage(`Grouped ${memberIds.length} objects`);
		return cluster.id;
	}

	renameCluster(id: string, name: string) {
		const cluster = this.clusters.find((candidate) => candidate.id === id);
		const nextName = name.trim();
		if (!cluster || !nextName || cluster.name === nextName) return false;
		if (!this.beginDocumentTransaction()) return false;
		cluster.name = nextName;
		return this.commitDocumentTransaction();
	}

	addMemberToCluster(clusterId: string, memberId: string) {
		const cluster = this.clusters.find((candidate) => candidate.id === clusterId);
		const placement = this.document.objects.find((object) => object.id === memberId);
		if (!cluster || !placement || placement.roomId !== cluster.roomId) return false;
		if (cluster.memberIds.includes(memberId)) return false;
		if (this.clusters.some((candidate) => candidate.memberIds.includes(memberId))) {
			this.setStatusMessage('A placement can belong to only one cluster');
			return false;
		}
		if (!this.beginDocumentTransaction()) return false;
		cluster.memberIds.push(memberId);
		const committed = this.commitDocumentTransaction();
		if (committed && this.selectedClusterId === clusterId) this.selectCluster(clusterId);
		return committed;
	}

	removeMemberFromCluster(clusterId: string, memberId: string) {
		const clusterIndex = this.clusters.findIndex((candidate) => candidate.id === clusterId);
		const cluster = this.clusters[clusterIndex];
		if (!cluster || !cluster.memberIds.includes(memberId)) return false;
		const wasSelectedCluster = this.selectedClusterId === clusterId;
		if (!this.beginDocumentTransaction()) return false;
		cluster.memberIds = cluster.memberIds.filter((id) => id !== memberId);
		if (cluster.memberIds.length < 2) {
			this.document.clusters?.splice(clusterIndex, 1);
		}
		const committed = this.commitDocumentTransaction();
		if (!committed) return false;
		if (wasSelectedCluster && this.clusters.some((candidate) => candidate.id === clusterId)) {
			this.selectCluster(clusterId);
		} else if (wasSelectedCluster) {
			this.selectedClusterId = null;
			this.selectPlacements(cluster.memberIds);
		}
		return true;
	}

	ungroupCluster(id = this.selectedClusterId) {
		if (!id) return false;
		const index = this.clusters.findIndex((cluster) => cluster.id === id);
		if (index === -1 || !this.beginDocumentTransaction()) return false;
		const memberIds = [...this.clusters[index]!.memberIds];
		const wasSelected = this.selectedClusterId === id;
		this.document.clusters?.splice(index, 1);
		const committed = this.commitDocumentTransaction();
		if (committed && wasSelected) this.selectPlacements(memberIds);
		return committed;
	}

	deletePlacement(id: string) {
		const objectIndex = this.document.objects.findIndex((object) => object.id === id);
		if (objectIndex === -1 || !this.beginDocumentTransaction()) return false;
		this.document.objects.splice(objectIndex, 1);
		for (const cluster of this.clusters) {
			cluster.memberIds = cluster.memberIds.filter((memberId) => memberId !== id);
		}
		this.document.clusters = this.clusters.filter(
			(cluster) => cluster.memberIds.length >= 2
		);
		return this.commitDocumentTransaction();
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
		this.#reconcileSelection();
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
		this.#reconcileSelection();
	}

	#reconcileSelection() {
		if (this.selectedClusterId) {
			const cluster = this.clusters.find(
				(candidate) => candidate.id === this.selectedClusterId
			);
			if (!cluster || cluster.roomId !== this.selectedRoomId) {
				this.deselect();
				return;
			}
			this.selectedPlacementIds = [...cluster.memberIds];
			return;
		}
		this.selectedPlacementIds = this.selectedPlacementIds.filter((id) =>
			this.isPlacementSelectable(id)
		);
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

	getPlacementRoots(ids = this.selectedPlacementIds): Object3D[] {
		void this.registryVersion;
		return ids
			.map((id) => this.#placementRoots.get(id))
			.filter((root): root is Object3D => root != null);
	}
}

export function createMuseumEditorStore() {
	return new MuseumEditorStore();
}

export type { MuseumSceneDocument, RuntimeMuseumScene };
