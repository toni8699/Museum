import type {
	DraftPath,
	DraftSegment,
	LayoutDocument,
	LayoutObject,
	LayoutOpening,
	LayoutRoom,
	LayoutVec2
} from '$lib/layout/layout-types';

/**
 * Deterministic generated layout fixtures for the G3 performance harness.
 *
 * A fixed seed plus a deterministic PRNG produces byte-identical
 * `LayoutDocument`s across runs. The mix (bezier fraction, opening density and
 * profile distribution, object density and kind distribution) is pinned per
 * scale so tiers remain comparable. Rooms sit in a grid of isolated cells so
 * boundaries never self-intersect or overlap; openings go on line segments only
 * and never collide.
 */

export type ScaleFixtureTier = 'small' | 'medium' | 'large';

export type ScaleFixtureSpec = {
	seed: number;
	roomCount: number;
	/** Fraction of rooms whose top edge is an auto-bezier. */
	bezierFraction: number;
	/** Target openings per room (capped at the number of line segments). */
	openingsPerRoom: number;
	/** Opening profile distribution; weights need not sum to 1. */
	profileMix: { rectangular: number; rounded: number; pointed: number };
	/** Target layout objects per room. */
	objectsPerRoom: number;
	/** Object kind distribution; weights need not sum to 1. */
	objectKindMix: { box: number; plane: number; cylinder: number; sphere: number; profile: number };
};

export const SCALE_FIXTURE_SEEDS: Record<ScaleFixtureTier, ScaleFixtureSpec> = {
	small: {
		seed: 101,
		roomCount: 10,
		bezierFraction: 0.3,
		openingsPerRoom: 2,
		profileMix: { rectangular: 0.6, rounded: 0.2, pointed: 0.2 },
		objectsPerRoom: 3,
		objectKindMix: { box: 0.3, plane: 0.1, cylinder: 0.2, sphere: 0.3, profile: 0.1 }
	},
	medium: {
		seed: 202,
		roomCount: 100,
		bezierFraction: 0.3,
		openingsPerRoom: 2,
		profileMix: { rectangular: 0.6, rounded: 0.2, pointed: 0.2 },
		objectsPerRoom: 3,
		objectKindMix: { box: 0.3, plane: 0.1, cylinder: 0.2, sphere: 0.3, profile: 0.1 }
	},
	large: {
		seed: 303,
		roomCount: 1000,
		bezierFraction: 0.3,
		openingsPerRoom: 2,
		profileMix: { rectangular: 0.6, rounded: 0.2, pointed: 0.2 },
		objectsPerRoom: 3,
		objectKindMix: { box: 0.3, plane: 0.1, cylinder: 0.2, sphere: 0.3, profile: 0.1 }
	}
};

const CELL_PITCH = 14; // cell center-to-center spacing; rooms are 6–11 m wide so ≥3 m gaps remain
const ROOM_MIN = 6; // minimum room width/depth in meters
const ROOM_SPREAD = 5; // width/depth = ROOM_MIN + random() * ROOM_SPREAD
const BEZIER_BULGE = 1; // outward bump of the bezier top edge, stays inside the inter-room gap

const PROFILE_KINDS: LayoutOpening['profile'][] = ['rectangular', 'rounded', 'pointed'];
const OBJECT_KINDS: LayoutObject['kind'][] = ['box', 'plane', 'cylinder', 'sphere', 'profile'];

