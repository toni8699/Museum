import { describe, expect, it } from 'vitest';

import { serializeSceneDocument } from '$lib/content/scene-codec';
import { createEmptyLayoutDocument, serializeLayoutDocument } from '$lib/layout/layout-codec';
import {
	captureLayoutPreviewSnapshot,
	commitLayoutDraftRoom,
	commitLayoutObject,
	commitLayoutPrimitive,
	commitLayoutPathRoom,
	commitLayoutOpening,
	commitLayoutRoomEdit,
	deleteLayoutOpening,
	deleteLayoutObject,
	deleteLayoutWallInteriorAnchor,
	insertLayoutWallInteriorAnchor,
	restoreLayoutPreviewSnapshot,
	updateLayoutOpeningFields,
	updateLayoutWallInteriorAnchor,
	createLayoutPreviewState,
	loadChopinLayoutPreview,
	importLayoutPreviewJson,
	layoutPreviewCanonicalJson,
	layoutPreviewIsDirty,
	layoutPreviewSessionStatus,
	refreshLayoutPreview,
	resetLayoutPreview,
	setLayoutPreviewImportError,
	toggleLayoutCeilings,
	updateLayoutObjectFields,
	updateLayoutRoomFields
} from '$lib/editor/layout/layout-preview-state.svelte';

