/**
 * `EditorCameraPreviewController` — owns the camera preview FSM.
 *
 * Slice 3 of the museum-editor refactor plan lifts `cameraPreview`,
 * `cameraPreviewFollowEnabled`, `cameraPreviewRecenterVersion`,
 * `#capturedCameraPreviewRoute`, `#nextCameraPreviewRunId`, and the full
 * `play/pause/stop/setPlayhead/step/start…/previewGuidedTour` method zoo
 * (plus the timeline-scrub helpers per audit §3.7) out of
 * `museum-editor.svelte.ts`.
 *
 * **Peer-link surface.** `HistoryController.canUndo` reads `transportState`
 * here. Exposing the FSM through a single read-only getter is the entire
 * coupling; nothing else crosses the boundary.
 *
 * **Document coupling.** Takes the document store in the constructor and
 * reads `document.state.graph` for route resolution. The composition root
 * registers two `afterReplace` listeners on the document store: this
 * controller's `refreshPausedDirector()` (re-resolves the captured route;
 * on failure keeps the preview and returns Error for the root status channel)
 * if the document changes mid-pause) and `pruneIfStale()` (drops the FSM
 * to idle when the source node no longer exists).
 *
 * **Locally-redeclared `EditorCameraPreview` types** mirror the god-file's
 * exports at lines 76-89. Slice 6 collapses them into a single `$lib/types/museum.ts`
 * declaration — until then, structural typing keeps the two in sync.
 */

import {
	createCameraMotion,
	cameraMotionProgressAtEdgeProgress,
	type Vector3Like
} from '$lib/museum/navigation/camera-motion';
import {
	getCameraConnectionRoute,
	getCameraRoute,
	type ResolvedCameraRoute
} from '$lib/museum/navigation/camera-route';
import {
	cameraTimelineProgressAtEdgeProgress,
	createEditorCameraTimeline,
	type EditorCameraTimeline
} from '../editor-camera-timeline';
import {
	createNavigationGraph,
	getNode,
	type NavigationGraph
} from '$lib/content/scene';

import type { CameraConnectionDirection, Vec3 } from '$lib/types/museum';
// `CameraConnectionDirection` is needed here for the `startConnection` method
// parameter; mode + transport literals come from the barrel instead.

import type { EditorDocumentStore } from './document-store.svelte';
import type {
	CameraPreviewConnection,
	CameraPreviewNode,
	CameraPreviewTour,
	CameraPreviewTransition,
	EditorCameraPreview,
	EditorCameraPreviewMode,
	EditorCameraPreviewTransport
} from '../museum-editor.types';

function cloneRoutePoint(point: Vector3Like): Vec3 {
	if (Array.isArray(point)) {
		return [point[0], point[1], point[2]];
	}
	const obj = point as Readonly<{ x: number; y: number; z: number }>;
	return [obj.x, obj.y, obj.z];
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
}// =====================================================================
// Locally-redeclared preview types (mirror god-file lines 76-89).
// Slice 3 debt 3.11 collapses them into the `museum-editor.types.ts` barrel
// (lands in this slice). The four `kind`-tagged variant interfaces are
// imported here so the discriminated union is composable from one source.
// =====================================================================

// Re-export from the barrel so any internal caller (tests, mocks) that still
// imports `CameraPreviewNode` from the controller keeps compiling.
export type { CameraPreviewNode, CameraPreviewTransition, CameraPreviewConnection, CameraPreviewTour };

export class EditorCameraPreviewController {
	/** The active preview, or null when FSM is idle. */
	preview = $state<EditorCameraPreview | null>(null);

	/** Camera follows the playhead (smoothing/lerp) when true. */
	followEnabled = $state(true);

	/**
	 * Monotonic counter consumers `void`-read so a Svelte 5 `$derived`
	 * re-runs when the playhead was recentered during a transition.
	 * Same pattern as `EditorSceneRoots.version`.
	 */
	recenterVersion = $state(0);

	/** Deep-cloned route snapshot, keyed by `runId`. */
	#capturedRoute: { runId: number; route: ResolvedCameraRoute } | null = null;

	/** Strictly-increasing run id allocator. */
	#nextRunId = 1;

	/** Cached on first read; keyed by `document.state.graph` identity (god-file parity). */
	#timelineCache: EditorCameraTimeline | null = null;
	#timelineGraph: NavigationGraph | null = null;

	/**
	 * Lazy, key-cached navigation graph. Invalidate when the document
	 * changes (the `addAfterReplaceListener` registered at the
	 * composition root will call `invalidateGraph()`).
	 */
	#graphCache: ReturnType<typeof createNavigationGraph> | null = null;
	#graphCacheKey = '';

