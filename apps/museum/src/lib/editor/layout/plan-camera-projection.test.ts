import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { geometryId } from '$lib/layout/layout-geometry-types';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { g2MultipleOpeningsDocument, g2ObjectMatrixDocument, g2SceneNavigationGraph } from '$lib/layout/__fixtures__/layout-g2-fixtures';
import { buildPlanCameraProjection, resolvePlanSceneGraph } from './plan-camera-projection';

describe('buildPlanCameraProjection', () => {
	it('projects camera paths, view cones, look targets, and timing labels', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const projection = buildPlanCameraProjection(g2SceneNavigationGraph(), geometry);

		expect(projection.paths).toEqual([
			{ key: geometryId(['plan', 'camera-path', 'c0']), polyline: [[0, 0], [6, 0]], connectionId: 'c0' },
			{ key: geometryId(['plan', 'camera-path', 'c1']), polyline: [[6, 0], [6, 4]], connectionId: 'c1' },
			{ key: geometryId(['plan', 'camera-path', 'c2']), polyline: [[6, 4], [0, 0]], connectionId: 'c2' }
		]);

		expect(projection.viewCones).toEqual([
			{ key: geometryId(['plan', 'view-cone', 'n0']), origin: [0, 0], target: [3, 0], fovDegrees: 54, nodeId: 'n0' },
			{ key: geometryId(['plan', 'view-cone', 'n1']), origin: [6, 0], target: [6, 2], fovDegrees: 54, nodeId: 'n1' },
			{ key: geometryId(['plan', 'view-cone', 'n2']), origin: [6, 4], target: [3, 4], fovDegrees: 60, nodeId: 'n2' }
		]);

		expect(projection.lookTargets).toEqual([
			{ key: geometryId(['plan', 'look-target', 'n0']), point: [3, 0], nodeId: 'n0' },
			{ key: geometryId(['plan', 'look-target', 'n1']), point: [6, 2], nodeId: 'n1' },
			{ key: geometryId(['plan', 'look-target', 'n2']), point: [3, 4], nodeId: 'n2' }
		]);

		expect(projection.timingLabels).toEqual([
			{ key: geometryId(['plan', 'timing-label', 'c0']), anchor: [3, 0], text: '4s', connectionId: 'c0' },
			{ key: geometryId(['plan', 'timing-label', 'c1']), anchor: [6, 2], text: '4s', connectionId: 'c1' },
			{ key: geometryId(['plan', 'timing-label', 'c2']), anchor: [3, 2], text: '4s', connectionId: 'c2' }
		]);
	});

	it('emits no portal crossings or warnings without inputs', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const projection = buildPlanCameraProjection(g2SceneNavigationGraph(), geometry);
		expect(projection.portalCrossings).toEqual([]);
		expect(projection.collisionWarnings).toEqual([]);
	});

	it('places portal crossings at compiled opening centers', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const projection = buildPlanCameraProjection(g2SceneNavigationGraph(), geometry, {
			portalRelations: [
				{
					roomIds: ['room-openings', 'room-b'],
					openings: [{ roomId: 'room-openings', openingId: 'door-1', segmentId: 'room-openings:wall:0' }]
				}
			]
		});
		expect(projection.portalCrossings).toEqual([
			{ key: geometryId(['plan', 'portal-crossing', 'door-1']), point: [1.45, 0], openingId: 'door-1' }
		]);
	});

	it('places collision warnings at resolvable room, opening, and object targets', () => {
		const openings = compileLayoutGeometry(g2MultipleOpeningsDocument()).geometry;
		const roomAndOpening = buildPlanCameraProjection(g2SceneNavigationGraph(), openings, {
			issues: [
				{ path: 'p', code: 'self_intersection', message: 'm', targetId: 'room-openings' },
				{ path: 'p', code: 'opening_over_height', message: 'm', targetId: 'door-1' },
				{ path: 'p', code: 'object_invalid', message: 'm', targetId: 'missing' }
			]
		});
		expect(roomAndOpening.collisionWarnings).toEqual([
			{ key: geometryId(['plan', 'collision-warning', 'room-openings', 'self_intersection']), point: [5, 2], issueCode: 'self_intersection' },
			{ key: geometryId(['plan', 'collision-warning', 'door-1', 'opening_over_height']), point: [1.45, 0], issueCode: 'opening_over_height' }
		]);

		const objects = compileLayoutGeometry(g2ObjectMatrixDocument()).geometry;
		const objectWarning = buildPlanCameraProjection(g2SceneNavigationGraph(), objects, {
			issues: [{ path: 'p', code: 'object_invalid', message: 'm', targetId: 'obj-box' }]
		});
		expect(objectWarning.collisionWarnings).toEqual([
			{ key: geometryId(['plan', 'collision-warning', 'obj-box', 'object_invalid']), point: [1, 1], issueCode: 'object_invalid' }
		]);
	});
});

describe('resolvePlanSceneGraph', () => {
	it('resolves the canonical project through the shared scene path', () => {
		const graph = resolvePlanSceneGraph(chopinProject);
		expect(graph.navigationNodes).toHaveLength(chopinProject.scene.navigationNodes.length);
		expect(graph.connections).toHaveLength(chopinProject.scene.connections.length);
		expect(graph.nodeById.size).toBe(chopinProject.scene.navigationNodes.length);
		for (const node of graph.navigationNodes) {
			expect(node.position.every(Number.isFinite)).toBe(true);
			expect(node.cameraTarget.every(Number.isFinite)).toBe(true);
		}
	});
});
