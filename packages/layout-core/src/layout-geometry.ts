import type { Vec3 } from './types';
import type {
	LayoutDocument,
	LayoutFloor,
	LayoutObject,
	LayoutOpening,
	LayoutRoom,
	LayoutVec2
} from './layout-types';
import type {
	CompiledCurveSample,
	CompiledFloor,
	CompiledLayoutGeometry,
	CompiledLayoutGeometryResult,
	CompiledLayoutObject,
	CompiledOpening,
	CompiledQueryAabb,
	CompiledRoom,
	CompiledSolidSpan,
	CompiledWall,
	CompiledWallSection,
	LayoutBounds2,
	LayoutBounds3,
	LayoutGeometryIssue
} from './layout-geometry-types';
import { geometryId } from './layout-geometry-types';
import { pointAlongSamples, type SampledSegment } from './layout-geometry-curve';
import {
	archProfileTopAt,
	buildArchProfile,
	splitSampledWallAroundOpenings,
	wallPolylinesAroundOpenings
} from './layout-geometry-openings';
import { describeLayoutObject } from './layout-geometry-objects';
import {
	hasBlockingLayoutIssues,
	prepareLayoutRoomSegments,
	validatePreparedLayoutRoomGeometry
} from './layout-geometry-validation';
import { bounds2, createQueryGeometryBuilder, polygonBounds2, type QueryGeometryBuilder } from './layout-geometry-queries';

const OPENING_CENTER_EPSILON = 0.01;

/**
 * Compile a LayoutDocument once into render-neutral geometry consumed by Plan,
 * editor 3D, and visitor 3D. Pure, deterministic, non-mutating, visitor-safe.
 */
export function compileLayoutGeometry(document: LayoutDocument): CompiledLayoutGeometryResult {
	const issues: LayoutGeometryIssue[] = [];
	const floors: CompiledFloor[] = [];
	const rooms: CompiledRoom[] = [];
	const queryBuilder = createQueryGeometryBuilder();

	const objects = compileObjects(document.objects, issues, queryBuilder);

	for (const [floorIndex, floor] of document.floors.entries()) {
		const floorRoomIds: string[] = [];
		let floorMin: Vec3 = [Infinity, Infinity, Infinity];
		let floorMax: Vec3 = [-Infinity, -Infinity, -Infinity];

		for (const [roomIndex, room] of floor.rooms.entries()) {
			const path = `floors[${floorIndex}].rooms[${roomIndex}]`;
			const prepared = prepareLayoutRoomSegments(room, path);
			const roomIssues = [
				...prepared.issues,
				...validatePreparedLayoutRoomGeometry(room, floor, prepared.segments, path)
			];
			issues.push(...roomIssues);
			if (hasBlockingLayoutIssues(roomIssues)) continue;

			const compiledRoom = compileRoom(room, floor, prepared.segments as SampledSegment[], queryBuilder);
			rooms.push(compiledRoom);
			floorRoomIds.push(room.id);
			includeBounds3(floorMin, floorMax, compiledRoom.bounds3.min, compiledRoom.bounds3.max);
		}

		for (const object of objects) {
			if (!object.roomId) continue;
			const owned = floor.rooms.some((room) => room.id === object.roomId);
			if (owned) includeBounds3(floorMin, floorMax, object.worldAabb.min, object.worldAabb.max);
		}

		floors.push({
			id: geometryId(['floor', floor.id]),
			cacheKey: cacheKeyOf([
				'floor',
				floor.id,
				floor.elevation,
				floor.height,
				floorRoomIds,
				finiteBounds3(floorMin, floorMax)
			]),
			floorId: floor.id,
			elevation: floor.elevation,
			height: floor.height,
			roomIds: floorRoomIds,
			bounds3: finiteBounds3(floorMin, floorMax)
		});
		emitBoundsAabb(queryBuilder, 'floor', floor.id, ['floor', floor.id], floorMin, floorMax);
	}

	let documentMin: Vec3 = [Infinity, Infinity, Infinity];
	let documentMax: Vec3 = [-Infinity, -Infinity, -Infinity];
	for (const room of rooms) includeBounds3(documentMin, documentMax, room.bounds3.min, room.bounds3.max);
	for (const object of objects) includeBounds3(documentMin, documentMax, object.worldAabb.min, object.worldAabb.max);
	const documentBounds = finiteBounds3(documentMin, documentMax);
	if (documentBounds) {
		queryBuilder.aabbs.push(aabbRecord('document', 'document', ['document'], documentBounds.min, documentBounds.max));
	}

	const geometry: CompiledLayoutGeometry = {
		floors,
		rooms,
		objects,
		queries: {
			points: queryBuilder.points,
			spans: queryBuilder.spans,
			polygons: queryBuilder.polygons,
			aabbs: queryBuilder.aabbs
		},
		bounds: documentBounds
	};

	return { geometry, issues };
}