/** mulberry32 — small deterministic PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pickWeighted(random: () => number, weights: Record<string, number>, values: readonly string[]): string {
	const total = values.reduce((sum, value) => sum + weights[value]!, 0);
	let remaining = random() * total;
	for (const value of values) {
		remaining -= weights[value]!;
		if (remaining <= 0) return value;
	}
	return values.at(-1)!;
}

export function buildScaleFixture(spec: ScaleFixtureSpec): LayoutDocument {
	const random = mulberry32(spec.seed);
	const columns = Math.ceil(Math.sqrt(spec.roomCount));
	const rooms: LayoutRoom[] = [];
	const objects: LayoutObject[] = [];

	for (let index = 0; index < spec.roomCount; index += 1) {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const originX = column * CELL_PITCH;
		const originZ = row * CELL_PITCH;
		const width = ROOM_MIN + random() * ROOM_SPREAD;
		const depth = ROOM_MIN + random() * ROOM_SPREAD;
		const room = buildRoom(`room-${index}`, index, originX, originZ, width, depth, random, spec);
		rooms.push(room);
		for (let objectIndex = 0; objectIndex < spec.objectsPerRoom; objectIndex += 1) {
			objects.push(buildObject(room.id, objectIndex, originX, originZ, width, depth, random, spec));
		}
	}

	return {
		formatVersion: 3,
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

function buildRoom(
	id: string,
	index: number,
	originX: number,
	originZ: number,
	width: number,
	depth: number,
	random: () => number,
	spec: ScaleFixtureSpec
): LayoutRoom {
	const x0 = originX;
	const z0 = originZ;
	const isBezier = random() < spec.bezierFraction;

	const corners: LayoutVec2[] = [
		[x0, z0],
		[x0 + width, z0],
		[x0 + width, z0 + depth],
		[x0, z0 + depth]
	];

	const segmentIds = [0, 1, 2, 3].map((segment) => `${id}:wall:${segment}`);
	const segments: DraftSegment[] = corners.map((start, segmentIndex) => {
		const end = corners[(segmentIndex + 1) % corners.length]!;
		const segmentId = segmentIds[segmentIndex]!;
		// Top edge (index 2) is the only bezier candidate; openings stay on the
		// three line edges so their arc-length offsets stay trivial.
		if (segmentIndex === 2 && isBezier) {
			const midpoint: LayoutVec2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 + BEZIER_BULGE];
			return {
				id: segmentId,
				kind: 'auto-bezier',
				start: [...start] as LayoutVec2,
				end: [...end] as LayoutVec2,
				interiorAnchors: [{ id: `${segmentId}:anchor:0`, point: midpoint }]
			};
		}
		return { id: segmentId, kind: 'line', start: [...start] as LayoutVec2, end: [...end] as LayoutVec2 };
	});

	return {
		id,
		name: `Room ${index}`,
		frame: { origin: [0, 0], yaw: 0 },
		boundary: { closed: true, segments },
		wallThickness: 0.16,
		floorThickness: 0.1,
		ceilingThickness: 0.1,
		openings: buildOpenings(id, segments, random, spec)
	};
}

function buildOpenings(
	roomId: string,
	segments: readonly DraftSegment[],
	random: () => number,
	spec: ScaleFixtureSpec
): LayoutOpening[] {
	const lineSegments = segments.filter((segment) => segment.kind === 'line');
	const count = Math.min(spec.openingsPerRoom, lineSegments.length);
	const openings: LayoutOpening[] = [];

	for (let index = 0; index < count; index += 1) {
		const segment = lineSegments[index]!;
		const length = Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]);
		const isDoor = index % 2 === 0;
		const width = isDoor ? 0.9 : 1.2;
		const height = isDoor ? 2.1 : 1.2;
		const sillHeight = isDoor ? 0 : 1;
		// A single opening per segment, placed away from both ends.
		const offset = 0.5 + random() * Math.max(0.1, length - width - 1);
		openings.push({
			id: `${roomId}:opening:${index}`,
			segmentId: segment.id,
			kind: isDoor ? 'door' : 'window',
			offset,
			width,
			height,
			sillHeight,
			profile: pickWeighted(random, spec.profileMix, PROFILE_KINDS) as LayoutOpening['profile']
		});
	}

	return openings;
}

function buildObject(
	roomId: string,
	index: number,
	originX: number,
	originZ: number,
	width: number,
	depth: number,
	random: () => number,
	spec: ScaleFixtureSpec
): LayoutObject {
	const kind = pickWeighted(random, spec.objectKindMix, OBJECT_KINDS) as LayoutObject['kind'];
	const fractionX = 0.2 + random() * 0.6;
	const fractionZ = 0.2 + random() * 0.6;
	const dimensions = objectDimensions(kind, random);
	const x = originX + width * fractionX;
	const z = originZ + depth * fractionZ;
	const y = kind === 'plane' ? 0 : dimensions[1] / 2;

	const object: LayoutObject = {
		id: `${roomId}:obj:${index}`,
		kind,
		position: [x, y, z],
		rotation: [0, 0, 0],
		dimensions,
		roomId
	};
	if (kind === 'profile') object.profile = profilePath(`${roomId}:obj:${index}:profile`);
	return object;
}

function objectDimensions(kind: LayoutObject['kind'], random: () => number): [number, number, number] {
	const size = () => 0.4 + random() * 1.1;
	switch (kind) {
		case 'plane':
			return [1 + random() * 2, 0.02, 1 + random() * 2];
		case 'cylinder':
			return [0.3 + random() * 0.6, 0.5 + random(), 0.3 + random() * 0.6];
		case 'sphere':
			return [0.3 + random() * 0.6, 0.3 + random() * 0.6, 0.3 + random() * 0.6];
		case 'profile':
			return [size(), size(), size()];
		case 'box':
		default:
			return [size(), size(), size()];
	}
}

function profilePath(id: string): DraftPath {
	const points: LayoutVec2[] = [
		[0, 0],
		[1, 0],
		[1, 0.5],
		[0, 0.5]
	];
	return {
		closed: true,
		segments: points.map((start, index) => ({
			id: `${id}:wall:${index}`,
			kind: 'line' as const,
			start: [...start] as LayoutVec2,
			end: [...points[(index + 1) % points.length]!] as LayoutVec2
		}))
	};
}
