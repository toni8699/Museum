/**
 * `EditorCameraTimelineController` — guided-tour ruler seek / select / step /
 * edge-travel orchestration (Phase 9.4).
 *
 * The god file (`editor-store.svelte.ts`) historically owned every timeline
 * *interaction*: building/reading the timeline index, syncing the global
 * playhead to a connection or node pose, scrubbing the ruler, selecting edges
 * / nodes / view keys from the timeline chrome, stepping cues, and toggling
 * forward/reverse edge travel. Phase 9.4 hard-moves those method bodies here,
 * following the `EditorViewKeyframeController` + host-injection pattern.
 *
 * `EditorStore` keeps identical public method signatures as thin
 * delegates (`seekCameraTimeline(p) { return this.cameraTimelineController
 * .seekCameraTimeline(p); }`), so components keep importing the store facade
 * unchanged.
 *
 * Preview *start* / play / pause / stop stay on the facade (selection side-
 * effects). Facade preview glue calls `sync*` / `readCameraTimeline` /
 * `show*` on this controller after `previewController.start*`-style installs.
 *
 * P7.5 — the controller owns `cameraTimelinePlayhead` as class-field
 * `$state` (the 9.3 gotcha that kept it on the facade is obsolete: sibling
 * controllers demonstrably own class-field `$state`). The facade keeps a
 * read-only getter delegate; host accessors re-point at this field. The
 * controller never imports the document store or history controller;
 * document transactions go through host wrappers.
 */

import type {
	SceneDocument,
	NavigationGraph,
	RuntimeScene
} from '$lib/content/scene';
import {
	cameraMotionProgressAtEdgeProgress
} from '@portfolio/camera-core';
import {
	getCameraConnectionRoute,
	type ResolvedCameraRoute
} from '@portfolio/camera-core';
import type { CameraConnectionDirection } from '$lib/types/scene';
import {
	cameraTimelineEdgePlayheadAtProgress,
	cameraTimelineProgressAtEdgePlayhead,
	cameraTimelineProgressAtEdgeProgress,
	createEdgeLocalTimeline,
	createEditorCameraTimeline,
	createEditorCameraTimelineResolution,
	getEditorCameraTimelineLocation,
	type EditorCameraTimeline,
	type EditorCameraTimelineNodeBoundary
} from '../camera/editor-camera-timeline';
import {
	findSceneCameraViewKeyframe,
	seedEmptyReverseViewTrack
} from '../camera/editor-camera-view';
import type {
	EditorCameraPreview,
	EditorPendingNavigationCommand
} from '../editor-types';
import type { EditorSelectionActions } from './selection-actions.svelte';
import type { EditorSelectionStore } from './selection-store.svelte';

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

/**
 * Composition-root surface the camera-timeline controller depends on.
 * Everything here stays owned by `EditorStore`; the controller never
 * mutates the document store, history controller, or preview controller
 * directly — only through the accessors and wrappers below.
 */
export interface EditorCameraTimelineControllerHost {
	// Mutation guards.
	readonly isEditorInteractionActive: boolean;
	readonly isRelic: boolean;
	readonly isDocumentTransactionActive: boolean;
	readonly isDocumentMutationBlocked: boolean;
	readonly pendingNavigationCommand: EditorPendingNavigationCommand;
	/** P11.2 §8 — auto-pause seam: scrubbing/timing writes pause a playing preview first. */
	requestAuthoringPause(): boolean;
	/** P11.2 §8 — framing seam: paused previews (either camera) pass; playing pauses (visitor playing refuses). */
	requestFramingPause(): boolean;
	/** P12.2 — transport seek pauses either POV or Observer preview. */
	requestTransportPause(): boolean;

	// Document + resolved scene / graph.
	readonly document: SceneDocument;
	readonly scene: RuntimeScene;
	readonly graph: NavigationGraph;
	readonly previewController: { edgeRepeat: boolean };

	// Selection reducer (discovery accessors used by setCameraEdgeTravel).
	readonly selection: EditorSelectionStore;

	cameraPreview: EditorCameraPreview;
	readonly activeCameraConnectionId: string | null;
	readonly activeCameraDirection: CameraConnectionDirection;
	timelineExpanded: boolean;

