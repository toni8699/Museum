import {
	getNode,
	museumSceneDocument,
	type MuseumSceneDocument,
	type RuntimeMuseumScene,
	type SceneCameraViewKeyframe,
	type SceneObjectCluster
} from '$lib/content/scene';
import {
	serializeSceneDocument,
	validateSceneDocument,
	type SceneDocumentValidationResult
} from '$lib/content/scene-codec';
import { roomPoint } from '$lib/content/rooms';
import type { MuseumStateStore } from '$lib/state/museum-state.svelte';
import {
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion
} from '$lib/museum/navigation/camera-motion';
import {
	MUSEUM_CAMERA_EASING,
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
import {
	placementTransformFromDocument,
	type EditorTransformMode,
	type PlacementTransform
} from './editor-transform';
import {
	seedEmptyReverseViewTrack,
	syncReverseViewTrackFromForward,
	findSceneCameraViewKeyframe,
	getSceneCameraViewKeyframeWorldTarget
} from './editor-camera-view';
import {
	cameraTimelineEdgePlayheadAtProgress,
	cameraTimelineProgressAtEdgeProgress,
	type EditorCameraTimeline
} from './editor-camera-timeline';
import { validateCurrentGuidedTourOrder } from './editor-navigation-graph';
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
import { EditorMutationGuards } from './store/mutation-guards.svelte';
import {
	EditorNavigationGraphMutator,
	CAMERA_NODE_CREATION_DEFAULTS,
	validateSceneConnectionTiming,
	type EditorNavigationGraphMutatorHost
} from './store/navigation-graph-mutator.svelte';
import {
	EditorViewKeyframeController,
	type EditorViewKeyframeControllerHost
} from './store/view-keyframe-controller.svelte';
import {
	EditorCameraTimelineController,
	type EditorCameraTimelineControllerHost
} from './store/camera-timeline-controller.svelte';
import {
	EditorPlacementClusterMutator,
	type EditorPlacementClusterMutatorHost
} from './store/placement-cluster-mutator.svelte';
import {
	EditorPathAnchorMutator,
	type EditorPathAnchorMutatorHost
} from './store/path-anchor-mutator.svelte';

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
	viewKeyframeHelperKey,
	CAMERA_DIRECTION_TREE_KEY_SEPARATOR
} from './helpers/scene-keys';

const STATUS_MESSAGE_MS = 2500;

// Phase 9.2 — `CAMERA_NODE_CREATION_DEFAULTS` + `validateSceneConnectionTiming`
// moved to `store/navigation-graph-mutator.svelte.ts`. Re-exported here so the
// pre-9.2 public surface (`museum-editor.svelte` importers) stays stable.
export { CAMERA_NODE_CREATION_DEFAULTS, validateSceneConnectionTiming };

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

/** Bottom-panel frame measurements. Session-only, never serialized. */
export const EDITOR_TIMELINE_COLLAPSED_HEIGHT = 36;
export const EDITOR_TIMELINE_MIN_HEIGHT = 220;
export const EDITOR_TIMELINE_MAX_HEIGHT = 360;
export const EDITOR_TIMELINE_DEFAULT_HEIGHT = 280;

/** Stable `${connectionId}::${direction}` key for Camera workspace tree expansion. */
function cameraDirectionTreeKey(
	connectionId: string,
	direction: CameraConnectionDirection
) {
	return `${connectionId}${CAMERA_DIRECTION_TREE_KEY_SEPARATOR}${direction}`;
}

