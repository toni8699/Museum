/**
 * `EditorCameraPreviewController` — owns the camera preview FSM.
 *
 * Slice 3 of the editor-facade refactor plan lifts `cameraPreview`,
 * `cameraPreviewFollowEnabled`, `cameraPreviewRecenterVersion`,
 * `#capturedCameraPreviewRoute`, `#nextCameraPreviewRunId`, and the full	 * `play/pause/stop/setPlayhead/step/start…` method zoo (plus the
	 * timeline-scrub helpers per audit §3.7) out of
 * `editor-store.svelte.ts`.
 *
 * **Peer-link surface.** `HistoryController.canUndo` reads `transportState`
 * here. Exposing the FSM through a single read-only getter is the entire
 * coupling; nothing else crosses the boundary.
 *
 * **Document coupling.** Takes the document store in the constructor and
 * reads `document.state.graph` for route resolution. The composition root
 * registers two `afterReplace` listeners on the document store: this	 * controller's `refreshPausedDirector()` (hard-resets a paused Director SEQUENCE preview or re-resolves/keeps the others;
 * returns Error for the root status channel if the document changes mid-pause)
 * and `pruneIfStale()` (drops the FSM
 * to idle when the source node no longer exists).
 *
 * **Locally-redeclared `EditorCameraPreview` types** mirror the
 * `editor-types.ts` barrel; structural typing keeps the two in sync.
 */

import {
	cameraMotionEdgeProgressAtProgress,
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion,
	type Vector3Like
} from '$lib/museum/navigation/camera-motion';
import {
	getCameraConnectionRoute,
	getCameraRoute,
	type ResolvedCameraRoute
} from '$lib/museum/navigation/camera-route';
import {
	cameraTimelineProgressAtEdgeProgress,
	createEditorCameraTimelineResolution,
	getEditorCameraTimelineLocation,
	type EditorCameraTimeline
} from '../camera/editor-camera-timeline';
import { resolveDirectedEdgeMotionByDirection } from '../camera/editor-directed-edge-motion';
import {
	createNavigationGraph,
	getNode,
	type NavigationGraph
} from '$lib/content/scene';

import type { CameraConnectionDirection, Vec3 } from '$lib/types/scene';
// `CameraConnectionDirection` is needed here for the `startConnection` method
// parameter; mode + transport literals come from the barrel instead.

import type { EditorDocumentStore } from './document-store.svelte';
import type {
	CameraPreviewCamera,
	CameraPreviewEdge,
	CameraPreviewSequence,
	EditorCameraPreview,
	EditorCameraPreviewMode,
	EditorCameraPreviewTransport,
	PreviewScope
} from '../editor-types';

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
							},
							...(edge.viewTrack.framingEnvelope === undefined
								? {}
								: { framingEnvelope: { ...edge.viewTrack.framingEnvelope } })
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
// Locally-redeclared preview types (mirror the `editor-types.ts`
// barrel). The four `kind`-tagged variant interfaces are imported here so
// the discriminated union is composable from one source.
// =====================================================================

export type { CameraPreviewCamera, CameraPreviewEdge, CameraPreviewSequence };

/**
 * S6 — the discriminated kind rename made kinds equal scopes
 * (`camera`/`edge`/`sequence`), so this is now an identity mapping.
 */
export function previewScopeOf(preview: EditorCameraPreview): PreviewScope | null {
	if (!preview) return null;
	return preview.kind;
}

/**
 * S2 helper — shared staleness check for `preview` against the live document.
 * Extracted so facade `#pruneInvalidCameraPreview` can reuse the same
 * endpoint checks without duplication (D7).
 */
