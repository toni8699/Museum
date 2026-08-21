import { describe, expect, expectTypeOf, it } from 'vitest';

import { EditorViewState } from '$lib/editor/app/editor-view-state.svelte';
import type { EditorDomain } from '$lib/editor/app/editor-view-state.svelte';
import type { EditorViewMode } from '$lib/editor/app/editor-view-mode';

describe('EditorViewState', () => {
	it('defaults to the Scene domain in the shared Plan view', () => {
		const state = new EditorViewState();
		expect(state.domain).toBe('scene');
		expect(state.view).toBe('plan');
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

	it('setView switches plan/3d and no-ops on the same value', () => {
		const state = new EditorViewState();
		expect(state.setView('scene', 'plan')).toBe(false);
		expect(state.setView('scene', '3d')).toBe(true);
		expect(state.view).toBe('3d');
		expect(state.setView('camera', '3d')).toBe(false);
		expect(state.setView('camera', 'plan')).toBe(true);
		expect(state.view).toBe('plan');
		expect(state.setView('camera', 'plan')).toBe(false);
	});

	it('keeps one shared view across domains — a domain switch never changes the view (P1.7 owner follow-up)', () => {
		const state = new EditorViewState();
		// Boot: Scene → Plan. Switching to Camera stays in Plan.
		expect(state.activeView).toBe('plan');
		state.setDomain('camera');
		expect(state.activeView).toBe('plan');

		// Moving Camera to 3D then returning to Scene stays 3D — no snap back.
		state.setView('camera', '3d');
		expect(state.activeView).toBe('3d');
		state.setDomain('scene');
		expect(state.activeView).toBe('3d');

		// And the shared view keeps following explicit switches from either
		// domain control.
		state.setView('scene', 'plan');
		expect(state.activeView).toBe('plan');
		state.setDomain('camera');
		expect(state.activeView).toBe('plan');
	});

	it('pins the type shapes', () => {
		expectTypeOf<EditorViewMode>().toEqualTypeOf<'plan' | '3d'>();
		expectTypeOf<EditorDomain>().toEqualTypeOf<'scene' | 'camera'>();
	});
});
