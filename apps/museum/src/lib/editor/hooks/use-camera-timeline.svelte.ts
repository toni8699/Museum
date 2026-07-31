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
			store.previewGuidedTour('director');
		},
		addViewKeyframeAtPlayhead() {
			store.addViewKeyframeAtPlayhead();
		}
	};
}