function compileRoom(
	room: LayoutRoom,
	floor: LayoutFloor,
	sampledSegments: SampledSegment[],
	queryBuilder: QueryGeometryBuilder
): CompiledRoom {
	const floorElevation = floor.elevation;
	const ceilingElevation = floor.elevation + floor.height;

	const floorPolygon: LayoutVec2[] = room.boundary.segments.flatMap((segment, index) => {
		const samples = sampledSegments[index]!.samples;
		if (segment.kind === 'line') return [[...segment.start] as LayoutVec2];
		return samples.slice(0, -1).map((sample) => [...sample.point] as LayoutVec2);
	});
	const ceilingPolygon = floorPolygon.map(([x, z]) => [x, z] as LayoutVec2);

	const openingsBySegment = new Map<string, LayoutOpening[]>();
	for (const opening of room.openings) {
		const openings = openingsBySegment.get(opening.segmentId) ?? [];
		openings.push(opening);
		openingsBySegment.set(opening.segmentId, openings);
	}

	const walls: CompiledWall[] = room.boundary.segments.map((segment, index) => {
		const sampled = sampledSegments[index]!;
		const openings = openingsBySegment.get(segment.id) ?? [];
		const segmentDependencyKey = cacheKeyOf([
			'segment-geometry',
			floor.id,
			room.id,
			segment
		]);
		const wallCacheKey = cacheKeyOf([
			'wall',
			segmentDependencyKey,
			openings,
			room.wallThickness,
			floor.elevation,
			floor.height
		]);
		const sections = splitSampledWallAroundOpenings(sampled, segment, openings, floor.height);
		const compiledOpenings = openings.map((opening) =>
			compileOpening(opening, sampled, floor.id, room.id, segmentDependencyKey)
		);
		const solidSpans = buildSolidSpans(sampled.samples, sections);
		const solidCenterlinePolylines = wallPolylinesAroundOpenings(sampled.samples, openings);
		const wallBounds2Value = wallBounds2(sampled.samples, room.wallThickness);
		const wallBounds3Value = wallBounds3(sampled.samples, room.wallThickness, floorElevation, ceilingElevation);
		return {
			id: geometryId(['wall', floor.id, room.id, segment.id]),
			cacheKey: wallCacheKey,
			segmentId: segment.id,
			thickness: room.wallThickness,
			length: sampled.length,
			samples: sampled.samples,
			sections,
			solidSpans,
			openings: compiledOpenings,
			solidCenterlinePolylines,
			bounds2: wallBounds2Value,
			bounds3: wallBounds3Value
		};
	});

	const roomOpenings = walls.flatMap((wall) => wall.openings);
	const roomBounds2 = roomBounds2FromWalls(walls, floorPolygon);
	const roomBounds3 = roomBounds3FromParts(floorPolygon, walls, floorElevation, ceilingElevation, room.floorThickness, room.ceilingThickness);

	emitRoomQueryRecords(queryBuilder, floor, room, walls, floorPolygon, roomBounds3);

	return {
		id: geometryId(['room', floor.id, room.id]),
		cacheKey: cacheKeyOf([
			'room',
			floor.id,
			floor.elevation,
			floor.height,
			room.id,
			room.boundary,
			room.wallThickness,
			room.floorThickness,
			room.ceilingThickness,
			room.openings
		]),
		roomId: room.id,
		floorElevation,
		ceilingElevation,
		floorThickness: room.floorThickness,
		ceilingThickness: room.ceilingThickness,
		wallThickness: room.wallThickness,
		floorPolygon,
		ceilingPolygon,
		walls,
		openings: roomOpenings,
		bounds2: roomBounds2,
		bounds3: roomBounds3
	};
}

