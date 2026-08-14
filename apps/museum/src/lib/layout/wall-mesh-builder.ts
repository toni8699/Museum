import type { LayoutVec2 } from './layout-types';
import type {
	CompiledOpening,
	CompiledRoom,
	CompiledWall,
	CompiledWallSection,
	LayoutBounds3,
	LayoutGeometryIssue
} from './layout-geometry-types';
import { archProfileTopAt, LAYOUT_GEOMETRY_EPSILON } from './layout-geometry-openings';
import { sampledPolylineSelfIntersects, type CurveSample } from './layout-geometry-curve';

/**
 * Pure, renderer-neutral indexed wall mesh for one room. Positions/normals are
 * world-space XYZ; `uvs` are raw metric (`u` = arc length in meters, `v` =
 * height above the room floor in meters). `indices` are laid out surface-major
 * so each `materialGroups` entry is one contiguous draw-call range.
 */
export type WallMeshSectionRef = {
	roomId: string;
	segmentId: string;
	sectionIndex: number;
	openingId?: string;
	kind: 'side' | 'lintel';
};

export type WallMeshSurfaceKey = string;

export type IndexedWallMeshGroup = {
	surfaceKey: WallMeshSurfaceKey;
	start: number;
	count: number;
};

export type IndexedWallMesh = {
	roomId: string;
	positions: Float32Array; // world XYZ
	normals: Float32Array; // world XYZ
	uvs: Float32Array; // [u = arc length, v = height above floor]
	indices: Uint32Array; // surface-major
	materialGroups: IndexedWallMeshGroup[];
	sectionToRange: Array<WallMeshSectionRef & { surfaceKey: WallMeshSurfaceKey; start: number; count: number }>;
	wallRanges: Array<{ segmentId: string; ranges: Array<{ start: number; count: number }> }>;
	bounds: LayoutBounds3;
};

export type WallMeshOptions = {
	weldTolerance?: number;
	miterLimit?: number;
	classifySurface?: (ref: WallMeshSectionRef) => WallMeshSurfaceKey;
	/**
	 * When true, fail the build if any triangle's geometric (winding) normal
	 * disagrees with its stored normal. Development guard: it catches winding
	 * regressions and also surfaces faces whose stored normals are not yet
	 * derived from their geometry (e.g. sloped arch undersides).
	 */
	assertWinding?: boolean;
};

export type WallMeshBuildResult = {
	mesh?: IndexedWallMesh;
	issues: LayoutGeometryIssue[];
};

type V3 = [number, number, number];

type Vertex = { p: V3; n: V3; u: number; v: number };
type Face = { verts: Vertex[] };

type ClipSample = {
	point: LayoutVec2;
	tangent: LayoutVec2;
	normal: LayoutVec2;
	distance: number;
	corner: 'start' | 'end' | null;
};

/**
 * One side of a wall-junction corner. A miter shares a single apex point with
 * the adjacent wall; a bevel (past the miter limit) keeps the two walls'
 * offset points distinct (`a0` on the previous wall's offset line, `b0` on the
 * current wall's). `fold` marks a 180° junction reversal and fails the build.
 */
type CornerSide =
	| { kind: 'miter'; apex: LayoutVec2 }
	| { kind: 'bevel'; a0: LayoutVec2; b0: LayoutVec2 }
	| { kind: 'fold'; a0: LayoutVec2; b0: LayoutVec2 };

type Corner = { front: CornerSide; back: CornerSide };

type SectionFaces = {
	ref: WallMeshSectionRef;
	surfaceKey: WallMeshSurfaceKey;
	faces: Face[];
};

type RevealFaces = {
	openingId: string;
	surfaceKey: WallMeshSurfaceKey;
	faces: Face[];
};

/**
 * Beveled-corner bridge: the joint at this wall's START (owner = current/start
 * wall). The emitted index range is referenced by BOTH adjacent walls'
 * `wallRanges`; its surface key comes from a synthetic `WallMeshSectionRef`
 * through the consumer's classifier so bridge faces join the same material
 * group as the walls (never an extra draw call). Synthetic refs stay out of
 * `sectionToRange`.
 */
type BridgeFaces = {
	neighborSegmentId: string;
	surfaceKey: WallMeshSurfaceKey;
	faces: Face[];
};

type WallFaces = {
	segmentId: string;
	sections: SectionFaces[];
	reveals: RevealFaces[];
	bridges: BridgeFaces[];
};

const DEFAULT_WELD_TOLERANCE = 1e-4;
const DEFAULT_MITER_LIMIT = 4;
const NORMAL_GRID = 1e-3;
const UV_GRID = 1e-4;
const WINDING_DEGENERATE_AREA = 1e-12;

/**
 * Build one watertight, surface-major `IndexedWallMesh` for a room. Unsafe
 * inputs (offset overlap, invalid thickness, degenerate walls) produce
 * structured issues and no mesh — the consumer fails closed.
 */
export function buildRoomWallMesh(room: CompiledRoom, options: WallMeshOptions = {}): WallMeshBuildResult {
	const issues = validateRoom(room);
	if (issues.length > 0) return { mesh: undefined, issues };

	const overlapIssues = detectOffsetOverlap(room);
	if (overlapIssues.length > 0) return { mesh: undefined, issues: overlapIssues };

	const classify = options.classifySurface ?? ((ref: WallMeshSectionRef) => ref.kind);
	const weldTolerance = options.weldTolerance ?? DEFAULT_WELD_TOLERANCE;

	const wallResult = buildAllWallFaces(room, options, classify);
	if (wallResult.issues.length > 0) return { mesh: undefined, issues: wallResult.issues };
	const mesh = emitMesh(room.roomId, wallResult.wallsFaces, classify, weldTolerance);
	if (options.assertWinding) assertWindingAgreesWithNormals(mesh);
	return { mesh, issues: [] };
}

function validateRoom(room: CompiledRoom): LayoutGeometryIssue[] {
	const issues: LayoutGeometryIssue[] = [];
	if (room.walls.length === 0) {
		issues.push({ path: `rooms.${room.roomId}`, code: 'room_no_walls', message: 'Room has no walls to build a mesh for.', targetId: room.roomId });
		return issues;
	}
	if (!Number.isFinite(room.wallThickness) || room.wallThickness <= 0) {
		issues.push({ path: `rooms.${room.roomId}`, code: 'wall_thickness_invalid', message: 'Room wall thickness must be finite and greater than zero.', targetId: room.roomId });
	}
	for (const wall of room.walls) {
		if (wall.samples.length < 2) {
			issues.push({ path: `rooms.${room.roomId}.walls.${wall.segmentId}`, code: 'wall_degenerate', message: 'Wall has too few samples to build a mesh.', targetId: wall.segmentId });
		}
		if (!Number.isFinite(wall.thickness) || wall.thickness <= 0) {
			issues.push({ path: `rooms.${room.roomId}.walls.${wall.segmentId}`, code: 'wall_thickness_invalid', message: 'Wall thickness must be finite and greater than zero.', targetId: wall.segmentId });
		}
	}
	return issues;
}

/**
 * Reject offset-overlap: local curvature folds (offset polyline self-intersects)
 * and global overlaps (non-adjacent walls, or non-adjacent samples of one wall,
 * closer than the wall thickness so their `±thickness/2` offsets overlap).
 */