	constructor(private readonly document: EditorDocumentStore) {}

	// ============================================================
	// Peer-link surface (audit §3.A.2)
	// ============================================================

	/**
	 * Peer-link read by `EditorHistoryController.canUndo`. When `playing`,
	 * undo is blocked (audit §3.A.2 / F6).
	 */
	get transportState(): EditorCameraPreviewTransport | null {
		return this.preview?.transport ?? null;
	}

	// ============================================================
	// FSM entry points — one per `kind`
	// ============================================================

	/** `previewSelectedNode`-style entry — start a preview for one named nav node. */
	startNode(nodeId: string, mode: EditorCameraPreviewMode): boolean {
		if (this.preview) return false;
		if (!nodeId) return false;
		if (!this.#nodeExists(nodeId)) return false;
		const runId = this.#nextRunId++;
		this.#capturedRoute = null;
		this.followEnabled = true;
		this.recenterVersion += 1;
		this.preview = {
			kind: 'node',
			nodeId,
			mode,
			transport: 'paused',
			runId,
			playhead: 0,
			startedAtMs: null
		};
		return true;
	}

	/** Transition preview: from one node to its declared `nextNodeId`. */
	startTransition(fromNodeId: string, mode: EditorCameraPreviewMode): boolean {
		if (this.preview) return false;
		const graph = this.#graph();
		const fromNode = getNode(fromNodeId, graph);
		if (!fromNode || !fromNode.nextNodeId) return false;
		return this.#startTransitionInternal(
			fromNodeId,
			fromNode.nextNodeId,
			mode === 'director' ? 'paused' : 'playing',
			mode
		);
	}

