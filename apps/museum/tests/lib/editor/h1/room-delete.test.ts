import { describe, expect, it } from 'vitest';

import { museumSceneDocument } from '$lib/content/chopin-project';
import { createEmptySceneDocument, type MuseumSceneDocument } from '$lib/content/scene';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	captureLayoutPreviewSnapshot,
	commitLayoutDraftRoom,
	commitLayoutObject,
	commitLayoutOpening,
	createEmptyLayoutPreviewState,
	deleteLayoutRoom,
	layoutRoomSceneReferenceSummary,
	layoutRoomSceneReferenceTotal,
	listLayoutRoomSceneReferences,
	restoreLayoutPreviewSnapshot
} from '$lib/editor/layout/layout-preview-state.svelte';
import { serializeLayoutDocument, validateLayoutDocument } from '$lib/layout/layout-codec';

function draftRoom(state: ReturnType<typeof createEmptyLayoutPreviewState>, points: [number, number][]) {
	const result = commitLayoutDraftRoom(state, points);
	if (!result.success) throw new Error(`draft room failed: ${result.message}`);
	return result.roomId;
}

/** Clone a real Chopin scene member and repoint it at the drafted room. */
function referenceScene(
	roomId: string,
	kind: 'entity' | 'cluster' | 'navigation-node' | 'path-anchor' | 'waypoint' | 'view-keyframe'
): MuseumSceneDocument {
	const scene = createEmptySceneDocument();
	switch (kind) {
		case 'entity': {
			const entity = structuredClone(museumSceneDocument.entities[0]!);
			scene.entities.push({ ...entity, roomId });
			return scene;
		}
		case 'cluster': {
			scene.clusters = [{ id: 'cluster-test', name: 'Cluster', roomId, memberIds: [] }];
			return scene;
		}
		case 'navigation-node': {
			const node = structuredClone(museumSceneDocument.navigationNodes[0]!);
			scene.navigationNodes.push({ ...node, roomId });
			return scene;
		}
		case 'path-anchor': {
			const connection = structuredClone(museumSceneDocument.connections[0]!);
			connection.positionPath.anchors[0] = {
				...connection.positionPath.anchors[0]!,
				roomId
			};
			scene.connections.push(connection);
			return scene;
		}
		case 'waypoint': {
			const connection = structuredClone(museumSceneDocument.connections[0]!);
			connection.targetWaypoints = [{ position: [0, 0, 0], roomId }];
			scene.connections.push(connection);
			return scene;
		}
		case 'view-keyframe': {
			const connection = structuredClone(museumSceneDocument.connections[0]!);
			connection.viewTracks = {
				forward: [{ id: 'keyframe-test', progress: 0, cameraTarget: [0, 0, 0], roomId, fov: 50 }],
				reverse: []
			};
			scene.connections.push(connection);
			return scene;
		}
	}
}

describe('H1 S2.1 — listLayoutRoomSceneReferences', () => {
	it('counts each reference kind independently', () => {
		const roomId = 'room-a';
		const scene = createEmptySceneDocument();
		const entity = structuredClone(museumSceneDocument.entities[0]!);
		const node = structuredClone(museumSceneDocument.navigationNodes[0]!);
		scene.entities.push({ ...entity, roomId }, { ...entity, roomId });
		scene.clusters = [{ id: 'c1', name: 'C', roomId, memberIds: [] }];
		scene.navigationNodes.push({ ...node, roomId });

		const refs = listLayoutRoomSceneReferences(scene, roomId);
		expect(refs.entities).toBe(2);
		expect(refs.clusters).toBe(1);
		expect(refs.navigationNodes).toBe(1);
		expect(refs.pathAnchors).toBe(0);
		expect(refs.waypoints).toBe(0);
		expect(refs.viewKeyframes).toBe(0);
		expect(layoutRoomSceneReferenceTotal(refs)).toBe(4);
	});

	it('summarizes blockers per kind for the status message', () => {
		const scene = referenceScene('room-a', 'entity');
		expect(layoutRoomSceneReferenceSummary(listLayoutRoomSceneReferences(scene, 'room-a'))).toBe('1 entity');
		expect(
			layoutRoomSceneReferenceSummary({
				entities: 2,
				clusters: 0,
				navigationNodes: 1,
				pathAnchors: 0,
				waypoints: 0,
				viewKeyframes: 3
			})
		).toBe('2 entities · 1 camera node · 3 view keyframes');
	});
});

