import type { Vec3 } from '$lib/types/museum';
import type { LayoutOpening, LayoutVec2 } from './layout-types';

/**
 * Structured geometry issue. This is the single shared contract between the
 * compiler, geometry validation, and every consumer (editor + visitor).
 */
export type LayoutGeometryIssue = {
	path: string;
	code: string;
	message: string;
	targetId?: string;
	severity?: 'warning' | 'error';
};

export type LayoutBounds2 = { min: LayoutVec2; max: LayoutVec2 };
export type LayoutBounds3 = { min: Vec3; max: Vec3 };

/** Deterministic relevant-input identity shared by compiled entities and query records. */
export type CompiledIdentity = {
	/** Qualified semantic identity (stable, collision-safe). */
	id: string;
	/** Deterministic identity of the authored inputs that produced this record. */
	cacheKey: string;
};

export type CompiledCurveSample = {
	point: LayoutVec2;
	distance: number;
	t: number;
	tangent: LayoutVec2;
	normal: LayoutVec2;
};

export type ArchProfileKind = LayoutOpening['profile'];

/** Compiled elevation profile of an opening's top boundary. */
export type CompiledArchProfile = {
	kind: ArchProfileKind;
	width: number;
	height: number;
	rise: number;
	/** Ordered x/y points describing the opening's top boundary in local elevation space. */
	topBoundary: LayoutVec2[];
};

/** Renderer-neutral solid region along a wall: side wall, opening sill, or lintel. */
export type CompiledWallSection = {
	kind: 'side' | 'lintel';
	startDistance: number;
	endDistance: number;
	bottomY: number;
	topY: number;
	openingId?: string;
	profile?: CompiledArchProfile;
	profileBaseY?: number;
};

/** Clipped chord span ready for the existing chord-box adapters. */
export type CompiledSolidSpan = {
	sectionIndex: number;
	startDistance: number;
	endDistance: number;
	start: LayoutVec2;
	end: LayoutVec2;
	bottomY: number;
	topY: number;
};

export type CompiledOpeningCenter = {
	openingId: string;
	point: LayoutVec2;
	distance: number;
	tangent: LayoutVec2;
	normal: LayoutVec2;
	/** Three.js positive-Y yaw derived from the tangent (world `-atan2(dz, dx)`). */
	yaw: number;
};

export type CompiledOpening = CompiledIdentity & {
	openingId: string;
	segmentId: string;
	kind: LayoutOpening['kind'];
	/** Offset in meters along the compiled sampled arc. */
	offset: number;
	width: number;
	height: number;
	sillHeight: number;
	profile: ArchProfileKind;
	profileShape?: CompiledArchProfile;
	center: CompiledOpeningCenter;
	/** Sampled opening centerline along the wall arc (precomputed for Plan overlay). */
	centerPolyline: LayoutVec2[];
	bounds2: LayoutBounds2;
	connectsRoomIds?: [string, string];
};

export type CompiledWall = CompiledIdentity & {
	segmentId: string;
	thickness: number;
	length: number;
	samples: CompiledCurveSample[];
	sections: CompiledWallSection[];
	solidSpans: CompiledSolidSpan[];
	openings: CompiledOpening[];
	/** Opening-free centerline polylines for the Plan wall strokes. */
	solidCenterlinePolylines: LayoutVec2[][];
	bounds2: LayoutBounds2;
	bounds3: LayoutBounds3;
};

export type CompiledRoom = CompiledIdentity & {
	roomId: string;
	floorElevation: number;
	ceilingElevation: number;
	floorThickness: number;
	ceilingThickness: number;
	wallThickness: number;
	floorPolygon: LayoutVec2[];
	ceilingPolygon: LayoutVec2[];
	walls: CompiledWall[];
	openings: CompiledOpening[];
	bounds2: LayoutBounds2;
	bounds3: LayoutBounds3;
};

export type CompiledFloor = CompiledIdentity & {
	floorId: string;
	elevation: number;
	height: number;
	roomIds: string[];
	bounds3: LayoutBounds3 | null;
};

export type CompiledLayoutObject = CompiledIdentity & {
	objectId: string;
	kind: LayoutObjectKind;
	position: Vec3;
	rotation: Vec3;
	dimensions: Vec3;
	roomId?: string;
	readonly: boolean;
	worldAabb: { min: Vec3; max: Vec3 };
	planFootprint: LayoutVec2[];
};

export type LayoutObjectKind = 'box' | 'plane' | 'cylinder' | 'sphere' | 'profile';

export type CompiledQueryPoint = CompiledIdentity & {
	kind: 'vertex' | 'interior-anchor';
	point: LayoutVec2;
	aabb: LayoutBounds2;
	sourceId: string;
	floorId: string;
	roomId: string;
	segmentId: string;
	sourceIndex: number;
};
export type CompiledQuerySpan = CompiledIdentity & {
	kind: 'wall' | 'opening' | 'solid';
	start: LayoutVec2;
	end: LayoutVec2;
	startDistance: number;
	endDistance: number;
	aabb: LayoutBounds2;
	sourceId: string;
	floorId: string;
	roomId: string;
	segmentId: string;
	openingId?: string;
};
export type CompiledQueryPolygon = CompiledIdentity & {
	kind: 'room-floor' | 'object-footprint';
	polygon: LayoutVec2[];
	aabb: LayoutBounds2;
	sourceId: string;
	floorId?: string;
	roomId?: string;
	objectId?: string;
};
export type CompiledQueryAabb = CompiledIdentity & {
	kind: 'room' | 'wall' | 'opening' | 'object' | 'floor' | 'document';
	aabb: LayoutBounds2;
	sourceId: string;
};

export type CompiledLayoutQueryGeometry = {
	points: CompiledQueryPoint[];
	spans: CompiledQuerySpan[];
	polygons: CompiledQueryPolygon[];
	aabbs: CompiledQueryAabb[];
};

export type CompiledLayoutGeometry = {
	floors: CompiledFloor[];
	rooms: CompiledRoom[];
	objects: CompiledLayoutObject[];
	queries: CompiledLayoutQueryGeometry;
	bounds: LayoutBounds3 | null;
};

export type CompiledLayoutGeometryResult = {
	geometry: CompiledLayoutGeometry;
	issues: LayoutGeometryIssue[];
};

/**
 * Collision-safe tuple serialization for identity keys. Unlike delimiter
 * parsing, every tuple element is length-prefixed so values cannot collide.
 */
export function geometryId(parts: readonly string[]): string {
	let length = 0;
	for (const part of parts) length += part.length;
	let output = `${parts.length}:`;
	for (const part of parts) output += `${part.length}:${part}`;
	return output;
}
