/**
 * Slice 8 — timeline transport / playhead hook for camera timeline UI.
 * S3 — exposes edge-local timeline (one connection) for Preview Edge.
 */

import { createEdgeLocalTimeline } from '../camera/editor-camera-timeline';
import { previewScopeOf } from '../store/camera-preview-controller.svelte';
import type { EditorStore } from '../editor-store.svelte';

export function useCameraTimeline(store: EditorStore) {
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
		// S3 — edge-local timeline (memo key: graph + id+dir + preview.runId)
		get edgeTimeline() {
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
		},
		get edgePlayhead() {
			const preview = store.cameraPreview;
			return preview?.kind === 'edge' ? preview.playhead : 0;
		},
		get edgeDurationSeconds() {
			return this.edgeTimeline?.durationSeconds ?? 0;
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
			return preview.transport !== 'paused';
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
		get disabled() {
			return (
				store.isEditorInteractionActive ||
				store.isDocumentTransactionActive ||
				Boolean(
					store.cameraPreview &&
						(store.cameraPreview.mode !== 'director' ||
							store.cameraPreview.transport !== 'paused')
				)
			);
		},
		get scrubDisabled() {
			return (
				store.isEditorInteractionActive ||
				store.isDocumentTransactionActive ||
				Boolean(store.cameraPreview && store.cameraPreview.transport !== 'paused')
			);
		},
		get previewPlaying() {
			return store.cameraPreview?.transport === 'playing';
		},
		get tourTransportDisabled() {
			return store.isEditorInteractionActive || store.isDocumentTransactionActive;
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
			if (preview?.transport === 'playing') return 'Pause';
			// P3B.5 grammar — Play/Pause controls the current preview scope;
			// wording mirrors the preview transport button.
			if (preview?.kind === 'edge' || preview?.kind === 'sequence') {
				return preview.transport === 'complete' ? 'Replay preview' : 'Resume preview';
			}
			return 'Play camera flow';
		},
		seek(progress: number) {
			store.seekCameraTimeline(progress);
		},
		step(direction: -1 | 1) {
			store.stepCameraTimeline(direction);
		},
		toggleTourPlayback() {
			const preview = store.cameraPreview;
			// P3B.5 grammar — Play/Pause controls the current preview scope.
			// `playCameraPreview` resumes paused and replays complete scopes.
			if (preview?.kind === 'edge' || preview?.kind === 'sequence') {
				if (preview.transport === 'playing') {
					store.pauseCameraPreview();
					return;
				}
				store.playCameraPreview();
				return;
			}
			// Idle or camera-hold: explicit default sequence transport.
			store.previewSequence('director');
		},
		toggleReverse() {
			store.toggleCameraEdgeReverse();
		},
		addViewKeyframeAtPlayhead() {
			store.addViewKeyframeAtPlayhead();
		}
	};
}
