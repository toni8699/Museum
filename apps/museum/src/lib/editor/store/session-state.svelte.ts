/**
 * Editor session state — the Svelte 5 sub-store that owns volatile UI state
 * that lives only for the current editor session (refresh wipes).
 *
 * Slice 1 of the museum-editor refactor plan proved the composition-root
 * pattern with status + viewport flags. Slice 3 debt 3.13 expands the surface
 * to the full **22 slot** set named in audit §3.C. Every slot is a real
 * `$state` on the sub-store so Slice 5's `bind:` migration can delete the
 * god file's parallel $state mirrors in one pass.
 *
 * **Phase 9.1:** composition-root parallel `$state` twins are deleted. Facade
 * getters/setters read and write through this store only.
 *
 * **No document reads.** This sub-store deliberately does not import the
 * document store, the navigation graph, or any validator. Its only contract
 * with the rest of the editor is "expose volatile UI state".
 */

import type {
	EditorCameraFocusKind,
	EditorLeftPanel,
	EditorPendingMaterialEdit,
	EditorPendingNavigationCommand,
	EditorTextureLoadState,
	EditorTransformInteractionKind,
	EditorTransformSpace,
	EditorViewKeyframeProgressDragSelection,
	EditorWorkspace,
	EditorLightingSettings
} from '../museum-editor.types';
import type { EditorTransformMode } from '../editor-transform';
import {
	DEFAULT_ROTATION_SNAP_DEGREES,
	DEFAULT_TRANSLATION_SNAP
} from '../editor-placement';
import type { CameraConnectionDirection, MuseumRoomId, Vec3 } from '$lib/types/museum';
import type { SceneLightKind, ScenePrimitiveKind } from '$lib/content/scene';

/** Phase 5.2 — Phase 4.5 gate, fixed cap of recently used texture ids. */
const RECENT_TEXTURE_ID_LIMIT = 8;

const STATUS_MESSAGE_MS = 2500;

const DEFAULT_TIMELINE_HEIGHT = 280;

type TransformInteractionKind = EditorTransformInteractionKind;

export class EditorSessionState {
	// ============================================================
	// Status message + viewport toggles (Slice 1 v1 — landed before debt).
	// ============================================================

	statusMessage = $state<string | null>(null);
	viewportShowNodes = $state(true);
	viewportShowPaths = $state(true);
	viewportShowFraming = $state(true);

	#statusMessageTimer: ReturnType<typeof setTimeout> | null = null;

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

	toggleViewportShowNodes() {
		this.viewportShowNodes = !this.viewportShowNodes;
	}

	toggleViewportShowPaths() {
		this.viewportShowPaths = !this.viewportShowPaths;
	}

	toggleViewportShowFraming() {
		this.viewportShowFraming = !this.viewportShowFraming;
	}

	// ============================================================
	// Workspace chrome (audit §3.C).
	// ============================================================

	currentWorkspace = $state<EditorWorkspace>('scene');
	leftPanel = $state<EditorLeftPanel>('scene');
	timelineExpanded = $state(false);
	sceneTimelineExpanded = $state(false);
	timelineHeight = $state(DEFAULT_TIMELINE_HEIGHT);

	setWorkspace(value: EditorWorkspace) {
		this.currentWorkspace = value;
	}

	setLeftPanel(value: EditorLeftPanel) {
		this.leftPanel = value;
	}

	setTimelineExpanded(value: boolean) {
		this.timelineExpanded = value;
	}

	setSceneTimelineExpanded(value: boolean) {
		this.sceneTimelineExpanded = value;
	}

	setTimelineHeight(value: number) {
		this.timelineHeight = value;
	}

	// ============================================================
	// Transform controls (audit §3.C).
	// ============================================================

	transformMode = $state<EditorTransformMode>('translate');
	transformGizmoVisible = $state(true);
	transformSpace = $state<EditorTransformSpace>('world');

	setTransformMode(value: EditorTransformMode) {
		this.transformMode = value;
	}

	setTransformSpace(value: EditorTransformSpace) {
		this.transformSpace = value;
	}

	setTransformGizmoVisible(value: boolean) {
		this.transformGizmoVisible = value;
	}

	// ============================================================
	// Camera focus + viewport pan + grid (audit §3.C).
	// ============================================================

