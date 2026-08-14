import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import type { LayoutVec2 } from '$lib/layout/layout-types';
import type { PlanRenderPrimitive, PlanRenderModel, PlanSelection } from '$lib/layout/plan-render-model';
import { buildPlanRenderModel } from '$lib/layout/plan-render-model';
import { g1DocumentWithRooms, g1LineSegments, g1RoomDefaults } from './__fixtures__/layout-g1-fixtures';
import {
	buildG2ReferencePlanModel,
	g2AutoBezierDocument,
	g2ElevatedFloorDocument,
	g2InvalidGeometryDocument,
	g2LineRectangleDocument,
	g2LShapedDocument,
	g2MultipleOpeningsDocument,
	g2ObjectMatrixDocument,
	g2ProfileMatrixDocument
} from './__fixtures__/layout-g2-fixtures';
import { normalizeForParity } from './__fixtures__/layout-g1-normalize';

function pointsOf(primitive: PlanRenderPrimitive): LayoutVec2[] {
	if (primitive.kind === 'polygon' || primitive.kind === 'polyline') return primitive.points;
	if (primitive.kind === 'circle') return [primitive.center];
	return [primitive.anchor];
}

function hitOf(primitive: PlanRenderPrimitive) {
	return primitive.kind === 'text' ? undefined : primitive.hit;
}

/** Flatten committed layers 1–5 into the reference shape for parity. */
function committedProjection(model: PlanRenderModel) {
	return model.layers
		.filter((layer) => layer.order <= 5)
		.flatMap((layer) =>
			layer.primitives.map((primitive) => ({
				layer: layer.order,
				kind: primitive.kind,
				key: primitive.key,
				style: primitive.style,
				points: pointsOf(primitive),
				hit: hitOf(primitive)
			}))
		);
}

const FIXTURES = [
	['line-rectangle', g2LineRectangleDocument],
	['l-shape', g2LShapedDocument],
	['auto-bezier', g2AutoBezierDocument],
	['multiple-openings', g2MultipleOpeningsDocument],
	['profiles', g2ProfileMatrixDocument],
	['objects', g2ObjectMatrixDocument],
	['elevated-floor', g2ElevatedFloorDocument],
	['invalid-geometry', g2InvalidGeometryDocument]
] as const;