	#startTransitionInternal(
		fromNodeId: string,
		toNodeId: string,
		transport: EditorCameraPreviewTransport,
		mode: EditorCameraPreviewMode
	): boolean {
		const graph = this.#graph();
		let route: ResolvedCameraRoute;
		try {
			route = getCameraRoute(fromNodeId, toNodeId, graph);
		} catch {
			return false;
		}
		const runId = this.#nextRunId++;
		this.#capturedRoute = { runId, route: cloneResolvedCameraRoute(route) };
		this.followEnabled = true;
		this.recenterVersion += 1;
		this.preview = {
			kind: 'transition',
			fromNodeId,
			toNodeId,
			mode,
			transport,
			runId,
			playhead: 0,
			startedAtMs: null
		};
		return true;
	}

	/** Connection preview: from one connection edge in the named direction. */
	startConnection(
		connectionId: string,
		direction: CameraConnectionDirection,
		mode: EditorCameraPreviewMode
	): boolean {
		if (this.preview) return false;
		const graph = this.#graph();
		let route: ResolvedCameraRoute;
		try {
			route = getCameraConnectionRoute(connectionId, direction, graph);
		} catch {
			return false;
		}
		const fromNodeId = direction === 'forward' ? route.nodeIds[0]! : route.nodeIds.at(-1)!;
		const toNodeId = direction === 'forward' ? route.nodeIds.at(-1)! : route.nodeIds[0]!;
		const runId = this.#nextRunId++;
		this.#capturedRoute = { runId, route: cloneResolvedCameraRoute(route) };
		this.followEnabled = true;
		this.recenterVersion += 1;
		this.preview = {
			kind: 'connection',
			connectionId,
			direction,
			fromNodeId,
			toNodeId,
			mode,
			transport: mode === 'director' ? 'paused' : 'playing',
			runId,
			playhead: 0,
			startedAtMs: null
		};
		return true;
	}

	/** Guided-tour preview (uses exact camera-timeline motions). */
	startTour(mode: EditorCameraPreviewMode): boolean {
		const timeline = this.#readCameraTimeline();
		if (!timeline) return false;
		const runId = this.#nextRunId++;
		this.#capturedRoute = null;
		this.followEnabled = true;
		this.recenterVersion += 1;
		this.preview = {
			kind: 'tour',
			startNodeId: timeline.startNodeId,
			mode,
			transport: 'playing',
			runId,
			playhead: 0,
			startedAtMs: null
		};
		return true;
	}

	// ============================================================
	// FSM transitions
	// ============================================================

	play(): boolean {
		const preview = this.preview;
		if (!preview || preview.kind === 'node' || preview.transport === 'playing') return false;
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind === 'tour') {
			if (!this.#readCameraTimeline()) return false;
		} else {
			try {
				route = preview.mode === 'director'
					? this.#resolveRoute(preview)
					: this.getCapturedRoute(preview.runId);
				if (!route) throw new Error('Camera preview route capture is unavailable');
			} catch {
				return false;
			}
		}
		const runId = this.#nextRunId++;
		this.#capturedRoute = route ? { runId, route: cloneResolvedCameraRoute(route) } : null;
		const playhead = preview.transport === 'complete' ? 0 : preview.playhead;
		this.preview = {
			...preview,
			transport: 'playing',
			runId,
			playhead,
			startedAtMs: null
		};
		return true;
	}

	pause(): boolean {
		const preview = this.preview;
		if (!preview || preview.transport !== 'playing') return false;
		this.preview = {
			...preview,
			transport: 'paused',
			startedAtMs: null
		};
		return true;
	}

	setPlayhead(progress: number, runId = this.preview?.runId): boolean {
		const preview = this.preview;
		if (
			!preview ||
			preview.kind === 'node' ||
			preview.runId !== runId ||
			!Number.isFinite(progress)
		) {
			return false;
		}
		const playhead = Math.min(1, Math.max(0, progress));
		if (Math.abs(preview.playhead - playhead) <= 1e-6 && preview.transport !== 'complete') {
			return false;
		}
		this.preview = {
			...preview,
			playhead,
			...(preview.transport === 'complete'
				? { transport: 'paused' as const, startedAtMs: null }
				: {})
		};
		return true;
	}

	step(direction: -1 | 1): boolean {
		const preview = this.preview;
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
			const route = this.getCapturedRoute(preview.runId);
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
		return this.setPlayhead(next);
	}

	toggleFollow(): boolean {
		if (!this.preview || this.preview.mode !== 'director') return false;
		this.followEnabled = !this.followEnabled;
		return true;
	}

	recenter(): boolean {
		if (!this.preview || this.preview.mode !== 'director') return false;
		this.recenterVersion += 1;
		return true;
	}

	markStarted(runId: number, startedAtMs: number): boolean {
		const preview = this.preview;
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
		this.preview = { ...preview, startedAtMs };
		return true;
	}

	complete(runId: number): boolean {
		const preview = this.preview;
		if (
			!preview ||
			preview.kind === 'node' ||
			preview.runId !== runId ||
			preview.transport !== 'playing' ||
			preview.startedAtMs === null
		) {
			return false;
		}
		this.preview = {
			...preview,
			transport: 'complete',
			playhead: 1,
			startedAtMs: null
		};
		return true;
	}

	setMode(mode: EditorCameraPreviewMode): boolean {
		const preview = this.preview;
		if (!preview || preview.mode === mode) return false;
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind !== 'node' && preview.kind !== 'tour') {
			try {
				route = this.#resolveRoute(preview);
			} catch {
				return false;
			}
		}
		const runId = this.#nextRunId++;
		this.#capturedRoute = route ? { runId, route: cloneResolvedCameraRoute(route) } : null;
		// Invalidate the timeline cache defensively: a future tour-mode flip
		// would otherwise serve a stale cached timeline.
		this.#timelineCache = null;
		this.#timelineGraph = null;
		this.preview = {
			...preview,
			mode,
			transport: mode === 'director' ? 'paused' : preview.transport,
			runId,
			startedAtMs: null
		};
		return true;
	}

	/** Stop the FSM. The composition root owns any drag-restore dance. */
	stop(): boolean {
		if (!this.preview) return false;
		this.preview = null;
		this.#capturedRoute = null;
		this.followEnabled = true;
		return true;
	}

	/** Deep clone of the captured route for the matching `runId`. */
	getCapturedRoute(runId: number): ResolvedCameraRoute | null {
		const capture = this.#capturedRoute;
		return capture?.runId === runId ? cloneResolvedCameraRoute(capture.route) : null;
	}

	/**
	 * Slice 3.5 transitional — composition-root timeline scrub / view-keyframe
	 * helpers still allocate run ids and capture routes until Slice 3.7 moves
	 * those entry points onto this controller.
	 */
	allocRunId(): number {
		return this.#nextRunId++;
	}

	clearCapturedRoute(): void {
		this.#capturedRoute = null;
	}

	setCapturedRoute(runId: number, route: ResolvedCameraRoute): void {
		this.#capturedRoute = { runId, route: cloneResolvedCameraRoute(route) };
	}

	// ============================================================
	// `afterReplace` listeners (composition root wires these to
	// `EditorDocumentStore.addAfterReplaceListener(...)`)
	// ============================================================

	/**
	 * `afterReplace` listener — called by `EditorDocumentStore` whenever
	 * the document is swapped. Re-resolves the captured route (or nulls
	 * the preview) when topology changed under a paused director preview.
	 */
	/**
	 * Re-resolve a paused Director preview after a document swap.
	 * Pre-slice semantics: on route failure **keep** the preview and return
	 * the error so the composition root can `setStatusMessage`. Do not clear.
	 */
	refreshPausedDirector(): Error | null {
		this.invalidateGraph();
		const preview = this.preview;
		if (!preview || preview.mode !== 'director' || preview.transport !== 'paused') return null;
		const runId = this.#nextRunId++;
		if (preview.kind === 'node') {
			this.#capturedRoute = null;
			this.preview = { ...preview, runId };
			return null;
		}
		if (preview.kind === 'tour') {
			this.#capturedRoute = null;
			this.#timelineCache = null;
			this.#timelineGraph = null;
			if (this.#readCameraTimeline()) this.preview = { ...preview, runId };
			return null;
		}
		try {
			const route = this.#resolveRoute(preview);
			this.#capturedRoute = { runId, route: cloneResolvedCameraRoute(route) };
			this.preview = { ...preview, runId };
			return null;
		} catch (error) {
			return error instanceof Error
				? error
				: new Error('Camera preview route is unavailable');
		}
	}

	/**
	 * `afterReplace` listener — drops the FSM to idle if the active
	 * preview was pointing at a node or connection that no longer exists.
	 */
	pruneIfStale(): void {
		this.invalidateGraph();
		const preview = this.preview;
		if (!preview) return;
		if (preview.kind === 'node' && !this.#nodeExists(preview.nodeId)) {
			this.preview = null;
			this.#capturedRoute = null;
			return;
		}
		if (preview.kind === 'tour') {
			// Drop if the timeline can't be built from the new document.
			this.#timelineCache = null;
			this.#timelineGraph = null;
			if (!this.#readCameraTimeline()) {
				this.preview = null;
				this.#capturedRoute = null;
			}
		}
	}

	/**
	 * If the given node/connection ids intersect with the active preview,
	 * drop the FSM to idle. Called by the composition root when a topology
	 * mutation affects a preview's source/destination.
	 */
	releaseIfTouches(nodeIds: string[], connectionIds: string[]): boolean {
		const preview = this.preview;
		if (!preview) return false;
		const hit =
			(preview.kind === 'node' && nodeIds.includes(preview.nodeId)) ||
			(preview.kind === 'transition' &&
				(nodeIds.includes(preview.fromNodeId) || nodeIds.includes(preview.toNodeId))) ||
			(preview.kind === 'connection' &&
				(connectionIds.includes(preview.connectionId) ||
					nodeIds.includes(preview.fromNodeId) ||
					nodeIds.includes(preview.toNodeId)));
		if (!hit) return false;
		this.preview = null;
		this.#capturedRoute = null;
		return true;
	}

	// ============================================================
	// Internal helpers
	// ============================================================

	#resolveRoute(preview: Exclude<EditorCameraPreview, null>): ResolvedCameraRoute {
		if (preview.kind === 'node') throw new Error('A node preview has no camera route');
		const graph = this.#graph();
		if (preview.kind === 'connection') {
			return getCameraConnectionRoute(preview.connectionId, preview.direction, graph);
		}
		if (preview.kind === 'tour') {
			throw new Error('Camera flow preview uses exact camera timeline motions');
		}
		return getCameraRoute(preview.fromNodeId, preview.toNodeId, graph);
	}

	#nodeExists(nodeId: string): boolean {
		return this.document.scene.navigationNodes.some((node) => node.id === nodeId);
	}

	/**
	 * Lazy, key-cached navigation graph. Invalidate when the document
	 * changes (the `addAfterReplaceListener` registered at the
	 * composition root will call `invalidateGraph()`).
	 */
	#graph() {
		const key = `${this.document.document.navigationNodes.length}/${this.document.document.connections.length}`;
		if (this.#graphCache && this.#graphCacheKey === key) return this.#graphCache;
		this.#graphCache = createNavigationGraph(this.document.scene);
		this.#graphCacheKey = key;
		return this.#graphCache;
	}

	invalidateGraph(): void {
		this.#graphCache = null;
		this.#graphCacheKey = '';
		this.#timelineCache = null;
		this.#timelineGraph = null;
	}

	/**
	 * Build / cache the guided-tour timeline from the live resolved graph.
	 * Composition root `getCameraTimeline()` delegates here (Slice 3.7).
	 */
	getTimeline(): EditorCameraTimeline | null {
		const graph = this.document.state.graph;
		if (this.#timelineGraph === graph) return this.#timelineCache;
		this.#timelineGraph = graph;
		try {
			this.#timelineCache = createEditorCameraTimeline(graph);
		} catch {
			this.#timelineCache = null;
		}
		return this.#timelineCache;
	}

	#readCameraTimeline(): EditorCameraTimeline | null {
		return this.getTimeline();
	}
}
