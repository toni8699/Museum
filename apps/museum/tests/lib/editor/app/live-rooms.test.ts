import { describe, expect, it } from 'vitest';
import type { Intersection, Object3D } from 'three';

import { createEmptySceneDocument } from '$lib/content/scene';
import { findPlaceableFloorIntersection } from '$lib/editor/editor-placement';
import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	commitLayoutDraftRoom,
	createEmptyLayoutPreviewState
} from '$lib/editor/layout/layout-preview-state.svelte';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { Vec3 } from '$lib/types/museum';

/**
 * the store's room registry must stay live against the project layout.
 * The boot-empty editor re-derives `createLayoutRoomRegistry(layoutPreview.project.layout)`
 * after every layout mutation; without that sync, `store.rooms.has(draftedRoomId)`
 * stays false and camera/primitive placement on a drafted room is rejected with
 * "Click a tagged museum-room floor" (and node creation would throw on the
 * unknown room). These tests pin the seam: `store.updateRooms` + the acceptance
 * predicate the placement branches use.
 */
describe('live room registry', () => {
	it('drafted rooms are unknown until the registry is synced, then placeable', () => {
		const layoutPreview = createEmptyLayoutPreviewState();
		const store = createMuseumEditorStore({
			document: createEmptySceneDocument(),
			rooms: createLayoutRoomRegistry(layoutPreview.project.layout)
		});

		const drafted = commitLayoutDraftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		if (!drafted.success) throw new Error(`draft room failed: ${drafted.message}`);
		const roomId = drafted.roomId;

		// Boot-time registry is a snapshot of the then-empty layout.
		expect(store.rooms.has(roomId)).toBe(false);

		// EditorApp re-derives the registry after every layout mutation.
		store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));
		expect(store.rooms.has(roomId)).toBe(true);
	});

	it('the floor-acceptance predicate accepts a drafted room once synced', () => {
		const layoutPreview = createEmptyLayoutPreviewState();
		const store = createMuseumEditorStore({
			document: createEmptySceneDocument(),
			rooms: createLayoutRoomRegistry(layoutPreview.project.layout)
		});
		const drafted = commitLayoutDraftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		if (!drafted.success) throw new Error(`draft room failed: ${drafted.message}`);
		const roomId = drafted.roomId;

		const floor = {
			parent: null,
			userData: {
				surfaceType: 'floor',
				editorSurface: { type: 'floor', placeable: true, roomId }
			}
		} as unknown as Object3D;
		const intersections = [{ object: floor, point: { x: 2, y: 0, z: 1.5 }, distance: 1 }] as Intersection[];

		// Same predicate the camera branch passes to findPlaceableFloorIntersection.
		const predicate = (id: string) => store.rooms.has(id);
		expect(findPlaceableFloorIntersection(intersections, undefined, predicate)).toBeNull();

		store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));
		const hit = findPlaceableFloorIntersection(intersections, undefined, predicate);
		expect(hit?.roomId).toBe(roomId);
	});

	it('places and commits a camera node on a drafted room through the live registry', () => {
		const layoutPreview = createEmptyLayoutPreviewState();
		const store = createMuseumEditorStore({
			document: createEmptySceneDocument(),
			rooms: createLayoutRoomRegistry(layoutPreview.project.layout)
		});
		const drafted = commitLayoutDraftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		if (!drafted.success) throw new Error(`draft room failed: ${drafted.message}`);
		const roomId = drafted.roomId;
		store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));

		expect(store.beginCameraPlacement()).toBe(true);
		const floorWorld: Vec3 = [2, 0, 1.5];
		const forward: Vec3 = [0, 0, -1];
		const nodeId = store.createPendingNavigationNodeAt(roomId, floorWorld, forward);
		expect(nodeId).not.toBeNull();

		expect(store.document.navigationNodes).toHaveLength(1);
		const node = store.document.navigationNodes[0]!;
		expect(node.roomId).toBe(roomId);
		expect(store.rooms.has(node.roomId)).toBe(true);
		// Room-local position/target resolved through the live registry: finite.
		expect(node.position.every((v) => Number.isFinite(v))).toBe(true);
		expect(node.cameraTarget.every((v) => Number.isFinite(v))).toBe(true);
		expect(store.canUndo).toBe(true);
	});

	it('re-resolves the runtime scene when a room moves (updateRooms rebuild)', () => {
		const layoutPreview = createEmptyLayoutPreviewState();
		const store = createMuseumEditorStore({
			document: createEmptySceneDocument(),
			rooms: createLayoutRoomRegistry(layoutPreview.project.layout)
		});
		const drafted = commitLayoutDraftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		if (!drafted.success) throw new Error(`draft room failed: ${drafted.message}`);
		const roomId = drafted.roomId;
		store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));
		expect(store.beginCameraPlacement()).toBe(true);
		expect(store.createPendingNavigationNodeAt(roomId, [2, 0, 1.5], [0, 0, -1])).not.toBeNull();

		const runtimeBefore = [...store.scene.navigationNodes[0]!.position];
		const documentNode = store.document.navigationNodes[0]!;
		// The runtime scene is world-resolved through the live registry.
		expect(runtimeBefore).toEqual(store.rooms.point(roomId, documentNode.position));

		// Move the room: shift its frame origin +10 along world Z.
		const floor = layoutPreview.project.layout.floors[0]!;
		const room = floor.rooms.find((candidate) => candidate.id === roomId)!;
		room.frame.origin = [room.frame.origin[0], room.frame.origin[1] + 10];

		// The editor $effect re-derives the registry on every layout mutation.
		store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));

		const runtimeAfter = store.scene.navigationNodes[0]!.position;
		expect(runtimeAfter[0]).toBeCloseTo(runtimeBefore[0], 6);
		expect(runtimeAfter[2]).toBeCloseTo(runtimeBefore[2] + 10, 6);
		// The document node stays room-local; the runtime tracks the moved room.
		expect(store.document.navigationNodes[0]!.position).toEqual(documentNode.position);
		expect(store.rooms.point(roomId, documentNode.position)).toEqual(runtimeAfter);
	});
});

describe('updateRooms is a no-op for the frozen relic', () => {
	it('keeps the Chopin registry until explicitly swapped', () => {
		const store = createMuseumEditorStore();
		expect(store.rooms.has('paris')).toBe(true);
		// The relic never calls updateRooms, but the call itself is harmless.
		store.updateRooms(store.rooms);
		expect(store.rooms.has('paris')).toBe(true);
	});
});