function detectOffsetOverlap(room: CompiledRoom): LayoutGeometryIssue[] {
	const issues: LayoutGeometryIssue[] = [];
	for (const wall of room.walls) {
		const half = wall.thickness / 2;
		const front = offsetSamples(wall.samples, half);
		const back = offsetSamples(wall.samples, -half);
		if (sampledPolylineSelfIntersects(front) || sampledPolylineSelfIntersects(back)) {
			issues.push({
				path: `rooms.${room.roomId}.walls.${wall.segmentId}`,
				code: 'wall_offset_fold',
				message: 'Wall offset folds or self-intersects (curve radius smaller than half the wall thickness).',
				targetId: wall.segmentId
			});
		}
		if (polylineSelfClearance(wall.samples, wall.thickness)) {
			issues.push({
				path: `rooms.${room.roomId}.walls.${wall.segmentId}`,
				code: 'wall_offset_overlap',
				message: 'Wall passes closer than its thickness to itself (narrow neck); offset regions overlap.',
				targetId: wall.segmentId
			});
		}
	}

	const count = room.walls.length;
	for (let i = 0; i < count; i += 1) {
		for (let j = i + 1; j < count; j += 1) {
			if (j === i + 1 || (i === 0 && j === count - 1)) continue; // adjacent walls share a corner
			const a = room.walls[i]!;
			const b = room.walls[j]!;
			const clearance = minPolylineDistance(a.samples, b.samples);
			if (clearance < a.thickness / 2 + b.thickness / 2) {
				issues.push({
					path: `rooms.${room.roomId}`,
					code: 'wall_clearance_insufficient',
					message: `Walls ${a.segmentId} and ${b.segmentId} are closer than their combined thickness; offset regions overlap.`,
					targetId: room.roomId
				});
			}
		}
	}
	return issues;
}

function offsetSamples(samples: readonly CurveSample[], half: number): CurveSample[] {
	return samples.map((sample) => ({
		point: [sample.point[0] + half * sample.normal[0], sample.point[1] + half * sample.normal[1]] as LayoutVec2,
		distance: sample.distance,
		tangent: sample.tangent,
		normal: sample.normal,
		t: sample.t
	}));
}

function buildAllWallFaces(
	room: CompiledRoom,
	options: WallMeshOptions,
	classify: (ref: WallMeshSectionRef) => WallMeshSurfaceKey
): { wallsFaces: WallFaces[]; issues: LayoutGeometryIssue[] } {
	const cornerResult = computeCorners(room.walls, options.miterLimit ?? DEFAULT_MITER_LIMIT, room);
	if (cornerResult.issues.length > 0) return { wallsFaces: [], issues: cornerResult.issues };
	const corners = cornerResult.corners;
	const wallHeight = room.ceilingElevation - room.floorElevation;
	const roomBreakpoints = roomHeightBreakpoints(room);
	const count = room.walls.length;
	const wallsFaces = room.walls.map((wall, index) => {
		const cornerStart = corners[index]!;
		const cornerEnd = corners[(index + 1) % count]!;
		const prevWall = room.walls[(index - 1 + count) % count]!;
		const nextWall = room.walls[(index + 1) % count]!;
		return buildWallFaces(room, wall, prevWall, nextWall, cornerStart, cornerEnd, wallHeight, roomBreakpoints, classify);
	});
	return { wallsFaces, issues: [] };
}

function buildWallFaces(
	room: CompiledRoom,
	wall: CompiledWall,
	prevWall: CompiledWall,
	nextWall: CompiledWall,
	cornerStart: Corner,
	cornerEnd: Corner,
	wallHeight: number,
	roomBreakpoints: readonly number[],
	classify: (ref: WallMeshSectionRef) => WallMeshSurfaceKey
): WallFaces {
	const half = wall.thickness / 2;
	const sections: SectionFaces[] = [];
	for (const [sectionIndex, section] of wall.sections.entries()) {
		const ref: WallMeshSectionRef = {
			roomId: room.roomId,
			segmentId: wall.segmentId,
			sectionIndex,
			...(section.openingId ? { openingId: section.openingId } : {}),
			kind: section.kind
		};
		const surfaceKey = classify(ref);
		const faces = buildSectionFaces(room, wall, section, half, cornerStart, cornerEnd, roomBreakpoints);
		if (faces.length > 0) sections.push({ ref, surfaceKey, faces });
	}

	const reveals: RevealFaces[] = [];
	for (const opening of wall.openings) {
		const surfaceKey = classify({
			roomId: room.roomId,
			segmentId: wall.segmentId,
			sectionIndex: -1,
			...(opening.openingId ? { openingId: opening.openingId } : {}),
			kind: 'side'
		});
		const faces = buildRevealFaces(room, wall, prevWall, nextWall, opening, half, wallHeight, roomBreakpoints, cornerStart, cornerEnd);
		if (faces.length > 0) reveals.push({ openingId: opening.openingId, surfaceKey, faces });
	}

	// Beveled joint at this wall's start (the corner shared with `prevWall`).
	const bridges: BridgeFaces[] = [];
	const bridge = buildStartBridgeFaces(room, prevWall, wall, cornerStart, wallHeight, roomBreakpoints, classify);
	if (bridge) bridges.push(bridge);

	return { segmentId: wall.segmentId, sections, reveals, bridges };
}

