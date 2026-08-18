/**
 * `EditorCameraPreviewCommands` — preview + timeline playback orchestration.
 *
 * Slice 2 of the Priority-1 file-split refactor lifts the facade's preview
 * entry rituals (`playActiveConnectionEdge`, `previewActiveConnectionReverse`,
 * `previewGuidedTour`, `previewSelectedNode`, `previewSelectedTransition`,
 * `previewSelectedConnection`), FSM commands (`setCameraPreviewMode`,
 * `playCameraPreview`, `pauseCameraPreview`, `setCameraPreviewPlayhead`,
 * `stepCameraPreview`, `toggleCameraPreviewFollow`, `recenterCameraPreview`,
 * `markCameraPreviewStarted`, `completeCameraPreview`, `stopCameraPreview`,
 * `getCapturedCameraPreviewRoute`), and the private route plumbing
 * (`resolveCameraPreviewRoute`, `prepareCameraPreview`,
 * `seedEmptyReverseForSelectedForwardTrack`) out of `museum-editor.svelte.ts`.
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

import { getNode, type MuseumSceneDocument, type SceneConnection, type RuntimeMuseumScene } from '$lib/content/scene';
import type { MuseumStateStore } from '$lib/state/museum-state.svelte';
import { getCameraConnectionRoute, getCameraRoute, type ResolvedCameraRoute } from '$lib/museum/navigation/camera-route';
import { cameraMotionProgressAtEdgeProgress, createCameraMotion } from '$lib/museum/navigation/camera-motion';
import { cameraTimelineEdgePlayheadAtProgress, cameraTimelineProgressAtEdgeProgress, type EditorCameraTimeline } from '../editor-camera-timeline';
import { seedEmptyReverseViewTrack, syncReverseViewTrackFromForward } from '../editor-camera-view';
import type { EditorCameraSelection, EditorNavigationSelection } from '../editor-selection';
import type {
	EditorCameraPreview,
	EditorCameraPreviewMode,
	EditorViewKeyframeProgressDragSelection
} from '../museum-editor.types';
import type { CameraConnectionDirection } from '$lib/types/museum';

import type { EditorSelectionActions } from './selection-actions.svelte';
import type { EditorSelectionStore } from './selection-store.svelte';
import type { EditorCameraPreviewController } from './camera-preview-controller.svelte';
import type { EditorCameraTimelineController } from './camera-timeline-controller.svelte';

/**
 * Composition-root surface `EditorCameraPreviewCommands` depends on.
 * Everything here is owned by `MuseumEditorStore`; this controller never
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
	readonly document: MuseumSceneDocument;
	readonly scene: RuntimeMuseumScene;
	readonly state: MuseumStateStore;
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

	// Writable slots.
	cameraTimelinePlayhead: number;
	timelineExpanded: boolean;

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

	/** Resolve the exact route a non-tour preview is animating along. */
	resolveCameraPreviewRoute(preview: Exclude<EditorCameraPreview, null>): ResolvedCameraRoute {
		if (preview.kind === 'node') {
			throw new Error('A node preview has no camera route');
		}
		if (preview.kind === 'connection') {
			return getCameraConnectionRoute(
				preview.connectionId,
				preview.direction,
				this.host.state.graph
			);
		}
		if (preview.kind === 'tour') {
			throw new Error('Camera flow preview uses exact camera timeline motions');
		}
		return getCameraRoute(preview.fromNodeId, preview.toNodeId, this.host.state.graph);
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
	// Edge / guide / node / transition preview entry
	// =========================================================================

	/**
	 * Play the active connection edge in the current travel direction (forward
	 * or reverse). Seeds empty reverse from forward when needed. Used by ▶
	 * while Reverse is toggled; guided-tour play remains previewGuidedTour.
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
						host.cameraTimelinePlayhead
					) ?? 0)
				: 0;
		const runId = host.previewController.allocRunId();
		host.previewController.setCapturedRoute(runId, route);
		host.previewController.followEnabled = true;
		host.previewController.recenterVersion += 1;
		host.previewController.preview = {
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

	/** Phase 3.1 — primary Play promotes the current global ruler into one guided cycle. */
	previewGuidedTour(mode: EditorCameraPreviewMode = 'visitor') {
		const host = this.host;
		if (host.isEditorInteractionActive || host.isDocumentTransactionActive) {
			return false;
		}
		const current = host.cameraPreview;
		if (current?.kind === 'tour') {
			if (current.transport === 'playing') return false;
			if (host.cameraPreview?.transport === 'complete') {
				this.setCameraPreviewPlayhead(0, host.cameraPreview.runId);
			}
			return this.playCameraPreview();
		}
		if (current?.transport === 'playing') return false;

		const timeline = host.cameraTimelineController.readCameraTimeline();
		if (!timeline) return false;
		if (!current && !this.prepareCameraPreview()) return false;

		const runId = host.previewController.allocRunId();
		host.previewController.clearCapturedRoute();
		if (!current) {
			host.previewController.followEnabled = true;
			host.previewController.recenterVersion += 1;
		}
		const playhead = Math.min(1, Math.max(0, host.cameraTimelinePlayhead));
		host.previewController.preview = {
			kind: 'tour',
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

	previewSelectedNode(mode: EditorCameraPreviewMode = 'visitor') {
		const host = this.host;
		if (host.cameraPreview) return false;
		const nodeId = host.cameraSelection?.nodeId;
		if (!nodeId || !host.scene.navigationNodes.some((node) => node.id === nodeId)) {
			host.setStatusMessage('Select a camera node to preview');
			return false;
		}
		if (!this.prepareCameraPreview()) return false;
		host.previewController.clearCapturedRoute();
		host.previewController.followEnabled = true;
		host.previewController.recenterVersion += 1;
		host.previewController.preview = {
			kind: 'node',
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

	previewSelectedTransition(mode: EditorCameraPreviewMode = 'visitor') {
		const host = this.host;
		if (host.cameraPreview) return false;
		const nodeId = host.cameraSelection?.nodeId;
		if (!nodeId) {
			host.setStatusMessage('Select a camera node to preview');
			return false;
		}

		let toNodeId: string;
		let route: ResolvedCameraRoute;
		try {
			const node = getNode(nodeId, host.state.graph);
			if (!node.nextNodeId) throw new Error(`Camera node has no nextNodeId: ${nodeId}`);
			toNodeId = node.nextNodeId;
			route = getCameraRoute(nodeId, toNodeId, host.state.graph);
		} catch (error) {
			host.setStatusMessage(
				error instanceof Error ? error.message : 'Camera transition is unavailable'
			);
			return false;
		}

		if (!this.prepareCameraPreview()) return false;
		const runId = host.previewController.allocRunId();
		host.previewController.setCapturedRoute(runId, route);
		host.previewController.followEnabled = true;
		host.previewController.recenterVersion += 1;
		host.previewController.preview = {
			kind: 'transition',
			fromNodeId: nodeId,
			toNodeId,
			mode,
			transport: mode === 'director' ? 'paused' : 'playing',
			runId,
			playhead: 0,
			startedAtMs: null
		};
		host.timelineExpanded = true;
		return true;
	}

	previewSelectedConnection(
		direction: 'forward' | 'reverse',
		mode: EditorCameraPreviewMode = 'visitor'
	) {
		const host = this.host;
		if (host.cameraPreview || host.isEditorInteractionActive) return false;
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
		host.cameraTimelineController.syncCameraTimelineForConnection(
			connection.id,
			direction,
			0
		);
		host.timelineExpanded = true;
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
		if (preview.kind !== 'node' && preview.kind !== 'tour') {
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
			preview.kind === 'node' ||
			preview.transport === 'playing' ||
			host.isEditorInteractionActive ||
			host.isDocumentTransactionActive
		) {
			return false;
		}
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind === 'tour') {
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
		const playhead = preview.transport === 'complete' ? 0 : preview.playhead;
		host.previewController.preview = {
			...preview,
			transport: 'playing',
			runId,
			playhead,
			startedAtMs: null
		};
		if (preview.kind === 'connection') {
			host.cameraTimelineController.syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				playhead
			);
		} else if (preview.kind === 'tour') {
			host.cameraTimelinePlayhead = playhead;
		}
		return true;
	}

	pauseCameraPreview() {
		return this.host.previewController.pause();
	}

	setCameraPreviewPlayhead(progress: number, runId = this.host.cameraPreview?.runId) {
		const host = this.host;
		const preview = host.cameraPreview;
		if (!preview || preview.kind === 'node' || preview.runId !== runId || !Number.isFinite(progress)) {
			return false;
		}
		const playhead = Math.min(1, Math.max(0, progress));
		if (Math.abs(preview.playhead - playhead) <= 1e-6 && preview.transport !== 'complete') {
			return false;
		}
		host.previewController.preview = {
			...preview,
			playhead,
			...(preview.transport === 'complete'
				? { transport: 'paused' as const, startedAtMs: null }
				: {})
		};
		if (preview.kind === 'connection') {
			host.cameraTimelineController.syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				playhead
			);
		} else if (preview.kind === 'tour') {
			host.cameraTimelinePlayhead = playhead;
		}
		return true;
	}

	stepCameraPreview(direction: -1 | 1) {
		const host = this.host;
		const preview = host.cameraPreview;
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
			preview.kind === 'node' ||
			preview.runId !== runId ||
			preview.transport !== 'playing' ||
			preview.startedAtMs === null
		) {
			return false;
		}
		host.previewController.preview = {
			...preview,
			transport: 'complete',
			playhead: 1,
			startedAtMs: null
		};
		if (preview.kind === 'connection') {
			host.cameraTimelineController.syncCameraTimelineForConnection(
				preview.connectionId,
				preview.direction,
				1
			);
		} else if (preview.kind === 'tour') {
			host.cameraTimelinePlayhead = 1;
		}
		return true;
	}

	stopCameraPreview() {
		const host = this.host;
		if (host.viewKeyframeProgressDrag) {
			host.cancelViewKeyframeProgressDrag();
		}
		if (!host.cameraPreview) return false;
		if (!host.cancelDirectFramingDragOrFail()) return false;
		if (host.restoreCameraPreview?.() === false) return false;
		host.previewController.preview = null;
		host.previewController.clearCapturedRoute();
		host.previewController.followEnabled = true;
		// Phase 2.1: Preview Stop preserves the active connection + direction so any
		// previously-selected keyframe remains reachable through tree/timeline/3D.
		return true;
	}

	getCapturedCameraPreviewRoute(runId: number) {
		return this.host.previewController.getCapturedRoute(runId);
	}
}
