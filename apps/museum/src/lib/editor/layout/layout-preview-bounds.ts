import type { LayoutPreviewModel } from './layout-mesh-factory';

export type LayoutPreviewBounds = {
	min: [number, number, number];
	max: [number, number, number];
};

export function layoutPreviewBounds(model: LayoutPreviewModel): LayoutPreviewBounds | null {
	if (model.rooms.length === 0) return null;

	const min: [number, number, number] = [Infinity, Infinity, Infinity];
	const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

	for (const room of model.rooms) {
		for (const [x, z] of room.floorPolygon) includePoint(min, max, x, room.floorElevation, z);
		for (const [x, z] of room.ceilingPolygon) includePoint(min, max, x, room.ceilingElevation, z);

		for (const wall of room.walls) {
			const halfThickness = wall.thickness / 2;
			includePoint(min, max, wall.start[0] - halfThickness, room.floorElevation, wall.start[1] - halfThickness);
			includePoint(min, max, wall.end[0] + halfThickness, room.floorElevation + wall.height, wall.end[1] + halfThickness);
		}
	}

	if (![...min, ...max].every(Number.isFinite)) return null;
	return { min, max };
}

function includePoint(
	min: [number, number, number],
	max: [number, number, number],
	x: number,
	y: number,
	z: number
): void {
	min[0] = Math.min(min[0], x);
	min[1] = Math.min(min[1], y);
	min[2] = Math.min(min[2], z);
	max[0] = Math.max(max[0], x);
	max[1] = Math.max(max[1], y);
	max[2] = Math.max(max[2], z);
}