function buildSectionFaces(
	room: CompiledRoom,
	wall: CompiledWall,
	section: CompiledWallSection,
	half: number,
	cornerStart: Corner,
	cornerEnd: Corner,
	roomBreakpoints: readonly number[]
): Face[] {
	// Lintel bottoms follow the arch profile, so merge its topBoundary knots into
	// the clip: the underside and front-face bottom edge tessellate at profile
	// resolution instead of the (coarser) wall-sample spacing, and the pointed
	// apex lands exactly on a knot rather than vanishing between samples.
	const clip = clipSectionSamples(wall.samples, section.startDistance, section.endDistance, [
		...lintelProfileKnotDistances(section),
		...lintelBandIntersectionDistances(section, roomBreakpoints)
	]);
	if (clip.length < 2) return [];
	const faces: Face[] = [];
	const isLintel = section.kind === 'lintel';
	const topY = section.topY;
	const floorElevation = room.floorElevation;

	for (let index = 1; index < clip.length; index += 1) {
		const a = clip[index - 1]!;
		const b = clip[index]!;
		const bottomA = sectionBottomAt(section, a.distance);
		const bottomB = sectionBottomAt(section, b.distance);

		const frontA = cornerPoint(a, half, cornerStart, cornerEnd);
		const frontB = cornerPoint(b, half, cornerStart, cornerEnd);
		const backA = cornerPoint(a, -half, cornerStart, cornerEnd);
		const backB = cornerPoint(b, -half, cornerStart, cornerEnd);

		const yTop = floorElevation + topY;
		const yBottomA = floorElevation + bottomA;
		const yBottomB = floorElevation + bottomB;

		const nA = a.normal;
		const nB = b.normal;

		// Front/back faces (+normal / −normal), wound so the geometric normal
		// agrees with the stored normal (FrontSide-safe). Split into vertical
		// bands at the room-wide breakpoints so coincident edges stay welded.
		const bands = segmentBands(bottomA, bottomB, topY, roomBreakpoints);
		for (let k = 1; k < bands.length; k += 1) {
			const lo = bands[k - 1]!;
			const hi = bands[k]!;
			const yLoA = clamp(bottomA, lo, hi);
			const yLoB = clamp(bottomB, lo, hi);
			// A sloped (arch) bottom spans the band even when only one endpoint is
			// below `hi`; skip only when BOTH clamped bottoms reach the band top.
			if (hi - Math.min(yLoA, yLoB) <= LAYOUT_GEOMETRY_EPSILON) continue;
			const yLoAWorld = floorElevation + yLoA;
			const yLoBWorld = floorElevation + yLoB;
			const yHiWorld = floorElevation + hi;
			pushBandFace(faces,
				vertex(frontA[0], yHiWorld, frontA[1], nA[0], 0, nA[1], a.distance, hi),
				vertex(frontA[0], yLoAWorld, frontA[1], nA[0], 0, nA[1], a.distance, yLoA),
				vertex(frontB[0], yLoBWorld, frontB[1], nB[0], 0, nB[1], b.distance, yLoB),
				vertex(frontB[0], yHiWorld, frontB[1], nB[0], 0, nB[1], b.distance, hi)
			);
			pushBandFace(faces,
				vertex(backB[0], yHiWorld, backB[1], -nB[0], 0, -nB[1], b.distance, hi),
				vertex(backB[0], yLoBWorld, backB[1], -nB[0], 0, -nB[1], b.distance, yLoB),
				vertex(backA[0], yLoAWorld, backA[1], -nA[0], 0, -nA[1], a.distance, yLoA),
				vertex(backA[0], yHiWorld, backA[1], -nA[0], 0, -nA[1], a.distance, hi)
			);
		}

		// Top face (at topY, +Y).
		faces.push(quad(
			vertex(frontA[0], yTop, frontA[1], 0, 1, 0, a.distance, wall.thickness),
			vertex(frontB[0], yTop, frontB[1], 0, 1, 0, b.distance, wall.thickness),
			vertex(backB[0], yTop, backB[1], 0, 1, 0, b.distance, 0),
			vertex(backA[0], yTop, backA[1], 0, 1, 0, a.distance, 0)
		));

		// Bottom face: floor for side sections, arch underside for lintels. The
		// normal comes from the quad's own geometry so sloped arch undersides
		// tilt with the profile instead of always facing straight down (−Y).
		if (isLintel || bottomA <= LAYOUT_GEOMETRY_EPSILON) {
			const p0: V3 = [backA[0], yBottomA, backA[1]];
			const p1: V3 = [backB[0], yBottomB, backB[1]];
			const p2: V3 = [frontB[0], yBottomB, frontB[1]];
			const p3: V3 = [frontA[0], yBottomA, frontA[1]];
			const undersideNormal = quadNormal(p0, p1, p2);
			faces.push(quad(
				vertex(p0[0], p0[1], p0[2], undersideNormal[0], undersideNormal[1], undersideNormal[2], a.distance, 0),
				vertex(p1[0], p1[1], p1[2], undersideNormal[0], undersideNormal[1], undersideNormal[2], b.distance, 0),
				vertex(p2[0], p2[1], p2[2], undersideNormal[0], undersideNormal[1], undersideNormal[2], b.distance, wall.thickness),
				vertex(p3[0], p3[1], p3[2], undersideNormal[0], undersideNormal[1], undersideNormal[2], a.distance, wall.thickness)
			));
		}
	}
	return faces;
}

function buildRevealFaces(
	room: CompiledRoom,
	wall: CompiledWall,
	prevWall: CompiledWall,
	nextWall: CompiledWall,
	opening: CompiledOpening,
	half: number,
	wallHeight: number,
	roomBreakpoints: readonly number[],
	cornerStart: Corner,
	cornerEnd: Corner
): Face[] {
	const floorElevation = room.floorElevation;
	// The jamb face ends where the arch spring begins: for rectangular openings
	// the spring is the full height; for rounded/pointed it is `height - rise`.
	const springHeight = opening.profileShape ? opening.profileShape.height - opening.profileShape.rise : opening.height;
	const revealBottom = opening.sillHeight;
	const revealTop = Math.min(opening.sillHeight + springHeight, wallHeight);
	if (revealTop <= revealBottom + LAYOUT_GEOMETRY_EPSILON) return [];

	const faces: Face[] = [];
	const bands = segmentBands(revealBottom, revealBottom, revealTop, roomBreakpoints);
	const sides: Array<{ distance: number; sign: number }> = [
		{ distance: opening.offset, sign: 1 },
		{ distance: opening.offset + opening.width, sign: -1 }
	];
	// Jambs at the wall's endpoints use the same profile-aware corner
	// coordinates as the sections: a mitered corner shares the apex with the
	// adjacent wall, a beveled corner resolves to this wall's own offset point
	// (which then welds into the bevel bridge). Two endpoint cases emit no
	// jamb: at a beveled corner the wall's end plane is interior to the corner
	// void (the door void merges with it, and the bridge caps close the rest);
	// and at a mitered end where the NEXT wall also opens at its start, both
	// reveals would emit the same corner-plane jamb.
	const length = wall.samples.at(-1)!.distance;
	for (const side of sides) {
		const atStart = side.distance <= LAYOUT_GEOMETRY_EPSILON;
		const atEnd = side.distance >= length - LAYOUT_GEOMETRY_EPSILON;
		const corner = atStart ? cornerStart : atEnd ? cornerEnd : null;
		if (corner) {
			// At a beveled corner the wall's end plane is interior to the corner
			// void: the door void merges with it, and the bridge's caps close the
			// rest, so the flat jamb face (and its un-weldable rim) is skipped.
			const beveled = corner.front.kind === 'bevel' || corner.back.kind === 'bevel';
			if (beveled) continue;
			// Both-open miter: the previous wall (opening ends here) and this wall
			// (opening starts here) would each emit a corner-plane jamb at a
			// mitered corner. Both jambs are interior to the merged opening void,
			// so suppress both; the profile-difference reveal (if the two openings
			// differ) is emitted once by the corner bridge instead.
			if (atEnd && wallOpensAtStart(nextWall)) continue;
			if (atStart && wallOpensAtEnd(prevWall)) continue;
		}
		const sample = sampleAt(wall.samples, side.distance);
		const clip: ClipSample = {
			...sample,
			corner:
				side.distance <= LAYOUT_GEOMETRY_EPSILON
					? 'start'
					: side.distance >= length - LAYOUT_GEOMETRY_EPSILON
						? 'end'
						: null
		};
		const tx = side.sign * sample.tangent[0];
		const tz = side.sign * sample.tangent[1];
		const front = cornerPoint(clip, half, cornerStart, cornerEnd);
		const back = cornerPoint(clip, -half, cornerStart, cornerEnd);
		for (let k = 1; k < bands.length; k += 1) {
			const lo = bands[k - 1]!;
			const hi = bands[k]!;
			const yLo = floorElevation + lo;
			const yHi = floorElevation + hi;
			const frontTop = vertex(front[0], yHi, front[1], tx, 0, tz, wall.thickness, hi);
			const backTop = vertex(back[0], yHi, back[1], tx, 0, tz, 0, hi);
			const backBottom = vertex(back[0], yLo, back[1], tx, 0, tz, 0, lo);
			const frontBottom = vertex(front[0], yLo, front[1], tx, 0, tz, wall.thickness, lo);
			// Winding must agree with the stored normal `sign * tangent`. The
			// opening-end jamb (−sign) is already front→back→back-bottom→front-bottom;
			// the opening-start jamb (+sign) needs the opposite order.
			faces.push(side.sign > 0 ? quad(frontTop, frontBottom, backBottom, backTop) : quad(frontTop, backTop, backBottom, frontBottom));
		}
	}
	return faces;
}

function sectionBottomAt(section: CompiledWallSection, distance: number): number {
	if (section.kind !== 'lintel' || !section.profile || section.profile.kind === 'rectangular') return section.bottomY;
	const local = clamp(distance - section.startDistance, 0, section.profile.width);
	const top = archProfileTopAt(section.profile, local);
	return Math.min(section.topY, (section.profileBaseY ?? 0) + top);
}