function compileOpening(
	opening: LayoutOpening,
	sampled: SampledSegment,
	floorId: string,
	roomId: string,
	segmentDependencyKey: string
): CompiledOpening {
	const centerDistance = opening.offset + opening.width / 2;
	const point = pointAlongSamples(sampled.samples, centerDistance);
	const before = pointAlongSamples(sampled.samples, Math.max(0, centerDistance - OPENING_CENTER_EPSILON));
	const after = pointAlongSamples(sampled.samples, Math.min(sampled.length, centerDistance + OPENING_CENTER_EPSILON));
	const tangentX = after[0] - before[0];
	const tangentZ = after[1] - before[1];
	const magnitude = Math.hypot(tangentX, tangentZ) || 1;
	const tangent: LayoutVec2 = [tangentX / magnitude, tangentZ / magnitude];
	const profileShape = opening.profile === 'rectangular'
		? undefined
		: buildArchProfile(opening.profile, opening.width, opening.height).profile ?? undefined;
	const centerPolyline = openingCenterPolyline(sampled, opening.offset, opening.offset + opening.width);
	return {
		id: geometryId(['opening', floorId, roomId, opening.id]),
		cacheKey: cacheKeyOf(['opening', segmentDependencyKey, opening]),
		openingId: opening.id,
		segmentId: opening.segmentId,
		kind: opening.kind,
		offset: opening.offset,
		width: opening.width,
		height: opening.height,
		sillHeight: opening.sillHeight,
		profile: opening.profile,
		...(profileShape ? { profileShape } : {}),
		center: {
			openingId: opening.id,
			point,
			distance: centerDistance,
			tangent,
			normal: [-tangent[1], tangent[0]],
			yaw: -Math.atan2(tangentZ, tangentX)
		},
		centerPolyline,
		bounds2: polygonBounds2(centerPolyline) ?? bounds2(point[0], point[1], point[0], point[1]),
		...(opening.connectsRoomIds ? { connectsRoomIds: opening.connectsRoomIds } : {})
	};
}

function openingCenterPolyline(sampled: SampledSegment, start: number, end: number): LayoutVec2[] {
	const points: LayoutVec2[] = [pointAlongSamples(sampled.samples, start)];
	for (const sample of sampled.samples) {
		if (sample.distance > start + 1e-6 && sample.distance < end - 1e-6) points.push([...sample.point] as LayoutVec2);
	}
	points.push(pointAlongSamples(sampled.samples, end));
	return points;
}

function buildSolidSpans(samples: readonly CompiledCurveSample[], sections: readonly CompiledWallSection[]): CompiledSolidSpan[] {
	const spans: CompiledSolidSpan[] = [];
	for (const [sectionIndex, section] of sections.entries()) {
		for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
			const startSample = samples[sampleIndex - 1]!;
			const endSample = samples[sampleIndex]!;
			const clippedStart = Math.max(startSample.distance, section.startDistance);
			const clippedEnd = Math.min(endSample.distance, section.endDistance);
			if (clippedEnd <= clippedStart + 1e-6) continue;
			const start = pointAlongSamples(samples, clippedStart);
			const end = pointAlongSamples(samples, clippedEnd);
			const bottomY = section.kind === 'lintel' ? archBottom(section, (clippedStart + clippedEnd) / 2) : section.bottomY;
			if (section.topY <= bottomY + 1e-6) continue;
			spans.push({ sectionIndex, startDistance: clippedStart, endDistance: clippedEnd, start, end, bottomY, topY: section.topY });
		}
	}
	return spans;
}

