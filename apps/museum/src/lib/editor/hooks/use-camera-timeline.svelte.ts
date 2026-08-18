/**
 * Slice 8 — timeline transport / playhead hook for camera timeline UI.
 */

import type { MuseumEditorStore } from '../museum-editor.svelte';

export function useCameraTimeline(store: MuseumEditorStore) {
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
			if (store.activeCameraDirection === 'reverse' && store.activeCameraConnectionId) {
				return 'Play reverse edge';
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
			if (store.cameraPreview?.transport === 'playing') {
				store.pauseCameraPreview();
				return;
			}
			if (store.activeCameraDirection === 'reverse' && store.activeCameraConnectionId) {
				store.playActiveConnectionEdge();
				return;
			}
			store.previewGuidedTour('director');
		},
		toggleReverse() {
			store.toggleCameraEdgeReverse();
		},
		addViewKeyframeAtPlayhead() {
			store.addViewKeyframeAtPlayhead();
		}
	};
}
