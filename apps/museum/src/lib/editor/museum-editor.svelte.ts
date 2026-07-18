import {
	createNavigationGraph,
	getNode,
	museumSceneDocument,
	resolveSceneDocument,
	type MuseumSceneDocument,
	type RuntimeMuseumScene,
	type SceneObjectCluster,
	type SceneObjectPlacement
} from '$lib/content/scene';
import { getAssetById, resolveAssetFallback } from '$lib/content/assets';
import { createMuseumState, type MuseumStateStore } from '$lib/state/museum-state.svelte';
import type { MuseumRoomId, Vec3 } from '$lib/types/museum';
import { getCameraRoute } from '$lib/museum/navigation/camera-route';
import { untrack } from 'svelte';
import type { Object3D } from 'three';
import {
	nextPlacementCycleId,
	type EditorCameraHandle,
	type EditorCameraSelection
} from './editor-selection';
import { reserveEntityId } from './editor-assets';
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

export type EditorCameraPreview =
	| null
	| {
			kind: 'node';
			nodeId: string;
			runId: number;
	  }
	| {
			kind: 'transition';
			fromNodeId: string;
			toNodeId: string;
			runId: number;
			startedAtMs: number | null;
			completed: boolean;
	  };

const CAMERA_HELPER_KEY_SEPARATOR = ':';

function cameraHelperKey(nodeId: string, handle: EditorCameraHandle) {
	return `${nodeId}${CAMERA_HELPER_KEY_SEPARATOR}${handle}`;
}