function archBottom(section: CompiledWallSection, distance: number): number {
	if (!section.profile || section.profile.kind === 'rectangular') return section.bottomY;
	const localDistance = Math.max(0, Math.min(section.profile.width, distance - section.startDistance));
	const profileTop = archProfileTopAt(section.profile, localDistance);
	const profileBaseY = section.profileBaseY ?? 0;
	return Math.min(section.topY, profileBaseY + profileTop);
}

function compileObjects(
	objects: readonly LayoutObject[],
	issues: LayoutGeometryIssue[],
	queryBuilder: QueryGeometryBuilder
): CompiledLayoutObject[] {
	const compiled: CompiledLayoutObject[] = [];
	for (const [index, object] of objects.entries()) {
		if (!isValidObject(object)) {
			issues.push({
				path: `objects[${index}]`,
				code: 'object_invalid',
				message: 'Layout object position and rotation must be finite and dimensions must be finite and greater than zero.',
				targetId: object.id
			});
			continue;
		}
		const descriptor = describeLayoutObject(object);
		compiled.push(descriptor);
		queryBuilder.polygons.push(
			polygonRecord(
				'object-footprint',
				['object-footprint', object.id],
				descriptor.planFootprint,
				object.id,
				{ objectId: object.id }
			)
		);
		queryBuilder.aabbs.push(aabbRecord('object', object.id, ['object', object.id], descriptor.worldAabb.min, descriptor.worldAabb.max));
	}
	return compiled;
}

function isValidObject(object: LayoutObject): boolean {
	const vectors = [object.position, object.rotation, object.dimensions];
	if (vectors.some((vector) => !vector.every((value) => Number.isFinite(value)))) return false;
	return object.dimensions.every((value) => value > 0);
}

function emitRoomQueryRecords(
	queryBuilder: QueryGeometryBuilder,
	floor: LayoutFloor,
	room: LayoutRoom,
	walls: readonly CompiledWall[],
	floorPolygon: readonly LayoutVec2[],
	roomBounds3: LayoutBounds3
): void {
	const roomIdParts = ['room', floor.id, room.id];

	for (const [segmentIndex, segment] of room.boundary.segments.entries()) {
		queryBuilder.points.push(
			pointRecord(
				floor.id,
				room.id,
				segment.id,
				'vertex',
				segment.id,
				segmentIndex,
				[...segment.start] as LayoutVec2
			)
		);
		if (segment.kind === 'auto-bezier') {
			for (const [anchorIndex, anchor] of segment.interiorAnchors.entries()) {
				queryBuilder.points.push(
					pointRecord(
						floor.id,
						room.id,
						segment.id,
						'interior-anchor',
						anchor.id,
						anchorIndex,
						[...anchor.point] as LayoutVec2
					)
				);
			}
		}
	}

	for (const wall of walls) {
		for (let index = 1; index < wall.samples.length; index += 1) {
			const start = wall.samples[index - 1]!;
			const end = wall.samples[index]!;
			queryBuilder.spans.push(
				spanRecord(
					'wall',
					['wall-span', floor.id, room.id, wall.segmentId, String(index - 1)],
					start.point,
					end.point,
					start.distance,
					end.distance,
					wall.segmentId,
					floor.id,
					room.id,
					wall.segmentId,
					undefined,
					start.t,
					end.t
				)
			);
		}
		for (const opening of wall.openings) {
			const start = pointAlongSamples(wall.samples, opening.offset);
			const end = pointAlongSamples(wall.samples, opening.offset + opening.width);
			queryBuilder.spans.push(
				spanRecord(
					'opening',
					['opening-span', floor.id, room.id, opening.openingId],
					start,
					end,
					opening.offset,
					opening.offset + opening.width,
					opening.openingId,
					floor.id,
					room.id,
					wall.segmentId,
					opening.openingId
				)
			);
		}
		for (const [index, span] of wall.solidSpans.entries()) {
			queryBuilder.spans.push(
				spanRecord(
					'solid',
					['solid-span', floor.id, room.id, wall.segmentId, String(index)],
					span.start,
					span.end,
					span.startDistance,
					span.endDistance,
					wall.segmentId,
					floor.id,
					room.id,
					wall.segmentId
				)
			);
		}
		queryBuilder.aabbs.push(aabbRecord('wall', wall.segmentId, ['wall', floor.id, room.id, wall.segmentId], wall.bounds3.min, wall.bounds3.max));
		for (const opening of wall.openings) {
			queryBuilder.aabbs.push(aabb2Record('opening', opening.openingId, ['opening', floor.id, room.id, opening.openingId], opening.bounds2));
		}
	}

	queryBuilder.polygons.push(
		polygonRecord(
			'room-floor',
			['room-floor', floor.id, room.id],
			[...floorPolygon],
			room.id,
			{ floorId: floor.id, roomId: room.id }
		)
	);
	queryBuilder.aabbs.push(aabbRecord('room', room.id, roomIdParts, roomBounds3.min, roomBounds3.max));
}

