import { describe, expect, it } from 'vitest';
import { EditorMutationGuards, type EditorMutationGuardsHost } from '$lib/editor/store/mutation-guards.svelte';
import type { EditorCameraPreview } from '$lib/editor/museum-editor.types';

function host(partial: Partial<EditorMutationGuardsHost> = {}): EditorMutationGuardsHost {
	return {
		cameraPreview: null,
		transformInteractionActive: false,
		directPathInteractionActive: false,
		directFramingInteractionActive: false,
		viewKeyframeProgressDrag: null,
		historyDocumentUndoBlocked: false,
		...partial
	};
}

function preview(
	overrides: Partial<Extract<EditorCameraPreview, { kind: 'camera' }>> = {}
): EditorCameraPreview {
	return {
		kind: 'camera',
		nodeId: 'n1',
		mode: 'director',
		transport: 'playing',
		runId: 1,
		playhead: 0,
		startedAtMs: null,
		...overrides
	};
}

describe('EditorMutationGuards', () => {
	it('blocks document mutation for visitor or non-paused preview', () => {
		expect(new EditorMutationGuards(host()).isDocumentMutationBlocked).toBe(false);
		expect(
			new EditorMutationGuards(
				host({ cameraPreview: preview({ mode: 'visitor', transport: 'paused' }) })
			).isDocumentMutationBlocked
		).toBe(true);
		expect(
			new EditorMutationGuards(host({ cameraPreview: preview() })).isDocumentMutationBlocked
		).toBe(true);
	});

	it('blocks framing mutation whenever transport is not paused', () => {
		expect(
			new EditorMutationGuards(host({ cameraPreview: preview() })).isCameraFramingMutationBlocked
		).toBe(true);
		expect(
			new EditorMutationGuards(
				host({ cameraPreview: preview({ transport: 'paused' }) })
			).isCameraFramingMutationBlocked
		).toBe(false);
	});

	it('treats any interaction flag or progress drag as active', () => {
		expect(new EditorMutationGuards(host()).isEditorInteractionActive).toBe(false);
		expect(
			new EditorMutationGuards(host({ transformInteractionActive: true }))
				.isEditorInteractionActive
		).toBe(true);
		expect(
			new EditorMutationGuards(
				host({
					viewKeyframeProgressDrag: {
						connectionId: 'c',
						direction: 'forward',
						keyframeId: 'k'
					}
				})
			).isEditorInteractionActive
		).toBe(true);
	});

	it('blocks undo for interaction, open history tx, or non-paused preview', () => {
		expect(new EditorMutationGuards(host()).isDocumentUndoBlocked).toBe(false);
		expect(
			new EditorMutationGuards(host({ historyDocumentUndoBlocked: true })).isDocumentUndoBlocked
		).toBe(true);
		expect(
			new EditorMutationGuards(host({ cameraPreview: preview() })).isDocumentUndoBlocked
		).toBe(true);
	});
});
