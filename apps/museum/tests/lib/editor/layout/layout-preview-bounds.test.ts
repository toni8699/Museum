import { describe, expect, it } from 'vitest';

import { roomsToLayout } from '$lib/editor/layout/rooms-to-layout';
import { buildLayoutPreviewModel } from '$lib/editor/layout/layout-mesh-factory';
import { createEmptyLayoutDocument } from '$lib/layout/layout-codec';
import { createA1RectangleDocument } from './layout-a1-fixtures';

describe('layoutPreviewBounds', () => {
	it('includes all rotated Chopin rooms and wall height', () => {
		const result = buildLayoutPreviewModel(roomsToLayout());
		const bounds = result.bounds;

		expect(bounds).not.toBeNull();
		expect(bounds!.min[1]).toBe(Math.min(...result.model.rooms.map((room) => room.floorElevation - room.floorThickness)));
		expect(bounds!.max[1]).toBe(Math.max(...result.model.rooms.map((room) => room.ceilingElevation + room.ceilingThickness)));
		expect(bounds!.min[0]).toBeLessThan(bounds!.max[0]);
		expect(bounds!.min[2]).toBeLessThan(bounds!.max[2]);
	});

	it('returns null for an empty preview model', () => {
		const result = buildLayoutPreviewModel(createEmptyLayoutDocument());
		expect(result.bounds).toBeNull();
	});

	it('preserves elevated floor and ceiling bounds', () => {
		const document = createA1RectangleDocument();
		document.floors[0]!.elevation = 4;
		document.floors[0]!.height = 2.5;
		const result = buildLayoutPreviewModel(document);
		const bounds = result.bounds;
		expect(bounds).not.toBeNull();
		expect(bounds!.min[1]).toBe(3.9);
		expect(bounds!.max[1]).toBe(6.6);
	});
});