	setStatusMessage(message: string | null): void;

	// Document transaction wrappers (guard-aware; seed reverse on commit).
	beginDocumentTransaction(): boolean;
	commitDocumentTransaction(): boolean;

	// Preview plumbing (facade `#prepareCameraPreview` + previewController ops).
	prepareCameraPreview(): boolean;
	allocPreviewRunId(): number;
	setCapturedRoute(runId: number, route: ResolvedCameraRoute): void;
	clearCapturedRoute(): void;
	followEnabled: boolean;
	recenterVersion: number;
	setCameraPreviewPlayhead(progress: number, runId?: number): boolean;
	getCapturedCameraPreviewRoute(runId: number): ResolvedCameraRoute | null;
	getTimeline(): EditorCameraTimeline | null;

	cancelAssetPlacement(message?: string): boolean;
	cancelPendingFrame(): void;
	/** Session silent clear — no focus version bump (9.1 gotcha). */
	clearCameraFocusRequest(): void;
}

export class EditorCameraTimelineController {
	/** P7.5 — owned global ruler playhead (was facade `$state`). */
	cameraTimelinePlayhead = $state(0);

	constructor(
		private readonly selectionActions: EditorSelectionActions,
		private readonly host: EditorCameraTimelineControllerHost
	) {}

	/** Build the current timeline index from the resolved graph and shared motion compiler. */
	getCameraTimeline(): EditorCameraTimeline | null {
		return this.host.getTimeline();
	}

	readCameraTimeline() {
		const cached = this.getCameraTimeline();
		if (cached) return cached;
		try {
			return createEditorCameraTimeline(this.host.graph);
		} catch (error) {
			this.host.setStatusMessage(
				error instanceof Error ? error.message : 'The camera timeline is unavailable'
			);
			return null;
		}
	}

	syncCameraTimelineForConnection(
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

	syncCameraTimelineForNode(nodeId: string) {
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
		// P12.2 D4 — only prohibited state is checked before target resolution.
		// Transport pause belongs after validation and true no-op detection.
		if (
			this.host.isEditorInteractionActive ||
			this.host.pendingNavigationCommand ||
			this.host.isDocumentTransactionActive
		) {
			return false;
		}
		return true;
	}

	#requestTimelinePause() {
		return this.host.isRelic
			? this.host.requestFramingPause()
			: this.host.requestTransportPause();
	}

	#writeSequencePlayhead(progress: number) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(progress)) return false;
		const preview = this.host.cameraPreview;
		if (!preview || preview.kind !== 'sequence') return false;
		const target = Math.min(1, Math.max(0, progress));
		const moved =
			preview.playhead !== target || this.cameraTimelinePlayhead !== target;
		if (!moved) return false;
		if (!this.#requestTimelinePause()) return false;
		const written = this.host.setCameraPreviewPlayhead(target, preview.runId);
		this.cameraTimelinePlayhead = target;
		return written || moved;
	}

