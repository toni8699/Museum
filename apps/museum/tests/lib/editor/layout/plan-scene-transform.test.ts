import { describe, expect, it } from 'vitest';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { LayoutDocument } from '$lib/layout/layout-types';
import type { SceneDocument } from '$lib/content/scene';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { placementTransformFromDocument } from '$lib/editor/editor-transform';
import {
	capturePlanSceneTransformMembers,
	planSceneWorldPivot,
	rotatePlanSceneMembers,
	translatePlanSceneMembers
} from '$lib/editor/layout/plan-scene-transform';

function layout(): LayoutDocument {
	return {
		units: 'meters',
		floors: [{
			id: 'floor', name: 'Floor', elevation: 3, height: 4,
			rooms: [{
				id: 'room', name: 'Room', wallThickness: 0.2, floorThickness: 0.2, ceilingThickness: 0.2,
				frame: { origin: [10, 20], yaw: Math.PI / 2 },
				boundary: { closed: true, segments: [
					{ id: 'a', kind: 'line', start: [9, 19], end: [11, 19] },
					{ id: 'b', kind: 'line', start: [11, 19], end: [11, 21] },
					{ id: 'c', kind: 'line', start: [11, 21], end: [9, 21] },
					{ id: 'd', kind: 'line', start: [9, 21], end: [9, 19] }
				] }, openings: []
			}]
		}],
		objects: []
	};
}

function scene(): SceneDocument {
	return {
		entities: [{
			id: 'chair', kind: 'primitive', primitive: 'box', name: 'Chair', roomId: 'room',
			position: [2, 1.25, 4], rotation: [0.2, 0.3, -0.4],
			dimensions: { width: 1, height: 1, depth: 1 },
			materialId: 'wood-walnut', castShadow: true, receiveShadow: true
		}],
		materials: [], textures: [], navigationNodes: [], connections: []
	};
}

describe('P2 Plan Scene transforms', () => {
	it('inverse-resolves snapped world drag while preserving Y, pitch, and roll', () => {
		const document = scene();
		const rooms = createLayoutRoomRegistry(layout());
		const members = capturePlanSceneTransformMembers(document, ['chair'])!;
		const start = planSceneWorldPivot(members[0]!, rooms);
		const patches = translatePlanSceneMembers(
			members, rooms, 'chair', start, [start[0] + 0.62, start[1] - 0.38],
			{ snapEnabled: true, bypassSnap: false }
		)!;
		const world = rooms.point('room', patches[0]!.position);
		expect(world[0]).toBeCloseTo(Math.round((start[0] + 0.62) * 4) / 4);
		expect(world[2]).toBeCloseTo(Math.round((start[1] - 0.38) * 4) / 4);
		expect(patches[0]!.position[1]).toBe(1.25);
		expect(patches[0]!.rotation).toEqual([0.2, 0.3, -0.4]);
	});

	it('Shift bypasses translation snap', () => {
		const rooms = createLayoutRoomRegistry(layout());
		const members = capturePlanSceneTransformMembers(scene(), ['chair'])!;
		const start = planSceneWorldPivot(members[0]!, rooms);
		const patch = translatePlanSceneMembers(
			members, rooms, 'chair', start, [start[0] + 0.13, start[1] + 0.17],
			{ snapEnabled: true, bypassSnap: true }
		)![0]!;
		const world = rooms.point('room', patch.position);
		expect(world[0]).toBeCloseTo(start[0] + 0.13);
		expect(world[2]).toBeCloseTo(start[1] + 0.17);
	});

	it('rotates with positive-Y convention and Shift-snaps the yaw delta to 15°', () => {
		const document = scene();
		document.entities.push({
			...document.entities[0]!, id: 'table', position: [4, 2, 4], rotation: [-0.1, -0.2, 0.6]
		});
		const rooms = createLayoutRoomRegistry(layout());
		const members = capturePlanSceneTransformMembers(document, ['table', 'chair'])!;
		const pivot = planSceneWorldPivot(members[1]!, rooms);
		const patches = rotatePlanSceneMembers(
			members, rooms, 'chair', [pivot[0] + 2, pivot[1]], [pivot[0], pivot[1] - 2], true
		)!;
		const chair = patches.find((patch) => patch.id === 'chair')!;
		const table = patches.find((patch) => patch.id === 'table')!;
		expect(chair.rotation).toEqual([0.2, 0.3 + Math.PI / 2, -0.4]);
		expect(table.rotation[0]).toBe(-0.1);
		expect(table.rotation[1]).toBeCloseTo(-0.2 + Math.PI / 2);
		expect(table.rotation[2]).toBe(0.6);
		const tableWorld = planSceneWorldPivot({ roomId: 'room', position: table.position }, rooms);
		expect(tableWorld[0]).toBeCloseTo(pivot[0] - 2);
		expect(tableWorld[1]).toBeCloseTo(pivot[1]);
	});

	it('commits one undoable scene transaction for a completed staging gesture', () => {
		const rooms = createLayoutRoomRegistry(layout());
		const store = createEditorStore({ document: scene(), rooms });
		expect(store.selectionActions.selectRoom('room')).toBe(true);
		expect(store.selectionActions.selectPlacement('chair')).toBe(true);
		const members = capturePlanSceneTransformMembers(store.document, ['chair'])!;
		const start = planSceneWorldPivot(members[0]!, rooms);
		const patch = translatePlanSceneMembers(
			members, rooms, 'chair', start, [start[0] + 1, start[1] + 2],
			{ snapEnabled: false, bypassSnap: false }
		)![0]!;
		const before = JSON.stringify(store.document);

		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'placement');
		const transform = placementTransformFromDocument(store.document.entities[0]!);
		expect(store.updatePlacementTransform('chair', {
			...transform, position: patch.position, rotation: patch.rotation
		})).toBe(true);
		store.setTransformInteractionActive(false);
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.canUndo).toBe(true);
		expect(store.undo()).toBe(true);
		expect(JSON.stringify(store.document)).toBe(before);
	});

	it('restores cancel and creates no history for a no-op gesture', () => {
		const rooms = createLayoutRoomRegistry(layout());
		const store = createEditorStore({ document: scene(), rooms });
		expect(store.selectionActions.selectRoom('room')).toBe(true);
		expect(store.selectionActions.selectPlacement('chair')).toBe(true);
		const before = JSON.stringify(store.document);

		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'placement');
		const transform = placementTransformFromDocument(store.document.entities[0]!);
		transform.position[0] += 5;
		expect(store.updatePlacementTransform('chair', transform)).toBe(true);
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);
		expect(JSON.stringify(store.document)).toBe(before);
		expect(store.canUndo).toBe(false);

		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.commitDocumentTransaction()).toBe(false);
		expect(store.canUndo).toBe(false);
	});
});