	cameraFocusVersion = $state(0);
	cameraFocusKind = $state<EditorCameraFocusKind>(null);
	cameraFocusPlacementId = $state<string | null>(null);
	cameraFocusNodeId = $state<string | null>(null);
	cameraFocusRoomId = $state<string | null>(null);
	cameraPanEnabled = $state(true);
	gridVisible = $state(false);

	setCameraFocus(
		kind: EditorCameraFocusKind,
		placementId: string | null,
		nodeId: string | null,
		roomId: string | null = null
	) {
		this.cameraFocusKind = kind;
		this.cameraFocusPlacementId = placementId;
		this.cameraFocusNodeId = nodeId;
		this.cameraFocusRoomId = roomId;
		this.cameraFocusVersion += 1;
	}

	clearCameraFocus() {
		this.cameraFocusKind = null;
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		this.cameraFocusRoomId = null;
		this.cameraFocusVersion += 1;
	}

	/**
	 * Clear focus target without bumping version — used by preview pose paths
	 * so `EditorCameraRig` does not treat the clear as a new focus request.
	 */
	clearCameraFocusRequest() {
		this.cameraFocusKind = null;
		this.cameraFocusPlacementId = null;
		this.cameraFocusNodeId = null;
		this.cameraFocusRoomId = null;
	}

	/** Bumps the version without changing the focus target (idempotent consumer-side reads). */
	bumpCameraFocusVersion() {
		this.cameraFocusVersion += 1;
	}

	toggleCameraPan() {
		this.cameraPanEnabled = !this.cameraPanEnabled;
	}

	toggleGrid() {
		this.gridVisible = !this.gridVisible;
	}

	// ============================================================
	// Lighting + fog (audit §3.C / §3.F11).
	// ============================================================

	ambientIntensity = $state<number>(0.65);
	directionalIntensity = $state<number>(1.15);
	fogEnabled = $state<boolean>(false);
	fogNear = $state<number>(22);
	fogFar = $state<number>(54);

	applyLighting(preset: EditorLightingSettings) {
		this.ambientIntensity = preset.ambientIntensity;
		this.directionalIntensity = preset.directionalIntensity;
		this.fogEnabled = preset.fogEnabled;
		this.fogNear = preset.fogNear;
		this.fogFar = preset.fogFar;
	}

	// Slice 5 — bind-migration helper setters. Per-field writes from
	// EditorInspector.svelte now route here so Phase B in the audit §3.G
	// can delete the god-file's parallel `$state` mirrors for the same
	// slots. Each setter is the canonical write path; `applyLighting()`
	// remains for batch preset changes (preset buttons).
	setAmbientIntensity(value: number) {
		this.ambientIntensity = value;
	}
	setDirectionalIntensity(value: number) {
		this.directionalIntensity = value;
	}
	setFogEnabled(value: boolean) {
		this.fogEnabled = value;
	}
	setFogNear(value: number) {
		this.fogNear = value;
	}
	setFogFar(value: number) {
		this.fogFar = value;
	}

	// ============================================================
	// Snap + keep-on-floor + drop-to-floor (audit §3.C).
	// ============================================================

	// Phase 6.1 — snap defaults are off; modifier (Ctrl/Cmd) opt-in via
	// EditorTransformControls. Each step keeps its historical default: translate
	// 0.1 m, rotate 15°, scale 0.1.
	translationSnapEnabled = $state(false);
	translationSnap = $state(DEFAULT_TRANSLATION_SNAP);
	rotationSnapEnabled = $state(false);
	rotationSnapDegrees = $state(DEFAULT_ROTATION_SNAP_DEGREES);
	scaleSnapEnabled = $state(false);
	scaleSnap = $state(0.1);
	keepOnFloor = $state(false);
	dropToFloorRequestId = $state(0);

	/** Slice 5 — checkbox `onchange` write path (set, not toggle). */
	setTranslationSnapEnabled(value: boolean) {
		this.translationSnapEnabled = value;
	}

	toggleTranslationSnap() {
		this.translationSnapEnabled = !this.translationSnapEnabled;
	}

	setTranslationSnap(value: number) {
		this.translationSnap = value;
	}

	setRotationSnapEnabled(value: boolean) {
		this.rotationSnapEnabled = value;
	}

