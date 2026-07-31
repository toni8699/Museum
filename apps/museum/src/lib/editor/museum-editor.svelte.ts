import {
	createNavigationGraph,
	getNode,
	museumSceneDocument,
	resolveSceneDocument,
	type MuseumSceneDocument,
	type RuntimeMuseumScene,
	type SceneCameraViewKeyframe,
	type SceneConnection,
	type SceneNavigationNode,
	type SceneObjectCluster,
	type SceneObjectPlacement
} from '$lib/content/scene';
import {
	cameraSceneConnectionTimingFailureReason,
	serializeSceneDocument,
	validateSceneDocument,
	type SceneDocumentValidationResult
} from '$lib/content/scene-codec';
import { getAssetById, resolveAssetFallback } from '$lib/content/assets';
import { roomLocalPoint, roomPoint } from '$lib/content/rooms';
import type { MuseumStateStore } from '$lib/state/museum-state.svelte';
import {
	cameraMotionEdgeProgressAtProgress,
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion,
	createCameraMotionSample,
	sampleCameraMotion
} from '$lib/museum/navigation/camera-motion';
import {
	MUSEUM_CAMERA_EASING,
	MUSEUM_CAMERA_FOV,
	type CameraConnectionDirection,
	type CameraEasing,
	type MuseumRoomId,
	type SceneConnectionTiming,
	type Vec3
} from '$lib/types/museum';
import {
	getCameraConnectionRoute,
	getCameraRoute,
	type ResolvedCameraRoute
} from '$lib/museum/navigation/camera-route';
import type { Vector3Like } from '$lib/museum/navigation/camera-motion';
import type { Object3D } from 'three';
import {
	nextPlacementCycleId,
	type EditorCameraHandle,
	type EditorCameraSelection,
	type EditorNavigationSelection
} from './editor-selection';
import { reserveEntityId } from './editor-assets';
import {
	placementTransformFromDocument,
	type EditorTransformMode,
	type PlacementTransform,
	writePlacementTransform
} from './editor-transform';
import {
	allocateCameraPathAnchorId,
	createDraftConnectionPositionPath,
	createScenePathAnchorAtWorldPoint,
	findNearestCurveProgress,
	findScenePathAnchor,
	getScenePathAnchorWorldPosition,
	writeScenePathAnchorWorldPosition
} from './editor-camera-path';
import {
	allocateCameraViewKeyframeId,
	createSceneCameraViewKeyframeAtWorldTarget,
	EDITOR_CAMERA_VIEW_MOVE_EPSILON,
	EDITOR_CAMERA_VIEW_PROGRESS_EPSILON,
	findSceneCameraViewKeyframe,
	getSceneCameraViewKeyframeWorldTarget,
	writeSceneCameraViewKeyframeWorldTarget
} from './editor-camera-view';
import {
	cameraTimelineEdgePlayheadAtProgress,
	cameraTimelineProgressAtEdgePlayhead,
	cameraTimelineProgressAtEdgeProgress,
	createEditorCameraTimeline,
	findEditorCameraTimelineEdge,
	getEditorCameraTimelineLocation,
	type EditorCameraTimeline,
	type EditorCameraTimelineNodeBoundary
} from './editor-camera-timeline';
import {
	validateConnectionCreation,
	validateConnectionDeletion,
	validateCurrentGuidedTourOrder,
	validateGuidedTourInsertion,
	validateGuidedTourOrder,
	validateGuidedTourRemoval,
	validateNavigationNodeDeletion,
	validateTimelineGuidedTourDrop
} from './editor-navigation-graph';
import { EditorSessionState } from './store/session-state.svelte';
import { EditorSceneRoots } from './store/scene-roots.svelte';
import { EditorDocumentStore } from './store/document-store.svelte';
import { EditorCameraPreviewController } from './store/camera-preview-controller.svelte';
import { EditorHistoryController } from './store/history-controller.svelte';
import { EditorSelectionStore } from './store/selection-store.svelte';
import {
	EditorSelectionActions,
	type EditorSelectionActionsHost
} from './store/selection-actions.svelte';
import { runOrFail } from './helpers/validators-runner';

/**
 * Slice 4 helper — translate the legacy `EditorNavigationSelection` shape
 * (null for "no selection") into the parallel-tuple `NavigationSelection`
 * shape consumed by the reducer. Used by the legacy setter that bridges
 * pre-slice writes (`this.navigationSelection = …`) into the new model.
 */
function navigationStateFromLegacy(
	value: EditorNavigationSelection,
	direction: CameraConnectionDirection = 'forward'
): NavigationSelection {
	if (value === null) return { kind: 'none' };
	switch (value.kind) {
		case 'node':
			return { kind: 'node', nodeId: value.nodeId, handle: value.handle };
		case 'connection':
			return {
				kind: 'connection',
				connectionId: value.connectionId,
				direction
			};
		case 'anchor':
			return {
				kind: 'anchor',
				connectionId: value.connectionId,
				anchorId: value.anchorId
			};
		case 'view-keyframe':
			return {
				kind: 'view-keyframe',
				connectionId: value.connectionId,
				direction: value.direction,
				keyframeId: value.keyframeId
			};
	}
}

/**
 * Slice 4 helper — clone a parallel-tuple nav state so it survives across
 * pending-nav commit (mutations on selectionStore wrap the value in a Svelte
 * proxy; structuralClone avoids pinning the proxy).
 */
function cloneNavigation(state: NavigationSelection): NavigationSelection {
	switch (state.kind) {
		case 'none':
			return { kind: 'none' };
		case 'node':
			return { kind: 'node', nodeId: state.nodeId, handle: state.handle };
		case 'connection':
			return {
				kind: 'connection',
				connectionId: state.connectionId,
				direction: state.direction
			};
		case 'anchor':
			return {
				kind: 'anchor',
				connectionId: state.connectionId,
				anchorId: state.anchorId
			};
		case 'view-keyframe':
			return {
				kind: 'view-keyframe',
				connectionId: state.connectionId,
				direction: state.direction,
				keyframeId: state.keyframeId
			};
	}
}

/**
 * Slice 4 helper — translate the parallel-tuple NavigationSelection into the
 * legacy `EditorNavigationSelection` shape that the editor's 3D picker uses.
 * Kept at module scope to avoid re-creating the closure per call.
 */
function navigationSelectionFromState(
	state: NavigationSelection
): EditorNavigationSelection {
	switch (state.kind) {
		case 'none':
			return null;
		case 'node':
			return { kind: 'node', nodeId: state.nodeId, handle: state.handle };
		case 'connection':
			// Legacy public surface omits direction — discovery owns it.
			return { kind: 'connection', connectionId: state.connectionId };
		case 'anchor':
			return {
				kind: 'anchor',
				connectionId: state.connectionId,
				anchorId: state.anchorId
			};
		case 'view-keyframe':
			return {
				kind: 'view-keyframe',
				connectionId: state.connectionId,
				direction: state.direction,
				keyframeId: state.keyframeId
			};
	}
}

import type {
	EditorCameraPreviewMode,
	EditorCameraPreviewTransport,
	EditorCameraPreviewState,
	EditorCameraPreview,
	CameraPreviewTransition,
	CameraPreviewTour,
	EditorPendingNavigationCommand,
	EditorWorkspace,
	EditorLeftPanel,
	EditorViewKeyframeProgressDragSelection,
	EditorTransformSpace,
	EditorCameraFocusKind,
	EditorTransformInteractionKind,
	NavigationSelection
} from './museum-editor.types';
// Re-exports below keep the pre-slice public surface compiling unchanged.
import {
	anchorHelperKey,
	cameraHelperKey,
	viewKeyframeHelperKey
} from './helpers/scene-keys';

const STATUS_MESSAGE_MS = 2500;
const CAMERA_DIRECTION_TREE_KEY_SEPARATOR = '::';

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

// Slice 3 debt 3.11 — types now live in `museum-editor.types.ts`. Re-exported here
// so consumers keep working unchanged until Slice 6 collapses them.
export type {
	EditorCameraPreviewMode,
	EditorCameraPreviewTransport,
	EditorCameraPreviewState,
	EditorCameraPreview,
	CameraPreviewNode,
	CameraPreviewTransition,
	CameraPreviewConnection,
	CameraPreviewTour,
	EditorPendingNavigationCommand,
	EditorWorkspace,
	EditorLeftPanel,
	EditorPlacementTreeSelectionOptions,
	EditorClusterTreeSelectionOptions,
	EditorViewKeyframeProgressDragSelection,
	EditorTransformSpace,
	EditorCameraFocusKind,
	EditorTransformInteractionKind
} from './museum-editor.types';

type EditorCameraTimelineCue =
	| {
			kind: 'node';
			progress: number;
			boundary: EditorCameraTimelineNodeBoundary;
	  }
	| {
			kind: 'view-keyframe';
			progress: number;
			connectionId: string;
			direction: CameraConnectionDirection;
			keyframeId: string;
	  };

/** Bottom-panel frame measurements. Session-only, never serialized. */
export const EDITOR_TIMELINE_COLLAPSED_HEIGHT = 36;
export const EDITOR_TIMELINE_MIN_HEIGHT = 220;
export const EDITOR_TIMELINE_MAX_HEIGHT = 360;
export const EDITOR_TIMELINE_DEFAULT_HEIGHT = 280;

export const CAMERA_NODE_CREATION_DEFAULTS = {
	eyeHeight: 1.65,
	targetHeight: 1.25,
	targetDistance: 3,
	fov: MUSEUM_CAMERA_FOV.default,
	clearance: 0.35
} as const;

/** Stable `${connectionId}::${direction}` key for Camera workspace tree expansion. */
function cameraDirectionTreeKey(
	connectionId: string,
	direction: CameraConnectionDirection
) {
	return `${connectionId}${CAMERA_DIRECTION_TREE_KEY_SEPARATOR}${direction}`;
}