/** True when a wall carries an opening that starts exactly at its first sample (offset 0). */
function wallOpensAtStart(wall: CompiledWall): boolean {
	return wall.openings.some((opening) => opening.offset <= LAYOUT_GEOMETRY_EPSILON);
}

/** True when a wall carries an opening that ends exactly at its last sample (offset + width === length). */
function wallOpensAtEnd(wall: CompiledWall): boolean {
	const length = wall.samples.at(-1)?.distance ?? 0;
	return wall.openings.some((opening) => opening.offset + opening.width >= length - LAYOUT_GEOMETRY_EPSILON);
}

/**
 * Room-wide set of vertical breakpoints (y above the floor) at which every wall
 * face must split: the sill and spring heights of every opening. Splitting all
 * faces at the same union of heights keeps coincident vertical edges — across
 * sections, reveals, lintels, and room corners — welded without T-junctions.
 */
function roomHeightBreakpoints(room: CompiledRoom): number[] {
	const wallHeight = room.ceilingElevation - room.floorElevation;
	const breakpoints = new Set<number>();
	for (const wall of room.walls) {
		for (const opening of wall.openings) {
			const springHeight = opening.profileShape ? opening.profileShape.height - opening.profileShape.rise : opening.height;
			if (opening.sillHeight > LAYOUT_GEOMETRY_EPSILON) breakpoints.add(opening.sillHeight);
			const spring = opening.sillHeight + springHeight;
			if (spring > LAYOUT_GEOMETRY_EPSILON && spring < wallHeight - LAYOUT_GEOMETRY_EPSILON) breakpoints.add(spring);
		}
	}
	return [...breakpoints].sort((a, b) => a - b);
}

/**
 * Sorted band boundaries (y above the floor) splitting one segment's vertical
 * span [min(bottomA, bottomB), top] at every room breakpoint inside it. The
 * returned list always includes the span's own minimum and top.
 */
function segmentBands(bottomA: number, bottomB: number, top: number, roomBreakpoints: readonly number[]): number[] {
	const min = Math.min(bottomA, bottomB);
	const candidates = [min, top];
	for (const y of roomBreakpoints) {
		if (y > min + LAYOUT_GEOMETRY_EPSILON && y < top - LAYOUT_GEOMETRY_EPSILON) candidates.push(y);
	}
	candidates.sort((a, b) => a - b);
	const bands: number[] = [];
	let previous = -Infinity;
	for (const y of candidates) {
		if (y - previous > LAYOUT_GEOMETRY_EPSILON) {
			bands.push(y);
			previous = y;
		}
	}
	return bands;
}

function computeCorners(
	walls: readonly CompiledWall[],
	miterLimit: number,
	room: CompiledRoom
): { corners: Corner[]; issues: LayoutGeometryIssue[] } {
	const count = walls.length;
	const corners: Corner[] = [];
	const issues: LayoutGeometryIssue[] = [];
	for (let i = 0; i < count; i += 1) {
		const prev = walls[(i - 1 + count) % count]!;
		const cur = walls[i]!;
		const junction = cur.samples[0]!.point;
		const half = cur.thickness / 2;
		const dirA = prev.samples.at(-1)!.tangent;
		const nA = prev.samples.at(-1)!.normal;
		const dirB = cur.samples[0]!.tangent;
		const nB = cur.samples[0]!.normal;
		const front = cornerSide(junction, dirA, nA, dirB, nB, half, miterLimit);
		const back = cornerSide(junction, dirA, nA, dirB, nB, -half, miterLimit);
		if (front.kind === 'fold' || back.kind === 'fold') {
			issues.push({
				path: `rooms.${room.roomId}.walls.${cur.segmentId}`,
				code: 'wall_corner_fold',
				message: 'Wall junction folds back on itself (180° turn); offset regions would overlap.',
				targetId: cur.segmentId
			});
		}
		corners.push({ front, back });
	}
	return { corners, issues };
}

/**
 * Resolve one side of a junction. Intersects the two `sign`-sided offset lines
 * into a miter apex; past the miter limit the corner is a `bevel` keeping both
 * offset points (`a0` = previous wall, `b0` = current wall). Collinear
 * continuations (`det ≈ 0`, same direction) stay miter; 180° folds (opposite
 * direction) are rejected with a `fold` so the build fails closed.
 */
function cornerSide(
	junction: LayoutVec2,
	dirA: LayoutVec2,
	nA: LayoutVec2,
	dirB: LayoutVec2,
	nB: LayoutVec2,
	signHalf: number,
	miterLimit: number
): CornerSide {
	const a0: LayoutVec2 = [junction[0] + signHalf * nA[0], junction[1] + signHalf * nA[1]];
	const b0: LayoutVec2 = [junction[0] + signHalf * nB[0], junction[1] + signHalf * nB[1]];
	const det = dirA[0] * dirB[1] - dirA[1] * dirB[0];
	const dot = dirA[0] * dirB[0] + dirA[1] * dirB[1];
	if (Math.abs(det) < 1e-9) {
		if (dot < 0) return { kind: 'fold', a0, b0 };
		return { kind: 'miter', apex: a0 }; // collinear continuation (a0 ≈ b0)
	}
	const dx = b0[0] - a0[0];
	const dy = b0[1] - a0[1];
	const u = (dx * dirB[1] - dy * dirB[0]) / det;
	const point: LayoutVec2 = [a0[0] + u * dirA[0], a0[1] + u * dirA[1]];
	const half = Math.abs(signHalf);
	if (half > 0 && Math.hypot(point[0] - junction[0], point[1] - junction[1]) > miterLimit * half) {
		return { kind: 'bevel', a0, b0 };
	}
	return { kind: 'miter', apex: point };
}

function cornerPoint(sample: ClipSample, half: number, cornerStart: Corner, cornerEnd: Corner): LayoutVec2 {
	if (sample.corner === 'start') return sidePoint(cornerStart, half >= 0 ? 'front' : 'back', 'current');
	if (sample.corner === 'end') return sidePoint(cornerEnd, half >= 0 ? 'front' : 'back', 'previous');
	return [sample.point[0] + half * sample.normal[0], sample.point[1] + half * sample.normal[1]];
}

/**
 * Resolve a wall-end sample to its own corner coordinate: the shared miter
 * apex, or — for a bevel — the wall's own offset point (`b0` at the current
 * wall's start, `a0` at the previous wall's end). Keeping each wall on its own
 * offset line is what lets the bevel bridge weld without dragging a wall off
 * its line.
 */
function sidePoint(corner: Corner, side: 'front' | 'back', wall: 'previous' | 'current'): LayoutVec2 {
	const s = corner[side];
	if (s.kind === 'miter') return s.apex;
	return wall === 'previous' ? s.a0 : s.b0;
}

/**
 * Beveled-corner bridge at this wall's START (the joint with `prevWall`).
 * Pure-miter corners emit nothing (zero-width). The bridge is a loft between
 * the two endpoint cross-sections, driven by the band state table:
 *
 *   both solid    → side quads over the beveled wedge edges
 *   previous only → cap the previous wall's end at its own offset plane
 *   current only  → cap the current wall's end at its own offset plane
 *   both open     → nothing (the corner void is part of the opening)
 *
 * plus horizontal wedge faces where the both-solid volume begins (−Y) or ends
 * (+Y), closing lintel/sill transitions without blocking doorway voids.
 * Endpoint profiles are vertical interval sets derived from the sections that
 * touch each wall's endpoint distance (arch lintels evaluate to their spring
 * height at the corner).
 */