	toggleRotationSnap() {
		this.rotationSnapEnabled = !this.rotationSnapEnabled;
	}

	setRotationSnapDegrees(value: number) {
		this.rotationSnapDegrees = value;
	}

	setScaleSnapEnabled(value: boolean) {
		this.scaleSnapEnabled = value;
	}

	toggleScaleSnap() {
		this.scaleSnapEnabled = !this.scaleSnapEnabled;
	}

	setScaleSnap(value: number) {
		this.scaleSnap = value;
	}

	setKeepOnFloor(value: boolean) {
		this.keepOnFloor = value;
	}

	toggleKeepOnFloor() {
		this.keepOnFloor = !this.keepOnFloor;
	}

	requestDropToFloor() {
		this.dropToFloorRequestId += 1;
	}

	// ============================================================
	// Pending frame / nav / asset (audit §3.C).
	// ============================================================

	pendingFramePlacementIds = $state<string[]>([]);
	pendingFrameVersion = $state(0);
	pendingNavigationCommand = $state<EditorPendingNavigationCommand>(null);
	pendingPlacementAssetId = $state<string | null>(null);
	pendingPlacementPrimitiveKind = $state<ScenePrimitiveKind | null>(null);
	pendingPlacementLightKind = $state<SceneLightKind | null>(null);

	setPendingFramePlacementIds(ids: string[]) {
		this.pendingFramePlacementIds = ids;
		this.pendingFrameVersion += 1;
	}

	clearPendingFramePlacementIds() {
		this.pendingFramePlacementIds = [];
		this.pendingFrameVersion += 1;
	}

	setPendingNavigationCommand(command: EditorPendingNavigationCommand) {
		this.pendingNavigationCommand = command;
	}

	setPendingPlacementAssetId(assetId: string | null) {
		this.pendingPlacementAssetId = assetId;
	}

	setPendingPlacementPrimitiveKind(kind: ScenePrimitiveKind | null) {
		this.pendingPlacementPrimitiveKind = kind;
	}

	setPendingPlacementLightKind(kind: SceneLightKind | null) {
		this.pendingPlacementLightKind = kind;
	}

	// ============================================================
	// Tree expansion (audit §3.C).
	// ============================================================

	treeExpandedRoomIds = $state<MuseumRoomId[]>(['paris']);
	treeExpandedClusterIds = $state<string[]>([]);
	treeExpandedCameraConnectionIds = $state<string[]>([]);
	treeExpandedCameraDirectionKeys = $state<string[]>([]);

	expandRoom(roomId: MuseumRoomId): boolean {
		if (this.treeExpandedRoomIds.includes(roomId)) return false;
		this.treeExpandedRoomIds = [...this.treeExpandedRoomIds, roomId];
		return true;
	}

	collapseRoom(roomId: MuseumRoomId): boolean {
		if (!this.treeExpandedRoomIds.includes(roomId)) return false;
		this.treeExpandedRoomIds = this.treeExpandedRoomIds.filter((id) => id !== roomId);
		return true;
	}

	toggleRoomExpanded(roomId: MuseumRoomId): boolean {
		return this.treeExpandedRoomIds.includes(roomId)
			? this.collapseRoom(roomId)
			: this.expandRoom(roomId);
	}

	expandCluster(clusterId: string): boolean {
		if (this.treeExpandedClusterIds.includes(clusterId)) return false;
		this.treeExpandedClusterIds = [...this.treeExpandedClusterIds, clusterId];
		return true;
	}

	ensureClusterExpanded(clusterId: string): boolean {
		return this.expandCluster(clusterId);
	}

	toggleClusterExpanded(clusterId: string): boolean {
		return this.treeExpandedClusterIds.includes(clusterId)
			? (this.treeExpandedClusterIds = this.treeExpandedClusterIds.filter(
					(id) => id !== clusterId
			  ),
				true)
			: this.expandCluster(clusterId);
	}

	expandCameraConnection(connectionId: string): boolean {
		if (this.treeExpandedCameraConnectionIds.includes(connectionId)) return false;
		this.treeExpandedCameraConnectionIds = [
			...this.treeExpandedCameraConnectionIds,
			connectionId
		];
		return true;
	}

