import { describe, expect, it } from 'vitest';

import { serializeSceneDocument } from '$lib/content/scene-codec';
import {
	createLayoutPreviewState,
	loadChopinLayoutPreview,
	refreshLayoutPreview,
	resetLayoutPreview
} from './layout-preview-state.svelte';

describe('layout preview state', () => {
	it('starts with a validated seven-room Chopin project', () => {
		const state = createLayoutPreviewState();

		expect(state.source).toBe('chopin-fixture');
		expect(state.project.formatVersion).toBe(1);
		expect(state.project.layout.floors[0]!.rooms).toHaveLength(7);
		expect(state.model.rooms).toHaveLength(7);
		expect(state.issues).toEqual([]);
		expect(state.bounds).not.toBeNull();
	});

	it('resets to empty while preserving the canonical scene document', () => {
		const state = createLayoutPreviewState();
		const sceneJson = serializeSceneDocument(state.project.scene);
		const version = state.previewVersion;

		expect(resetLayoutPreview(state)).toBe(true);
		expect(state.source).toBe('empty');
		expect(state.project.layout.floors).toEqual([]);
		expect(state.model.rooms).toEqual([]);
		expect(state.bounds).toBeNull();
		expect(serializeSceneDocument(state.project.scene)).toBe(sceneJson);
		expect(state.previewVersion).toBeGreaterThan(version);
	});

	it('reloads the deterministic Chopin fixture', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const version = state.previewVersion;

		expect(loadChopinLayoutPreview(state)).toBe(true);
		expect(state.source).toBe('chopin-fixture');
		expect(state.project.layout.floors[0]!.rooms).toHaveLength(7);
		expect(state.model.rooms.map((room) => room.roomId)).toEqual(
		state.project.layout.floors[0]!.rooms.map((room) => room.id)
	);
		expect(state.previewVersion).toBeGreaterThan(version);
	});

	it('refreshes geometry issues without mutating the source document', () => {
		const state = createLayoutPreviewState();
		const source = state.project.layout.floors[0]!.rooms[0]!;
		source.boundary.segments[0] = {
			...source.boundary.segments[0]!,
			kind: 'bezier',
			handleOut: [1, 0],
			handleIn: [2, 0]
		};
		const before = JSON.stringify(state.project);

		expect(refreshLayoutPreview(state)).toBe(true);
		expect(state.issues.some((issue) => issue.code === 'bezier-deferred')).toBe(true);
		expect(JSON.stringify(state.project)).toBe(before);
	});
});