function vec3Matches(a: Vec3, b: Vec3) {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function isFiniteVec3(value: Vec3) {
	return value.every(Number.isFinite);
}

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
	cameraSelection = $state<EditorCameraSelection | null>(null);
	cameraPreview = $state<EditorCameraPreview>(null);
	transformMode = $state<EditorTransformMode>('rotate');
	cameraFocusVersion = $state(0);
	cameraFocusKind = $state<
		'room' | 'placement' | 'selection' | 'navigation-node' | null
	>(null);
	cameraFocusPlacementId = $state<string | null>(null);
	cameraFocusNodeId = $state<string | null>(null);
	cameraPanEnabled = $state(true);
	pendingFramePlacementIds = $state<string[]>([]);
	pendingFrameVersion = $state(0);

	/** Session-only asset placement and pointer/shortcut coordination. */
	pendingPlacementAssetId = $state<string | null>(null);
	transformInteractionActive = $state(false);
	transformInteractionKind = $state<'placement' | 'camera' | null>(null);

	#placementRoots = new Map<string, Object3D>();
	#cameraHelperRoots = new Map<string, Object3D>();
	#cancelCameraTransform: (() => boolean) | null = null;
	#restoreCameraPreview: (() => boolean) | null = null;
	#nextCameraPreviewRunId = 1;
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

	get selectedNavigationNode() {
		const id = this.cameraSelection?.nodeId;
		return id
			? this.document.navigationNodes.find((node) => node.id === id)
			: undefined;
	}

	get selectedRuntimeNavigationNode() {
		const id = this.cameraSelection?.nodeId;
		return id ? this.scene.navigationNodes.find((node) => node.id === id) : undefined;
	}

	get selectedCameraPoint(): Vec3 | undefined {
		const node = this.selectedNavigationNode;
		const handle = this.cameraSelection?.handle;
		if (!node || !handle) return undefined;
		return handle === 'position' ? node.position : node.cameraTarget;
	}

	get isCameraPreviewActive() {
		return this.cameraPreview !== null;
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
		return !this.cameraPreview && !this.transformInteractionActive && this.#past.length > 0;
	}

	get canRedo() {
		void this.historyVersion;
		return !this.cameraPreview && !this.transformInteractionActive && this.#future.length > 0;
	}

	get isDocumentTransactionActive() {
		return this.#transactionBefore !== null;
	}

	applyLightingPreset(preset: EditorLightingSettings) {
		if (this.cameraPreview) return false;
		this.ambientIntensity = preset.ambientIntensity;
		this.directionalIntensity = preset.directionalIntensity;
		this.fogEnabled = preset.fogEnabled;
		this.fogNear = preset.fogNear;
		this.fogFar = preset.fogFar;
		return true;
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

	setCameraTransformCanceler(cancel: (() => boolean) | null) {
		this.#cancelCameraTransform = cancel;
	}

	/** The camera rig installs this so modal guards remain active through restoration. */
	setCameraPreviewRestorer(restore: (() => boolean) | null) {
		this.#restoreCameraPreview = restore;
	}

	selectNavigationNode(id: string) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const node = this.document.navigationNodes.find((candidate) => candidate.id === id);
		if (!node) return false;

		const current = this.cameraSelection;
		if (current?.nodeId === id && current.handle === 'position') return false;

		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.#clearPlacementSelection();
		this.cameraSelection = { nodeId: id, handle: 'position' };

		if (current?.nodeId !== id) this.focusNavigationNode(id);
		return true;
	}

	selectCameraHandle(handle: EditorCameraHandle) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const selection = this.cameraSelection;
		if (!selection || selection.handle === handle) return false;
		this.cameraSelection = { nodeId: selection.nodeId, handle };
		return true;
	}

	focusNavigationNode(id: string) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		if (!this.document.navigationNodes.some((node) => node.id === id)) return false;
		this.cancelPendingFrame();
		this.cameraFocusKind = 'navigation-node';
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = id;
		this.cameraFocusVersion += 1;
		return true;
	}

	consumeCameraFocus(version: number) {
		if (
			this.cameraPreview ||
			version !== this.cameraFocusVersion ||
			!this.cameraFocusKind
		) {
			return false;
		}
		this.cameraFocusKind = null;
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		return true;
	}

	updateNavigationNodePoint(
		nodeId: string,
		handle: EditorCameraHandle,
		point: Vec3
	) {
		if (this.cameraPreview || !this.#transactionBefore || !isFiniteVec3(point)) {
			return false;
		}
		const selection = this.cameraSelection;
		if (selection?.nodeId !== nodeId || selection.handle !== handle) return false;
		const node = this.document.navigationNodes.find((candidate) => candidate.id === nodeId);
		if (!node) return false;
		const current = handle === 'position' ? node.position : node.cameraTarget;
		if (vec3Matches(current, point)) return false;
		if (handle === 'position') node.position = [...point];
		else node.cameraTarget = [...point];
		return true;
	}

	commitNavigationNodePoint(
		nodeId: string,
		handle: EditorCameraHandle,
		point: Vec3
	) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		if (!this.beginDocumentTransaction()) return false;
		if (!this.updateNavigationNodePoint(nodeId, handle, point)) {
			this.cancelDocumentTransaction();
			return false;
		}
		return this.commitDocumentTransaction();
	}

	previewSelectedNode() {
		if (this.cameraPreview) return false;
		const nodeId = this.cameraSelection?.nodeId;
		if (!nodeId || !this.scene.navigationNodes.some((node) => node.id === nodeId)) {
			this.setStatusMessage('Select a camera node to preview');
			return false;
		}
		if (!this.#prepareCameraPreview()) return false;
		this.cameraPreview = {
			kind: 'node',
			nodeId,
			runId: this.#nextCameraPreviewRunId++
		};
		return true;
	}

	previewSelectedTransition() {
		if (this.cameraPreview) return false;
		const nodeId = this.cameraSelection?.nodeId;
		if (!nodeId) {
			this.setStatusMessage('Select a camera node to preview');
			return false;
		}

		let toNodeId: string;
		try {
			const node = getNode(nodeId, this.state.graph);
			if (!node.nextNodeId) throw new Error(`Camera node has no nextNodeId: ${nodeId}`);
			toNodeId = node.nextNodeId;
			getCameraRoute(nodeId, toNodeId, this.state.graph);
		} catch (error) {
			this.setStatusMessage(
				error instanceof Error ? error.message : 'Camera transition is unavailable'
			);
			return false;
		}

		if (!this.#prepareCameraPreview()) return false;
		this.cameraPreview = {
			kind: 'transition',
			fromNodeId: nodeId,
			toNodeId,
			runId: this.#nextCameraPreviewRunId++,
			startedAtMs: null,
			completed: false
		};
		return true;
	}

	markCameraPreviewStarted(runId: number, startedAtMs: number) {
		const preview = this.cameraPreview;
		if (
			!preview ||
			preview.kind !== 'transition' ||
			preview.runId !== runId ||
			preview.startedAtMs !== null ||
			preview.completed ||
			!Number.isFinite(startedAtMs)
		) {
			return false;
		}
		this.cameraPreview = { ...preview, startedAtMs };
		return true;
	}

	completeCameraPreview(runId: number) {
		const preview = this.cameraPreview;
		if (
			!preview ||
			preview.kind !== 'transition' ||
			preview.runId !== runId ||
			preview.startedAtMs === null ||
			preview.completed
		) {
			return false;
		}
		this.cameraPreview = { ...preview, completed: true };
		return true;
	}

	stopCameraPreview() {
		if (!this.cameraPreview) return false;
		if (this.#restoreCameraPreview && !this.#restoreCameraPreview()) return false;
		this.cameraPreview = null;
		return true;
	}

	#prepareCameraPreview() {
		if (this.transformInteractionKind === 'camera') {
			if (!this.#cancelCameraTransform?.()) return false;
		}
		if (this.transformInteractionActive || this.isDocumentTransactionActive) return false;
		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.cameraFocusKind = null;
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		return true;
	}

	requestDropToFloor() {
		if (this.cameraPreview) return;
		if (this.selectedPlacementIds.length === 0) {
			this.setStatusMessage('Select a placement to drop to floor');
			return;
		}
		this.dropToFloorRequestId += 1;
	}

	selectRoom(id: MuseumRoomId) {
		if (this.cameraPreview || this.transformInteractionActive || id !== 'paris') return false;
		const changed = this.selectedRoomId !== id;
		this.selectedRoomId = id;
		if (changed) this.#clearPlacementSelection();
		return changed;
	}

	focusRoom(id: MuseumRoomId) {
		if (this.cameraPreview || this.transformInteractionActive || id !== 'paris') return false;
		this.cancelPendingFrame();
		this.cameraFocusKind = 'room';
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		this.cameraFocusVersion += 1;
		return true;
	}

	focusPlacement(id: string) {
		if (this.cameraPreview || this.transformInteractionActive || !this.isPlacementSelectable(id)) {
			return false;
		}
		this.cancelPendingFrame();
		this.cameraFocusKind = 'placement';
		this.cameraFocusPlacementId = id;
		this.cameraFocusNodeId = null;
		this.cameraFocusVersion += 1;
		return true;
	}

	focusSelection() {
		if (
			this.cameraPreview ||
			this.transformInteractionActive ||
			this.selectedPlacementIds.length === 0
		) {
			return false;
		}
		this.cancelPendingFrame();
		this.cameraFocusKind = 'selection';
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		this.cameraFocusVersion += 1;
		return true;
	}

	toggleCameraPan() {
		if (this.cameraPreview) return false;
		this.cameraPanEnabled = !this.cameraPanEnabled;
		return true;
	}

	setTransformInteractionActive(
		active: boolean,
		kind: 'placement' | 'camera' | null = active ? this.transformInteractionKind : null
	) {
		this.transformInteractionActive = active;
		this.transformInteractionKind = active ? kind : null;
	}

	requestPlacementFrame(ids: string[]) {
		if (this.cameraPreview) return false;
		const next = [...new Set(ids)].filter((id) =>
			this.document.objects.some((object) => object.id === id)
		);
		if (next.length === 0) return false;
		this.pendingFramePlacementIds = next;
		this.pendingFrameVersion += 1;
		return true;
	}

	consumePendingFrame(ids: string[]) {
		if (this.cameraPreview) return false;
		if (
			ids.length !== this.pendingFramePlacementIds.length ||
			ids.some((id, index) => id !== this.pendingFramePlacementIds[index])
		) {
			return false;
		}
		this.pendingFramePlacementIds = [];
		this.pendingFrameVersion += 1;
		return true;
	}

	cancelPendingFrame() {
		if (this.pendingFramePlacementIds.length === 0) return;
		this.pendingFramePlacementIds = [];
		this.pendingFrameVersion += 1;
	}

	beginAssetPlacement(assetId: string) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const asset = getAssetById(assetId);
		if (!asset) {
			this.cancelAssetPlacement();
			this.setStatusMessage(`Unknown museum asset: ${assetId}`);
			return false;
		}
		if (asset.placementSurface !== 'floor') {
			this.setStatusMessage(`${asset.name} requires ${asset.placementSurface} placement`);
			return false;
		}
		try {
			resolveAssetFallback(asset);
		} catch (error) {
			this.cancelAssetPlacement();
			this.setStatusMessage(error instanceof Error ? error.message : 'Invalid asset fallback');
			return false;
		}

		const parisWasActive = this.selectedRoomId === 'paris';
		this.selectRoom('paris');
		if (!parisWasActive) this.focusRoom('paris');
		this.pendingPlacementAssetId = asset.id;
		this.setStatusMessage(`Click the Paris floor to place ${asset.name}`);
		return true;
	}

	cancelAssetPlacement(message?: string) {
		if (this.cameraPreview) return false;
		const changed = this.pendingPlacementAssetId !== null;
		this.pendingPlacementAssetId = null;
		if (message) this.setStatusMessage(message);
		return changed;
	}

	createPendingPlacementAt(position: Vec3) {
		if (this.cameraPreview || this.transformInteractionActive) return null;
		const assetId = this.pendingPlacementAssetId;
		if (!assetId) return null;
		const asset = getAssetById(assetId);
		if (!asset || asset.placementSurface !== 'floor') {
			this.cancelAssetPlacement('Pending asset is no longer available for floor placement');
			return null;
		}

		let fallback;
		try {
			fallback = resolveAssetFallback(asset);
		} catch (error) {
			this.cancelAssetPlacement(
				error instanceof Error ? error.message : 'Pending asset has no valid fallback'
			);
			return null;
		}

		const reservedIds = new Set(this.document.objects.map((object) => object.id));
		const id = reserveEntityId(`${asset.id}-placement`, reservedIds);
		const placement: SceneObjectPlacement = {
			id,
			roomId: 'paris',
			assetId: asset.id,
			fallback,
			position: [...position],
			rotation: [0, 0, 0]
		};

		if (!this.beginDocumentTransaction()) return null;
		this.document.objects.push(placement);
		if (!this.commitDocumentTransaction()) return null;

		this.pendingPlacementAssetId = null;
		this.selectPlacement(id);
		this.requestPlacementFrame([id]);
		this.setStatusMessage(`Placed ${asset.name}`);
		return id;
	}

	isPlacementSelectable(id: string) {
		if (!this.selectedRoomId) return false;
		return this.document.objects.some(
			(object) => object.id === id && object.roomId === this.selectedRoomId
		);
	}

	selectPlacement(id: string) {
		if (this.cameraPreview || this.transformInteractionActive || !this.isPlacementSelectable(id)) {
			return false;
		}
		this.cancelPendingFrame();
		this.cameraSelection = null;
		if (this.selectedPlacementId !== id) this.transformMode = 'rotate';
		this.selectedPlacementIds = [id];
		this.selectedClusterId = null;
		return true;
	}

	selectPlacements(ids: string[]) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const next = [...new Set(ids)].filter((id) => this.isPlacementSelectable(id));
		if (next.length === 0) {
			this.deselect();
			return false;
		}
		this.cancelPendingFrame();
		this.cameraSelection = null;
		this.selectedPlacementIds = next;
		this.selectedClusterId = null;
		this.transformMode = 'rotate';
		return true;
	}

	togglePlacement(id: string) {
		if (this.cameraPreview || this.transformInteractionActive || !this.isPlacementSelectable(id)) {
			return false;
		}
		this.cancelPendingFrame();
		this.cameraSelection = null;
		this.selectedClusterId = null;
		if (this.selectedPlacementIds.includes(id)) {
			this.selectedPlacementIds = this.selectedPlacementIds.filter(
				(memberId) => memberId !== id
			);
		} else {
			this.selectedPlacementIds = [...this.selectedPlacementIds, id];
		}
		return true;
	}

	selectCluster(id: string) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const cluster = this.clusters.find((candidate) => candidate.id === id);
		if (!cluster || cluster.roomId !== this.selectedRoomId) return false;
		this.cancelPendingFrame();
		this.cameraSelection = null;
		this.selectedClusterId = cluster.id;
		this.selectedPlacementIds = [...cluster.memberIds];
		this.transformMode = 'rotate';
		return true;
	}

	deselect() {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const changed =
			this.selectedPlacementIds.length > 0 ||
			this.selectedClusterId !== null ||
			this.cameraSelection !== null;
		this.cancelPendingFrame();
		this.#clearPlacementSelection();
		this.cameraSelection = null;
		return changed;
	}

	#clearPlacementSelection() {
		this.selectedPlacementIds = [];
		this.selectedClusterId = null;
	}

	cyclePlacement(ids: string[]) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const selectableIds = ids.filter((id) => this.isPlacementSelectable(id));
		const next = nextPlacementCycleId(this.selectedPlacementId, selectableIds);
		if (next === undefined) return false;
		return this.selectPlacement(next);
	}

	selectAllInRoom() {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const roomId = this.selectedRoomId;
		if (!roomId) return false;
		return this.selectPlacements(
			this.document.objects
				.filter((object) => object.roomId === roomId)
				.map((object) => object.id)
		);
	}

	createCluster(name?: string) {
		if (this.cameraPreview || this.transformInteractionActive) return null;
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
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const cluster = this.clusters.find((candidate) => candidate.id === id);
		const nextName = name.trim();
		if (!cluster || !nextName || cluster.name === nextName) return false;
		if (!this.beginDocumentTransaction()) return false;
		cluster.name = nextName;
		return this.commitDocumentTransaction();
	}

	addMemberToCluster(clusterId: string, memberId: string) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
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
		if (this.cameraPreview || this.transformInteractionActive) return false;
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
		if (this.cameraPreview || this.transformInteractionActive) return false;
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

	duplicateSelection() {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const selectedIds = [...this.selectedPlacementIds];
		const primaryId = this.primaryPlacementId;
		if (!primaryId || selectedIds.length === 0) {
			this.setStatusMessage('Select one or more placements to duplicate');
			return false;
		}

		const sourceById = new Map(this.document.objects.map((object) => [object.id, object]));
		if (selectedIds.some((id) => !sourceById.has(id))) {
			this.setStatusMessage('Selection contains an unavailable placement');
			return false;
		}

		// The current primary is copied first. Remaining sources retain selection order.
		const sourceOrder = [primaryId, ...selectedIds.filter((id) => id !== primaryId)];
		const reservedPlacementIds = new Set(this.document.objects.map((object) => object.id));
		const copyIdBySourceId = new Map<string, string>();
		const copies: SceneObjectPlacement[] = [];

		for (const sourceId of sourceOrder) {
			const source = sourceById.get(sourceId);
			if (!source) return false;
			const copyId = reserveEntityId(`${source.id}-copy`, reservedPlacementIds);
			copyIdBySourceId.set(source.id, copyId);
			copies.push({
				...source,
				id: copyId,
				position: [source.position[0] + 0.5, source.position[1], source.position[2] + 0.5],
				rotation: [...source.rotation]
			});
		}

		const selectedSet = new Set(selectedIds);
		const reservedClusterIds = new Set(this.clusters.map((cluster) => cluster.id));
		const copiedClusters: SceneObjectCluster[] = [];
		for (const cluster of this.clusters) {
			if (!cluster.memberIds.every((id) => selectedSet.has(id))) continue;
			const memberIds = cluster.memberIds.map((id) => copyIdBySourceId.get(id));
			if (memberIds.some((id) => !id)) continue;
			copiedClusters.push({
				id: reserveEntityId(`${cluster.id}-copy`, reservedClusterIds),
				name: `${cluster.name} Copy`,
				roomId: cluster.roomId,
				memberIds: memberIds as string[]
			});
		}

		if (!this.beginDocumentTransaction()) return false;
		this.document.objects.push(...copies);
		(this.document.clusters ??= []).push(...copiedClusters);
		if (!this.commitDocumentTransaction()) return false;

		const copyIds = copies.map((copy) => copy.id);
		// Primary is the final selection entry; rotate the first-created copy there.
		this.selectPlacements([...copyIds.slice(1), copyIds[0]!]);
		this.requestPlacementFrame(copyIds);
		this.setStatusMessage(`Duplicated ${copies.length} object${copies.length === 1 ? '' : 's'}`);
		return true;
	}

	deletePlacements(ids: string[]) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const deleteIds = new Set(ids);
		if (
			deleteIds.size === 0 ||
			![...deleteIds].every((id) => this.document.objects.some((object) => object.id === id))
		) {
			return false;
		}
		if (!this.beginDocumentTransaction()) return false;

		this.document.objects = this.document.objects.filter((object) => !deleteIds.has(object.id));
		this.document.clusters = this.clusters
			.map((cluster) => ({
				...cluster,
				memberIds: cluster.memberIds.filter((id) => !deleteIds.has(id))
			}))
			.filter((cluster) => cluster.memberIds.length >= 2);

		return this.commitDocumentTransaction();
	}

	deleteSelection() {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		const ids = [...this.selectedPlacementIds];
		if (ids.length === 0) {
			this.setStatusMessage('Select one or more placements to delete');
			return false;
		}
		if (!this.deletePlacements(ids)) return false;
		this.deselect();
		this.setStatusMessage(`Deleted ${ids.length} object${ids.length === 1 ? '' : 's'}`);
		return true;
	}

	deletePlacement(id: string) {
		return this.deletePlacements([id]);
	}

	beginDocumentTransaction() {
		if (this.cameraPreview || this.#transactionBefore) return false;
		this.#transactionBefore = cloneMuseumSceneDocument(this.document);
		return true;
	}

	updatePlacementTransform(id: string, transform: PlacementTransform) {
		if (this.cameraPreview) return false;
		const placement = this.document.objects.find((object) => object.id === id);
		if (!placement || !this.isPlacementSelectable(id)) return false;
		return writePlacementTransform(placement, transform);
	}

	commitPlacementTransform(id: string, transform: PlacementTransform) {
		if (this.cameraPreview || this.transformInteractionActive) return false;
		if (!this.beginDocumentTransaction()) return false;
		if (!this.updatePlacementTransform(id, transform)) {
			this.cancelDocumentTransaction();
			return false;
		}
		return this.commitDocumentTransaction();
	}

	commitDocumentTransaction() {
		if (this.cameraPreview) return false;
		const before = this.#transactionBefore;
		if (!before) return false;

		if (documentsMatch(before, this.document)) {
			this.#transactionBefore = null;
			return false;
		}

		let nextScene: RuntimeMuseumScene;
		try {
			nextScene = resolveSceneDocument(this.document);
		} catch (error) {
			this.#transactionBefore = null;
			this.#replaceDocument(before);
			this.setStatusMessage(
				error instanceof Error ? error.message : 'Scene document validation failed'
			);
			return false;
		}

		this.#transactionBefore = null;
		this.#past.push(before);
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#future = [];
		this.#replaceRuntime(nextScene);
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
		if (this.cameraPreview || this.transformInteractionActive || this.#transactionBefore || this.#past.length === 0) return false;
		this.cancelPendingFrame();
		const previous = this.#past.pop();
		if (!previous) return false;
		this.#future.push(cloneMuseumSceneDocument(this.document));
		if (this.#future.length > HISTORY_LIMIT) this.#future.shift();
		this.#replaceDocument(previous);
		this.#bumpHistoryVersion();
		return true;
	}

	redo() {
		if (this.cameraPreview || this.transformInteractionActive || this.#transactionBefore || this.#future.length === 0) return false;
		this.cancelPendingFrame();
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
		if (
			this.cameraSelection &&
			!this.document.navigationNodes.some(
				(node) => node.id === this.cameraSelection?.nodeId
			)
		) {
			this.cameraSelection = null;
		}
		if (this.selectedClusterId) {
			const cluster = this.clusters.find(
				(candidate) => candidate.id === this.selectedClusterId
			);
			if (!cluster || cluster.roomId !== this.selectedRoomId) {
				this.#clearPlacementSelection();
				return;
			}
			this.selectedPlacementIds = [...cluster.memberIds];
			return;
		}
		this.selectedPlacementIds = this.selectedPlacementIds.filter((id) =>
			this.isPlacementSelectable(id)
		);
		if (
			this.pendingFramePlacementIds.some(
				(id) =>
					!this.selectedPlacementIds.includes(id) ||
					!this.document.objects.some((object) => object.id === id)
			)
		) {
			this.cancelPendingFrame();
		}
	}

	#rebuildRuntime() {
		const nextScene = resolveSceneDocument(this.document);
		this.#replaceRuntime(nextScene);
	}

	#replaceRuntime(nextScene: RuntimeMuseumScene) {
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

	registerCameraHelperRoot(
		nodeId: string,
		handle: EditorCameraHandle,
		root: Object3D
	) {
		const key = cameraHelperKey(nodeId, handle);
		if (this.#cameraHelperRoots.get(key) === root) return;
		this.#cameraHelperRoots.set(key, root);
		this.#bumpRegistryVersion();
	}

	unregisterCameraHelperRoot(
		nodeId: string,
		handle: EditorCameraHandle,
		root: Object3D
	) {
		const key = cameraHelperKey(nodeId, handle);
		if (this.#cameraHelperRoots.get(key) !== root) return;
		this.#cameraHelperRoots.delete(key);
		this.#bumpRegistryVersion();
	}

	getCameraHelperRoot(
		nodeId: string,
		handle: EditorCameraHandle
	): Object3D | undefined {
		void this.registryVersion;
		return this.#cameraHelperRoots.get(cameraHelperKey(nodeId, handle));
	}

	getSelectedCameraHelperRoot(): Object3D | undefined {
		const selection = this.cameraSelection;
		return selection
			? this.getCameraHelperRoot(selection.nodeId, selection.handle)
			: undefined;
	}
}

export function createMuseumEditorStore() {
	return new MuseumEditorStore();
}

export type { MuseumSceneDocument, RuntimeMuseumScene };
