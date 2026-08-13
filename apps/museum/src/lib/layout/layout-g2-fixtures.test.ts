import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { getCameraMotionOptions, getGuidedCameraRoute } from '$lib/museum/navigation/camera-route';
import type { Vector3Like } from '$lib/museum/navigation/camera-motion';

function vectorToTuple(point: Vector3Like): [number, number, number] {
	return 'x' in point ? [point.x, point.y, point.z] : [point[0], point[1], point[2]];
}
import { geometryId } from './layout-geometry-types';
import { compileLayoutGeometry } from './layout-geometry';
import {
	buildG2ReferencePlanModel,
	compileG2Fixture,
	g2AutoBezierDocument,
	g2InvalidGeometryDocument,
	g2LineRectangleDocument,
	g2LShapedDocument,
	g2MultipleOpeningsDocument,
	g2ObjectMatrixDocument,
	g2ProfileMatrixDocument,
	g2SceneNavigationGraph,
	G2_COMMITTED_LAYERS,
	G2_LAYER_ORDER,
	resolveG2ReferenceHit,
	type G2ReferencePrimitive
} from './__fixtures__/layout-g2-fixtures';

function byLayer(model: G2ReferencePrimitive[]): Map<number, G2ReferencePrimitive[]> {
	const layers = new Map<number, G2ReferencePrimitive[]>();
	for (const primitive of model) {
		const list = layers.get(primitive.layer) ?? [];
		list.push(primitive);
		layers.set(primitive.layer, list);
	}
	return layers;
}

