/**
 * `EditorCameraPreviewCommands` — preview + timeline playback orchestration.
 *
 * Slice 2 of the Priority-1 file-split refactor lifts the facade's preview
 * entry rituals (`playActiveConnectionEdge`, `previewActiveConnectionReverse`,
 * `previewSelectedNode`, `previewSelectedConnection`), FSM commands
 * (`setCameraPreviewMode`,
 * `playCameraPreview`, `pauseCameraPreview`, `setCameraPreviewPlayhead`,
 * `stepCameraPreview`, `toggleCameraPreviewFollow`, `recenterCameraPreview`,
 * `markCameraPreviewStarted`, `completeCameraPreview`, `stopCameraPreview`,
 * `getCapturedCameraPreviewRoute`), and the private route plumbing
 * (`resolveCameraPreviewRoute`, `prepareCameraPreview`,
 * `seedEmptyReverseForSelectedForwardTrack`) out of `editor-store.svelte.ts`.
 *
 * The **FSM state** already lives in `camera-preview-controller.svelte.ts`
 * (Slice 3 v2 sub-task 3.5); the **timeline ruler** lives in
 * `camera-timeline-controller.svelte.ts` (Phase 9.4). This controller is the
 * *commands* layer that composes both — it never owns $state itself, only
 * the orchestration that mutates its siblings through the structural host
 * surface.
 *
 * **Plan deviation (Group A timeline methods).** The plan's "timeline
 * seek/select/step" set (`seekCameraTimeline`, `toggleCameraEdgeReverse`,
 * `setCameraEdgeTravel`, `selectCameraTimelineEdge`, `selectCameraTimelineNode`,
 * `selectCameraTimelineViewKeyframe`, `stepCameraTimeline`) was already moved
 * to `camera-timeline-controller.svelte.ts` in Phase 9.4. The facade keeps
 * them as one-line delegates to that controller rather than re-routing them
 * through this class — chaining `facade → commands → timeline-controller`
 * would add an indirection hop with no architectural benefit.
 *
 * **Bridge vs. direct access.** The shared bridge (`prepareCameraPreview`,
 * `seedEmptyReverseForSelectedForwardTrack`) previously sat on the facade
 * because those helpers were ECMAScript-private. Now that they live on this
 * controller and are public, the bridge implementations in
 * `controller-hosts.ts` forward directly to `cameraPreviewCommands.*` and
 * the two private methods on the facade are replaced by one-line delegates.
 */

import { getNode, type SceneDocument, type SceneConnection, type RuntimeScene } from '$lib/content/scene';
import type { RuntimeStateStore } from '$lib/state/runtime-state.svelte';
import { getCameraConnectionRoute, getCameraRoute, type ResolvedCameraRoute } from '$lib/museum/navigation/camera-route';
import {
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion
} from '$lib/museum/navigation/camera-motion';
import { resolveDirectedEdgeMotionByDirection } from '../camera/editor-directed-edge-motion';
import {
	cameraTimelineEdgePlayheadAtProgress,
	cameraTimelineProgressAtEdgeProgress,
	getEditorCameraTimelineLocation,
	type EditorCameraTimeline
} from '../camera/editor-camera-timeline';
import { seedEmptyReverseViewTrack, syncReverseViewTrackFromForward } from '../camera/editor-camera-view';
import type { EditorCameraSelection, EditorNavigationSelection } from '../editor-selection';
import type {
	EditorCameraPreview,
	EditorCameraPreviewMode,
	EditorSelectionPreviewScopeRequest,
	EditorViewKeyframeProgressDragSelection
} from '../editor-types';
import type { CameraConnectionDirection } from '$lib/types/scene';

import type { EditorSelectionActions } from './selection-actions.svelte';
import type { EditorSelectionStore } from './selection-store.svelte';
import type { EditorCameraPreviewController } from './camera-preview-controller.svelte';
import type { EditorCameraTimelineController } from './camera-timeline-controller.svelte';

/**
 * Composition-root surface `EditorCameraPreviewCommands` depends on.
 * Everything here is owned by `EditorStore`; this controller never
 * mutates the document store, history controller, or preview controller
 * directly — only through the accessors and wrappers below.
 */
export interface EditorCameraPreviewCommandsHost {
		// Mutation guards.
	readonly isDocumentMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;
	readonly isDocumentTransactionActive: boolean;
	readonly transformInteractionActive: boolean;
	readonly directPathInteractionActive: boolean;

	// Document + resolved scene + state graph + selection reducer.
	readonly document: SceneDocument;
	readonly scene: RuntimeScene;
	readonly state: RuntimeStateStore;
	readonly selection: EditorSelectionStore;
	readonly selectionActions: EditorSelectionActions;