function buildStartBridgeFaces(
	room: CompiledRoom,
	prevWall: CompiledWall,
	wall: CompiledWall,
	corner: Corner,
	wallHeight: number,
	roomBreakpoints: readonly number[],
	classify: (ref: WallMeshSectionRef) => WallMeshSurfaceKey
): BridgeFaces | null {
	const front = corner.front;
	const back = corner.back;
	if (front.kind === 'fold' || back.kind === 'fold') return null;
	const isBevel = front.kind === 'bevel' || back.kind === 'bevel';
	// A pure-miter corner needs a bridge only when BOTH walls open at the
	// joint: the two openings merge into one corner void, so both jambs are
	// suppressed (see buildRevealFaces) and any profile mismatch is closed by
	// the band caps below. A single-sided opening is already closed by its
	// reveal jamb, and a fully solid corner welds at the shared apex — neither
	// needs a bridge here.
	const bothOpen = wallOpensAtEnd(prevWall) && wallOpensAtStart(wall);
	if (!isBevel && !bothOpen) return null;

	const prevProfile = endpointProfileIntervals(prevWall, true);
	const curProfile = endpointProfileIntervals(wall, false);

	const edges = new Set<number>([0, wallHeight]);
	for (const [lo, hi] of [...prevProfile, ...curProfile]) {
		edges.add(lo);
		edges.add(hi);
	}
	for (const y of roomBreakpoints) edges.add(y);
	const sorted = [...edges].sort((a, b) => a - b);

	const bands: Array<{ lo: number; hi: number; solidA: boolean; solidB: boolean }> = [];
	for (let i = 1; i < sorted.length; i += 1) {
		const lo = sorted[i - 1]!;
		const hi = sorted[i]!;
		if (hi - lo <= LAYOUT_GEOMETRY_EPSILON) continue;
		bands.push({ lo, hi, solidA: profileCovers(prevProfile, lo, hi), solidB: profileCovers(curProfile, lo, hi) });
	}
	if (bands.length === 0) return null;

	// Plan points per side (beveled offset points, or the shared apex for a
	// miter side). A single-sided bevel (front bevel, back miter — the common
	// convex case) degenerates the back wedge to the shared apex; a back bevel
	// (reflex corners) additionally opens an exterior void closed by `outer`.
	const frontA = front.kind === 'bevel' ? front.a0 : front.apex;
	const frontB = front.kind === 'bevel' ? front.b0 : front.apex;
	const backB = back.kind === 'bevel' ? back.b0 : back.apex;
	const backA = back.kind === 'bevel' ? back.a0 : back.apex;
	const outer = back.kind === 'bevel' ? backMiterApex(prevWall, wall) : null;

	const nA = prevWall.samples.at(-1)!.normal;
	const nB = wall.samples[0]!.normal;
	const dirA = prevWall.samples.at(-1)!.tangent;
	const dirB = wall.samples[0]!.tangent;

	const faces: Face[] = [];
	for (const band of bands) {
		const yLo = room.floorElevation + band.lo;
		const yHi = room.floorElevation + band.hi;
		if (band.solidA && band.solidB) {
			// Both walls solid: the chamfer closes the front (interior) gap; on
			// the back, the exterior void's two exposed faces (the walls' back-face
			// continuations) meet at `outer`. Never a full-height quad here: that
			// would block an endpoint doorway.
			if (front.kind === 'bevel') pushBridgeSide(faces, frontA, frontB, yLo, yHi, band.lo, band.hi, nA, nB, 1);
			if (back.kind === 'bevel' && outer) {
				pushBridgeCap(faces, backA, outer, yLo, yHi, band.lo, band.hi, nA, -1);
				pushBridgeCap(faces, backB, outer, yLo, yHi, band.lo, band.hi, nB, -1);
			}
		} else if (band.solidA) {
			// Previous wall only: cap its end plane (normal along its tangent).
			pushBridgeCap(faces, frontA, backA, yLo, yHi, band.lo, band.hi, dirA, 1);
		} else if (band.solidB) {
			// Current wall only: cap its start plane (normal opposite its tangent).
			pushBridgeCap(faces, frontB, backB, yLo, yHi, band.lo, band.hi, dirB, -1);
		}
	}

	// Horizontal wedge caps where the both-solid volume begins (−Y) or ends
	// (+Y): tri1 closes the strip-end edges (and the front chamfer), tri2 and
	// the sliver close the back void. Miter sides degenerate to zero area and
	// are skipped, so single-sided bevels emit only the triangles they need.
	for (let i = 0; i < bands.length; i += 1) {
		const band = bands[i]!;
		const solid = band.solidA && band.solidB;
		const belowSolid = i > 0 ? bands[i - 1]!.solidA && bands[i - 1]!.solidB : false;
		const aboveSolid = i < bands.length - 1 ? bands[i + 1]!.solidA && bands[i + 1]!.solidB : false;
		if (solid && !belowSolid) pushWedgeCaps(faces, frontA, frontB, backA, backB, outer, room.floorElevation + band.lo, band.lo, [0, -1, 0]);
		if (solid && !aboveSolid) pushWedgeCaps(faces, frontA, frontB, backA, backB, outer, room.floorElevation + band.hi, band.hi, [0, 1, 0]);
	}

	if (faces.length === 0) return null;
	const surfaceKey = classify({
		roomId: room.roomId,
		segmentId: wall.segmentId, // owner = current/start wall (deterministic ref)
		sectionIndex: -1,
		kind: 'side'
	});
	return { neighborSegmentId: prevWall.segmentId, surfaceKey, faces };
}

/** Unconstrained back-side miter apex: the corner of the exterior void. */
function backMiterApex(prevWall: CompiledWall, wall: CompiledWall): LayoutVec2 {
	const junction = wall.samples[0]!.point;
	const half = wall.thickness / 2;
	const dirA = prevWall.samples.at(-1)!.tangent;
	const nA = prevWall.samples.at(-1)!.normal;
	const dirB = wall.samples[0]!.tangent;
	const nB = wall.samples[0]!.normal;
	const a0: LayoutVec2 = [junction[0] - half * nA[0], junction[1] - half * nA[1]];
	const b0: LayoutVec2 = [junction[0] - half * nB[0], junction[1] - half * nB[1]];
	const det = dirA[0] * dirB[1] - dirA[1] * dirB[0];
	if (Math.abs(det) < 1e-9) return a0;
	const dx = b0[0] - a0[0];
	const dy = b0[1] - a0[1];
	const u = (dx * dirB[1] - dy * dirB[0]) / det;
	return [a0[0] + u * dirA[0], a0[1] + u * dirA[1]];
}

/**
 * Vertical interval set of a wall's endpoint cross-section: the union of all
 * sections whose interval includes the endpoint distance. Lintel bottoms
 * evaluate at the endpoint (arch spring height at the corner), so no 2D arch
 * polygon is needed.
 */
function endpointProfileIntervals(wall: CompiledWall, atEnd: boolean): Array<[number, number]> {
	const distance = atEnd ? (wall.samples.at(-1)?.distance ?? 0) : 0;
	const intervals: Array<[number, number]> = [];
	for (const section of wall.sections) {
		if (distance < section.startDistance - LAYOUT_GEOMETRY_EPSILON || distance > section.endDistance + LAYOUT_GEOMETRY_EPSILON) continue;
		if (section.kind === 'lintel') intervals.push([sectionBottomAt(section, distance), section.topY]);
		else intervals.push([section.bottomY, section.topY]);
	}
	intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const merged: Array<[number, number]> = [];
	for (const [lo, hi] of intervals) {
		if (hi <= lo + LAYOUT_GEOMETRY_EPSILON) continue;
		const last = merged.at(-1);
		if (last && lo <= last[1] + LAYOUT_GEOMETRY_EPSILON) last[1] = Math.max(last[1], hi);
		else merged.push([lo, hi]);
	}
	return merged;
}

