import type {
	SceneDocument,
	RuntimeScene,
	SceneCameraViewKeyframe,
	SceneConnection,
	SceneLightKind,
	SceneNavigationNode,
	SceneObjectCluster,
	ScenePathAnchor,
	ScenePrimitiveKind
} from '$lib/content/scene';
import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { RuntimeStateStore } from '$lib/state/runtime-state.svelte';
import type { CameraConnectionDirection, RoomId } from '$lib/types/scene';
import type { ResolvedCameraRoute } from '$lib/museum/navigation/camera-route';
import type { EditorCameraSelection, EditorNavigationSelection } from '../editor-selection';
import type { EditorCameraTimeline } from '../camera/editor-camera-timeline';
import type { EditorTransformMode } from '../editor-transform';
import type {
	EditorCameraPreview,
	EditorPendingNavigationCommand,
	EditorViewKeyframeProgressDragSelection,
	EditorWorkspace
} from '../editor-types';
import type { EditorSelectionStore } from './selection-store.svelte';
import type { EditorCameraPreviewController } from './camera-preview-controller.svelte';
import type { EditorHistoryController } from './history-controller.svelte';
import type { EditorSessionState } from './session-state.svelte';
import type { EditorCameraTimelineController } from './camera-timeline-controller.svelte';
import type { EditorSelectionActionsHost } from './selection-actions.svelte';
import type { EditorNavigationGraphMutatorHost } from './navigation-graph-mutator.svelte';
import type { EditorViewKeyframeControllerHost } from './view-keyframe-controller.svelte';
import type { EditorCameraTimelineControllerHost } from './camera-timeline-controller.svelte';
import type { EditorPlacementClusterMutatorHost } from './placement-cluster-mutator.svelte';
import type { EditorPathAnchorMutatorHost } from './path-anchor-mutator.svelte';
import type { EditorMaterialResourceMutatorHost } from './material-resource-mutator.svelte';

/**
 * Slice 1 (Priority-1 file splits) — the seven controller host factories used
 * to live as private `#createXxxHost()` methods on `EditorStore` (~450
 * LOC of pure object-literal wiring). They are now module-level factories in
 * this file keyed on a single structural source surface, so the composition
 * root stops carrying the literals.
 *
 * The store satisfies `EditorControllerHostSource` structurally; the composition
 * root passes `this` (cast) plus the two private-method bridges that the host
 * literals call back into.
 */

/**
 * Every facade member the seven controller host literals read or write.
 * Type-checked against the store's public surface at the single call site in
 * `editor-store.svelte.ts`; the host literals below are contextually checked
 * against their own `*Host` interfaces, so a drift here surfaces as a compile
 * error instead of a silent runtime gap.
 */
export interface EditorControllerHostSource {
	// Mutation guards.
	readonly isDocumentMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;
	/** true for the frozen `/museum/editor` relic (Paris-oriented placement). */
	readonly isRelic: boolean;
	readonly isCameraFramingMutationBlocked: boolean;
	readonly isDocumentTransactionActive: boolean;
	/** True while a document/framing transaction is open on the history controller. */
	readonly historyDocumentUndoBlocked: boolean;
	/** True while a framing (as opposed to plain document) transaction is open. */
	readonly historyFramingTransactionActive: boolean;

	// Document + resolved scene + selection reducer.
	readonly document: SceneDocument;
	readonly scene: RuntimeScene;
	readonly rooms: LayoutRoomRegistry;
	readonly state: RuntimeStateStore;
	readonly selectionStore: EditorSelectionStore;

	// Sub-controllers the host literals delegate to.
	readonly previewController: EditorCameraPreviewController;
	readonly historyController: EditorHistoryController;
	readonly session: EditorSessionState;
	readonly cameraTimelineController: EditorCameraTimelineController;

