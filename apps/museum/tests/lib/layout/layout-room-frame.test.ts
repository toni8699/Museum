import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { validateLayoutDocument } from '$lib/layout/layout-codec';
import { layoutRoomLocalPoint, layoutRoomPoint } from '$lib/layout/layout-room-frame';
import type { Vec3 } from '$lib/types/museum';

describe('layout room frames', () => {
	it('round-trips room-local/world points with Three.js positive-Y yaw', () => {
		const floor = chopinProject.layout.floors[0]!;
		const room = floor.rooms.find((candidate) => candidate.id === 'paris')!;
		const local: Vec3 = [1.25, 1.65, -2.5];
		const world = layoutRoomPoint(room, floor, local);
		const recovered = layoutRoomLocalPoint(room, floor, world);
		expect(recovered[0]).toBeCloseTo(local[0], 12);
		expect(recovered[1]).toBeCloseTo(local[1], 12);
		expect(recovered[2]).toBeCloseTo(local[2], 12);
	});

	it('rejects non-finite frame values at exact paths', () => {
		const input = JSON.parse(JSON.stringify(chopinProject.layout)) as any;
		input.floors[0].rooms[0].frame.origin[1] = Number.NaN;
		input.floors[0].rooms[1].frame.yaw = Number.POSITIVE_INFINITY;
		const result = validateLayoutDocument(input);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
			'$.floors[0].rooms[0].frame.origin[1]',
			'$.floors[0].rooms[1].frame.yaw'
		]));
	});
});
