import { describe, expect, it } from 'vitest';

import { roomsToLayout } from './rooms-to-layout';
import { buildLayoutPreviewModel } from './layout-mesh-factory';
import { layoutPreviewBounds } from './layout-preview-bounds';
import { createEmptyLayoutDocument } from './layout-codec';
import { createA1RectangleDocument } from './layout-a1-fixtures';

describe('layoutPreviewBounds', () => {
	it('includes all rotated Chopin rooms and wall height', () => {
		const result = buildLayoutPreviewModel(roomsToLayout());
		const bounds = layoutPreviewBounds(result.model);

		expect(bounds).not.toBeNull();
		expect(bounds!.min[1]).toBe(0);
		expect(bounds!.max[1]).toBe(Math.max(...result.model.rooms.map((room) => room.ceilingElevation)));
		expect(bounds!.min[0]).toBeLessThan(bounds!.max[0]);
		expect(bounds!.min[2]).toBeLessThan(bounds!.max[2]);
	});

	it('returns null for an empty preview model', () => {
		const result = buildLayoutPreviewModel(createEmptyLayoutDocument());
		expect(layoutPreviewBounds(result.model)).toBeNull();
	});

	it('preserves elevated floor and ceiling bounds', () => {
		const document = createA1RectangleDocument();
		document.floors[0]!.elevation = 4;
		document.floors[0]!.height = 2.5;
		const result = buildLayoutPreviewModel(document);
		const bounds = layoutPreviewBounds(result.model);
		expect(bounds).not.toBeNull();
		expect(bounds!.min[1]).toBe(4);
		expect(bounds!.max[1]).toBe(6.5);
	});
});
