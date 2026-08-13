import { describe, expect, it } from 'vitest';
import { compileLayoutGeometry } from './layout-geometry';
import { buildLayoutPreviewModel } from '$lib/editor/layout/layout-mesh-factory';
import {
	g1AutoBezierDocument,
	g1LShapedDocument,
	g1LineRectangleDocument,
	g1MultipleOpeningsDocument,
	g1ObjectMatrixDocument,
	g1ProfileMatrixDocument
} from './__fixtures__/layout-g1-fixtures';
import { normalizeForParity } from './__fixtures__/layout-g1-normalize';

const FIXTURES = [
	g1LineRectangleDocument,
	g1LShapedDocument,
	g1AutoBezierDocument,
	g1MultipleOpeningsDocument,
	g1ProfileMatrixDocument,
	g1ObjectMatrixDocument
];

describe('G1 parity: compileLayoutGeometry vs editor buildLayoutPreviewModel', () => {
	for (const fixture of FIXTURES) {
		it(`matches the editor preview model for ${fixture.name}`, () => {
			const document = fixture();
			const compiled = compileLayoutGeometry(document).geometry;
			const preview = buildLayoutPreviewModel(document).model;

			expect(compiled.rooms.map((room) => room.roomId)).toEqual(preview.rooms.map((room) => room.roomId));

			for (const [index, compiledRoom] of compiled.rooms.entries()) {
				const previewRoom = preview.rooms[index]!;
				expect(compiledRoom.floorPolygon).toEqual(previewRoom.floorPolygon);
				expect(compiledRoom.ceilingPolygon).toEqual(previewRoom.ceilingPolygon);
				expect(compiledRoom.floorElevation).toBe(previewRoom.floorElevation);
				expect(compiledRoom.ceilingElevation).toBe(previewRoom.ceilingElevation);
				expect(compiledRoom.walls.map((wall) => wall.segmentId)).toEqual(previewRoom.walls.map((wall) => wall.segmentId));
				for (const [wallIndex, compiledWall] of compiledRoom.walls.entries()) {
					const previewWall = previewRoom.walls[wallIndex]!;
					expect(compiledWall.length).toBe(previewWall.length);
					expect(normalizeForParity(compiledWall.samples)).toEqual(normalizeForParity(previewWall.samples));
					expect(normalizeForParity(compiledWall.sections)).toEqual(normalizeForParity(previewWall.sections));
				}
			}

			expect(normalizeForParity(compiled.objects)).toEqual(normalizeForParity(preview.objects));
			expect(normalizeForParity(compiled.bounds)).toEqual(normalizeForParity(buildLayoutPreviewModel(document).bounds));
		});
	}
});
