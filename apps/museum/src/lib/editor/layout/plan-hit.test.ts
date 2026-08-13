import { describe, expect, it } from 'vitest';
import type { LayoutDocument } from '$lib/layout/layout-types';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import {
	g2AutoBezierDocument,
	g2LineRectangleDocument,
	g2LShapedDocument,
	g2MultipleOpeningsDocument,
	g2ObjectMatrixDocument,
	g2ProfileMatrixDocument,
	resolveG2ReferenceHit
} from '$lib/layout/__fixtures__/layout-g2-fixtures';
import { compiledWallLength, findPlanHitRoom, projectPointToWall, resolvePlanHit, type PlanHitResult } from './plan-hit';

function stripProjection(result: PlanHitResult) {
	if (result && (result.kind === 'opening' || result.kind === 'wall')) {
		const { projection: _projection, ...rest } = result;
		return rest;
	}
	return result;
}

function assertParity(document: LayoutDocument, tolerance: number, step = 0.5): void {
	const { geometry } = compileLayoutGeometry(document);
	const bounds = geometry.bounds;
	if (!bounds) return;
	const startX = Math.floor(bounds.min[0] / step) * step;
	const endX = Math.ceil(bounds.max[0] / step) * step;
	const startZ = Math.floor(bounds.min[2] / step) * step;
	const endZ = Math.ceil(bounds.max[2] / step) * step;
	for (let x = startX; x <= endX; x += step) {
		for (let z = startZ; z <= endZ; z += step) {
			const point: [number, number] = [x, z];
			expect(stripProjection(resolvePlanHit(geometry.queries, point, tolerance))).toEqual(
				resolveG2ReferenceHit(geometry, point, tolerance)
			);
		}
	}
}

describe('plan-hit', () => {
	it('matches the frozen hit goldens across every fixture', () => {
		assertParity(g2LineRectangleDocument(), 0.25);
		assertParity(g2LShapedDocument(), 0.25);
		assertParity(g2AutoBezierDocument(), 0.3);
		assertParity(g2MultipleOpeningsDocument(), 0.25);
		assertParity(g2ProfileMatrixDocument(), 0.25);
		assertParity(g2ObjectMatrixDocument(), 0.25);
	});

	it('exposes the locked priority targets with projection data', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const queries = geometry.queries;

		expect(resolvePlanHit(queries, [0, 0], 0.25)).toEqual({
			kind: 'vertex',
			roomId: 'room-openings',
			segmentId: 'room-openings:wall:0',
			vertexIndex: 0
		});

		const opening = resolvePlanHit(queries, [1.45, 0.05], 0.25);
		expect(opening).toMatchObject({
			kind: 'opening',
			roomId: 'room-openings',
			segmentId: 'room-openings:wall:0',
			openingId: 'door-1'
		});
		expect(opening?.kind === 'opening' && opening.projection.offset).toBeCloseTo(1.45, 6);

		const wall = resolvePlanHit(queries, [7, 0.05], 0.25);
		expect(wall).toMatchObject({ kind: 'wall', roomId: 'room-openings', segmentId: 'room-openings:wall:0' });
		expect(wall?.kind === 'wall' && wall.projection.point).toEqual([7, 0]);
	});

	it('restricts room hits to allowed room ids', () => {
		const { geometry } = compileLayoutGeometry(g2LineRectangleDocument());
		expect(resolvePlanHit(geometry.queries, [3, 2], 0.25)).toEqual({ kind: 'room', roomId: 'room-rectangle' });
		expect(
			resolvePlanHit(geometry.queries, [3, 2], 0.25, { allowedRoomIds: new Set(['room-other']) })
		).toBeNull();
	});

	it('findPlanHitRoom resolves containment regardless of wall priority', () => {
		const { geometry } = compileLayoutGeometry(g2LineRectangleDocument());
		// Inside the room but within the selection hit tolerance of the left wall.
		expect(findPlanHitRoom(geometry.queries, [0.05, 2])).toEqual({ roomId: 'room-rectangle' });
		// The selection hit at the same point is a wall, not a room — the two must
		// differ so primitive placement is not blocked by wall proximity.
		expect(resolvePlanHit(geometry.queries, [0.05, 2], 0.25)).toMatchObject({ kind: 'wall' });

		expect(findPlanHitRoom(geometry.queries, [3, 2], { allowedRoomIds: new Set(['room-other']) })).toBeNull();
		expect(findPlanHitRoom(geometry.queries, [99, 99])).toBeNull();
	});

	it('projects onto a wall segment and reports its compiled length', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const queries = geometry.queries;
		const projection = projectPointToWall(queries, 'room-openings', 'room-openings:wall:0', [1.45, 0.05])!;
		expect(projection.offset).toBeCloseTo(1.45, 6);
		expect(projection.point).toEqual([1.45, 0]);
		expect(projection.distance).toBeCloseTo(0.05, 6);
		expect(compiledWallLength(queries, 'room-openings', 'room-openings:wall:0')).toBeCloseTo(10, 6);
		expect(compiledWallLength(queries, 'room-openings', 'missing-wall')).toBe(0);
	});
});
