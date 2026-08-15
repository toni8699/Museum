import {
	getNode,
	type MuseumSceneDocument,
	type RuntimeMuseumScene,
	type SceneCameraViewKeyframe,
	type SceneObjectCluster,
	type SceneLightKind,
	type ScenePrimitiveDimensions,
	type ScenePrimitiveKind
} from '$lib/content/scene';
import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import { museumSceneDocument, chopinRuntime } from '$lib/content/chopin-project';
import {
	serializeSceneDocument,
	validateSceneDocument,
	type SceneDocumentValidationResult
} from '$lib/content/scene-codec';	import type { MaterialId } from '$lib/types/materials';
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
import type { LightFieldPatch } from './editor-lights';
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
import { EditorHistoryController, type LayoutHistoryHost } from './store/history-controller.svelte';
import { EditorSelectionStore } from './store/selection-store.svelte';
import { EditorSelectionActions } from './store/selection-actions.svelte';
import { EditorMutationGuards } from './store/mutation-guards.svelte';
import {
	EditorNavigationGraphMutator,
	CAMERA_NODE_CREATION_DEFAULTS,
	validateSceneConnectionTiming
} from './store/navigation-graph-mutator.svelte';
import { EditorViewKeyframeController } from './store/view-keyframe-controller.svelte';
import { EditorCameraTimelineController } from './store/camera-timeline-controller.svelte';
// Slice 2 — preview + timeline playback orchestration controller. The host
// surface narrows the facade members the orchestration reads/writes; see
// `store/camera-preview-commands.svelte.ts` for the method list and the plan
// deviation note (Group A timeline methods stay on the facade as one-line
// delegates to `cameraTimelineController`).
import {
	EditorCameraPreviewCommands,
	type EditorCameraPreviewCommandsHost
} from './store/camera-preview-commands.svelte';
// Slice 3 — Phase 5.2 texture library + material-instance assignment
// orchestration. The pure mutator (`material-resource-mutator.svelte.ts`)
// stays put; only the orchestration moves into this controller.
import {
	EditorTextureLibraryController,
	type EditorTextureLibraryControllerHost
} from './store/texture-library-controller.svelte';
import { EditorPlacementClusterMutator } from './store/placement-cluster-mutator.svelte';
import { EditorPathAnchorMutator } from './store/path-anchor-mutator.svelte';
import { EditorMaterialResourceMutator } from './store/material-resource-mutator.svelte';
import {
	createControllerHosts,
	type EditorControllerHostSource
} from './store/controller-hosts';
import { createTextureVerifier, type TextureVerifier } from './texture-verifier';
import { isSafeTextureUri } from '$lib/content/texture-uri';
import { BinaryTextureStore } from './store/binary-texture-store.svelte';
import {
	buildPackage,
	type PackageExportResult
} from './export/package-exporter';
import { importPackage } from './import/package-importer';
import {
	computeProjectExportBlocker,
	type ProjectExportBlocker
} from './store/project-export-store.svelte';

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
	EditorPendingMaterialEdit,
	EditorTextureLoadState,
	MaterialEditDecision,
	MaterialInstancePatch,
	NavigationSelection
} from './museum-editor.types';
// Re-exports below keep the pre-slice public surface compiling unchanged.
import {
	anchorHelperKey,
	cameraDirectionTreeKey,
	cameraHelperKey,
	viewKeyframeHelperKey,
	CAMERA_DIRECTION_TREE_KEY_SEPARATOR
} from './helpers/scene-keys';
// Slice 3 — re-export the moved module helpers so the 40 consumer imports
// (`import { cloneMuseumSceneDocument } from '$lib/editor/museum-editor.svelte'`
// and any `import { cloneResolvedCameraRoute } ...`) keep compiling unchanged
// until Slice 6 collapses the facade surface.
import { cloneMuseumSceneDocument } from './helpers/document-clone';
export { cloneMuseumSceneDocument };
export { cloneResolvedCameraRoute } from './helpers/route-clone';

const STATUS_MESSAGE_MS = 2500;

// Phase 9.2 — `CAMERA_NODE_CREATION_DEFAULTS` + `validateSceneConnectionTiming`
// moved to `store/navigation-graph-mutator.svelte.ts`. Re-exported here so the
// pre-9.2 public surface (`museum-editor.svelte` importers) stays stable.
export { CAMERA_NODE_CREATION_DEFAULTS, validateSceneConnectionTiming };

