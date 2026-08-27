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
		expect(live).toContain('Camera timeline controls');
		expect(live).toContain('Jump to start');
		expect(live).toContain('Play camera flow');
		expect(live).toContain('class="timecode"');
		expect(live).toContain('class="more-tools"');
		expect(live).toContain('class="toggle s4-toggle"');
		expect(live).not.toContain('tour-selector');
		expect(live).not.toContain('EditorCameraPreviewControls');

		expect(frame).toContain('height: 36px;');
		expect(frame).toContain('height: 12px;');
		expect(frame).toContain('height: 24px;');
		expect(frame).toContain('class="mini-scrubber-row"');
		expect(frame).toContain('@media (max-width: 44rem)');
	});

	it('keeps expanded scope-local actions in the ruler and gates View Key to live 3D Sequence', () => {
		const panel = readLibSource('editor/camera/EditorCameraTimelinePanel.svelte');
		const ruler = readLibSource('editor/camera/EditorCameraTimelineRuler.svelte');
		const liveRuler = ruler.slice(ruler.indexOf('{:else if scope === \'edge\''));

		expect(panel).toContain('<EditorCameraTimelineRuler {store} {viewMode} />');
		expect(panel).toContain('{#if store.isRelic && preview}');
		expect(panel).toContain('<EditorCameraPreviewControls {store} />');
		expect(ruler).toContain('viewMode === \'3d\'');
		expect(ruler).toContain('scope === \'sequence\'');
		expect(liveRuler).toContain('+ View Key');
		expect(liveRuler).not.toContain('+ Camera Key');
		expect(liveRuler).not.toContain('toggleTourPlayback');
		expect(ruler).toContain('+ Camera Key');
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
	});

	it('does not apply live header controls to the relic store surface', () => {
		const store = createRelicFixtureEditorStore();
		expect(store.isRelic).toBe(true);
		expect(store.enterSequenceScope('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'paused' });
	});
});