	showCameraTimelineNodePose(nodeId: string) {
		if (!this.#canSeekCameraTimeline()) return false;
		if (!this.host.scene.navigationNodes.some((node) => node.id === nodeId)) return false;
		if (
			this.host.cameraPreview?.kind === 'camera' &&
			this.host.cameraPreview.nodeId === nodeId &&
			this.host.cameraPreview.mode === 'director' &&
			this.host.cameraPreview.transport === 'paused'
		) {
			this.host.clearCameraFocusRequest();
			return false;
		}
		if (!this.host.requestFramingPause()) return false;
		const hadPreview = this.host.cameraPreview !== null;
		if (!hadPreview && !this.host.prepareCameraPreview()) return false;
		this.host.clearCapturedRoute();
		this.host.clearCameraFocusRequest();
		this.host.followEnabled = true;
		this.host.recenterVersion += 1;
		this.host.previewController.edgeRepeat = false;
		this.host.cameraPreview = {
			kind: 'camera',
			nodeId,
			mode: 'director',
			transport: 'paused',
			runId: this.host.allocPreviewRunId(),
			playhead: 0,
			startedAtMs: null
		};
		this.host.timelineExpanded = true;
		return true;
	}

	showCameraTimelineConnectionPose(
		connectionId: string,
		direction: CameraConnectionDirection,
		playhead: number,
		options: { preservePreviewObserver?: boolean } = {}
	) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(playhead)) return false;
		const preview = this.host.cameraPreview;
		if (
			preview?.kind === 'edge' &&
			preview.connectionId === connectionId &&
			preview.direction === direction &&
			preview.transport === 'paused'
		) {
			this.host.clearCameraFocusRequest();
			return this.host.setCameraPreviewPlayhead(playhead, preview.runId);
		}
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) return false;
		let route: ResolvedCameraRoute;
		try {
			route = getCameraConnectionRoute(connectionId, direction, this.host.graph);
		} catch (error) {
			this.host.setStatusMessage(
				error instanceof Error ? error.message : 'The camera connection is unavailable'
			);
			return false;
		}
		if (!this.host.requestFramingPause()) return false;
		const hadPreview = this.host.cameraPreview !== null;
		if (!hadPreview && !this.host.prepareCameraPreview()) return false;
		const runId = this.host.allocPreviewRunId();
		this.host.setCapturedRoute(runId, route);
		this.host.clearCameraFocusRequest();
		if (!options.preservePreviewObserver || !hadPreview) {
			this.host.followEnabled = true;
			this.host.recenterVersion += 1;
		}
		this.host.previewController.edgeRepeat = false;
		const fromNodeId =
			direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
		const toNodeId =
			direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
		this.host.cameraPreview = {
			kind: 'edge',
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
		this.host.timelineExpanded = true;
		return true;
	}

	/** P12.2 D5 — Sequence-only seek; selection and scope stay untouched. */
	seekSequencePreview(progress: number) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(progress)) return false;
		const preview = this.host.cameraPreview;
		if (!preview || preview.kind !== 'sequence') return false;
		const timeline = this.readCameraTimeline();
		if (!timeline || timeline.edges.length === 0 || timeline.durationSeconds <= 1e-9) {
			return false;
		}
		const location = getEditorCameraTimelineLocation(timeline, progress);
		return this.#writeSequencePlayhead(location.progress);
	}

	/** Resolve generic node clicks to their nearest Sequence occurrence. */
	seekSequencePreviewForNode(nodeId: string) {
		const preview = this.host.cameraPreview;
		if (!preview || preview.kind !== 'sequence') return false;
		const timeline = this.readCameraTimeline();
		if (!timeline) return false;
		const candidates = timeline.nodeBoundaries.filter((boundary) => boundary.nodeId === nodeId);
		if (candidates.length === 0) {
			// A sequenced node beyond a missing flow edge has no local boundary.
			// Keep the active partial Sequence and seek its final evaluable pose.
			try {
				const resolution = createEditorCameraTimelineResolution(this.host.graph);
				if (resolution.diagnostic.kind !== 'gap' || !resolution.lastEvaluableBoundary) {
					return false;
				}
					return this.#writeSequencePlayhead(resolution.lastEvaluableBoundary.progress);
			} catch {
				return false;
			}
		}
		const current = preview.playhead;
		const boundary = candidates.reduce((nearest, candidate) =>
			Math.abs(candidate.progress - current) < Math.abs(nearest.progress - current)
				? candidate
				: nearest
		);
		return this.#writeSequencePlayhead(boundary.progress);
	}

	/** P12.2 D8 — Edge-local seek; selection and scope stay untouched. */
	seekEdgePreview(progress: number) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(progress)) return false;
		const preview = this.host.cameraPreview;
		if (!preview || preview.kind !== 'edge') return false;
		const capturedRoute = this.host.getCapturedCameraPreviewRoute(preview.runId);
		const edgeTimeline = createEdgeLocalTimeline(
			this.host.graph,
			preview.connectionId,
			preview.direction,
			capturedRoute ? { route: capturedRoute } : undefined
		);
		if (!edgeTimeline || edgeTimeline.durationSeconds <= 1e-9) return false;
		const target = Math.min(1, Math.max(0, progress));
		if (preview.playhead === target) return false;
		if (!this.#requestTimelinePause()) return false;
		return this.host.setCameraPreviewPlayhead(target, preview.runId);
	}

	/** Phase 2.2 compatibility facade for the active Sequence scope. */
	seekCameraTimeline(progress: number) {
		return this.seekSequencePreview(progress);
	}

	/**
	 * While Reverse is toggled on the active connection, keep scrubbing that edge
	 * in reverse; leaving the edge falls back to the guided travel direction.
	 */
	#timelineTravelDirection(
		connectionId: string,
		guidedDirection: CameraConnectionDirection
	): CameraConnectionDirection {
		if (
			this.host.activeCameraDirection === 'reverse' &&
			this.host.activeCameraConnectionId === connectionId
		) {
			return 'reverse';
		}
		return guidedDirection;
	}

	/** Toggle reverse travel on the active connection (scrub/play/keys follow). */
	toggleCameraEdgeReverse() {
		const connectionId = this.host.activeCameraConnectionId;
		if (
			!connectionId ||
			this.host.isEditorInteractionActive ||
			this.host.isDocumentTransactionActive
		) {
			return false;
		}
		const next: CameraConnectionDirection =
			this.host.activeCameraDirection === 'reverse' ? 'forward' : 'reverse';
		return this.setCameraEdgeTravel(next);
	}

	/**
	 * Set forward/reverse travel for the active connection, preserving the
	 * current timeline playhead (remapped onto the chosen direction).
	 */
	setCameraEdgeTravel(direction: CameraConnectionDirection) {
		const connectionId = this.host.activeCameraConnectionId;
		if (
			!connectionId ||
			this.host.isEditorInteractionActive ||
			this.host.isDocumentTransactionActive
		) {
			return false;
		}
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) return false;

		if (direction === 'reverse') {
			const needsSeed =
				(connection.viewTracks?.forward.length ?? 0) > 0 &&
				(connection.viewTracks?.reverse.length ?? 0) === 0;
			if (needsSeed) {
				// P11.2 §8 — edge-travel writes pause a playing preview first.
				if (
					!this.host.requestAuthoringPause() ||
					!this.host.beginDocumentTransaction()
				) {
					return false;
				}
				seedEmptyReverseViewTrack(connection);
				if (!this.host.commitDocumentTransaction()) return false;
			}
		}

		const timeline = this.readCameraTimeline();
		const edgePlayhead =
			timeline
				? (cameraTimelineEdgePlayheadAtProgress(
						timeline,
						connectionId,
						direction,
						this.cameraTimelinePlayhead
					) ?? 0)
				: 0;

		if (
			this.host.selection.discoveryConnectionId === connectionId &&
			this.host.selection.discoveryDirection === direction &&
			this.host.selection.navigation.kind === 'connection'
		) {
			return this.showCameraTimelineConnectionPose(connectionId, direction, edgePlayhead);
		}

		this.host.cancelAssetPlacement();
		this.host.cancelPendingFrame();
		this.host.selection.setNavigation({ kind: 'connection', connectionId, direction });
		this.selectionActions.expandActiveCameraDirection(direction);
		return this.showCameraTimelineConnectionPose(connectionId, direction, edgePlayhead);
	}

	/** Select a guided edge; selection never changes active preview scope. */
	selectCameraTimelineEdge(
		connectionId: string,
		direction: CameraConnectionDirection,
		progress: number
	) {
		if (!this.#canSeekCameraTimeline() || !Number.isFinite(progress)) return false;
		return this.selectionActions.selectCameraConnectionDirection(connectionId, direction);
	}

	/** Select one occurrence of a guided node and seek exactly once in Sequence scope. */
	selectCameraTimelineNode(nodeId: string, boundaryIndex: number) {
		if (!this.#canSeekCameraTimeline() || !Number.isInteger(boundaryIndex)) return false;
		const timeline = this.readCameraTimeline();
		const boundary = timeline?.nodeBoundaries[boundaryIndex];
		if (!timeline || boundary?.nodeId !== nodeId) return false;
		const selected = this.selectionActions.selectNavigationNode(nodeId, {
			suppressSequenceSeek: true
		});
		const sought =
			this.host.cameraPreview?.kind === 'sequence'
				? this.#writeSequencePlayhead(boundary.progress)
				: false;
		return selected || sought;
	}

	/** Select a directional key without changing preview scope or playhead. */
	selectCameraTimelineViewKeyframe(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	) {
		if (!this.#canSeekCameraTimeline()) return false;
		const keyframe = findSceneCameraViewKeyframe(
			this.host.document,
			connectionId,
			direction,
			keyframeId
		);
		if (!keyframe) return false;
		return this.selectionActions.selectViewKeyframe(
			connectionId,
			direction,
			keyframeId
		);
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
				this.host.activeCameraConnectionId === edge.connectionId
					? this.host.activeCameraDirection
					: edge.direction;
			const connection = this.host.document.connections.find(
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

	/** Seek the previous/next camera-node boundary without changing scope. */
	stepCameraNodeBoundary(direction: -1 | 1) {
		if (!this.#canSeekCameraTimeline()) return false;
		const preview = this.host.cameraPreview;
		if (!preview || preview.kind === 'camera') return false;
		if (preview.kind === 'edge') {
			const capturedRoute = this.host.getCapturedCameraPreviewRoute(preview.runId);
			const edgeTimeline = createEdgeLocalTimeline(
				this.host.graph,
				preview.connectionId,
				preview.direction,
				capturedRoute ? { route: capturedRoute } : undefined
			);
			if (!edgeTimeline) return false;
			const target = direction < 0 ? 0 : 1;
			return this.seekEdgePreview(target);
		}
		const timeline = this.readCameraTimeline();
		if (!timeline || timeline.nodeBoundaries.length === 0) return false;
		const epsilon = 1e-6;
		const target = direction < 0
			? [...timeline.nodeBoundaries].reverse().find((boundary) => boundary.progress < preview.playhead - epsilon)
			: timeline.nodeBoundaries.find((boundary) => boundary.progress > preview.playhead + epsilon);
		if (!target) return false;
		return this.seekSequencePreview(target.progress);
	}

	/** Seek the previous/next cue without changing selection or scope. */
	stepCameraTimeline(direction: -1 | 1) {
		if (!this.#canSeekCameraTimeline()) return false;
		const preview = this.host.cameraPreview;
		if (!preview || preview.kind === 'camera') return false;
		if (preview.kind === 'edge') {
			const capturedRoute = this.host.getCapturedCameraPreviewRoute(preview.runId);
			const edgeTimeline = createEdgeLocalTimeline(
				this.host.graph,
				preview.connectionId,
				preview.direction,
				capturedRoute ? { route: capturedRoute } : undefined
			);
			if (!edgeTimeline || edgeTimeline.durationSeconds <= 1e-9) return false;
			const breakpoints = [0, 1];
			for (const [edgeIndex, edge] of edgeTimeline.motion.positionEdgeSpans.entries()) {
				breakpoints.push(
					cameraMotionProgressAtEdgeProgress(edgeTimeline.motion, edgeIndex, 0),
					cameraMotionProgressAtEdgeProgress(edgeTimeline.motion, edgeIndex, 1)
				);
				for (const keyframe of edge.viewTrack?.keyframes ?? []) {
					breakpoints.push(
						cameraMotionProgressAtEdgeProgress(
							edgeTimeline.motion,
							edgeIndex,
							keyframe.progress
						)
					);
				}
			}
			const ordered = [...new Set(breakpoints.map((value) => value.toFixed(9)))]
				.map(Number)
				.sort((left, right) => left - right);
			const epsilon = 1e-6;
			const target =
				direction < 0
					? [...ordered].reverse().find((value) => value < preview.playhead - epsilon) ?? 0
					: ordered.find((value) => value > preview.playhead + epsilon) ?? 1;
			return this.seekEdgePreview(target);
		}

		const timeline = this.readCameraTimeline();
		if (!timeline || timeline.edges.length === 0) return false;
		const cues = this.#getCameraTimelineKeyBoundaries(timeline);
		const epsilon = 1e-6;
		const cue =
			direction < 0
				? [...cues]
						.reverse()
					.find(
						(candidate) =>
							candidate.progress < preview.playhead - epsilon
						) ?? cues[0]
				: cues.find(
						(candidate) =>
							candidate.progress > preview.playhead + epsilon
					) ?? cues.at(-1);
		if (!cue) return false;
		return this.seekSequencePreview(cue.progress);
	}
}