	expandCameraDirection(connectionId: string, direction: CameraConnectionDirection): boolean {
		const key = `${connectionId}::${direction}`;
		if (this.treeExpandedCameraDirectionKeys.includes(key)) return false;
		this.treeExpandedCameraDirectionKeys = [...this.treeExpandedCameraDirectionKeys, key];
		return true;
	}

	// ============================================================
	// Pointer / drag interaction flags + canceller slots (audit §3.C).
	// Selected `viewKeyframeProgressDrag` identity lives here; canceller
	// callbacks remain private to the composition root.
	// ============================================================

	transformInteractionActive = $state(false);
	transformInteractionKind = $state<TransformInteractionKind>(null);
	directPathInteractionActive = $state(false);
	directFramingInteractionActive = $state(false);
	viewKeyframeProgressDrag = $state<EditorViewKeyframeProgressDragSelection | null>(null);

	setTransformInteraction(active: boolean, kind: TransformInteractionKind) {
		this.transformInteractionActive = active;
		this.transformInteractionKind = active ? kind : null;
	}

	setDirectPathInteraction(active: boolean) {
		this.directPathInteractionActive = active;
	}

	setDirectFramingInteraction(active: boolean) {
		this.directFramingInteractionActive = active;
	}

	startViewKeyframeProgressDrag(selection: EditorViewKeyframeProgressDragSelection) {
		this.viewKeyframeProgressDrag = { ...selection };
	}

	cancelViewKeyframeProgressDrag() {
		this.viewKeyframeProgressDrag = null;
	}

	// ============================================================
	// Phase 5.2: texture load + recently used + pending material edit.
	// All session-only — reset/import/undo/redo never touch these slots.
	// ============================================================

	recentTextureIds = $state<string[]>([]);
	textureLoadStates = $state<Record<string, EditorTextureLoadState>>({});
	pendingMaterialEdit = $state<EditorPendingMaterialEdit | null>(null);

	markTextureRecentlyUsed(textureId: string) {
		const trimmed = textureId?.trim();
		if (!trimmed) return;
		const existing = this.recentTextureIds;
		const dedup = existing.filter((id) => id !== trimmed);
		this.recentTextureIds = [trimmed, ...dedup].slice(0, RECENT_TEXTURE_ID_LIMIT);
	}

	setTextureLoadState(uri: string, state: EditorTextureLoadState) {
		const next = { ...this.textureLoadStates };
		next[uri] = state;
		this.textureLoadStates = next;
	}

	clearTextureLoadState(uri: string) {
		if (!(uri in this.textureLoadStates)) return;
		const next = { ...this.textureLoadStates };
		delete next[uri];
		this.textureLoadStates = next;
	}

	setPendingMaterialEdit(request: EditorPendingMaterialEdit | null) {
		this.pendingMaterialEdit = request;
	}

	// ============================================================
	// Phase 1a follow-up: independent per-axis scale memory.
	// Schema v6 only persists `placement.scale: number`, so the per-axis
	// vector lives in this session-only Map and is layered back on top of
	// the document read in `MuseumEditorStore.selectedTransform`. Cleared on
	// reset; never carries data across sessions.
	// ============================================================

	#placementScaleVectors = new Map<string, Vec3>();
	placementScaleVectorVersion = $state(0);

	getPlacementScaleVector(id: string): Vec3 | null {
		return this.#placementScaleVectors.get(id) ?? null;
	}

	setPlacementScaleVector(id: string, vector: Vec3 | null): void {
		if (vector === null) {
			if (!this.#placementScaleVectors.has(id)) return;
			this.#placementScaleVectors.delete(id);
		} else {
			const existing = this.#placementScaleVectors.get(id);
			if (
				existing &&
				Math.abs(existing[0] - vector[0]) < 1e-6 &&
				Math.abs(existing[1] - vector[1]) < 1e-6 &&
				Math.abs(existing[2] - vector[2]) < 1e-6
			) {
				return;
			}
			this.#placementScaleVectors.set(id, [
				vector[0],
				vector[1],
				vector[2]
			] as Vec3);
		}
		this.placementScaleVectorVersion += 1;
	}

	clearAllPlacementScaleVectors(): void {
		if (this.#placementScaleVectors.size === 0) return;
		this.#placementScaleVectors.clear();
		this.placementScaleVectorVersion += 1;
	}
}