function wallBounds2(samples: readonly CompiledCurveSample[], thickness: number): LayoutBounds2 {
	let minX = Infinity;
	let minZ = Infinity;
	let maxX = -Infinity;
	let maxZ = -Infinity;
	const half = thickness / 2;
	for (const sample of samples) {
		minX = Math.min(minX, sample.point[0] - half);
		minZ = Math.min(minZ, sample.point[1] - half);
		maxX = Math.max(maxX, sample.point[0] + half);
		maxZ = Math.max(maxZ, sample.point[1] + half);
	}
	return bounds2(minX, minZ, maxX, maxZ);
}

function wallBounds3(samples: readonly CompiledCurveSample[], thickness: number, floorElevation: number, ceilingElevation: number): LayoutBounds3 {
	const bounds2 = wallBounds2(samples, thickness);
	return { min: [bounds2.min[0], floorElevation, bounds2.min[1]], max: [bounds2.max[0], ceilingElevation, bounds2.max[1]] };
}

function roomBounds2FromWalls(walls: readonly CompiledWall[], floorPolygon: readonly LayoutVec2[]): LayoutBounds2 {
	const floorBounds = polygonBounds2(floorPolygon);
	if (!floorBounds) {
		let minX = Infinity;
		let minZ = Infinity;
		let maxX = -Infinity;
		let maxZ = -Infinity;
		for (const wall of walls) {
			minX = Math.min(minX, wall.bounds2.min[0]);
			minZ = Math.min(minZ, wall.bounds2.min[1]);
			maxX = Math.max(maxX, wall.bounds2.max[0]);
			maxZ = Math.max(maxZ, wall.bounds2.max[1]);
		}
		return bounds2(minX, minZ, maxX, maxZ);
	}
	let minX = floorBounds.min[0];
	let minZ = floorBounds.min[1];
	let maxX = floorBounds.max[0];
	let maxZ = floorBounds.max[1];
	for (const wall of walls) {
		minX = Math.min(minX, wall.bounds2.min[0]);
		minZ = Math.min(minZ, wall.bounds2.min[1]);
		maxX = Math.max(maxX, wall.bounds2.max[0]);
		maxZ = Math.max(maxZ, wall.bounds2.max[1]);
	}
	return bounds2(minX, minZ, maxX, maxZ);
}

function roomBounds3FromParts(
	floorPolygon: readonly LayoutVec2[],
	walls: readonly CompiledWall[],
	floorElevation: number,
	ceilingElevation: number,
	floorThickness: number,
	ceilingThickness: number
): LayoutBounds3 {
	const min: Vec3 = [Infinity, Infinity, Infinity];
	const max: Vec3 = [-Infinity, -Infinity, -Infinity];
	for (const [x, z] of floorPolygon) includeBounds3(min, max, [x, floorElevation - floorThickness, z]);
	for (const [x, z] of floorPolygon) includeBounds3(min, max, [x, ceilingElevation + ceilingThickness, z]);
	for (const wall of walls) includeBounds3(min, max, wall.bounds3.min, wall.bounds3.max);
	return finiteBounds3(min, max) ?? { min: [0, floorElevation, 0], max: [0, ceilingElevation, 0] };
}