describe('buildPlanRenderModel', () => {
	it('always returns all twelve layers in back-to-front order', () => {
		const { geometry } = compileLayoutGeometry(g2LineRectangleDocument());
		const model = buildPlanRenderModel(geometry);
		expect(model.layers.map((layer) => layer.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});

	it('matches the frozen reference projection for every fixture', () => {
		for (const [name, documentFactory] of FIXTURES) {
			const { geometry } = compileLayoutGeometry(documentFactory());
			const model = buildPlanRenderModel(geometry);
			expect(committedProjection(model), name).toEqual(buildG2ReferencePlanModel(geometry));
		}
	});

	it('matches the frozen reference for the canonical Chopin project', () => {
		const { geometry } = compileLayoutGeometry(chopinProject.layout);
		expect(committedProjection(buildPlanRenderModel(geometry))).toEqual(buildG2ReferencePlanModel(geometry));
	});

	it('derives plan bounds from compiled document bounds (XZ)', () => {
		const { geometry } = compileLayoutGeometry(g2LineRectangleDocument());
		const model = buildPlanRenderModel(geometry);
		const compiledBounds = geometry.bounds!;
		expect(model.bounds).toEqual({
			min: [compiledBounds.min[0], compiledBounds.min[2]],
			max: [compiledBounds.max[0], compiledBounds.max[2]]
		});
	});

	it('returns null bounds for empty compiled geometry', () => {
		const { geometry } = compileLayoutGeometry({ formatVersion: 3, units: 'meters', floors: [], objects: [] });
		expect(buildPlanRenderModel(geometry).bounds).toBeNull();
	});

	it('slots camera projection records into layers 6–9', () => {
		const { geometry } = compileLayoutGeometry(g2LineRectangleDocument());
		const model = buildPlanRenderModel(geometry, {
			paths: [{ key: 'p0', polyline: [[0, 0], [1, 1]] }],
			viewCones: [{ key: 'c0', origin: [0, 0], target: [4, 0], fovDegrees: 60, nodeId: 'n0' }],
			lookTargets: [{ key: 't0', point: [4, 0], nodeId: 'n0' }],
			portalCrossings: [{ key: 'x0', point: [2, 0], openingId: 'door' }],
			collisionWarnings: [{ key: 'w0', point: [2, 1], issueCode: 'self_intersection' }],
			timingLabels: [{ key: 'l0', anchor: [1, 0], text: '4s', connectionId: 'c0' }]
		});
		const byOrder = new Map(model.layers.map((layer) => [layer.order, layer.primitives]));

		expect(byOrder.get(6)!.map((primitive) => primitive.style)).toEqual(['camera-path']);
		expect(byOrder.get(7)!.map((primitive) => primitive.style)).toEqual(['view-cone', 'look-target']);
		expect(byOrder.get(8)!.map((primitive) => primitive.style)).toEqual(['portal-crossing', 'collision-warning']);
		expect(byOrder.get(9)!.map((primitive) => primitive.style)).toEqual(['timing-label']);

		const cone = byOrder.get(7)![0]!;
		expect(cone.kind).toBe('polygon');
		if (cone.kind === 'polygon') {
			expect(cone.points[0]).toEqual([0, 0]);
			expect(cone.points).toHaveLength(1 + 8 + 1);
		}
	});

	it('slots interaction projections into layers 10–12 without touching committed layers', () => {
		const { geometry } = compileLayoutGeometry(g2LineRectangleDocument());
		const committedBefore = committedProjection(buildPlanRenderModel(geometry));
		const model = buildPlanRenderModel(geometry, undefined, {
			selection: [{ kind: 'polygon', key: 's0', points: [[0, 0], [1, 0], [1, 1]], style: 'selection-bounds' }],
			handles: [{ kind: 'circle', key: 'h0', center: [0, 0], radiusPx: 6, style: 'vertex-handle' }],
			drafts: [{ kind: 'polyline', key: 'd0', points: [[0, 0], [2, 2]], style: 'draft-outline' }],
			labels: [{ kind: 'text', key: 'l0', anchor: [0, 0], text: 'x', style: 'dimension-label' }]
		});
		const byOrder = new Map(model.layers.map((layer) => [layer.order, layer.primitives]));
		expect(byOrder.get(10)!.map((primitive) => primitive.style)).toEqual(['selection-bounds']);
		expect(byOrder.get(11)!.map((primitive) => primitive.style)).toEqual(['vertex-handle', 'draft-outline']);
		expect(byOrder.get(12)!.map((primitive) => primitive.style)).toEqual(['dimension-label']);
		expect(committedProjection(model)).toEqual(committedBefore);
	});

	it('is deterministic and non-mutating over a deep-frozen document', () => {
		const document = g2AutoBezierDocument();
		const frozen = Object.freeze(JSON.parse(JSON.stringify(document)));
		const first = buildPlanRenderModel(compileLayoutGeometry(frozen as never).geometry);
		const second = buildPlanRenderModel(compileLayoutGeometry(frozen as never).geometry);
		expect(normalizeForParity(first)).toEqual(normalizeForParity(second));
	});
});

describe('buildPlanRenderModel selection styling', () => {
	const interactionWith = (selected: PlanSelection) => ({
		selected,
		selection: [],
		handles: [],
		drafts: [],
		labels: []
	});

	it('promotes the selected room fill and outline to -selected tokens', () => {
		const { geometry } = compileLayoutGeometry(g2LineRectangleDocument());
		const model = buildPlanRenderModel(geometry, undefined, interactionWith({ kind: 'room', roomId: 'room-rectangle' }));
		expect(model.layers[0]!.primitives.map((primitive) => primitive.style)).toEqual(['room-fill-selected']);
		expect(model.layers[1]!.primitives.map((primitive) => primitive.style)).toEqual(['room-outline-selected']);
	});

	it('qualifies wall selection by roomId + segmentId', () => {
		const { geometry } = compileLayoutGeometry(g2LineRectangleDocument());
		const build = (selected: PlanSelection) => buildPlanRenderModel(geometry, undefined, interactionWith(selected));

		const selected = build({ kind: 'wall', roomId: 'room-rectangle', segmentId: 'room-rectangle:wall:0' });
		expect(selected.layers[2]!.primitives.filter((primitive) => primitive.style === 'wall-line-selected')).toHaveLength(1);

		const wrongRoom = build({ kind: 'wall', roomId: 'other-room', segmentId: 'room-rectangle:wall:0' });
		expect(wrongRoom.layers[2]!.primitives.filter((primitive) => primitive.style.includes('selected'))).toHaveLength(0);
	});

	it('highlights only the matching wall and opening for an opening selection', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const build = (selected: PlanSelection) => buildPlanRenderModel(geometry, undefined, interactionWith(selected));

		const model = build({ kind: 'opening', roomId: 'room-openings', segmentId: 'room-openings:wall:0', openingId: 'door-1' });
		expect(model.layers[3]!.primitives.filter((primitive) => primitive.style === 'opening-line-selected')).toHaveLength(1);
		// Wall spans on the matched segment are highlighted (multiple solid spans split by openings).
		expect(model.layers[2]!.primitives.filter((primitive) => primitive.style === 'wall-line-opening-selected').length).toBeGreaterThan(0);

		const wrongRoom = build({ kind: 'opening', roomId: 'other-room', segmentId: 'room-openings:wall:0', openingId: 'door-1' });
		expect(wrongRoom.layers[3]!.primitives.filter((primitive) => primitive.style.includes('selected'))).toHaveLength(0);
		expect(wrongRoom.layers[2]!.primitives.filter((primitive) => primitive.style.includes('selected'))).toHaveLength(0);
	});

	it('qualifies object selection, including readonly profiles', () => {
		const { geometry } = compileLayoutGeometry(g2ObjectMatrixDocument());
		const build = (selected: PlanSelection) => buildPlanRenderModel(geometry, undefined, interactionWith(selected));

		const box = build({ kind: 'object', objectId: 'obj-box' });
		expect(box.layers[4]!.primitives.find((primitive) => primitive.style === 'layout-object-selected')).toMatchObject({
			hit: { kind: 'object', objectId: 'obj-box' }
		});

		const profile = build({ kind: 'object', objectId: 'obj-profile' });
		expect(profile.layers[4]!.primitives.find((primitive) => primitive.style === 'layout-object-readonly-selected')).toMatchObject({
			hit: { kind: 'object', objectId: 'obj-profile' }
		});
	});

	it('does not highlight a wall in another room reusing the same segment id', () => {
		const roomA = { ...g1RoomDefaults('room-a'), boundary: { closed: true as const, segments: g1LineSegments([[0, 0], [4, 0], [4, 4], [0, 4]], 'wall') } };
		const roomB = { ...g1RoomDefaults('room-b'), boundary: { closed: true as const, segments: g1LineSegments([[10, 0], [14, 0], [14, 4], [10, 4]], 'wall') } };
		const { geometry } = compileLayoutGeometry(g1DocumentWithRooms([roomA, roomB]));

		const model = buildPlanRenderModel(geometry, undefined, interactionWith({ kind: 'wall', roomId: 'room-b', segmentId: 'wall:0' }));
		const selected = model.layers[2]!.primitives.filter((primitive) => primitive.style === 'wall-line-selected');
		expect(selected).toHaveLength(1);
		expect(selected[0]).toMatchObject({ hit: { kind: 'wall', roomId: 'room-b', segmentId: 'wall:0' } });
	});
});