function profileCovers(profile: ReadonlyArray<[number, number]>, lo: number, hi: number): boolean {
	return profile.some(([pLo, pHi]) => lo >= pLo - LAYOUT_GEOMETRY_EPSILON && hi <= pHi + LAYOUT_GEOMETRY_EPSILON);
}

/** Vertical bridge quad between two plan points `p` (previous wall) and `q` (current wall). */
function pushBridgeSide(
	faces: Face[],
	p: LayoutVec2,
	q: LayoutVec2,
	yLo: number,
	yHi: number,
	bandLo: number,
	bandHi: number,
	nA: LayoutVec2,
	nB: LayoutVec2,
	sign: 1 | -1
): void {
	const bx = nA[0] + nB[0];
	const bz = nA[1] + nB[1];
	const magnitude = Math.hypot(bx, bz) || 1;
	const span = Math.hypot(q[0] - p[0], q[1] - p[1]);
	pushOrientedFace(
		faces,
		[
			vertex(p[0], yHi, p[1], 0, 0, 0, 0, bandHi),
			vertex(q[0], yHi, q[1], 0, 0, 0, span, bandHi),
			vertex(q[0], yLo, q[1], 0, 0, 0, span, bandLo),
			vertex(p[0], yLo, p[1], 0, 0, 0, 0, bandLo)
		],
		[sign * (bx / magnitude), 0, sign * (bz / magnitude)]
	);
}

/** Cap face closing a wall's end at the corner plane (front point `p` → back point `q`). */
function pushBridgeCap(
	faces: Face[],
	p: LayoutVec2,
	q: LayoutVec2,
	yLo: number,
	yHi: number,
	bandLo: number,
	bandHi: number,
	dir: LayoutVec2,
	sign: 1 | -1
): void {
	const span = Math.hypot(q[0] - p[0], q[1] - p[1]);
	pushOrientedFace(
		faces,
		[
			vertex(p[0], yHi, p[1], 0, 0, 0, 0, bandHi),
			vertex(p[0], yLo, p[1], 0, 0, 0, 0, bandLo),
			vertex(q[0], yLo, q[1], 0, 0, 0, span, bandLo),
			vertex(q[0], yHi, q[1], 0, 0, 0, span, bandHi)
		],
		[sign * dir[0], 0, sign * dir[1]]
	);
}

/**
 * Horizontal wedge caps at height `y` (±Y normal) closing the both-solid
 * volume. Tri1 = (frontA, frontB, backA) welds the front chamfer to both
 * walls' strip-end edges; when the back is beveled, tri2 = (frontB, backB,
 * backA) closes the void's inner side and the sliver (backA, backB, outer)
 * closes its outer corner. Triangles with coincident vertices (miter side) are
 * skipped, so single-sided bevels emit only what is non-degenerate.
 */
function pushWedgeCaps(faces: Face[], frontA: LayoutVec2, frontB: LayoutVec2, backA: LayoutVec2, backB: LayoutVec2, outer: LayoutVec2 | null, y: number, bandY: number, normalY: V3): void {
	const v = (p: LayoutVec2) => vertex(p[0], y, p[1], 0, 0, 0, 0, bandY);
	const distinct = (a: LayoutVec2, b: LayoutVec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) > LAYOUT_GEOMETRY_EPSILON;
	if (distinct(frontA, frontB) && distinct(frontA, backA) && distinct(frontB, backA)) {
		pushOrientedFace(faces, [v(frontA), v(frontB), v(backA)], normalY);
	}
	if (outer && distinct(frontB, backB) && distinct(frontB, backA) && distinct(backB, backA)) {
		pushOrientedFace(faces, [v(frontB), v(backB), v(backA)], normalY);
	}
	if (outer && distinct(backA, backB) && distinct(backA, outer) && distinct(backB, outer)) {
		pushOrientedFace(faces, [v(backA), v(backB), v(outer)], normalY);
	}
}

/**
 * Emit a 3- or 4-vertex face whose geometric normal points along
 * `desiredNormal` (winding flipped if needed); the stored vertex normal is the
 * oriented geometric normal so the winding guard always agrees.
 */
function pushOrientedFace(faces: Face[], verts: Vertex[], desiredNormal: V3): void {
	const first = verts[0]!;
	const second = verts[1]!;
	const third = verts[2]!;
	const g = quadNormal(first.p, second.p, third.p);
	const dot = g[0] * desiredNormal[0] + g[1] * desiredNormal[1] + g[2] * desiredNormal[2];
	const oriented = dot >= 0 ? verts : flipWinding(verts);
	const n = quadNormal(oriented[0]!.p, oriented[1]!.p, oriented[2]!.p);
	faces.push({ verts: oriented.map((v) => ({ ...v, n })) });
}

function flipWinding(verts: Vertex[]): Vertex[] {
	if (verts.length === 3) return [verts[0]!, verts[2]!, verts[1]!];
	return [verts[0]!, verts[3]!, verts[2]!, verts[1]!];
}

function clipSectionSamples(
	samples: readonly CurveSample[],
	start: number,
	end: number,
	extraDistances: readonly number[] = []
): ClipSample[] {
	const length = samples.at(-1)!.distance;
	const interior: number[] = [];
	for (const sample of samples) {
		if (sample.distance > start + LAYOUT_GEOMETRY_EPSILON && sample.distance < end - LAYOUT_GEOMETRY_EPSILON) {
			interior.push(sample.distance);
		}
	}
	for (const distance of extraDistances) {
		if (distance > start + LAYOUT_GEOMETRY_EPSILON && distance < end - LAYOUT_GEOMETRY_EPSILON) {
			interior.push(distance);
		}
	}
	interior.sort((a, b) => a - b);

	const clip: ClipSample[] = [makeClipSample(samples, start, length)];
	let previous = start;
	for (const distance of interior) {
		if (distance - previous <= LAYOUT_GEOMETRY_EPSILON) continue; // dedupe coincident samples/knots
		clip.push(makeClipSample(samples, distance, length));
		previous = distance;
	}
	clip.push(makeClipSample(samples, end, length));
	return clip;
}

/** Arch-profile topBoundary x-coordinates mapped onto wall centerline distances. */
function lintelProfileKnotDistances(section: CompiledWallSection): number[] {
	if (section.kind !== 'lintel' || !section.profile) return [];
	return section.profile.topBoundary.map(([x]) => section.startDistance + x);
}

/**
 * Centerline distances where a lintel's piecewise-linear arch underside crosses
 * a room-wide vertical band breakpoint. The front/back faces are split into
 * bands at those heights; without splitting the arch at the exact crossing,
 * `clamp(bottomA/bottomB, lo, hi)` stair-steps the underside and leaves
 * singly-owned (gap) edges beside the slope.
 */
