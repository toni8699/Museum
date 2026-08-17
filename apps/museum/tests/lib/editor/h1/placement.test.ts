import { describe, expect, it } from 'vitest';
import { Vector3, type Intersection, type Object3D } from 'three';

import { createEmptySceneDocument } from '$lib/content/scene';
import { findPlaceableFloorIntersection } from '$lib/editor/editor-placement';
import { createMuseumEditorStore, type MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	commitLayoutDraftRoom,
	createEmptyLayoutPreviewState
} from '$lib/editor/layout/layout-preview-state.svelte';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { Vec3 } from '$lib/types/museum';
import { createRelicFixtureEditorStore } from '../editor-test-utils';

/**
 * H1 S8.1 — catalogue placement resolves the target room from the clicked
 * floor instead of the frozen `'paris'` hardcode. The mutator + click handler
 * are room-agnostic in H1; the relic keeps its Paris-oriented behavior.
 */

function draftRoomAndSync(): { store: MuseumEditorStore; roomId: string } {
	const layoutPreview = createEmptyLayoutPreviewState();
	const store = createMuseumEditorStore({
		document: createEmptySceneDocument(),
		rooms: createLayoutRoomRegistry(layoutPreview.project.layout)
	});
	const drafted = commitLayoutDraftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
	if (!drafted.success) throw new Error(`draft room failed: ${drafted.message}`);
	const roomId = drafted.roomId;
	store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));
	return { store, roomId };
}

function floorIntersections(roomId: string): Intersection[] {
	const floor = {
		parent: null,
		userData: {
			surfaceType: 'floor',
			editorSurface: { type: 'floor', placeable: true, roomId }
		}
	} as unknown as Object3D;
	return [
		{
			object: floor,
			point: new Vector3(2, 0, 1.5),
			distance: 1
		} as Intersection
	];
}

describe('H1 S8.1 — room-agnostic catalogue placement', () => {
	it('arms catalogue placement without preselecting Paris in H1', () => {
		const { store } = draftRoomAndSync();
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');
		expect(store.selectedRoomId).toBeNull();
		expect(store.statusMessage).toMatch(/tagged museum-room floor/);
	});

	it('keeps the relic arm Paris-oriented (preselection + Paris message)', () => {
		const store = createRelicFixtureEditorStore();
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.selectedRoomId).toBe('paris');
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');
		expect(store.statusMessage).toMatch(/Paris floor/);
	});

	it('stamps the resolved roomId onto the created model entity (not a hardcoded paris)', () => {
		const { store, roomId } = draftRoomAndSync();
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		const id = store.createPendingPlacementAt([1, 0.01, 2], roomId);
		expect(id).not.toBeNull();
		const entity = store.document.entities.find((candidate) => candidate.id === id);
		expect(entity).toMatchObject({
			kind: 'model',
			assetId: 'paris-salon-chair',
			roomId
		});
		expect(entity?.roomId).not.toBe('paris');
	});

	it('accepts a drafted room via the live predicate; the Chopin default still rejects it', () => {
		const { store, roomId } = draftRoomAndSync();
		const intersections = floorIntersections(roomId);

		const liveHit = findPlaceableFloorIntersection(
			intersections,
			undefined,
			(id) => store.rooms.has(id)
		);
		expect(liveHit?.roomId).toBe(roomId);

		// The frozen Chopin `roomById` default does not know a drafted id.
		expect(findPlaceableFloorIntersection(intersections)).toBeNull();
	});

	it('places a model on a drafted room through the three component-equivalent calls', () => {
		const { store, roomId } = draftRoomAndSync();
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);

		// The same three calls EditorSelection makes for the H1 branch.
		const floorHit = findPlaceableFloorIntersection(
			floorIntersections(roomId),
			undefined,
			(id) => store.rooms.has(id)
		);
		expect(floorHit).not.toBeNull();
		const worldPoint = floorHit!.intersection.point.toArray() as Vec3;
		const localPoint = store.rooms.localPoint(floorHit!.roomId, worldPoint);
		const id = store.createPendingPlacementAt(localPoint, floorHit!.roomId);
		expect(id).not.toBeNull();

		const entity = store.document.entities.find((candidate) => candidate.id === id);
		expect(entity?.roomId).toBe(roomId);
		expect(store.document.entities).toHaveLength(1);
		// One `scene` history entry for the placement.
		expect(store.canUndo).toBe(true);
	});

	it('keeps the relic click path Paris-only (a non-Paris floor is rejected)', () => {
		// Relic keeps `findPlaceableFloorIntersection(intersections, 'paris')`.
		expect(findPlaceableFloorIntersection(floorIntersections('workshop'), 'paris')).toBeNull();
	});
});