	// Sub-controllers the orchestration reads/writes.
	readonly previewController: EditorCameraPreviewController;
	readonly cameraTimelineController: EditorCameraTimelineController;

	// Cancellers managed by the facade (`setTransformCanceler`,
	// `setDirectPathDragCanceler`, `setCameraPreviewRestorer`,
	// `#cancelDirectFramingDragOrFail`). Exposed by the facade so the
	// pre-cancel dance in `prepareCameraPreview` and `stopCameraPreview`
	// stays an atomic façade concern.
	cancelTransform(): boolean | null;
	cancelDirectPathDrag(): boolean | null;
	cancelDirectFramingDragOrFail(): boolean;
	restoreCameraPreview(): boolean | null;

	// Facade state slots the orchestration reads.
	readonly cameraPreview: EditorCameraPreview;
	readonly cameraSelection: EditorCameraSelection | null;
	readonly selectedConnection: SceneConnection | undefined;
	readonly activeCameraConnectionId: string | null;
	readonly activeCameraDirection: CameraConnectionDirection;
	readonly navigationSelection: EditorNavigationSelection | null;
	readonly viewKeyframeProgressDrag: EditorViewKeyframeProgressDragSelection | null;

	// Writable slots. P7.5 — the playheads moved off the facade: the timeline
	// controller owns `cameraTimelinePlayhead` and the preview controller owns
	// `lastSequencePlayhead`; both are reached through the sub-controllers
	// already declared above (the whole-facade cast stays a compile wall only
	// for the members still on the facade).
	timelineExpanded: boolean;

	/**
	 * P11.1 — true only inside the `stopCameraPreview` restore ritual. The
	 * old broad mutation gate incidentally blocked selection during that
	 * re-entrant window; selection-driven scope entries must stay blocked
	 * there too, without re-barring ordinary paused-preview selection.
	 */
	isCameraPreviewStopping: boolean;

	// Facade methods the orchestration calls back into.
	setStatusMessage(message: string | null): void;
	cancelAssetPlacement(message?: string): boolean;
	cancelPendingFrame(): void;
	cancelPendingNavigation(message?: string): boolean;
	cancelViewKeyframeProgressDrag(): boolean;
	setNavigationHover(connectionId: string | null, anchorId?: string | null): boolean;
	clearCameraFocusRequest(): void;
	beginDocumentTransaction(): boolean;
	commitDocumentTransaction(): boolean;
}

export class EditorCameraPreviewCommands {
	constructor(private readonly host: EditorCameraPreviewCommandsHost) {}

	// =========================================================================
	// Private plumbing — was `#resolveCameraPreviewRoute` / `#prepareCameraPreview`
	// / `#seedEmptyReverseForSelectedForwardTrack` on the facade. Now public so
	// the bridge implementations in `controller-hosts.ts` can call them and so
	// the facade `commitDocumentTransaction` can call `seedEmpty…` directly.
	// =========================================================================

	/** Resolve the exact route a non-sequence preview is animating along. */
	resolveCameraPreviewRoute(preview: Exclude<EditorCameraPreview, null>): ResolvedCameraRoute {
		if (preview.kind === 'camera') {
			throw new Error('A camera preview has no route');
		}
		if (preview.kind === 'edge') {
			return getCameraConnectionRoute(
				preview.connectionId,
				preview.direction,
				this.host.state.graph
			);
		}
		throw new Error('Sequence preview uses exact camera timeline motions');
	}

	/**
	 * Tear down every editor ownership that would block a fresh preview:
	 * transform drag, direct path drag, asset placement, pending navigation,
	 * pending frame, navigation hover, camera focus request.
	 */
	prepareCameraPreview(): boolean {
		const host = this.host;
		if (host.transformInteractionActive) {
			if (!host.cancelTransform?.()) return false;
		}
		if (host.directPathInteractionActive && !host.cancelDirectPathDrag?.()) {
			return false;
		}
		if (host.transformInteractionActive || host.isDocumentTransactionActive) return false;
		host.cancelAssetPlacement();
		host.cancelPendingNavigation();
		host.cancelPendingFrame();
		host.setNavigationHover(null);
		host.clearCameraFocusRequest();
		return true;
	}

	/**
	 * Mirror of a forward view-track selection into the reverse track. Used
	 * both by `playActiveConnectionEdge`'s reverse travel path (direct call)
	 * and as the `commitDocumentTransaction` framing side-effect (host bridge).
	 */
	seedEmptyReverseForSelectedForwardTrack(): boolean {
		const selection = this.host.navigationSelection;
		const connection = this.host.selectedConnection;
		if (selection?.kind !== 'view-keyframe' || selection.direction !== 'forward' || !connection) {
			return false;
		}
		return syncReverseViewTrackFromForward(connection);
	}

