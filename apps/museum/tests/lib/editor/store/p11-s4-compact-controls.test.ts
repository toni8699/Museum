import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chopinRuntime } from '$lib/content/chopin-project';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { createFixtureEditorStore } from '../editor-test-utils';
import { useCameraTimeline } from '$lib/editor/hooks/use-camera-timeline.svelte';

const LIB_DIR = fileURLToPath(new URL('../../../../src/lib', import.meta.url));

function readLibSource(relativePath: string): string {
	return readFileSync(LIB_DIR + '/' + relativePath, 'utf8');
}

function createUnsequencedStore() {
	const document = cloneFixtureDocument();
	for (const node of document.navigationNodes) {
		delete (node as { nextNodeId?: string }).nextNodeId;
		delete (node as { previousNodeId?: string }).previousNodeId;
	}
	return createEditorStore({ document, rooms: chopinRuntime.rooms });
}

/**
 * P11.4 — compact controls and parity (slice verification gate, §12 +
 * §11.3 annex). Segmented Observer/Through; icon-only transport + Observer
 * tools with names/tooltips; Follow/Recenter Observer-only; Edge Reverse is
 * the paused-edge direction SWAP (main editor resets to 0; relic preserves
 * pose via the 1 − e flip); Repeat
 * is edge-only and never touches Sequence topology/duration; visible Stop is
 * gone from the timeline UI while `stopCameraPreview()` teardown stays
 * reachable via Escape/lifecycle only; the duplicate Preview Edge affordance
 * is removed from CameraFlowPanel + CameraPlanInspector.
 */

describe('P11.4 segmented mode + icon-only a11y (source contracts)', () => {
	const controls = readLibSource('editor/camera/EditorCameraPreviewControls.svelte');

	it('one accessible segmented Camera-mode control with aria-pressed segments', () => {
		expect(controls).toContain('role="group" aria-label="Camera mode"');
		expect(controls).toContain("aria-pressed={preview.mode === 'director'}");
		expect(controls).toContain("aria-pressed={preview.mode === 'visitor'}");
	});

	it('icon-only transport + Observer tools carry names and tooltips', () => {
		expect(controls).toContain('aria-label="Follow camera"');
		expect(controls).toContain('title="Follow camera"');
		expect(controls).toContain('aria-label="Recenter camera"');
		expect(controls).toContain('title="Recenter camera"');
		expect(controls).toContain('aria-label="Pause"');
		expect(controls).toContain('aria-label="Play"');
	});

	it('Follow/Recenter render only in Observer (director) mode — hidden in Through', () => {
		expect(controls).toContain("{#if preview.mode === 'director'}");
	});

	it('main-editor Ruler no longer owns Edge Reverse or Repeat controls; relic keeps them', () => {
		const ruler = readLibSource('editor/camera/EditorCameraTimelineRuler.svelte');
		const frame = readLibSource('editor/camera/EditorCameraTimelineFrame.svelte');
		const liveFrame = frame.slice(frame.indexOf('<header class="s4-header"'));
		expect(ruler).toContain('timelineApi.swapEdgeReverse()');
		expect(frame).not.toContain('aria-label="Repeat edge"');
		expect(liveFrame).not.toContain('Repeat edge');
		expect(liveFrame).not.toContain('>Reverse</button>');
	});

	it('dense single-row toolbar with a narrow wrap — no duplicate stacked controls', () => {
		expect(controls).toContain('grid-auto-flow: column;');
		expect(controls).toContain('@media (max-width: 44rem)');
		expect(controls).not.toContain('>Stop preview</button>');
	});
});

describe('P11.4 visible Stop removed from the timeline UI (§11.3)', () => {
	it('Stop is absent from PreviewControls, the Ruler, and the Panel', () => {
		const controls = readLibSource('editor/camera/EditorCameraPreviewControls.svelte');
		const ruler = readLibSource('editor/camera/EditorCameraTimelineRuler.svelte');
		const panel = readLibSource('editor/camera/EditorCameraTimelinePanel.svelte');
		for (const source of [controls, ruler, panel]) {
			expect(source).not.toContain('store.stopCameraPreview()');
			expect(source).not.toContain('Stop preview');
		}
	});

	it('internal stop teardown stays reachable through the store command', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('director')).toBe(true);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});
});

