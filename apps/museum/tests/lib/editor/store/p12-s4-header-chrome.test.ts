import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFixtureEditorStore, createRelicFixtureEditorStore } from '../editor-test-utils';

const LIB_DIR = fileURLToPath(new URL('../../../../src/lib', import.meta.url));

function readLibSource(relativePath: string): string {
	return readFileSync(LIB_DIR + '/' + relativePath, 'utf8');
}

describe('P12.4 S4 — live header chrome', () => {
	it('moves live transport into the fixed header and keeps the relic header frozen', () => {
		const frame = readLibSource('editor/camera/EditorCameraTimelineFrame.svelte');
		const liveStart = frame.indexOf('<header class="s4-header"');
		const live = frame.slice(liveStart, frame.indexOf('</section>', liveStart));

		expect(frame).toContain('<header class="relic-header">');
		expect(frame).toContain('class="tour-selector"');
		expect(live).toContain('<header class="s4-header">');
		expect(live).toContain('Previous camera node');
		expect(live).toContain('Next camera node');
		expect(live).toContain('Play camera flow');
		expect(live).toContain('timelineApi.playLabel');
		expect(live).toContain('aria-label="POV"');
		expect(live).toContain('aria-label="Observer"');
		expect(live).toContain('aria-label="Recenter camera"');
		expect(live).toContain('aria-label="Follow camera"');
		expect(live).toContain('class="timecode"');
		expect(live).toContain('class="more-tools"');
		expect(live).toContain('class="toggle s4-toggle"');
		expect(frame).toContain("return 'Sequence (Full Tour)'");
		expect(frame).toContain('`${endpoints.fromLabel} → ${endpoints.toLabel}`');
		expect(live).not.toContain('tour-selector');
		expect(live).not.toContain('EditorCameraPreviewControls');

		expect(frame).toContain('height: 36px;');
		expect(frame).toContain('height: 48px;');
		expect(frame).toContain('height: 1.8rem;');
		expect(frame).toContain('class="mini-player"');
		expect(frame).toContain('mini-player__scrubber');
		expect(live).toMatch(/\{#if scope !== 'camera'\}[\s\S]*class="header-icon edge-flip"/);
		expect(live).toMatch(/\{#if scope !== 'camera'\}[\s\S]*class="header-transport"/);
		expect(live).not.toContain('Repeat edge');
		expect(live).not.toContain('Replay');
		expect(frame).toContain('@media (max-width: 44rem)');
	});

	it('keeps the old ruler relic-only and moves live scrubbing plus View Key into Dots', () => {
		const frame = readLibSource('editor/camera/EditorCameraTimelineFrame.svelte');
		const panel = readLibSource('editor/camera/EditorCameraTimelinePanel.svelte');
		const ruler = readLibSource('editor/camera/EditorCameraTimelineRuler.svelte');
		const dots = readLibSource('editor/camera/EditorCameraTimelineDots.svelte');

		expect(panel).toContain('<EditorCameraTimelineRuler {store} {viewMode} />');
		expect(panel).toContain('{#if store.isRelic}');
		expect(panel).toContain('<EditorCameraPreviewControls {store} />');
		expect(dots).toContain("!store.isRelic && viewMode === '3d'");
		expect(dots).toContain('+ View Key');
		expect(ruler).toContain('+ Camera Key');
		expect(ruler).toContain('type="range"');
		expect(dots).toContain('class="timeline-playhead-overlay"');
		expect(dots).toContain('.timeline-playhead-overlay { position: absolute;');
		expect(dots).not.toContain('grid-column: 2; grid-row: 1 / -1');
		expect(dots).toContain('class="playhead-head"');
		expect(dots).toContain('role="slider"');
		expect(dots).toContain('aria-label="Sequence timeline playhead"');
		expect(dots).toContain("event.key === 'Home'");
		expect(dots).toContain("event.key === 'End'");
		expect(dots).toContain('[data-timeline-interactive]');
		expect(dots).toContain('timeTicksForDuration(timeline.durationSeconds)');
		expect(dots).toContain('durationSeconds / targetIntervals / 0.25');
		expect(dots).toContain('index * stepSeconds');
		expect(dots).not.toContain("replace(/\\.00$/, '')");
		expect(dots).not.toContain('.time-tick:nth-last-child(2)');
		expect(dots).toContain('@container (min-width: 52rem)');
		expect(dots).toContain('.shot-block.selected { border-color: var(--editor-accent);');
		expect(frame).toContain('.header-transport .header-icon.active,');
	});
});

describe('P12.4 S4 — idle mode and transport lifecycle', () => {
	it('lets idle POV install paused visitor Sequence and preserves scope/playhead on mode change', () => {
		const store = createFixtureEditorStore();

		expect(store.enterSequenceScope('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			mode: 'visitor',
			transport: 'paused',
			playhead: 0
		});
		expect(store.setCameraPreviewPlayhead(0.35)).toBe(true);

		expect(store.setCameraPreviewMode('director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			mode: 'director',
			transport: 'paused',
			playhead: 0.35
		});

		expect(store.stepCameraNodeBoundary(1)).toBe(true);
		expect(store.cameraPreview?.transport).toBe('paused');
	});

	it('does not apply live header controls to the relic store surface', () => {
		const store = createRelicFixtureEditorStore();
		expect(store.isRelic).toBe(true);
		expect(store.enterSequenceScope('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'paused' });
	});

	it('keeps Camera preview session alive when the 3D rig unmounts for Camera Plan', () => {
		const rig = readLibSource('editor/camera/EditorCameraRig.svelte');
		expect(rig).toContain("store.isRelic || store.currentWorkspace !== 'camera'");
		expect(rig).toContain('store.stopCameraPreview()');
	});
});
