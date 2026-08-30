import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chopinRuntime } from '$lib/content/chopin-project';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { useCameraTimeline } from '$lib/editor/hooks/use-camera-timeline.svelte';
import {
	cameraMotionProgressAtEdgeProgress,
	createCameraMotionSample,
	sampleCameraMotion
} from '@portfolio/camera-core';
import {
	createFixtureEditorStore,
	createRelicFixtureEditorStore
} from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';

const LIB_DIR = fileURLToPath(new URL('../../../../src/lib', import.meta.url));

function readLibSource(relativePath: string): string {
	return readFileSync(`${LIB_DIR}/${relativePath}`, 'utf8');
}

function unsequencedDocument() {
	const document = cloneFixtureDocument();
	for (const node of document.navigationNodes) {
		delete (node as { nextNodeId?: string }).nextNodeId;
		delete (node as { previousNodeId?: string }).previousNodeId;
	}
	return document;
}

function documentWithUnsequencedCamera() {
	const document = cloneFixtureDocument();
	const template = document.navigationNodes[0]!;
	document.navigationNodes.push({
		...template,
		id: 'free-camera',
		label: 'Free Camera',
		connectedNodeIds: [],
		nextNodeId: undefined,
		previousNodeId: undefined
	});
	return document;
}

describe('P12.3 one-shell Edge lanes', () => {
	it('uses the shared panel and an Edge-local, inert five-lane projection', () => {
		const panel = readLibSource('editor/camera/EditorCameraTimelinePanel.svelte');
		const dots = readLibSource('editor/camera/EditorCameraTimelineDots.svelte');
		const frame = readLibSource('editor/camera/EditorCameraTimelineFrame.svelte');

		expect(panel).toContain('edgeTimeline && !store.isRelic');
		expect(panel).toContain('edgeTimeline={edgeTimeline}');
		expect(dots).toContain('{#if edgeTimeline}');
		expect(dots).toContain('cameraMotionProgressAtEdgeProgress');
		expect(dots).toContain('No independent shot data');
		expect(dots).toContain('class="edge edge-local"');

		const edgeBranch = dots.slice(dots.indexOf('{#if edgeTimeline}'), dots.indexOf('{:else if timeline}'));
		expect(edgeBranch).not.toMatch(/on(?:click|pointer|contextmenu)=/);
		expect(edgeBranch).not.toContain('cameraTimelineProgressAtEdgeProgress');
		expect(edgeBranch).not.toContain('cameraTimelineEdgeProgressAtProgress');

		expect(frame).toContain('let pillMenuOpen = $state(false)');
		expect(frame).toContain('role="menu"');
		expect(frame).toContain('role="menuitem"');
		expect(frame).toContain('getCameraEdgePreviewChoices');
		expect(frame).toContain('store.enterSequenceScope()');
		expect(frame).not.toContain('contextMenu.open');
		expect(frame).not.toContain('store.menu');
		expect(frame).not.toContain('EditorCameraEdgePreviewActions');
	});

	it('maps authored Edge view keys through motion easing into Edge-local time', () => {
		const document = cloneFixtureDocument();
		document.connections.find((connection) => connection.id === 'tour-a-b')!.viewTracks = {
			forward: [
				{
					id: 'edge-view-key',
					progress: 0.42,
					cameraTarget: [0, 1, 0],
					fov: 49
				}
			],
			reverse: []
		};
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);

		const edge = useCameraTimeline(store).edgeTimeline!;
		const key = edge.motion.positionEdgeSpans[0]!.viewTrack!.keyframes.find(
			(candidate) => candidate.id === 'edge-view-key'
		)!;
		const timeProgress = cameraMotionProgressAtEdgeProgress(edge.motion, 0, key.progress);

		expect(timeProgress).toBeGreaterThanOrEqual(0);
		expect(timeProgress).toBeLessThanOrEqual(1);
		expect(Number.isFinite(timeProgress * edge.durationSeconds)).toBe(true);
	});

	it('keeps a valid Edge timeline when global Sequence has no flow', () => {
		const store = createEditorStore({
			document: unsequencedDocument(),
			rooms: chopinRuntime.rooms
		});
		expect(store.getCameraTimeline()).toBeNull();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(useCameraTimeline(store).edgeTimeline).not.toBeNull();
	});
});