function lintelBandIntersectionDistances(
	section: CompiledWallSection,
	roomBreakpoints: readonly number[]
): number[] {
	if (section.kind !== 'lintel' || !section.profile || section.profile.kind === 'rectangular') return [];
	const span = [section.startDistance];
	for (const distance of lintelProfileKnotDistances(section)) {
		if (distance > section.startDistance + LAYOUT_GEOMETRY_EPSILON && distance < section.endDistance - LAYOUT_GEOMETRY_EPSILON) {
			span.push(distance);
		}
	}
	span.push(section.endDistance);
	const result: number[] = [];
	for (let i = 1; i < span.length; i += 1) {
		const d0 = span[i - 1]!;
		const d1 = span[i]!;
		const h0 = sectionBottomAt(section, d0);
		const h1 = sectionBottomAt(section, d1);
		if (Math.abs(h1 - h0) <= LAYOUT_GEOMETRY_EPSILON) continue;
		const lo = Math.min(h0, h1);
		const hi = Math.max(h0, h1);
		for (const y of roomBreakpoints) {
			if (y <= lo + LAYOUT_GEOMETRY_EPSILON || y >= hi - LAYOUT_GEOMETRY_EPSILON) continue;
			const t = (y - h0) / (h1 - h0);
			result.push(d0 + t * (d1 - d0));
		}
	}
	return result;
}

function makeClipSample(samples: readonly CurveSample[], distance: number, length: number): ClipSample {
	const sample = sampleAt(samples, distance);
	return { ...sample, corner: distance <= LAYOUT_GEOMETRY_EPSILON ? 'start' : distance >= length - LAYOUT_GEOMETRY_EPSILON ? 'end' : null };
}

function sampleAt(samples: readonly CurveSample[], distance: number): { point: LayoutVec2; tangent: LayoutVec2; normal: LayoutVec2; distance: number } {
	if (samples.length === 0) return { point: [0, 0], tangent: [1, 0], normal: [0, 1], distance: 0 };
	if (samples.length === 1) {
		const s = samples[0]!;
		return { point: [...s.point] as LayoutVec2, tangent: s.tangent, normal: s.normal, distance: s.distance };
	}
	const last = samples.at(-1)!;
	const target = Math.min(last.distance, Math.max(0, distance));
	for (let index = 1; index < samples.length; index += 1) {
		const start = samples[index - 1]!;
		const end = samples[index]!;
		if (target <= end.distance + 1e-9) {
			const span = end.distance - start.distance;
			const amount = span > 1e-9 ? (target - start.distance) / span : 0;
			const tx = start.tangent[0] + (end.tangent[0] - start.tangent[0]) * amount;
			const tz = start.tangent[1] + (end.tangent[1] - start.tangent[1]) * amount;
			const magnitude = Math.hypot(tx, tz) || 1;
			return {
				point: [
					start.point[0] + (end.point[0] - start.point[0]) * amount,
					start.point[1] + (end.point[1] - start.point[1]) * amount
				],
				tangent: [tx / magnitude, tz / magnitude],
				normal: [-tz / magnitude, tx / magnitude],
				distance: target
			};
		}
	}
	return { point: [...last.point] as LayoutVec2, tangent: last.tangent, normal: last.normal, distance: last.distance };
}

function vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): Vertex {
	return { p: [x, y, z], n: [nx, ny, nz], u, v };
}

function quad(a: Vertex, b: Vertex, c: Vertex, d: Vertex): Face {
	return { verts: [a, b, c, d] };
}

/**
 * Emit a vertical band face with `a`/`d` as top corners and `b`/`c` as bottom
 * corners. When a sloped arch bottom meets the band top at one end, that end's
 * bottom corner coincides with its top corner — collapse the quad to a triangle
 * (preserving winding) instead of emitting a zero-area second triangle.
 */
function pushBandFace(faces: Face[], a: Vertex, b: Vertex, c: Vertex, d: Vertex): void {
	const same = (p: Vertex, q: Vertex) =>
		Math.hypot(p.p[0] - q.p[0], p.p[1] - q.p[1], p.p[2] - q.p[2]) <= LAYOUT_GEOMETRY_EPSILON;
	if (same(b, a)) {
		faces.push({ verts: [a, c, d] });
		return;
	}
	if (same(c, d)) {
		faces.push({ verts: [a, b, d] });
		return;
	}
	faces.push(quad(a, b, c, d));
}

/** Unit geometric normal of a quad's first triangle (right-hand rule), matching its winding. */
function quadNormal(a: V3, b: V3, c: V3): V3 {
	const ux = b[0] - a[0];
	const uy = b[1] - a[1];
	const uz = b[2] - a[2];
	const vx = c[0] - a[0];
	const vy = c[1] - a[1];
	const vz = c[2] - a[2];
	const nx = uy * vz - uz * vy;
	const ny = uz * vx - ux * vz;
	const nz = ux * vy - uy * vx;
	const magnitude = Math.hypot(nx, ny, nz);
	if (magnitude <= WINDING_DEGENERATE_AREA) return [0, -1, 0]; // degenerate: fall back to −Y
	return [nx / magnitude, ny / magnitude, nz / magnitude];
}

function emitMesh(
	roomId: string,
	wallsFaces: WallFaces[],
	classify: (ref: WallMeshSectionRef) => WallMeshSurfaceKey,
	weldTolerance: number
): IndexedWallMesh {
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	const weld = new Map<string, number>();
	const materialGroups: IndexedWallMeshGroup[] = [];
	const sectionToRange: IndexedWallMesh['sectionToRange'] = [];
	const wallRanges: IndexedWallMesh['wallRanges'] = [];
	let min: V3 = [Infinity, Infinity, Infinity];
	let max: V3 = [-Infinity, -Infinity, -Infinity];

	function vertexIndex(vertex: Vertex): number {
		const key = `${Math.round(vertex.p[0] / weldTolerance)},${Math.round(vertex.p[1] / weldTolerance)},${Math.round(vertex.p[2] / weldTolerance)}|${Math.round(vertex.n[0] / NORMAL_GRID)},${Math.round(vertex.n[1] / NORMAL_GRID)},${Math.round(vertex.n[2] / NORMAL_GRID)}|${Math.round(vertex.u / UV_GRID)},${Math.round(vertex.v / UV_GRID)}`;
		const existing = weld.get(key);
		if (existing !== undefined) return existing;
		const index = positions.length / 3;
		positions.push(vertex.p[0], vertex.p[1], vertex.p[2]);
		normals.push(vertex.n[0], vertex.n[1], vertex.n[2]);
		uvs.push(vertex.u, vertex.v);
		min[0] = Math.min(min[0], vertex.p[0]);
		min[1] = Math.min(min[1], vertex.p[1]);
		min[2] = Math.min(min[2], vertex.p[2]);
		max[0] = Math.max(max[0], vertex.p[0]);
		max[1] = Math.max(max[1], vertex.p[1]);
		max[2] = Math.max(max[2], vertex.p[2]);
		weld.set(key, index);
		return index;
	}

	function emitFace(face: Face): void {
		if (face.verts.length === 3) {
			const [a, b, c] = face.verts;
			indices.push(vertexIndex(a), vertexIndex(b), vertexIndex(c));
			return;
		}
		const [a, b, c, d] = face.verts;
		const ia = vertexIndex(a);
		const ib = vertexIndex(b);
		const ic = vertexIndex(c);
		const id = vertexIndex(d);
		indices.push(ia, ib, ic, ia, ic, id);
	}

	// Deterministic surface order: 'side' first, then 'lintel', then any other keys alphabetically.
	const keyOrder = collectSurfaceKeys(wallsFaces);
	// All wall range entries exist up front so a bridge emitted with one wall can
	// be referenced by BOTH adjacent walls' `wallRanges` (metadata-only).
	const wallRangeBySegment = new Map<string, IndexedWallMesh['wallRanges'][number]>();
	for (const wall of wallsFaces) {
		const entry = { segmentId: wall.segmentId, ranges: [] as Array<{ start: number; count: number }> };
		wallRangeBySegment.set(wall.segmentId, entry);
		wallRanges.push(entry);
	}
	for (const surfaceKey of keyOrder) {
		const groupStart = indices.length;
		for (const wall of wallsFaces) {
			const wallRange = wallRangeBySegment.get(wall.segmentId)!;
			for (const section of wall.sections) {
				if (section.surfaceKey !== surfaceKey) continue;
				const start = indices.length;
				for (const face of section.faces) emitFace(face);
				const count = indices.length - start;
				if (count > 0) {
					sectionToRange.push({ ...section.ref, surfaceKey, start, count });
					wallRange.ranges.push({ start, count });
				}
			}
			for (const reveal of wall.reveals) {
				if (reveal.surfaceKey !== surfaceKey) continue;
				const start = indices.length;
				for (const face of reveal.faces) emitFace(face);
				const count = indices.length - start;
				if (count > 0) wallRange.ranges.push({ start, count });
			}
			for (const bridge of wall.bridges) {
				if (bridge.surfaceKey !== surfaceKey) continue;
				const start = indices.length;
				for (const face of bridge.faces) emitFace(face);
				const count = indices.length - start;
				if (count > 0) {
					wallRange.ranges.push({ start, count });
					wallRangeBySegment.get(bridge.neighborSegmentId)?.ranges.push({ start, count });
				}
			}
		}
		const groupCount = indices.length - groupStart;
		if (groupCount > 0) materialGroups.push({ surfaceKey, start: groupStart, count: groupCount });
	}

	return {
		roomId,
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		uvs: new Float32Array(uvs),
		indices: new Uint32Array(indices),
		materialGroups,
		sectionToRange,
		wallRanges,
		bounds: { min: [...min] as V3, max: [...max] as V3 }
	};
}

