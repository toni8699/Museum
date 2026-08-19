import { describe, expect, expectTypeOf, it } from 'vitest';

import { EditorViewState } from '$lib/editor/app/editor-view-state.svelte';
import type { EditorDomain } from '$lib/editor/app/editor-view-state.svelte';
import type { EditorViewMode } from '$lib/editor/app/editor-view-mode';

describe('EditorViewState', () => {
	it('defaults to the Scene domain, Scene → Plan, Camera → 3D', () => {
		const state = new EditorViewState();
		expect(state.domain).toBe('scene');
		expect(state.sceneView).toBe('plan');
		expect(state.cameraView).toBe('3d');
		expect(state.activeView).toBe('plan');
	});

	it('setDomain switches scene/camera and no-ops on the same value', () => {
		const state = new EditorViewState();
		expect(state.setDomain('scene')).toBe(false);
		expect(state.setDomain('camera')).toBe(true);
		expect(state.domain).toBe('camera');
		expect(state.setDomain('camera')).toBe(false);
		expect(state.setDomain('scene')).toBe(true);
		expect(state.domain).toBe('scene');
	});

	it('setView switches plan/3d per domain and no-ops on the same value', () => {
		const state = new EditorViewState();
		expect(state.setView('scene', 'plan')).toBe(false);
		expect(state.setView('scene', '3d')).toBe(true);
		expect(state.sceneView).toBe('3d');
		expect(state.setView('scene', '3d')).toBe(false);
		expect(state.setView('scene', 'plan')).toBe(true);
		expect(state.setView('camera', '3d')).toBe(false);
		expect(state.setView('camera', 'plan')).toBe(true);
		expect(state.cameraView).toBe('plan');
		expect(state.setView('camera', 'plan')).toBe(false);
	});

	it('keeps per-domain view memory — each domain view survives the other domain round-trip', () => {
		const state = new EditorViewState();
		// Scene view moves to 3D; Camera view stays 3D.
		state.setView('scene', '3d');
		expect(state.activeView).toBe('3d');

		// Switch to Camera and move its view to Plan.
		state.setDomain('camera');
		expect(state.activeView).toBe('3d'); // cameraView default 3d
		state.setView('camera', 'plan');
		expect(state.activeView).toBe('plan');

		// Back to Scene: the Scene 3D view is remembered.
		state.setDomain('scene');
		expect(state.activeView).toBe('3d');

		// Camera round-trip restores its Plan view, not Scene's.
		state.setDomain('camera');
		expect(state.activeView).toBe('plan');
		state.setView('camera', '3d');
		expect(state.activeView).toBe('3d');
		state.setDomain('scene');
		expect(state.activeView).toBe('3d'); // Scene still 3D
	});

	it('pins the type shapes', () => {
		expectTypeOf<EditorViewMode>().toEqualTypeOf<'plan' | '3d'>();
		expectTypeOf<EditorDomain>().toEqualTypeOf<'scene' | 'camera'>();
	});
});