	// =========================================================================
	// Edge / sequence / camera preview entry
	// =========================================================================

	/**
	 * Play the active connection edge in the current travel direction (forward
	 * or reverse). Seeds empty reverse from forward when needed. Used by ▶
	 * while Reverse is toggled; sequence play lives in `previewSequence`.
	 */
	playActiveConnectionEdge(mode?: EditorCameraPreviewMode) {
		const host = this.host;
		const connectionId = host.activeCameraConnectionId;
		const direction = host.activeCameraDirection;
		if (!connectionId || host.isEditorInteractionActive || host.isDocumentTransactionActive) {
			return false;
		}
		const connection = host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) return false;

		if (direction === 'reverse') {
			const needsSeed =
				(connection.viewTracks?.forward.length ?? 0) > 0 &&
				(connection.viewTracks?.reverse.length ?? 0) === 0;
			if (needsSeed) {
				if (host.isDocumentMutationBlocked || !host.beginDocumentTransaction()) {
					return false;
				}
				seedEmptyReverseViewTrack(connection);
				if (!host.commitDocumentTransaction()) return false;
			}
		}

		const preview = host.cameraPreview;
		const resolvedMode =
			mode ??
			(preview?.mode === 'director' || preview?.mode === 'visitor'
				? preview.mode
				: 'director');
		if (
			preview?.kind === 'edge' &&
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
			route = getCameraConnectionRoute(connection.id, direction, host.state.graph);
		} catch (error) {
			host.setStatusMessage(
				error instanceof Error ? error.message : 'Camera connection is unavailable'
			);
			return false;
		}
		if (!this.prepareCameraPreview()) return false;

		host.selection.setNavigation({
			kind: 'connection',
			connectionId: connection.id,
			direction
		});
		host.selectionActions.expandActiveCameraDirection(direction);

		const fromNodeId =
			direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
		const toNodeId =
			direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
		const timeline = host.cameraTimelineController.readCameraTimeline();
		const playhead =
			timeline
				? (cameraTimelineEdgePlayheadAtProgress(
						timeline,
						connectionId,
						direction,
						host.cameraTimelineController.cameraTimelinePlayhead
					) ?? 0)
				: 0;
		const runId = host.previewController.allocRunId();
		host.previewController.setCapturedRoute(runId, route);
		host.previewController.followEnabled = true;
		host.previewController.recenterVersion += 1;
		host.previewController.preview = {
			kind: 'edge',
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
		host.cameraTimelineController.syncCameraTimelineForConnection(
			connection.id,
			direction,
			playhead
		);
		host.timelineExpanded = true;
		return true;
	}

	/**
	 * @deprecated Prefer toggleCameraEdgeReverse + playActiveConnectionEdge.
	 * Kept for tests: seeds empty reverse and plays reverse edge from the start.
	 */
	previewActiveConnectionReverse(mode: EditorCameraPreviewMode = 'director') {
		if (!this.host.cameraTimelineController.setCameraEdgeTravel('reverse')) return false;
		const connectionId = this.host.activeCameraConnectionId;
		if (!connectionId) return false;
		this.host.cameraTimelineController.showCameraTimelineConnectionPose(
			connectionId,
			'reverse',
			0
		);
		this.host.cameraTimelineController.syncCameraTimelineForConnection(
			connectionId,
			'reverse',
			0
		);
		return this.playActiveConnectionEdge(mode);
	}



	/** Preview one named camera without reading or changing canonical selection. */
	previewCamera(nodeId: string, mode: EditorCameraPreviewMode = 'visitor') {
		const host = this.host;
		if (!nodeId || !host.scene.navigationNodes.some((node) => node.id === nodeId)) {
			host.setStatusMessage('Camera node is unavailable');
			return false;
		}
		if (!this.prepareCameraPreview()) return false;
		host.previewController.clearCapturedRoute();
		host.previewController.followEnabled = true;
		host.previewController.recenterVersion += 1;
		host.previewController.edgeRepeat = false;
		host.previewController.preview = {
			kind: 'camera',
			nodeId,
			mode,
			transport: 'paused',
			runId: host.previewController.allocRunId(),
			playhead: 0,
			startedAtMs: null
		};
		host.cameraTimelineController.syncCameraTimelineForNode(nodeId);
		host.timelineExpanded = true;
		return true;
	}

	previewSelectedNode(mode: EditorCameraPreviewMode = 'visitor') {
		const nodeId = this.host.cameraSelection?.nodeId;
		if (!nodeId) {
			this.host.setStatusMessage('Select a camera node to preview');
			return false;
		}
		return this.previewCamera(nodeId, mode);
	}

