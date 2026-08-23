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
			if (store.cameraPreview?.transport === 'playing') return 'Pause';
			// S4 D2 — sequence play is sequence-transport only; reverse-edge
			// transport lives in the S3 EdgeRuler (toggleEdgePlayback).
			return 'Play camera flow';
		},
		seek(progress: number) {
			store.seekCameraTimeline(progress);
		},
		step(direction: -1 | 1) {
			store.stepCameraTimeline(direction);
		},
		toggleTourPlayback() {
			if (store.cameraPreview?.transport === 'playing') {
				store.pauseCameraPreview();
				return;
			}
			// S4 D2 — no context hijack to reverse-edge transport; the S3
			// EdgeRuler owns edge playback. Explicit Preview Sequence entry.
			store.previewSequence('director');
		},
		toggleReverse() {
			store.toggleCameraEdgeReverse();
		},
		addViewKeyframeAtPlayhead() {
			store.addViewKeyframeAtPlayhead();
		},
		// S3 — edge ruler actions
		seekEdge(progress: number) {
			store.setCameraPreviewPlayhead(progress);
		},
		toggleEdgeReverse() {
			store.swapEdgePreviewDirection();
		},
		setEdgeRepeat(value: boolean) {
			store.setEdgePreviewRepeat(value);
		},
		previewActiveEdge() {
			const id = store.activeCameraConnectionId;
			if (!id) return false;
			return store.previewEdge(id, store.activeCameraDirection, 'director');
		},
		stepEdge(direction: -1 | 1) {
			store.stepCameraPreview(direction);
		},
		toggleEdgePlayback() {
			const preview = store.cameraPreview;
			if (preview?.kind === 'edge' && preview.transport === 'playing') {
				store.pauseCameraPreview();
				return;
			}
			if (preview?.kind === 'edge' && preview.transport === 'paused') {
				store.playCameraPreview();
				return;
			}
			// idle candidate — install paused edge first, then playing on next click
			this.previewActiveEdge();
		}
	};
}