function vec3Matches(a: Vec3, b: Vec3) {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function vec3Distance(a: Vec3, b: Vec3) {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isFiniteVec3(value: Vec3) {
	return value.every(Number.isFinite);
}

// Slice 3 v2 sub-task 3.4 deleted the pre-slice helper `documentsMatch` because
// EditorDocumentStore now exposes a public static of the same name
// (EditorDocumentStore.documentsMatch) and the god file's caller migrated to it
// during sub-task 3.4 (line ~4142). The two helpers were JSON-stringify
// equality — single source of truth on the sub-store now.

function isRoutePointTuple(
	point: Vector3Like
): point is readonly [number, number, number] {
	return Array.isArray(point);
}

function cloneRoutePoint(point: Vector3Like): Vec3 {
	return isRoutePointTuple(point)
		? [point[0], point[1], point[2]]
		: [point.x, point.y, point.z];
}

function cloneResolvedCameraRoute(route: ResolvedCameraRoute): ResolvedCameraRoute {
	return {
		positionParts: route.positionParts.map((part) =>
			part.kind === 'rounded-polyline'
				? {
						kind: part.kind,
						points: part.points.map(cloneRoutePoint),
						...(part.clearance === undefined ? {} : { clearance: part.clearance })
				  }
				: {
						kind: part.kind,
						anchors: part.anchors.map(cloneRoutePoint)
				  }
		),
		targetPoints: route.targetPoints.map(cloneRoutePoint),
		...(route.startFov === undefined ? {} : { startFov: route.startFov }),
		...(route.endFov === undefined ? {} : { endFov: route.endFov }),
		nodeIds: [...route.nodeIds],
		edges: route.edges.map((edge) => ({
			connectionId: edge.connectionId,
			direction: edge.direction,
			fromNodeId: edge.fromNodeId,
			toNodeId: edge.toNodeId,
			positionSpan: {
				start: { ...edge.positionSpan.start },
				end: { ...edge.positionSpan.end }
			},
			...(edge.viewTrack === undefined
				? {}
				: {
						viewTrack: {
							start: {
								cameraTarget: cloneRoutePoint(edge.viewTrack.start.cameraTarget),
								fov: edge.viewTrack.start.fov
							},
							keyframes: edge.viewTrack.keyframes.map((keyframe) => ({
								id: keyframe.id,
								progress: keyframe.progress,
								cameraTarget: cloneRoutePoint(keyframe.cameraTarget),
								fov: keyframe.fov
							})),
							end: {
								cameraTarget: cloneRoutePoint(edge.viewTrack.end.cameraTarget),
								fov: edge.viewTrack.end.fov
							}
						}
				  }),
			...(edge.automaticTargetPoints === undefined
				? {}
				: {
						automaticTargetPoints: edge.automaticTargetPoints.map(cloneRoutePoint)
				  })
		}))
	};
}

export class MuseumEditorStore {
	// Sub-store composition (Slice 3 v2 sub-task 3.4, Option 3 pragmatic facade).
	// The MuseDoc lives on the sub-store (`documentStore.document`); the 9 facade
	// getters below preserve the pre-slice call-site surface so the 16 consumer
	// components (e.g. EditorViewport, EditorTransformControls, EditorSelection)
	// and the 163-block integration suite stay green untouched.
	//
	// Plan deviation: the field is named `documentStore` (private) + `get document()`
	// facade (read-only), instead of plan-literal `private readonly document =
	// new EditorDocumentStore();` (which would force 16-file sed churn on consumer
	// reads of `store.document.X` / `store.scene` / `store.state`). The architecture
	// still moves document ownership into the sub-store; only the field-name choice
	// differs.
	//
	// `get isDirty()` preserves the original `!validation.success || …` semantics
	// (the sub-store's isDirty drops the validation pre-check — a behavioural
	// regression caught by the review pass, see defect #1).
	//
	// The constructor registers selection-reconcile as an after-replace listener so
	// the coherence reset fires on every document swap (undo, redo, importDocument,
	// `EditorDocumentStore.replace` from any caller), not just the explicit
	// `#replaceDocument()` path (closes pre-slice defect #2).
	private readonly documentStore = new EditorDocumentStore();
	get document(): MuseumSceneDocument {
		return this.documentStore.document;
	}
	get scene(): RuntimeMuseumScene {
		return this.documentStore.scene;
	}
	get state(): MuseumStateStore {
		return this.documentStore.state;
	}
	get validation(): SceneDocumentValidationResult {
		return this.documentStore.validation;
	}
	get baselineCanonicalJson(): string {
		return this.documentStore.baselineCanonicalJson;
	}
	get canonicalJson(): string | null {
		const v = this.validation;
		return v.success ? v.canonicalJson : null;
	}
	get isDirty(): boolean {
		// Pre-slice semantics: an invalid document is "dirty" regardless of
		// baseline comparison because the user-facing save flow blocks on a
		// validation failure but the dirty indicator must still flip.
		const v = this.validation;
		return !v.success || v.canonicalJson !== this.baselineCanonicalJson;
	}
	get canExport(): boolean {
		return this.validation.success && !this.isDocumentTransactionActive;
	}
	get validationIssues() {
		const v = this.validation;
		return v.success ? [] : v.issues;
	}
	// Slice 3 v2 sub-task 3.5 — preview FSM ownership (Option 3 pragmatic facade).
	// State lives on `previewController`; getters below preserve `store.cameraPreview`
	// / `store.cameraPreviewFollowEnabled` / `store.cameraPreviewRecenterVersion`
	// consumer reads. Internal writes go through `this.previewController.*`.
	private readonly previewController = new EditorCameraPreviewController(this.documentStore);
	get cameraPreview(): EditorCameraPreview {
		// Controller redeclares preview types locally (Slice 6 collapses). Structural match.
		return this.previewController.preview as EditorCameraPreview;
	}
	/** Test/harness writes + rare internal installs. Prefer FSM methods for real transitions. */
	set cameraPreview(value: EditorCameraPreview) {
		this.previewController.preview = value as typeof this.previewController.preview;
	}
	get cameraPreviewFollowEnabled(): boolean {
		return this.previewController.followEnabled;
	}
	set cameraPreviewFollowEnabled(value: boolean) {
		this.previewController.followEnabled = value;
	}
	get cameraPreviewRecenterVersion(): number {
		return this.previewController.recenterVersion;
	}

	// Slice 3 v2 sub-task 3.6 — history + peer-link (Option 3).
	// Instantiated after previewController so the peer-link ctor arg exists.
	private readonly historyController = new EditorHistoryController(
		this.documentStore,
		this.previewController
	);
	get historyVersion(): number {
		return this.historyController.version;
	}

	#createSelectionHost(): EditorSelectionActionsHost {
		const self = this;
		return {
			get isDocumentMutationBlocked() {
				return self.isDocumentMutationBlocked;
			},
			get isEditorInteractionActive() {
				return self.isEditorInteractionActive;
			},
			get isCameraFramingMutationBlocked() {
				return self.isCameraFramingMutationBlocked;
			},
			get pendingNavigationCommand() {
				return self.pendingNavigationCommand;
			},
			get pendingNavigationNode() {
				return self.pendingNavigationNode;
			},
			get document() {
				return self.document;
			},
			get cameraSelection() {
				return self.cameraSelection;
			},
			get currentWorkspace() {
				return self.currentWorkspace;
			},
			get cameraPreview() {
				return self.cameraPreview;
			},
			get activeCameraConnectionId() {
				return self.activeCameraConnectionId;
			},
			get activeCameraDirection() {
				return self.activeCameraDirection;
			},
			get navigationSelection() {
				return self.navigationSelection;
			},
			get selectedRoomId() {
				return self.selectedRoomId;
			},
			get selectedPlacementId() {
				return self.selectedPlacementId;
			},
			get selectedPlacementIds() {
				return self.selectedPlacementIds;
			},
			get selectedClusterId() {
				return self.selectedClusterId;
			},
			get clusters() {
				return self.clusters;
			},
			get transformMode() {
				return self.transformMode;
			},
			set transformMode(value) {
				self.transformMode = value;
			},
			isPendingNavigationNode: (nodeId) => self.isPendingNavigationNode(nodeId),
			connectPendingNavigationNode: (destinationNodeId) =>
				self.connectPendingNavigationNode(destinationNodeId),
			cancelAssetPlacement: (message) => self.cancelAssetPlacement(message),
			cancelPendingFrame: () => self.cancelPendingFrame(),
			setStatusMessage: (message) => self.setStatusMessage(message),
			focusNavigationNode: (id) => self.focusNavigationNode(id),
			focusPlacement: (id) => self.focusPlacement(id),
			focusSelection: () => self.focusSelection(),
			ensureRoomTreeExpanded: (roomId) => self.ensureRoomTreeExpanded(roomId),
			ensureClusterTreeExpanded: (clusterId) => self.ensureClusterTreeExpanded(clusterId),
			isPlacementSelectable: (id) => self.isPlacementSelectable(id),
			getCapturedCameraPreviewRoute: (runId) => self.getCapturedCameraPreviewRoute(runId),
			setCameraPreviewPlayhead: (progress) => self.setCameraPreviewPlayhead(progress),
			syncCameraTimelineForNode: (id) => self.#syncCameraTimelineForNode(id),
			showCameraTimelineNodePose: (id) => self.#showCameraTimelineNodePose(id),
			syncCameraTimelineForConnection: (connectionId, direction, playhead) =>
				self.#syncCameraTimelineForConnection(connectionId, direction, playhead),
			showCameraTimelineConnectionPose: (connectionId, direction, playhead) =>
				self.#showCameraTimelineConnectionPose(connectionId, direction, playhead)
		};
	}

	constructor() {
		this.selectionActions = new EditorSelectionActions(
			this.selectionStore,
			this.#createSelectionHost()
		);
		this.selectionStore.bindSession(this.session);
		// Sub-store selection reconciliation (defect #2 fix). Closes the
		// pre-slice gap where #reconcileSelection() only ran via the explicit
		// #replaceDocument() callers — now fires on every document swap.
		this.documentStore.addAfterReplaceListener(() => this.#reconcileSelection());
		// Preview after-replace listeners (Slice 3.5). Order: reconcile first
		// (lowest-latency selection coherence), then preview refresh/prune/graph.
		// refreshPausedDirector keeps preview on route failure (pre-slice) and
		// returns the error for the session status channel.
		this.documentStore.addAfterReplaceListener(() => {
			const error = this.previewController.refreshPausedDirector();
			if (error) this.setStatusMessage(error.message);
		});
		this.documentStore.addAfterReplaceListener(() => this.previewController.pruneIfStale());
		this.documentStore.addAfterReplaceListener(() => this.previewController.invalidateGraph());
	}

	// Slice 4 — selection parallel-tuple. Reads are derived from `selectionStore`;
	// setters forward to the reducer (used by legacy call sites that haven't
	// been migrated; once Slice 5 lands these setters return to read-only
	// derived getters). Bind: will silently fail until Slice 5 migrates.
	get selectedRoomId(): MuseumRoomId | null {
		const w = this.selectionStore.workspace;
		return w.kind === 'none' ? null : w.roomId;
	}
	set selectedRoomId(value: MuseumRoomId | null) {
		this.selectionStore.setWorkspace(
			value === null
				? { kind: 'none' }
				: {
						kind: 'placement',
						ids: this.selectedPlacementIds,
						clusterId: this.selectedClusterId,
						roomId: value
				  }
		);
	}
	get selectedPlacementIds(): string[] {
		const w = this.selectionStore.workspace;
		if (w.kind === 'placement') return w.ids;
		if (w.kind === 'cluster') {
			const cluster = this.clusters.find((candidate) => candidate.id === w.clusterId);
			return cluster ? [...cluster.memberIds] : [];
		}
		return [];
	}
	set selectedPlacementIds(value: string[]) {
		const roomId = this.selectedRoomId;
		if (roomId === null) return;
		// Writing placement ids exits cluster mode (toggle / reconcile paths).
		this.selectionStore.setWorkspace({
			kind: 'placement',
			ids: value,
			clusterId: null,
			roomId
		});
	}
	get selectedClusterId(): string | null {
		const w = this.selectionStore.workspace;
		return w.kind === 'cluster' ? w.clusterId : null;
	}
	set selectedClusterId(value: string | null) {
		const roomId = this.selectedRoomId;
		if (roomId === null) return;
		this.selectionStore.setWorkspace(
			value === null
				? { kind: 'none' }
				: { kind: 'cluster', clusterId: value, roomId }
		);
	}
	get navigationSelection(): EditorNavigationSelection {
		return navigationSelectionFromState(this.selectionStore.navigation);
	}
	set navigationSelection(value: EditorNavigationSelection) {
		this.selectionStore.setNavigation(
			navigationStateFromLegacy(value, this.selectionStore.discoveryDirection)
		);
	}
	get selectedPlacementId(): string | null {
		return this.selectedPlacementIds.at(-1) ?? null;
	}
	get cameraSelection(): EditorCameraSelection | null {
		const n = this.selectionStore.navigation;
		return n.kind === 'node'
			? { nodeId: n.nodeId, handle: n.handle }
			: null;
	}
	transformMode = $state<EditorTransformMode>('rotate');
	transformGizmoVisible = $state(true);
	transformSpace = $state<EditorTransformSpace>('world');
	cameraFocusVersion = $state(0);
	cameraFocusKind = $state<
		'room' | 'placement' | 'selection' | 'navigation-node' | null
	>(null);
	cameraFocusPlacementId = $state<string | null>(null);
	cameraFocusNodeId = $state<string | null>(null);
	cameraPanEnabled = $state(true);
	/** Editor calibration aid; session-only and absent from scene snapshots. */
	gridVisible = $state(false);
	/**
	 * Phase 1.1 persistent shell — never enters history, dirty comparison, or canonical JSON.
	 * Workspace keeps selection/history but stops any active camera preview when leaving Camera.
	 * Camera workspace auto-expands the bottom timeline; Scene remembers the user's choice.
	 */
	currentWorkspace = $state<EditorWorkspace>('scene');
	leftPanel = $state<EditorLeftPanel>('scene');
	timelineExpanded = $state(false);
	/** Scene workspace preference is restored after Camera forces the panel open. */
	sceneTimelineExpanded = $state(false);
	timelineHeight = $state(EDITOR_TIMELINE_DEFAULT_HEIGHT);
	/** Phase 2.2 global guided-tour ruler. Session-only and normalized to [0, 1]. */
	cameraTimelinePlayhead = $state(0);
	pendingFramePlacementIds = $state<string[]>([]);
	pendingFrameVersion = $state(0);

	/**
	 * Phase 2.1 persistent camera-key discovery — the connection currently exposed for
	 * selection/scrub plus the directional focus track. Independent of any active
	 * Director preview so keys stay reachable after Stop or Done editing view.
	 */
	get activeCameraConnectionId(): string | null {
		return this.selectionStore.discoveryConnectionId;
	}
	set activeCameraConnectionId(value: string | null) {
		this.selectionStore.setDiscovery(value, this.activeCameraDirection);
	}
	get activeCameraDirection(): CameraConnectionDirection {
		return this.selectionStore.discoveryDirection;
	}
	set activeCameraDirection(value: CameraConnectionDirection) {
		this.selectionStore.setDiscovery(this.activeCameraConnectionId, value);
	}
	/** Session-only asset placement and pointer/shortcut coordination. */
	pendingPlacementAssetId = $state<string | null>(null);
	pendingNavigationCommand = $state<EditorPendingNavigationCommand>(null);
	hoveredConnectionId = $state<string | null>(null);
	hoveredAnchorId = $state<string | null>(null);
	transformInteractionActive = $state(false);
	transformInteractionKind = $state<
		'placement' | 'camera' | 'anchor' | 'view-target' | null
	>(null);
	directPathInteractionActive = $state(false);
	directFramingInteractionActive = $state(false);
	/** Phase 2.4 progress drag. The original progress stays private with the transaction. */
	viewKeyframeProgressDrag = $state<EditorViewKeyframeProgressDragSelection | null>(
		null
	);

	/**
	 * Slice 4 — selection is owned by a parallel-tuple sub-store. The six
	 * `$state` slots that used to live here (`selectedRoomId`,
	 * `selectedPlacementIds`, `selectedClusterId`, `navigationSelection`,
	 * `activeCameraConnectionId`, `activeCameraDirection`) are now derived
	 * getters backed by this store; binds against them silently stop
	 * writing (Phase A accept, per audit §3.G caveat — Slice 5 migrates).
	 */
	private readonly selectionStore = new EditorSelectionStore();

	/** Slice 4 public face — components can read `store.selection.workspace.kind`. */
	get selection(): EditorSelectionStore {
		return this.selectionStore;
	}

	/**
	 * Slice 6 (2b) — selection orchestration controller. Owns the `selectX`
	 * methods hard-deleted from this composition root. Call sites use
	 * `store.selectionActions.selectPlacement(...)` etc.; the reducer stays
	 * pure in `selection-store.svelte.ts`.
	 */
	readonly selectionActions: EditorSelectionActions;

	/** Slice 2 — registry of every Object3D helper + placement root. */
	private readonly roots = new EditorSceneRoots();
	#cancelTransform: (() => boolean) | null = null;
	#cancelDirectPathDrag: (() => boolean) | null = null;
	#cancelDirectFramingDrag: (() => boolean) | null = null;
	#restoreCameraPreview: (() => boolean) | null = null;
	#viewKeyframeProgressDragInitialProgress: number | null = null;
	// Slice 4 — pending-nav restore slots. Capture from selectionStore on commit,
	// restore via setWorkspace / setNavigation / setDiscovery on cancel.
	// Slice 4 — pending-nav restore slots are captured from selectionStore and
	// re-applied via the reducer. Type-matching the parallel-tuple selection
	// shape so we don't keep EditorNavigationSelection state alive.
	#pendingNavigationSelectionBefore: NavigationSelection = { kind: 'none' };
	#pendingNavigationActiveConnectionBefore: string | null = null;
	#pendingNavigationDirectionBefore: CameraConnectionDirection = 'forward';
	#pendingNavigationPlacementIdsBefore: string[] = [];
	#pendingNavigationClusterBefore: string | null = null;


	/**
	 * Slice 5 — bind-migration Phase B (audit §3.G). Canonical owners are
	 * `EditorSessionState.ambientIntensity` etc., below; these readonly
	 * getters forward reads. Writes go through `store.session.applyLighting(preset)`
	 * (batch), or `store.session.setAmbientIntensity(v)` (per-field, used
	 * by `EditorInspector.svelte`'s `oninput` handler — the component no
	 * longer has any `bind:value` against these slots).
	 */
	get ambientIntensity(): number {
		return this.session.ambientIntensity;
	}
	get directionalIntensity(): number {
		return this.session.directionalIntensity;
	}
	get fogEnabled(): boolean {
		return this.session.fogEnabled;
	}
	get fogNear(): number {
		return this.session.fogNear;
	}
	get fogFar(): number {
		return this.session.fogFar;
	}

	/**
	 * Slice 5 Phase B — placement snap / keep-on-floor. Session owns canonical
	 * `$state`; facade getters (+ setters for test/JS writes) forward.
	 * Component checkboxes use `sessionView.setX` (no `bind:checked`).
	 */
	get translationSnapEnabled(): boolean {
		return this.session.translationSnapEnabled;
	}
	set translationSnapEnabled(value: boolean) {
		this.session.setTranslationSnapEnabled(value);
	}
	get translationSnap(): number {
		return this.session.translationSnap;
	}
	set translationSnap(value: number) {
		this.session.setTranslationSnap(value);
	}
	get rotationSnapEnabled(): boolean {
		return this.session.rotationSnapEnabled;
	}
	set rotationSnapEnabled(value: boolean) {
		this.session.setRotationSnapEnabled(value);
	}
	get rotationSnapDegrees(): number {
		return this.session.rotationSnapDegrees;
	}
	set rotationSnapDegrees(value: number) {
		this.session.setRotationSnapDegrees(value);
	}
	get keepOnFloor(): boolean {
		return this.session.keepOnFloor;
	}
	set keepOnFloor(value: boolean) {
		this.session.setKeepOnFloor(value);
	}
	get dropToFloorRequestId(): number {
		return this.session.dropToFloorRequestId;
	}

	/** Slice 6.1 — tree expansion is canonical session state. */
	get treeExpandedRoomIds(): MuseumRoomId[] {
		return this.session.treeExpandedRoomIds;
	}
	set treeExpandedRoomIds(value: MuseumRoomId[]) {
		this.session.treeExpandedRoomIds = value;
	}
	get treeExpandedClusterIds(): string[] {
		return this.session.treeExpandedClusterIds;
	}
	set treeExpandedClusterIds(value: string[]) {
		this.session.treeExpandedClusterIds = value;
	}
	get treeExpandedCameraConnectionIds(): string[] {
		return this.session.treeExpandedCameraConnectionIds;
	}
	set treeExpandedCameraConnectionIds(value: string[]) {
		this.session.treeExpandedCameraConnectionIds = value;
	}
	get treeExpandedCameraDirectionKeys(): string[] {
		return this.session.treeExpandedCameraDirectionKeys;
	}
	set treeExpandedCameraDirectionKeys(value: string[]) {
		this.session.treeExpandedCameraDirectionKeys = value;
	}

	/** Slice 1 — session-only volatile state lives in this sub-store. */
	private readonly session = new EditorSessionState();

	get statusMessage() {
		return this.session.statusMessage;
	}
	get viewportShowNodes() {
		return this.session.viewportShowNodes;
	}
	get viewportShowPaths() {
		return this.session.viewportShowPaths;
	}
	get viewportShowFraming() {
		return this.session.viewportShowFraming;
	}

	/**
	 * Plan §3.C API shape — the single public face over the volatile
	 * session slots. Slice 5 expanded it to include per-field setter
	 * methods (`setAmbientIntensity`, `setFogEnabled`, …) so bind:
	 * migration routes writes through this getter instead of a former
	 * god-file parallel `$state` mirror. Slice 6 may collapse the
	 * `sessionView` alias with a public `get session()` for ergonomics.
	 */
	get sessionView() {
		return this.session;
	}

	/**
	 * Slice 2 compat shim — the pre-slice `$state(0)` field
	 * `registryVersion` was read by `void store.registryVersion;` in three
	 * `.svelte` components (`EditorCameraRig`, `EditorTransformControls`,
	 * tests). Routing those reads through this getter means we keep the
	 * erased-field public API stable and the deferred `$derived` works as
	 * expected — Svelte 5 still re-runs dependents because `roots.version`
	 * is itself `$state`.
	 */
	get registryVersion() {
		return this.roots.version;
	}

	get objectCount() {
		return this.document.objects.length;
	}

	toggleViewportShowNodes() {
		this.session.toggleViewportShowNodes();
	}

	toggleViewportShowPaths() {
		this.session.toggleViewportShowPaths();
	}

	toggleViewportShowFraming() {
		this.session.toggleViewportShowFraming();
	}

	/** Force-mount node helpers during connect-* commands so picking keeps working when nodes are hidden. */
	get forceMountCameraNodeHandles() {
		const kind = this.pendingNavigationCommand?.kind;
		return kind === 'connect-existing' || kind === 'connect-pending-node';
	}

	get clusters(): SceneObjectCluster[] {
		return this.document.clusters ?? [];
	}

	/** Compatibility getter — kept on the slice-4 accessor pair. */
	get primaryPlacementId() {
		return this.selectedPlacementId;
	}

	get selectionKey() {
		return `${this.selectedClusterId ?? ''}:${this.selectedPlacementIds.join('|')}`;
	}

	get nodeCount() {
		return this.document.navigationNodes.length;
	}

	get guidedTourNodeIds() {
		const validation = validateCurrentGuidedTourOrder(this.document);
		return validation.ok ? validation.nodeIds : [];
	}

	get selectedNavigationNode() {
		const id = this.navigationSelection?.kind === 'node'
			? this.navigationSelection.nodeId
			: null;
		if (!id) return undefined;
		if (
			this.pendingNavigationCommand?.kind === 'connect-pending-node' &&
			this.pendingNavigationCommand.node.id === id
		) {
			return this.pendingNavigationCommand.node;
		}
		return this.document.navigationNodes.find((node) => node.id === id);
	}

	get selectedRuntimeNavigationNode() {
		const id = this.navigationSelection?.kind === 'node'
			? this.navigationSelection.nodeId
			: null;
		return id ? this.getRuntimeNavigationNode(id) : undefined;
	}

	get pendingNavigationNode() {
		return this.pendingNavigationCommand?.kind === 'connect-pending-node'
			? this.pendingNavigationCommand.node
			: undefined;
	}

	isPendingNavigationNode(nodeId: string) {
		return this.pendingNavigationNode?.id === nodeId;
	}

	getRuntimeNavigationNode(nodeId: string) {
		const pending = this.pendingNavigationNode;
		if (pending?.id === nodeId) {
			return {
				...pending,
				position: roomPoint(pending.roomId, pending.position),
				cameraTarget: roomPoint(pending.roomId, pending.cameraTarget),
				connectedNodeIds: [...pending.connectedNodeIds]
			};
		}
		return this.scene.navigationNodes.find((node) => node.id === nodeId);
	}

	get selectedConnection() {
		const selection = this.navigationSelection;
		const connectionId =
			selection?.kind === 'connection' ||
			selection?.kind === 'anchor' ||
			selection?.kind === 'view-keyframe'
				? selection.connectionId
				: null;
		return connectionId
			? this.document.connections.find((connection) => connection.id === connectionId)
			: undefined;
	}

	get selectedAnchor() {
		const selection = this.navigationSelection;
		if (selection?.kind !== 'anchor') return undefined;
		return this.selectedConnection?.positionPath.anchors.find(
			(anchor) => anchor.id === selection.anchorId
		);
	}

	get selectedViewKeyframe(): SceneCameraViewKeyframe | undefined {
		const selection = this.navigationSelection;
		if (selection?.kind !== 'view-keyframe') return undefined;
		return (
			findSceneCameraViewKeyframe(
				this.document,
				selection.connectionId,
				selection.direction,
				selection.keyframeId
			) ?? undefined
		);
	}

	get selectedViewKeyframeWorldTarget(): Vec3 | undefined {
		const keyframe = this.selectedViewKeyframe;
		return keyframe
			? getSceneCameraViewKeyframeWorldTarget(keyframe)
			: undefined;
	}

	get activeViewKeyframeDirection(): CameraConnectionDirection | null {
		const preview = this.cameraPreview;
		if (preview?.kind === 'connection' && preview.mode === 'director') {
			return preview.direction;
		}
		const selection = this.navigationSelection;
		return selection?.kind === 'view-keyframe' ? selection.direction : null;
	}

	/**
	 * Phase 2.1 — does the Camera workspace currently focus a real connection so the
	 * 3D keyframe markers (markers / target / connector) should stay on screen?
	 */
	get isCameraKeyHelpersActive() {
		if (!this.activeCameraConnectionId) return false;
		if (
			this.isCameraPreviewPlaying ||
			this.pendingPlacementAssetId ||
			this.pendingNavigationCommand
		) {
			return false;
		}
		if (this.currentWorkspace !== 'camera') return false;
		return this.document.connections.some(
			(connection) => connection.id === this.activeCameraConnectionId
		);
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

	get isDirectorCameraPreview() {
		return this.cameraPreview?.mode === 'director';
	}

	get isVisitorCameraPreview() {
		return this.cameraPreview?.mode === 'visitor';
	}

	get isCameraPreviewPlaying() {
		return this.cameraPreview?.transport === 'playing';
	}

	get isCameraPreviewPaused() {
		return this.cameraPreview?.transport === 'paused';
	}

	get canAddViewKeyframeAtPlayhead() {
		const preview = this.cameraPreview;
		const connection = this.selectedConnection;
		if (
			!preview ||
			preview.kind !== 'connection' ||
			preview.mode !== 'director' ||
			preview.transport !== 'paused' ||
			preview.connectionId !== connection?.id ||
			this.isEditorInteractionActive ||
			this.isDocumentTransactionActive
		) {
			return false;
		}
		const authoring = this.#getViewKeyframeAuthoringSample(preview);
		if (!authoring) return false;
		const progress = authoring.edgeProgress;
		return (
			progress > EDITOR_CAMERA_VIEW_PROGRESS_EPSILON &&
			progress < 1 - EDITOR_CAMERA_VIEW_PROGRESS_EPSILON &&
			!(connection.viewTracks?.[preview.direction] ?? []).some(
				(keyframe) =>
					Math.abs(keyframe.progress - progress) <=
					EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
			)
		);
	}

	/** Build the current timeline index from the resolved graph and shared motion compiler. */
	getCameraTimeline(): EditorCameraTimeline | null {
		return this.previewController.getTimeline();
	}

	/** Visitor and active Director transport own immutable document state. */
	get isDocumentMutationBlocked() {
		const preview = this.cameraPreview;
		return Boolean(
			preview && (preview.mode === 'visitor' || preview.transport !== 'paused')
		);
	}

	/** Framing is editable through either camera while paused, but never during playback. */
	get isCameraFramingMutationBlocked() {
		const preview = this.cameraPreview;
		return Boolean(preview && preview.transport !== 'paused');
	}

	get isEditorInteractionActive() {
		return (
			this.transformInteractionActive ||
			this.directPathInteractionActive ||
			this.directFramingInteractionActive ||
			this.viewKeyframeProgressDrag !== null
		);
	}

	/** History is only blocked while a preview is playing or a drag/transaction is live. Paused Visitor previews do not lock undo. */
	get isDocumentUndoBlocked() {
		const preview = this.cameraPreview;
		return Boolean(
			this.isEditorInteractionActive ||
				this.historyController.isDocumentUndoBlocked ||
				(preview && preview.transport !== 'paused')
		);
	}

	/**
	 * Refuse / clear the active direct-framing drag. Returns true when no drag is active or when the
	 * registered canceler accepts; returns false when a canceler registered and refused, leaving the
	 * flag and caller state intact so callers can retry.
	 */
	#cancelDirectFramingDragOrFail(): boolean {
		if (!this.directFramingInteractionActive) return true;
		if (this.#cancelDirectFramingDrag && !this.#cancelDirectFramingDrag()) {
			return false;
		}
		this.directFramingInteractionActive = false;
		return true;
	}

	/**
	 * Stop any active camera preview whose node/connection no longer exists.
	 * Uses the controller prune for graph/node staleness, then applies the
	 * stricter connection/transition endpoint checks the composition root owns
	 * (controller.pruneIfStale is intentionally narrower — see Slice 3 hand-off).
	 */
	#pruneInvalidCameraPreview() {
		this.previewController.pruneIfStale();
		const preview = this.cameraPreview;
		if (!preview) return;
		const nodes = this.document.navigationNodes;
		const connections = this.document.connections;
		const hasNode = (id: string) => nodes.some((node) => node.id === id);
		const hasConnection = (id: string) =>
			connections.some((connection) => connection.id === id);
		let valid = true;
		switch (preview.kind) {
			case 'node':
				valid = hasNode(preview.nodeId);
				break;
			case 'connection':
				valid =
					hasConnection(preview.connectionId) &&
					hasNode(preview.fromNodeId) &&
					hasNode(preview.toNodeId);
				break;
			case 'transition':
				valid = hasNode(preview.fromNodeId) && hasNode(preview.toNodeId);
				break;
			case 'tour':
				valid = hasNode(preview.startNodeId);
				break;
		}
		if (!valid) this.stopCameraPreview();
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
		return (
			!this.isDocumentUndoBlocked &&
			!this.pendingNavigationCommand &&
			this.historyController.pastDepth > 0
		);
	}

	get canRedo() {
		void this.historyVersion;
		return (
			!this.isDocumentUndoBlocked &&
			!this.pendingNavigationCommand &&
			this.historyController.futureDepth > 0
		);
	}

	// Pre-slice duplicate getters isDirty / canExport / validationIssues / canonicalJson
	// were DELETED in Slice 3 v2 sub-task 3.4; the facade versions live at lines ~360–395
	// with the same semantics + the validation.success pre-check intact. Read these
	// via `store.isDirty` / `store.canExport` / `store.validationIssues` / `store.canonicalJson`
	// — the facade is the canonical access pattern.

	get isDocumentTransactionActive() {
		return this.historyController.isDocumentUndoBlocked;
	}

	applyLightingPreset(preset: EditorLightingSettings) {
		if (this.isVisitorCameraPreview) return false;
		// Slice 5 — session owns the canonical lighting state. The five mirrors
		// were dropped in Phase B; the single `applyLighting` call below mirrors
		// all five fields atomically.
		this.session.applyLighting(preset);
		return true;
	}

	setStatusMessage(message: string | null) {
		this.session.setStatusMessage(message);
	}

	setTransformCanceler(cancel: (() => boolean) | null) {
		this.#cancelTransform = cancel;
	}

	setDirectPathDragCanceler(cancel: (() => boolean) | null) {
		this.#cancelDirectPathDrag = cancel;
	}

	setDirectFramingDragCanceler(cancel: (() => boolean) | null) {
		this.#cancelDirectFramingDrag = cancel;
	}

	/** @deprecated Use setTransformCanceler; retained for Phase 6 integration tests. */
	setCameraTransformCanceler(cancel: (() => boolean) | null) {
		this.setTransformCanceler(cancel);
	}

	/** The camera rig installs this so modal guards remain active through restoration. */
	setCameraPreviewRestorer(restore: (() => boolean) | null) {
		this.#restoreCameraPreview = restore;
	}

	/** Leave an anchor without changing the document or its history. */
	finishAnchorEditing() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || this.pendingNavigationCommand) {
			return false;
		}
		const selection = this.selectionStore.navigation;
		if (selection.kind !== 'anchor') return false;
		const connection = this.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (!connection?.positionPath.anchors.some((anchor) => anchor.id === selection.anchorId)) {
			return false;
		}
		// Slice 4: finishing anchor editing rolls back to a connection selection.
		this.selection.setNavigation({
			kind: 'connection',
			connectionId: connection.id,
			direction: this.selectionStore.discoveryDirection
		});
		this.selectionActions.expandActiveCameraDirection(this.selectionStore.discoveryDirection);
		return true;
	}

	/** Leave a view key without changing the document or history. */
	finishViewKeyframeEditing() {
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			this.pendingNavigationCommand
		) {
			return false;
		}
		const selection = this.selectionStore.navigation;
		if (selection.kind !== 'view-keyframe') return false;
		const connection = this.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (
			!connection ||
			!findSceneCameraViewKeyframe(
				this.document,
				selection.connectionId,
				selection.direction,
				selection.keyframeId
			)
		) {
			return false;
		}
		this.selection.setNavigation({
			kind: 'connection',
			connectionId: connection.id,
			direction: selection.direction
		});
		this.selectionActions.expandActiveCameraDirection(selection.direction);
		return true;
	}

	#readCameraTimeline() {
		const cached = this.getCameraTimeline();
		if (cached) return cached;
		try {
			return createEditorCameraTimeline(this.state.graph);
		} catch (error) {
			this.setStatusMessage(
				error instanceof Error ? error.message : 'The camera timeline is unavailable'
			);
			return null;
		}
	}

	#syncCameraTimelineForConnection(
		connectionId: string,
		direction: CameraConnectionDirection,
		playhead: number
	) {
		const timeline = this.getCameraTimeline();
		if (!timeline) return false;
		const progress = cameraTimelineProgressAtEdgePlayhead(
			timeline,
			connectionId,
			direction,
			playhead
		);
		if (progress === null) return false;
		this.cameraTimelinePlayhead = progress;
		return true;
	}

	#syncCameraTimelineForNode(nodeId: string) {
		const timeline = this.getCameraTimeline();
		if (!timeline) return false;
		const candidates = timeline.nodeBoundaries.filter(
			(boundary) => boundary.nodeId === nodeId
		);
		if (candidates.length === 0) return false;
		const boundary = candidates.reduce((nearest, candidate) =>
			Math.abs(candidate.progress - this.cameraTimelinePlayhead) <
			Math.abs(nearest.progress - this.cameraTimelinePlayhead)
				? candidate
				: nearest
		);
		this.cameraTimelinePlayhead = boundary.progress;
		return true;
	}

	#canSeekCameraTimeline() {
		const preview = this.cameraPreview;
		return !(
			this.isEditorInteractionActive ||
			this.pendingNavigationCommand ||
			this.isDocumentTransactionActive ||
			(preview && preview.transport !== 'paused')
		);
	}

	#clearCameraFocusRequest() {
		this.cameraFocusKind = null;
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
	}

	#showCameraTimelineNodePose(nodeId: string) {
		if (!this.#canSeekCameraTimeline()) return false;
		if (!this.scene.navigationNodes.some((node) => node.id === nodeId)) return false;
		if (
			this.cameraPreview?.kind === 'node' &&
			this.cameraPreview.nodeId === nodeId &&
			this.cameraPreview.mode === 'director' &&
			this.cameraPreview.transport === 'paused'
		) {
			this.#clearCameraFocusRequest();
			return false;
		}
		const hadPreview = this.cameraPreview !== null;
		if (!hadPreview && !this.#prepareCameraPreview()) return false;
		this.previewController.clearCapturedRoute();
		this.#clearCameraFocusRequest();
		this.previewController.followEnabled = true;
		this.previewController.recenterVersion += 1;
		this.previewController.preview = {
			kind: 'node',
			nodeId,
			mode: 'director',
			transport: 'paused',
			runId: this.previewController.allocRunId(),
			playhead: 0,
			startedAtMs: null
		};
		this.timelineExpanded = true;
		return true;
	}

	#showCameraTimelineConnectionPose(
		connectionId: string,
		direction: CameraConnectionDirection,
		playhead: number,
		options: { preservePreviewObserver?: boolean } = {}
	) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(playhead)) return false;
		const preview = this.cameraPreview;
		if (
			preview?.kind === 'connection' &&
			preview.connectionId === connectionId &&
			preview.direction === direction &&
			preview.transport === 'paused'
		) {
			this.#clearCameraFocusRequest();
			return this.setCameraPreviewPlayhead(playhead, preview.runId);
		}
		const connection = this.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) return false;
		let route: ResolvedCameraRoute;
		try {
			route = getCameraConnectionRoute(connectionId, direction, this.state.graph);
		} catch (error) {
			this.setStatusMessage(
				error instanceof Error ? error.message : 'The camera connection is unavailable'
			);
			return false;
		}
		const hadPreview = this.cameraPreview !== null;
		if (!hadPreview && !this.#prepareCameraPreview()) return false;
		const runId = this.previewController.allocRunId();
		this.previewController.setCapturedRoute(runId, route);
		this.#clearCameraFocusRequest();
		if (!options.preservePreviewObserver || !hadPreview) {
			this.previewController.followEnabled = true;
			this.previewController.recenterVersion += 1;
		}
		const fromNodeId =
			direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
		const toNodeId =
			direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
		this.previewController.preview = {
			kind: 'connection',
			connectionId,
			direction,
			fromNodeId,
			toNodeId,
			mode: preview?.mode ?? 'director',
			transport: 'paused',
			runId,
			playhead: Math.min(1, Math.max(0, playhead)),
			startedAtMs: null
		};
		this.timelineExpanded = true;
		return true;
	}

	/** Phase 2.2 — scrub the global ruler through the exact guided edge motion. */
	seekCameraTimeline(progress: number) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(progress)) return false;
		const timeline = this.#readCameraTimeline();
		if (!timeline) return false;
		const location = getEditorCameraTimelineLocation(timeline, progress);
		const movedTimeline =
			Math.abs(this.cameraTimelinePlayhead - location.progress) > 1e-6;
		const selected = this.selectionActions.selectCameraConnectionDirection(
			location.edge.connectionId,
			location.edge.direction,
			{ preservePreviewObserver: true }
		);
		const shown = this.#showCameraTimelineConnectionPose(
			location.edge.connectionId,
			location.edge.direction,
			location.playhead,
			{ preservePreviewObserver: true }
		);
		this.cameraTimelinePlayhead = location.progress;
		return movedTimeline || selected || shown;
	}

	/** Select a guided edge and seek to the pointer's nearest global ruler point. */
	selectCameraTimelineEdge(
		connectionId: string,
		direction: CameraConnectionDirection,
		progress: number
	) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(progress)) return false;
		const timeline = this.#readCameraTimeline();
		if (!timeline) return false;
		const edge = findEditorCameraTimelineEdge(timeline, connectionId);
		if (!edge) return false;
		const clampedProgress = Math.min(
			edge.motionEndSeconds / timeline.durationSeconds,
			Math.max(edge.motionStartSeconds / timeline.durationSeconds, progress)
		);
		const edgePlayhead = cameraTimelineEdgePlayheadAtProgress(
			timeline,
			connectionId,
			direction,
			clampedProgress
		);
		if (edgePlayhead === null) return false;
		const movedTimeline =
			Math.abs(this.cameraTimelinePlayhead - clampedProgress) > 1e-6;
		const selected = this.selectionActions.selectCameraConnectionDirection(connectionId, direction);
		const shown = this.#showCameraTimelineConnectionPose(
			connectionId,
			direction,
			edgePlayhead
		);
		this.cameraTimelinePlayhead = clampedProgress;
		return movedTimeline || selected || shown;
	}

	/** Select one occurrence of a guided node and sample its exact authored pose. */
	selectCameraTimelineNode(nodeId: string, boundaryIndex: number) {
		if (!this.#canSeekCameraTimeline() || !Number.isInteger(boundaryIndex)) return false;
		const timeline = this.#readCameraTimeline();
		const boundary = timeline?.nodeBoundaries[boundaryIndex];
		if (!timeline || boundary?.nodeId !== nodeId) return false;
		const movedTimeline =
			Math.abs(this.cameraTimelinePlayhead - boundary.progress) > 1e-6;
		const selected = this.selectionActions.selectNavigationNode(nodeId);
		this.cameraTimelinePlayhead = boundary.progress;
		const shown = this.#showCameraTimelineNodePose(nodeId);
		return movedTimeline || selected || shown;
	}

	/** Select a directional key and seek its exact shared-motion sample. */
	selectCameraTimelineViewKeyframe(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	) {
		if (!this.#canSeekCameraTimeline()) return false;
		const keyframe = findSceneCameraViewKeyframe(
			this.document,
			connectionId,
			direction,
			keyframeId
		);
		const timeline = this.#readCameraTimeline();
		if (!keyframe || !timeline) return false;
		const timelineProgress = cameraTimelineProgressAtEdgeProgress(
			timeline,
			connectionId,
			direction,
			keyframe.progress
		);
		const edge = findEditorCameraTimelineEdge(timeline, connectionId);
		if (timelineProgress === null || !edge) return false;
		const edgePlayhead = cameraMotionProgressAtEdgeProgress(
			edge.motions[direction],
			0,
			keyframe.progress
		);
		const movedTimeline =
			Math.abs(this.cameraTimelinePlayhead - timelineProgress) > 1e-6;
		const selected = this.selectionActions.selectViewKeyframe(connectionId, direction, keyframeId);
		const shown = this.#showCameraTimelineConnectionPose(
			connectionId,
			direction,
			edgePlayhead
		);
		this.cameraTimelinePlayhead = timelineProgress;
		return movedTimeline || selected || shown;
	}

	#getCameraTimelineKeyBoundaries(
		timeline: EditorCameraTimeline
	): EditorCameraTimelineCue[] {
		const cues: EditorCameraTimelineCue[] = timeline.nodeBoundaries.map((boundary) => ({
				kind: 'node',
				progress: boundary.progress,
				boundary
			}));
		for (const edge of timeline.edges) {
			const direction =
				this.activeCameraConnectionId === edge.connectionId
					? this.activeCameraDirection
					: edge.direction;
			const connection = this.document.connections.find(
				(candidate) => candidate.id === edge.connectionId
			);
			for (const keyframe of connection?.viewTracks?.[direction] ?? []) {
				const progress = cameraTimelineProgressAtEdgeProgress(
					timeline,
					edge.connectionId,
					direction,
					keyframe.progress
				);
				if (progress === null) continue;
				cues.push({
					kind: 'view-keyframe',
					progress,
					connectionId: edge.connectionId,
					direction,
					keyframeId: keyframe.id
				});
			}
		}
		return cues.sort((left, right) => left.progress - right.progress);
	}

	/** Seek the previous/next guided node or visible directional framing key. */
	stepCameraTimeline(direction: -1 | 1) {
		if (!this.#canSeekCameraTimeline()) return false;
		const timeline = this.#readCameraTimeline();
		if (!timeline) return false;
		const cues = this.#getCameraTimelineKeyBoundaries(timeline);
		const epsilon = 1e-6;
		const cue =
			direction < 0
				? [...cues]
						.reverse()
						.find((candidate) => candidate.progress < this.cameraTimelinePlayhead - epsilon) ??
					cues[0]
				: cues.find(
						(candidate) => candidate.progress > this.cameraTimelinePlayhead + epsilon
					) ?? cues.at(-1);
		if (!cue) return false;
		return cue.kind === 'node'
			? this.selectCameraTimelineNode(
					cue.boundary.nodeId,
					cue.boundary.boundaryIndex
			  )
			: this.selectCameraTimelineViewKeyframe(
					cue.connectionId,
					cue.direction,
					cue.keyframeId
			  );
	}

	focusNavigationNode(id: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
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
			this.isDocumentMutationBlocked ||
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
		const mutationBlocked =
			handle === 'target'
				? this.isCameraFramingMutationBlocked
				: this.isDocumentMutationBlocked;
		if (mutationBlocked || !isFiniteVec3(point)) {
			return false;
		}
		const selection = this.cameraSelection;
		if (selection?.nodeId !== nodeId || selection.handle !== handle) return false;
		const pending = this.isPendingNavigationNode(nodeId);
		if (!pending && !this.historyController.isDocumentUndoBlocked) return false;
		const node = pending
			? this.pendingNavigationNode
			: this.document.navigationNodes.find((candidate) => candidate.id === nodeId);
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
		const mutationBlocked =
			handle === 'target'
				? this.isCameraFramingMutationBlocked
				: this.isDocumentMutationBlocked;
		if (mutationBlocked || this.isEditorInteractionActive) return false;
		if (this.isPendingNavigationNode(nodeId)) {
			return this.updateNavigationNodePoint(nodeId, handle, point);
		}
		if (
			!(handle === 'target'
				? this.beginCameraFramingTransaction()
				: this.beginDocumentTransaction())
		) {
			return false;
		}
		if (!this.updateNavigationNodePoint(nodeId, handle, point)) {
			this.cancelDocumentTransaction();
			return false;
		}
		return this.commitDocumentTransaction();
	}

	convertConnectionDraft(connectionId: string) {
		if (!this.historyController.isDocumentUndoBlocked) return false;
		const connection = this.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection || connection.positionPath.kind === 'auto-bezier') return false;
		connection.positionPath = {
			kind: 'auto-bezier',
			anchors: connection.positionPath.anchors
		};
		return true;
	}

	convertSelectedConnectionToSmooth() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const connection = this.selectedConnection;
		if (!connection || connection.positionPath.kind === 'auto-bezier') return false;
		if (!this.beginDocumentTransaction()) return false;
		this.convertConnectionDraft(connection.id);
		return this.commitDocumentTransaction();
	}

	insertConnectionAnchorAtWorldPoint(
		connectionId: string,
		interiorIndex: number,
		worldPosition: Vec3
	) {
		if (!this.historyController.isDocumentUndoBlocked || !isFiniteVec3(worldPosition)) return null;
		const connection = this.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) return null;
		this.convertConnectionDraft(connectionId);
		const id = allocateCameraPathAnchorId(
			connectionId,
			connection.positionPath.anchors.map((anchor) => anchor.id)
		);
		const anchor = createScenePathAnchorAtWorldPoint(
			id,
			worldPosition,
			this.selectedRoomId
		);
		const index = Math.max(
			0,
			Math.min(connection.positionPath.anchors.length, Math.trunc(interiorIndex))
		);
		connection.positionPath.anchors.splice(index, 0, anchor);
		this.navigationSelection = { kind: 'anchor', connectionId, anchorId: id };
		return id;
	}

	updateConnectionAnchorWorldPoint(
		connectionId: string,
		anchorId: string,
		worldPosition: Vec3
	) {
		if (!this.historyController.isDocumentUndoBlocked || !isFiniteVec3(worldPosition)) return false;
		const anchor = findScenePathAnchor(this.document, connectionId, anchorId);
		if (!anchor) return false;
		const current = getScenePathAnchorWorldPosition(anchor);
		if (vec3Matches(current, worldPosition)) return false;
		this.convertConnectionDraft(connectionId);
		writeScenePathAnchorWorldPosition(anchor, worldPosition);
		return true;
	}

	commitSelectedAnchorPoint(point: Vec3) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || !isFiniteVec3(point)) {
			return false;
		}
		const selection = this.navigationSelection;
		const anchor = this.selectedAnchor;
		if (selection?.kind !== 'anchor' || !anchor || vec3Matches(anchor.position, point)) {
			return false;
		}
		if (!this.beginDocumentTransaction()) return false;
		this.convertConnectionDraft(selection.connectionId);
		anchor.position = [...point];
		return this.commitDocumentTransaction();
	}

	deleteSelectedAnchor() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const selection = this.navigationSelection;
		const connection = this.selectedConnection;
		if (selection?.kind !== 'anchor' || !connection) return false;
		const index = connection.positionPath.anchors.findIndex(
			(anchor) => anchor.id === selection.anchorId
		);
		if (index < 0 || !this.beginDocumentTransaction()) return false;
		connection.positionPath.anchors.splice(index, 1);
		this.navigationSelection = {
			kind: 'connection',
			connectionId: connection.id
		};
		return this.commitDocumentTransaction();
	}

	commitSelectedNodeLabel(label: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const node = this.selectedNavigationNode;
		const next = label.trim();
		if (!node || !next || next === node.label) return false;
		if (this.isPendingNavigationNode(node.id)) {
			node.label = next;
			return true;
		}
		if (!this.beginDocumentTransaction()) return false;
		node.label = next;
		return this.commitDocumentTransaction();
	}

	commitSelectedNodeFov(fov: number) {
		if (
			this.isCameraFramingMutationBlocked ||
			this.isEditorInteractionActive ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const node = this.selectedNavigationNode;
		if (!node || Math.abs(node.fov - fov) <= 1e-6) return false;
		if (this.isPendingNavigationNode(node.id)) {
			node.fov = fov;
			return true;
		}
		if (!this.beginCameraFramingTransaction()) return false;
		node.fov = fov;
		return this.commitDocumentTransaction();
	}

	updateSelectedNodeFov(fov: number) {
		if (
			this.isCameraFramingMutationBlocked ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const node = this.selectedNavigationNode;
		if (!node || (!this.isPendingNavigationNode(node.id) && !this.historyController.isFramingTransactionActive)) {
			return false;
		}
		if (Math.abs(node.fov - fov) <= 1e-6) return false;
		node.fov = fov;
		return true;
	}

	#getViewKeyframeAuthoringSample(
		preview: Extract<Exclude<EditorCameraPreview, null>, { kind: 'connection' }>
	) {
		const route = this.getCapturedCameraPreviewRoute(preview.runId);
		if (!route) return null;
		const motion = createCameraMotion(route);
		let playhead = preview.playhead;
		let edgeProgress: number;
		const selection = this.navigationSelection;
		if (
			selection?.kind === 'anchor' &&
			selection.connectionId === preview.connectionId
		) {
			const anchor = this.selectedAnchor;
			if (!anchor) return null;
			const path = createDraftConnectionPositionPath(
				this.document,
				preview.connectionId,
				preview.direction
			);
			edgeProgress = findNearestCurveProgress(
				path,
				getScenePathAnchorWorldPosition(anchor)
			);
			playhead = cameraMotionProgressAtEdgeProgress(
				motion,
				0,
				edgeProgress
			);
		} else {
			edgeProgress = cameraMotionEdgeProgressAtProgress(
				motion,
				0,
				playhead
			);
		}
		return { motion, playhead, edgeProgress };
	}

	addViewKeyframeAtPlayhead() {
		const preview = this.cameraPreview;
		const connection = this.selectedConnection;
		if (
			!preview ||
			preview.kind !== 'connection' ||
			preview.mode !== 'director' ||
			preview.transport !== 'paused' ||
			preview.connectionId !== connection?.id ||
			this.isEditorInteractionActive ||
			this.isDocumentTransactionActive
		) {
			return false;
		}
		const authoring = this.#getViewKeyframeAuthoringSample(preview);
		if (!authoring) return false;
		const { edgeProgress, motion, playhead } = authoring;
		if (
			edgeProgress <= EDITOR_CAMERA_VIEW_PROGRESS_EPSILON ||
			edgeProgress >= 1 - EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
		) {
			this.setStatusMessage('Move the Director playhead inside the connection');
			return false;
		}
		const track = connection.viewTracks?.[preview.direction] ?? [];
		if (
			track.some(
				(keyframe) =>
					Math.abs(keyframe.progress - edgeProgress) <=
					EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
			)
		) {
			this.setStatusMessage('A view breakpoint already exists at this progress');
			return false;
		}

		this.setCameraPreviewPlayhead(playhead, preview.runId);
		const sample = createCameraMotionSample();
		sampleCameraMotion(motion, playhead, sample);
		const existingIds = [
			...(connection.viewTracks?.forward ?? []),
			...(connection.viewTracks?.reverse ?? [])
		].map((keyframe) => keyframe.id);
		const id = allocateCameraViewKeyframeId(
			connection.id,
			preview.direction,
			existingIds
		);
		const keyframe = createSceneCameraViewKeyframeAtWorldTarget(
			id,
			edgeProgress,
			sample.target,
			sample.fov,
			this.selectedRoomId
		);

		if (!this.beginDocumentTransaction()) return false;
		connection.viewTracks ??= { forward: [], reverse: [] };
		connection.viewTracks[preview.direction].push(keyframe);
		connection.viewTracks[preview.direction].sort(
			(left, right) => left.progress - right.progress
		);
		this.navigationSelection = {
			kind: 'view-keyframe',
			connectionId: connection.id,
			direction: preview.direction,
			keyframeId: id
		};
		return this.commitDocumentTransaction();
	}

	updateSelectedViewKeyframeTargetWorldPoint(worldTarget: Vec3) {
		if (!this.historyController.isDocumentUndoBlocked || !isFiniteVec3(worldTarget)) return false;
		const keyframe = this.selectedViewKeyframe;
		if (!keyframe) return false;
		const current = getSceneCameraViewKeyframeWorldTarget(keyframe);
		if (vec3Matches(current, worldTarget)) return false;
		writeSceneCameraViewKeyframeWorldTarget(keyframe, worldTarget);
		return true;
	}

	commitSelectedViewKeyframeTarget(target: Vec3) {
		if (
			this.isCameraFramingMutationBlocked ||
			this.isEditorInteractionActive ||
			!isFiniteVec3(target)
		) {
			return false;
		}
		const keyframe = this.selectedViewKeyframe;
		if (
			!keyframe ||
			vec3Distance(keyframe.cameraTarget, target) <=
				EDITOR_CAMERA_VIEW_MOVE_EPSILON
		) {
			return false;
		}
		if (!this.beginCameraFramingTransaction()) return false;
		keyframe.cameraTarget = [...target];
		return this.commitDocumentTransaction();
	}

	commitSelectedViewKeyframeFov(fov: number) {
		if (
			this.isCameraFramingMutationBlocked ||
			this.isEditorInteractionActive ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const keyframe = this.selectedViewKeyframe;
		if (!keyframe || Math.abs(keyframe.fov - fov) <= 1e-6) return false;
		if (!this.beginCameraFramingTransaction()) return false;
		keyframe.fov = fov;
		return this.commitDocumentTransaction();
	}

	updateSelectedViewKeyframeFov(fov: number) {
		if (
			this.isCameraFramingMutationBlocked ||
			!this.historyController.isFramingTransactionActive ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const keyframe = this.selectedViewKeyframe;
		if (!keyframe || Math.abs(keyframe.fov - fov) <= 1e-6) return false;
		keyframe.fov = fov;
		return true;
	}

	commitSelectedViewKeyframeProgress(progress: number) {
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			!Number.isFinite(progress) ||
			progress <= 0 ||
			progress >= 1
		) {
			return false;
		}
		const selection = this.navigationSelection;
		const connection = this.selectedConnection;
		const keyframe = this.selectedViewKeyframe;
		if (
			selection?.kind !== 'view-keyframe' ||
			!connection?.viewTracks ||
			!keyframe ||
			Math.abs(keyframe.progress - progress) <=
				EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
		) {
			return false;
		}
		const track = connection.viewTracks[selection.direction];
		if (
			track.some(
				(candidate) =>
					candidate.id !== keyframe.id &&
					Math.abs(candidate.progress - progress) <=
						EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
			)
		) {
			this.setStatusMessage('View breakpoint progress must be unique');
			return false;
		}
		if (!this.beginDocumentTransaction()) return false;
		keyframe.progress = progress;
		track.sort((left, right) => left.progress - right.progress);
		return this.commitDocumentTransaction();
	}

	#syncViewKeyframeProgressDragPreview(
		selection: EditorViewKeyframeProgressDragSelection,
		progress: number
	) {
		const timeline = this.getCameraTimeline();
		const timelineProgress = timeline
			? cameraTimelineProgressAtEdgeProgress(
					timeline,
					selection.connectionId,
					selection.direction,
					progress
				)
			: null;
		if (timelineProgress === null) {
			throw new Error('The camera key is not on the guided timeline');
		}

		const draftGraph = createNavigationGraph(resolveSceneDocument(this.document));
		const route = getCameraConnectionRoute(
			selection.connectionId,
			selection.direction,
			draftGraph
		);
		const motion = createCameraMotion(route);
		const playhead = cameraMotionProgressAtEdgeProgress(motion, 0, progress);
		const connection = this.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (!connection) throw new Error('The camera connection is unavailable');

		const runId = this.previewController.allocRunId();
		this.previewController.setCapturedRoute(runId, route);
		this.cameraTimelinePlayhead = timelineProgress;
		this.previewController.preview = {
			kind: 'connection',
			connectionId: connection.id,
			direction: selection.direction,
			fromNodeId:
				selection.direction === 'forward'
					? connection.fromNodeId
					: connection.toNodeId,
			toNodeId:
				selection.direction === 'forward'
					? connection.toNodeId
					: connection.fromNodeId,
			mode: 'director',
			transport: 'paused',
			runId,
			playhead,
			startedAtMs: null
		};
		return true;
	}

	/** Begin one cancel-safe transaction for a timeline or 3D camera-key progress drag. */
	beginViewKeyframeProgressDrag(
		selection: EditorViewKeyframeProgressDragSelection
	) {
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			this.isDocumentTransactionActive ||
			this.pendingNavigationCommand
		) {
			return false;
		}
		const keyframe = findSceneCameraViewKeyframe(
			this.document,
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		if (!keyframe) return false;

		this.selectCameraTimelineViewKeyframe(
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		const current = this.navigationSelection;
		if (
			current?.kind !== 'view-keyframe' ||
			current.connectionId !== selection.connectionId ||
			current.direction !== selection.direction ||
			current.keyframeId !== selection.keyframeId ||
			!this.beginDocumentTransaction()
		) {
			return false;
		}

		this.#viewKeyframeProgressDragInitialProgress = keyframe.progress;
		this.viewKeyframeProgressDrag = { ...selection };
		return true;
	}

	/**
	 * Update the active key with either exact edge progress or a world point projected
	 * to the shared directional connection curve. Only progress is mutated.
	 */
	updateViewKeyframeProgressDrag(progressOrWorldPoint: number | Vector3Like) {
		const selection = this.viewKeyframeProgressDrag;
		if (!selection || !this.historyController.isDocumentUndoBlocked) return false;
		const keyframe = findSceneCameraViewKeyframe(
			this.document,
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		const connection = this.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (!keyframe || !connection?.viewTracks) return false;

		let requestedProgress: number;
		try {
			requestedProgress =
				typeof progressOrWorldPoint === 'number'
					? progressOrWorldPoint
					: findNearestCurveProgress(
							createDraftConnectionPositionPath(
								this.document,
								selection.connectionId,
								selection.direction
							),
							progressOrWorldPoint
						);
		} catch {
			return false;
		}
		if (!Number.isFinite(requestedProgress)) return false;
		const progress = Math.min(
			1 - EDITOR_CAMERA_VIEW_PROGRESS_EPSILON,
			Math.max(EDITOR_CAMERA_VIEW_PROGRESS_EPSILON, requestedProgress)
		);
		if (
			Math.abs(progress - keyframe.progress) <=
			EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
		) {
			return false;
		}

		const track = connection.viewTracks[selection.direction];
		if (
			track.some(
				(candidate) =>
					candidate.id !== keyframe.id &&
					Math.abs(candidate.progress - progress) <=
						EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
			)
		) {
			this.setStatusMessage('View breakpoint progress must be unique');
			return false;
		}

		const previousProgress = keyframe.progress;
		keyframe.progress = progress;
		track.sort((left, right) => left.progress - right.progress);
		try {
			this.#syncViewKeyframeProgressDragPreview(selection, progress);
			return true;
		} catch (error) {
			keyframe.progress = previousProgress;
			track.sort((left, right) => left.progress - right.progress);
			this.setStatusMessage(
				error instanceof Error
					? error.message
					: 'Camera key progress could not be updated'
			);
			return false;
		}
	}

	/** Commit a successful drag as exactly one history entry. */
	commitViewKeyframeProgressDrag() {
		const selection = this.viewKeyframeProgressDrag;
		const initialProgress = this.#viewKeyframeProgressDragInitialProgress;
		if (!selection || initialProgress === null) return false;
		const keyframe = findSceneCameraViewKeyframe(
			this.document,
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		if (
			!keyframe ||
			Math.abs(keyframe.progress - initialProgress) <=
				EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
		) {
			this.cancelViewKeyframeProgressDrag();
			return false;
		}

		this.viewKeyframeProgressDrag = null;
		this.#viewKeyframeProgressDragInitialProgress = null;
		const committed = this.commitDocumentTransaction();
		if (!committed) {
			this.selectCameraTimelineViewKeyframe(
				selection.connectionId,
				selection.direction,
				selection.keyframeId
			);
		}
		return committed;
	}

	/** Restore the original progress/playhead and create no history entry. */
	cancelViewKeyframeProgressDrag() {
		const selection = this.viewKeyframeProgressDrag;
		if (!selection) return false;
		this.viewKeyframeProgressDrag = null;
		this.#viewKeyframeProgressDragInitialProgress = null;
		const cancelled = this.cancelDocumentTransaction();
		this.selectCameraTimelineViewKeyframe(
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		return cancelled;
	}

	deleteSelectedViewKeyframe() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) {
			return false;
		}
		const selection = this.navigationSelection;
		const connection = this.selectedConnection;
		if (
			selection?.kind !== 'view-keyframe' ||
			!connection?.viewTracks
		) {
			return false;
		}
		const track = connection.viewTracks[selection.direction];
		const index = track.findIndex(
			(keyframe) => keyframe.id === selection.keyframeId
		);
		if (index < 0 || !this.beginDocumentTransaction()) return false;
		track.splice(index, 1);
		if (
			connection.viewTracks.forward.length === 0 &&
			connection.viewTracks.reverse.length === 0
		) {
			delete connection.viewTracks;
		}
		this.navigationSelection = {
			kind: 'connection',
			connectionId: connection.id
		};
		return this.commitDocumentTransaction();
	}

	copySelectedConnectionViewTrack(source: CameraConnectionDirection) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) {
			return false;
		}
		const connection = this.selectedConnection;
		if (!connection) return false;
		const destination: CameraConnectionDirection =
			source === 'forward' ? 'reverse' : 'forward';
		const sourceTrack = connection.viewTracks?.[source] ?? [];
		const destinationTrack = connection.viewTracks?.[destination] ?? [];
		if (sourceTrack.length === 0 && destinationTrack.length === 0) return false;

		const occupied = new Set(
			[
				...(connection.viewTracks?.forward ?? []),
				...(connection.viewTracks?.reverse ?? [])
			].map((keyframe) => keyframe.id)
		);
		const copied = [...sourceTrack].reverse().map((keyframe) => {
			const id = allocateCameraViewKeyframeId(
				connection.id,
				destination,
				occupied
			);
			occupied.add(id);
			return {
				id,
				progress: 1 - keyframe.progress,
				cameraTarget: [...keyframe.cameraTarget] as Vec3,
				...(keyframe.roomId === undefined ? {} : { roomId: keyframe.roomId }),
				fov: keyframe.fov
			};
		});
		if (!this.beginDocumentTransaction()) return false;
		connection.viewTracks ??= { forward: [], reverse: [] };
		connection.viewTracks[destination] = copied;
		if (
			connection.viewTracks.forward.length === 0 &&
			connection.viewTracks.reverse.length === 0
		) {
			delete connection.viewTracks;
		}
		return this.commitDocumentTransaction();
	}

	/** Phase 3.1 — primary Play promotes the current global ruler into one guided cycle. */
	previewGuidedTour(mode: EditorCameraPreviewMode = 'visitor') {
		if (this.isEditorInteractionActive || this.isDocumentTransactionActive) {
			return false;
		}
		const current = this.cameraPreview;
		if (current?.kind === 'tour') {
			if (current.transport === 'playing') return false;
			if (this.cameraPreview?.transport === 'complete') {
				this.setCameraPreviewPlayhead(0, this.cameraPreview.runId);
			}
			return this.playCameraPreview();
		}
		if (current?.transport === 'playing') return false;

		const timeline = this.#readCameraTimeline();
		if (!timeline) return false;
		if (!current && !this.#prepareCameraPreview()) return false;

		const runId = this.previewController.allocRunId();
		this.previewController.clearCapturedRoute();
		if (!current) {
			this.previewController.followEnabled = true;
			this.previewController.recenterVersion += 1;
		}
		const playhead = Math.min(1, Math.max(0, this.cameraTimelinePlayhead));
		this.previewController.preview = {
			kind: 'tour',
			startNodeId: timeline.startNodeId,
			mode: current?.mode ?? mode,
			transport: 'playing',
			runId,
			playhead,
			startedAtMs: null
		};
		this.timelineExpanded = true;
		return true;
	}

	previewSelectedNode(mode: EditorCameraPreviewMode = 'visitor') {
		if (this.cameraPreview) return false;
		const nodeId = this.cameraSelection?.nodeId;
		if (!nodeId || !this.scene.navigationNodes.some((node) => node.id === nodeId)) {
			this.setStatusMessage('Select a camera node to preview');
			return false;
		}
		if (!this.#prepareCameraPreview()) return false;
		this.previewController.clearCapturedRoute();
		this.previewController.followEnabled = true;
		this.previewController.recenterVersion += 1;
		this.previewController.preview = {
			kind: 'node',
			nodeId,
			mode,
			transport: 'paused',
			runId: this.previewController.allocRunId(),
			playhead: 0,
			startedAtMs: null
		};
		this.#syncCameraTimelineForNode(nodeId);
		this.timelineExpanded = true;
		return true;
	}

	previewSelectedTransition(mode: EditorCameraPreviewMode = 'visitor') {
		if (this.cameraPreview) return false;
		const nodeId = this.cameraSelection?.nodeId;
		if (!nodeId) {
			this.setStatusMessage('Select a camera node to preview');
			return false;
		}

		let toNodeId: string;
		let route: ResolvedCameraRoute;
		try {
			const node = getNode(nodeId, this.state.graph);
			if (!node.nextNodeId) throw new Error(`Camera node has no nextNodeId: ${nodeId}`);
			toNodeId = node.nextNodeId;
			route = getCameraRoute(nodeId, toNodeId, this.state.graph);
		} catch (error) {
			this.setStatusMessage(
				error instanceof Error ? error.message : 'Camera transition is unavailable'
			);
			return false;
		}

		if (!this.#prepareCameraPreview()) return false;
		const runId = this.previewController.allocRunId();
		this.previewController.setCapturedRoute(runId, route);
		this.previewController.followEnabled = true;
		this.previewController.recenterVersion += 1;
		this.previewController.preview = {
			kind: 'transition',
			fromNodeId: nodeId,
			toNodeId,
			mode,
			transport: mode === 'director' ? 'paused' : 'playing',
			runId,
			playhead: 0,
			startedAtMs: null
		};
		this.timelineExpanded = true;
		return true;
	}

	previewSelectedConnection(
		direction: 'forward' | 'reverse',
		mode: EditorCameraPreviewMode = 'visitor'
	) {
		if (this.cameraPreview || this.isEditorInteractionActive) return false;
		const connection = this.selectedConnection;
		if (!connection) {
			this.setStatusMessage('Select a camera connection to preview');
			return false;
		}
		const fromNodeId =
			direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
		const toNodeId =
			direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
		let route: ResolvedCameraRoute;
		try {
			route = getCameraConnectionRoute(connection.id, direction, this.state.graph);
		} catch (error) {
			this.setStatusMessage(
				error instanceof Error ? error.message : 'Camera connection is unavailable'
			);
			return false;
		}
		if (!this.#prepareCameraPreview()) return false;
		const prior = this.selectionStore.navigation;
		// Pre-slice: only downgrade view-keyframe when preview direction differs.
		// Anchor selection must survive so nearest-curve authoring still works.
		if (
			prior.kind === 'view-keyframe' &&
			prior.connectionId === connection.id &&
			prior.direction !== direction
		) {
			this.selection.setNavigation({
				kind: 'connection',
				connectionId: connection.id,
				direction
			});
		} else if (prior.kind === 'connection') {
			this.selection.setNavigation({
				kind: 'connection',
				connectionId: connection.id,
				direction
			});
		} else {
			this.selection.setDiscovery(connection.id, direction);
		}
		this.selectionActions.expandActiveCameraDirection(direction);
		const runId = this.previewController.allocRunId();
		this.previewController.setCapturedRoute(runId, route);
		this.previewController.followEnabled = true;
		this.previewController.recenterVersion += 1;
		this.previewController.preview = {
			kind: 'connection',
			connectionId: connection.id,
			direction,
			fromNodeId,
			toNodeId,
			mode,
			transport: mode === 'director' ? 'paused' : 'playing',
			runId,
			playhead: 0,
			startedAtMs: null
		};
		this.#syncCameraTimelineForConnection(connection.id, direction, 0);
		this.timelineExpanded = true;
		return true;
	}

	setCameraPreviewMode(mode: EditorCameraPreviewMode) {
		const preview = this.cameraPreview;
		if (
			!preview ||
			preview.mode === mode ||
			this.isEditorInteractionActive ||
			this.isDocumentTransactionActive
		) {
			return false;
		}
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind !== 'node' && preview.kind !== 'tour') {
			try {
				route = this.#resolveCameraPreviewRoute(preview);
			} catch (error) {
				this.setStatusMessage(
					error instanceof Error ? error.message : 'Camera preview route is unavailable'
				);
				return false;
			}
		}
		const runId = this.previewController.allocRunId();
		if (route) this.previewController.setCapturedRoute(runId, route);
		else this.previewController.clearCapturedRoute();
		this.previewController.preview = {
			...preview,
			mode,
			transport: mode === 'director' ? 'paused' : preview.transport,
			runId,
			startedAtMs: null
		};
		return true;
	}

	playCameraPreview() {
		const preview = this.cameraPreview;
		if (
			!preview ||
			preview.kind === 'node' ||
			preview.transport === 'playing' ||
			this.isEditorInteractionActive ||
			this.isDocumentTransactionActive
		) {
			return false;
		}
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind === 'tour') {
			if (!this.#readCameraTimeline()) return false;
		} else {
			try {
				route = preview.mode === 'director'
					? this.#resolveCameraPreviewRoute(preview)
					: this.getCapturedCameraPreviewRoute(preview.runId)!;
				if (!route) throw new Error('Camera preview route capture is unavailable');
			} catch (error) {
				this.setStatusMessage(
					error instanceof Error ? error.message : 'Camera preview route is unavailable'
				);
				return false;
			}
		}
		const runId = this.previewController.allocRunId();
		if (route) this.previewController.setCapturedRoute(runId, route);
		else this.previewController.clearCapturedRoute();
		const playhead = preview.transport === 'complete' ? 0 : preview.playhead;
		this.previewController.preview = {
			...preview,
			transport: 'playing',
			runId,
			playhead,
			startedAtMs: null
		};
		if (preview.kind === 'connection') {
			this.#syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				playhead
			);
		} else if (preview.kind === 'tour') {
			this.cameraTimelinePlayhead = playhead;
		}
		return true;
	}

	pauseCameraPreview() {
		return this.previewController.pause();
	}

	setCameraPreviewPlayhead(progress: number, runId = this.cameraPreview?.runId) {
		const preview = this.cameraPreview;
		if (!preview || preview.kind === 'node' || preview.runId !== runId || !Number.isFinite(progress)) {
			return false;
		}
		const playhead = Math.min(1, Math.max(0, progress));
		if (Math.abs(preview.playhead - playhead) <= 1e-6 && preview.transport !== 'complete') {
			return false;
		}
		this.previewController.preview = {
			...preview,
			playhead,
			...(preview.transport === 'complete'
				? { transport: 'paused' as const, startedAtMs: null }
				: {})
		};
		if (preview.kind === 'connection') {
			this.#syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				playhead
			);
		} else if (preview.kind === 'tour') {
			this.cameraTimelinePlayhead = playhead;
		}
		return true;
	}

	stepCameraPreview(direction: -1 | 1) {
		const preview = this.cameraPreview;
		if (
			!preview ||
			preview.mode !== 'director' ||
			preview.kind === 'node' ||
			preview.transport === 'playing'
		) {
			return false;
		}
		const breakpoints = [0, 1];
		if (preview.kind === 'tour') {
			const timeline = this.#readCameraTimeline();
			if (!timeline) return false;
			breakpoints.push(...timeline.nodeBoundaries.map((boundary) => boundary.progress));
			for (const edge of timeline.edges) {
				const motion = edge.motions[edge.direction];
				for (const keyframe of motion.positionEdgeSpans[0]?.viewTrack?.keyframes ?? []) {
					const progress = cameraTimelineProgressAtEdgeProgress(
						timeline,
						edge.connectionId,
						edge.direction,
						keyframe.progress
					);
					if (progress !== null) breakpoints.push(progress);
				}
			}
		} else {
			const route = this.getCapturedCameraPreviewRoute(preview.runId);
			if (!route) return false;
			const motion = createCameraMotion(route);
			for (const [edgeIndex, edge] of motion.positionEdgeSpans.entries()) {
				breakpoints.push(cameraMotionProgressAtEdgeProgress(motion, edgeIndex, 0));
				breakpoints.push(cameraMotionProgressAtEdgeProgress(motion, edgeIndex, 1));
				for (const keyframe of edge.viewTrack?.keyframes ?? []) {
					breakpoints.push(
						cameraMotionProgressAtEdgeProgress(motion, edgeIndex, keyframe.progress)
					);
				}
			}
		}
		const ordered = [...new Set(breakpoints.map((value) => value.toFixed(9)))]
			.map(Number)
			.sort((left, right) => left - right);
		const epsilon = 1e-6;
		const next = direction < 0
			? [...ordered].reverse().find((value) => value < preview.playhead - epsilon) ?? 0
			: ordered.find((value) => value > preview.playhead + epsilon) ?? 1;
		return this.setCameraPreviewPlayhead(next);
	}

	toggleCameraPreviewFollow() {
		return this.previewController.toggleFollow();
	}

	recenterCameraPreview() {
		return this.previewController.recenter();
	}

	markCameraPreviewStarted(runId: number, startedAtMs: number) {
		return this.previewController.markStarted(runId, startedAtMs);
	}

	completeCameraPreview(runId: number) {
		const preview = this.cameraPreview;
		if (
			!preview ||
			preview.kind === 'node' ||
			preview.runId !== runId ||
			preview.transport !== 'playing' ||
			preview.startedAtMs === null
		) {
			return false;
		}
		this.previewController.preview = {
			...preview,
			transport: 'complete',
			playhead: 1,
			startedAtMs: null
		};
		if (preview.kind === 'connection') {
			this.#syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				1
			);
		} else if (preview.kind === 'tour') {
			this.cameraTimelinePlayhead = 1;
		}
		return true;
	}

	stopCameraPreview() {
		if (this.viewKeyframeProgressDrag) {
			this.cancelViewKeyframeProgressDrag();
		}
		if (!this.cameraPreview) return false;
		if (!this.#cancelDirectFramingDragOrFail()) return false;
		if (this.#restoreCameraPreview && !this.#restoreCameraPreview()) return false;
		this.previewController.preview = null;
		this.previewController.clearCapturedRoute();
		this.previewController.followEnabled = true;
		// Phase 2.1: Preview Stop preserves the active connection + direction so any
		// previously-selected keyframe remains reachable through tree/timeline/3D.
		return true;
	}

	getCapturedCameraPreviewRoute(runId: number) {
		return this.previewController.getCapturedRoute(runId);
	}

	#resolveCameraPreviewRoute(preview: Exclude<EditorCameraPreview, null>) {
		if (preview.kind === 'node') {
			throw new Error('A node preview has no camera route');
		}
		if (preview.kind === 'connection') {
			return getCameraConnectionRoute(
				preview.connectionId,
				preview.direction,
				this.state.graph
			);
		}
		if (preview.kind === 'tour') {
			throw new Error('Guided tour preview uses exact camera timeline motions');
		}
		return getCameraRoute(preview.fromNodeId, preview.toNodeId, this.state.graph);
	}

	#prepareCameraPreview() {
		if (this.transformInteractionActive) {
			if (!this.#cancelTransform?.()) return false;
		}
		if (this.directPathInteractionActive && !this.#cancelDirectPathDrag?.()) {
			return false;
		}
		if (this.transformInteractionActive || this.isDocumentTransactionActive) return false;
		this.cancelAssetPlacement();
		this.cancelPendingNavigation();
		this.cancelPendingFrame();
		this.setNavigationHover(null);
		this.cameraFocusKind = null;
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		return true;
	}

	requestDropToFloor() {
		if (this.isDocumentMutationBlocked) return;
		if (this.selectedPlacementIds.length === 0) {
			this.setStatusMessage('Select a placement to drop to floor');
			return;
		}
		this.session.requestDropToFloor();
	}

	focusRoom(id: MuseumRoomId) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || id !== 'paris') return false;
		this.cancelPendingFrame();
		this.cameraFocusKind = 'room';
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		this.cameraFocusVersion += 1;
		return true;
	}

	focusPlacement(id: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || !this.isPlacementSelectable(id)) {
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
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
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
		if (this.isVisitorCameraPreview) return false;
		this.cameraPanEnabled = !this.cameraPanEnabled;
		return true;
	}

	toggleGrid() {
		if (this.isVisitorCameraPreview) return false;
		this.gridVisible = !this.gridVisible;
		return true;
	}

	/** Phase 1.3 — choose a viewport tool without entering document history. */
	setTransformTool(tool: 'select' | EditorTransformMode) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (tool === 'select') {
			if (!this.transformGizmoVisible) return false;
			this.transformGizmoVisible = false;
			return true;
		}
		const changed = !this.transformGizmoVisible || this.transformMode !== tool;
		this.transformMode = tool;
		this.transformGizmoVisible = true;
		return changed;
	}

	/** Phase 1.3 — local/world affects placement gizmos only; camera helpers remain world-space. */
	setTransformSpace(space: EditorTransformSpace) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (space === this.transformSpace) return false;
		this.transformSpace = space;
		return true;
	}

	/** Toggle the snap mode relevant to the active translate/rotate tool. */
	toggleActiveTransformSnap() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (!this.transformGizmoVisible) return false;
		if (this.transformMode === 'translate') {
			this.session.toggleTranslationSnap();
			return true;
		}
		if (this.transformMode === 'rotate') {
			this.session.toggleRotationSnap();
			return true;
		}
		return false;
	}

	/** Phase 1.1 — switch editor workspace. Stops any active camera preview when leaving Camera. */
	setWorkspace(workspace: EditorWorkspace) {
		if (this.isDocumentMutationBlocked) return false;
		if (this.viewKeyframeProgressDrag) {
			this.cancelViewKeyframeProgressDrag();
		}
		if (this.isEditorInteractionActive) return false;
		if (workspace === this.currentWorkspace) return false;
		if (this.pendingNavigationCommand) {
			this.cancelPendingNavigation('Camera placement cancelled');
		}
		if (this.currentWorkspace === 'camera' && this.cameraPreview) {
			this.stopCameraPreview();
		}
		this.currentWorkspace = workspace;
		this.session.setWorkspace(workspace);
		this.timelineExpanded = workspace === 'camera' ? true : this.sceneTimelineExpanded;
		return true;
	}

	/** Phase 1.1 — switch the persistent left sidebar tab. */
	setLeftPanel(panel: EditorLeftPanel) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (panel === this.leftPanel) return false;
		if (this.leftPanel === 'assets' && panel === 'scene') {
			this.cancelAssetPlacement();
		}
		this.leftPanel = panel;
		this.session.setLeftPanel(panel);
		return true;
	}

	/** Phase 1.1 — bottom timeline panel collapse/expand state. */
	setTimelineExpanded(value: boolean) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.timelineExpanded = Boolean(value);
		if (this.currentWorkspace === 'scene') {
			this.sceneTimelineExpanded = this.timelineExpanded;
		}
		this.session.setTimelineExpanded(this.timelineExpanded);
		if (this.currentWorkspace === 'scene')
			this.session.setSceneTimelineExpanded(this.sceneTimelineExpanded);
		return true;
	}

	/** Phase 1.1 — clamped timeline height in CSS pixels. */
	setTimelineHeight(value: number) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (typeof value !== 'number' || !Number.isFinite(value)) return false;
		const nextHeight = Math.min(
			EDITOR_TIMELINE_MAX_HEIGHT,
			Math.max(EDITOR_TIMELINE_MIN_HEIGHT, Math.round(value))
		);
		this.timelineHeight = nextHeight;
		this.session.setTimelineHeight(nextHeight);
		return true;
	}

	toggleTimeline() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.timelineExpanded = !this.timelineExpanded;
		if (this.currentWorkspace === 'scene') {
			this.sceneTimelineExpanded = this.timelineExpanded;
		}
		this.session.setTimelineExpanded(this.timelineExpanded);
		if (this.currentWorkspace === 'scene')
			this.session.setSceneTimelineExpanded(this.sceneTimelineExpanded);
		return true;
	}

	/** Phase 1.1 — toggle a room card's expansion in the sidebar tree. */
	toggleRoomTreeExpansion(roomId: MuseumRoomId) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.session.toggleRoomExpanded(roomId);
		return true;
	}

	/** Phase 1.1 — toggle a cluster row's expansion in the sidebar tree. */
	toggleClusterTreeExpansion(clusterId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.session.toggleClusterExpanded(clusterId);
		return true;
	}

	/** Phase 1.1 — collapse a cluster row without affecting other rows. */
	removeClusterTreeExpansion(clusterId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (this.session.treeExpandedClusterIds.includes(clusterId)) {
			this.session.treeExpandedClusterIds = this.session.treeExpandedClusterIds.filter(
				(candidate) => candidate !== clusterId
			);
		}
		return true;
	}

	/** Phase 1.1 — Set of every placement id that belongs to any cluster. */
	get clusteredPlacementIds(): Set<string> {
		return new Set(this.clusters.flatMap((cluster) => cluster.memberIds));
	}

	/** Phase 1.1 — additive helper for inspector grouping actions that need to reveal a cluster. */
	ensureRoomTreeExpanded(roomId: MuseumRoomId) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.selection.expandRoom(roomId);
		return true;
	}

	/** Phase 1.1 — additive helper for inspector grouping actions that need to reveal a cluster. */
	ensureClusterTreeExpanded(clusterId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.selection.expandCluster(clusterId);
		return true;
	}

	/** Phase 2.1 — toggle a connection's collapsible body in the Camera sidebar tree. */
	toggleCameraConnectionTreeExpansion(connectionId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const expanded = this.session.treeExpandedCameraConnectionIds;
		this.session.treeExpandedCameraConnectionIds = expanded.includes(connectionId)
			? expanded.filter((candidate) => candidate !== connectionId)
			: [...expanded, connectionId];
		return true;
	}

	/** Phase 2.1 — toggle a Forward/Reverse subsection under a connection. */
	toggleCameraDirectionTreeExpansion(
		connectionId: string,
		direction: CameraConnectionDirection
	) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const key = cameraDirectionTreeKey(connectionId, direction);
		const expanded = this.session.treeExpandedCameraDirectionKeys;
		this.session.treeExpandedCameraDirectionKeys = expanded.includes(key)
			? expanded.filter((candidate) => candidate !== key)
			: [...expanded, key];
		return true;
	}

	setTransformInteractionActive(
		active: boolean,
		kind: 'placement' | 'camera' | 'anchor' | 'view-target' | null = active
			? this.transformInteractionKind
			: null
	) {
		this.transformInteractionActive = active;
		this.transformInteractionKind = active ? kind : null;
	}

	setDirectPathInteractionActive(active: boolean) {
		this.directPathInteractionActive = active;
	}

	setDirectFramingInteractionActive(active: boolean) {
		this.directFramingInteractionActive = active;
	}

	setNavigationHover(connectionId: string | null, anchorId: string | null = null) {
		if (this.isDocumentMutationBlocked || this.pendingPlacementAssetId || this.pendingNavigationCommand) {
			connectionId = null;
			anchorId = null;
		}
		if (
			this.hoveredConnectionId === connectionId &&
			this.hoveredAnchorId === anchorId
		) {
			return false;
		}
		this.hoveredConnectionId = connectionId;
		this.hoveredAnchorId = anchorId;
		return true;
	}

	requestPlacementFrame(ids: string[]) {
		if (this.isDocumentMutationBlocked) return false;
		const next = [...new Set(ids)].filter((id) =>
			this.document.objects.some((object) => object.id === id)
		);
		if (next.length === 0) return false;
		this.pendingFramePlacementIds = next;
		this.pendingFrameVersion += 1;
		return true;
	}

	consumePendingFrame(ids: string[]) {
		if (this.isDocumentMutationBlocked) return false;
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
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
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

		this.cancelPendingNavigation();
		this.selectionActions.selectRoom('paris');
		this.pendingPlacementAssetId = asset.id;
		this.setNavigationHover(null);
		this.setStatusMessage(`Click the Paris floor to place ${asset.name}`);
		return true;
	}

	cancelAssetPlacement(message?: string) {
		if (this.isDocumentMutationBlocked) return false;
		const changed = this.pendingPlacementAssetId !== null;
		this.pendingPlacementAssetId = null;
		if (message) this.setStatusMessage(message);
		return changed;
	}

	createPendingPlacementAt(position: Vec3) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return null;
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
		this.selectionActions.selectPlacement(id);
		this.setStatusMessage(`Placed ${asset.name}`);
		return id;
	}

	beginCameraPlacement() {
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			this.pendingNavigationCommand
		) return false;
		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.setWorkspace('camera');
		// Slice 4 — capture parallel-tuple nav shape for restore (keeps connection direction).
		this.#pendingNavigationSelectionBefore = cloneNavigation(
			this.selectionStore.navigation
		);
		this.#pendingNavigationActiveConnectionBefore = this.activeCameraConnectionId;
		this.#pendingNavigationDirectionBefore = this.activeCameraDirection;
		this.#pendingNavigationPlacementIdsBefore = [...this.selectedPlacementIds];
		this.#pendingNavigationClusterBefore = this.selectedClusterId;
		this.selectionActions.clearPlacementSelection();
		this.navigationSelection = null;
		this.activeCameraConnectionId = null;
		this.activeCameraDirection = 'forward';
		this.pendingNavigationCommand = {
			kind: 'place-camera'
		};
		this.setNavigationHover(null);
		this.setStatusMessage('Click any tagged room floor to place a camera');
		return true;
	}

	/** Compatibility alias retained for callers from the pre-3.2 connected-camera flow. */
	beginConnectedNodePlacement() {
		return this.beginCameraPlacement();
	}

	beginConnectExistingNodes() {
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			this.pendingNavigationCommand
		) return false;
		const source = this.selectedNavigationNode;
		if (!source) {
			this.setStatusMessage('Select a source camera node');
			return false;
		}
		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.#pendingNavigationSelectionBefore = cloneNavigation(
			this.selectionStore.navigation
		);
		this.#pendingNavigationActiveConnectionBefore = this.activeCameraConnectionId;
		this.#pendingNavigationDirectionBefore = this.activeCameraDirection;
		this.#pendingNavigationPlacementIdsBefore = [...this.selectedPlacementIds];
		this.#pendingNavigationClusterBefore = this.selectedClusterId;
		this.pendingNavigationCommand = {
			kind: 'connect-existing',
			sourceNodeId: source.id
		};
		this.setNavigationHover(null);
		this.setStatusMessage('Choose another camera node');
		return true;
	}

	cancelPendingNavigation(message?: string) {
		const pending = this.pendingNavigationCommand;
		const changed = pending !== null;
		this.pendingNavigationCommand = null;
		if (changed) {
			// Slice 4 — restore via reducer. setNavigation auto-restores discovery
			// for non-'none' / non-'node' kinds; the reducer's selectionStore
			// sets the mirrored discovery from the saved nav shape.
			this.selection.setNavigation(this.#pendingNavigationSelectionBefore);
			this.#clearPendingNavigationSnapshot();
		}
		if (message) this.setStatusMessage(message);
		return changed;
	}

	createPendingNavigationNodeAt(
		roomId: MuseumRoomId,
		floorWorld: Vec3,
		cameraForwardWorld: Vec3
	) {
		const pending = this.pendingNavigationCommand;
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			pending?.kind !== 'place-camera' ||
			!isFiniteVec3(floorWorld) ||
			!isFiniteVec3(cameraForwardWorld)
		) {
			return null;
		}

		let forwardX = cameraForwardWorld[0];
		let forwardZ = cameraForwardWorld[2];
		let forwardLength = Math.hypot(forwardX, forwardZ);
		if (forwardLength <= 1e-6) {
			const origin = roomPoint(roomId, [0, 0, 0]);
			const fallback = roomPoint(roomId, [0, 0, -1]);
			forwardX = fallback[0] - origin[0];
			forwardZ = fallback[2] - origin[2];
			forwardLength = Math.hypot(forwardX, forwardZ);
		}
		forwardX /= forwardLength;
		forwardZ /= forwardLength;

		let number = 1;
		const nodeIds = new Set(this.document.navigationNodes.map((node) => node.id));
		const nodeLabels = new Set(
			this.document.navigationNodes.map((node) => node.label)
		);
		while (
			nodeIds.has(`camera-node-${number}`) ||
			nodeLabels.has(`Camera Node ${number}`)
		) {
			number += 1;
		}
		const nodeId = `camera-node-${number}`;
		const eyeWorld: Vec3 = [
			floorWorld[0],
			floorWorld[1] + CAMERA_NODE_CREATION_DEFAULTS.eyeHeight,
			floorWorld[2]
		];
		const targetWorld: Vec3 = [
			floorWorld[0] + forwardX * CAMERA_NODE_CREATION_DEFAULTS.targetDistance,
			floorWorld[1] + CAMERA_NODE_CREATION_DEFAULTS.targetHeight,
			floorWorld[2] + forwardZ * CAMERA_NODE_CREATION_DEFAULTS.targetDistance
		];
		const node: SceneNavigationNode = {
			id: nodeId,
			roomId,
			label: `Camera Node ${number}`,
			position: roomLocalPoint(roomId, eyeWorld),
			cameraTarget: roomLocalPoint(roomId, targetWorld),
			fov: CAMERA_NODE_CREATION_DEFAULTS.fov,
			connectedNodeIds: []
		};
		this.pendingNavigationCommand = { kind: 'connect-pending-node', node };
		this.selection.setNavigation({
			kind: 'node',
			nodeId,
			handle: 'position'
		});
		this.setStatusMessage('Adjust camera pose, then choose an existing node');
		return nodeId;
	}

	connectPendingNavigationNode(destinationNodeId: string) {
		const pending = this.pendingNavigationCommand;
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			(pending?.kind !== 'connect-existing' &&
				pending?.kind !== 'connect-pending-node')
		) {
			return false;
		}
		if (pending.kind === 'connect-pending-node') {
			const destination = this.document.navigationNodes.find(
				(node) => node.id === destinationNodeId
			);
			if (!destination) {
				this.setStatusMessage('Destination camera node is unavailable');
				return false;
			}
			const node = pending.node;
			const connectionId = reserveEntityId(
				`${destination.id}-${node.id}`,
				new Set(this.document.connections.map((connection) => connection.id))
			);
			if (!this.beginDocumentTransaction()) return false;
			const committedNode: SceneNavigationNode = {
				...node,
				position: [...node.position],
				cameraTarget: [...node.cameraTarget],
				connectedNodeIds: [destination.id]
			};
			this.document.navigationNodes.push(committedNode);
			this.#appendStraightConnection(destination, committedNode, connectionId);
			if (!this.commitDocumentTransaction()) return false;

			this.pendingNavigationCommand = null;
			this.#clearPendingNavigationSnapshot();
			this.selection.setNavigation({
				kind: 'connection',
				connectionId,
				direction: 'forward'
			});
			this.selectionActions.expandActiveCameraDirection('forward');
			if (this.currentWorkspace === 'camera') {
				this.#syncCameraTimelineForConnection(connectionId, 'forward', 0);
				this.#showCameraTimelineConnectionPose(connectionId, 'forward', 0);
			}
			this.setStatusMessage(`Added ${node.label} and its first connection`);
			return true;
		}
		return this.connectNavigationNodes(pending.sourceNodeId, destinationNodeId);
	}

	/** Commit one standalone undirected edge and symmetric adjacency transaction. */
	connectNavigationNodes(sourceNodeId: string, destinationNodeId: string) {
		if (this.isDocumentMutationBlocked) {
			this.setStatusMessage('Camera graph changes are blocked during active playback');
			return false;
		}
		if (this.isEditorInteractionActive || this.isDocumentTransactionActive) {
			this.setStatusMessage('Finish the active editor interaction before connecting camera nodes');
			return false;
		}
		if (
			this.pendingNavigationCommand &&
			(this.pendingNavigationCommand.kind !== 'connect-existing' ||
				this.pendingNavigationCommand.sourceNodeId !== sourceNodeId)
		) {
			this.setStatusMessage('Finish or cancel the current camera command first');
			return false;
		}
		const connectionPlan = runOrFail(this.session, () =>
			validateConnectionCreation(this.document, sourceNodeId, destinationNodeId)
		);
		if (!connectionPlan) return false;
		const { sourceNode: source, destinationNode: destination } = connectionPlan;
		const connectionId = reserveEntityId(
			`${source.id}-${destination.id}`,
			new Set(this.document.connections.map((connection) => connection.id))
		);
		if (!this.beginDocumentTransaction()) return false;
		this.#appendStraightConnection(source, destination, connectionId);
		if (!this.commitDocumentTransaction()) return false;

		if (this.pendingNavigationCommand?.kind === 'connect-existing') {
			this.pendingNavigationCommand = null;
			this.#clearPendingNavigationSnapshot();
		}
		this.navigationSelection = { kind: 'connection', connectionId };
		this.activeCameraConnectionId = connectionId;
		this.activeCameraDirection = 'forward';
		this.selectionActions.expandActiveCameraDirection('forward');
		if (this.currentWorkspace === 'camera') {
			this.#syncCameraTimelineForConnection(connectionId, 'forward', 0);
			this.#showCameraTimelineConnectionPose(connectionId, 'forward', 0);
		}
		this.setStatusMessage('Connected camera nodes');
		return true;
	}

	#appendStraightConnection(
		from: SceneNavigationNode,
		to: SceneNavigationNode,
		connectionId: string
	) {
		if (!from.connectedNodeIds.includes(to.id)) from.connectedNodeIds.push(to.id);
		if (!to.connectedNodeIds.includes(from.id)) to.connectedNodeIds.push(from.id);
		const connection: SceneConnection = {
			id: connectionId,
			fromNodeId: from.id,
			toNodeId: to.id,
			clearance: CAMERA_NODE_CREATION_DEFAULTS.clearance,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		};
		this.document.connections.push(connection);
		return connection;
	}

	/** Rewrite one complete reciprocal guided cycle without creating graph edges. */
	setGuidedTourOrder(nodeIds: readonly string[]) {
		if (!this.#canEditGuidedTour()) return false;
		const orderPlan = runOrFail(this.session, () =>
			validateGuidedTourOrder(this.document, nodeIds)
		);
		if (!orderPlan) return false;
		const committed = this.#applyGuidedTourOrder(orderPlan.nodeIds);
		if (committed) this.setStatusMessage('Updated guided tour order');
		return committed;
	}

	/** Insert one free camera node into an existing guided gap. */
	insertNodeIntoGuidedTour(nodeId: string, index: number) {
		if (!this.#canEditGuidedTour()) return false;
		const insertionPlan = runOrFail(this.session, () =>
			validateGuidedTourInsertion(this.document, nodeId, index)
		);
		if (!insertionPlan) return false;
		const node = this.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		const committed = this.#applyGuidedTourOrder(insertionPlan.nodeIds);
		if (committed) this.setStatusMessage(`Added ${node.label} to the guided tour`);
		return committed;
	}

	/** Remove one non-start node from the guided cycle while retaining graph topology. */
	removeNodeFromGuidedTour(nodeId: string) {
		if (!this.#canEditGuidedTour()) return false;
		const removalPlan = runOrFail(this.session, () =>
			validateGuidedTourRemoval(this.document, nodeId)
		);
		if (!removalPlan) return false;
		const node = this.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		const committed = this.#applyGuidedTourOrder(removalPlan.nodeIds);
		if (committed) this.setStatusMessage(`Removed ${node.label} from the guided tour`);
		return committed;
	}

	/**
	 * Phase 3.5 — move an existing node onto one guided timeline edge. The
	 * reciprocal cycle rewrite and optional single straight edge commit once.
	 */
	timelineDragConnectNode(
		nodeId: string,
		gapFromNodeId: string,
		gapToNodeId: string
	) {
		if (!this.#canEditGuidedTour()) return false;
		const dropPlan = runOrFail(this.session, () =>
			validateTimelineGuidedTourDrop(this.document, nodeId, gapFromNodeId, gapToNodeId)
		);
		if (!dropPlan) return false;

		const missing = dropPlan.missingConnection;
		const connectionId = missing
			? reserveEntityId(
					`${missing.fromNodeId}-${missing.toNodeId}`,
					new Set(this.document.connections.map((connection) => connection.id))
			  )
			: this.document.connections.find(
					(connection) =>
						(connection.fromNodeId === dropPlan.focusConnection.fromNodeId &&
							connection.toNodeId === dropPlan.focusConnection.toNodeId) ||
						(connection.fromNodeId === dropPlan.focusConnection.toNodeId &&
							connection.toNodeId === dropPlan.focusConnection.fromNodeId)
			  )?.id;
		if (!connectionId) {
			this.setStatusMessage('The guided connection selected for fine-tuning is unavailable');
			return false;
		}

		if (!this.beginDocumentTransaction()) return false;
		if (missing) {
			const from = this.document.navigationNodes.find(
				(node) => node.id === missing.fromNodeId
			);
			const to = this.document.navigationNodes.find(
				(node) => node.id === missing.toNodeId
			);
			if (!from || !to) {
				this.cancelDocumentTransaction();
				this.setStatusMessage('The timeline drag-connect endpoints became unavailable');
				return false;
			}
			this.#appendStraightConnection(from, to, connectionId);
		}
		this.#rewriteGuidedTourOrder(dropPlan.nodeIds);
		if (!this.commitDocumentTransaction()) return false;

		const connection = this.document.connections.find(
			(candidate) => candidate.id === connectionId
		)!;
		const direction: CameraConnectionDirection =
			connection.fromNodeId === dropPlan.focusConnection.fromNodeId &&
			connection.toNodeId === dropPlan.focusConnection.toNodeId
				? 'forward'
				: 'reverse';
		this.selectionActions.selectCameraConnectionDirection(connection.id, direction);
		const node = this.document.navigationNodes.find((candidate) => candidate.id === nodeId)!;
		this.setStatusMessage(
			missing
				? `Added ${node.label} to the guided tour with one straight connection`
				: `Moved ${node.label} in the guided tour`
		);
		return true;
	}

	#applyGuidedTourOrder(nodeIds: readonly string[]) {
		if (!this.beginDocumentTransaction()) return false;
		this.#rewriteGuidedTourOrder(nodeIds);
		return this.commitDocumentTransaction();
	}

	#rewriteGuidedTourOrder(nodeIds: readonly string[]) {
		const guidedIndexById = new Map(
			nodeIds.map((nodeId, index) => [nodeId, index])
		);
		for (const node of this.document.navigationNodes) {
			const index = guidedIndexById.get(node.id);
			if (index === undefined) {
				delete node.nextNodeId;
				delete node.previousNodeId;
				continue;
			}
			node.previousNodeId = nodeIds[(index - 1 + nodeIds.length) % nodeIds.length]!;
			node.nextNodeId = nodeIds[(index + 1) % nodeIds.length]!;
		}
	}

	#canEditGuidedTour() {
		if (this.isDocumentMutationBlocked) {
			this.setStatusMessage('Cannot edit guided order during active camera playback');
			return false;
		}
		if (this.isEditorInteractionActive || this.isDocumentTransactionActive) {
			this.setStatusMessage(
				'Finish the active editor interaction before editing guided order'
			);
			return false;
		}
		if (this.pendingNavigationCommand) {
			this.setStatusMessage('Finish or cancel the current camera command first');
			return false;
		}
		return true;
	}

	/** Delete one non-guided, non-bridge edge and both directional view tracks. */
	deleteConnection(connectionId: string) {
		if (!this.#canRunTopologyDeletion('connection')) return false;
		const deletionPlan = runOrFail(this.session, () =>
			validateConnectionDeletion(this.document, connectionId)
		);
		if (!deletionPlan) return false;
		const connection = deletionPlan.connection;
		if (
			!this.#releasePausedPreviewForTopology(
				new Set(),
				new Set([connection.id])
			)
		) {
			return false;
		}

		if (!this.beginDocumentTransaction()) return false;
		this.document.connections = this.document.connections.filter(
			(candidate) => candidate.id !== connection.id
		);
		for (const node of this.document.navigationNodes) {
			if (node.id === connection.fromNodeId) {
				node.connectedNodeIds = node.connectedNodeIds.filter(
					(id) => id !== connection.toNodeId
				);
			} else if (node.id === connection.toNodeId) {
				node.connectedNodeIds = node.connectedNodeIds.filter(
					(id) => id !== connection.fromNodeId
				);
			}
		}
		if (!this.commitDocumentTransaction()) return false;
		this.#clearDeletedConnectionSessionState(new Set([connection.id]));
		this.setStatusMessage(`Deleted camera connection ${connection.id}`);
		return true;
	}

	/** Delete one free node, or splice one guided node across an existing direct edge. */
	deleteNavigationNode(nodeId: string) {
		if (!this.#canRunTopologyDeletion('node')) return false;
		const nodePlan = runOrFail(this.session, () =>
			validateNavigationNodeDeletion(this.document, nodeId)
		);
		if (!nodePlan) return false;
		const incidentConnectionIds = new Set(nodePlan.incidentConnectionIds);
		if (
			!this.#releasePausedPreviewForTopology(
				new Set([nodePlan.node.id]),
				incidentConnectionIds
			)
		) {
			return false;
		}

		if (!this.beginDocumentTransaction()) return false;
		if (nodePlan.predecessorNodeId && nodePlan.successorNodeId) {
			const predecessor = this.document.navigationNodes.find(
				(node) => node.id === nodePlan.predecessorNodeId
			);
			const successor = this.document.navigationNodes.find(
				(node) => node.id === nodePlan.successorNodeId
			);
			if (!predecessor || !successor) {
				this.cancelDocumentTransaction();
				this.setStatusMessage('The guided deletion plan became unavailable');
				return false;
			}
			predecessor.nextNodeId = successor.id;
			successor.previousNodeId = predecessor.id;
		}
		this.document.navigationNodes = this.document.navigationNodes
			.filter((node) => node.id !== nodePlan.node.id)
			.map((node) => ({
				...node,
				connectedNodeIds: node.connectedNodeIds.filter(
					(connectedNodeId) => connectedNodeId !== nodePlan.node.id
				)
			}));
		this.document.connections = this.document.connections.filter(
			(connection) => !incidentConnectionIds.has(connection.id)
		);
		if (!this.commitDocumentTransaction()) return false;
		this.#clearDeletedConnectionSessionState(incidentConnectionIds);
		this.setStatusMessage(`Deleted camera node ${nodePlan.node.label}`);
		return true;
	}

	#canRunTopologyDeletion(entity: 'node' | 'connection') {
		if (this.isDocumentMutationBlocked) {
			this.setStatusMessage(
				`Cannot delete a camera ${entity} during active camera playback`
			);
			return false;
		}
		if (this.isEditorInteractionActive || this.isDocumentTransactionActive) {
			this.setStatusMessage(
				`Cannot delete a camera ${entity} while an editor interaction is active`
			);
			return false;
		}
		if (this.pendingNavigationCommand) {
			this.setStatusMessage('Finish or cancel the current camera command first');
			return false;
		}
		return true;
	}

	#releasePausedPreviewForTopology(
		nodeIds: ReadonlySet<string>,
		connectionIds: ReadonlySet<string>
	) {
		const preview = this.cameraPreview;
		if (!preview) return true;
		let touchesDeletedTopology = false;
		if (preview.kind === 'node') {
			touchesDeletedTopology = nodeIds.has(preview.nodeId);
		} else if (preview.kind === 'connection') {
			touchesDeletedTopology =
				connectionIds.has(preview.connectionId) ||
				nodeIds.has(preview.fromNodeId) ||
				nodeIds.has(preview.toNodeId);
		} else if (preview.kind === 'transition') {
			touchesDeletedTopology =
				nodeIds.has(preview.fromNodeId) || nodeIds.has(preview.toNodeId);
			const captured = this.previewController.getCapturedRoute(preview.runId);
			if (captured) {
				touchesDeletedTopology ||=
					captured.nodeIds.some((id) => nodeIds.has(id)) ||
					captured.edges.some((edge) => connectionIds.has(edge.connectionId));
			}
		} else {
			const timeline = this.getCameraTimeline();
			touchesDeletedTopology = Boolean(
				timeline &&
					(timeline.nodeBoundaries.some((boundary) => nodeIds.has(boundary.nodeId)) ||
						timeline.edges.some((edge) => connectionIds.has(edge.connectionId)))
			);
		}
		if (!touchesDeletedTopology) return true;
		if (this.stopCameraPreview()) return true;
		this.setStatusMessage('Stop the camera preview before deleting its topology');
		return false;
	}

	#clearDeletedConnectionSessionState(connectionIds: ReadonlySet<string>) {
		if (
			this.activeCameraConnectionId &&
			connectionIds.has(this.activeCameraConnectionId)
		) {
			this.activeCameraConnectionId = null;
			this.activeCameraDirection = 'forward';
		}
		this.session.treeExpandedCameraConnectionIds =
			this.session.treeExpandedCameraConnectionIds.filter((id) => !connectionIds.has(id));
		this.session.treeExpandedCameraDirectionKeys =
			this.session.treeExpandedCameraDirectionKeys.filter((key) => {
				const separatorIndex = key.lastIndexOf(CAMERA_DIRECTION_TREE_KEY_SEPARATOR);
				const connectionId = separatorIndex < 0 ? key : key.slice(0, separatorIndex);
				return !connectionIds.has(connectionId);
			});
	}

	#clearPendingNavigationSnapshot() {
		this.#pendingNavigationSelectionBefore = { kind: 'none' };
		this.#pendingNavigationActiveConnectionBefore = null;
		this.#pendingNavigationDirectionBefore = 'forward';
		this.#pendingNavigationPlacementIdsBefore = [];
		this.#pendingNavigationClusterBefore = null;
	}

	isPlacementSelectable(id: string) {
		if (!this.selectedRoomId) return false;
		return this.document.objects.some(
			(object) => object.id === id && object.roomId === this.selectedRoomId
		);
	}

	cyclePlacement(ids: string[]) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const selectableIds = ids.filter((id) => this.isPlacementSelectable(id));
		const next = nextPlacementCycleId(this.selectedPlacementId, selectableIds);
		if (next === undefined) return false;
		return this.selectionActions.selectPlacement(next);
	}

	createCluster(name?: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return null;
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
		this.document.clusters ??= [];
		this.document.clusters.push(cluster);
		if (!this.commitDocumentTransaction()) return null;
		this.selectionActions.selectCluster(cluster.id);
		this.setStatusMessage(`Grouped ${memberIds.length} objects`);
		return cluster.id;
	}

	renameCluster(id: string, name: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const cluster = this.clusters.find((candidate) => candidate.id === id);
		const nextName = name.trim();
		if (!cluster || !nextName || cluster.name === nextName) return false;
		if (!this.beginDocumentTransaction()) return false;
		cluster.name = nextName;
		return this.commitDocumentTransaction();
	}

	addMemberToCluster(clusterId: string, memberId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
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
		if (committed && this.selectedClusterId === clusterId) this.selectionActions.selectCluster(clusterId);
		return committed;
	}

	removeMemberFromCluster(clusterId: string, memberId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
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
			this.selectionActions.selectCluster(clusterId);
		} else if (wasSelectedCluster) {
			this.selectedClusterId = null;
			this.selectionActions.selectPlacements(cluster.memberIds);
		}
		return true;
	}

	ungroupCluster(id = this.selectedClusterId) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (!id) return false;
		const index = this.clusters.findIndex((cluster) => cluster.id === id);
		if (index === -1 || !this.beginDocumentTransaction()) return false;
		const memberIds = [...this.clusters[index]!.memberIds];
		const wasSelected = this.selectedClusterId === id;
		this.document.clusters?.splice(index, 1);
		const committed = this.commitDocumentTransaction();
		if (committed && wasSelected) this.selectionActions.selectPlacements(memberIds);
		return committed;
	}

	duplicateSelection() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
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
		this.selectionActions.selectPlacements([...copyIds.slice(1), copyIds[0]!]);
		this.requestPlacementFrame(copyIds);
		this.setStatusMessage(`Duplicated ${copies.length} object${copies.length === 1 ? '' : 's'}`);
		return true;
	}

	deletePlacements(ids: string[]) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
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
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const ids = [...this.selectedPlacementIds];
		if (ids.length === 0) {
			this.setStatusMessage('Select one or more placements to delete');
			return false;
		}
		if (!this.deletePlacements(ids)) return false;
		this.selectionActions.deselect();
		this.setStatusMessage(`Deleted ${ids.length} object${ids.length === 1 ? '' : 's'}`);
		return true;
	}

	deletePlacement(id: string) {
		return this.deletePlacements([id]);
	}

	beginDocumentTransaction() {
		if (this.isDocumentMutationBlocked || this.historyController.isDocumentUndoBlocked) {
			return false;
		}
		return this.historyController.beginDocument();
	}

	beginCameraFramingTransaction() {
		if (
			this.isCameraFramingMutationBlocked ||
			this.historyController.isDocumentUndoBlocked
		) {
			return false;
		}
		return this.historyController.beginFraming();
	}

	updatePlacementTransform(id: string, transform: PlacementTransform) {
		if (this.isDocumentMutationBlocked) return false;
		const placement = this.document.objects.find((object) => object.id === id);
		if (!placement || !this.isPlacementSelectable(id)) return false;
		return writePlacementTransform(placement, transform);
	}

	commitPlacementTransform(id: string, transform: PlacementTransform) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (!this.beginDocumentTransaction()) return false;
		if (!this.updatePlacementTransform(id, transform)) {
			this.cancelDocumentTransaction();
			return false;
		}
		return this.commitDocumentTransaction();
	}

	commitDocumentTransaction() {
		if (
			this.isDocumentMutationBlocked &&
			!this.historyController.isFramingTransactionActive
		) {
			return false;
		}
		if (!this.historyController.isDocumentUndoBlocked) return false;
		const result = this.historyController.commit(this.document);
		if (result.error) {
			this.setStatusMessage(result.error.message);
		}
		return result.changed;
	}

	cancelDocumentTransaction() {
		if (!this.historyController.isDocumentUndoBlocked) return false;
		// Cancel the framing drag first so a refused canceler leaves the transaction intact for retry.
		if (!this.#cancelDirectFramingDragOrFail()) {
			this.setStatusMessage('Cancel the framing drag before aborting this transaction');
			return false;
		}
		return this.historyController.cancel();
	}

	/** Replace the authoring document only after any live editor ownership is released. */
	importDocument(document: MuseumSceneDocument) {
		const validation = validateSceneDocument(document);
		if (!validation.success) {
			this.setStatusMessage(validation.issues[0]?.message ?? 'Scene document validation failed');
			return false;
		}
		if (!this.#prepareDocumentReplacement()) return false;

		this.cancelAssetPlacement();
		this.cancelPendingNavigation();
		this.cancelPendingFrame();
		this.selectionActions.clearPlacementSelection();
		this.navigationSelection = null;
		this.selectedRoomId = null;
		this.cameraFocusKind = null;
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		this.documentStore.replace(validation.document);
		this.documentStore.setBaseline(validation.canonicalJson);
		this.historyController.clear();
		return true;
	}

	resetToCheckedInDocument() {
		return this.importDocument(museumSceneDocument);
	}

	#prepareDocumentReplacement() {
		if (this.viewKeyframeProgressDrag) this.cancelViewKeyframeProgressDrag();
		if (!this.#cancelDirectFramingDragOrFail()) return false;
		if (this.cameraPreview && !this.stopCameraPreview()) return false;
		if (this.transformInteractionActive && !this.#cancelTransform?.()) return false;
		if (this.directPathInteractionActive && !this.#cancelDirectPathDrag?.()) return false;
		if (this.historyController.isDocumentUndoBlocked) this.cancelDocumentTransaction();
		return true;
	}

	undo() {
		if (this.pendingNavigationCommand) {
			return this.cancelPendingNavigation('Camera placement cancelled');
		}
		if (this.isDocumentUndoBlocked || this.historyController.pastDepth === 0) return false;
		this.cancelPendingFrame();
		this.cancelPendingNavigation();
		const ok = this.historyController.undo();
		if (ok) this.#pruneInvalidCameraPreview();
		return ok;
	}

	redo() {
		if (this.pendingNavigationCommand) {
			return this.cancelPendingNavigation('Camera placement cancelled');
		}
		if (this.isDocumentUndoBlocked || this.historyController.futureDepth === 0) return false;
		this.cancelPendingFrame();
		this.cancelPendingNavigation();
		const ok = this.historyController.redo();
		if (ok) this.#pruneInvalidCameraPreview();
		return ok;
	}

	// Sub-store replace is owned by EditorDocumentStore / HistoryController
	// (Slice 3.4–3.6). Composition-root callers go through history or
	// documentStore.replace directly; the private #replaceDocument shim is gone.

	#reconcileSelection() {
		const navigationSelection = this.navigationSelection;
		if (navigationSelection?.kind === 'node') {
			if (
				!this.document.navigationNodes.some(
					(node) => node.id === navigationSelection.nodeId
				)
			) {
				this.navigationSelection = null;
			}
		} else if (navigationSelection?.kind === 'connection') {
			if (
				!this.document.connections.some(
					(connection) => connection.id === navigationSelection.connectionId
				)
			) {
				this.navigationSelection = null;
			}
		} else if (navigationSelection?.kind === 'anchor') {
			const connection = this.document.connections.find(
				(candidate) => candidate.id === navigationSelection.connectionId
			);
			if (!connection) {
				this.navigationSelection = null;
			} else if (
				!connection.positionPath.anchors.some(
					(anchor) => anchor.id === navigationSelection.anchorId
				)
			) {
				this.navigationSelection = {
					kind: 'connection',
					connectionId: connection.id
				};
			}
		} else if (navigationSelection?.kind === 'view-keyframe') {
			const connection = this.document.connections.find(
				(candidate) => candidate.id === navigationSelection.connectionId
			);
			if (!connection) {
				this.navigationSelection = null;
			} else if (
				!connection.viewTracks?.[navigationSelection.direction].some(
					(keyframe) => keyframe.id === navigationSelection.keyframeId
				)
			) {
				this.navigationSelection = {
					kind: 'connection',
					connectionId: connection.id
				};
			}
		}
		if (this.selectedClusterId) {
			const cluster = this.clusters.find(
				(candidate) => candidate.id === this.selectedClusterId
			);
			if (!cluster || cluster.roomId !== this.selectedRoomId) {
				this.selectionActions.clearPlacementSelection();
				return;
			}
			// Cluster member ids come from the document via the facade getter —
			// no write needed (writing would exit cluster mode).
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

	registerPlacementRoot(id: string, root: Object3D) {
		this.roots.registerPlacementRoot(id, root);
	}

	unregisterPlacementRoot(id: string, root: Object3D) {
		this.roots.unregisterPlacementRoot(id, root);
	}

	notifyPlacementRootChanged(id: string) {
		this.roots.notifyPlacementRootChanged(id);
	}

	getPlacementRoot(id: string): Object3D | undefined {
		void this.roots.version;
		return this.roots.getPlacementRoot(id);
	}

	getPlacementRoots(ids = this.selectedPlacementIds): Object3D[] {
		void this.roots.version;
		return ids
			.map((id) => this.roots.getPlacementRoot(id))
			.filter((root): root is Object3D => root != null);
	}

	registerCameraHelperRoot(
		nodeId: string,
		handle: EditorCameraHandle,
		root: Object3D
	) {
		this.roots.registerCameraHelperRoot(nodeId, handle, root);
	}

	unregisterCameraHelperRoot(
		nodeId: string,
		handle: EditorCameraHandle,
		root: Object3D
	) {
		this.roots.unregisterCameraHelperRoot(nodeId, handle, root);
	}

	getCameraHelperRoot(
		nodeId: string,
		handle: EditorCameraHandle
	): Object3D | undefined {
		void this.roots.version;
		return this.roots.getCameraHelperRoot(nodeId, handle);
	}

	getSelectedCameraHelperRoot(): Object3D | undefined {
		const selection = this.cameraSelection;
		return selection
			? this.getCameraHelperRoot(selection.nodeId, selection.handle)
			: undefined;
	}

	registerAnchorHelperRoot(connectionId: string, anchorId: string, root: Object3D) {
		this.roots.registerAnchorHelperRoot(connectionId, anchorId, root);
	}

	unregisterAnchorHelperRoot(connectionId: string, anchorId: string, root: Object3D) {
		this.roots.unregisterAnchorHelperRoot(connectionId, anchorId, root);
	}

	getAnchorHelperRoot(connectionId: string, anchorId: string): Object3D | undefined {
		void this.roots.version;
		return this.roots.getAnchorHelperRoot(connectionId, anchorId);
	}

	getSelectedAnchorHelperRoot(): Object3D | undefined {
		const selection = this.navigationSelection;
		return selection?.kind === 'anchor'
			? this.getAnchorHelperRoot(selection.connectionId, selection.anchorId)
			: undefined;
	}

	registerViewKeyframeTargetHelperRoot(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string,
		root: Object3D
	) {
		this.roots.registerViewKeyframeTargetHelperRoot(
			connectionId,
			direction,
			keyframeId,
			root
		);
	}

	unregisterViewKeyframeTargetHelperRoot(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string,
		root: Object3D
	) {
		this.roots.unregisterViewKeyframeTargetHelperRoot(
			connectionId,
			direction,
			keyframeId,
			root
		);
	}

	getViewKeyframeTargetHelperRoot(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	): Object3D | undefined {
		void this.roots.version;
		return this.roots.getViewKeyframeTargetHelperRoot(
			connectionId,
			direction,
			keyframeId
		);
	}

	getSelectedViewKeyframeTargetHelperRoot(): Object3D | undefined {
		const selection = this.navigationSelection;
		return selection?.kind === 'view-keyframe'
			? this.getViewKeyframeTargetHelperRoot(
					selection.connectionId,
					selection.direction,
					selection.keyframeId
				)
			: undefined;
	}

	/** Phase 3.7: write connection timing (duration + easing) for one direction. */
	setConnectionTiming(
		connectionId: string,
		direction: CameraConnectionDirection,
		timing: SceneConnectionTiming | null
	): boolean {
		if (this.isDocumentMutationBlocked) return false;
		const connection = this.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) {
			this.setStatusMessage(`Unknown connection: ${connectionId}`);
			return false;
		}
		if (timing === null && !connection.timing) return false;
		if (!this.beginDocumentTransaction()) return false;
		if (timing === null) {
			const current = connection.timing;
			if (!current) {
				return this.commitDocumentTransaction();
			}
			delete current[direction];
			if (
				current.forward === undefined &&
				current.reverse === undefined
			) {
				delete connection.timing;
			}
		} else {
			const validated = validateSceneConnectionTiming(timing);
			if (validated === null) {
				this.cancelDocumentTransaction();
				const reason = cameraSceneConnectionTimingFailureReason(timing) ?? 'unknown';
				this.setStatusMessage(`Invalid connection timing: ${reason}`);
				return false;
			}
			connection.timing = connection.timing ?? {};
			connection.timing[direction] = validated;
		}
		return this.commitDocumentTransaction();
	}

	/** Phase 3.7: write a destination hold in seconds; pass `null` to clear. */
	setNodeHoldSeconds(nodeId: string, holdSeconds: number | null): boolean {
		if (this.isDocumentMutationBlocked) return false;
		const node = this.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		);
		if (!node) {
			this.setStatusMessage(`Unknown navigation node: ${nodeId}`);
			return false;
		}
		if (holdSeconds === null && node.holdSeconds === undefined) return false;
		if (!this.beginDocumentTransaction()) return false;
		if (holdSeconds === null) {
			delete node.holdSeconds;
		} else {
			if (!Number.isFinite(holdSeconds) || holdSeconds < 0) {
				this.cancelDocumentTransaction();
				this.setStatusMessage('Hold seconds must be a finite non-negative number');
				return false;
			}
			node.holdSeconds = holdSeconds;
		}
		return this.commitDocumentTransaction();
	}

	/** Phase 3.7: write authored hold + easing for one view keyframe, or `null` to clear each field individually. */
	setViewKeyframeTiming(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string,
		holdSeconds: number | null,
		easing: CameraEasing | null
	): boolean {
		if (this.isDocumentMutationBlocked) return false;
		const connection = this.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection?.viewTracks) {
			this.setStatusMessage(`Unknown view keyframe: ${connectionId}:${keyframeId}`);
			return false;
		}
		const track = connection.viewTracks[direction];
		const keyframe = track.find((candidate) => candidate.id === keyframeId);
		if (!keyframe) {
			this.setStatusMessage(`Unknown view keyframe: ${connectionId}:${keyframeId}`);
			return false;
		}
		const noHoldToWrite = holdSeconds !== null && keyframe.holdSeconds === holdSeconds;
		const noEasingToWrite = easing !== null && keyframe.easing === easing;
		if (noHoldToWrite && noEasingToWrite) return false;
		if (
			holdSeconds === null &&
			easing === null &&
			keyframe.holdSeconds === undefined &&
			keyframe.easing === undefined
		) {
			return false;
		}
		if (!this.beginDocumentTransaction()) return false;
		if (holdSeconds !== null) {
			if (!Number.isFinite(holdSeconds) || holdSeconds < 0) {
				this.cancelDocumentTransaction();
				this.setStatusMessage(
					'View keyframe holdSeconds must be a finite non-negative number'
				);
				return false;
			}
			keyframe.holdSeconds = holdSeconds;
		} else {
			delete keyframe.holdSeconds;
		}
		if (easing !== null) {
			if (!MUSEUM_CAMERA_EASING.includes(easing)) {
				this.cancelDocumentTransaction();
				this.setStatusMessage(
					`Easing must be one of ${MUSEUM_CAMERA_EASING.join(', ')}`
				);
				return false;
			}
			keyframe.easing = easing;
		} else {
			delete keyframe.easing;
		}
		return this.commitDocumentTransaction();
	}
}

/** Phase 3.7: validate a timing payload; returns the cloned object or `null` on failure. */
export function validateSceneConnectionTiming(
	timing: SceneConnectionTiming
): SceneConnectionTiming | null {
	if (
		timing.durationSeconds !== undefined &&
		(!Number.isFinite(timing.durationSeconds) || timing.durationSeconds <= 0)
	) {
		return null;
	}
	if (timing.easing !== undefined && !MUSEUM_CAMERA_EASING.includes(timing.easing)) {
		return null;
	}
	return { ...timing };
}
export function createMuseumEditorStore() {
	return new MuseumEditorStore();
}

export type { MuseumSceneDocument, RuntimeMuseumScene };
