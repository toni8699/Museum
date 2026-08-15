import type {
	DraftSegment,
	LayoutDocument,
	LayoutObject,
	LayoutOpening,
	LayoutRoom,
	LayoutVec2
} from '$lib/layout/layout-types';

export function g1DocumentWithRooms(rooms: LayoutRoom[], objects: LayoutObject[] = []): LayoutDocument {
	return {
		units: 'meters',
		floors: [
			{
				id: 'floor-ground',
				name: 'Ground Floor',
				elevation: 0,
				height: 3,
				rooms
			}
		],
		objects
	};
}

export function g1RoomDefaults(id: string, name = id): LayoutRoom {
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

export function g1LineSegments(points: readonly LayoutVec2[], idPrefix: string): DraftSegment[] {
	return points.map((start, index) => ({
		id: `${idPrefix}:${index}`,
		kind: 'line' as const,
		start: [...start] as LayoutVec2,
		end: [...points[(index + 1) % points.length]!] as LayoutVec2
	}));
}

export function g1RectangleRoom(
	id: string,
	x: number,
	z: number,
	width: number,
	depth: number,
	openings: LayoutOpening[] = []
): LayoutRoom {
	return {
		...g1RoomDefaults(id),
		boundary: {
			closed: true,
			segments: g1LineSegments(
				[
					[x, z],
					[x + width, z],
					[x + width, z + depth],
					[x, z + depth]
				],
				`${id}:wall`
			)
		},
		openings
	};
}

export function g1LineRectangleDocument(): LayoutDocument {
	return g1DocumentWithRooms([g1RectangleRoom('room-rectangle', 0, 0, 6, 4)]);
}

export function g1LShapedDocument(): LayoutDocument {
	const room: LayoutRoom = {
		...g1RoomDefaults('room-l', 'L Room'),
		boundary: {
			closed: true,
			segments: g1LineSegments(
				[
					[0, 0],
					[6, 0],
					[6, 3],
					[3, 3],
					[3, 6],
					[0, 6]
				],
				'room-l:wall'
			)
		}
	};
	return g1DocumentWithRooms([room]);
}

export function g1AutoBezierDocument(): LayoutDocument {
	const document = g1LineRectangleDocument();
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

export function g1Opening(
	id: string,
	segmentId: string,
	kind: LayoutOpening['kind'],
	offset: number,
	width: number,
	height: number,
	sillHeight: number,
	profile: LayoutOpening['profile'] = 'rectangular'
): LayoutOpening {
	return { id, segmentId, kind, offset, width, height, sillHeight, profile };
}

export function g1MultipleOpeningsDocument(): LayoutDocument {
	const room = g1RectangleRoom('room-openings', 0, 0, 10, 4);
	const wall0 = `${room.id}:wall:0`;
	const wall1 = `${room.id}:wall:1`;
	room.openings = [
		g1Opening('door-1', wall0, 'door', 1, 0.9, 2.1, 0),
		g1Opening('window-1', wall0, 'window', 4, 1.2, 1.2, 1),
		g1Opening('door-2', wall1, 'door', 0.5, 0.9, 2.1, 0)
	];
	return g1DocumentWithRooms([room]);
}

export function g1ProfileMatrixDocument(): LayoutDocument {
	const room = g1RectangleRoom('room-profiles', 0, 0, 12, 4);
	const wall0 = `${room.id}:wall:0`;
	room.openings = [
		g1Opening('rect', wall0, 'door', 0.5, 1.4, 2.4, 0, 'rectangular'),
		g1Opening('rounded', wall0, 'window', 4, 1.4, 1.8, 1, 'rounded'),
		g1Opening('pointed', wall0, 'window', 8, 1.4, 1.8, 1, 'pointed')
	];
	return g1DocumentWithRooms([room]);
}

export function g1ElevatedFloorDocument(): LayoutDocument {
	const document = g1LineRectangleDocument();
	document.floors[0]!.elevation = 2.5;
	document.floors[0]!.height = 4;
	return document;
}

export function g1Object(kind: LayoutObject['kind'], id: string, overrides: Partial<LayoutObject> = {}): LayoutObject {
	const base: LayoutObject = {
		id,
		kind,
		position: [1, 0.5, 1],
		rotation: [0, 0, 0],
		dimensions: kind === 'plane' ? [2, 0.01, 2] : [1, 1, 1],
		roomId: 'room-objects'
	};
	return { ...base, ...overrides };
}

export function g1ObjectMatrixDocument(): LayoutDocument {
	const room = g1RectangleRoom('room-objects', 0, 0, 10, 8);
	const objects: LayoutObject[] = [
		g1Object('box', 'obj-box', { position: [1, 0.5, 1] }),
		g1Object('plane', 'obj-plane', { position: [3, 0, 3] }),
		g1Object('cylinder', 'obj-cylinder', { position: [5, 0.5, 1], rotation: [0, Math.PI / 4, 0] }),
		g1Object('sphere', 'obj-sphere', { position: [7, 0.5, 3], dimensions: [1.2, 0.8, 1.2] }),
		g1Object('profile', 'obj-profile', {
			position: [2, 0.25, 6],
			profile: {
				closed: true,
				segments: g1LineSegments(
					[
						[0, 0],
						[1, 0],
						[1, 0.5],
						[0, 0.5]
					],
					'profile:wall'
				)
			}
		})
	];
	return g1DocumentWithRooms([room], objects);
}

export function g1InvalidGeometryDocument(): LayoutDocument {
	const good = g1RectangleRoom('room-good', 0, 0, 6, 4);
	const disconnected: LayoutRoom = {
		...g1RoomDefaults('room-disconnected'),
		boundary: {
			closed: true,
			segments: [
				{ id: 'd:wall:0', kind: 'line', start: [0, 0], end: [6, 0] },
				{ id: 'd:wall:1', kind: 'line', start: [7, 0], end: [7, 4] },
				{ id: 'd:wall:2', kind: 'line', start: [7, 4], end: [0, 4] },
				{ id: 'd:wall:3', kind: 'line', start: [0, 4], end: [0, 0] }
			]
		}
	};
	const selfIntersecting: LayoutRoom = {
		...g1RoomDefaults('room-self-intersect'),
		boundary: {
			closed: true,
			segments: [
				{ id: 's:wall:0', kind: 'line', start: [0, 0], end: [4, 4] },
				{ id: 's:wall:1', kind: 'line', start: [4, 4], end: [4, 0] },
				{ id: 's:wall:2', kind: 'line', start: [4, 0], end: [0, 4] },
				{ id: 's:wall:3', kind: 'line', start: [0, 4], end: [0, 0] }
			]
		}
	};
	return g1DocumentWithRooms([good, disconnected, selfIntersecting]);
}