// Slice 3 — `cloneMuseumSceneDocument` lives on `helpers/document-clone.ts`
// now; re-exported above so the 40 consumer imports unchanged.

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
} from './museum-editor.types';/** Bottom-panel frame measurements. Session-only, never serialized. */
export const EDITOR_TIMELINE_COLLAPSED_HEIGHT = 36;
export const EDITOR_TIMELINE_MIN_HEIGHT = 220;
export const EDITOR_TIMELINE_MAX_HEIGHT = 360;
export const EDITOR_TIMELINE_DEFAULT_HEIGHT = 280;

// Slice 3 — `cameraDirectionTreeKey` lives on `helpers/scene-keys.ts`
// (alongside `CAMERA_DIRECTION_TREE_KEY_SEPARATOR`); imported above.
// `cloneResolvedCameraRoute` + `cloneRoutePoint` + `isRoutePointTuple` live
// on `helpers/route-clone.ts`; re-exported above for any consumer that
// imported them from the god file before Slice 3.

// Phase 9.5 — `vec3Matches` / `isFiniteVec3` live on path-anchor / view-key
// controllers; no remaining facade callers.

// Slice 3 v2 sub-task 3.4 deleted the pre-slice helper `documentsMatch` because
// EditorDocumentStore now exposes a public static of the same name
// (EditorDocumentStore.documentsMatch) and the god file's caller migrated to it
// during sub-task 3.4 (line ~4142). The two helpers were JSON-stringify
// equality — single source of truth on the sub-store now.

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
	private readonly documentStore: EditorDocumentStore;
	/** True when this store backs the frozen `/museum/editor` relic. */
	private readonly relicMode: boolean;
	/** H1 S2 — the document the store was constructed with (the reset target). */
	private readonly bootDocument: MuseumSceneDocument;
	get document(): MuseumSceneDocument {
		return this.documentStore.document;
	}
	get scene(): RuntimeMuseumScene {
		return this.documentStore.scene;
	}
	get rooms(): LayoutRoomRegistry {
		return this.documentStore.rooms;
	}
	/**
	 * H1 S2 — keep the room registry in sync with the live project layout
	 * (the boot-empty editor re-derives it from `layoutPreview.project.layout`
	 * after every layout mutation) and re-resolve the runtime scene against it,
	 * so a moved room immediately moves the rendered node/entity helpers. The
	 * frozen relic never calls this.
	 */
	updateRooms(rooms: LayoutRoomRegistry) {
		this.documentStore.updateRooms(rooms);
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
	/**
	 * Phase 5.4 plain-JSON export gate. Reads the document texture list
	 * against the binary store, then runs the package-rewrite predicate
	 * (any URI under `/textures/package-<12 hex>/...` is blocked unless
	 * the binary store has bytes for it). Reactive: every mutation to
	 * either `document.textures` or `BinaryTextureStore` re-evaluates.
	 */
	get projectExportBlocker(): ProjectExportBlocker | null {
		return computeProjectExportBlocker(this.document, BinaryTextureStore);
	}
	/** Count of unresolved textures. Convenience accessor. */
	get unresolvedTextureCount(): number {
		return this.projectExportBlocker?.unresolvedTextures.length ?? 0;
	}
	// Slice 3 v2 sub-task 3.5 — preview FSM ownership (Option 3 pragmatic facade).
	// State lives on `previewController`; getters below preserve `store.cameraPreview`
	// / `store.cameraPreviewFollowEnabled` / `store.cameraPreviewRecenterVersion`
	// consumer reads. Internal writes go through `this.previewController.*`.
	private readonly previewController: EditorCameraPreviewController;
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
	private readonly historyController: EditorHistoryController;
	get historyVersion(): number {
		return this.historyController.version;
	}

	// Slice 2 (Priority-1 file splits) — preview + timeline playback
	// orchestration. Owns the move of `playActiveConnectionEdge`,
	// `previewActiveConnectionReverse`, `previewGuidedTour`,
	// `previewSelectedNode`, `previewSelectedTransition`,
	// `previewSelectedConnection`, the FSM command zoo
	// (`setCameraPreviewMode` … `getCapturedCameraPreviewRoute`), and the
	// private route plumbing (`resolveCameraPreviewRoute`,
	// `prepareCameraPreview`, `seedEmptyReverseForSelectedForwardTrack`).
	// Instantiated after `previewController` + `historyController`; the
	// facade satisfies the host surface structurally via a single cast.
	private readonly cameraPreviewCommands: EditorCameraPreviewCommands;

	// Slice 3 (Priority-1 file splits) — Phase 5.2 texture library +
	// material-instance assignment orchestration. Owns the move of the
	// 7-texture-method facade block (`registerTexture`, `probeTexture`,
	// `requestMaterialEdit`, `requestTextureAssignment`,
	// `confirmPendingMaterialEdit`, `cancelPendingMaterialEdit`,
	// `makeMaterialInstanceUnique`) plus the `textureVerifier` ownership
	// (the constructor still defaults `options.textureVerifier ??
	// createTextureVerifier()` and passes the resolved value in).
	// `recentTextureIds` / `textureLoadStates` / `pendingMaterialEdit`
	// getters stay on the facade as the public session surface.
	private readonly textureLibraryController: EditorTextureLibraryController;

	/**
	 * Slice 1 (Priority-1 split) — the seven controller host object literals
	 * moved to `store/controller-hosts.ts`. One factory call builds all seven
	 * from the structural `EditorControllerHostSource` surface; the two
	 * ECMAScript-private method bridges (`#prepareCameraPreview`,
	 * `#seedEmptyReverseForSelectedForwardTrack`) are bound here because they
	 * are invisible through the structural cast.
	 */
	private readonly hosts = createControllerHosts(
		this as unknown as EditorControllerHostSource,
		{
			// Slice 2 — these used to be ECMAScript-private on this class; they
			// live on `cameraPreviewCommands` now and the bridges forward.
			prepareCameraPreview: () => this.cameraPreviewCommands.prepareCameraPreview(),
			seedEmptyReverseForSelectedForwardTrack: () =>
				this.cameraPreviewCommands.seedEmptyReverseForSelectedForwardTrack()
		}
	);

	constructor(options: MuseumEditorStoreOptions = {}) {
		this.relicMode = options.relic === true;
		this.bootDocument = cloneMuseumSceneDocument(options.document ?? museumSceneDocument);
		this.documentStore = new EditorDocumentStore(
			options.document,
			options.rooms ?? chopinRuntime.rooms
		);
		this.previewController = new EditorCameraPreviewController(this.documentStore);
		this.historyController = new EditorHistoryController(
			this.documentStore,
			this.previewController
		);
		// Slice 2 — instantiate before the controllers whose host literals
		// forward through the bridges above. The browser-only initialization is
		// trivial (one structural cast) so this stays cheap.
		this.cameraPreviewCommands = new EditorCameraPreviewCommands(
			this as unknown as EditorCameraPreviewCommandsHost
		);
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
			this.hosts.selection
		);
		this.navigationGraphMutator = new EditorNavigationGraphMutator(
			this.selectionActions,
			this.hosts.navigationGraph
		);
		this.viewKeyframeController = new EditorViewKeyframeController(
			this.selectionActions,
			this.hosts.viewKeyframe
		);
		this.cameraTimelineController = new EditorCameraTimelineController(
			this.selectionActions,
			this.hosts.cameraTimeline
		);
		this.placementClusterMutator = new EditorPlacementClusterMutator(
			this.selectionActions,
			this.hosts.placementCluster
		);
		this.pathAnchorMutator = new EditorPathAnchorMutator(this.hosts.pathAnchor);
		this.materialResourceMutator = new EditorMaterialResourceMutator(
			this.hosts.materialResource
		);
		this.textureVerifier = options.textureVerifier ?? createTextureVerifier();
		// Slice 3 — instantiate after `materialResourceMutator` (which the
		// controller delegates into) + after `textureVerifier` (passed in as
		// constructor arg). The structural cast reads every facade slot
		// lazily, so the literal-only field init here is fine.
		this.textureLibraryController = new EditorTextureLibraryController(
			this as unknown as EditorTextureLibraryControllerHost,
			this.textureVerifier
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
	/**
	 * Phase 6.2 — most-recent placement id the user explicitly mutated.
	 * Drives the multi-select "Active Object" pivot branch. Cleared on
	 * `deselect()`. Distinct from `selectedPlacementId` (which is the
	 * array-tail position; `selectAllInRoom` and bulk imports reorder ids).
	 */
	get lastSelectedId(): string | null {
		return this.selectionActions.lastSelectedId;
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
	/** Session-only per-axis placement scale memory used by the editor renderer. */
	get placementScaleVectorVersion(): number {
		return this.session.placementScaleVectorVersion;
	}
	getPlacementScaleVector(id: string) {
		return this.session.getPlacementScaleVector(id);
	}

	/** Session-only asset placement and pointer/shortcut coordination. */
	get pendingPlacementAssetId(): string | null {
		return this.session.pendingPlacementAssetId;
	}
	set pendingPlacementAssetId(value: string | null) {
		this.session.setPendingPlacementAssetId(value);
	}
	get pendingPlacementPrimitiveKind(): ScenePrimitiveKind | null {
		return this.session.pendingPlacementPrimitiveKind;
	}
	set pendingPlacementPrimitiveKind(value: ScenePrimitiveKind | null) {
		this.session.setPendingPlacementPrimitiveKind(value);
	}
	get pendingPlacementLightKind(): SceneLightKind | null {
		return this.session.pendingPlacementLightKind;
	}
	set pendingPlacementLightKind(value: SceneLightKind | null) {
		this.session.setPendingPlacementLightKind(value);
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

	/**
	 * Phase 5.2 — texture registration / material-instance assignment mutator.
	 * Facade methods below delegate to it.
	 */
	readonly materialResourceMutator: EditorMaterialResourceMutator;

	/**
	 * Phase 5.2 — editor-only image load/decode verifier. Browser default;
	 * tests inject a deterministic loader through `MuseumEditorStoreOptions`.
	 */
	private readonly textureVerifier: TextureVerifier;

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
	get scaleSnapEnabled(): boolean {
		return this.session.scaleSnapEnabled;
	}
	set scaleSnapEnabled(value: boolean) {
		this.session.setScaleSnapEnabled(value);
	}
	get scaleSnap(): number {
		return this.session.scaleSnap;
	}
	set scaleSnap(value: number) {
		this.session.setScaleSnap(value);
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

	/** Phase 5.2 — session-only texture library state (never serialized). */
	get recentTextureIds(): string[] {
		return this.session.recentTextureIds;
	}
	get textureLoadStates(): Record<string, EditorTextureLoadState> {
		return this.session.textureLoadStates;
	}
	get pendingMaterialEdit(): EditorPendingMaterialEdit | null {
		return this.session.pendingMaterialEdit;
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
		return this.document.entities.length;
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
				position: this.rooms.point(pending.roomId, pending.position),
				cameraTarget: this.rooms.point(pending.roomId, pending.cameraTarget),
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
			this.pendingPlacementPrimitiveKind ||
			this.pendingPlacementLightKind ||
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

	/** H1 S2 — true when the resolved graph yields a valid guided tour. */
	get canStartTourPreview(): boolean {
		return this.getCameraTimeline() !== null;
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
		return this.document.entities.find((object) => object.id === id);
	}

	get selectedCluster() {
		const id = this.selectedClusterId;
		return id ? this.clusters.find((cluster) => cluster.id === id) : undefined;
	}

	get selectedTransform() {
		const target = this.selectedObject;
		if (!target) return undefined;
		void this.session.placementScaleVectorVersion;
		const override =
			this.session.getPlacementScaleVector(target.id) ?? null;
		return placementTransformFromDocument(target, override);
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

	// Slice 2 — `@internal` shims the `EditorCameraPreviewCommands` host cast
	// binds to. Callers distinguish `null` (no canceler / restorer installed)
	// from `false` (canceler refused) so retry paths in the orchestration
	// can leave the operation intact. These methods are facade-internal
	// bridge surface — not part of the public consumer-facing API.
	/**
	 * Run the transform canceler if a gizmo drag is live.
	 * `@internal` bridge — `null` ⇢ no canceler installed; `false` ⇢ refused.
	 */
	cancelTransform(): boolean | null {
		return this.#cancelTransform ? this.#cancelTransform() : null;
	}
	/**
	 * Run the direct path drag canceler if a curve drag is live.
	 * `@internal` bridge — `null` ⇢ no canceler installed; `false` ⇢ refused.
	 */
	cancelDirectPathDrag(): boolean | null {
		return this.#cancelDirectPathDrag ? this.#cancelDirectPathDrag() : null;
	}
	/**
	 * Cancel any active direct-framing drag. Returns `true` (and clears the
	 * active flag) when no drag is live or the registered canceler accepts.
	 * Returns `false` when the canceler refused so the caller can retry.
	 * `@internal` bridge.
	 */
	cancelDirectFramingDragOrFail(): boolean {
		return this.#cancelDirectFramingDragOrFail();
	}
	/**
	 * Run the camera-preview restorer installed by the camera rig.
	 * `@internal` bridge — `null` ⇢ no restorer installed; `false` ⇢ refused.
	 */
	restoreCameraPreview(): boolean | null {
		return this.#restoreCameraPreview ? this.#restoreCameraPreview() : null;
	}
	/**
	 * Session silent clear — no focus version bump (9.1 gotcha).
	 * `@internal` bridge.
	 */
	clearCameraFocusRequest(): void {
		this.session.clearCameraFocusRequest();
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
	}	// Slice 2 — preview + timeline playback orchestration. Each method here is
	// a one-line delegate to `cameraPreviewCommands`; the controller owns the
	// verbatim body (see `store/camera-preview-commands.svelte.ts`). Inside
	// the controller the same-instance calls (`this.setCameraPreviewMode(...)`,
	// `this.playCameraPreview()`, `this.prepareCameraPreview()`,
	// `this.setCameraPreviewPlayhead(...)`, etc.) route through the
	// controller's own methods, not back through the facade — preserves the
	// pre-slice call graph without an unnecessary endpoint bounce. The Phase
	// 9.4 timeline ruler methods (`seekCameraTimeline` /
	// `toggleCameraEdgeReverse` / `setCameraEdgeTravel` /
	// `selectCameraTimelineEdge` / `selectCameraTimelineNode` /
	// `selectCameraTimelineViewKeyframe` / `stepCameraTimeline`) stay as
	// one-line delegates to `cameraTimelineController` further down —
	// re-routing them through `cameraPreviewCommands` would add an
	// indirection hop with no architectural benefit.

	playActiveConnectionEdge(mode?: EditorCameraPreviewMode) {
		return this.cameraPreviewCommands.playActiveConnectionEdge(mode);
	}

	previewActiveConnectionReverse(mode: EditorCameraPreviewMode = 'director') {
		return this.cameraPreviewCommands.previewActiveConnectionReverse(mode);
	}

	previewGuidedTour(mode: EditorCameraPreviewMode = 'visitor') {
		return this.cameraPreviewCommands.previewGuidedTour(mode);
	}

	previewSelectedNode(mode: EditorCameraPreviewMode = 'visitor') {
		return this.cameraPreviewCommands.previewSelectedNode(mode);
	}

	previewSelectedTransition(mode: EditorCameraPreviewMode = 'visitor') {
		return this.cameraPreviewCommands.previewSelectedTransition(mode);
	}

	previewSelectedConnection(
		direction: 'forward' | 'reverse',
		mode: EditorCameraPreviewMode = 'visitor'
	) {
		return this.cameraPreviewCommands.previewSelectedConnection(direction, mode);
	}

	setCameraPreviewMode(mode: EditorCameraPreviewMode) {
		return this.cameraPreviewCommands.setCameraPreviewMode(mode);
	}

	playCameraPreview() {
		return this.cameraPreviewCommands.playCameraPreview();
	}

	pauseCameraPreview() {
		return this.cameraPreviewCommands.pauseCameraPreview();
	}

	setCameraPreviewPlayhead(progress: number, runId = this.cameraPreview?.runId) {
		return this.cameraPreviewCommands.setCameraPreviewPlayhead(progress, runId);
	}

	stepCameraPreview(direction: -1 | 1) {
		return this.cameraPreviewCommands.stepCameraPreview(direction);
	}

	toggleCameraPreviewFollow() {
		return this.cameraPreviewCommands.toggleCameraPreviewFollow();
	}

	recenterCameraPreview() {
		return this.cameraPreviewCommands.recenterCameraPreview();
	}

	markCameraPreviewStarted(runId: number, startedAtMs: number) {
		return this.cameraPreviewCommands.markCameraPreviewStarted(runId, startedAtMs);
	}

	completeCameraPreview(runId: number) {
		return this.cameraPreviewCommands.completeCameraPreview(runId);
	}

	stopCameraPreview() {
		return this.cameraPreviewCommands.stopCameraPreview();
	}

	getCapturedCameraPreviewRoute(runId: number) {
		return this.cameraPreviewCommands.getCapturedCameraPreviewRoute(runId);
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
		if (this.relicMode && workspace === 'layout') return false;
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
		if (
			this.isDocumentMutationBlocked ||
			this.pendingPlacementAssetId ||
			this.pendingPlacementPrimitiveKind ||
			this.pendingPlacementLightKind ||
			this.pendingNavigationCommand
		) {
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
			this.document.entities.some((object) => object.id === id)
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

	beginPrimitivePlacement(kind: ScenePrimitiveKind) {
		return this.placementClusterMutator.beginPrimitivePlacement(kind);
	}

	cancelPrimitivePlacement(message?: string) {
		return this.placementClusterMutator.cancelPrimitivePlacement(message);
	}

	createPendingPrimitiveAt(roomId: MuseumRoomId, position: Vec3) {
		return this.placementClusterMutator.createPendingPrimitiveAt(roomId, position);
	}

	updatePrimitiveName(id: string, name: string) {
		return this.placementClusterMutator.updatePrimitiveName(id, name);
	}

	updatePrimitiveDimensions(id: string, dimensions: ScenePrimitiveDimensions) {
		return this.placementClusterMutator.updatePrimitiveDimensions(id, dimensions);
	}

	updatePrimitiveMaterial(id: string, materialId: MaterialId | string) {
		return this.placementClusterMutator.updatePrimitiveMaterial(id, materialId);
	}

	updatePrimitiveShadows(
		id: string,
		shadows: { castShadow?: boolean; receiveShadow?: boolean }
	) {
		return this.placementClusterMutator.updatePrimitiveShadows(id, shadows);
	}

	beginLightPlacement(kind: SceneLightKind) {
		return this.placementClusterMutator.beginLightPlacement(kind);
	}

	cancelLightPlacement(message?: string) {
		return this.placementClusterMutator.cancelLightPlacement(message);
	}

	createPendingLightAt(roomId: MuseumRoomId, position: Vec3) {
		return this.placementClusterMutator.createPendingLightAt(roomId, position);
	}

	updateLightName(id: string, name: string) {
		return this.placementClusterMutator.updateLightName(id, name);
	}

	updateLightFields(id: string, patch: LightFieldPatch) {
		return this.placementClusterMutator.updateLightFields(id, patch);
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

	// ===================================================================
	// Phase 5.2 — texture library + material-instance assignment facade
	// ===================================================================
	// Slice 3 — every method here is a one-line delegate to the
	// `textureLibraryController` (see `store/texture-library-controller.svelte.ts`).
	// The controller owns the verbatim body (URI safety, dedup, async races,
	// session-cache writes, selection commit hook, decision-pending routing).
	// The facade still owns the `textureVerifier` field so the constructor's
	// `options.textureVerifier ?? createTextureVerifier()` defaulting stays
	// intact.

	async registerTexture(name: string, uri: string): Promise<string | null> {
		return this.textureLibraryController.registerTexture(name, uri);
	}

	async registerLocalFileTexture(
		name: string,
		bytes: Uint8Array,
		mime: string
	): Promise<string | null> {
		return this.textureLibraryController.registerLocalFileTexture(name, bytes, mime);
	}

	/**
	 * Phase 5.4 — export the document as a self-contained `.museumpack.zip`.
	 * The resolver injects bytes from `BinaryTextureStore`; any texture not
	 * registered AND not fetchable (a `package-<id>/...` rewrite URI) yields
	 * `'unresolved-binary'` so the caller knows to resolve it first.
	 */
	async exportPackage(
		options: { now?: Date } = {}
	): Promise<PackageExportResult> {
		return buildPackage({
			document: this.document,
			resolveBytesByUri: async (uri) =>
				BinaryTextureStore.has(uri) ? await BinaryTextureStore.resolve(uri) : null,
			now: options.now
		});
	}

	/**
	 * Phase 5.4 — accept a `.museumpack.zip` byte array, prime the
	 * binary store with every imported texture, then import the document
	 * via the existing path. Any previously-tracked object URLs are
	 * released first to keep the registry from leaking.
	 */
	async importPackageArchive(zip: Uint8Array): Promise<
		| { status: 'ok'; document: MuseumSceneDocument }
		| { status: 'rejected'; reason: string; detail: string }
	> {
		const result = await importPackage(zip);
		if (result.status !== 'ok') {
			return { status: 'rejected', reason: result.reason, detail: result.detail };
		}
		// Pre-register every imported binary against its rewritten URI so
		// the texture-cache loader serves blob URLs on first paint.
		BinaryTextureStore.releaseAllObjectUrls();
		for (const [uri, blob] of result.binaries) {
			await BinaryTextureStore.register(uri, blob.bytes, blob.mime);
		}
		if (!this.importDocument(result.document)) {
			return {
				status: 'rejected',
				reason: 'import-rejected',
				detail: 'Project menu refused the imported document — undo history cleared first'
			};
		}
		return { status: 'ok', document: result.document };
	}

	async probeTexture(textureId: string): Promise<boolean> {
		return this.textureLibraryController.probeTexture(textureId);
	}

	requestMaterialEdit(entityId: string, patch: MaterialInstancePatch): boolean {
		return this.textureLibraryController.requestMaterialEdit(entityId, patch);
	}

	requestTextureAssignment(entityId: string, textureId: string): boolean {
		return this.textureLibraryController.requestTextureAssignment(entityId, textureId);
	}

	confirmPendingMaterialEdit(decision: MaterialEditDecision): boolean {
		return this.textureLibraryController.confirmPendingMaterialEdit(decision);
	}

	cancelPendingMaterialEdit(): boolean {
		return this.textureLibraryController.cancelPendingMaterialEdit();
	}

	makeMaterialInstanceUnique(entityId: string): boolean {
		return this.textureLibraryController.makeMaterialInstanceUnique(entityId);
	}

	registerLayoutHistory(host: LayoutHistoryHost | null): void {
		this.historyController.registerLayoutHost(host);
	}

	beginLayoutTransaction(): boolean {
		if (this.isDocumentMutationBlocked || this.historyController.isDocumentUndoBlocked) return false;
		return this.historyController.beginLayout();
	}

	commitLayoutTransaction(snapshot: unknown): boolean {
		if (!this.historyController.isDocumentUndoBlocked) return false;
		const result = this.historyController.commitLayout(snapshot);
		if (result.error) this.setStatusMessage(result.error.message);
		return result.changed;
	}

	cancelLayoutTransaction(): boolean {
		if (!this.historyController.isDocumentUndoBlocked) return false;
		return this.historyController.cancel();
	}

	clearSharedHistory(): void {
		this.historyController.clear();
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
			this.cameraPreviewCommands.seedEmptyReverseForSelectedForwardTrack();
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
		this.session.clearAllPlacementScaleVectors();
		this.documentStore.replace(validation.document);
		this.documentStore.setBaseline(validation.canonicalJson);
		this.historyController.clear();
		return true;
	}

	resetToCheckedInDocument() {
		return this.importDocument(cloneMuseumSceneDocument(this.bootDocument));
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
					!this.document.entities.some((object) => object.id === id)
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

export type MuseumEditorStoreOptions = {
	/** Optional authoring document seed (defaults to checked-in museum-scene.json). */
	document?: MuseumSceneDocument;
	/**
	 * H1 S0 — room registry used to resolve scene room-relative coordinates to
	 * world space (scene resolution + room-frame rendering). Defaults to the
	 * Chopin layout registry (the frozen relic); the boot-empty H1 editor
	 * passes `createLayoutRoomRegistry(project.layout)`.
	 */
	rooms?: LayoutRoomRegistry;
	/** H1 S0 — true for the frozen `/museum/editor` relic (Scene + Camera only). */
	relic?: boolean;
	/** Phase 5.2 — injectable texture image verifier (browser default). */
	textureVerifier?: TextureVerifier;
};

export function createMuseumEditorStore(options: MuseumEditorStoreOptions = {}) {
	return new MuseumEditorStore(options);
}

export type { MuseumSceneDocument, RuntimeMuseumScene };