describe('H1 S2.1 — deleteLayoutRoom (preview state)', () => {
	it('deletes a room with owned objects and portal refs, keeping the layout valid', () => {
		const state = createEmptyLayoutPreviewState();
		const roomA = draftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const roomB = draftRoom(state, [[5, 0], [9, 0], [9, 3], [5, 3]]);
		expect(commitLayoutOpening(state, roomA, `${roomA}:wall:0`, 'door', 0.5)).toMatchObject({ success: true });
		const floor = state.project.layout.floors[0]!;
		const roomAIndex = floor.rooms.findIndex((room) => room.id === roomA);
		floor.rooms[roomAIndex]!.openings[0]!.connectsRoomIds = [roomA, roomB];
		expect(commitLayoutObject(state, 'box', [6, 0.5, 1], roomB)).toMatchObject({ success: true });
		const sceneBefore = serializeSceneDocument(state.project.scene);

		const result = deleteLayoutRoom(state, roomB, createEmptySceneDocument());
		expect(result.success).toBe(true);
		// `applyLayoutMutation` replaces `state.project` wholesale, so re-read
		// the committed floor rather than the pre-mutation reference above.
		const committedFloor = state.project.layout.floors[0]!;
		expect(committedFloor.rooms.map((room) => room.id)).toEqual([roomA]);
		expect(state.project.layout.objects).toEqual([]);
		expect('connectsRoomIds' in committedFloor.rooms[0]!.openings[0]!).toBe(false);
		expect(validateLayoutDocument(state.project.layout).success).toBe(true);
		expect(serializeSceneDocument(state.project.scene)).toBe(sceneBefore);
	});

	it('rejects when any scene reference kind targets the room', () => {
		for (const kind of ['entity', 'cluster', 'navigation-node', 'path-anchor', 'waypoint', 'view-keyframe'] as const) {
			const state = createEmptyLayoutPreviewState();
			const roomId = draftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
			const scene = referenceScene(roomId, kind);
			const layoutBefore = serializeLayoutDocument(state.project.layout);

			const result = deleteLayoutRoom(state, roomId, scene);
			expect(result.success, kind).toBe(false);
			if (result.success) throw new Error(`expected ${kind} reference to block deletion`);
			expect(result.message, kind).toContain('referenced by scene content');
			expect(serializeLayoutDocument(state.project.layout), kind).toBe(layoutBefore);
		}
	});

	it('rejects when the room is unknown', () => {
		const state = createEmptyLayoutPreviewState();
		const result = deleteLayoutRoom(state, 'missing-room', createEmptySceneDocument());
		expect(result.success).toBe(false);
		if (result.success) throw new Error('expected unknown room to fail');
		expect(result.message).toBe('Room no longer exists');
	});

	it('deleting the last room leaves a valid empty layout', () => {
		const state = createEmptyLayoutPreviewState();
		const roomId = draftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const result = deleteLayoutRoom(state, roomId, createEmptySceneDocument());
		expect(result.success).toBe(true);
		expect(state.project.layout.floors[0]!.rooms).toEqual([]);
		expect(state.bounds).toBeNull();
		expect(validateLayoutDocument(state.project.layout).success).toBe(true);
	});
});

describe('H1 S2.1 — guarded B3 transaction', () => {
	function makeStore() {
		const store = createMuseumEditorStore();
		const layoutPreview = createEmptyLayoutPreviewState();
		store.registerLayoutHistory({
			capture: () => captureLayoutPreviewSnapshot(layoutPreview),
			replace: (snapshot) =>
				restoreLayoutPreviewSnapshot(
					layoutPreview,
					snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>
				),
			matches: (a, b) =>
				JSON.stringify((a as { project: { layout: unknown } }).project.layout) ===
				JSON.stringify((b as { project: { layout: unknown } }).project.layout)
		});
		return { store, layoutPreview };
	}

	it('commits one undoable layout entry and restores on undo', () => {
		const { store, layoutPreview } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const sceneJson = serializeSceneDocument(store.document);

		expect(store.beginLayoutTransaction()).toBe(true);
		const result = deleteLayoutRoom(layoutPreview, roomId, store.document);
		expect(result.success).toBe(true);
		expect(store.commitLayoutTransaction(captureLayoutPreviewSnapshot(layoutPreview))).toBe(true);
		expect(layoutPreview.project.layout.floors[0]!.rooms).toEqual([]);
		expect(store.canUndo).toBe(true);
		expect(serializeSceneDocument(store.document)).toBe(sceneJson);

		expect(store.undo()).toBe(true);
		expect(layoutPreview.project.layout.floors[0]!.rooms.map((room) => room.id)).toEqual([roomId]);
		expect(serializeSceneDocument(store.document)).toBe(sceneJson);
	});

	it('a blocked delete writes no history entry', () => {
		const { store, layoutPreview } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const scene = referenceScene(roomId, 'navigation-node');
		const layoutBefore = serializeLayoutDocument(layoutPreview.project.layout);

		expect(store.beginLayoutTransaction()).toBe(true);
		const result = deleteLayoutRoom(layoutPreview, roomId, scene);
		expect(result.success).toBe(false);
		expect(store.cancelLayoutTransaction()).toBe(true);
		expect(store.canUndo).toBe(false);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(layoutBefore);
	});
});