/**
 * Assert every emitted triangle's geometric normal (right-hand cross product
 * of its winding) agrees with its stored vertex normal. Zero-area triangles
 * are skipped (they carry no meaningful normal); the first mismatch throws.
 * Wired via `WallMeshOptions.assertWinding` as a development guard.
 */
export function assertWindingAgreesWithNormals(mesh: IndexedWallMesh): void {
	const { positions, normals, indices } = mesh;
	for (let t = 0; t < indices.length; t += 3) {
		const ia = indices[t]!;
		const ib = indices[t + 1]!;
		const ic = indices[t + 2]!;
		const ax = positions[ia * 3]!;
		const ay = positions[ia * 3 + 1]!;
		const az = positions[ia * 3 + 2]!;
		const bx = positions[ib * 3]!;
		const by = positions[ib * 3 + 1]!;
		const bz = positions[ib * 3 + 2]!;
		const cx = positions[ic * 3]!;
		const cy = positions[ic * 3 + 1]!;
		const cz = positions[ic * 3 + 2]!;
		const ux = bx - ax;
		const uy = by - ay;
		const uz = bz - az;
		const vx = cx - ax;
		const vy = cy - ay;
		const vz = cz - az;
		const gx = uy * vz - uz * vy;
		const gy = uz * vx - ux * vz;
		const gz = ux * vy - uy * vx;
		if (Math.hypot(gx, gy, gz) <= WINDING_DEGENERATE_AREA) continue;
		const nx = normals[ia * 3]!;
		const ny = normals[ia * 3 + 1]!;
		const nz = normals[ia * 3 + 2]!;
		const dot = gx * nx + gy * ny + gz * nz;
		if (dot <= 0) {
			throw new Error(`wall mesh ${mesh.roomId}: triangle ${t / 3} winds opposite its stored normal`);
		}
	}
}

function collectSurfaceKeys(wallsFaces: WallFaces[]): WallMeshSurfaceKey[] {
	const keys = new Set<WallMeshSurfaceKey>();
	for (const wall of wallsFaces) {
		for (const section of wall.sections) keys.add(section.surfaceKey);
		for (const reveal of wall.reveals) keys.add(reveal.surfaceKey);
		for (const bridge of wall.bridges) keys.add(bridge.surfaceKey);
	}
	return [...keys].sort((a, b) => {
		const rank = (key: string) => (key === 'side' ? 0 : key === 'lintel' ? 1 : 2);
		const ra = rank(a);
		const rb = rank(b);
		return ra === rb ? a.localeCompare(b) : ra - rb;
	});
}

function minPolylineDistance(a: readonly CurveSample[], b: readonly CurveSample[]): number {
	let best = Infinity;
	for (let i = 1; i < a.length; i += 1) {
		for (let j = 1; j < b.length; j += 1) {
			best = Math.min(best, segmentDistance(a[i - 1]!.point, a[i]!.point, b[j - 1]!.point, b[j]!.point));
		}
	}
	return best;
}

function polylineSelfClearance(samples: readonly CurveSample[], thickness: number): boolean {
	// A self-overlap only happens when the wall folds *back on itself*: two
	// non-adjacent portions are geometrically close (< thickness) and their
	// tangents oppose (dot < 0). Same-direction chords of a smooth or straight
	// wall are the wall's own continuous run, never a narrow neck.
	for (let i = 0; i < samples.length - 1; i += 1) {
		const tangentA = samples[i]!.tangent;
		for (let j = i + 2; j < samples.length - 1; j += 1) {
			const tangentB = samples[j]!.tangent;
			const dot = tangentA[0] * tangentB[0] + tangentA[1] * tangentB[1];
			if (dot >= 0) continue;
			const d = segmentDistance(samples[i]!.point, samples[i + 1]!.point, samples[j]!.point, samples[j + 1]!.point);
			if (d < thickness - LAYOUT_GEOMETRY_EPSILON) return true;
		}
	}
	return false;
}

function segmentDistance(a0: LayoutVec2, a1: LayoutVec2, b0: LayoutVec2, b1: LayoutVec2): number {
	const d0 = [a1[0] - a0[0], a1[1] - a0[1]];
	const d1 = [b1[0] - b0[0], b1[1] - b0[1]];
	const r = [a0[0] - b0[0], a0[1] - b0[1]];
	const a = d0[0] * d0[0] + d0[1] * d0[1];
	const e = d1[0] * d1[0] + d1[1] * d1[1];
	const f = d1[0] * r[0] + d1[1] * r[1];
	let s = 0;
	let t = 0;
	if (a <= LAYOUT_GEOMETRY_EPSILON && e <= LAYOUT_GEOMETRY_EPSILON) {
		return Math.hypot(r[0], r[1]);
	}
	if (a <= LAYOUT_GEOMETRY_EPSILON) {
		t = clamp(f / e, 0, 1);
	} else {
		const c = d0[0] * r[0] + d0[1] * r[1];
		if (e <= LAYOUT_GEOMETRY_EPSILON) {
			s = clamp(-c / a, 0, 1);
		} else {
			const b = d0[0] * d1[0] + d0[1] * d1[1];
			const denom = a * e - b * b;
			s = denom > LAYOUT_GEOMETRY_EPSILON ? clamp((b * f - c * e) / denom, 0, 1) : 0;
			t = (b * s + f) / e;
			if (t < 0) {
				t = 0;
				s = clamp(-c / a, 0, 1);
			} else if (t > 1) {
				t = 1;
				s = clamp((b - c) / a, 0, 1);
			}
		}
	}
	const cx = a0[0] + d0[0] * s - (b0[0] + d1[0] * t);
	const cy = a0[1] + d0[1] * s - (b0[1] + d1[1] * t);
	return Math.hypot(cx, cy);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