describe('P12.3 Flip semantics', () => {
	it('resets non-relic Edge playhead while preserving repeat and discovery', () => {
		const store = createFixtureEditorStore();
		expect(store.previewEdge('tour-a-b', 'forward', 'visitor')).toBe(true);
		expect(store.setEdgePreviewRepeat(true)).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.7)).toBe(true);
		const runId = store.cameraPreview!.runId;

		expect(store.swapEdgePreviewDirection()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			direction: 'reverse',
			mode: 'visitor',
			transport: 'paused',
			playhead: 0
		});
		expect(store.cameraPreview!.runId).not.toBe(runId);
		expect(store.edgeRepeat).toBe(true);
		expect(store.activeCameraDirection).toBe('reverse');
	});

	it('keeps relic physical-pose preservation on Flip at every active playhead', () => {
		for (const playhead of [0, 0.25, 0.5, 0.75, 1]) {
			const store = createRelicFixtureEditorStore();
			expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
			expect(store.setEdgePreviewRepeat(true)).toBe(true);
			if (playhead > 0) expect(store.setCameraPreviewPlayhead(playhead)).toBe(true);

			const before = store.cameraPreview!;
			const beforeTimeline = useCameraTimeline(store).edgeTimeline!;
			const beforeSample = createCameraMotionSample();
			sampleCameraMotion(beforeTimeline.motion, before.playhead, beforeSample);

			expect(store.swapEdgePreviewDirection()).toBe(true);

			const after = store.cameraPreview!;
			const afterTimeline = useCameraTimeline(store).edgeTimeline!;
			const afterSample = createCameraMotionSample();
			sampleCameraMotion(afterTimeline.motion, after.playhead, afterSample);
			expect(afterSample.position.distanceTo(beforeSample.position)).toBeLessThan(1e-5);
			expect(after).toMatchObject({ kind: 'edge', direction: 'reverse' });
			expect(after.runId).not.toBe(before.runId);
			expect(store.edgeRepeat).toBe(true);
		}
	});
});

describe('P12.3 explicit Sequence scope entry', () => {
	it('enters paused Sequence, preserves mode/selection, and clears Edge Repeat', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('visitor')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.25)).toBe(true);
		expect(store.previewEdge('tour-a-b', 'forward', 'visitor')).toBe(true);
		const selection = store.navigationSelection;
		expect(store.setEdgePreviewRepeat(true)).toBe(true);

		expect(store.enterSequenceScope()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			mode: 'visitor',
			transport: 'paused',
			playhead: 0.25
		});
		expect(store.navigationSelection).toEqual(selection);
		expect(store.edgeRepeat).toBe(false);
	});

	it('defaults idle entry to paused director at zero', () => {
		const store = createFixtureEditorStore();
		expect(store.enterSequenceScope()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			mode: 'director',
			transport: 'paused',
			playhead: 0
		});
	});

	it('refreshes Sequence position when leaving through Camera after an Edge round-trip', () => {
		const store = createEditorStore({
			document: documentWithUnsequencedCamera(),
			rooms: chopinRuntime.rooms
		});
		expect(store.previewSequence('visitor')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.seekSequencePreview(0.25)).toBe(true);
		expect(store.previewEdge('tour-a-b', 'forward', 'visitor')).toBe(true);
		expect(store.enterSequenceScope()).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', playhead: 0.25 });
		expect(store.seekSequencePreview(0.7)).toBe(true);

		expect(store.previewCamera('free-camera', 'visitor')).toBe(true);
		expect(store.lastSequencePlayhead).toBe(0.7);
		expect(store.enterSequenceScope()).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', playhead: 0.7 });
	});

	it('fails atomically when Sequence has no timeline', () => {
		const store = createEditorStore({
			document: unsequencedDocument(),
			rooms: chopinRuntime.rooms
		});
		expect(store.previewEdge('tour-a-b', 'forward', 'visitor')).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.4)).toBe(true);
		expect(store.setEdgePreviewRepeat(true)).toBe(true);
		const before = store.cameraPreview;

		expect(store.enterSequenceScope()).toBe(false);
		expect(store.cameraPreview).toEqual(before);
		expect(store.edgeRepeat).toBe(true);
	});
});
