import { describe, expect, it } from 'vitest';

import { serializeSceneDocument } from '$lib/content/scene-codec';
import {
	commitLayoutDraftRoom,
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

	it('commits rectangle and polygon drafts into the layout without changing scene data', () => {
		const state = createLayoutPreviewState();
		const sceneJson = serializeSceneDocument(state.project.scene);

		const rectangleResult = commitLayoutDraftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		expect(rectangleResult.success).toBe(true);
		expect(state.source).toBe('draft');
		expect(state.project.layout.floors[0]!.rooms).toHaveLength(8);
		expect(state.model.rooms).toHaveLength(8);

		expect(commitLayoutDraftRoom(state, [[6, 0], [9, 0], [8, 2]])).toMatchObject({ success: true });
		expect(state.project.layout.floors[0]!.rooms).toHaveLength(9);
		expect(serializeSceneDocument(state.project.scene)).toBe(sceneJson);
	});

	it('rejects invalid drafts without mutating the preview', () => {
		const state = createLayoutPreviewState();
		const roomCount = state.project.layout.floors[0]!.rooms.length;
		const version = state.previewVersion;

		expect(commitLayoutDraftRoom(state, [[0, 0], [4, 0], [4, 0], [0, 3]])).toMatchObject({
			success: false,
			message: expect.stringContaining('non-zero length')
		});
		expect(state.project.layout.floors[0]!.rooms).toHaveLength(roomCount);
		expect(state.previewVersion).toBe(version);
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