	// Selection-derived reads only. P7.1 removed the host setter forwards —
	// selection writes go through the reducer (`selectionStore`) or
	// `selectionActions` (post-commit/restore seams).
	readonly cameraSelection: EditorCameraSelection | null;
	readonly navigationSelection: EditorNavigationSelection;
	readonly selectedRoomId: RoomId | null;
	readonly selectedPlacementId: string | null;
	readonly selectedPlacementIds: string[];
	readonly selectedClusterId: string | null;
	readonly primaryPlacementId: string | null;
	readonly selectedNavigationNode: SceneNavigationNode | undefined;
	readonly selectedConnection: SceneConnection | undefined;
	readonly selectedAnchor: ScenePathAnchor | undefined;
	readonly selectedViewKeyframe: SceneCameraViewKeyframe | undefined;
	readonly pendingNavigationNode: SceneNavigationNode | undefined;
	readonly clusters: SceneObjectCluster[];

	// Session-backed read/write facade slots.
	readonly currentWorkspace: EditorWorkspace;
	cameraPreview: EditorCameraPreview;
	activeCameraConnectionId: string | null;
	activeCameraDirection: CameraConnectionDirection;
	treeExpandedCameraConnectionIds: string[];
	treeExpandedCameraDirectionKeys: string[];
	viewKeyframeProgressDrag: EditorViewKeyframeProgressDragSelection | null;
	timelineExpanded: boolean;
	transformMode: EditorTransformMode;
	pendingNavigationCommand: EditorPendingNavigationCommand;
	pendingPlacementAssetId: string | null;
	pendingPlacementPrimitiveKind: ScenePrimitiveKind | null;
	pendingPlacementLightKind: SceneLightKind | null;

	// Facade methods the host literals call back into.
	isPendingNavigationNode(nodeId: string): boolean;
	connectPendingNavigationNode(destinationNodeId: string): boolean;
	cancelAssetPlacement(message?: string): boolean;
	cancelPendingFrame(): void;
	setStatusMessage(message: string | null): void;
	focusNavigationNode(id: string): boolean;
	focusPlacement(id: string): boolean;
	focusSelection(): boolean;
	ensureRoomTreeExpanded(roomId: RoomId): boolean;
	ensureClusterTreeExpanded(clusterId: string): boolean;
	isPlacementSelectable(id: string): boolean;
	getCapturedCameraPreviewRoute(runId: number): ResolvedCameraRoute | null;
	setCameraPreviewPlayhead(progress: number, runId?: number): boolean;
	setWorkspace(workspace: EditorWorkspace): boolean;
	setNavigationHover(connectionId: string | null, anchorId?: string | null): boolean;
	stopCameraPreview(): boolean;
	beginDocumentTransaction(): boolean;
	beginCameraFramingTransaction(): boolean;
	commitDocumentTransaction(): boolean;
	cancelDocumentTransaction(): boolean;
	cancelPendingNavigation(message?: string): boolean;
	requestPlacementFrame(ids: string[]): boolean;
}

/**
 * Private-method bridges the store supplies at the single call site. The host
 * literals need `#prepareCameraPreview` / `#seedEmptyReverseForSelectedForwardTrack`,
 * which are ECMAScript-private and therefore invisible through the structural
 * source cast; the store binds them here so the factories stay private-free.
 */
export interface EditorControllerHostBridges {
	prepareCameraPreview(): boolean;
	seedEmptyReverseForSelectedForwardTrack(): boolean;
}

