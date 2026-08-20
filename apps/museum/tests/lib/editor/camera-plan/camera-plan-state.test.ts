import { describe, expect, it } from 'vitest';
import {
	createCameraPlanState,
	setCameraPlanTool
} from '$lib/editor/camera-plan/camera-plan-state.svelte';

describe('createCameraPlanState', () => {
	it('boots into Select with an initialized pan/zoom viewport', () => {
		const state = createCameraPlanState();
		expect(state.tool).toBe('select');
		expect(state.planView.width).toBeGreaterThan(0);
		expect(state.planView.height).toBeGreaterThan(0);
		expect(state.planView.pixelsPerMeter).toBeGreaterThan(0);
		expect(state.planView.initialized).toBe(false);
		expect(state.planView.gridEnabled).toBe(true);
		expect(state.planView.snapEnabled).toBe(true);
		expect(state.hover).toBeNull();
	});
});

describe('setCameraPlanTool', () => {
	it('switches between Select and View and reports change', () => {
		const state = createCameraPlanState();
		expect(setCameraPlanTool(state, 'view')).toBe(true);
		expect(state.tool).toBe('view');
		expect(setCameraPlanTool(state, 'view')).toBe(false);
		expect(setCameraPlanTool(state, 'select')).toBe(true);
		expect(state.tool).toBe('select');
	});
});
