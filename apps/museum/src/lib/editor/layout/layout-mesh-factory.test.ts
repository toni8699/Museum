import { describe, expect, it } from 'vitest';

import { createA1CorridorDocument, createA1RectangleDocument } from './layout-a1-fixtures';
import { buildLayoutPreviewModel } from './layout-mesh-factory';
import { roomsToLayout } from './rooms-to-layout';

describe('A1 layout preview model', () => {
	it('builds floor, ceiling, and four wall previews for a rectangle', () => {
		const result = buildLayoutPreviewModel(createA1RectangleDocument());
		expect(result.issues).toEqual([]);
		expect(result.model.rooms).toHaveLength(1);
		expect(result.model.rooms[0]).toMatchObject({
			roomId: 'room-rectangle',
			floorPolygon: [
				[0, 0],
				[6, 0],
				[6, 4],
				[0, 4]
			]
		});
		expect(result.model.rooms[0]!.ceilingPolygon).toEqual(result.model.rooms[0]!.floorPolygon);
		expect(result.model.rooms[0]!.walls).toHaveLength(4);
	});

	it('builds two corridor cutouts as wall side/lintel sections', () => {
		const result = buildLayoutPreviewModel(createA1CorridorDocument());
		expect(result.issues).toEqual([]);
		const walls = result.model.rooms[0]!.walls;
		const openingWalls = walls.filter((wall) => wall.sections.some((section) => section.openingId));
		expect(openingWalls).toHaveLength(2);
		for (const wall of openingWalls) {
			expect(wall.sections.some((section) => section.kind === 'lintel')).toBe(true);
		}
	});

	it('builds preview data for rotated Chopin rooms without Three objects', () => {
		const result = buildLayoutPreviewModel(roomsToLayout());
		expect(result.issues).toEqual([]);
		expect(result.model.rooms).toHaveLength(7);
		expect(result.model.rooms.find((room) => room.roomId === 'paris')!.walls).toHaveLength(4);
	});

	it('omits invalid rooms while retaining valid preview rooms', () => {
		const document = createA1RectangleDocument();
		document.floors[0]!.rooms.push({
			...document.floors[0]!.rooms[0]!,
			id: 'bad-room',
			boundary: {
				closed: true,
				segments: [
					{ id: 'bad-a', kind: 'auto-bezier', start: [0, 0], end: [3, 0], interiorAnchors: [] }
				]
			}
		});
		const result = buildLayoutPreviewModel(document);
		expect(result.model.rooms.map((room) => room.roomId)).toEqual(['room-rectangle']);
		expect(result.issues.some((issue) => issue.code === 'too_few_segments')).toBe(true);
	});

	it('builds object descriptors and room slab thicknesses', () => {
		const document = createA1RectangleDocument();
		document.objects.push({
			id: 'box-a',
			kind: 'box',
			position: [2, 0.5, 2],
			rotation: [0, Math.PI / 4, 0],
			dimensions: [1, 1, 2],
			roomId: 'room-rectangle'
		});
		const result = buildLayoutPreviewModel(document);
		expect(result.model.rooms[0]).toMatchObject({ floorThickness: 0.1, ceilingThickness: 0.1 });
		expect(result.model.objects[0]).toMatchObject({ objectId: 'box-a', roomId: 'room-rectangle', readonly: false });
		expect(result.model.objects[0]!.planFootprint).toHaveLength(4);
	});
});
