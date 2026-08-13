import { createEmptyLayoutDocument } from './layout-codec';
import type {
	DraftSegment,
	LayoutDocument,
	LayoutRoom,
	LayoutVec2
} from './layout-types';

export function createA1RectangleDocument(): LayoutDocument {
	return documentWithRooms([rectangleRoom('room-rectangle', 0, 0, 6, 4)]);
}

export function createA1LDocument(): LayoutDocument {
	const room: LayoutRoom = {
		...roomDefaults('room-l', 'L Room'),
		boundary: {
			closed: true,
			segments: lineSegments([
				[0, 0],
				[6, 0],
				[6, 3],
				[3, 3],
				[3, 6],
				[0, 6]
			])
		}
	};
	return documentWithRooms([room]);
}

export function createA1CorridorDocument(): LayoutDocument {
	const room: LayoutRoom = {
		...roomDefaults('room-corridor', 'Corridor'),
		boundary: {
			closed: true,
			segments: lineSegments(
				[
					[0, 0],
					[10, 0],
					[10, 2],
					[0, 2]
				],
				'room-corridor:wall'
			)
		},
		openings: [
			{
				id: 'corridor-door-east',
				segmentId: 'room-corridor:wall:1',
				kind: 'door',
				offset: 0.55,
				width: 0.9,
				height: 2.1,
				sillHeight: 0,
				profile: 'rectangular'
			},
			{
				id: 'corridor-door-west',
				segmentId: 'room-corridor:wall:3',
				kind: 'door',
				offset: 0.55,
				width: 0.9,
				height: 2.1,
				sillHeight: 0,
				profile: 'rectangular'
			}
		]
	};
	return documentWithRooms([room]);
}

export function createA1BezierDocument(): LayoutDocument {
	const document = createA1RectangleDocument();
	const segments = document.floors[0]!.rooms[0]!.boundary.segments;
	segments[0] = {
		id: segments[0]!.id,
		kind: 'auto-bezier',
		start: [0, 0],
		end: [6, 0],
		interiorAnchors: [{ id: `${segments[0]!.id}:anchor:1`, point: [3, -1] }]
	};
	return document;
}

function rectangleRoom(
	id: string,
	x: number,
	z: number,
	width: number,
	depth: number
): LayoutRoom {
	return {
		...roomDefaults(id, id),
		boundary: {
			closed: true,
			segments: lineSegments([
				[x, z],
				[x + width, z],
				[x + width, z + depth],
				[x, z + depth]
			])
		}
	};
}

function roomDefaults(id: string, name: string): LayoutRoom {
	return {
		id,
		name,
		frame: { origin: [0, 0], yaw: 0 },
		boundary: { closed: true, segments: [] },
		wallThickness: 0.16,
		floorThickness: 0.1,
		ceilingThickness: 0.1,
		openings: []
	};
}

function lineSegments(points: LayoutVec2[], idPrefix = `room:${points.length}`): DraftSegment[] {
	return points.map((start, index) => ({
		id: `${idPrefix}:${index}`,
		kind: 'line' as const,
		start: [...start] as LayoutVec2,
		end: [...points[(index + 1) % points.length]!] as LayoutVec2
	}));
}

function documentWithRooms(rooms: LayoutRoom[]): LayoutDocument {
	const document = createEmptyLayoutDocument();
	document.floors = [
		{
			id: 'floor-ground',
			name: 'Ground Floor',
			elevation: 0,
			height: 3,
			rooms
		}
	];
	return document;
}
