import { describe, expect, it } from 'vitest';
import { createPrimitiveEntity } from '$lib/editor/editor-primitives';
import type { SceneDocument, SceneEntity, SceneModelEntity, SceneObjectCluster } from '$lib/content/scene';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { Asset } from '$lib/types/assets';
import { getAssetById, validateAssetFootprint } from '$lib/content/assets';
import { pointInPlanPolygon } from '$lib/editor/layout/plan-scene-hit';
import { buildPlanSceneFootprintProjection } from '$lib/editor/layout/plan-scene-footprint';
import {
	createLayoutPreviewState,
	previewLayoutRoomUnit
} from '$lib/editor/layout/layout-preview-state.svelte';
import { g1DocumentWithRooms, g1RectangleRoom } from '../../layout/__fixtures__/layout-g1-fixtures';

function sceneWith(entities: SceneEntity[], clusters: SceneObjectCluster[] = []): SceneDocument {
	return {
		textures: [],
		materials: [],
		entities,
		navigationNodes: [],
		connections: [],
		...(clusters.length > 0 ? { clusters } : {})
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

	it('projects cluster members individually without a group outline', () => {
		const members: SceneEntity[] = [
			modelEntity('cluster-model', 'asset-a', { position: [1, 0, 1] }),
			createPrimitiveEntity({
				id: 'cluster-box',
				kind: 'box',
				roomId: 'room-a',
				position: [4, 0, 4],
				dimensions: { width: 1, height: 1, depth: 1 }
			})
		];
		const projection = buildPlanSceneFootprintProjection(
			sceneWith(members, [{
				id: 'cluster-a',
				name: 'Cluster A',
				roomId: 'room-a',
				memberIds: ['cluster-model', 'cluster-box']
			}]),
			createLayoutRoomRegistry(g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 8, 8)])),
			{ assetById: () => asset({ width: 1, depth: 1 }) }
		);

		expect(projection.footprints.map((footprint) => footprint.entityId)).toEqual([
			'cluster-model',
			'cluster-box'
		]);
		expect(projection.footprints.some((footprint) => footprint.entityId === 'cluster-a')).toBe(false);
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

	describe('piano authored outline (P3 pre-brief)', () => {
		const identityRooms = createLayoutRoomRegistry(
			g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 8, 8)])
		);

		it('catalogue piano carries a valid non-rectangular footprint outline', () => {
			const footprint = getAssetById('paris-grand-piano')?.footprint;
			expect(footprint?.outline?.length).toBeGreaterThan(3);
			expect(validateAssetFootprint(footprint)).toBeNull();
			const outline = footprint!.outline!;
			expect(Math.min(...outline.map(([, z]) => z))).toBeCloseTo(-0.84, 6);
			expect(Math.max(...outline.map(([, z]) => z))).toBeCloseTo(0.75, 6);
			expect(Math.max(...outline.map(([x]) => x))).toBeCloseTo(0.74, 6);
		});

		it('projects the piano outline instead of the width/depth rectangle', () => {
			const entity = modelEntity('piano', 'paris-grand-piano', {
				position: [0, 0, 0],
				scale: 1
			});
			const projection = buildPlanSceneFootprintProjection(sceneWith([entity]), identityRooms, {
				assetById: getAssetById
			});
			const points = projection.footprints[0]!.points;
			// 9 outline points (a rectangle fallback would be 4).
			expect(points.length).toBe(9);
			expect(Math.max(...points.map((point) => point[1]))).toBeCloseTo(0.75, 6);
			expect(Math.min(...points.map((point) => point[1]))).toBeCloseTo(-0.84, 6);
			expect(Math.max(...points.map((point) => point[0]))).toBeCloseTo(0.74, 6);
			expect(Math.min(...points.map((point) => point[0]))).toBeCloseTo(-0.74, 6);
		});

		it('retains the width/depth rectangle fallback for assets without an outline', () => {
			const entity = modelEntity('chair', 'paris-salon-chair', { position: [0, 0, 0] });
			const projection = buildPlanSceneFootprintProjection(sceneWith([entity]), identityRooms, {
				assetById: getAssetById
			});
			expect(projection.footprints[0]!.points).toEqual([
				[-0.32, -0.27],
				[0.32, -0.27],
				[0.32, 0.27],
				[-0.32, 0.27]
			]);
		});

		it('rotates the piano outline around the placement pivot under entity yaw', () => {
			const entity = modelEntity('piano', 'paris-grand-piano', {
				position: [0, 0, 0],
				rotation: [0, Math.PI / 2, 0],
				scale: 1
			});
			const projection = buildPlanSceneFootprintProjection(sceneWith([entity]), identityRooms, {
				assetById: getAssetById
			});
			const points = projection.footprints[0]!.points;
			// yaw 90° maps plan (x, z) → (z, -x) up to float noise. The
			// winding-normalized order is not the authored order, so assert the
			// rotated bounds plus two landmark corners.
			const xs = points.map((point) => point[0]);
			const zs = points.map((point) => point[1]);
			expect(Math.min(...xs)).toBeCloseTo(-0.84, 6);
			expect(Math.max(...xs)).toBeCloseTo(0.75, 6);
			expect(Math.min(...zs)).toBeCloseTo(-0.74, 6);
			expect(Math.max(...zs)).toBeCloseTo(0.74, 6);
			// Authored tail center [0, -0.84] → ≈ [-0.84, 0].
			const tail = points.find((point) => Math.abs(point[0] + 0.84) < 1e-9)!;
			expect(tail[1]).toBeCloseTo(0, 6);
			// Authored keyboard corner [-0.74, 0.75] → ≈ [0.75, 0.74].
			const corner = points.find((point) => Math.abs(point[0] - 0.75) < 1e-9)!;
			expect(corner[1]).toBeCloseTo(0.74, 6);
		});

		it('hit containment follows the non-rectangular shape (concave waist)', () => {
			const entity = modelEntity('piano', 'paris-grand-piano', {
				position: [0, 0, 0],
				scale: 1
			});
			const projection = buildPlanSceneFootprintProjection(sceneWith([entity]), identityRooms, {
				assetById: getAssetById
			});
			const points = projection.footprints[0]!.points;
			expect(pointInPlanPolygon([0, 0], points)).toBe(true); // body center
			expect(pointInPlanPolygon([0.7, 0.5], points)).toBe(true); // keyboard band
			expect(pointInPlanPolygon([0.9, 0], points)).toBe(false); // outside
			expect(pointInPlanPolygon([0.66, -0.4], points)).toBe(false); // concave waist gap
		});
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