describe('G2 render-order freeze', () => {
	it('locks the twelve-layer back-to-front order', () => {
		expect(G2_LAYER_ORDER.map((layer) => layer.name)).toEqual([
			'fills',
			'strokes',
			'walls',
			'openings',
			'objects',
			'camera-paths',
			'view-cones-look-targets',
			'portal-crossings-collision-warnings',
			'timing-labels',
			'selection-overlays',
			'interaction-handles',
			'labels'
		]);
		expect(G2_LAYER_ORDER.map((layer) => layer.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
		expect([...G2_COMMITTED_LAYERS]).toEqual([1, 2, 3, 4, 5]);
	});

	it('decomposes a line rectangle into fills, strokes, and wall polylines', () => {
		const { geometry } = compileG2Fixture(g2LineRectangleDocument());
		const model = buildG2ReferencePlanModel(geometry);
		const layers = byLayer(model);

		expect([...layers.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
		const room = geometry.rooms[0]!;

		// Layer 1: one fill, points taken verbatim from the compiled floor polygon.
		const fills = layers.get(1)!;
		expect(fills).toHaveLength(1);
		expect(fills[0]!.key).toBe(geometryId(['plan', 'fill', 'floor-ground', 'room-rectangle']));
		expect(fills[0]!.points).toEqual(room.floorPolygon);
		expect(fills[0]!.hit).toEqual({ kind: 'room', roomId: 'room-rectangle' });

		// Layer 2: one stroke sharing the same polygon.
		const strokes = layers.get(2)!;
		expect(strokes).toHaveLength(1);
		expect(strokes[0]!.key).toBe(geometryId(['plan', 'stroke', 'floor-ground', 'room-rectangle']));
		expect(strokes[0]!.points).toEqual(room.floorPolygon);

		// Layer 3: one polyline per opening-free centerline span (four clean walls).
		const walls = layers.get(3)!;
		expect(walls).toHaveLength(room.walls.reduce((sum, wall) => sum + wall.solidCenterlinePolylines.length, 0));
		expect(walls.map((primitive) => primitive.hit)).toEqual(
			room.walls.map((wall) => ({ kind: 'wall', roomId: 'room-rectangle', segmentId: wall.segmentId }))
		);
		expect(walls.every((primitive) => primitive.style === 'wall-line')).toBe(true);
	});

	it('splits openings into their own layer above walls', () => {
		const { geometry } = compileG2Fixture(g2MultipleOpeningsDocument());
		const model = buildG2ReferencePlanModel(geometry);
		const layers = byLayer(model);
		const room = geometry.rooms[0]!;

		const expectedOpenings = room.walls.flatMap((wall) => wall.openings);
		expect(layers.get(4)!.map((primitive) => primitive.hit)).toEqual(
			expectedOpenings.map((opening) => ({
				kind: 'opening',
				roomId: 'room-openings',
				segmentId: opening.segmentId,
				openingId: opening.openingId
			}))
		);
		for (const primitive of layers.get(4)!) {
			const opening = expectedOpenings.find((candidate) => {
				const hit = primitive.hit;
				return hit.kind === 'opening' && hit.openingId === candidate.openingId;
			})!;
			expect(primitive.points).toEqual(opening.centerPolyline);
		}
		// Wall layer sits below openings in the order.
		expect(layers.get(3)!.length).toBeGreaterThan(layers.get(4)!.length);
	});

	it('preserves all opening profiles in the openings layer', () => {
		const { geometry } = compileG2Fixture(g2ProfileMatrixDocument());
		const layers = byLayer(buildG2ReferencePlanModel(geometry));
		const openings = layers.get(4)!;
		expect(openings).toHaveLength(3);
		expect(openings.map((primitive) => (primitive.hit.kind === 'opening' ? primitive.hit.openingId : null))).toEqual([
			'rect',
			'rounded',
			'pointed'
		]);
	});

	it('emits one footprint primitive per compiled object', () => {
		const { geometry } = compileG2Fixture(g2ObjectMatrixDocument());
		const layers = byLayer(buildG2ReferencePlanModel(geometry));
		const objects = layers.get(5)!;
		expect(objects).toHaveLength(geometry.objects.length);
		for (const primitive of objects) {
			expect(primitive.hit.kind).toBe('object');
			const object = geometry.objects.find((candidate) => candidate.objectId === (primitive.hit as { objectId: string }).objectId)!;
			expect(primitive.points).toEqual(object.planFootprint);
		}
	});

	it('keeps document order across rooms for the canonical project', () => {
		const { geometry } = compileLayoutGeometry(chopinProject.layout);
		const model = buildG2ReferencePlanModel(geometry);
		const layers = byLayer(model);
		expect(layers.get(1)!.map((primitive) => (primitive.hit.kind === 'room' ? primitive.hit.roomId : null))).toEqual(
			geometry.rooms.map((room) => room.roomId)
		);
		expect(layers.get(2)!.map((primitive) => (primitive.hit.kind === 'room' ? primitive.hit.roomId : null))).toEqual(
			geometry.rooms.map((room) => room.roomId)
		);
	});

	it('omits invalid rooms from every committed layer', () => {
		const { geometry } = compileG2Fixture(g2InvalidGeometryDocument());
		const model = buildG2ReferencePlanModel(geometry);
		expect(geometry.rooms.map((room) => room.roomId)).toEqual(['room-good']);
		for (const primitive of model) {
			const hit = primitive.hit;
			if (hit.kind === 'room' || hit.kind === 'wall' || hit.kind === 'opening') {
				expect(hit.roomId).toBe('room-good');
			}
		}
		// L-shape sanity: six walls, six vertices-worth of geometry preserved.
		const lShaped = compileG2Fixture(g2LShapedDocument());
		const lWalls = byLayer(buildG2ReferencePlanModel(lShaped.geometry)).get(3)!;
		expect(lWalls).toHaveLength(6);
	});

	it('produces unique stable keys within every layer', () => {
		const { geometry } = compileG2Fixture(g2AutoBezierDocument());
		const model = buildG2ReferencePlanModel(geometry);
		const layers = byLayer(model);
		for (const primitives of layers.values()) {
			expect(new Set(primitives.map((primitive) => primitive.key)).size).toBe(primitives.length);
		}
	});
});

describe('G2 hit-priority freeze', () => {
	const TOL = 0.25;

	it('resolves a vertex at an exact corner', () => {
		const { geometry } = compileG2Fixture(g2LineRectangleDocument());
		expect(resolveG2ReferenceHit(geometry, [0, 0], TOL)).toEqual({
			kind: 'vertex',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			vertexIndex: 0
		});
	});

	it('prefers a vertex over a wall when both are within tolerance', () => {
		const { geometry } = compileG2Fixture(g2LineRectangleDocument());
		// (0, 0.01) is on wall:3 and within tolerance of vertex (0, 0).
		expect(resolveG2ReferenceHit(geometry, [0, 0.01], TOL)).toMatchObject({ kind: 'vertex' });
	});

	it('resolves an interior anchor on an auto-bezier wall', () => {
		const { geometry } = compileG2Fixture(g2AutoBezierDocument());
		expect(resolveG2ReferenceHit(geometry, [3, -1], 0.3)).toEqual({
			kind: 'interiorAnchor',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			anchorId: 'room-rectangle:wall:0:anchor:1'
		});
	});

	it('prefers an opening over the wall it sits on', () => {
		const { geometry } = compileG2Fixture(g2MultipleOpeningsDocument());
		// door-1 spans offset [1, 1.9] on wall:0 (z = 0).
		expect(resolveG2ReferenceHit(geometry, [1.45, 0.05], TOL)).toEqual({
			kind: 'opening',
			roomId: 'room-openings',
			segmentId: 'room-openings:wall:0',
			openingId: 'door-1'
		});
	});

	it('prefers an object over the room containing it', () => {
		const { geometry } = compileG2Fixture(g2ObjectMatrixDocument());
		expect(resolveG2ReferenceHit(geometry, [1, 1], TOL)).toEqual({ kind: 'object', objectId: 'obj-box' });
	});

	it('resolves a wall at a mid-span point', () => {
		const { geometry } = compileG2Fixture(g2LineRectangleDocument());
		expect(resolveG2ReferenceHit(geometry, [3, 0.05], TOL)).toEqual({
			kind: 'wall',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0'
		});
	});

	it('falls back to the containing room', () => {
		const { geometry } = compileG2Fixture(g2LineRectangleDocument());
		expect(resolveG2ReferenceHit(geometry, [3, 2], TOL)).toEqual({ kind: 'room', roomId: 'room-rectangle' });
	});

	it('returns null outside all geometry', () => {
		const { geometry } = compileG2Fixture(g2LineRectangleDocument());
		expect(resolveG2ReferenceHit(geometry, [100, 100], TOL)).toBeNull();
	});
});

describe('G2 camera-projection scene fixture', () => {
	it('resolves the guided cycle and flattens to the expected 2D polyline', () => {
		const graph = g2SceneNavigationGraph();
		const route = getGuidedCameraRoute('n0', graph);
		expect(route.nodeIds).toEqual(['n0', 'n1', 'n2', 'n0']);
		const positions = route.positionParts.flatMap((part) => {
			const points = part.kind === 'rounded-polyline' ? part.points : part.anchors;
			return points.map(vectorToTuple);
		});
		expect(positions.map(([x, , z]) => [x, z])).toEqual([
			[0, 0],
			[6, 0],
			[6, 4],
			[0, 0]
		]);
	});

	it('exposes per-direction timing for connection labels', () => {
		const graph = g2SceneNavigationGraph();
		const connection = graph.connections.find((candidate) => candidate.id === 'c0')!;
		expect(getCameraMotionOptions(connection, 'forward')).toEqual({ durationSeconds: 4, easing: 'smoothstep' });
		expect(getCameraMotionOptions(connection, 'reverse')).toEqual({ durationSeconds: 4, easing: 'smoothstep' });
	});
});
