import { describe, expect, it } from 'vitest';

import { serializeSceneDocument } from '$lib/content/scene-codec';
import {
	commitLayoutDraftRoom,
	commitLayoutOpening,
	commitLayoutRoomEdit,
	deleteLayoutOpening,
	updateLayoutOpeningFields,
	createLayoutPreviewState,
	loadChopinLayoutPreview,
	refreshLayoutPreview,
	resetLayoutPreview,
	toggleLayoutCeilings
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

	it('edits a committed room without changing scene data or segment ids', () => {
		const state = createLayoutPreviewState();
		const room = state.project.layout.floors[0]!.rooms[0]!;
		const ids = room.boundary.segments.map((segment) => segment.id);
		const points = room.boundary.segments.map((segment) => [segment.start[0] + 2, segment.start[1] - 1] as [number, number]);
		const sceneJson = serializeSceneDocument(state.project.scene);

		expect(commitLayoutRoomEdit(state, room.id, points)).toEqual({ success: true });
		expect(state.project.layout.floors[0]!.rooms[0]!.boundary.segments.map((segment) => segment.id)).toEqual(ids);
		expect(state.model.rooms[0]!.floorPolygon[0]).toEqual(points[0]);
		expect(serializeSceneDocument(state.project.scene)).toBe(sceneJson);
	});

	it('rejects invalid room edits without mutating committed geometry', () => {
		const state = createLayoutPreviewState();
		const room = state.project.layout.floors[0]!.rooms[0]!;
		const before = JSON.stringify(state.project.layout);
		const points = room.boundary.segments.map((segment) => [...segment.start] as [number, number]);
		points[1] = points[0]!;

		expect(commitLayoutRoomEdit(state, room.id, points).success).toBe(false);
		expect(JSON.stringify(state.project.layout)).toBe(before);
	});

	it('creates, updates, and deletes geometry-only openings without changing scene data', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const sceneJson = serializeSceneDocument(state.project.scene);
		const roomResult = commitLayoutDraftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		expect(roomResult.success).toBe(true);
		if (!roomResult.success) return;
		const room = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === roomResult.roomId)!;
		const segmentId = room.boundary.segments[0]!.id;

		const created = commitLayoutOpening(state, room.id, segmentId, 'door', 1, true);
		expect(created).toMatchObject({ success: true });
		if (!created.success) return;
		expect(state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === room.id)!.openings).toHaveLength(1);
		expect(state.model.rooms.find((candidate) => candidate.roomId === room.id)!.walls[0]!.sections.some((section) => section.openingId === created.openingId)).toBe(true);

		expect(updateLayoutOpeningFields(state, room.id, created.openingId, { width: 1.1, height: 2.2 })).toMatchObject({ success: true });
		expect(deleteLayoutOpening(state, room.id, created.openingId)).toMatchObject({ success: true });
		expect(state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === room.id)!.openings).toEqual([]);
		expect(serializeSceneDocument(state.project.scene)).toBe(sceneJson);
	});

	it('rejects invalid opening edits and room edits that would break openings', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const roomResult = commitLayoutDraftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		expect(roomResult.success).toBe(true);
		if (!roomResult.success) return;
		const room = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === roomResult.roomId)!;
		const segmentId = room.boundary.segments[0]!.id;
		const created = commitLayoutOpening(state, room.id, segmentId, 'door', 1, false);
		expect(created.success).toBe(true);
		if (!created.success) return;
		const before = JSON.stringify(state.project.layout);
		const version = state.previewVersion;
		expect(updateLayoutOpeningFields(state, room.id, created.openingId, { sillHeight: 2, height: 2 }).success).toBe(false);
		expect(JSON.stringify(state.project.layout)).toBe(before);
		expect(state.previewVersion).toBe(version);
		const points = room.boundary.segments.map((segment) => [...segment.start] as [number, number]);
		points[1] = [0.5, 0];
		expect(commitLayoutRoomEdit(state, room.id, points).success).toBe(false);
		expect(JSON.stringify(state.project.layout)).toBe(before);
	});

	it('rejects overlapping opening creation without advancing preview version', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const roomResult = commitLayoutDraftRoom(state, [[0, 0], [6, 0], [6, 4], [0, 4]]);
		expect(roomResult.success).toBe(true);
		if (!roomResult.success) return;
		const room = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === roomResult.roomId)!;
		const segmentId = room.boundary.segments[0]!.id;
		const first = commitLayoutOpening(state, room.id, segmentId, 'door', 2, false);
		expect(first.success).toBe(true);
		if (!first.success) return;
		const before = JSON.stringify(state.project.layout);
		const version = state.previewVersion;
		expect(commitLayoutOpening(state, room.id, segmentId, 'window', 2.2, false).success).toBe(false);
		expect(JSON.stringify(state.project.layout)).toBe(before);
		expect(state.previewVersion).toBe(version);
		expect(state.lastMutationMessage).toMatch(/overlap/i);
	});

	it('keeps openings stable when editing an unrelated room', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const firstRoom = commitLayoutDraftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const secondRoom = commitLayoutDraftRoom(state, [[6, 0], [10, 0], [10, 3], [6, 3]]);
		expect(firstRoom.success).toBe(true);
		expect(secondRoom.success).toBe(true);
		if (!firstRoom.success || !secondRoom.success) return;
		const roomA = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === firstRoom.roomId)!;
		const roomB = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === secondRoom.roomId)!;
		const created = commitLayoutOpening(state, roomA.id, roomA.boundary.segments[0]!.id, 'door', 1, false);
		expect(created.success).toBe(true);
		if (!created.success) return;
		const openingsBefore = JSON.stringify(
			state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === roomA.id)!.openings
		);
		const points = roomB.boundary.segments.map((segment) => [segment.start[0] + 1, segment.start[1]] as [number, number]);
		expect(commitLayoutRoomEdit(state, roomB.id, points)).toEqual({ success: true });
		expect(
			JSON.stringify(state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === roomA.id)!.openings)
		).toBe(openingsBefore);
	});

	it('keeps ceiling visibility layout-local', () => {
		const state = createLayoutPreviewState();
		expect(state.showCeilings).toBe(false);
		toggleLayoutCeilings(state);
		expect(state.showCeilings).toBe(true);
		expect(resetLayoutPreview(state)).toBe(true);
		expect(state.showCeilings).toBe(true);
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
