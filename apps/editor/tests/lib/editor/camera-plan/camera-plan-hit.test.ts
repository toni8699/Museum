import { describe, expect, it } from 'vitest';
import type { SceneDocument } from '$lib/content/scene';
import { g1DocumentWithRooms, g1RectangleRoom } from '../../layout/__fixtures__/layout-g1-fixtures';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import { buildPlanCameraAuthoringProjection } from '$lib/editor/layout/plan-camera-projection';
import {
	nearestPolylineProgress,
	pointToPolylineDistance,
	pointToSegmentDistance,
	resolveCameraPlanHit
} from '$lib/editor/camera-plan/camera-plan-hit';

function authoringDocument(): SceneDocument {
	return {
		textures: [],
		materials: [],
		entities: [],
		navigationNodes: [
			{
				id: 'n-a',
				roomId: 'room-a',
				label: 'A',
				position: [0, 1.6, 0],
				cameraTarget: [3, 1.2, 0],
				fov: 54,
				connectedNodeIds: ['n-b']
			},
			{
				id: 'n-b',
				roomId: 'room-a',
				label: 'B',
				position: [6, 1.6, 0],
				cameraTarget: [3, 1.2, 0],
				fov: 54,
				connectedNodeIds: ['n-a', 'n-c']
			},
			{
				id: 'n-c',
				roomId: 'room-a',
				label: 'C',
				position: [6, 1.6, 4],
				cameraTarget: [3, 1.2, 4],
				fov: 54,
				connectedNodeIds: ['n-b']
			}
		],
		connections: [
			{
				id: 'c-ab',
				fromNodeId: 'n-a',
				toNodeId: 'n-b',
				clearance: 0.35,
				positionPath: { kind: 'auto-bezier', anchors: [] }
			},
			{
				id: 'c-bc',
				fromNodeId: 'n-b',
				toNodeId: 'n-c',
				clearance: 0.35,
				positionPath: {
					kind: 'rounded-polyline',
					anchors: [{ id: 'c-bc-anchor-01', position: [6, 1.6, 2] }]
				}
			}
		]
	};
}

function projection(options: {
	selection?: NonNullable<Parameters<typeof buildPlanCameraAuthoringProjection>[2]>['selection'];
} = {}) {
	return buildPlanCameraAuthoringProjection(
		authoringDocument(),
		createLayoutRoomRegistry(g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 6, 4)])),
		{ selection: options.selection }
	).authoring!;
}

describe('pointToSegmentDistance / pointToPolylineDistance', () => {
	it('measures perpendicular distance and clamps to segment endpoints', () => {
		expect(pointToSegmentDistance([0, 0], [6, 0], [3, 0.25])).toBeCloseTo(0.25, 9);
		expect(pointToSegmentDistance([0, 0], [6, 0], [-1, 0.5])).toBeCloseTo(Math.hypot(1, 0.5), 9);
		expect(pointToPolylineDistance([[0, 0], [6, 0]], [3, 2])).toBeCloseTo(2, 9);
		expect(pointToPolylineDistance([], [0, 0])).toBe(Number.POSITIVE_INFINITY);
	});

	it('reports normalized nearest-progress for insertion', () => {
		expect(nearestPolylineProgress([[0, 0], [6, 0]], [3, 0.5])).toBeCloseTo(0.5, 9);
		expect(nearestPolylineProgress([[0, 0], [6, 0]], [-2, 0])).toBeCloseTo(0, 9);
		expect(nearestPolylineProgress([[0, 0], [6, 0]], [9, 0])).toBeCloseTo(1, 9);
	});
});

describe('resolveCameraPlanHit', () => {
	it('hits nodes, then anchors, then edges, then empty backdrop', () => {
		const authoring = projection({ selection: { kind: 'connection', connectionId: 'c-bc' } });
		// node priority at the edge's own endpoint.
		expect(resolveCameraPlanHit(authoring, [6.05, 0.05], 50)).toEqual({ kind: 'node', nodeId: 'n-b' });
		// interior anchor of the relevant connection.
		expect(resolveCameraPlanHit(authoring, [6.02, 2], 50)).toEqual({
			kind: 'anchor',
			connectionId: 'c-bc',
			anchorId: 'c-bc-anchor-01'
		});
		// edge mid-span.
		expect(resolveCameraPlanHit(authoring, [3, 0.08], 50)).toEqual({ kind: 'edge', connectionId: 'c-ab' });
		// empty backdrop (inside the room but no camera content).
		expect(resolveCameraPlanHit(authoring, [2, 2], 50)).toBeNull();
	});

	it('keeps priority node → anchor → edge stable across zoom levels', () => {
		const authoring = projection({ selection: { kind: 'connection', connectionId: 'c-bc' } });
		// same world offset (≈1 px at 50 ppm, ≈4 px at 200 ppm) stays a node hit.
		for (const pixelsPerMeter of [25, 50, 200]) {
			expect(resolveCameraPlanHit(authoring, [0.02, 0.02], pixelsPerMeter)).toEqual({
				kind: 'node',
				nodeId: 'n-a'
			});
		}
		// edge hit stays within a fixed screen tolerance at every zoom
		// (0.02 m = 4 px at 200 ppm, 1 px at 50 ppm, 0.5 px at 25 ppm).
		for (const pixelsPerMeter of [25, 50, 200]) {
			expect(resolveCameraPlanHit(authoring, [3, 0.02], pixelsPerMeter)).toEqual({
				kind: 'edge',
				connectionId: 'c-ab'
			});
		}
	});

	it('does not expose anchors when no connection is relevant', () => {
		const authoring = projection();
		expect(authoring.anchors).toEqual([]);
		expect(resolveCameraPlanHit(authoring, [6.02, 2], 50)).toEqual({
			kind: 'edge',
			connectionId: 'c-bc'
		});
	});

	it('resolves a node over a nearby edge (priority, not nearest)', () => {
		const authoring = projection();
		// c-ab runs along z=0; a point 0.05 from the node and 0.05 from the edge
		// must resolve to the node.
		expect(resolveCameraPlanHit(authoring, [0.05, 0.05], 50)).toEqual({
			kind: 'node',
			nodeId: 'n-a'
		});
	});
});
