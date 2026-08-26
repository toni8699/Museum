import { describe, expect, it } from 'vitest';
import { createFixtureEditorStore } from '../editor-test-utils';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { chopinRuntime } from '$lib/content/chopin-project';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { useCameraTimeline } from '$lib/editor/hooks/use-camera-timeline.svelte';

describe('P12 S1 — binary transport and derived session presentation', () => {
	it('completion is paused at normalized end, with no complete transport state', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewSequence('director')).toBe(true);
		const runId = store.cameraPreview!.runId;
		expect(store.markCameraPreviewStarted(runId, 100)).toBe(true);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.cameraPreview).toMatchObject({ transport: 'paused', playhead: 1 });
		expect(['paused', 'playing']).toContain(store.cameraPreview!.transport);
	});

	it('derives paused atEnd and seconds from normalized progress', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewSequence('director')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);
		const api = useCameraTimeline(store);
		const duration = api.durationSeconds;
		expect(duration).toBeGreaterThan(0);
		expect(api.atEnd).toBe(false);
		expect(store.setCameraPreviewPlayhead(0.25)).toBe(true);
		expect(api.currentSeconds).toBeCloseTo(duration * 0.25, 8);
		expect(store.setCameraPreviewPlayhead(1)).toBe(true);
		expect(api.atEnd).toBe(true);
		expect(api.playLabel).toBe('Play');
	});

	it('preserves playing during Rig-style per-frame writes and still completes', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		const runId = store.cameraPreview!.runId;
		expect(store.markCameraPreviewStarted(runId, 100)).toBe(true);
		const startedAtMs = store.cameraPreview!.startedAtMs;
		expect(store.setCameraPreviewPlayhead(0.5, runId)).toBe(true);
		expect(store.cameraPreview).toMatchObject({ transport: 'playing', playhead: 0.5, startedAtMs });
		// The Rig completes this transient playing-at-end state in production.
		expect(store.setCameraPreviewPlayhead(1, runId)).toBe(true);
		expect(store.cameraPreview).toMatchObject({ transport: 'playing', playhead: 1, startedAtMs });
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.cameraPreview).toMatchObject({ transport: 'paused', playhead: 1 });
	});

	it('idle Sequence shell derives duration and canPlay from the global timeline', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const api = useCameraTimeline(store);
		const timeline = store.getCameraTimeline();
		expect(timeline).not.toBeNull();
		expect(api.durationSeconds).toBe(timeline!.durationSeconds);
		expect(api.canPlay).toBe(true);
	});

	it('Play at end resets normalized progress and allocates a new playing run', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewSequence('director')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.setCameraPreviewPlayhead(1)).toBe(true);
		const oldRunId = store.cameraPreview!.runId;
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview).toMatchObject({ transport: 'playing', playhead: 0 });
		expect(store.cameraPreview!.runId).not.toBe(oldRunId);
	});

	it('repeat is false outside Edge scope and cannot leak across scope changes', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewEdge('tour-a-b', 'forward')).toBe(true);
		expect(store.setEdgePreviewRepeat(true)).toBe(true);
		expect(store.edgeRepeat).toBe(true);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.edgeRepeat).toBe(false);
	});

	it('zero-duration Edge scope has no playable transport and is not at end', () => {
		const doc = cloneFixtureDocument();
		const connection = doc.connections.find((candidate) => candidate.id === 'tour-a-b')!;
		connection.timing = { ...(connection.timing ?? {}), forward: { durationSeconds: 0.000000001 } } as any;
		const store = createEditorStore({ document: doc, rooms: chopinRuntime.rooms });
		store.setWorkspace('camera');
		expect(store.previewEdge(connection.id, 'forward')).toBe(true);
		const api = useCameraTimeline(store);
		expect(api.durationSeconds).toBeLessThanOrEqual(1e-9);
		expect(api.canPlay).toBe(false);
		expect(api.atEnd).toBe(false);
		expect(api.playLabel).toBe('Play');
	});

	it('live retiming keeps normalized playhead and re-derives seconds', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewEdge('tour-a-b', 'forward')).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.4)).toBe(true);
		const before = useCameraTimeline(store).durationSeconds;
		const connection = store.document.connections.find((candidate) => candidate.id === 'tour-a-b')!;
		const timing = connection.timing?.forward ?? { durationSeconds: before };
		store.setConnectionTiming(connection.id, 'forward', {
			...(timing ?? {}),
			durationSeconds: before * 2
		});
		const api = useCameraTimeline(store);
		expect(store.cameraPreview!.playhead).toBeGreaterThanOrEqual(0);
		expect(store.cameraPreview!.playhead).toBeLessThanOrEqual(1);
		expect(api.currentSeconds).toBeLessThanOrEqual(api.durationSeconds);
		expect(api.atEnd).toBe(false);
	});

	it('static Camera scope has no temporal playhead or duration', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewCamera('tour-a', 'director')).toBe(true);
		const api = useCameraTimeline(store);
		expect(api.durationSeconds).toBe(0);
		expect(api.currentSeconds).toBe(0);
		expect(api.atEnd).toBe(false);
		expect(api.canPlay).toBe(false);
	});
});
