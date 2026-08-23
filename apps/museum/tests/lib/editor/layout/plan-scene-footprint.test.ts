import { describe, expect, it } from 'vitest';
import { createPrimitiveEntity } from '$lib/editor/editor-primitives';
import type { SceneDocument, SceneEntity, SceneModelEntity } from '$lib/content/scene';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { Asset } from '$lib/types/assets';
import { buildPlanSceneFootprintProjection } from '$lib/editor/layout/plan-scene-footprint';
import {
	createLayoutPreviewState,
	previewLayoutRoomUnit
} from '$lib/editor/layout/layout-preview-state.svelte';
import { g1DocumentWithRooms, g1RectangleRoom } from '../../layout/__fixtures__/layout-g1-fixtures';

function sceneWith(entities: SceneEntity[]): SceneDocument {
	return {
		textures: [],
		materials: [],
		entities,
		navigationNodes: [],
		connections: []
	};
}

function modelEntity(id: string, assetId: string, overrides: Partial<SceneModelEntity> = {}): SceneModelEntity {
	return {
		kind: 'model',
		id,
		name: id,
		roomId: 'room-a',
		assetId,
		fallback: 'chair',
		position: [1, 7, 2],
		rotation: [0, 0, 0],
		...overrides
	};
}

function testRooms() {
	const room = g1RectangleRoom('room-a', 0, 0, 8, 8);
	room.frame = { origin: [10, 20], yaw: Math.PI / 2 };
	return createLayoutRoomRegistry(g1DocumentWithRooms([room]));
}

function asset(footprint: Asset['footprint'], placementSurface: Asset['placementSurface'] = 'floor') {
	return { footprint, placementSurface } satisfies Pick<Asset, 'footprint' | 'placementSurface'>;
}

describe('buildPlanSceneFootprintProjection', () => {
	it('projects canonical model points through effective scale, entity yaw, translation, and room frame', () => {
		const entity = modelEntity('model-a', 'asset-a', {
			rotation: [0, Math.PI / 2, 0],
			scale: 0.25
		});
		const projection = buildPlanSceneFootprintProjection(
			sceneWith([entity]),
			testRooms(),
			{
				assetById: () => asset({ width: 2, depth: 4 }),
				getEffectiveScale: () => [2, 3, 4]
			}
		);

		expect(projection.footprints).toHaveLength(1);
		expect(projection.footprints[0]).toMatchObject({
			entityId: 'model-a',
			roomId: 'room-a',
			kind: 'model'
		});
		expect(projection.footprints[0]!.points).toEqual([
			[14, 27],
			[10, 27],
			[10, 11],
			[14, 11]
		]);
	});

	it('uses authored outline precedence and normalizes winding without applying asset defaults', () => {
		const entity = modelEntity('model-a', 'asset-a', { position: [0, 0, 0] });
		const projection = buildPlanSceneFootprintProjection(
			sceneWith([entity]),
			createLayoutRoomRegistry(g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 8, 8)])),
			{
				assetById: () => asset({
					width: 99,
					depth: 99,
					outline: [[0, 0], [0, 2], [1, 1], [2, 2], [2, 0]]
				}),
				getEffectiveScale: () => 1
			}
		);

		expect(projection.footprints[0]!.points).toEqual([
			[0, 0],
			[2, 0],
			[2, 2],
			[1, 1],
			[0, 2]
		]);
	});

	it('derives primitive footprints, supports independent X/Z scale, and excludes lights', () => {
		const primitives: SceneEntity[] = [
			createPrimitiveEntity({ id: 'box', kind: 'box', roomId: 'room-a', position: [0, 0, 0], dimensions: { width: 2, height: 1, depth: 4 } }),
			createPrimitiveEntity({ id: 'plane', kind: 'plane', roomId: 'room-a', position: [0, 0, 0], dimensions: { width: 2, height: 4 } }),
			createPrimitiveEntity({ id: 'cylinder', kind: 'cylinder', roomId: 'room-a', position: [0, 0, 0], dimensions: { radius: 1, height: 2 } }),
			createPrimitiveEntity({ id: 'sphere', kind: 'sphere', roomId: 'room-a', position: [0, 0, 0], dimensions: { radius: 1 } }),
			{
				kind: 'light',
				id: 'light',
				name: 'Light',
				roomId: 'room-a',
				light: 'point',
				color: '#fff',
				intensity: 1,
				position: [0, 0, 0],
				rotation: [0, 0, 0],
				castShadow: false
			}
		];
		const projection = buildPlanSceneFootprintProjection(
			sceneWith(primitives),
			createLayoutRoomRegistry(g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 8, 8)])),
			{ getEffectiveScale: () => [2, 1, 4] }
		);

		expect(projection.footprints.map((footprint) => footprint.entityId)).toEqual([
			'box',
			'plane',
			'cylinder',
			'sphere'
		]);
		expect(projection.footprints[0]!.points).toEqual([
			[-2, -8],
			[2, -8],
			[2, 8],
			[-2, 8]
		]);
		expect(projection.footprints[2]!.points[0]).toEqual([2, 0]);
		expect(projection.footprints[2]!.points[8]![0]).toBeCloseTo(0);
		expect(projection.footprints[2]!.points[8]![1]).toBeCloseTo(4);
	});

	it('omits missing, invalid, non-floor, and unknown-room models', () => {
		const entities = [
			modelEntity('missing', 'missing'),
			modelEntity('invalid', 'invalid'),
			modelEntity('wall', 'wall'),
			modelEntity('unknown-room', 'valid', { roomId: 'missing-room' })
		];
		const projection = buildPlanSceneFootprintProjection(
			sceneWith(entities),
			testRooms(),
			{
				assetById: (id) => {
					if (id === 'invalid') return asset({ width: 1, depth: 1, outline: [[0, 0], [1, 1], [0, 1], [1, 0]] });
					if (id === 'wall') return asset({ width: 1, depth: 1 }, 'wall');
					return id === 'valid' ? asset({ width: 1, depth: 1 }) : undefined;
				}
			}
		);

		expect(projection.footprints).toEqual([]);
	});

	it('reprojects footprints after a live room translation and rotation', () => {
		const scene = sceneWith([modelEntity('model-a', 'asset-a', { position: [1, 0, 2] })]);
		const preview = createLayoutPreviewState(
			g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 8, 8)]),
			scene
		);
		const assetById = () => asset({ width: 2, depth: 4 });
		const beforeRooms = createLayoutRoomRegistry(preview.project.layout);
		const before = buildPlanSceneFootprintProjection(scene, beforeRooms, { assetById });
		const beforeVersion = preview.previewVersion;

		const result = previewLayoutRoomUnit(preview, 'room-a', {
			translation: [10, 5],
			yaw: Math.PI / 2
		});

		expect(result).toEqual({ success: true });
		expect(preview.previewVersion).toBeGreaterThan(beforeVersion);
		const afterRooms = createLayoutRoomRegistry(preview.project.layout);
		const after = buildPlanSceneFootprintProjection(scene, afterRooms, { assetById });

		expect(afterRooms.point('room-a', [0, 0, 0])).not.toEqual(beforeRooms.point('room-a', [0, 0, 0]));
		expect(after.footprints[0]!.points).toEqual([
			[10, 13],
			[10, 11],
			[14, 11],
			[14, 13]
		]);
		expect(after.footprints[0]!.points).not.toEqual(before.footprints[0]!.points);
	});
});