	previewSelectedConnection(
		direction: 'forward' | 'reverse',
		mode: EditorCameraPreviewMode = 'visitor'
	) {
		const host = this.host;
		// P11.1 — selection-driven entries install paused scopes as ordinary
		// authoring state, so an existing PAUSED/complete preview no longer
		// blocks this explicit command (it switches, mirroring `previewEdge`).
		// Only active playback keeps exclusive pose ownership (§5).
		if (
			host.cameraPreview?.transport === 'playing' ||
			host.isEditorInteractionActive ||
			host.isCameraPreviewStopping
		) {
			return false;
		}
		const connection = host.selectedConnection;
		if (!connection) {
			host.setStatusMessage('Select a camera connection to preview');
			return false;
		}
		const fromNodeId =
			direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
		const toNodeId =
			direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
		let route: ResolvedCameraRoute;
		try {
			route = getCameraConnectionRoute(connection.id, direction, host.state.graph);
		} catch (error) {
			host.setStatusMessage(
				error instanceof Error ? error.message : 'Camera connection is unavailable'
			);
			return false;
		}
		if (!this.prepareCameraPreview()) return false;
		const prior = host.selection.navigation;
		// Pre-slice: only downgrade view-keyframe when preview direction differs.
		// Anchor selection must survive so nearest-curve authoring still works.
		if (
			prior.kind === 'view-keyframe' &&
			prior.connectionId === connection.id &&
			prior.direction !== direction
		) {
			host.selection.setNavigation({
				kind: 'connection',
				connectionId: connection.id,
				direction
			});
		} else if (prior.kind === 'connection') {
			host.selection.setNavigation({
				kind: 'connection',
				connectionId: connection.id,
				direction
			});
		} else {
			host.selection.setDiscovery(connection.id, direction);
		}
		host.selectionActions.expandActiveCameraDirection(direction);
		const runId = host.previewController.allocRunId();
		host.previewController.setCapturedRoute(runId, route);
		host.previewController.followEnabled = true;
		host.previewController.recenterVersion += 1;
		host.previewController.preview = {
			kind: 'edge',
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
		host.cameraTimelineController.syncCameraTimelineForConnection(
			connection.id,
			direction,
			0
		);
		host.timelineExpanded = true;
		return true;
	}

	/**
	 * S2 explicit Preview Edge — snapshots `cameraTimelinePlayhead` → `lastSequencePlayhead`
	 * when leaving `sequence` scope, then installs `connection` paused at 0.
	 * Allows switching even while a preview is active (unlike `previewSelectedConnection`).
	 */
	previewEdge(
		connectionId: string,
		direction: CameraConnectionDirection,
		mode: EditorCameraPreviewMode = 'director'
	): boolean {
		const host = this.host;
		if (host.isEditorInteractionActive || host.isDocumentTransactionActive) return false;
		let route: ResolvedCameraRoute;
		try {
			route = getCameraConnectionRoute(connectionId, direction, host.state.graph);
		} catch (error) {
			host.setStatusMessage(
				error instanceof Error ? error.message : 'Camera connection is unavailable'
			);
			return false;
		}
		const connection = host.document.connections.find((c) => c.id === connectionId);
		if (!connection) {
			host.setStatusMessage('Camera connection is unavailable');
			return false;
		}
		// Snapshot last Sequence playhead if currently in sequence scope
		const current = host.cameraPreview;
		if (current?.kind === 'sequence') {
			host.previewController.lastSequencePlayhead = host.cameraTimelineController.cameraTimelinePlayhead;
		}
		if (!this.prepareCameraPreview()) return false;
		// Preview scope is independent from canonical selection and discovery.
		const fromNodeId = direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
		const toNodeId = direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
		const runId = host.previewController.allocRunId();
		host.previewController.setCapturedRoute(runId, route);
		host.previewController.followEnabled = true;
		host.previewController.recenterVersion += 1;
		// Clear repeat for new edge preview (controller's startConnection does, but we bypass it)
		host.previewController.edgeRepeat = false;
		host.previewController.preview = {
			kind: 'edge',
			connectionId,
			direction,
			fromNodeId,
			toNodeId,
			mode,
			transport: 'paused',
			runId,
			playhead: 0,
			startedAtMs: null
		};
		host.cameraTimelineController.syncCameraTimelineForConnection(connectionId, direction, 0);
		host.timelineExpanded = true;
		return true;
	}

	/**
	 * S2 explicit Preview Sequence — the sole sequence entry (S6 folded
	 * `previewGuidedTour` into this). Restores `lastSequencePlayhead` when
	 * valid; with no saved playhead, keeps the current `cameraTimelinePlayhead`
	 * so a fresh scrub carries into playback (S4: play continues from exact
	 * local progress). A paused/complete sequence resumes via play; otherwise
	 * installs `kind: 'sequence'` playing at the current playhead.
	 */
	previewSequence(mode: EditorCameraPreviewMode = 'visitor'): boolean {
		const host = this.host;
		if (host.isEditorInteractionActive || host.isDocumentTransactionActive) return false;
		const current = host.cameraPreview;
		if (current?.kind === 'sequence' && current.transport === 'playing') return false;
		// D6 amended 2026-08-22: restore the saved playhead when the timeline
		// still builds; when saved-but-unbuildable, reset to 0. With no saved
		// playhead, leave `cameraTimelinePlayhead` untouched (scrub carries over).
		let restore: number | null = null;
		if (host.previewController.lastSequencePlayhead !== null) {
			const timeline = host.previewController.getTimeline();
			if (!timeline) {
				// saved-but-unbuildable → reset to 0 (S2 D6 amended 2026-08-22)
				restore = 0;
			} else {
				const p = host.previewController.lastSequencePlayhead;
				if (Number.isFinite(p) && p >= 0 && p <= 1) {
					try {
						getEditorCameraTimelineLocation(timeline, p);
						restore = p;
					} catch {
						restore = 0;
					}
				} else {
					restore = 0;
				}
			}
		}
		if (restore !== null) host.cameraTimelineController.cameraTimelinePlayhead = restore;
		if (current?.kind === 'sequence') {
			// Resume a paused sequence (at-end Play restarts from 0 — §2 rule 5).
			return this.playCameraPreview();
		}
		const timeline = host.cameraTimelineController.readCameraTimeline();
		if (!timeline) return false;
		if (!this.prepareCameraPreview()) return false;

		const runId = host.previewController.allocRunId();
		host.previewController.clearCapturedRoute();
		host.previewController.edgeRepeat = false;
		if (!current) {
			host.previewController.followEnabled = true;
			host.previewController.recenterVersion += 1;
		}
		const playhead = Math.min(1, Math.max(0, host.cameraTimelineController.cameraTimelinePlayhead));
		host.previewController.preview = {
			kind: 'sequence',
			startNodeId: timeline.startNodeId,
			mode: current?.mode ?? mode,
			transport: 'playing',
			runId,
			playhead,
			startedAtMs: null
		};
		host.timelineExpanded = true;
		return true;
	}

	/**
	 * P11.1 — selection-driven paused scope install (supersedes P8 D1 / P3B
	 * Group C "selection never changes preview scope"). Canonical Camera
	 * node/connection selection is authoring intent: a playing Sequence or
	 * Edge is replaced — not Stop-torn-down — by the selected paused scope,
	 * snapshotting `lastSequencePlayhead` when leaving Sequence so an explicit
	 * Preview Sequence can restore it later.
	 *
	 * Contract:
	 * - never autoplays; installs `director` + `paused` (the authorable surface)
	 * - resolves the route before mutating anything — failure leaves the
	 *   current preview untouched (no partial installs, §9)
	 * - idempotent for the matching paused scope (no new runId/playhead reset);
	 *   selecting the currently-playing edge pauses it in place
	 * - edge entry maps local progress from the global Sequence playhead when
	 *   that ruler position falls inside the selected edge, else starts at 0
	 * - no document/history writes and no full `stopCameraPreview()` teardown
	 *
	 * Failure-after-commit policy (§9): if route resolution fails after the
	 * caller has already committed canonical selection, selection STAYS
	 * committed and simply has no installed scope — the status message reports
	 * why and the next successful scope-changing action repairs it. Selection
	 * is never rolled back here; that would create a second reconciliation
	 * rule competing with the reducer's canonical truth.
	 */
	installSelectionScope(
		target: EditorSelectionPreviewScopeRequest,
		options: { preservePreviewObserver?: boolean } = {}
	): boolean {
		const host = this.host;
		if (
			host.isEditorInteractionActive ||
			host.isDocumentTransactionActive ||
			host.isCameraPreviewStopping
		) {
			return false;
		}
		const current = host.cameraPreview;
		let endpoints: { fromNodeId: string; toNodeId: string } | null = null;

		// Idempotent paths — scope already reflects canonical selection.
		if (current && target.kind === 'camera' && current.kind === 'camera') {
			if (current.nodeId === target.nodeId) return true;
		}
		if (current && target.kind === 'edge' && current.kind === 'edge') {
			if (
				current.connectionId === target.connectionId &&
				current.direction === target.direction
			) {
				if (current.transport === 'playing') {
					// Selecting the playing edge pauses it where it is.
					return host.previewController.pause();
				}
				return true;
			}
		}

		// Resolve first — never tear down on a failed install. The Sequence
		// playhead snapshot below happens only AFTER validation: snapshotting
		// on a failed install would clobber the saved value (a later Stop +
		// manual ruler scrub + explicit Preview Sequence would then jump back
		// to the aborted attempt's position instead of carrying the scrub).
		let route: ResolvedCameraRoute | null = null;
		if (target.kind === 'edge') {
			const connection = host.document.connections.find((c) => c.id === target.connectionId);
			if (!connection) {
				host.setStatusMessage('Camera connection is unavailable');
				return false;
			}
			try {
				route = getCameraConnectionRoute(target.connectionId, target.direction, host.state.graph);
			} catch (error) {
				host.setStatusMessage(
					error instanceof Error ? error.message : 'Camera connection is unavailable'
				);
				return false;
			}
			endpoints = {
				fromNodeId:
					target.direction === 'forward' ? connection.fromNodeId : connection.toNodeId,
				toNodeId:
					target.direction === 'forward' ? connection.toNodeId : connection.fromNodeId
			};
		} else if (!host.scene.navigationNodes.some((node) => node.id === target.nodeId)) {
			// Registry note: `scene` is the resolved runtime truth the preview
			// pipeline itself uses (parity with the controller's `#nodeExists`);
			// the selector's `document` check upstream is the source-doc mirror.
			return false;
		}

		// Validation passed — leaving Sequence now commits its playhead for an
		// explicit return before the scope object is replaced.
		if (current?.kind === 'sequence') {
			host.previewController.lastSequencePlayhead =
				host.cameraTimelineController.cameraTimelinePlayhead;
		}
		// P11.1 — selection-driven entry deliberately skips the explicit-entry
		// `prepareCameraPreview()` ritual: the selection actions already cleared
		// placement/pending-frame/pending-nav upstream, and clearing the camera
		// focus request here would erase the focus `selectNavigationNode` just
		// established. Only the navigation hover is selection-owned cleanup.
		host.setNavigationHover(null);

		// Selection-driven scope lands paused. Mode: preserve the active
		// preview's Observer/Through Camera choice (§6 — mode changes must not
		// ride along with scope changes); idle entry defaults to director, the
		// authoring surface.
		const mode: EditorCameraPreviewMode = current?.mode ?? 'director';
		const runId = host.previewController.allocRunId();
		if (route) host.previewController.setCapturedRoute(runId, route);
		else host.previewController.clearCapturedRoute();
		// Scrub/timeline-driven transitions pass `preservePreviewObserver` so
		// crossing connection sections keeps the observer's Follow framing and
		// does not re-trigger a recenter (P8 S3 parity, §6 mode preservation).
		const preserveObserver = Boolean(options.preservePreviewObserver && current);
		if (!preserveObserver) {
			host.previewController.followEnabled = true;
			host.previewController.recenterVersion += 1;
		}

		if (target.kind === 'camera') {
			host.previewController.edgeRepeat = false;
			host.previewController.preview = {
				kind: 'camera',
				nodeId: target.nodeId,
				mode,
				transport: 'paused',
				runId,
				playhead: 0,
				startedAtMs: null
			};
			host.cameraTimelineController.syncCameraTimelineForNode(target.nodeId);
			host.timelineExpanded = true;
			return true;
		}

		host.previewController.edgeRepeat = false;
		// Endpoints come from the connection record flipped by traversal
		// direction (selector parity) — `route.nodeIds` stays in graph order
		// regardless of preview direction. A missing camera node above is
		// silently ignored: the selector already validated existence; edge
		// failures DO report because route resolution can fail on malformed
		// path data.
		if (!route || !endpoints) return false;
		const fromNodeId = endpoints.fromNodeId;
		const toNodeId = endpoints.toNodeId;
		// Current-edge handoff: start at the Sequence playhead's mapped local
		// physical progress only when the global ruler currently sits inside
		// THIS edge's span (`cameraTimelineEdgePlayheadAtProgress` clamps rather
		// than rejecting out-of-span positions, so the span check is the
		// staleness gate). Otherwise local zero. Unbuildable timeline → 0.
		const timeline = host.cameraTimelineController.getCameraTimeline();
		let playhead = 0;
		if (timeline) {
			try {
				const location = getEditorCameraTimelineLocation(
					timeline,
					host.cameraTimelineController.cameraTimelinePlayhead
				);
				if (location.edge.connectionId === target.connectionId) {
					playhead =
						cameraTimelineEdgePlayheadAtProgress(
							timeline,
							target.connectionId,
							target.direction,
							host.cameraTimelineController.cameraTimelinePlayhead
						) ?? 0;
				}
			} catch {
				playhead = 0;
			}
		}
		host.previewController.preview = {
			kind: 'edge',
			connectionId: target.connectionId,
			direction: target.direction,
			fromNodeId,
			toNodeId,
			mode,
			transport: 'paused',
			runId,
			playhead,
			startedAtMs: null
		};
		host.cameraTimelineController.syncCameraTimelineForConnection(
			target.connectionId,
			target.direction,
			playhead
		);
		host.timelineExpanded = true;
		return true;
	}

	/** S2 — direction swap preserving physical location (paused only). */
	swapEdgePreviewDirection(): boolean {
		const host = this.host;
		const preview = host.cameraPreview;
		if (!preview || preview.kind !== 'edge' || preview.transport !== 'paused') return false;
		if (host.isEditorInteractionActive || host.isDocumentTransactionActive) return false;
		const result = host.previewController.swapEdgeDirection();
		if (!result) return false;
		const updated = host.cameraPreview as Extract<EditorCameraPreview, { kind: 'edge' }>;
		if (!updated || updated.kind !== 'edge') return false;
		host.selection.setDiscovery(updated.connectionId, updated.direction);
		host.selectionActions.expandActiveCameraDirection(updated.direction);
		host.cameraTimelineController.syncCameraTimelineForConnection(
			updated.connectionId,
			updated.direction,
			updated.playhead
		);
		return true;
	}

	setEdgePreviewRepeat(value: boolean): boolean {
		return this.host.previewController.setEdgeRepeat(value);
	}

	resetPreviewToScopeStart(): boolean {
		const host = this.host;
		const preview = host.cameraPreview;
		if (!preview || preview.kind === 'camera') return false;
		const ok = host.previewController.resetToScopeStart();
		if (!ok) return false;
		if (preview.kind === 'sequence') {
			host.cameraTimelineController.cameraTimelinePlayhead = 0;
		}
		// For `connection`, per matrix: facade `cameraTimelinePlayhead` untouched — do not sync.
		return true;
	}

	// =========================================================================
	// FSM commands
	// =========================================================================

	setCameraPreviewMode(mode: EditorCameraPreviewMode) {
		const host = this.host;
		const preview = host.cameraPreview;
		if (
			!preview ||
			preview.mode === mode ||
			host.isEditorInteractionActive ||
			host.isDocumentTransactionActive
		) {
			return false;
		}
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind !== 'camera' && preview.kind !== 'sequence') {
			try {
				route = this.resolveCameraPreviewRoute(preview);
			} catch (error) {
				host.setStatusMessage(
					error instanceof Error ? error.message : 'Camera preview route is unavailable'
				);
				return false;
			}
		}
		const runId = host.previewController.allocRunId();
		if (route) host.previewController.setCapturedRoute(runId, route);
		else host.previewController.clearCapturedRoute();
		host.previewController.preview = {
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
		const host = this.host;
		const preview = host.cameraPreview;
		if (
			!preview ||
			preview.kind === 'camera' ||
			preview.transport === 'playing' ||
			host.isEditorInteractionActive ||
			host.isDocumentTransactionActive
		) {
			return false;
		}
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind === 'sequence') {
			if (!host.cameraTimelineController.readCameraTimeline()) return false;
		} else {
			try {
				route =
					preview.mode === 'director'
						? this.resolveCameraPreviewRoute(preview)
						: this.getCapturedCameraPreviewRoute(preview.runId)!;
				if (!route) throw new Error('Camera preview route capture is unavailable');
			} catch (error) {
				host.setStatusMessage(
					error instanceof Error ? error.message : 'Camera preview route is unavailable'
				);
				return false;
			}
		}
		const runId = host.previewController.allocRunId();
		if (route) host.previewController.setCapturedRoute(runId, route);
		else host.previewController.clearCapturedRoute();
		const playhead = preview.playhead >= 1 ? 0 : preview.playhead;
		host.previewController.preview = {
			...preview,
			transport: 'playing',
			runId,
			playhead,
			startedAtMs: null
		};
		if (preview.kind === 'edge') {
			host.cameraTimelineController.syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				playhead
			);
		} else if (preview.kind === 'sequence') {
			host.cameraTimelineController.cameraTimelinePlayhead = playhead;
		}
		return true;
	}

	pauseCameraPreview() {
		return this.host.previewController.pause();
	}

	setCameraPreviewPlayhead(progress: number, runId = this.host.cameraPreview?.runId) {
		const host = this.host;
		const preview = host.cameraPreview;
		if (!preview || preview.kind === 'camera' || preview.runId !== runId || !Number.isFinite(progress)) {
			return false;
		}
		const playhead = Math.min(1, Math.max(0, progress));
		if (Math.abs(preview.playhead - playhead) <= 1e-6) {
			return false;
		}
		host.previewController.preview = {
			...preview,
			playhead,
			...(preview.transport === 'playing' ? {} : { transport: 'paused' as const, startedAtMs: null })
		};
		if (preview.kind === 'edge') {
			host.cameraTimelineController.syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				playhead
			);
		} else if (preview.kind === 'sequence') {
			host.cameraTimelineController.cameraTimelinePlayhead = playhead;
		}
		return true;
	}

	stepCameraPreview(direction: -1 | 1) {
		const host = this.host;
		const preview = host.cameraPreview;
		if (
			!preview ||
			preview.mode !== 'director' ||
			preview.kind === 'camera' ||
			preview.transport === 'playing'
		) {
			return false;
		}
		const breakpoints = [0, 1];
		if (preview.kind === 'sequence') {
			const timeline = host.cameraTimelineController.readCameraTimeline();
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
			// P8 S1 parity — edge previews step with authored timing/easing
			// applied (S6: the legacy multi-edge transition route path is gone).
			const motion =
				preview.kind === 'edge'
					? resolveDirectedEdgeMotionByDirection(
							host.state.graph,
							preview.connectionId,
							preview.direction,
							{ route }
						).motion
					: createCameraMotion(route);
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
		const next =
			direction < 0
				? [...ordered].reverse().find((value) => value < preview.playhead - epsilon) ?? 0
				: ordered.find((value) => value > preview.playhead + epsilon) ?? 1;
		return this.setCameraPreviewPlayhead(next);
	}

	toggleCameraPreviewFollow() {
		return this.host.previewController.toggleFollow();
	}

	recenterCameraPreview() {
		return this.host.previewController.recenter();
	}

	markCameraPreviewStarted(runId: number, startedAtMs: number) {
		return this.host.previewController.markStarted(runId, startedAtMs);
	}

	completeCameraPreview(runId: number) {
		const host = this.host;
		const preview = host.cameraPreview;
		if (
			!preview ||
			preview.kind === 'camera' ||
			preview.runId !== runId ||
			preview.transport !== 'playing' ||
			preview.startedAtMs === null
		) {
			return false;
		}
		// D4 repeat — auto-restart for edge repeat (guard zero-duration + reducedMotion)
		if (preview.kind === 'edge' && host.previewController.edgeRepeat) {
			try {
				const motion = resolveDirectedEdgeMotionByDirection(
					host.state.graph,
					preview.connectionId,
					preview.direction
				).motion;
				// Guard per D4: stay complete when Rig would immediate-complete
				if (motion.durationSeconds !== 0 && !host.state.reducedMotion) {
					const newRunId = host.previewController.allocRunId();
					let route: ResolvedCameraRoute | null = null;
					try {
						route = getCameraConnectionRoute(
							preview.connectionId,
							preview.direction,
							host.state.graph
						);
					} catch {
						route = null;
					}
					if (route) host.previewController.setCapturedRoute(newRunId, route);
					else host.previewController.clearCapturedRoute();
					host.previewController.preview = {
						...preview,
						transport: 'playing',
						runId: newRunId,
						playhead: 0,
						startedAtMs: null
					};
					host.cameraTimelineController.syncCameraTimelineForConnection(
						preview.connectionId,
						preview.direction,
						0
					);
					return true;
				}
			} catch {
				// fall through to normal complete
			}
		}
		host.previewController.preview = {
			...preview,
			transport: 'paused',
			playhead: 1,
			startedAtMs: null
		};
		if (preview.kind === 'edge') {
			host.cameraTimelineController.syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				1
			);
		} else if (preview.kind === 'sequence') {
			host.cameraTimelineController.cameraTimelinePlayhead = 1;
		}
		return true;
	}

	stopCameraPreview() {
		const host = this.host;
		// P11.1 review fix — the flag spans the ENTIRE ritual (keyframe-drag
		// cancel + framing-cancel + restore + clear), not just the restore call:
		// any cancel callback that re-enters selection must see the bar too.
		host.isCameraPreviewStopping = true;
		try {
			if (host.viewKeyframeProgressDrag) {
				host.cancelViewKeyframeProgressDrag();
			}
			if (!host.cameraPreview) return false;
			if (!host.cancelDirectFramingDragOrFail()) return false;
			if (host.restoreCameraPreview?.() === false) return false;
			host.previewController.preview = null;
			host.previewController.clearCapturedRoute();
			host.previewController.followEnabled = true;
			host.previewController.edgeRepeat = false;
			// Phase 2.1: Preview Stop preserves the active connection + direction so any
			// previously-selected keyframe remains reachable through tree/timeline/3D.
			return true;
		} finally {
			host.isCameraPreviewStopping = false;
		}
	}

	getCapturedCameraPreviewRoute(runId: number) {
		return this.host.previewController.getCapturedRoute(runId);
	}
}