describe('P12.3 Edge Flip migration (§3)', () => {
	it('swaps direction and resets the non-relic Edge playhead to 0', () => {
		const store = createFixtureEditorStore();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'edge', direction: 'forward' });
		expect(store.setCameraPreviewPlayhead(0.3)).toBe(true);

		expect(store.swapEdgePreviewDirection()).toBe(true);

		expect(store.cameraPreview).toMatchObject({ kind: 'edge', direction: 'reverse' });
		expect(store.cameraPreview!.playhead).toBe(0);
	});

	it('refuses outside paused edge state (idle, camera, playing)', () => {
		const store = createFixtureEditorStore();
		expect(store.swapEdgePreviewDirection()).toBe(false); // idle

		const camera = createUnsequencedStore();
		expect(camera.previewCamera('tour-a', 'director')).toBe(true);
		expect(camera.swapEdgePreviewDirection()).toBe(false); // camera scope

		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.swapEdgePreviewDirection()).toBe(false); // playing
	});

	it('hook enable matrix: disabled unless paused edge with no active gesture', () => {
		const store = createFixtureEditorStore();
		const api = useCameraTimeline(store);
		expect(api.edgeReverseDisabled).toBe(true); // idle candidate

		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(api.edgeReverseDisabled).toBe(false); // paused edge

		expect(store.playCameraPreview()).toBe(true);
		expect(api.edgeReverseDisabled).toBe(true); // playing
		expect(store.pauseCameraPreview()).toBe(true);

		store.transformInteractionActive = true;
		expect(api.edgeReverseDisabled).toBe(true); // active gesture
		store.transformInteractionActive = false;
		expect(api.edgeReverseDisabled).toBe(false);
	});
});

describe('P11.4 Edge Repeat is edge-only and never touches Sequence state (§11.3)', () => {
	it('repeat flag flips only for an active edge preview', () => {
		const store = createFixtureEditorStore();
		// Sequence scope — the guarded setter refuses.
		expect(store.previewSequence('director')).toBe(true);
		store.edgeRepeat = true;
		expect(store.edgeRepeat).toBe(false);

		// Edge scope — the flag lands and is session-only.
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		store.edgeRepeat = true;
		expect(store.edgeRepeat).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'edge' });
	});

	it('repeat toggling never changes document topology, timing, or history', () => {
		const store = createFixtureEditorStore();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		const connectionCount = store.document.connections.length;
		const historyVersion = store.historyVersion;

		store.edgeRepeat = true;

		expect(store.document.connections.length).toBe(connectionCount);
		expect(store.historyVersion).toBe(historyVersion);
	});

	it('hook repeat getter tracks the store flag; disabled outside edge scope', () => {
		const store = createFixtureEditorStore();
		const api = useCameraTimeline(store);
		expect(api.edgeRepeatDisabled).toBe(true); // no edge preview

		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(api.edgeRepeatDisabled).toBe(false);
		store.edgeRepeat = true;
		expect(api.edgeRepeat).toBe(true);
	});
});

describe('P11.4 duplicate Preview Edge affordance disposition (§11.3)', () => {
	it('EditorCameraEdgePreviewActions stays only in the Editor Inspector', () => {
		expect(readLibSource('editor/camera/EditorCameraInspector.svelte')).toContain(
			'EditorCameraEdgePreviewActions'
		);
		expect(readLibSource('editor/CameraFlowPanel.svelte')).not.toContain(
			'EditorCameraEdgePreviewActions'
		);
		expect(readLibSource('editor/app/CameraPlanInspector.svelte')).not.toContain(
			'EditorCameraEdgePreviewActions'
		);
	});
});
