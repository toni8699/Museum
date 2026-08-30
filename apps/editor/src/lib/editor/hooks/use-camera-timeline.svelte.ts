/**
 * Slice 8 — timeline transport / playhead hook for camera timeline UI.
 * S3 — exposes edge-local timeline (one connection) for Preview Edge.
 * P11.3 — scope-first projection: presentation resolves from canonical
 * selection + preview scope before timeline existence, and the hook exposes
 * one `{ timeline, diagnostic }` boundary (§9/§10).
 */

import {
	createEdgeLocalTimeline,
	createEditorCameraTimelineResolution,
	type EdgeLocalTimeline,
	type EditorCameraTimeline,
	type EditorCameraTimelineNodeBoundary
} from '../camera/editor-camera-timeline';
import { CameraRouteError } from '@portfolio/camera-core';
import { previewScopeOf } from '../store/camera-preview-controller.svelte';
import { formatCameraNodeLabel } from '../editor-outliner';
import type { EditorStore } from '../editor-store.svelte';
import type { PreviewScope } from '../editor-types';

export type CameraTimelineScope = PreviewScope | 'idle';

/**
 * P11.3 §9 — one component-facing diagnostic. Derived, never stored: no
 * controller state, suppression semantics, or lifecycle resets. `gap` /
 * `no-flow` come from the typed `CameraRouteError` at the global-timeline
 * build; `invalid-target` derives from canonical selection (selected
 * Edge/Camera with no installed scope and a failed identity resolution).
 * Unexpected defects never land here — the boundary reports them through the
 * existing status channel instead (no double-reporting the same failure).
 */
export type CameraTimelineDiagnostic =
	| { kind: 'ok' }
	| { kind: 'gap'; fromNodeId: string; toNodeId: string }
	| { kind: 'no-flow' }
	| { kind: 'invalid-target' };

export type CameraTimelineResult = {
	timeline: EditorCameraTimeline | EdgeLocalTimeline | null;
	diagnostic: CameraTimelineDiagnostic;
	lastEvaluableBoundary: EditorCameraTimelineNodeBoundary | null;
};