export function createControllerHosts(
	source: EditorControllerHostSource,
	bridges: EditorControllerHostBridges
) {
	const selection = {
		get isDocumentMutationBlocked() {
			return source.isDocumentMutationBlocked;
		},
		get isEditorInteractionActive() {
			return source.isEditorInteractionActive;
		},
		get isCameraFramingMutationBlocked() {
			return source.isCameraFramingMutationBlocked;
		},
		get pendingNavigationCommand() {
			return source.pendingNavigationCommand;
		},
		get pendingNavigationNode() {
			return source.pendingNavigationNode;
		},
		get document() {
			return source.document;
		},
		get cameraSelection() {
			return source.cameraSelection;
		},
		get currentWorkspace() {
			return source.currentWorkspace;
		},
		get cameraPreview() {
			return source.cameraPreview;
		},
		get activeCameraConnectionId() {
			return source.activeCameraConnectionId;
		},
		get activeCameraDirection() {
			return source.activeCameraDirection;
		},
		get navigationSelection() {
			return source.navigationSelection;
		},
		get selectedRoomId() {
			return source.selectedRoomId;
		},
		get selectedPlacementId() {
			return source.selectedPlacementId;
		},
		get selectedPlacementIds() {
			return source.selectedPlacementIds;
		},
		get selectedClusterId() {
			return source.selectedClusterId;
		},
		get clusters() {
			return source.clusters;
		},
		get transformMode() {
			return source.transformMode;
		},
		set transformMode(value) {
			source.transformMode = value;
		},
		isPendingNavigationNode: (nodeId: string) => source.isPendingNavigationNode(nodeId),
		connectPendingNavigationNode: (destinationNodeId: string) =>
			source.connectPendingNavigationNode(destinationNodeId),
		cancelAssetPlacement: (message?: string) => source.cancelAssetPlacement(message),
		cancelPendingFrame: () => source.cancelPendingFrame(),
		setStatusMessage: (message: string | null) => source.setStatusMessage(message),
		focusNavigationNode: (id: string) => source.focusNavigationNode(id),
		focusPlacement: (id: string) => source.focusPlacement(id),
		focusSelection: () => source.focusSelection(),
		ensureRoomTreeExpanded: (roomId: RoomId) => source.ensureRoomTreeExpanded(roomId),
		ensureClusterTreeExpanded: (clusterId: string) =>
			source.ensureClusterTreeExpanded(clusterId),
		isPlacementSelectable: (id: string) => source.isPlacementSelectable(id),
		getCapturedCameraPreviewRoute: (runId: number) =>
			source.getCapturedCameraPreviewRoute(runId),
		setCameraPreviewPlayhead: (progress: number) =>
			source.setCameraPreviewPlayhead(progress),
		syncCameraTimelineForNode: (id: string) =>
			source.cameraTimelineController.syncCameraTimelineForNode(id),
		showCameraTimelineNodePose: (id: string) =>
			source.cameraTimelineController.showCameraTimelineNodePose(id),
		syncCameraTimelineForConnection: (
			connectionId: string,
			direction: CameraConnectionDirection,
			playhead: number
		) =>
			source.cameraTimelineController.syncCameraTimelineForConnection(
				connectionId,
				direction,
				playhead
			),
		showCameraTimelineConnectionPose: (
			connectionId: string,
			direction: CameraConnectionDirection,
			playhead: number
		) =>
			source.cameraTimelineController.showCameraTimelineConnectionPose(
				connectionId,
				direction,
				playhead
			)
	} satisfies EditorSelectionActionsHost;

	const navigationGraph = {
		get isDocumentMutationBlocked() {
			return source.isDocumentMutationBlocked;
		},
		get isEditorInteractionActive() {
			return source.isEditorInteractionActive;
		},
		get isDocumentTransactionActive() {
			return source.isDocumentTransactionActive;
		},
		get document() {
			return source.document;
		},
		get rooms() {
			return source.rooms;
		},
		get selection() {
			return source.selectionStore;
		},
		get currentWorkspace() {
			return source.currentWorkspace;
		},
		get isRelic() {
			return source.isRelic;
		},
		get selectedNavigationNode() {
			return source.selectedNavigationNode;
		},
		get selectedPlacementIds() {
			return source.selectedPlacementIds;
		},
		get selectedClusterId() {
			return source.selectedClusterId;
		},
		get cameraPreview() {
			return source.cameraPreview;
		},
		get pendingNavigationCommand() {
			return source.pendingNavigationCommand;
		},
		set pendingNavigationCommand(value) {
			source.pendingNavigationCommand = value;
		},
		get activeCameraConnectionId() {
			return source.activeCameraConnectionId;
		},
		set activeCameraConnectionId(value) {
			source.activeCameraConnectionId = value;
		},
		get activeCameraDirection() {
			return source.activeCameraDirection;
		},
		set activeCameraDirection(value) {
			source.activeCameraDirection = value;
		},
		get navigationSelection() {
			return source.navigationSelection;
		},
		get treeExpandedCameraConnectionIds() {
			return source.treeExpandedCameraConnectionIds;
		},
		set treeExpandedCameraConnectionIds(value) {
			source.treeExpandedCameraConnectionIds = value;
		},
		get treeExpandedCameraDirectionKeys() {
			return source.treeExpandedCameraDirectionKeys;
		},
		set treeExpandedCameraDirectionKeys(value) {
			source.treeExpandedCameraDirectionKeys = value;
		},
		setStatusMessage: (message: string | null) => source.setStatusMessage(message),
		setWorkspace: (workspace: EditorWorkspace) => source.setWorkspace(workspace),
		setNavigationHover: (connectionId: string | null, anchorId?: string | null) =>
			source.setNavigationHover(connectionId, anchorId ?? null),
		cancelAssetPlacement: (message?: string) => source.cancelAssetPlacement(message),
		cancelPendingFrame: () => source.cancelPendingFrame(),
		beginDocumentTransaction: () => source.beginDocumentTransaction(),
		commitDocumentTransaction: () => source.commitDocumentTransaction(),
		cancelDocumentTransaction: () => source.cancelDocumentTransaction(),
		getCameraTimeline: () => source.cameraTimelineController.getCameraTimeline(),
		stopCameraPreview: () => source.stopCameraPreview(),
		getCapturedCameraPreviewRoute: (runId: number) =>
			source.getCapturedCameraPreviewRoute(runId),
		syncCameraTimelineForConnection: (
			connectionId: string,
			direction: CameraConnectionDirection,
			playhead: number
		) =>
			source.cameraTimelineController.syncCameraTimelineForConnection(
				connectionId,
				direction,
				playhead
			),
		showCameraTimelineConnectionPose: (
			connectionId: string,
			direction: CameraConnectionDirection,
			playhead: number
		) =>
			source.cameraTimelineController.showCameraTimelineConnectionPose(
				connectionId,
				direction,
				playhead
			)
	} satisfies EditorNavigationGraphMutatorHost;

	const viewKeyframe = {
		get isDocumentMutationBlocked() {
			return source.isDocumentMutationBlocked;
		},
		get isCameraFramingMutationBlocked() {
			return source.isCameraFramingMutationBlocked;
		},
		get isEditorInteractionActive() {
			return source.isEditorInteractionActive;
		},
		get isDocumentTransactionActive() {
			return source.isDocumentTransactionActive;
		},
		get historyDocumentUndoBlocked() {
			return source.historyController.isDocumentUndoBlocked;
		},
		get historyFramingTransactionActive() {
			return source.historyController.isFramingTransactionActive;
		},
		get pendingNavigationCommand() {
			return source.pendingNavigationCommand;
		},
		get document() {
			return source.document;
		},
		get rooms() {
			return source.rooms;
		},
		get selection() {
			return source.selectionStore;
		},
		get selectedConnection() {
			return source.selectedConnection;
		},
		get selectedAnchor() {
			return source.selectedAnchor;
		},
		get selectedViewKeyframe() {
			return source.selectedViewKeyframe;
		},
		get selectedRoomId() {
			return source.selectedRoomId;
		},
		get cameraPreview() {
			return source.cameraPreview;
		},
		get navigationSelection() {
			return source.navigationSelection;
		},
		get viewKeyframeProgressDrag() {
			return source.viewKeyframeProgressDrag;
		},
		set viewKeyframeProgressDrag(value) {
			source.viewKeyframeProgressDrag = value;
		},
		// P7.5 — playhead ownership moved to the timeline controller; this host
		// re-points at its owned field (was facade `$state`).
		get cameraTimelinePlayhead() {
			return source.cameraTimelineController.cameraTimelinePlayhead;
		},
		set cameraTimelinePlayhead(value) {
			source.cameraTimelineController.cameraTimelinePlayhead = value;
		},
		setStatusMessage: (message: string | null) => source.setStatusMessage(message),
		beginDocumentTransaction: () => source.beginDocumentTransaction(),
		beginCameraFramingTransaction: () => source.beginCameraFramingTransaction(),
		commitDocumentTransaction: () => source.commitDocumentTransaction(),
		cancelDocumentTransaction: () => source.cancelDocumentTransaction(),
		seedEmptyReverseForSelectedForwardTrack: () =>
			bridges.seedEmptyReverseForSelectedForwardTrack(),
		getCameraTimeline: () => source.cameraTimelineController.getCameraTimeline(),
		getCapturedCameraPreviewRoute: (runId: number) =>
			source.getCapturedCameraPreviewRoute(runId),
		allocPreviewRunId: () => source.previewController.allocRunId(),
		setCapturedPreviewRoute: (runId: number, route: ResolvedCameraRoute) =>
			source.previewController.setCapturedRoute(runId, route),
		setCameraPreview: (value: EditorCameraPreview) => {
			source.cameraPreview = value;
		},
		setCameraPreviewPlayhead: (progress: number, runId?: number) =>
			source.setCameraPreviewPlayhead(progress, runId),
		selectCameraTimelineViewKeyframe: (
			connectionId: string,
			direction: CameraConnectionDirection,
			keyframeId: string
		) =>
			source.cameraTimelineController.selectCameraTimelineViewKeyframe(
				connectionId,
				direction,
				keyframeId
			)
	} satisfies EditorViewKeyframeControllerHost;

	const cameraTimeline = {
		get isEditorInteractionActive() {
			return source.isEditorInteractionActive;
		},
		get isDocumentTransactionActive() {
			return source.isDocumentTransactionActive;
		},
		get isDocumentMutationBlocked() {
			return source.isDocumentMutationBlocked;
		},
		get pendingNavigationCommand() {
			return source.pendingNavigationCommand;
		},
		get document() {
			return source.document;
		},
		get scene() {
			return source.scene;
		},
		get graph() {
			return source.state.graph;
		},
		get selection() {
			return source.selectionStore;
		},
		get cameraPreview() {
			return source.cameraPreview;
		},
		set cameraPreview(value) {
			source.cameraPreview = value;
		},
		get activeCameraConnectionId() {
			return source.activeCameraConnectionId;
		},
		get activeCameraDirection() {
			return source.activeCameraDirection;
		},
		get timelineExpanded() {
			return source.timelineExpanded;
		},
		set timelineExpanded(value) {
			source.timelineExpanded = value;
		},
		setStatusMessage: (message: string | null) => source.setStatusMessage(message),
		beginDocumentTransaction: () => source.beginDocumentTransaction(),
		commitDocumentTransaction: () => source.commitDocumentTransaction(),
		prepareCameraPreview: () => bridges.prepareCameraPreview(),
		allocPreviewRunId: () => source.previewController.allocRunId(),
		setCapturedRoute: (runId: number, route: ResolvedCameraRoute) =>
			source.previewController.setCapturedRoute(runId, route),
		clearCapturedRoute: () => source.previewController.clearCapturedRoute(),
		get followEnabled() {
			return source.previewController.followEnabled;
		},
		set followEnabled(value) {
			source.previewController.followEnabled = value;
		},
		get recenterVersion() {
			return source.previewController.recenterVersion;
		},
		set recenterVersion(value) {
			source.previewController.recenterVersion = value;
		},
		setCameraPreviewPlayhead: (progress: number, runId?: number) =>
			source.setCameraPreviewPlayhead(progress, runId),
		getTimeline: () => source.previewController.getTimeline(),
		cancelAssetPlacement: (message?: string) => source.cancelAssetPlacement(message),
		cancelPendingFrame: () => source.cancelPendingFrame(),
		clearCameraFocusRequest: () => source.session.clearCameraFocusRequest()
	} satisfies EditorCameraTimelineControllerHost;

	const placementCluster = {
		get isDocumentMutationBlocked() {
			return source.isDocumentMutationBlocked;
		},
		get isEditorInteractionActive() {
			return source.isEditorInteractionActive;
		},
		get isRelic() {
			return source.isRelic;
		},
		get document() {
			return source.document;
		},
		get selectedRoomId() {
			return source.selectedRoomId;
		},
		get selectedPlacementIds() {
			return source.selectedPlacementIds;
		},
		get primaryPlacementId() {
			return source.primaryPlacementId;
		},
		get clusters() {
			return source.clusters;
		},
		get selectedClusterId() {
			return source.selectedClusterId;
		},
		get pendingPlacementAssetId() {
			return source.pendingPlacementAssetId;
		},
		set pendingPlacementAssetId(value) {
			source.pendingPlacementAssetId = value;
		},
		get pendingPlacementPrimitiveKind() {
			return source.pendingPlacementPrimitiveKind;
		},
		set pendingPlacementPrimitiveKind(value) {
			source.pendingPlacementPrimitiveKind = value;
		},
		get pendingPlacementLightKind() {
			return source.pendingPlacementLightKind;
		},
		set pendingPlacementLightKind(value) {
			source.pendingPlacementLightKind = value;
		},
		setStatusMessage: (message: string | null) => source.setStatusMessage(message),
		setNavigationHover: (connectionId: string | null, anchorId?: string | null) =>
			source.setNavigationHover(connectionId, anchorId ?? null),
		cancelPendingNavigation: (message?: string) => source.cancelPendingNavigation(message),
		requestPlacementFrame: (ids: string[]) => source.requestPlacementFrame(ids),
		sessionRequestDropToFloor: () => source.session.requestDropToFloor(),
		setPlacementScaleVector: (id: string, vector) =>
			source.session.setPlacementScaleVector(id, vector),
		beginDocumentTransaction: () => source.beginDocumentTransaction(),
		commitDocumentTransaction: () => source.commitDocumentTransaction(),
		cancelDocumentTransaction: () => source.cancelDocumentTransaction()
	} satisfies EditorPlacementClusterMutatorHost;

	const pathAnchor = {
		get isDocumentMutationBlocked() {
			return source.isDocumentMutationBlocked;
		},
		get isCameraFramingMutationBlocked() {
			return source.isCameraFramingMutationBlocked;
		},
		get isEditorInteractionActive() {
			return source.isEditorInteractionActive;
		},
		get historyDocumentUndoBlocked() {
			return source.historyController.isDocumentUndoBlocked;
		},
		get historyFramingTransactionActive() {
			return source.historyController.isFramingTransactionActive;
		},
		get document() {
			return source.document;
		},
		get rooms() {
			return source.rooms;
		},
		get cameraSelection() {
			return source.cameraSelection;
		},
		get selectedNavigationNode() {
			return source.selectedNavigationNode;
		},
		get selectedConnection() {
			return source.selectedConnection;
		},
		get selectedAnchor() {
			return source.selectedAnchor;
		},
		get selectedRoomId() {
			return source.selectedRoomId;
		},
		get pendingNavigationNode() {
			return source.pendingNavigationNode;
		},
		get navigationSelection() {
			return source.navigationSelection;
		},
		/** P7.1 — reducer seam for in-transaction selection writes. */
		get selection() {
			return source.selectionStore;
		},
		isPendingNavigationNode: (nodeId: string) => source.isPendingNavigationNode(nodeId),
		beginDocumentTransaction: () => source.beginDocumentTransaction(),
		beginCameraFramingTransaction: () => source.beginCameraFramingTransaction(),
		commitDocumentTransaction: () => source.commitDocumentTransaction(),
		cancelDocumentTransaction: () => source.cancelDocumentTransaction()
	} satisfies EditorPathAnchorMutatorHost;

	const materialResource = {
		get isDocumentMutationBlocked() {
			return source.isDocumentMutationBlocked;
		},
		get isEditorInteractionActive() {
			return source.isEditorInteractionActive;
		},
		get document() {
			return source.document;
		},
		setStatusMessage: (message: string | null) => source.setStatusMessage(message),
		beginDocumentTransaction: () => source.beginDocumentTransaction(),
		commitDocumentTransaction: () => source.commitDocumentTransaction(),
		cancelDocumentTransaction: () => source.cancelDocumentTransaction(),
		markTextureRecentlyUsed: (textureId: string) =>
			source.session.markTextureRecentlyUsed(textureId)
	} satisfies EditorMaterialResourceMutatorHost;

	return {
		selection,
		navigationGraph,
		viewKeyframe,
		cameraTimeline,
		placementCluster,
		pathAnchor,
		materialResource
	};
}