function includeBounds3(min: Vec3, max: Vec3, ...points: readonly Vec3[]): void {
	for (const point of points) {
		min[0] = Math.min(min[0], point[0]);
		min[1] = Math.min(min[1], point[1]);
		min[2] = Math.min(min[2], point[2]);
		max[0] = Math.max(max[0], point[0]);
		max[1] = Math.max(max[1], point[1]);
		max[2] = Math.max(max[2], point[2]);
	}
}

function finiteBounds3(min: Vec3, max: Vec3): LayoutBounds3 | null {
	if (![...min, ...max].every(Number.isFinite)) return null;
	return { min: [...min] as Vec3, max: [...max] as Vec3 };
}

function cacheKeyOf(parts: readonly unknown[]): string {
	return JSON.stringify(parts);
}

function pointRecord(
	floorId: string,
	roomId: string,
	segmentId: string,
	kind: 'vertex' | 'interior-anchor',
	sourceId: string,
	sourceIndex: number,
	point: LayoutVec2
) {
	const parts = ['query-point', floorId, roomId, segmentId, kind, sourceId];
	return {
		id: geometryId(parts),
		cacheKey: cacheKeyOf([...parts, sourceIndex, point]),
		kind,
		point,
		aabb: bounds2(point[0], point[1], point[0], point[1]),
		sourceId,
		floorId,
		roomId,
		segmentId,
		sourceIndex
	};
}

function spanRecord(
	kind: 'wall' | 'opening' | 'solid',
	parts: readonly string[],
	start: LayoutVec2,
	end: LayoutVec2,
	startDistance: number,
	endDistance: number,
	sourceId: string,
	floorId: string,
	roomId: string,
	segmentId: string,
	openingId?: string,
	startT?: number,
	endT?: number
) {
	const aabb = bounds2(Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1]));
	return {
		id: geometryId(parts),
		cacheKey: cacheKeyOf([
			...parts,
			start,
			end,
			startDistance,
			endDistance,
			startT,
			endT,
			sourceId,
			floorId,
			roomId,
			segmentId,
			openingId
		]),
		kind,
		start,
		end,
		startDistance,
		endDistance,
		...(startT === undefined ? {} : { startT }),
		...(endT === undefined ? {} : { endT }),
		aabb,
		sourceId,
		floorId,
		roomId,
		segmentId,
		...(openingId ? { openingId } : {})
	};
}

function polygonRecord(
	kind: 'room-floor' | 'object-footprint',
	parts: readonly string[],
	polygon: readonly LayoutVec2[],
	sourceId: string,
	metadata: { floorId?: string; roomId?: string; objectId?: string }
) {
	const aabb = polygonBounds2(polygon) ?? bounds2(0, 0, 0, 0);
	return {
		id: geometryId(parts),
		cacheKey: cacheKeyOf([...parts, polygon]),
		kind,
		polygon: [...polygon] as LayoutVec2[],
		aabb,
		sourceId,
		...metadata
	};
}

function aabbRecord(kind: CompiledQueryAabb['kind'], sourceId: string, parts: readonly string[], min: Vec3, max: Vec3): CompiledQueryAabb {
	return aabb2Record(kind, sourceId, parts, bounds2(min[0], min[2], max[0], max[2]));
}

function aabb2Record(kind: CompiledQueryAabb['kind'], sourceId: string, parts: readonly string[], aabb: LayoutBounds2): CompiledQueryAabb {
	return {
		id: geometryId(parts),
		cacheKey: cacheKeyOf([...parts, aabb.min, aabb.max]),
		kind,
		aabb,
		sourceId
	};
}

function emitBoundsAabb(
	queryBuilder: QueryGeometryBuilder,
	kind: CompiledQueryAabb['kind'],
	sourceId: string,
	parts: readonly string[],
	min: Vec3,
	max: Vec3
): void {
	if (![...min, ...max].every(Number.isFinite)) return;
	queryBuilder.aabbs.push(aabbRecord(kind, sourceId, parts, min, max));
}