export function useCameraTimeline(store: EditorStore) {
	/**
	 * P11.3 §9 — strict edge resolution for the diagnostic path. Consumes the
	 * identity-null contract directly (null only for missing identity); a
	 * defect rethrows to the `timelineResult` catch → status channel.
	 */
	function edgeTimelineStrict(): EdgeLocalTimeline | null {
		const preview = store.cameraPreview;
		if (preview?.kind !== 'edge') return null;
		const route = store.getCapturedCameraPreviewRoute(preview.runId);
		return createEdgeLocalTimeline(
			store.state.graph,
			preview.connectionId,
			preview.direction,
			route ? { route } : undefined
		);
	}

	/**
	 * P11.3 §9 — global timeline for the boundary. The cached builder swallows
	 * failures, so the null path rebuilds here to surface the typed
	 * `CameraRouteError` (gap / no-flow).
	 */
	function globalTimelineResolution() {
		return createEditorCameraTimelineResolution(store.state.graph);
	}

	/**
	 * P11.3 §9 — derived invalid-target marker. Canonical selection points at
	 * an Edge/Camera with no installed scope for it and a failed identity
	 * resolution (connection record or endpoint node missing from the live
	 * document — the same canonical identity source used by selection actions.
	 * Clears naturally on selection change or a successful scope install.
	 */
	function invalidTarget(): CameraTimelineDiagnostic | null {
		const selection = store.navigationSelection;
		const preview = store.cameraPreview;
		if (selection?.kind === 'connection') {
			if (preview?.kind === 'edge' && preview.connectionId === selection.connectionId) {
				return null;
			}
			const connection = store.document.connections.find(
				(candidate) => candidate.id === selection.connectionId
			);
			if (
				!connection ||
				!store.document.navigationNodes.some((node) => node.id === connection.fromNodeId) ||
				!store.document.navigationNodes.some((node) => node.id === connection.toNodeId)
			) {
				return { kind: 'invalid-target' };
			}
			return null;
		}
		if (selection?.kind === 'node') {
			if (preview?.kind === 'camera' && preview.nodeId === selection.nodeId) return null;
			if (!store.document.navigationNodes.some((node) => node.id === selection.nodeId)) {
				return { kind: 'invalid-target' };
			}
			return null;
		}
		return null;
	}

	return {
		get timeline() {
			return store.getCameraTimeline();
		},
		get playhead() {
			return store.cameraTimelinePlayhead;
		},
		get preview() {
			return store.cameraPreview;
		},
		get previewScope() {
			return previewScopeOf(store.cameraPreview);
		},
		/** P11.3 — the scope-first presentation key (camera/edge/sequence/idle). */
		get scope(): CameraTimelineScope {
			return previewScopeOf(store.cameraPreview) ?? 'idle';
		},
		get sequenceActive() {
			return store.cameraPreview?.kind === 'sequence';
		},
		/**
		 * P11.3 — one `{ timeline, diagnostic }` boundary (§9). Scope-first
		 * pinned resolution order: Camera static → Edge local (even when the
		 * global Sequence cannot build) → Sequence/idle global. CameraRouteError
		 * maps to gap/no-flow; unexpected defects go to the status channel.
		 */
		get timelineResult(): CameraTimelineResult {
			const preview = store.cameraPreview;
			try {
				if (preview?.kind === 'camera') {
					return {
						timeline: null,
						diagnostic: invalidTarget() ?? { kind: 'ok' },
						lastEvaluableBoundary: null
					};
				}
				if (preview?.kind === 'edge') {
					const edge = edgeTimelineStrict();
					if (edge === null) {
						return {
							timeline: null,
							diagnostic: { kind: 'invalid-target' },
							lastEvaluableBoundary: null
						};
					}
					return {
						timeline: edge,
						diagnostic: invalidTarget() ?? { kind: 'ok' },
						lastEvaluableBoundary: null
					};
				}
				// Sequence scope / idle — the retained-scope failed-install case
				// still shows the Sequence presentation plus the marker.
				const resolution = globalTimelineResolution();
				return {
					timeline: resolution.timeline,
					diagnostic: invalidTarget() ?? resolution.diagnostic,
					lastEvaluableBoundary: resolution.lastEvaluableBoundary
				};
			} catch (error) {
				if (error instanceof CameraRouteError) {
					return {
						timeline: null,
						diagnostic:
							error.kind === 'no-flow'
								? { kind: 'no-flow' }
								: { kind: 'gap', fromNodeId: error.fromNodeId!, toNodeId: error.toNodeId! },
						lastEvaluableBoundary: null
					};
				}
				// Genuine defect → the existing status channel, never a panel
				// marker (single-report boundary, §9).
				store.setStatusMessage(
					error instanceof Error ? error.message : 'The camera timeline is unavailable'
				);
				return { timeline: null, diagnostic: { kind: 'ok' }, lastEvaluableBoundary: null };
			}
		},
		/**
		 * P11.3 §4 — one compact active-scope capsule. Replaces the Frame
		 * header `preview-badge` and the duplicate preview-controls `<p>`; on a
		 * failed invalid-target install it truthfully names the retained scope
		 * while the inline diagnostic names the invalid selection.
		 */
		get scopeCapsule(): string | null {
			const preview = store.cameraPreview;
			if (!preview) return store.isRelic ? null : 'Sequence';
			if (preview.kind === 'sequence') return 'Sequence';
			if (preview.kind === 'camera') {
				const node = store.document.navigationNodes.find(
					(candidate) => candidate.id === preview.nodeId
				);
				return `Camera · ${formatCameraNodeLabel(node?.label, preview.nodeId)} · Static`;
			}
			const fromNode = store.document.navigationNodes.find(
				(candidate) => candidate.id === preview.fromNodeId
			);
			const toNode = store.document.navigationNodes.find(
				(candidate) => candidate.id === preview.toNodeId
			);
			return `Edge · ${formatCameraNodeLabel(fromNode?.label, preview.fromNodeId)} → ${formatCameraNodeLabel(toNode?.label, preview.toNodeId)}`;
		},
		// S3 — edge-local timeline (memo key: graph + id+dir + preview.runId)
		get edgeTimeline() {
			try {
				const graph = store.state.graph;
				const preview = store.cameraPreview;
				// Active Preview Edge takes precedence over selection (previewScope === 'edge').
				// Use captured route keyed by runId — not route identity which thrashes.
				if (preview?.kind === 'edge') {
					const route = store.getCapturedCameraPreviewRoute(preview.runId);
					if (route) return createEdgeLocalTimeline(graph, preview.connectionId, preview.direction, { route });
					return createEdgeLocalTimeline(graph, preview.connectionId, preview.direction);
				}
				const connectionId = store.activeCameraConnectionId;
				if (!connectionId) return null;
				const direction = store.activeCameraDirection;
				return createEdgeLocalTimeline(graph, connectionId, direction);
			} catch {
				// P11.3 §9 — render path guard: a defect must not throw during
				// render; the diagnostic path reports it via the status channel.
				return null;
			}
		},
		get edgePlayhead() {
			const preview = store.cameraPreview;
			return preview?.kind === 'edge' ? preview.playhead : 0;
		},
		get edgeDurationSeconds() {
			return this.edgeTimeline?.durationSeconds ?? 0;
		},
		/** P12 S1 — presentation seconds are derived from normalized progress. */
		get durationSeconds() {
			if (store.cameraPreview?.kind === 'edge') return this.edgeDurationSeconds;
			if (store.cameraPreview?.kind === 'camera') return 0;
			return this.timeline?.durationSeconds ?? 0;
		},
		get currentSeconds() {
			const preview = store.cameraPreview;
			return preview && preview.kind !== 'camera' ? preview.playhead * this.durationSeconds : 0;
		},
		get atEnd() {
			const duration = this.durationSeconds;
			const preview = store.cameraPreview;
			return Boolean(preview && preview.kind !== 'camera' && duration > 1e-9 && preview.playhead >= 1);
		},
		get canPlay() {
			return store.cameraPreview?.kind !== 'camera' && this.durationSeconds > 1e-9;
		},
		get edgeEndpoints() {
			const tl = this.edgeTimeline;
			if (!tl) return null;
			const fromNode = store.document.navigationNodes.find((n) => n.id === tl.fromNodeId);
			const toNode = store.document.navigationNodes.find((n) => n.id === tl.toNodeId);
			return {
				fromNodeId: tl.fromNodeId,
				toNodeId: tl.toNodeId,
				fromLabel: fromNode?.label ?? tl.fromNodeId,
				toLabel: toNode?.label ?? tl.toNodeId
			};
		},
		get edgeRepeat() {
			return store.edgeRepeat;
		},
		get edgeScrubDisabled() {
			const tl = this.edgeTimeline;
			if (!tl) return true;
			if (tl.durationSeconds <= 1e-9) return true;
			if (store.isEditorInteractionActive || store.isDocumentTransactionActive) return true;
			const preview = store.cameraPreview;
			if (!preview || preview.kind !== 'edge') return true;
			if (store.isRelic && preview.transport === 'playing') return true;
			return false;
		},
		get edgeReverseDisabled() {
			const tl = this.edgeTimeline;
			if (!tl) return true;
			if (store.isEditorInteractionActive || store.isDocumentTransactionActive) return true;
			const preview = store.cameraPreview;
			// S3 D3 — reverse enabled only for paused edge preview; idle candidate disabled.
			if (!preview || preview.kind !== 'edge') return true;
			return preview.transport !== 'paused';
		},
		get edgeRepeatDisabled() {
			// Repeat toggle visible but disabled unless active edge preview.
			if (store.isEditorInteractionActive || store.isDocumentTransactionActive) return true;
			const preview = store.cameraPreview;
			if (!preview || preview.kind !== 'edge') return true;
			return false;
		},
		get selectionDisabled() {
			return (
				!this.timeline ||
				store.isEditorInteractionActive ||
				store.isDocumentTransactionActive
			);
		},
		get framingDisabled() {
			return this.selectionDisabled || store.isCameraFramingMutationBlocked;
		},
		get scrubDisabled() {
			const preview = store.cameraPreview;
			return (
				!this.sequenceActive ||
				!this.timeline ||
				this.timeline.durationSeconds <= 1e-9 ||
				store.isEditorInteractionActive ||
				store.isDocumentTransactionActive ||
				(store.isRelic && preview?.transport === 'playing')
			);
		},
		get previewPlaying() {
			return store.cameraPreview?.transport === 'playing';
		},
		get tourTransportDisabled() {
			// P11.3 §2 — Camera scope is static: the transport is explicitly
			// disabled there (the Ruler is never mounted in that branch today,
			// but the inert guard belongs on the hook, not the caller).
			return (
				store.isEditorInteractionActive ||
				store.isDocumentTransactionActive ||
				store.cameraPreview?.kind === 'camera'
			);
		},
		get canAddViewKeyframeAtPlayhead() {
			return store.canAddViewKeyframeAtPlayhead;
		},
		get reverseEdgeActive() {
			return store.activeCameraDirection === 'reverse' && Boolean(store.activeCameraConnectionId);
		},
		get reverseEdgeDisabled() {
			return (
				!store.activeCameraConnectionId ||
				store.isEditorInteractionActive ||
				store.isDocumentTransactionActive
			);
		},
		get reverseEdgeLabel() {
			const connectionId = store.activeCameraConnectionId;
			const connection = connectionId
				? store.document.connections.find((candidate) => candidate.id === connectionId)
				: undefined;
			if (!connection) return 'Reverse edge travel';
			const from =
				store.document.navigationNodes.find((node) => node.id === connection.toNodeId)
					?.label ?? connection.toNodeId;
			const to =
				store.document.navigationNodes.find((node) => node.id === connection.fromNodeId)
					?.label ?? connection.fromNodeId;
			return `Reverse · ${from} → ${to}`;
		},
		get playLabel() {
			const preview = store.cameraPreview;
			if (preview?.kind === 'edge' || preview?.kind === 'sequence') {
				return preview.transport === 'playing' ? 'Pause' : 'Play';
			}
			return 'Play camera flow';
		},
		seek(progress: number) {
			store.seekCameraTimeline(progress);
		},
		seekEdge(progress: number) {
			store.seekEdgePreview(progress);
		},
		step(direction: -1 | 1) {
			store.stepCameraTimeline(direction);
		},
		stepNodeBoundary(direction: -1 | 1) {
			store.stepCameraNodeBoundary(direction);
		},
		toggleTourPlayback() {
			const preview = store.cameraPreview;
			// P11.3 §2 — Camera scope is static: its transport is inert and ▶
			// never starts the Sequence (supersedes the P3B.5 camera-hold
			// fallback).
			if (preview?.kind === 'camera') return;
			// P3B.5 grammar — Play/Pause controls the current preview scope.
			// `playCameraPreview` resumes paused and replays complete scopes.
			if (preview?.kind === 'edge' || preview?.kind === 'sequence') {
				if (!this.canPlay) return;
				if (preview.transport === 'playing') {
					store.pauseCameraPreview();
					return;
				}
				store.playCameraPreview();
				return;
			}
			// Idle: explicit default sequence transport.
			store.previewSequence('director');
		},
		/** P11.4 §11.3 — sequence-side travel-direction toggle (stays). */
		toggleReverse() {
			store.toggleCameraEdgeReverse();
		},
		/**
		 * P11.4 §11.3 — Edge-scope Reverse is the paused-edge direction SWAP
		 * (fresh opposite route, physical pose preserved via the edge-domain
		 * 1 − e flip); not interchangeable with `toggleReverse`.
		 */
		swapEdgeReverse() {
			store.swapEdgePreviewDirection();
		},
		addViewKeyframeAtPlayhead() {
			store.addViewKeyframeAtPlayhead();
		}
	};
}