export function isPreviewStale(
	preview: EditorCameraPreview,
	document: EditorDocumentStore
): boolean {
	if (!preview) return false;
	const nodes = document.document.navigationNodes;
	const connections = document.document.connections;
	const hasNode = (id: string) => nodes.some((node) => node.id === id);
	const hasConnection = (id: string) => connections.some((c) => c.id === id);
	switch (preview.kind) {
		case 'camera':
			return !hasNode(preview.nodeId);
		case 'edge':
			return (
				!hasConnection(preview.connectionId) ||
				!hasNode(preview.fromNodeId) ||
				!hasNode(preview.toNodeId)
			);
		case 'sequence':
			return false;
		default:
			return false;
	}
}	export class EditorCameraPreviewController {
	/**
	 * P7.5 — owned in-memory last Sequence playhead (was facade `$state`).
	 * Session-only by design: never codec/history; preserved when leaving
	 * sequence scope and restored on return (S2/S4 transport contract).
	 */
	lastSequencePlayhead = $state<number | null>(null);
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

	/** S2 — edge-local repeat flag, scoped strictly to `kind === 'edge'`. */
	edgeRepeat = $state(false);

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
			kind: 'camera',
			nodeId,
			mode,
			transport: 'paused',
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
		this.edgeRepeat = false;
		this.preview = {
			kind: 'edge',
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

	/** Sequence preview (uses exact camera-timeline motions). */
	startTour(mode: EditorCameraPreviewMode): boolean {
		const timeline = this.#readCameraTimeline();
		if (!timeline) return false;
		const runId = this.#nextRunId++;
		this.#capturedRoute = null;
		this.followEnabled = true;
		this.recenterVersion += 1;
		this.preview = {
			kind: 'sequence',
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
		if (!preview || preview.kind === 'camera' || preview.transport === 'playing') return false;
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind === 'sequence') {
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
		const playhead = preview.playhead >= 1 ? 0 : preview.playhead;
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
			preview.kind === 'camera' ||
			preview.runId !== runId ||
			!Number.isFinite(progress)
		) {
			return false;
		}
		const playhead = Math.min(1, Math.max(0, progress));
		if (Math.abs(preview.playhead - playhead) <= 1e-6) {
			return false;
		}
		this.preview = {
			...preview,
			playhead,
			...(preview.transport === 'playing' ? {} : { transport: 'paused' as const, startedAtMs: null })
		};
		return true;
	}

	step(direction: -1 | 1): boolean {
		const preview = this.preview;
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
			// P8 S1 parity — edge previews step with authored timing/easing applied.
			const motion =
				preview.kind === 'edge'
					? resolveDirectedEdgeMotionByDirection(
							this.#graph(),
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
			preview.kind === 'camera' ||
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

	/** P12 S1 — completion is represented by paused + playhead 1; atEnd is derived. */
	complete(runId: number): boolean {
		const preview = this.preview;
		if (
			!preview ||
			preview.kind === 'camera' ||
			preview.runId !== runId ||
			preview.transport !== 'playing' ||
			preview.startedAtMs === null
		) {
			return false;
		}
		this.preview = {
			...preview,
			transport: 'paused',
			playhead: 1,
			startedAtMs: null
		};
		return true;
	}

	setMode(mode: EditorCameraPreviewMode): boolean {
		const preview = this.preview;
		if (!preview || preview.mode === mode) return false;
		let route: ResolvedCameraRoute | null = null;
		if (preview.kind !== 'camera' && preview.kind !== 'sequence') {
			try {
				route = this.#resolveRoute(preview);
			} catch {
				return false;
			}
		}
		const runId = this.#nextRunId++;
		this.#capturedRoute = route ? { runId, route: cloneResolvedCameraRoute(route) } : null;
		// Invalidate the timeline cache defensively: a future sequence-mode
		// flip would otherwise serve a stale cached timeline.
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
		this.edgeRepeat = false;
		return true;
	}

	/**
	 * S2 additive transport — return to scope start without tearing down preview.
	 * For `sequence`, caller also resets `cameraTimelinePlayhead` to 0; for
	 * `connection`, facade playhead is untouched.
	 * Keeps same runId — `EditorCameraRig` re-samples paused previews at `preview.playhead` every tick, so the camera moves to 0 without a new runId.
	 */
	resetToScopeStart(): boolean {
		const preview = this.preview;
		if (!preview || preview.kind === 'camera') return false;
		this.preview = {
			...preview,
			transport: 'paused',
			playhead: 0,
			startedAtMs: null
		};
		return true;
	}

	setEdgeRepeat(value: boolean): boolean {
		const preview = this.preview;
		if (!preview || preview.kind !== 'edge') return false;
		this.edgeRepeat = Boolean(value);
		return true;
	}

	/**
	 * S2 direction swap — only when `kind === 'edge' && paused`.
	 * Resolves a fresh opposite-direction route (never reuses captured snapshot),
	 * preserves physical camera location via edge-domain `1 - e` flip.
	 * Keeps `edgeRepeat`, updates discovery via caller (commands layer does setDiscovery).
	 * Returns new playhead or null on failure.
	 */
	swapEdgeDirection(): { playhead: number; runId: number } | null {
		const preview = this.preview;
		if (!preview || preview.kind !== 'edge' || preview.transport !== 'paused') return null;
		// Ensure director/visitor mode preserved
		const opposite: CameraConnectionDirection = preview.direction === 'forward' ? 'reverse' : 'forward';
		const graph = this.#graph();
		// Resolve fresh opposite route — never reuse captured snapshot geometry
		let oppositeRoute: ResolvedCameraRoute;
		try {
			oppositeRoute = getCameraConnectionRoute(preview.connectionId, opposite, graph);
		} catch {
			return null;
		}
		let oldMotion;
		let newMotion;
		try {
			oldMotion = resolveDirectedEdgeMotionByDirection(graph, preview.connectionId, preview.direction, {
				route: this.getCapturedRoute(preview.runId) ?? undefined
			}).motion;
			newMotion = resolveDirectedEdgeMotionByDirection(graph, preview.connectionId, opposite).motion;
		} catch {
			return null;
		}
		// Edge-domain flip: e = edgeProgress(old, playhead), e' = 1 - e, playhead' = progressAtEdge(new, e')
		let e: number;
		try {
			e = cameraMotionEdgeProgressAtProgress(oldMotion, 0, preview.playhead);
		} catch {
			return null;
		}
		const ePrime = 1 - e;
		let newPlayhead: number;
		try {
			newPlayhead = cameraMotionProgressAtEdgeProgress(newMotion, 0, ePrime);
		} catch {
			return null;
		}
		const fromNodeId = opposite === 'forward' ? oppositeRoute.nodeIds[0]! : oppositeRoute.nodeIds.at(-1)!;
		const toNodeId = opposite === 'forward' ? oppositeRoute.nodeIds.at(-1)! : oppositeRoute.nodeIds[0]!;
		const runId = this.#nextRunId++;
		this.#capturedRoute = { runId, route: cloneResolvedCameraRoute(oppositeRoute) };
		this.recenterVersion += 1;
		this.preview = {
			...preview,
			direction: opposite,
			fromNodeId,
			toNodeId,
			runId,
			playhead: Math.min(1, Math.max(0, newPlayhead)),
			startedAtMs: null
		};
		// keep edgeRepeat as-is
		return { playhead: this.preview.playhead, runId };
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
	 * `afterReplace` listener — **P8 S5 owner decision (2026-08-22): hard
	 * reset for paused Director SEQUENCE previews only.** A sequence is not
	 * an authoring surface, so any document swap stops it — no live re-
	 * resolution (re-resolving would silently re-map the pause point onto
	 * edited flow content and bump the runId — the stale-snapshot trap), and
	 * the returned error surfaces a status message telling the user to
	 * re-run Preview Sequence. Connection and node previews keep refreshing
	 * below: they ARE the framing-authoring surface (add/move view keys and
	 * edit framing while paused — pinned by `editor-store-camera` tests), so
	 * their re-resolution is the authoring feedback loop, not a drift bug.
	 * Visitor-mode previews are intentionally early-returned (immutable
	 * ownership — never re-resolved).
	 */
	refreshPausedDirector(): Error | null {
		this.invalidateGraph();
		const preview = this.preview;
		if (!preview || preview.mode !== 'director' || preview.transport !== 'paused') return null;
		if (preview.kind === 'sequence') {
			this.preview = null;
			this.#capturedRoute = null;
			this.edgeRepeat = false;
			return new Error(
				'Camera preview stopped — the document changed while paused; re-run Preview Sequence'
			);
		}
		const runId = this.#nextRunId++;
		if (preview.kind === 'camera') {
			this.#capturedRoute = null;
			this.preview = { ...preview, runId };
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
	 * preview was pointing at a node or connection that no longer exists,
	 * then validates `lastSequencePlayhead` against the rebuilt timeline
	 * (P7.5 — the facade `#pruneInvalidCameraPreview` lastSequence blocks
	 * folded here). The strict location check only applies when no preview
	 * is active; an active preview gets the lenient timeline-exists check,
	 * preserving the pre-fold semantics.
	 */
	pruneIfStale(): void {
		this.invalidateGraph();
		const preview = this.preview;
		if (preview && preview.kind === 'camera' && !this.#nodeExists(preview.nodeId)) {
			this.preview = null;
			this.#capturedRoute = null;
			this.edgeRepeat = false;
		} else if (preview && preview.kind === 'edge') {
			if (isPreviewStale(preview, this.document)) {
				this.preview = null;
				this.#capturedRoute = null;
				this.edgeRepeat = false;
			}
		} else if (preview && preview.kind === 'sequence') {
			// Drop if the timeline can't be built from the new document.
			this.#timelineCache = null;
			this.#timelineGraph = null;
			if (!this.#readCameraTimeline()) {
				this.preview = null;
				this.#capturedRoute = null;
			}
		}
		// S2 — validate lastSequencePlayhead even when no preview is active.
		if (this.lastSequencePlayhead !== null) {
			const timeline = this.getTimeline();
			if (!timeline) {
				this.lastSequencePlayhead = null;
			} else if (this.preview === null) {
				try {
					getEditorCameraTimelineLocation(timeline, this.lastSequencePlayhead);
				} catch {
					this.lastSequencePlayhead = null;
				}
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
			(preview.kind === 'camera' && nodeIds.includes(preview.nodeId)) ||
			(preview.kind === 'edge' &&
				(connectionIds.includes(preview.connectionId) ||
					nodeIds.includes(preview.fromNodeId) ||
					nodeIds.includes(preview.toNodeId)));
		if (!hit) return false;
		this.preview = null;
		this.#capturedRoute = null;
		this.edgeRepeat = false;
		return true;
	}

	// ============================================================
	// Internal helpers
	// ============================================================

	#resolveRoute(preview: Exclude<EditorCameraPreview, null>): ResolvedCameraRoute {
		if (preview.kind === 'camera') throw new Error('A camera preview has no camera route');
		const graph = this.#graph();
		if (preview.kind === 'sequence') {
			throw new Error('Camera flow preview uses exact camera timeline motions');
		}
		return getCameraConnectionRoute(preview.connectionId, preview.direction, graph);
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
			this.#timelineCache = createEditorCameraTimelineResolution(graph).timeline;
		} catch {
			this.#timelineCache = null;
		}
		return this.#timelineCache;
	}

	#readCameraTimeline(): EditorCameraTimeline | null {
		return this.getTimeline();
	}
}