describe('layout preview state', () => {
	it('starts with a validated seven-room Chopin project', () => {
		const state = createLayoutPreviewState();

		expect(state.source).toBe('chopin-fixture');
		expect(state.project.layout.floors[0]!.rooms).toHaveLength(7);
		expect(state.model.rooms).toHaveLength(7);
		expect(state.issues).toEqual([]);
		expect(state.bounds).not.toBeNull();
	});

	it('prebuilds a procedural wall mesh per compiled room', () => {
		const state = createLayoutPreviewState();
		expect(state.wallMeshesByRoom).toBeInstanceOf(Map);
		expect(state.wallMeshesByRoom.size).toBe(state.geometry.rooms.length);
		for (const room of state.geometry.rooms) {
			const mesh = state.wallMeshesByRoom.get(room.roomId);
			expect(mesh).toBeDefined();
			expect(mesh!.indices.length).toBeGreaterThan(0);
		}
	});

	it('rebuilds the pick-index cache with the wall-mesh cache on every mutation/reset', () => {
		const state = createLayoutPreviewState();
		expect(state.layout3dPickIndexByRoom).toBeInstanceOf(Map);
		expect(state.layout3dPickIndexByRoom.size).toBe(state.wallMeshesByRoom.size);
		for (const room of state.geometry.rooms) {
			const resolve = state.layout3dPickIndexByRoom.get(room.roomId);
			expect(resolve).toBeDefined();
			// Every triangle of every built room resolves to exactly one owner.
			const mesh = state.wallMeshesByRoom.get(room.roomId)!;
			for (let t = 0; t < mesh.indices.length / 3; t += 1) expect(resolve!(t)).not.toBeNull();
		}

		// A mutation rebuilds both caches together (same room key set).
		expect(commitLayoutDraftRoom(state, [[6, 0], [10, 0], [10, 3], [6, 3]]).success).toBe(true);
		expect([...state.layout3dPickIndexByRoom.keys()]).toEqual([...state.wallMeshesByRoom.keys()]);

		// Reset empties both.
		expect(resetLayoutPreview(state)).toBe(true);
		expect(state.wallMeshesByRoom.size).toBe(0);
		expect(state.layout3dPickIndexByRoom.size).toBe(0);
	});

	it('resets to empty while preserving the canonical scene document', () => {
		const state = createLayoutPreviewState();
		const sceneJson = serializeSceneDocument(state.project.scene);
		const version = state.previewVersion;
		const reframeVersion = state.reframeVersion;

		expect(resetLayoutPreview(state)).toBe(true);
		expect(state.source).toBe('empty');
		expect(state.project.layout.floors).toEqual([]);
		expect(state.model.rooms).toEqual([]);
		expect(state.bounds).toBeNull();
		expect(serializeSceneDocument(state.project.scene)).toBe(sceneJson);
		expect(state.previewVersion).toBeGreaterThan(version);
		expect(state.reframeVersion).toBe(reframeVersion + 1);
	});

	it('reloads the deterministic Chopin fixture', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const version = state.previewVersion;
		const reframeVersion = state.reframeVersion;

		expect(loadChopinLayoutPreview(state)).toBe(true);
		expect(state.source).toBe('chopin-fixture');
		expect(state.project.layout.floors[0]!.rooms).toHaveLength(7);
		expect(state.model.rooms.map((room) => room.roomId)).toEqual(
		state.project.layout.floors[0]!.rooms.map((room) => room.id)
	);
		expect(state.previewVersion).toBeGreaterThan(version);
		expect(state.reframeVersion).toBe(reframeVersion + 1);
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

	it('commits auto-bezier rooms and inserts/moves/deletes interior anchors', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const segments = [
			{
				id: 'curve-a',
				kind: 'auto-bezier' as const,
				start: [0, 0] as [number, number],
				end: [4, 0] as [number, number],
				interiorAnchors: [{ id: 'curve-a:anchor:1', point: [2, -1] as [number, number] }]
			},
			{ id: 'curve-b', kind: 'line' as const, start: [4, 0] as [number, number], end: [4, 4] as [number, number] },
			{ id: 'curve-c', kind: 'line' as const, start: [4, 4] as [number, number], end: [0, 4] as [number, number] },
			{ id: 'curve-d', kind: 'line' as const, start: [0, 4] as [number, number], end: [0, 0] as [number, number] }
		];
		const lineRoomResult = commitLayoutDraftRoom(state, [[6, 0], [10, 0], [10, 4], [6, 4]]);
		expect(lineRoomResult.success).toBe(true);
		const created = commitLayoutPathRoom(state, segments);
		expect(created.success).toBe(true);
		if (!created.success) return;
		const room = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === created.roomId)!;
		expect(room.boundary.segments[0]!.kind).toBe('auto-bezier');
		expect(state.model.rooms.at(-1)!.walls[0]!.samples.length).toBeGreaterThan(2);

		const lineRoom = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id !== created.roomId)!;
		const line = lineRoom.boundary.segments[0]!;
		if (line.kind !== 'line') return;
		const before = [line.start, line.end];
		const midpoint: [number, number] = [
			(before[0]![0] + before[1]![0]) / 2,
			(before[0]![1] + before[1]![1]) / 2 - 1
		];
		const inserted = insertLayoutWallInteriorAnchor(state, lineRoom.id, line.id, midpoint);
		expect(inserted).toMatchObject({ success: true });
		if (!inserted.success) return;
		const converted = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === lineRoom.id)!.boundary.segments[0]!;
		expect(converted.kind).toBe('auto-bezier');
		expect([converted.start, converted.end]).toEqual(before);
		if (converted.kind !== 'auto-bezier') return;
		expect(converted.interiorAnchors).toHaveLength(1);
		const anchorId = inserted.anchorId;
		expect(converted.interiorAnchors[0]!.id).toBe(anchorId);
		expect(updateLayoutWallInteriorAnchor(state, lineRoom.id, line.id, anchorId, [8, -2])).toEqual({
			success: true
		});
		const moved = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === lineRoom.id)!.boundary.segments[0]!;
		expect(moved.kind === 'auto-bezier' && moved.interiorAnchors[0]!.point).toEqual([8, -2]);
		expect(deleteLayoutWallInteriorAnchor(state, lineRoom.id, line.id, anchorId)).toEqual({ success: true });
		const restored = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === lineRoom.id)!.boundary.segments[0]!;
		expect(restored.kind).toBe('line');
	});

	it('restores a captured preview snapshot after anchor edits', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const roomResult = commitLayoutDraftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		expect(roomResult.success).toBe(true);
		if (!roomResult.success) return;
		const room = state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === roomResult.roomId)!;
		const segment = room.boundary.segments[0]!;
		const snapshot = captureLayoutPreviewSnapshot(state);
		expect(insertLayoutWallInteriorAnchor(state, room.id, segment.id, [2, -1]).success).toBe(true);
		expect(state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === room.id)!.boundary.segments[0]!.kind).toBe(
			'auto-bezier'
		);
		restoreLayoutPreviewSnapshot(state, snapshot);
		expect(state.project.layout.floors[0]!.rooms.find((candidate) => candidate.id === room.id)!.boundary.segments[0]!.kind).toBe('line');
	});

	it('captures snapshots from reactive proxies (Svelte $state) so Plan bend drag can begin', () => {
		const state = createLayoutPreviewState();
		// MuseumEditorApp wraps preview in $state(); structuredClone cannot clone those proxies.
		state.project = new Proxy(state.project, {});
		state.model = new Proxy(state.model, {});
		state.issues = new Proxy(state.issues, {});
		expect(() => captureLayoutPreviewSnapshot(state)).not.toThrow();
		const snapshot = captureLayoutPreviewSnapshot(state);
		expect(snapshot.project.layout.floors[0]!.rooms.length).toBe(state.project.layout.floors[0]!.rooms.length);
		expect(snapshot.model.rooms.length).toBe(state.model.rooms.length);
	});

	it('commits auto-bezier rooms with empty interiors', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const segments = [
			{
				id: 'a',
				kind: 'auto-bezier' as const,
				start: [0, 0] as [number, number],
				end: [4, 0] as [number, number],
				interiorAnchors: []
			},
			{ id: 'b', kind: 'line' as const, start: [4, 0] as [number, number], end: [4, 4] as [number, number] },
			{ id: 'c', kind: 'line' as const, start: [4, 4] as [number, number], end: [0, 4] as [number, number] },
			{ id: 'd', kind: 'line' as const, start: [0, 4] as [number, number], end: [0, 0] as [number, number] }
		];
		expect(commitLayoutPathRoom(state, segments).success).toBe(true);
	});

	it('rejects invalid drafts without mutating the preview', () => {
		const state = createLayoutPreviewState();
		const roomCount = state.project.layout.floors[0]!.rooms.length;
		const version = state.previewVersion;

		expect(commitLayoutDraftRoom(state, [[0, 0], [4, 0], [4, 0], [0, 3]])).toMatchObject({
			success: false,
			message: expect.stringContaining('non-zero')
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
			id: source.boundary.segments[0]!.id,
			kind: 'auto-bezier',
			start: [...source.boundary.segments[0]!.start] as [number, number],
			end: [...source.boundary.segments[0]!.end] as [number, number],
			interiorAnchors: [{ id: `${source.boundary.segments[0]!.id}:anchor:1`, point: [1, 0] }]
		};
		const before = JSON.stringify(state.project);

		expect(refreshLayoutPreview(state)).toBe(true);
		expect(state.issues).toEqual([]);
		expect(state.model.rooms[0]!.walls[0]!.samples.length).toBeGreaterThan(2);
		expect(JSON.stringify(state.project)).toBe(before);
	});

	it('tracks canonical baseline independently from invalid import feedback', () => {
		const state = createLayoutPreviewState();
		expect(layoutPreviewSessionStatus(state)).toBe('imported');
		expect(layoutPreviewIsDirty(state)).toBe(false);
		const baseline = state.baselineLayoutJson;
		expect(commitLayoutDraftRoom(state, [[30, 0], [34, 0], [34, 3], [30, 3]]).success).toBe(true);
		expect(layoutPreviewSessionStatus(state)).toBe('dirty');
		expect(layoutPreviewIsDirty(state)).toBe(true);
		const dirtyJson = layoutPreviewCanonicalJson(state);
		expect(importLayoutPreviewJson(state, '{')).toBe(false);
		expect(state.importError).toMatch(/Invalid JSON/);
		expect(state.baselineLayoutJson).toBe(baseline);
		expect(layoutPreviewSessionStatus(state)).toBe('dirty');
		expect(layoutPreviewIsDirty(state)).toBe(true);
		expect(layoutPreviewCanonicalJson(state)).toBe(dirtyJson);
	});

	it('keeps a dirty baseline intact while reporting a file-read import failure', () => {
		const state = createLayoutPreviewState();
		expect(commitLayoutDraftRoom(state, [[30, 0], [34, 0], [34, 3], [30, 3]]).success).toBe(true);
		const before = layoutPreviewCanonicalJson(state);
		const baseline = state.baselineLayoutJson;

		setLayoutPreviewImportError(state, 'Could not read the selected file');

		expect(state.importError).toBe('Could not read the selected file');
		expect(state.statusMessage).toBe('Import failed: Could not read the selected file');
		expect(layoutPreviewCanonicalJson(state)).toBe(before);
		expect(state.baselineLayoutJson).toBe(baseline);
		expect(layoutPreviewIsDirty(state)).toBe(true);
		expect(layoutPreviewSessionStatus(state)).toBe('dirty');
	});

	it('distinguishes imported empty baseline from blank reset', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		expect(layoutPreviewSessionStatus(state)).toBe('blank');
		expect(state.baselineKind).toBe('blank');
		const emptyJson = serializeLayoutDocument(createEmptyLayoutDocument());
		expect(importLayoutPreviewJson(state, emptyJson)).toBe(true);
		expect(state.source).toBe('imported');
		expect(state.baselineKind).toBe('imported');
		expect(layoutPreviewSessionStatus(state)).toBe('imported');
	});

	it('commits Plan primitive gestures with floor-relative placement', () => {
		const state = createLayoutPreviewState();
		const room = state.project.layout.floors[0]!.rooms[0]!;
		const center = room.boundary.segments.reduce(
			(sum, segment) => [sum[0] + segment.start[0], sum[1] + segment.start[1]] as [number, number],
			[0, 0] as [number, number]
		).map((value) => value / room.boundary.segments.length) as [number, number];
		const result = commitLayoutPrimitive(
			state,
			'box',
			[center[0] - 1, center[1] - 1.5],
			[center[0] + 1, center[1] + 1.5],
			room.id,
			true
		);
		expect(result.success).toBe(true);
		if (!result.success) return;
		const object = state.project.layout.objects.find((candidate) => candidate.id === result.objectId);
		expect(object).toMatchObject({ kind: 'box', roomId: room.id, dimensions: [2, 1, 3] });
		expect(commitLayoutPrimitive(state, 'sphere', center, center, room.id, true).success).toBe(false);
	});

	it('keeps sphere height, stored center, model bounds, and JSON geometry unified', () => {
		const state = createLayoutPreviewState();
		const room = state.project.layout.floors[0]!.rooms[0]!;
		const center = room.boundary.segments.reduce(
			(sum, segment) => [sum[0] + segment.start[0], sum[1] + segment.start[1]] as [number, number],
			[0, 0] as [number, number]
		).map((value) => value / room.boundary.segments.length) as [number, number];
		const reframeVersion = state.reframeVersion;
		const created = commitLayoutPrimitive(state, 'sphere', center, [center[0] + 2, center[1]], room.id);
		expect(created.success).toBe(true);
		if (!created.success) return;
		const stored = state.project.layout.objects.find((object) => object.id === created.objectId)!;
		const descriptor = state.model.objects.find((object) => object.objectId === created.objectId)!;
		expect(stored).toMatchObject({ position: [center[0], 0.5, center[1]], dimensions: [4, 1, 4] });
		expect(descriptor.worldAabb.min[1]).toBeCloseTo(0);
		expect(descriptor.worldAabb.max[1]).toBeCloseTo(1);
		expect(serializeLayoutDocument(state.project.layout)).toContain('"dimensions": [');
		expect(state.reframeVersion).toBe(reframeVersion);

		expect(updateLayoutObjectFields(state, created.objectId, { dimensions: [4, 2, 4] }).success).toBe(true);
		const resized = state.model.objects.find((object) => object.objectId === created.objectId)!;
		expect(resized.worldAabb.min[1]).toBeCloseTo(-0.5);
		expect(resized.worldAabb.max[1]).toBeCloseTo(1.5);
		expect(state.reframeVersion).toBe(reframeVersion);
	});

	it('creates, edits, and deletes authored objects while profiles remain read-only', () => {
		const state = createLayoutPreviewState();
		const room = state.project.layout.floors[0]!.rooms[0]!;
		const created = commitLayoutObject(state, 'box', [1, 0.5, 2], room.id);
		expect(created.success).toBe(true);
		if (!created.success) return;
		expect(layoutPreviewSessionStatus(state)).toBe('dirty');
		expect(state.model.objects.find((object) => object.objectId === created.objectId)).toBeTruthy();
		expect(updateLayoutObjectFields(state, created.objectId, { dimensions: [2, 1, 3], roomId: undefined })).toEqual({
			success: true,
			objectId: created.objectId
		});
		expect(state.project.layout.objects.find((object) => object.id === created.objectId)).toMatchObject({
			dimensions: [2, 1, 3]
		});
		expect(deleteLayoutObject(state, created.objectId)).toEqual({ success: true, objectId: created.objectId });

		const imported = createEmptyLayoutDocument();
		imported.objects.push({
			id: 'profile-a',
			kind: 'profile',
			position: [0, 0.5, 0],
			rotation: [0, 0, 0],
			dimensions: [1, 1, 1],
			profile: { closed: true, segments: [{ id: 'profile-line', kind: 'line', start: [0, 0], end: [1, 0] }] }
		});
		expect(importLayoutPreviewJson(state, serializeLayoutDocument(imported))).toBe(true);
		expect(updateLayoutObjectFields(state, 'profile-a', { position: [1, 0.5, 0] }).success).toBe(false);
		expect(deleteLayoutObject(state, 'profile-a').success).toBe(false);
		expect(layoutPreviewIsDirty(state)).toBe(false);
	});

	it('updates shared room/floor fields and rejects an over-height floor mutation', () => {
		const state = createLayoutPreviewState();
		const room = state.project.layout.floors[0]!.rooms[0]!;
		expect(updateLayoutRoomFields(state, room.id, { name: 'Gallery A', wallThickness: 0.25 })).toEqual({ success: true });
		expect(state.project.layout.floors[0]!.rooms[0]).toMatchObject({ name: 'Gallery A', wallThickness: 0.25 });
		const opening = state.project.layout.floors[0]!.rooms[0]!.openings[0];
		if (!opening) return;
		const before = layoutPreviewCanonicalJson(state);
		expect(updateLayoutRoomFields(state, room.id, { floorHeight: opening.sillHeight + opening.height - 0.1 }).success).toBe(false);
		expect(layoutPreviewCanonicalJson(state)).toBe(before);
	});

	it('persists draft room renames into canonical layout JSON', () => {
		const state = createLayoutPreviewState();
		resetLayoutPreview(state);
		const committed = commitLayoutDraftRoom(state, [
			[0, 0],
			[4, 0],
			[4, 3],
			[0, 3]
		]);
		expect(committed.success).toBe(true);
		if (!committed.success) return;
		expect(state.project.layout.floors[0]!.rooms[0]!.name).toMatch(/^Draft Room/);
		expect(updateLayoutRoomFields(state, committed.roomId, { name: 'Manual QA Room' })).toEqual({ success: true });
		expect(state.project.layout.floors[0]!.rooms[0]!.name).toBe('Manual QA Room');
		const json = layoutPreviewCanonicalJson(state);
		expect(json).toContain('"name": "Manual QA Room"');
		expect(json).not.toContain('Draft Room');
	});
});
