import {
	createNavigationGraph,
	getNode,
	museumSceneDocument,
	resolveSceneDocument,
	type MuseumSceneDocument,
	type NavigationGraph,
	type SceneCameraViewKeyframe,
	type RuntimeMuseumScene,
	type SceneObjectCluster,
	type SceneObjectPlacement
} from '$lib/content/scene';
import {
	serializeSceneDocument,
	validateSceneDocument,
	type SceneDocumentValidationResult
} from '$lib/content/scene-codec';
import { getAssetById, resolveAssetFallback } from '$lib/content/assets';
import { roomLocalPoint, roomPoint } from '$lib/content/rooms';
import { createMuseumState, type MuseumStateStore } from '$lib/state/museum-state.svelte';
import {
	cameraMotionEdgeProgressAtProgress,
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion,
	createCameraMotionSample,
	sampleCameraMotion
} from '$lib/museum/navigation/camera-motion';
import {
	MUSEUM_CAMERA_FOV,
	type CameraConnectionDirection,
	type MuseumRoomId,
	type Vec3
} from '$lib/types/museum';
import {
	getCameraConnectionRoute,
	getCameraRoute,
	type ResolvedCameraRoute
} from '$lib/museum/navigation/camera-route';
import type { Vector3Like } from '$lib/museum/navigation/camera-motion';
import { untrack } from 'svelte';
import type { Object3D } from 'three';
import {
	nextPlacementCycleId,
	type EditorCameraHandle,
	type EditorCameraSelection,
	type EditorNavigationSelection
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

const HISTORY_LIMIT = 100;
const STATUS_MESSAGE_MS = 2500;

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

export type EditorCameraPreviewMode = 'director' | 'visitor';
export type EditorCameraPreviewTransport = 'paused' | 'playing' | 'complete';

type EditorCameraPreviewState = {
	mode: EditorCameraPreviewMode;
	transport: EditorCameraPreviewTransport;
	runId: number;
	playhead: number;
	startedAtMs: number | null;
};

export type EditorCameraPreview =
	| null
	| (EditorCameraPreviewState & {
			kind: 'node';
			nodeId: string;
	  })
	| (EditorCameraPreviewState & {
			kind: 'transition';
			fromNodeId: string;
			toNodeId: string;
	  })
	| (EditorCameraPreviewState & {
			kind: 'connection';
			connectionId: string;
			direction: 'forward' | 'reverse';
			fromNodeId: string;
			toNodeId: string;
	  })
	| (EditorCameraPreviewState & {
			kind: 'tour';
			startNodeId: string;
	  });

export type EditorPendingNavigationCommand =
	| null
	| {
			kind: 'place-connected-node';
			sourceNodeId: string;
			roomId: MuseumRoomId;
	  }
	| {
			kind: 'connect-existing';
			sourceNodeId: string;
	  };

/**
 * Phase 1.1 persistent shell — Scene keeps placement tools; Camera keeps camera tools and the timeline.
 */
export type EditorWorkspace = 'scene' | 'camera';

/** Scene-workspace sidebar choice; Camera temporarily replaces it without changing it. */
export type EditorLeftPanel = 'scene' | 'assets';

export type EditorPlacementTreeSelectionOptions = {
	additive?: boolean;
	focus?: boolean;
};

export type EditorClusterTreeSelectionOptions = {
	focus?: boolean;
};

/** Stable identity for one directional camera framing key. */
export type EditorViewKeyframeProgressDragSelection = {
	connectionId: string;
	direction: CameraConnectionDirection;
	keyframeId: string;
};

/** Session-only viewport transform presentation. */
export type EditorTransformSpace = 'local' | 'world';

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

const CAMERA_HELPER_KEY_SEPARATOR = ':';

function cameraHelperKey(nodeId: string, handle: EditorCameraHandle) {
	return `${nodeId}${CAMERA_HELPER_KEY_SEPARATOR}${handle}`;
}

function anchorHelperKey(connectionId: string, anchorId: string) {
	return `${connectionId}${CAMERA_HELPER_KEY_SEPARATOR}${anchorId}`;
}

function viewKeyframeHelperKey(
	connectionId: string,
	direction: CameraConnectionDirection,
	keyframeId: string
) {
	return [connectionId, direction, keyframeId].join(CAMERA_HELPER_KEY_SEPARATOR);
}

/** Stable ${connectionId}:${direction} key for Camera workspace tree expansion. */
function cameraDirectionTreeKey(
	connectionId: string,
	direction: CameraConnectionDirection
) {
	return `${connectionId}${CAMERA_HELPER_KEY_SEPARATOR}${direction}`;
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

function documentsMatch(a: MuseumSceneDocument, b: MuseumSceneDocument) {
	return JSON.stringify(a) === JSON.stringify(b);
}

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
	document = $state(cloneMuseumSceneDocument(museumSceneDocument));
	validation = $derived<SceneDocumentValidationResult>(validateSceneDocument(this.document));
	baselineCanonicalJson = $state(serializeSceneDocument(museumSceneDocument));
	scene = $state.raw<RuntimeMuseumScene>(resolveSceneDocument(this.document));
	state = $state.raw<MuseumStateStore>(
		createMuseumState(createNavigationGraph(this.scene), 'paris-seat')
	);

	selectedRoomId = $state<MuseumRoomId | null>(null);
	selectedPlacementIds = $state<string[]>([]);
	selectedClusterId = $state<string | null>(null);
	navigationSelection = $state<EditorNavigationSelection>(null);
	cameraPreview = $state<EditorCameraPreview>(null);
	cameraPreviewFollowEnabled = $state(true);
	cameraPreviewRecenterVersion = $state(0);
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
	/**
	 * Phase 1.1 sidebar tree expansion — owned by the store so the inspector's grouping
	 * helpers can ask the tree to reveal a freshly created cluster.
	 */
	treeExpandedRoomIds = $state<MuseumRoomId[]>(['paris']);
	treeExpandedClusterIds = $state<string[]>([]);
	pendingFramePlacementIds = $state<string[]>([]);
	pendingFrameVersion = $state(0);

	/**
	 * Phase 2.1 persistent camera-key discovery — the connection currently exposed for
	 * selection/scrub plus the directional focus track. Independent of any active
	 * Director preview so keys stay reachable after Stop or Done editing view.
	 */
	activeCameraConnectionId = $state<string | null>(null);
	activeCameraDirection = $state<CameraConnectionDirection>('forward');
	treeExpandedCameraConnectionIds = $state<string[]>([]);
	treeExpandedCameraDirectionKeys = $state<string[]>([]);

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
	/** Phase 2.4 progress drag. The original progress stays private with the transaction. */
	viewKeyframeProgressDrag = $state<EditorViewKeyframeProgressDragSelection | null>(
		null
	);

	#placementRoots = new Map<string, Object3D>();
	#cameraHelperRoots = new Map<string, Object3D>();
	#anchorHelperRoots = new Map<string, Object3D>();
	#viewKeyframeTargetHelperRoots = new Map<string, Object3D>();
	#cancelTransform: (() => boolean) | null = null;
	#cancelDirectPathDrag: (() => boolean) | null = null;
	#restoreCameraPreview: (() => boolean) | null = null;
	#capturedCameraPreviewRoute: {
		runId: number;
		route: ResolvedCameraRoute;
	} | null = null;
	#nextCameraPreviewRunId = 1;
	#cameraTimelineGraph: NavigationGraph | null = null;
	#cameraTimelineCache: EditorCameraTimeline | null = null;
	#viewKeyframeProgressDragInitialProgress: number | null = null;
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

	/** Node-only compatibility view used by existing camera helper components. */
	get cameraSelection(): EditorCameraSelection | null {
		const selection = this.navigationSelection;
		return selection?.kind === 'node'
			? { nodeId: selection.nodeId, handle: selection.handle }
			: null;
	}

	get selectedNavigationNode() {
		const id = this.navigationSelection?.kind === 'node'
			? this.navigationSelection.nodeId
			: null;
		return id
			? this.document.navigationNodes.find((node) => node.id === id)
			: undefined;
	}

	get selectedRuntimeNavigationNode() {
		const id = this.navigationSelection?.kind === 'node'
			? this.navigationSelection.nodeId
			: null;
		return id ? this.scene.navigationNodes.find((node) => node.id === id) : undefined;
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
			this.isVisitorCameraPreview ||
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
		return this.cameraPreview?.mode === 'director' &&
			this.cameraPreview.transport === 'paused';
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
		const graph = this.state.graph;
		if (this.#cameraTimelineGraph === graph) return this.#cameraTimelineCache;
		this.#cameraTimelineGraph = graph;
		try {
			this.#cameraTimelineCache = createEditorCameraTimeline(graph);
		} catch {
			this.#cameraTimelineCache = null;
		}
		return this.#cameraTimelineCache;
	}

	/** Visitor and active Director transport own immutable document state. */
	get isDocumentMutationBlocked() {
		const preview = this.cameraPreview;
		return Boolean(
			preview && (preview.mode === 'visitor' || preview.transport !== 'paused')
		);
	}

	get isEditorInteractionActive() {
		return (
			this.transformInteractionActive ||
			this.directPathInteractionActive ||
			this.viewKeyframeProgressDrag !== null
		);
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
		return !this.isDocumentMutationBlocked && !this.isEditorInteractionActive && this.#past.length > 0;
	}

	get canRedo() {
		void this.historyVersion;
		return !this.isDocumentMutationBlocked && !this.isEditorInteractionActive && this.#future.length > 0;
	}

	get isDirty() {
		const validation = this.validation;
		return !validation.success || validation.canonicalJson !== this.baselineCanonicalJson;
	}

	get canExport() {
		return this.validation.success && !this.isDocumentTransactionActive;
	}

	get validationIssues() {
		const validation = this.validation;
		return validation.success ? [] : validation.issues;
	}

	get canonicalJson() {
		const validation = this.validation;
		return validation.success ? validation.canonicalJson : null;
	}

	get isDocumentTransactionActive() {
		return this.#transactionBefore !== null;
	}

	applyLightingPreset(preset: EditorLightingSettings) {
		if (this.isVisitorCameraPreview) return false;
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

	setTransformCanceler(cancel: (() => boolean) | null) {
		this.#cancelTransform = cancel;
	}

	setDirectPathDragCanceler(cancel: (() => boolean) | null) {
		this.#cancelDirectPathDrag = cancel;
	}

	/** @deprecated Use setTransformCanceler; retained for Phase 6 integration tests. */
	setCameraTransformCanceler(cancel: (() => boolean) | null) {
		this.setTransformCanceler(cancel);
	}

	/** The camera rig installs this so modal guards remain active through restoration. */
	setCameraPreviewRestorer(restore: (() => boolean) | null) {
		this.#restoreCameraPreview = restore;
	}

	selectNavigationNode(id: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (this.pendingNavigationCommand?.kind === 'connect-existing') {
			return this.connectPendingNavigationNode(id);
		}
		if (this.pendingNavigationCommand) return false;
		const node = this.document.navigationNodes.find((candidate) => candidate.id === id);
		if (!node) return false;

		const current = this.cameraSelection;
		if (current?.nodeId === id && current.handle === 'position') return false;

		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.#clearPlacementSelection();
		this.navigationSelection = { kind: 'node', nodeId: id, handle: 'position' };
		// Phase 2.1: leaving a connection focus cancels the persistent camera discovery.
		this.activeCameraConnectionId = null;
		this.activeCameraDirection = 'forward';

		if (this.currentWorkspace === 'camera') {
			this.#syncCameraTimelineForNode(id);
			this.#showCameraTimelineNodePose(id);
		} else if (current?.nodeId !== id) {
			this.focusNavigationNode(id);
		}
		return true;
	}

	selectCameraHandle(handle: EditorCameraHandle) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || this.pendingNavigationCommand) return false;
		const selection = this.cameraSelection;
		if (!selection || selection.handle === handle) return false;
		this.navigationSelection = {
			kind: 'node',
			nodeId: selection.nodeId,
			handle
		};
		// Phase 2.1: switching to camera-handle (eye/target) editing clears the persistent
		// connection focus so the framing helpers don't stale-render next to the gizmo.
		this.activeCameraConnectionId = null;
		this.activeCameraDirection = 'forward';
		return true;
	}

	selectConnection(connectionId: string) {
		return this.selectCameraConnectionDirection(connectionId, this.#defaultCameraDirection(connectionId));
	}

	/**
	 * Phase 2.1 primary entry for selecting a connection. Establishes both
	 * `activeCameraConnectionId` and `activeCameraDirection` so the connection's
	 * keyframe markers stay reachable through tree, timeline, and 3D pickers.
	 */
	selectCameraConnectionDirection(
		connectionId: string,
		direction: CameraConnectionDirection
	) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || this.pendingNavigationCommand) {
			return false;
		}
		if (!this.document.connections.some((connection) => connection.id === connectionId)) {
			return false;
		}
		if (
			this.activeCameraConnectionId === connectionId &&
			this.activeCameraDirection === direction &&
			this.navigationSelection?.kind === 'connection'
		) {
			return false;
		}
		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.#clearPlacementSelection();
		this.navigationSelection = { kind: 'connection', connectionId };
		this.activeCameraConnectionId = connectionId;
		this.activeCameraDirection = direction;
		this.#expandActiveCameraDirection(direction);
		if (this.currentWorkspace === 'camera') {
			this.#syncCameraTimelineForConnection(connectionId, direction, 0);
			this.#showCameraTimelineConnectionPose(connectionId, direction, 0);
		}
		return true;
	}

	#defaultCameraDirection(connectionId: string): CameraConnectionDirection {
		if (
			this.activeCameraConnectionId === connectionId &&
			(this.navigationSelection?.kind === 'connection' ||
				this.navigationSelection?.kind === 'anchor' ||
				this.navigationSelection?.kind === 'view-keyframe')
		) {
			return this.activeCameraDirection;
		}
		return 'forward';
	}

	#expandActiveCameraDirection(direction: CameraConnectionDirection) {
		const id = this.activeCameraConnectionId;
		if (!id) return;
		if (!this.treeExpandedCameraConnectionIds.includes(id)) {
			this.treeExpandedCameraConnectionIds = [...this.treeExpandedCameraConnectionIds, id];
		}
		const key = cameraDirectionTreeKey(id, direction);
		if (!this.treeExpandedCameraDirectionKeys.includes(key)) {
			this.treeExpandedCameraDirectionKeys = [...this.treeExpandedCameraDirectionKeys, key];
		}
	}

	selectAnchor(connectionId: string, anchorId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || this.pendingNavigationCommand) {
			return false;
		}
		const connection = this.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection?.positionPath.anchors.some((anchor) => anchor.id === anchorId)) {
			return false;
		}
		const current = this.navigationSelection;
		if (
			current?.kind === 'anchor' &&
			current.connectionId === connectionId &&
			current.anchorId === anchorId
		) {
			return false;
		}
		const direction = this.#defaultCameraDirection(connectionId);
		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.#clearPlacementSelection();
		this.navigationSelection = { kind: 'anchor', connectionId, anchorId };
		this.activeCameraConnectionId = connectionId;
		this.activeCameraDirection = direction;
		this.#expandActiveCameraDirection(direction);
		return true;
	}

	/** Leave an anchor without changing the document or its history. */
	finishAnchorEditing() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || this.pendingNavigationCommand) {
			return false;
		}
		const selection = this.navigationSelection;
		if (selection?.kind !== 'anchor') return false;
		const connection = this.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (!connection?.positionPath.anchors.some((anchor) => anchor.id === selection.anchorId)) {
			return false;
		}
		this.navigationSelection = { kind: 'connection', connectionId: connection.id };
		this.activeCameraConnectionId = connection.id;
		this.#expandActiveCameraDirection(this.activeCameraDirection);
		return true;
	}

	selectViewKeyframe(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	) {
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			this.pendingNavigationCommand
		) {
			return false;
		}
		const keyframe = findSceneCameraViewKeyframe(
			this.document,
			connectionId,
			direction,
			keyframeId
		);
		if (!keyframe) return false;

		const current = this.navigationSelection;
		const changed = !(
			current?.kind === 'view-keyframe' &&
			current.connectionId === connectionId &&
			current.direction === direction &&
			current.keyframeId === keyframeId
		);
		if (changed) {
			this.cancelAssetPlacement();
			this.cancelPendingFrame();
			this.#clearPlacementSelection();
			this.navigationSelection = {
				kind: 'view-keyframe',
				connectionId,
				direction,
				keyframeId
			};
			this.activeCameraConnectionId = connectionId;
			this.activeCameraDirection = direction;
			this.#expandActiveCameraDirection(direction);
		}

		const preview = this.cameraPreview;
		let movedPlayhead = false;
		if (
			preview?.kind === 'connection' &&
			preview.mode === 'director' &&
			preview.transport === 'paused' &&
			preview.connectionId === connectionId &&
			preview.direction === direction
		) {
			const route = this.getCapturedCameraPreviewRoute(preview.runId);
			if (route) {
				const progress = cameraMotionProgressAtEdgeProgress(
					createCameraMotion(route),
					0,
					keyframe.progress
				);
				movedPlayhead = this.setCameraPreviewPlayhead(progress);
			}
		}
		return changed || movedPlayhead;
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
		const selection = this.navigationSelection;
		if (selection?.kind !== 'view-keyframe') return false;
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
		this.navigationSelection = {
			kind: 'connection',
			connectionId: connection.id
		};
		this.activeCameraConnectionId = connection.id;
		this.activeCameraDirection = selection.direction;
		this.#expandActiveCameraDirection(selection.direction);
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
			(preview && (preview.mode !== 'director' || preview.transport !== 'paused'))
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
		this.#capturedCameraPreviewRoute = null;
		this.#clearCameraFocusRequest();
		this.cameraPreviewFollowEnabled = true;
		this.cameraPreviewRecenterVersion += 1;
		this.cameraPreview = {
			kind: 'node',
			nodeId,
			mode: 'director',
			transport: 'paused',
			runId: this.#nextCameraPreviewRunId++,
			playhead: 0,
			startedAtMs: null
		};
		this.timelineExpanded = true;
		return true;
	}

	#showCameraTimelineConnectionPose(
		connectionId: string,
		direction: CameraConnectionDirection,
		playhead: number
	) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(playhead)) return false;
		const preview = this.cameraPreview;
		if (
			preview?.kind === 'connection' &&
			preview.connectionId === connectionId &&
			preview.direction === direction &&
			preview.mode === 'director' &&
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
		const runId = this.#nextCameraPreviewRunId++;
		this.#capturedCameraPreviewRoute = {
			runId,
			route: cloneResolvedCameraRoute(route)
		};
		this.#clearCameraFocusRequest();
		this.cameraPreviewFollowEnabled = true;
		this.cameraPreviewRecenterVersion += 1;
		const fromNodeId =
			direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
		const toNodeId =
			direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
		this.cameraPreview = {
			kind: 'connection',
			connectionId,
			direction,
			fromNodeId,
			toNodeId,
			mode: 'director',
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
		const selected = this.selectCameraConnectionDirection(
			location.edge.connectionId,
			location.edge.direction
		);
		const shown = this.#showCameraTimelineConnectionPose(
			location.edge.connectionId,
			location.edge.direction,
			location.playhead
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
			edge.endSeconds / timeline.durationSeconds,
			Math.max(edge.startSeconds / timeline.durationSeconds, progress)
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
		const selected = this.selectCameraConnectionDirection(connectionId, direction);
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
		const selected = this.selectNavigationNode(nodeId);
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
		const selected = this.selectViewKeyframe(connectionId, direction, keyframeId);
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
		if (this.isDocumentMutationBlocked || !this.#transactionBefore || !isFiniteVec3(point)) {
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
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (!this.beginDocumentTransaction()) return false;
		if (!this.updateNavigationNodePoint(nodeId, handle, point)) {
			this.cancelDocumentTransaction();
			return false;
		}
		return this.commitDocumentTransaction();
	}

	convertConnectionDraft(connectionId: string) {
		if (!this.#transactionBefore) return false;
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
		if (!this.#transactionBefore || !isFiniteVec3(worldPosition)) return null;
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
		if (!this.#transactionBefore || !isFiniteVec3(worldPosition)) return false;
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
		if (!this.beginDocumentTransaction()) return false;
		node.label = next;
		return this.commitDocumentTransaction();
	}

	commitSelectedNodeFov(fov: number) {
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const node = this.selectedNavigationNode;
		if (!node || Math.abs(node.fov - fov) <= 1e-6) return false;
		if (!this.beginDocumentTransaction()) return false;
		node.fov = fov;
		return this.commitDocumentTransaction();
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
		if (!this.#transactionBefore || !isFiniteVec3(worldTarget)) return false;
		const keyframe = this.selectedViewKeyframe;
		if (!keyframe) return false;
		const current = getSceneCameraViewKeyframeWorldTarget(keyframe);
		if (vec3Matches(current, worldTarget)) return false;
		writeSceneCameraViewKeyframeWorldTarget(keyframe, worldTarget);
		return true;
	}

	commitSelectedViewKeyframeTarget(target: Vec3) {
		if (
			this.isDocumentMutationBlocked ||
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
		if (!this.beginDocumentTransaction()) return false;
		keyframe.cameraTarget = [...target];
		return this.commitDocumentTransaction();
	}

	commitSelectedViewKeyframeFov(fov: number) {
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const keyframe = this.selectedViewKeyframe;
		if (!keyframe || Math.abs(keyframe.fov - fov) <= 1e-6) return false;
		if (!this.beginDocumentTransaction()) return false;
		keyframe.fov = fov;
		return this.commitDocumentTransaction();
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

		const runId = this.#nextCameraPreviewRunId++;
		this.#capturedCameraPreviewRoute = {
			runId,
			route: cloneResolvedCameraRoute(route)
		};
		this.cameraTimelinePlayhead = timelineProgress;
		this.cameraPreview = {
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
		if (!selection || !this.#transactionBefore) return false;
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

		const runId = this.#nextCameraPreviewRunId++;
		this.#capturedCameraPreviewRoute = null;
		if (!current) {
			this.cameraPreviewFollowEnabled = true;
			this.cameraPreviewRecenterVersion += 1;
		}
		const playhead = Math.min(1, Math.max(0, this.cameraTimelinePlayhead));
		this.cameraPreview = {
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
		this.#capturedCameraPreviewRoute = null;
		this.cameraPreviewFollowEnabled = true;
		this.cameraPreviewRecenterVersion += 1;
		this.cameraPreview = {
			kind: 'node',
			nodeId,
			mode,
			transport: 'paused',
			runId: this.#nextCameraPreviewRunId++,
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
		const runId = this.#nextCameraPreviewRunId++;
		this.#capturedCameraPreviewRoute = {
			runId,
			route: cloneResolvedCameraRoute(route)
		};
		this.cameraPreviewFollowEnabled = true;
		this.cameraPreviewRecenterVersion += 1;
		this.cameraPreview = {
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
		this.activeCameraConnectionId = connection.id;
		this.activeCameraDirection = direction;
		this.#expandActiveCameraDirection(direction);
		const selection = this.navigationSelection;
		if (
			selection?.kind === 'view-keyframe' &&
			selection.connectionId === connection.id &&
			selection.direction !== direction
		) {
			this.navigationSelection = {
				kind: 'connection',
				connectionId: connection.id
			};
		}
		const runId = this.#nextCameraPreviewRunId++;
		this.#capturedCameraPreviewRoute = {
			runId,
			route: cloneResolvedCameraRoute(route)
		};
		this.cameraPreviewFollowEnabled = true;
		this.cameraPreviewRecenterVersion += 1;
		this.cameraPreview = {
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
		const runId = this.#nextCameraPreviewRunId++;
		this.#capturedCameraPreviewRoute = route
			? { runId, route: cloneResolvedCameraRoute(route) }
			: null;
		this.cameraPreview = {
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
		const runId = this.#nextCameraPreviewRunId++;
		this.#capturedCameraPreviewRoute = route
			? { runId, route: cloneResolvedCameraRoute(route) }
			: null;
		const playhead = preview.transport === 'complete' ? 0 : preview.playhead;
		this.cameraPreview = {
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
		const preview = this.cameraPreview;
		if (!preview || preview.transport !== 'playing') return false;
		this.cameraPreview = {
			...preview,
			transport: 'paused',
			startedAtMs: null
		};
		return true;
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
		this.cameraPreview = {
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
		if (!this.isDirectorCameraPreview) return false;
		this.cameraPreviewFollowEnabled = !this.cameraPreviewFollowEnabled;
		return true;
	}

	recenterCameraPreview() {
		if (!this.isDirectorCameraPreview) return false;
		this.cameraPreviewRecenterVersion += 1;
		return true;
	}

	markCameraPreviewStarted(runId: number, startedAtMs: number) {
		const preview = this.cameraPreview;
		if (
			!preview ||
			preview.kind === 'node' ||
			preview.runId !== runId ||
			preview.transport !== 'playing' ||
			preview.startedAtMs !== null ||
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
			preview.kind === 'node' ||
			preview.runId !== runId ||
			preview.transport !== 'playing' ||
			preview.startedAtMs === null
		) {
			return false;
		}
		this.cameraPreview = {
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
		if (this.#restoreCameraPreview && !this.#restoreCameraPreview()) return false;
		this.cameraPreview = null;
		this.#capturedCameraPreviewRoute = null;
		this.cameraPreviewFollowEnabled = true;
		// Phase 2.1: Preview Stop preserves the active connection + direction so any
		// previously-selected keyframe remains reachable through tree/timeline/3D.
		return true;
	}

	getCapturedCameraPreviewRoute(runId: number) {
		const capture = this.#capturedCameraPreviewRoute;
		return capture?.runId === runId
			? cloneResolvedCameraRoute(capture.route)
			: null;
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
		this.dropToFloorRequestId += 1;
	}

	selectRoom(id: MuseumRoomId) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || id !== 'paris') return false;
		const changed = this.selectedRoomId !== id;
		this.selectedRoomId = id;
		if (changed) this.#clearPlacementSelection();
		return changed;
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
			this.translationSnapEnabled = !this.translationSnapEnabled;
			return true;
		}
		if (this.transformMode === 'rotate') {
			this.rotationSnapEnabled = !this.rotationSnapEnabled;
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
		this.timelineHeight = Math.min(
			EDITOR_TIMELINE_MAX_HEIGHT,
			Math.max(EDITOR_TIMELINE_MIN_HEIGHT, Math.round(value))
		);
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
		this.treeExpandedRoomIds = this.treeExpandedRoomIds.includes(roomId)
			? this.treeExpandedRoomIds.filter((candidate) => candidate !== roomId)
			: [...this.treeExpandedRoomIds, roomId];
		return true;
	}

	/** Phase 1.1 — toggle a cluster row's expansion in the sidebar tree. */
	toggleClusterTreeExpansion(clusterId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.treeExpandedClusterIds = this.treeExpandedClusterIds.includes(clusterId)
			? this.treeExpandedClusterIds.filter((candidate) => candidate !== clusterId)
			: [...this.treeExpandedClusterIds, clusterId];
		return true;
	}

	/** Phase 1.1 — collapse a cluster row without affecting other rows. */
	removeClusterTreeExpansion(clusterId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (this.treeExpandedClusterIds.includes(clusterId)) {
			this.treeExpandedClusterIds = this.treeExpandedClusterIds.filter(
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
		if (!this.treeExpandedRoomIds.includes(roomId)) {
			this.treeExpandedRoomIds = [...this.treeExpandedRoomIds, roomId];
		}
		return true;
	}

	/** Phase 1.1 — additive helper for inspector grouping actions that need to reveal a cluster. */
	ensureClusterTreeExpanded(clusterId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		if (!this.treeExpandedClusterIds.includes(clusterId)) {
			this.treeExpandedClusterIds = [...this.treeExpandedClusterIds, clusterId];
		}
		return true;
	}

	/** Phase 2.1 — toggle a connection's collapsible body in the Camera sidebar tree. */
	toggleCameraConnectionTreeExpansion(connectionId: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		this.treeExpandedCameraConnectionIds = this.treeExpandedCameraConnectionIds.includes(
			connectionId
		)
			? this.treeExpandedCameraConnectionIds.filter((candidate) => candidate !== connectionId)
			: [...this.treeExpandedCameraConnectionIds, connectionId];
		return true;
	}

	/** Phase 2.1 — toggle a Forward/Reverse subsection under a connection. */
	toggleCameraDirectionTreeExpansion(
		connectionId: string,
		direction: CameraConnectionDirection
	) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const key = cameraDirectionTreeKey(connectionId, direction);
		this.treeExpandedCameraDirectionKeys = this.treeExpandedCameraDirectionKeys.includes(key)
			? this.treeExpandedCameraDirectionKeys.filter((candidate) => candidate !== key)
			: [...this.treeExpandedCameraDirectionKeys, key];
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
		this.selectRoom('paris');
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
		this.selectPlacement(id);
		this.setStatusMessage(`Placed ${asset.name}`);
		return id;
	}

	beginConnectedNodePlacement() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const source = this.selectedNavigationNode;
		const roomId = this.selectedRoomId;
		if (!source) {
			this.setStatusMessage('Select a source camera node');
			return false;
		}
		if (!roomId) {
			this.setStatusMessage('Select the editable Paris room first');
			return false;
		}
		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.pendingNavigationCommand = {
			kind: 'place-connected-node',
			sourceNodeId: source.id,
			roomId
		};
		this.setNavigationHover(null);
		this.setStatusMessage(`Click the ${roomId} floor to add a connected camera node`);
		return true;
	}

	beginConnectExistingNodes() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const source = this.selectedNavigationNode;
		if (!source) {
			this.setStatusMessage('Select a source camera node');
			return false;
		}
		this.cancelAssetPlacement();
		this.cancelPendingFrame();
		this.pendingNavigationCommand = {
			kind: 'connect-existing',
			sourceNodeId: source.id
		};
		this.setNavigationHover(null);
		this.setStatusMessage('Choose another camera node');
		return true;
	}

	cancelPendingNavigation(message?: string) {
		const changed = this.pendingNavigationCommand !== null;
		this.pendingNavigationCommand = null;
		if (message) this.setStatusMessage(message);
		return changed;
	}

	createPendingNavigationNodeAt(floorWorld: Vec3, cameraForwardWorld: Vec3) {
		const pending = this.pendingNavigationCommand;
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			pending?.kind !== 'place-connected-node' ||
			!isFiniteVec3(floorWorld) ||
			!isFiniteVec3(cameraForwardWorld)
		) {
			return null;
		}
		const source = this.document.navigationNodes.find(
			(node) => node.id === pending.sourceNodeId
		);
		if (!source) {
			this.cancelPendingNavigation('Source camera node no longer exists');
			return null;
		}

		let forwardX = cameraForwardWorld[0];
		let forwardZ = cameraForwardWorld[2];
		let forwardLength = Math.hypot(forwardX, forwardZ);
		if (forwardLength <= 1e-6) {
			const origin = roomPoint(pending.roomId, [0, 0, 0]);
			const fallback = roomPoint(pending.roomId, [0, 0, -1]);
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
		const connectionId = reserveEntityId(
			`${source.id}-${nodeId}`,
			new Set(this.document.connections.map((connection) => connection.id))
		);

		if (!this.beginDocumentTransaction()) return null;
		this.document.navigationNodes.push({
			id: nodeId,
			roomId: pending.roomId,
			label: `Camera Node ${number}`,
			position: roomLocalPoint(pending.roomId, eyeWorld),
			cameraTarget: roomLocalPoint(pending.roomId, targetWorld),
			fov: CAMERA_NODE_CREATION_DEFAULTS.fov,
			connectedNodeIds: [source.id]
		});
		if (!source.connectedNodeIds.includes(nodeId)) source.connectedNodeIds.push(nodeId);
		this.document.connections.push({
			id: connectionId,
			fromNodeId: source.id,
			toNodeId: nodeId,
			clearance: CAMERA_NODE_CREATION_DEFAULTS.clearance,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		});
		if (!this.commitDocumentTransaction()) return null;

		this.pendingNavigationCommand = null;
		this.navigationSelection = {
			kind: 'node',
			nodeId,
			handle: 'position'
		};
		this.focusNavigationNode(nodeId);
		this.setStatusMessage(`Added Camera Node ${number}`);
		return nodeId;
	}

	connectPendingNavigationNode(destinationNodeId: string) {
		const pending = this.pendingNavigationCommand;
		if (
			this.isDocumentMutationBlocked ||
			this.isEditorInteractionActive ||
			pending?.kind !== 'connect-existing'
		) {
			return false;
		}
		const source = this.document.navigationNodes.find(
			(node) => node.id === pending.sourceNodeId
		);
		const destination = this.document.navigationNodes.find(
			(node) => node.id === destinationNodeId
		);
		if (!source || !destination) {
			this.setStatusMessage('Destination camera node is unavailable');
			return false;
		}
		if (source.id === destination.id) {
			this.setStatusMessage('A camera node cannot connect to itself');
			return false;
		}
		const duplicate = this.document.connections.some(
			(connection) =>
				(connection.fromNodeId === source.id && connection.toNodeId === destination.id) ||
				(connection.fromNodeId === destination.id && connection.toNodeId === source.id)
		);
		if (duplicate) {
			this.setStatusMessage('These camera nodes are already connected');
			return false;
		}

		const connectionId = reserveEntityId(
			`${source.id}-${destination.id}`,
			new Set(this.document.connections.map((connection) => connection.id))
		);
		if (!this.beginDocumentTransaction()) return false;
		if (!source.connectedNodeIds.includes(destination.id)) {
			source.connectedNodeIds.push(destination.id);
		}
		if (!destination.connectedNodeIds.includes(source.id)) {
			destination.connectedNodeIds.push(source.id);
		}
		this.document.connections.push({
			id: connectionId,
			fromNodeId: source.id,
			toNodeId: destination.id,
			clearance: CAMERA_NODE_CREATION_DEFAULTS.clearance,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		});
		if (!this.commitDocumentTransaction()) return false;

		this.pendingNavigationCommand = null;
		this.navigationSelection = { kind: 'connection', connectionId };
		this.setStatusMessage('Connected camera nodes');
		return true;
	}

	isPlacementSelectable(id: string) {
		if (!this.selectedRoomId) return false;
		return this.document.objects.some(
			(object) => object.id === id && object.roomId === this.selectedRoomId
		);
	}

	/** Select a placement from the tree without requiring a separate room-row click first. */
	selectPlacementFromTree(
		placementId: string,
		options: EditorPlacementTreeSelectionOptions = {}
	) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const placement = this.document.objects.find((object) => object.id === placementId);
		if (!placement) return false;

		this.selectRoom(placement.roomId);
		if (this.selectedRoomId !== placement.roomId) return false;
		this.ensureRoomTreeExpanded(placement.roomId);

		const additive = options.additive ?? false;
		const selected = additive
			? this.togglePlacement(placementId)
			: this.selectPlacement(placementId);
		if (!selected) return false;

		const shouldFocus = options.focus ?? !additive;
		if (shouldFocus) this.focusPlacement(placementId);
		return true;
	}

	selectPlacement(id: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || !this.isPlacementSelectable(id)) {
			return false;
		}
		this.cancelPendingFrame();
		this.navigationSelection = null;
		// Phase 2.1: leaving a connection focus resets the persistent camera discovery.
		this.activeCameraConnectionId = null;
		this.activeCameraDirection = 'forward';
		if (this.selectedPlacementId !== id) this.transformMode = 'rotate';
		this.selectedPlacementIds = [id];
		this.selectedClusterId = null;
		return true;
	}

	selectPlacements(ids: string[]) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const next = [...new Set(ids)].filter((id) => this.isPlacementSelectable(id));
		if (next.length === 0) {
			this.deselect();
			return false;
		}
		this.cancelPendingFrame();
		this.navigationSelection = null;
		// Phase 2.1: leaving a connection focus resets the persistent camera discovery.
		this.activeCameraConnectionId = null;
		this.activeCameraDirection = 'forward';
		this.selectedPlacementIds = next;
		this.selectedClusterId = null;
		this.transformMode = 'rotate';
		return true;
	}

	togglePlacement(id: string) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || !this.isPlacementSelectable(id)) {
			return false;
		}
		this.cancelPendingFrame();
		this.navigationSelection = null;
		// Phase 2.1: leaving a connection focus resets the persistent camera discovery.
		this.activeCameraConnectionId = null;
		this.activeCameraDirection = 'forward';
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
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const cluster = this.clusters.find((candidate) => candidate.id === id);
		if (!cluster || cluster.roomId !== this.selectedRoomId) return false;
		this.cancelPendingFrame();
		this.navigationSelection = null;
		// Phase 2.1: leaving a connection focus resets the persistent camera discovery.
		this.activeCameraConnectionId = null;
		this.activeCameraDirection = 'forward';
		this.selectedClusterId = cluster.id;
		this.selectedPlacementIds = [...cluster.memberIds];
		this.transformMode = 'rotate';
		return true;
	}

	/** Select and reveal a valid cluster from the tree using its authored room ownership. */
	selectClusterFromTree(
		clusterId: string,
		options: EditorClusterTreeSelectionOptions = {}
	) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const cluster = this.clusters.find((candidate) => candidate.id === clusterId);
		if (!cluster || cluster.memberIds.length === 0) return false;
		const ownsEveryMember = cluster.memberIds.every((memberId) =>
			this.document.objects.some(
				(object) => object.id === memberId && object.roomId === cluster.roomId
			)
		);
		if (!ownsEveryMember) return false;

		this.selectRoom(cluster.roomId);
		if (this.selectedRoomId !== cluster.roomId) return false;
		this.ensureRoomTreeExpanded(cluster.roomId);
		this.ensureClusterTreeExpanded(cluster.id);
		if (!this.selectCluster(cluster.id)) return false;
		if (options.focus ?? true) this.focusSelection();
		return true;
	}

	deselect() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const changed =
			this.selectedPlacementIds.length > 0 ||
			this.selectedClusterId !== null ||
			this.navigationSelection !== null ||
			this.activeCameraConnectionId !== null;
		this.cancelPendingFrame();
		this.#clearPlacementSelection();
		this.navigationSelection = null;
		// Phase 2.1: dropping the active connection surfaces an empty camera workspace.
		this.activeCameraConnectionId = null;
		this.activeCameraDirection = 'forward';
		return changed;
	}

	#clearPlacementSelection() {
		this.selectedPlacementIds = [];
		this.selectedClusterId = null;
	}

	cyclePlacement(ids: string[]) {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const selectableIds = ids.filter((id) => this.isPlacementSelectable(id));
		const next = nextPlacementCycleId(this.selectedPlacementId, selectableIds);
		if (next === undefined) return false;
		return this.selectPlacement(next);
	}

	selectAllInRoom() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive) return false;
		const roomId = this.selectedRoomId;
		if (!roomId) return false;
		return this.selectPlacements(
			this.document.objects
				.filter((object) => object.roomId === roomId)
				.map((object) => object.id)
		);
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
		this.selectCluster(cluster.id);
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
		if (committed && this.selectedClusterId === clusterId) this.selectCluster(clusterId);
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
			this.selectCluster(clusterId);
		} else if (wasSelectedCluster) {
			this.selectedClusterId = null;
			this.selectPlacements(cluster.memberIds);
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
		if (committed && wasSelected) this.selectPlacements(memberIds);
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
		this.selectPlacements([...copyIds.slice(1), copyIds[0]!]);
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
		this.deselect();
		this.setStatusMessage(`Deleted ${ids.length} object${ids.length === 1 ? '' : 's'}`);
		return true;
	}

	deletePlacement(id: string) {
		return this.deletePlacements([id]);
	}

	beginDocumentTransaction() {
		if (this.isDocumentMutationBlocked || this.#transactionBefore) return false;
		this.#transactionBefore = cloneMuseumSceneDocument(this.document);
		return true;
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
		if (this.isDocumentMutationBlocked) return false;
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
		this.#clearPlacementSelection();
		this.navigationSelection = null;
		this.selectedRoomId = null;
		this.cameraFocusKind = null;
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		this.#replaceDocument(validation.document);
		this.baselineCanonicalJson = validation.canonicalJson;
		this.#past = [];
		this.#future = [];
		this.#bumpHistoryVersion();
		return true;
	}

	resetToCheckedInDocument() {
		return this.importDocument(museumSceneDocument);
	}

	#prepareDocumentReplacement() {
		if (this.viewKeyframeProgressDrag) this.cancelViewKeyframeProgressDrag();
		if (this.cameraPreview && !this.stopCameraPreview()) return false;
		if (this.transformInteractionActive && !this.#cancelTransform?.()) return false;
		if (this.directPathInteractionActive && !this.#cancelDirectPathDrag?.()) return false;
		if (this.#transactionBefore) this.cancelDocumentTransaction();
		return true;
	}

	undo() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || this.#transactionBefore || this.#past.length === 0) return false;
		this.cancelPendingFrame();
		this.cancelPendingNavigation();
		const previous = this.#past.pop();
		if (!previous) return false;
		this.#future.push(cloneMuseumSceneDocument(this.document));
		if (this.#future.length > HISTORY_LIMIT) this.#future.shift();
		this.#replaceDocument(previous);
		this.#bumpHistoryVersion();
		return true;
	}

	redo() {
		if (this.isDocumentMutationBlocked || this.isEditorInteractionActive || this.#transactionBefore || this.#future.length === 0) return false;
		this.cancelPendingFrame();
		this.cancelPendingNavigation();
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
		const initialNodeId = nextScene.navigationNodes.some((node) => node.id === 'paris-seat')
			? 'paris-seat'
			: nextScene.navigationNodes[0]?.id;
		if (!initialNodeId) throw new Error('A museum scene needs at least one navigation node');
		const nextState = createMuseumState(createNavigationGraph(nextScene), initialNodeId);
		this.scene = nextScene;
		this.state = nextState;
		this.#refreshPausedDirectorPreview();
	}

	#refreshPausedDirectorPreview() {
		const preview = this.cameraPreview;
		if (!preview || preview.mode !== 'director' || preview.transport !== 'paused') return;
		const runId = this.#nextCameraPreviewRunId++;
		if (preview.kind === 'node') {
			this.#capturedCameraPreviewRoute = null;
			this.cameraPreview = { ...preview, runId };
			return;
		}
		if (preview.kind === 'tour') {
			this.#capturedCameraPreviewRoute = null;
			if (this.#readCameraTimeline()) this.cameraPreview = { ...preview, runId };
			return;
		}
		try {
			const route = this.#resolveCameraPreviewRoute(preview);
			this.#capturedCameraPreviewRoute = {
				runId,
				route: cloneResolvedCameraRoute(route)
			};
			this.cameraPreview = { ...preview, runId };
		} catch (error) {
			this.setStatusMessage(
				error instanceof Error ? error.message : 'Camera preview route is unavailable'
			);
		}
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

	registerAnchorHelperRoot(connectionId: string, anchorId: string, root: Object3D) {
		const key = anchorHelperKey(connectionId, anchorId);
		if (this.#anchorHelperRoots.get(key) === root) return;
		this.#anchorHelperRoots.set(key, root);
		this.#bumpRegistryVersion();
	}

	unregisterAnchorHelperRoot(connectionId: string, anchorId: string, root: Object3D) {
		const key = anchorHelperKey(connectionId, anchorId);
		if (this.#anchorHelperRoots.get(key) !== root) return;
		this.#anchorHelperRoots.delete(key);
		this.#bumpRegistryVersion();
	}

	getAnchorHelperRoot(connectionId: string, anchorId: string): Object3D | undefined {
		void this.registryVersion;
		return this.#anchorHelperRoots.get(anchorHelperKey(connectionId, anchorId));
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
		const key = viewKeyframeHelperKey(connectionId, direction, keyframeId);
		if (this.#viewKeyframeTargetHelperRoots.get(key) === root) return;
		this.#viewKeyframeTargetHelperRoots.set(key, root);
		this.#bumpRegistryVersion();
	}

	unregisterViewKeyframeTargetHelperRoot(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string,
		root: Object3D
	) {
		const key = viewKeyframeHelperKey(connectionId, direction, keyframeId);
		if (this.#viewKeyframeTargetHelperRoots.get(key) !== root) return;
		this.#viewKeyframeTargetHelperRoots.delete(key);
		this.#bumpRegistryVersion();
	}

	getViewKeyframeTargetHelperRoot(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	): Object3D | undefined {
		void this.registryVersion;
		return this.#viewKeyframeTargetHelperRoots.get(
			viewKeyframeHelperKey(connectionId, direction, keyframeId)
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
}

export function createMuseumEditorStore() {
	return new MuseumEditorStore();
}

export type { MuseumSceneDocument, RuntimeMuseumScene };