// Phase 9.5 — `vec3Matches` / `isFiniteVec3` live on path-anchor / view-key
// controllers; no remaining facade callers.

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
			syncCameraTimelineForNode: (id) =>
				self.cameraTimelineController.syncCameraTimelineForNode(id),
			showCameraTimelineNodePose: (id) =>
				self.cameraTimelineController.showCameraTimelineNodePose(id),
			syncCameraTimelineForConnection: (connectionId, direction, playhead) =>
				self.cameraTimelineController.syncCameraTimelineForConnection(
					connectionId,
					direction,
					playhead
				),
			showCameraTimelineConnectionPose: (connectionId, direction, playhead) =>
				self.cameraTimelineController.showCameraTimelineConnectionPose(
					connectionId,
					direction,
					playhead
				)
		};
	}

	#createNavigationGraphMutatorHost(): EditorNavigationGraphMutatorHost {
		const self = this;
		return {
			get isDocumentMutationBlocked() {
				return self.isDocumentMutationBlocked;
			},
			get isEditorInteractionActive() {
				return self.isEditorInteractionActive;
			},
			get isDocumentTransactionActive() {
				return self.isDocumentTransactionActive;
			},
			get document() {
				return self.document;
			},
			get selection() {
				return self.selectionStore;
			},
			get currentWorkspace() {
				return self.currentWorkspace;
			},
			get selectedNavigationNode() {
				return self.selectedNavigationNode;
			},
			get selectedPlacementIds() {
				return self.selectedPlacementIds;
			},
			get selectedClusterId() {
				return self.selectedClusterId;
			},
			get cameraPreview() {
				return self.cameraPreview;
			},
			get pendingNavigationCommand() {
				return self.pendingNavigationCommand;
			},
			set pendingNavigationCommand(value) {
				self.pendingNavigationCommand = value;
			},
			get activeCameraConnectionId() {
				return self.activeCameraConnectionId;
			},
			set activeCameraConnectionId(value) {
				self.activeCameraConnectionId = value;
			},
			get activeCameraDirection() {
				return self.activeCameraDirection;
			},
			set activeCameraDirection(value) {
				self.activeCameraDirection = value;
			},
			get navigationSelection() {
				return self.navigationSelection;
			},
			set navigationSelection(value) {
				self.navigationSelection = value;
			},
			get treeExpandedCameraConnectionIds() {
				return self.treeExpandedCameraConnectionIds;
			},
			set treeExpandedCameraConnectionIds(value) {
				self.treeExpandedCameraConnectionIds = value;
			},
			get treeExpandedCameraDirectionKeys() {
				return self.treeExpandedCameraDirectionKeys;
			},
			set treeExpandedCameraDirectionKeys(value) {
				self.treeExpandedCameraDirectionKeys = value;
			},
			setStatusMessage: (message) => self.setStatusMessage(message),
			setWorkspace: (workspace) => self.setWorkspace(workspace),
			setNavigationHover: (connectionId, anchorId) =>
				self.setNavigationHover(connectionId, anchorId ?? null),
			cancelAssetPlacement: (message) => self.cancelAssetPlacement(message),
			cancelPendingFrame: () => self.cancelPendingFrame(),
			beginDocumentTransaction: () => self.beginDocumentTransaction(),
			commitDocumentTransaction: () => self.commitDocumentTransaction(),
			cancelDocumentTransaction: () => self.cancelDocumentTransaction(),
			getCameraTimeline: () => self.cameraTimelineController.getCameraTimeline(),
			stopCameraPreview: () => self.stopCameraPreview(),
			getCapturedCameraPreviewRoute: (runId) => self.getCapturedCameraPreviewRoute(runId),
			syncCameraTimelineForConnection: (connectionId, direction, playhead) =>
				self.cameraTimelineController.syncCameraTimelineForConnection(
					connectionId,
					direction,
					playhead
				),
			showCameraTimelineConnectionPose: (connectionId, direction, playhead) =>
				self.cameraTimelineController.showCameraTimelineConnectionPose(
					connectionId,
					direction,
					playhead
				)
		};
	}

	#createViewKeyframeControllerHost(): EditorViewKeyframeControllerHost {
		const self = this;
		return {
			get isDocumentMutationBlocked() {
				return self.isDocumentMutationBlocked;
			},
			get isCameraFramingMutationBlocked() {
				return self.isCameraFramingMutationBlocked;
			},
			get isEditorInteractionActive() {
				return self.isEditorInteractionActive;
			},
			get isDocumentTransactionActive() {
				return self.isDocumentTransactionActive;
			},
			get historyDocumentUndoBlocked() {
				return self.historyController.isDocumentUndoBlocked;
			},
			get historyFramingTransactionActive() {
				return self.historyController.isFramingTransactionActive;
			},
			get pendingNavigationCommand() {
				return self.pendingNavigationCommand;
			},
			get document() {
				return self.document;
			},
			get selection() {
				return self.selectionStore;
			},
			get selectedConnection() {
				return self.selectedConnection;
			},
			get selectedAnchor() {
				return self.selectedAnchor;
			},
			get selectedViewKeyframe() {
				return self.selectedViewKeyframe;
			},
			get selectedRoomId() {
				return self.selectedRoomId;
			},
			get cameraPreview() {
				return self.cameraPreview;
			},
			get navigationSelection() {
				return self.navigationSelection;
			},
			set navigationSelection(value) {
				self.navigationSelection = value;
			},
			get viewKeyframeProgressDrag() {
				return self.viewKeyframeProgressDrag;
			},
			set viewKeyframeProgressDrag(value) {
				self.viewKeyframeProgressDrag = value;
			},
			get cameraTimelinePlayhead() {
				return self.cameraTimelinePlayhead;
			},
			set cameraTimelinePlayhead(value) {
				self.cameraTimelinePlayhead = value;
			},
			setStatusMessage: (message) => self.setStatusMessage(message),
			beginDocumentTransaction: () => self.beginDocumentTransaction(),
			beginCameraFramingTransaction: () => self.beginCameraFramingTransaction(),
			commitDocumentTransaction: () => self.commitDocumentTransaction(),
			cancelDocumentTransaction: () => self.cancelDocumentTransaction(),
			seedEmptyReverseForSelectedForwardTrack: () =>
				self.#seedEmptyReverseForSelectedForwardTrack(),
			getCameraTimeline: () => self.cameraTimelineController.getCameraTimeline(),
			getCapturedCameraPreviewRoute: (runId) => self.getCapturedCameraPreviewRoute(runId),
			allocPreviewRunId: () => self.previewController.allocRunId(),
			setCapturedPreviewRoute: (runId, route) =>
				self.previewController.setCapturedRoute(runId, route),
			setCameraPreview: (value) => {
				self.cameraPreview = value;
			},
			setCameraPreviewPlayhead: (progress, runId) =>
				self.setCameraPreviewPlayhead(progress, runId),
			selectCameraTimelineViewKeyframe: (connectionId, direction, keyframeId) =>
				self.cameraTimelineController.selectCameraTimelineViewKeyframe(
					connectionId,
					direction,
					keyframeId
				)
		};
	}

	#createCameraTimelineControllerHost(): EditorCameraTimelineControllerHost {
		const self = this;
		return {
			get isEditorInteractionActive() {
				return self.isEditorInteractionActive;
			},
			get isDocumentTransactionActive() {
				return self.isDocumentTransactionActive;
			},
			get isDocumentMutationBlocked() {
				return self.isDocumentMutationBlocked;
			},
			get pendingNavigationCommand() {
				return self.pendingNavigationCommand;
			},
			get document() {
				return self.document;
			},
			get scene() {
				return self.scene;
			},
			get graph() {
				return self.state.graph;
			},
			get selection() {
				return self.selectionStore;
			},
			get cameraPreview() {
				return self.cameraPreview;
			},
			set cameraPreview(value) {
				self.cameraPreview = value;
			},
			get cameraTimelinePlayhead() {
				return self.cameraTimelinePlayhead;
			},
			set cameraTimelinePlayhead(value) {
				self.cameraTimelinePlayhead = value;
			},
			get activeCameraConnectionId() {
				return self.activeCameraConnectionId;
			},
			get activeCameraDirection() {
				return self.activeCameraDirection;
			},
			get timelineExpanded() {
				return self.timelineExpanded;
			},
			set timelineExpanded(value) {
				self.timelineExpanded = value;
			},
			setStatusMessage: (message) => self.setStatusMessage(message),
			beginDocumentTransaction: () => self.beginDocumentTransaction(),
			commitDocumentTransaction: () => self.commitDocumentTransaction(),
			prepareCameraPreview: () => self.#prepareCameraPreview(),
			allocPreviewRunId: () => self.previewController.allocRunId(),
			setCapturedRoute: (runId, route) =>
				self.previewController.setCapturedRoute(runId, route),
			clearCapturedRoute: () => self.previewController.clearCapturedRoute(),
			get followEnabled() {
				return self.previewController.followEnabled;
			},
			set followEnabled(value) {
				self.previewController.followEnabled = value;
			},
			get recenterVersion() {
				return self.previewController.recenterVersion;
			},
			set recenterVersion(value) {
				self.previewController.recenterVersion = value;
			},
			setCameraPreviewPlayhead: (progress, runId) =>
				self.setCameraPreviewPlayhead(progress, runId),
			getTimeline: () => self.previewController.getTimeline(),
			cancelAssetPlacement: (message) => self.cancelAssetPlacement(message),
			cancelPendingFrame: () => self.cancelPendingFrame(),
			clearCameraFocusRequest: () => self.session.clearCameraFocusRequest()
		};
	}


	#createPlacementClusterMutatorHost(): EditorPlacementClusterMutatorHost {
		const self = this;
		return {
			get isDocumentMutationBlocked() {
				return self.isDocumentMutationBlocked;
			},
			get isEditorInteractionActive() {
				return self.isEditorInteractionActive;
			},
			get document() {
				return self.document;
			},
			get selectedRoomId() {
				return self.selectedRoomId;
			},
			get selectedPlacementIds() {
				return self.selectedPlacementIds;
			},
			get primaryPlacementId() {
				return self.primaryPlacementId;
			},
			get clusters() {
				return self.clusters;
			},
			get selectedClusterId() {
				return self.selectedClusterId;
			},
			set selectedClusterId(value) {
				self.selectedClusterId = value;
			},
			get pendingPlacementAssetId() {
				return self.pendingPlacementAssetId;
			},
			set pendingPlacementAssetId(value) {
				self.pendingPlacementAssetId = value;
			},
			setStatusMessage: (message) => self.setStatusMessage(message),
			setNavigationHover: (connectionId, anchorId) =>
				self.setNavigationHover(connectionId, anchorId ?? null),
			cancelPendingNavigation: (message) => self.cancelPendingNavigation(message),
			requestPlacementFrame: (ids) => self.requestPlacementFrame(ids),
			sessionRequestDropToFloor: () => self.session.requestDropToFloor(),
			beginDocumentTransaction: () => self.beginDocumentTransaction(),
			commitDocumentTransaction: () => self.commitDocumentTransaction(),
			cancelDocumentTransaction: () => self.cancelDocumentTransaction()
		};
	}

	#createPathAnchorMutatorHost(): EditorPathAnchorMutatorHost {
		const self = this;
		return {
			get isDocumentMutationBlocked() {
				return self.isDocumentMutationBlocked;
			},
			get isCameraFramingMutationBlocked() {
				return self.isCameraFramingMutationBlocked;
			},
			get isEditorInteractionActive() {
				return self.isEditorInteractionActive;
			},
			get historyDocumentUndoBlocked() {
				return self.historyController.isDocumentUndoBlocked;
			},
			get historyFramingTransactionActive() {
				return self.historyController.isFramingTransactionActive;
			},
			get document() {
				return self.document;
			},
			get cameraSelection() {
				return self.cameraSelection;
			},
			get selectedNavigationNode() {
				return self.selectedNavigationNode;
			},
			get selectedConnection() {
				return self.selectedConnection;
			},
			get selectedAnchor() {
				return self.selectedAnchor;
			},
			get selectedRoomId() {
				return self.selectedRoomId;
			},
			get pendingNavigationNode() {
				return self.pendingNavigationNode;
			},
			get navigationSelection() {
				return self.navigationSelection;
			},
			set navigationSelection(value) {
				self.navigationSelection = value;
			},
			isPendingNavigationNode: (nodeId) => self.isPendingNavigationNode(nodeId),
			beginDocumentTransaction: () => self.beginDocumentTransaction(),
			beginCameraFramingTransaction: () => self.beginCameraFramingTransaction(),
			commitDocumentTransaction: () => self.commitDocumentTransaction(),
			cancelDocumentTransaction: () => self.cancelDocumentTransaction()
		};
	}

	constructor() {
		const self = this;
		this.mutationGuards = new EditorMutationGuards({
			get cameraPreview() {
				return self.cameraPreview;
			},
			get transformInteractionActive() {
				return self.transformInteractionActive;
			},
			get directPathInteractionActive() {
				return self.directPathInteractionActive;
			},
			get directFramingInteractionActive() {
				return self.directFramingInteractionActive;
			},
			get viewKeyframeProgressDrag() {
				return self.viewKeyframeProgressDrag;
			},
			get historyDocumentUndoBlocked() {
				return self.historyController.isDocumentUndoBlocked;
			}
		});
		this.selectionActions = new EditorSelectionActions(
			this.selectionStore,
			this.#createSelectionHost()
		);
		this.navigationGraphMutator = new EditorNavigationGraphMutator(
			this.selectionActions,
			this.#createNavigationGraphMutatorHost()
		);
		this.viewKeyframeController = new EditorViewKeyframeController(
			this.selectionActions,
			this.#createViewKeyframeControllerHost()
		);
		this.cameraTimelineController = new EditorCameraTimelineController(
			this.selectionActions,
			this.#createCameraTimelineControllerHost()
		);
		this.placementClusterMutator = new EditorPlacementClusterMutator(
			this.selectionActions,
			this.#createPlacementClusterMutatorHost()
		);
		this.pathAnchorMutator = new EditorPathAnchorMutator(
			this.#createPathAnchorMutatorHost()
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

	/**
	 * Phase 9.1 — session owns these slots. Facade getters/setters preserve
	 * `store.X` call sites; no parallel `$state` twins remain.
	 */
	get transformMode(): EditorTransformMode {
		return this.session.transformMode;
	}
	set transformMode(value: EditorTransformMode) {
		this.session.setTransformMode(value);
	}
	get transformGizmoVisible(): boolean {
		return this.session.transformGizmoVisible;
	}
	set transformGizmoVisible(value: boolean) {
		this.session.setTransformGizmoVisible(value);
	}
	get transformSpace(): EditorTransformSpace {
		return this.session.transformSpace;
	}
	set transformSpace(value: EditorTransformSpace) {
		this.session.setTransformSpace(value);
	}
	get cameraFocusVersion(): number {
		return this.session.cameraFocusVersion;
	}
	get cameraFocusKind():
		| 'room'
		| 'placement'
		| 'selection'
		| 'navigation-node'
		| null {
		return this.session.cameraFocusKind;
	}
	get cameraFocusPlacementId(): string | null {
		return this.session.cameraFocusPlacementId;
	}
	get cameraFocusNodeId(): string | null {
		return this.session.cameraFocusNodeId;
	}
	get cameraPanEnabled(): boolean {
		return this.session.cameraPanEnabled;
	}
	set cameraPanEnabled(value: boolean) {
		this.session.cameraPanEnabled = value;
	}
	/** Editor calibration aid; session-only and absent from scene snapshots. */
	get gridVisible(): boolean {
		return this.session.gridVisible;
	}
	set gridVisible(value: boolean) {
		this.session.gridVisible = value;
	}
	/**
	 * Phase 1.1 persistent shell — never enters history, dirty comparison, or canonical JSON.
	 * Workspace keeps selection/history but stops any active camera preview when leaving Camera.
	 * Camera workspace auto-expands the bottom timeline; Scene remembers the user's choice.
	 */
	get currentWorkspace(): EditorWorkspace {
		return this.session.currentWorkspace;
	}
	set currentWorkspace(value: EditorWorkspace) {
		this.session.setWorkspace(value);
	}
	get leftPanel(): EditorLeftPanel {
		return this.session.leftPanel;
	}
	set leftPanel(value: EditorLeftPanel) {
		this.session.setLeftPanel(value);
	}
	get timelineExpanded(): boolean {
		return this.session.timelineExpanded;
	}
	set timelineExpanded(value: boolean) {
		this.session.setTimelineExpanded(value);
	}
	/** Scene workspace preference is restored after Camera forces the panel open. */
	get sceneTimelineExpanded(): boolean {
		return this.session.sceneTimelineExpanded;
	}
	set sceneTimelineExpanded(value: boolean) {
		this.session.setSceneTimelineExpanded(value);
	}
	get timelineHeight(): number {
		return this.session.timelineHeight;
	}
	set timelineHeight(value: number) {
		this.session.setTimelineHeight(value);
	}
	/** Phase 2.2 global guided-tour ruler. Session-only and normalized to [0, 1]. */
	cameraTimelinePlayhead = $state(0);
	get pendingFramePlacementIds(): string[] {
		return this.session.pendingFramePlacementIds;
	}
	set pendingFramePlacementIds(value: string[]) {
		this.session.pendingFramePlacementIds = value;
	}
	get pendingFrameVersion(): number {
		return this.session.pendingFrameVersion;
	}

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
	get pendingPlacementAssetId(): string | null {
		return this.session.pendingPlacementAssetId;
	}
	set pendingPlacementAssetId(value: string | null) {
		this.session.setPendingPlacementAssetId(value);
	}
	get pendingNavigationCommand(): EditorPendingNavigationCommand {
		return this.session.pendingNavigationCommand;
	}
	set pendingNavigationCommand(value: EditorPendingNavigationCommand) {
		this.session.setPendingNavigationCommand(value);
	}
	hoveredConnectionId = $state<string | null>(null);
	hoveredAnchorId = $state<string | null>(null);
	get transformInteractionActive(): boolean {
		return this.session.transformInteractionActive;
	}
	set transformInteractionActive(value: boolean) {
		this.session.transformInteractionActive = value;
	}
	get transformInteractionKind():
		| 'placement'
		| 'camera'
		| 'anchor'
		| 'view-target'
		| null {
		return this.session.transformInteractionKind;
	}
	set transformInteractionKind(
		value: 'placement' | 'camera' | 'anchor' | 'view-target' | null
	) {
		this.session.transformInteractionKind = value;
	}
	get directPathInteractionActive(): boolean {
		return this.session.directPathInteractionActive;
	}
	set directPathInteractionActive(value: boolean) {
		this.session.setDirectPathInteraction(value);
	}
	get directFramingInteractionActive(): boolean {
		return this.session.directFramingInteractionActive;
	}
	set directFramingInteractionActive(value: boolean) {
		this.session.setDirectFramingInteraction(value);
	}
	/** Phase 2.4 progress drag. The original progress stays private with the transaction. */
	get viewKeyframeProgressDrag(): EditorViewKeyframeProgressDragSelection | null {
		return this.session.viewKeyframeProgressDrag;
	}
	set viewKeyframeProgressDrag(value: EditorViewKeyframeProgressDragSelection | null) {
		this.session.viewKeyframeProgressDrag = value;
	}

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
	readonly mutationGuards: EditorMutationGuards;

	/**
	 * Phase 9.2 — camera-graph topology / guided-tour / timing mutation
	 * controller. The facade methods below delegate to it; components keep
	 * calling `store.beginCameraPlacement()` etc. unchanged.
	 */
	readonly navigationGraphMutator: EditorNavigationGraphMutator;

	/**
	 * Phase 9.3 — directional view-keyframe authoring / framing / progress-drag
	 * / timing mutation controller. The facade methods below delegate to it;
	 * components keep calling `store.addViewKeyframeAtPlayhead()` etc. unchanged.
	 */
	readonly viewKeyframeController: EditorViewKeyframeController;

	/**
	 * Phase 9.4 — guided-tour ruler seek / select / step / edge-travel.
	 * Timeline sync helpers used by selection, nav-mutator, and preview glue
	 * live here; preview start/play/pause/stop stay on the facade.
	 */
	readonly cameraTimelineController: EditorCameraTimelineController;

	/**
	 * Phase 9.5 — placement / cluster / asset-drop mutation controller.
	 * Facade methods below delegate to it.
	 */
	readonly placementClusterMutator: EditorPlacementClusterMutator;

	/**
	 * Phase 9.5 — nav-node point/FOV/label + connection path-anchor mutator.
	 * Split from nav-graph mutator because that controller already exceeds 600 LOC.
	 */
	readonly pathAnchorMutator: EditorPathAnchorMutator;

	/** Slice 2 — registry of every Object3D helper + placement root. */
	private readonly roots = new EditorSceneRoots();
	#cancelTransform: (() => boolean) | null = null;
	#cancelDirectPathDrag: (() => boolean) | null = null;
	#cancelDirectFramingDrag: (() => boolean) | null = null;
	#restoreCameraPreview: (() => boolean) | null = null;
	// Phase 9.3 — `#viewKeyframeProgressDragInitialProgress` moved onto
	// `EditorViewKeyframeController` with the progress-drag flow.
	// Phase 9.2 — pending-nav restore slots moved onto
	// `EditorNavigationGraphMutator` along with the flows that use them.


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
		return this.viewKeyframeController.canAddViewKeyframeAtPlayhead;
	}

	/** Build the current timeline index from the resolved graph and shared motion compiler. */
	getCameraTimeline(): EditorCameraTimeline | null {
		return this.cameraTimelineController.getCameraTimeline();
	}

	/** Visitor and active Director transport own immutable document state. */
	get isDocumentMutationBlocked() {
		return this.mutationGuards.isDocumentMutationBlocked;
	}

	/** Framing is editable through either camera while paused, but never during playback. */
	get isCameraFramingMutationBlocked() {
		return this.mutationGuards.isCameraFramingMutationBlocked;
	}

	get isEditorInteractionActive() {
		return this.mutationGuards.isEditorInteractionActive;
	}

	/** History is only blocked while a preview is playing or a drag/transaction is live. Paused Visitor previews do not lock undo. */
	get isDocumentUndoBlocked() {
		return this.mutationGuards.isDocumentUndoBlocked;
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
		return this.viewKeyframeController.finishViewKeyframeEditing();
	}

	/** Phase 2.2 — scrub the global ruler through the exact guided edge motion. */
	seekCameraTimeline(progress: number) {
		return this.cameraTimelineController.seekCameraTimeline(progress);
	}

	/** Toggle reverse travel on the active connection (scrub/play/keys follow). */
	toggleCameraEdgeReverse() {
		return this.cameraTimelineController.toggleCameraEdgeReverse();
	}

	/**
	 * Set forward/reverse travel for the active connection, preserving the
	 * current timeline playhead (remapped onto the chosen direction).
	 */
	setCameraEdgeTravel(direction: CameraConnectionDirection) {
		return this.cameraTimelineController.setCameraEdgeTravel(direction);
	}

	/** Select a guided edge and seek to the pointer's nearest global ruler point. */
	selectCameraTimelineEdge(
		connectionId: string,
		direction: CameraConnectionDirection,
		progress: number
	) {
		return this.cameraTimelineController.selectCameraTimelineEdge(
			connectionId,
			direction,
			progress
		);
	}

	/** Select one occurrence of a guided node and sample its exact authored pose. */
	selectCameraTimelineNode(nodeId: string, boundaryIndex: number) {
		return this.cameraTimelineController.selectCameraTimelineNode(nodeId, boundaryIndex);
	}

	/** Select a directional key and seek its exact shared-motion sample. */
	selectCameraTimelineViewKeyframe(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	) {
		return this.cameraTimelineController.selectCameraTimelineViewKeyframe(
			connectionId,
			direction,
			keyframeId
		);
	}

	/** Seek the previous/next guided node or visible directional framing key. */
	stepCameraTimeline(direction: -1 | 1) {
		return this.cameraTimelineController.stepCameraTimeline(direction);
	}

	focusNavigationNode(id: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (!this.document.navigationNodes.some((node) => node.id === id)) return false;
		this.cancelPendingFrame();
		this.session.setCameraFocus('navigation-node', null, id);
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
		this.session.clearCameraFocusRequest();
		return true;
	}

	updateNavigationNodePoint(
		nodeId: string,
		handle: EditorCameraHandle,
		point: Vec3
	) {
		return this.pathAnchorMutator.updateNavigationNodePoint(nodeId, handle, point);
	}

	commitNavigationNodePoint(
		nodeId: string,
		handle: EditorCameraHandle,
		point: Vec3
	) {
		return this.pathAnchorMutator.commitNavigationNodePoint(nodeId, handle, point);
	}

	convertConnectionDraft(connectionId: string) {
		return this.pathAnchorMutator.convertConnectionDraft(connectionId);
	}

	convertSelectedConnectionToSmooth() {
		return this.pathAnchorMutator.convertSelectedConnectionToSmooth();
	}

	insertConnectionAnchorAtWorldPoint(
		connectionId: string,
		interiorIndex: number,
		worldPosition: Vec3
	) {
		return this.pathAnchorMutator.insertConnectionAnchorAtWorldPoint(
			connectionId,
			interiorIndex,
			worldPosition
		);
	}

	updateConnectionAnchorWorldPoint(
		connectionId: string,
		anchorId: string,
		worldPosition: Vec3
	) {
		return this.pathAnchorMutator.updateConnectionAnchorWorldPoint(
			connectionId,
			anchorId,
			worldPosition
		);
	}

	commitSelectedAnchorPoint(point: Vec3) {
		return this.pathAnchorMutator.commitSelectedAnchorPoint(point);
	}

	deleteSelectedAnchor() {
		return this.pathAnchorMutator.deleteSelectedAnchor();
	}

	commitSelectedNodeLabel(label: string) {
		return this.pathAnchorMutator.commitSelectedNodeLabel(label);
	}

	commitSelectedNodeFov(fov: number) {
		return this.pathAnchorMutator.commitSelectedNodeFov(fov);
	}

	updateSelectedNodeFov(fov: number) {
		return this.pathAnchorMutator.updateSelectedNodeFov(fov);
	}

	addViewKeyframeAtPlayhead() {
		return this.viewKeyframeController.addViewKeyframeAtPlayhead();
	}

	updateSelectedViewKeyframeTargetWorldPoint(worldTarget: Vec3) {
		return this.viewKeyframeController.updateSelectedViewKeyframeTargetWorldPoint(
			worldTarget
		);
	}

	commitSelectedViewKeyframeTarget(target: Vec3) {
		return this.viewKeyframeController.commitSelectedViewKeyframeTarget(target);
	}

	commitSelectedViewKeyframeFov(fov: number) {
		return this.viewKeyframeController.commitSelectedViewKeyframeFov(fov);
	}

	updateSelectedViewKeyframeFov(fov: number) {
		return this.viewKeyframeController.updateSelectedViewKeyframeFov(fov);
	}

	commitSelectedViewKeyframeProgress(progress: number) {
		return this.viewKeyframeController.commitSelectedViewKeyframeProgress(progress);
	}

	/** Begin one cancel-safe transaction for a timeline or 3D camera-key progress drag. */
	beginViewKeyframeProgressDrag(
		selection: EditorViewKeyframeProgressDragSelection
	) {
		return this.viewKeyframeController.beginViewKeyframeProgressDrag(selection);
	}

	/**
	 * Update the active key with either exact edge progress or a world point projected
	 * to the shared directional connection curve. Only progress is mutated.
	 */
	updateViewKeyframeProgressDrag(progressOrWorldPoint: number | Vector3Like) {
		return this.viewKeyframeController.updateViewKeyframeProgressDrag(
			progressOrWorldPoint
		);
	}

	/** Commit a successful drag as exactly one history entry. */
	commitViewKeyframeProgressDrag() {
		return this.viewKeyframeController.commitViewKeyframeProgressDrag();
	}

	/** Restore the original progress/playhead and create no history entry. */
	cancelViewKeyframeProgressDrag() {
		return this.viewKeyframeController.cancelViewKeyframeProgressDrag();
	}

	deleteSelectedViewKeyframe() {
		return this.viewKeyframeController.deleteSelectedViewKeyframe();
	}

	copySelectedConnectionViewTrack(source: CameraConnectionDirection) {
		return this.viewKeyframeController.copySelectedConnectionViewTrack(source);
	}

	/**
	 * Play the active connection edge in the current travel direction (forward or
	 * reverse). Seeds empty reverse from forward when needed. Used by ▶ while
	 * Reverse is toggled; guided-tour play remains previewGuidedTour.
	 */
	playActiveConnectionEdge(mode?: EditorCameraPreviewMode) {
		const connectionId = this.activeCameraConnectionId;
		const direction = this.activeCameraDirection;
		if (!connectionId || this.isEditorInteractionActive || this.isDocumentTransactionActive) {
			return false;
		}
		const connection = this.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) return false;

		if (direction === 'reverse') {
			const needsSeed =
				(connection.viewTracks?.forward.length ?? 0) > 0 &&
				(connection.viewTracks?.reverse.length ?? 0) === 0;
			if (needsSeed) {
				if (this.isDocumentMutationBlocked || !this.beginDocumentTransaction()) {
					return false;
				}
				seedEmptyReverseViewTrack(connection);
				if (!this.commitDocumentTransaction()) return false;
			}
		}

		const preview = this.cameraPreview;
		const resolvedMode =
			mode ??
			(preview?.mode === 'director' || preview?.mode === 'visitor'
				? preview.mode
				: 'director');
		if (
			preview?.kind === 'connection' &&
			preview.connectionId === connectionId &&
			preview.direction === direction &&
			preview.transport === 'paused'
		) {
			if (preview.mode !== resolvedMode) {
				this.setCameraPreviewMode(resolvedMode);
			}
			return this.playCameraPreview();
		}

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

		this.selection.setNavigation({
			kind: 'connection',
			connectionId: connection.id,
			direction
		});
		this.selectionActions.expandActiveCameraDirection(direction);

		const fromNodeId =
			direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
		const toNodeId =
			direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
		const timeline = this.cameraTimelineController.readCameraTimeline();
		const playhead =
			timeline
				? (cameraTimelineEdgePlayheadAtProgress(
						timeline,
						connectionId,
						direction,
						this.cameraTimelinePlayhead
					) ?? 0)
				: 0;
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
			mode: resolvedMode,
			transport: 'playing',
			runId,
			playhead,
			startedAtMs: null
		};
		this.cameraTimelineController.syncCameraTimelineForConnection(
			connection.id,
			direction,
			playhead
		);
		this.timelineExpanded = true;
		return true;
	}

	/**
	 * @deprecated Prefer toggleCameraEdgeReverse + playActiveConnectionEdge.
	 * Kept for tests: seeds empty reverse and plays reverse edge from the start.
	 */
	previewActiveConnectionReverse(mode: EditorCameraPreviewMode = 'director') {
		if (!this.setCameraEdgeTravel('reverse')) return false;
		const connectionId = this.activeCameraConnectionId;
		if (!connectionId) return false;
		this.cameraTimelineController.showCameraTimelineConnectionPose(
			connectionId,
			'reverse',
			0
		);
		this.cameraTimelineController.syncCameraTimelineForConnection(
			connectionId,
			'reverse',
			0
		);
		return this.playActiveConnectionEdge(mode);
	}

	#seedEmptyReverseForSelectedForwardTrack() {
		const selection = this.navigationSelection;
		const connection = this.selectedConnection;
		if (selection?.kind !== 'view-keyframe' || selection.direction !== 'forward' || !connection) {
			return false;
		}
		return syncReverseViewTrackFromForward(connection);
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

		const timeline = this.cameraTimelineController.readCameraTimeline();
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
		this.cameraTimelineController.syncCameraTimelineForNode(nodeId);
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
		this.cameraTimelineController.syncCameraTimelineForConnection(
			connection.id,
			direction,
			0
		);
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
			// Keep playing reverse/tour edges when switching Observer ↔ Through Camera.
			transport:
				preview.transport === 'playing'
					? 'playing'
					: mode === 'director'
						? 'paused'
						: preview.transport,
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
			if (!this.cameraTimelineController.readCameraTimeline()) return false;
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
			this.cameraTimelineController.syncCameraTimelineForConnection(
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
			this.cameraTimelineController.syncCameraTimelineForConnection(
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
			const timeline = this.cameraTimelineController.readCameraTimeline();
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
			this.cameraTimelineController.syncCameraTimelineForConnection(
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
		this.session.clearCameraFocusRequest();
		return true;
	}

	requestDropToFloor() {
		return this.placementClusterMutator.requestDropToFloor();
	}

	focusRoom(id: MuseumRoomId) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || id !== 'paris') return false;
		this.cancelPendingFrame();
		this.session.setCameraFocus('room', null, null);
		return true;
	}

	focusPlacement(id: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || !this.isPlacementSelectable(id)) {
			return false;
		}
		this.cancelPendingFrame();
		this.session.setCameraFocus('placement', id, null);
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
		this.session.setCameraFocus('selection', null, null);
		return true;
	}

	toggleCameraPan() {
		if (this.isVisitorCameraPreview) return false;
		this.session.toggleCameraPan();
		return true;
	}

	toggleGrid() {
		if (this.isVisitorCameraPreview) return false;
		this.session.toggleGrid();
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
		return true;
	}

	/** Phase 1.1 — bottom timeline panel collapse/expand state. */
	setTimelineExpanded(value: boolean) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.timelineExpanded = Boolean(value);
		if (this.currentWorkspace === 'scene') {
			this.sceneTimelineExpanded = this.timelineExpanded;
		}
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
		return true;
	}

	toggleTimeline() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.timelineExpanded = !this.timelineExpanded;
		if (this.currentWorkspace === 'scene') {
			this.sceneTimelineExpanded = this.timelineExpanded;
		}
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
		this.session.setPendingFramePlacementIds(next);
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
		this.session.clearPendingFramePlacementIds();
		return true;
	}

	cancelPendingFrame() {
		if (this.pendingFramePlacementIds.length === 0) return;
		this.session.clearPendingFramePlacementIds();
	}

	beginAssetPlacement(assetId: string) {
		return this.placementClusterMutator.beginAssetPlacement(assetId);
	}

	cancelAssetPlacement(message?: string) {
		return this.placementClusterMutator.cancelAssetPlacement(message);
	}

	createPendingPlacementAt(position: Vec3) {
		return this.placementClusterMutator.createPendingPlacementAt(position);
	}

	beginCameraPlacement() {
		return this.navigationGraphMutator.beginCameraPlacement();
	}

	/** Compatibility alias retained for callers from the pre-3.2 connected-camera flow. */
	beginConnectedNodePlacement() {
		return this.beginCameraPlacement();
	}

	beginConnectExistingNodes() {
		return this.navigationGraphMutator.beginConnectExistingNodes();
	}

	cancelPendingNavigation(message?: string) {
		return this.navigationGraphMutator.cancelPendingNavigation(message);
	}

	createPendingNavigationNodeAt(
		roomId: MuseumRoomId,
		floorWorld: Vec3,
		cameraForwardWorld: Vec3
	) {
		return this.navigationGraphMutator.createPendingNavigationNodeAt(
			roomId,
			floorWorld,
			cameraForwardWorld
		);
	}

	connectPendingNavigationNode(destinationNodeId: string) {
		return this.navigationGraphMutator.connectPendingNavigationNode(destinationNodeId);
	}

	/** Commit one standalone undirected edge and symmetric adjacency transaction. */
	connectNavigationNodes(sourceNodeId: string, destinationNodeId: string) {
		return this.navigationGraphMutator.connectNavigationNodes(
			sourceNodeId,
			destinationNodeId
		);
	}

	/** Rewrite one complete reciprocal guided cycle without creating graph edges. */
	setGuidedTourOrder(nodeIds: readonly string[]) {
		return this.navigationGraphMutator.setGuidedTourOrder(nodeIds);
	}

	/** Insert one free camera node into an existing guided gap. */
	insertNodeIntoGuidedTour(nodeId: string, index: number) {
		return this.navigationGraphMutator.insertNodeIntoGuidedTour(nodeId, index);
	}

	/** Remove one non-start node from the guided cycle while retaining graph topology. */
	removeNodeFromGuidedTour(nodeId: string) {
		return this.navigationGraphMutator.removeNodeFromGuidedTour(nodeId);
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
		return this.navigationGraphMutator.timelineDragConnectNode(
			nodeId,
			gapFromNodeId,
			gapToNodeId
		);
	}

	/** Delete one non-guided, non-bridge edge and both directional view tracks. */
	deleteConnection(connectionId: string) {
		return this.navigationGraphMutator.deleteConnection(connectionId);
	}

	/** Delete one free node, or splice one guided node across an existing direct edge. */
	deleteNavigationNode(nodeId: string) {
		return this.navigationGraphMutator.deleteNavigationNode(nodeId);
	}

	isPlacementSelectable(id: string) {
		return this.placementClusterMutator.isPlacementSelectable(id);
	}

	cyclePlacement(ids: string[]) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const selectableIds = ids.filter((id) => this.isPlacementSelectable(id));
		const next = nextPlacementCycleId(this.selectedPlacementId, selectableIds);
		if (next === undefined) return false;
		return this.selectionActions.selectPlacement(next);
	}

	createCluster(name?: string) {
		return this.placementClusterMutator.createCluster(name);
	}

	renameCluster(id: string, name: string) {
		return this.placementClusterMutator.renameCluster(id, name);
	}

	addMemberToCluster(clusterId: string, memberId: string) {
		return this.placementClusterMutator.addMemberToCluster(clusterId, memberId);
	}

	removeMemberFromCluster(clusterId: string, memberId: string) {
		return this.placementClusterMutator.removeMemberFromCluster(clusterId, memberId);
	}

	ungroupCluster(id = this.selectedClusterId) {
		return this.placementClusterMutator.ungroupCluster(id);
	}

	duplicateSelection() {
		return this.placementClusterMutator.duplicateSelection();
	}

	deletePlacements(ids: string[]) {
		return this.placementClusterMutator.deletePlacements(ids);
	}

	deleteSelection() {
		return this.placementClusterMutator.deleteSelection();
	}

	deletePlacement(id: string) {
		return this.placementClusterMutator.deletePlacement(id);
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
		return this.placementClusterMutator.updatePlacementTransform(id, transform);
	}

	commitPlacementTransform(id: string, transform: PlacementTransform) {
		return this.placementClusterMutator.commitPlacementTransform(id, transform);
	}

	commitDocumentTransaction() {
		if (
			this.isDocumentMutationBlocked &&
			!this.historyController.isFramingTransactionActive
		) {
			return false;
		}
		if (!this.historyController.isDocumentUndoBlocked) return false;
		if (this.historyController.isFramingTransactionActive) {
			this.#seedEmptyReverseForSelectedForwardTrack();
		}
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
		this.session.clearCameraFocusRequest();
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
		return this.navigationGraphMutator.setConnectionTiming(
			connectionId,
			direction,
			timing
		);
	}

	/** Phase 3.7: write a destination hold in seconds; pass `null` to clear. */
	setNodeHoldSeconds(nodeId: string, holdSeconds: number | null): boolean {
		return this.navigationGraphMutator.setNodeHoldSeconds(nodeId, holdSeconds);
	}

	/** Phase 3.7: write authored hold + easing for one view keyframe, or `null` to clear each field individually. */
	setViewKeyframeTiming(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string,
		holdSeconds: number | null,
		easing: CameraEasing | null
	): boolean {
		return this.viewKeyframeController.setViewKeyframeTiming(
			connectionId,
			direction,
			keyframeId,
			holdSeconds,
			easing
		);
	}
}

export function createMuseumEditorStore() {
	return new MuseumEditorStore();
}

export type { MuseumSceneDocument, RuntimeMuseumScene };
