import { describe, expect, expectTypeOf, it } from 'vitest';

import { EditorViewState } from '$lib/editor/h1/editor-view-state.svelte';
import type { Editor3dContext } from '$lib/editor/h1/editor-view-state.svelte';
import type { EditorViewMode } from '$lib/editor/h1/editor-view-mode';

describe('H1 S1 — EditorViewState', () => {
	it('defaults to the 3D view with the scene context', () => {
		const state = new EditorViewState();
		expect(state.viewMode).toBe('3d');
		expect(state.active3dContext).toBe('scene');
	});

	it('setViewMode switches plan/3d and no-ops on the same value', () => {
		const state = new EditorViewState();
		expect(state.setViewMode('3d')).toBe(false);
		expect(state.setViewMode('plan')).toBe(true);
		expect(state.viewMode).toBe('plan');
		expect(state.setViewMode('plan')).toBe(false);
	});

	it('set3dContext switches scene/camera and no-ops on the same value', () => {
		const state = new EditorViewState();
		expect(state.set3dContext('scene')).toBe(false);
		expect(state.set3dContext('camera')).toBe(true);
		expect(state.active3dContext).toBe('camera');
		expect(state.set3dContext('camera')).toBe(false);
	});

	it('remembers the 3D context across a Plan round-trip', () => {
		const state = new EditorViewState();
		state.set3dContext('camera');
		state.setViewMode('plan');
		expect(state.active3dContext).toBe('camera');
		state.setViewMode('3d');
		expect(state.active3dContext).toBe('camera');
	});

	it('pins the type shapes', () => {
		expectTypeOf<EditorViewMode>().toEqualTypeOf<'plan' | '3d'>();
		expectTypeOf<Editor3dContext>().toEqualTypeOf<'scene' | 'camera'>();
	});
});
