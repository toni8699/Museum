import type { NavigationGraph } from '$lib/content/scene';
import type { MuseumConnection, NavigationNodeData, Vec3 } from '$lib/types/museum';
import type { LayoutVec2 } from '../layout-types';
import {
	geometryId,
	type CompiledLayoutGeometry,
	type CompiledQuerySpan
} from '../layout-geometry-types';
import { compileLayoutGeometry } from '../layout-geometry';
import { findPolygonContaining, projectPointToSpans } from '../layout-geometry-queries';
import {
	g1AutoBezierDocument,
	g1ElevatedFloorDocument,
	g1InvalidGeometryDocument,
	g1LineRectangleDocument,
	g1LShapedDocument,
	g1MultipleOpeningsDocument,
	g1ObjectMatrixDocument,
	g1ProfileMatrixDocument
} from './layout-g1-fixtures';

/**
 * Frozen G2 back-to-front render order. Committed geometry fills layers 1–5;
 * layers 6–9 are camera/tour projections; 10–12 are transient interaction
 * overlays. The names and order are the contract `buildPlanRenderModel()` must
 * emit and the SVG adapter must honor.
 */
export const G2_LAYER_ORDER = [
	{ order: 1, name: 'fills' },
	{ order: 2, name: 'strokes' },
	{ order: 3, name: 'walls' },
	{ order: 4, name: 'openings' },
	{ order: 5, name: 'objects' },
	{ order: 6, name: 'camera-paths' },
	{ order: 7, name: 'view-cones-look-targets' },
	{ order: 8, name: 'portal-crossings-collision-warnings' },
	{ order: 9, name: 'timing-labels' },
	{ order: 10, name: 'selection-overlays' },
	{ order: 11, name: 'interaction-handles' },
	{ order: 12, name: 'labels' }
] as const;

/** Layers derivable from `CompiledLayoutGeometry` alone (G2 step 1 freeze). */
export const G2_COMMITTED_LAYERS = [1, 2, 3, 4, 5] as const;

// --- Documents -------------------------------------------------------------

export function g2LineRectangleDocument() {
	return g1LineRectangleDocument();
}
export function g2LShapedDocument() {
	return g1LShapedDocument();
}
export function g2AutoBezierDocument() {
	return g1AutoBezierDocument();
}
export function g2MultipleOpeningsDocument() {
	return g1MultipleOpeningsDocument();
}
export function g2ProfileMatrixDocument() {
	return g1ProfileMatrixDocument();
}
export function g2ObjectMatrixDocument() {
	return g1ObjectMatrixDocument();
}
export function g2ElevatedFloorDocument() {
	return g1ElevatedFloorDocument();
}
export function g2InvalidGeometryDocument() {
	return g1InvalidGeometryDocument();
}

// --- Reference plan model --------------------------------------------------

export type G2ReferenceHitIdentity =
	| { kind: 'room'; roomId: string }
	| { kind: 'wall'; roomId: string; segmentId: string }
	| { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
	| { kind: 'object'; objectId: string };

export type G2ReferencePrimitive = {
	layer: (typeof G2_COMMITTED_LAYERS)[number];
	kind: 'polygon' | 'polyline';
	key: string;
	style: string;
	points: LayoutVec2[];
	hit: G2ReferenceHitIdentity;
};

function floorIdByRoomId(compiled: CompiledLayoutGeometry): Map<string, string> {
	const map = new Map<string, string>();
	for (const floor of compiled.floors) {
		for (const roomId of floor.roomIds) map.set(roomId, floor.floorId);
	}
	return map;
}

/**
 * Test-only reference for the committed render layers. This freezes the exact
 * primitive decomposition `buildPlanRenderModel()` must reproduce: layer order,
 * stable keys, style tokens, hit identities, and world-space points taken
 * verbatim from `CompiledLayoutGeometry`.
 */
export function buildG2ReferencePlanModel(compiled: CompiledLayoutGeometry): G2ReferencePrimitive[] {
	const floorByRoom = floorIdByRoomId(compiled);
	const primitives: G2ReferencePrimitive[] = [];

	// Layer 1 — fills, one polygon per room in document order.
	for (const room of compiled.rooms) {
		const floorId = floorByRoom.get(room.roomId) ?? 'unknown-floor';
		primitives.push({
			layer: 1,
			kind: 'polygon',
			key: geometryId(['plan', 'fill', floorId, room.roomId]),
			style: 'room-fill',
			points: room.floorPolygon.map(([x, z]) => [x, z] as LayoutVec2),
			hit: { kind: 'room', roomId: room.roomId }
		});
	}

	// Layer 2 — strokes, one closed outline per room in document order.
	for (const room of compiled.rooms) {
		const floorId = floorByRoom.get(room.roomId) ?? 'unknown-floor';
		primitives.push({
			layer: 2,
			kind: 'polygon',
			key: geometryId(['plan', 'stroke', floorId, room.roomId]),
			style: 'room-outline',
			points: room.floorPolygon.map(([x, z]) => [x, z] as LayoutVec2),
			hit: { kind: 'room', roomId: room.roomId }
		});
	}

	// Layer 3 — walls, one polyline per opening-free centerline span.
	for (const room of compiled.rooms) {
		const floorId = floorByRoom.get(room.roomId) ?? 'unknown-floor';
		for (const wall of room.walls) {
			wall.solidCenterlinePolylines.forEach((polyline, index) => {
				primitives.push({
					layer: 3,
					kind: 'polyline',
					key: geometryId(['plan', 'wall', floorId, room.roomId, wall.segmentId, String(index)]),
					style: 'wall-line',
					points: polyline.map(([x, z]) => [x, z] as LayoutVec2),
					hit: { kind: 'wall', roomId: room.roomId, segmentId: wall.segmentId }
				});
			});
		}
	}

	// Layer 4 — openings, one polyline per compiled opening centerline.
	for (const room of compiled.rooms) {
		const floorId = floorByRoom.get(room.roomId) ?? 'unknown-floor';
		for (const opening of room.openings) {
			primitives.push({
				layer: 4,
				kind: 'polyline',
				key: geometryId(['plan', 'opening', floorId, room.roomId, opening.openingId]),
				style: 'opening-line',
				points: opening.centerPolyline.map(([x, z]) => [x, z] as LayoutVec2),
				hit: { kind: 'opening', roomId: room.roomId, segmentId: opening.segmentId, openingId: opening.openingId }
			});
		}
	}

	// Layer 5 — objects, one footprint polygon per compiled object.
	for (const object of compiled.objects) {
		primitives.push({
			layer: 5,
			kind: 'polygon',
			key: geometryId(['plan', 'object', object.objectId]),
			style: object.readonly ? 'layout-object-readonly' : 'layout-object',
			points: object.planFootprint.map(([x, z]) => [x, z] as LayoutVec2),
			hit: { kind: 'object', objectId: object.objectId }
		});
	}

	return primitives;
}

// --- Reference hit resolution ---------------------------------------------

export type G2ReferenceHitResult =
	| { kind: 'vertex'; roomId: string; segmentId: string; vertexIndex: number }
	| { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string }
	| { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
	| { kind: 'object'; objectId: string }
	| { kind: 'wall'; roomId: string; segmentId: string }
	| { kind: 'room'; roomId: string }
	| null;

function wallSpansByRoomSegment(compiled: CompiledLayoutGeometry): Map<string, Map<string, CompiledQuerySpan[]>> {
	const byRoom = new Map<string, Map<string, CompiledQuerySpan[]>>();
	for (const span of compiled.queries.spans) {
		if (span.kind !== 'wall') continue;
		let bySegment = byRoom.get(span.roomId);
		if (!bySegment) {
			bySegment = new Map();
			byRoom.set(span.roomId, bySegment);
		}
		const spans = bySegment.get(span.segmentId) ?? [];
		spans.push(span);
		bySegment.set(span.segmentId, spans);
	}
	return byRoom;
}

function nearestPointHit(
	compiled: CompiledLayoutGeometry,
	point: LayoutVec2,
	tolerance: number,
	kind: 'vertex' | 'interior-anchor'
): G2ReferenceHitResult {
	let best: G2ReferenceHitResult = null;
	let bestDistance = tolerance;
	for (const record of compiled.queries.points) {
		if (record.kind !== kind) continue;
		const distance = Math.hypot(record.point[0] - point[0], record.point[1] - point[1]);
		if (distance <= bestDistance) {
			best =
				kind === 'vertex'
					? { kind: 'vertex', roomId: record.roomId, segmentId: record.segmentId, vertexIndex: record.sourceIndex }
					: { kind: 'interiorAnchor', roomId: record.roomId, segmentId: record.segmentId, anchorId: record.sourceId };
			bestDistance = distance;
		}
	}
	return best;
}

function nearestOpeningHit(
	compiled: CompiledLayoutGeometry,
	point: LayoutVec2,
	tolerance: number
): G2ReferenceHitResult {
	const spansByRoom = wallSpansByRoomSegment(compiled);
	for (const room of [...compiled.rooms].reverse()) {
		for (const opening of [...room.openings].reverse()) {
			const spans = spansByRoom.get(room.roomId)?.get(opening.segmentId) ?? [];
			const projection = projectPointToSpans(point, spans);
			if (!projection || projection.distance > tolerance) continue;
			if (
				projection.offset >= opening.offset - tolerance &&
				projection.offset <= opening.offset + opening.width + tolerance
			) {
				return { kind: 'opening', roomId: room.roomId, segmentId: opening.segmentId, openingId: opening.openingId };
			}
		}
	}
	return null;
}

function nearestWallHit(
	compiled: CompiledLayoutGeometry,
	point: LayoutVec2,
	tolerance: number
): G2ReferenceHitResult {
	const spansByRoom = wallSpansByRoomSegment(compiled);
	let best: { roomId: string; segmentId: string; distance: number } | null = null;
	for (const room of [...compiled.rooms].reverse()) {
		for (const [segmentId, spans] of spansByRoom.get(room.roomId) ?? []) {
			const projection = projectPointToSpans(point, spans);
			if (!projection || projection.distance > tolerance) continue;
			if (!best || projection.distance < best.distance) {
				best = { roomId: room.roomId, segmentId, distance: projection.distance };
			}
		}
	}
	return best ? { kind: 'wall', roomId: best.roomId, segmentId: best.segmentId } : null;
}

/**
 * Test-only reference implementing the locked hit priority:
 * vertex → interior anchor → opening → object → wall → room. Mirrors the
 * viewport's `findPlanHitTarget` ordering so the real `plan-hit` module can be
 * parity-checked against these goldens.
 */
export function resolveG2ReferenceHit(
	compiled: CompiledLayoutGeometry,
	point: LayoutVec2,
	tolerance: number
): G2ReferenceHitResult {
	const vertex = nearestPointHit(compiled, point, tolerance, 'vertex');
	if (vertex) return vertex;
	const anchor = nearestPointHit(compiled, point, tolerance, 'interior-anchor');
	if (anchor) return anchor;
	const opening = nearestOpeningHit(compiled, point, tolerance);
	if (opening) return opening;
	const objectPolygon = findPolygonContaining(
		point,
		compiled.queries.polygons.filter((polygon) => polygon.kind === 'object-footprint')
	);
	if (objectPolygon?.objectId) {
		return { kind: 'object', objectId: objectPolygon.objectId };
	}
	const wall = nearestWallHit(compiled, point, tolerance);
	if (wall) return wall;
	const roomPolygon = findPolygonContaining(
		point,
		compiled.queries.polygons.filter((polygon) => polygon.kind === 'room-floor')
	);
	return roomPolygon?.roomId ? { kind: 'room', roomId: roomPolygon.roomId } : null;
}

// --- Scene navigation fixture ---------------------------------------------

function g2Node(
	id: string,
	roomId: string,
	position: Vec3,
	cameraTarget: Vec3,
	fov: number,
	connectedNodeIds: string[],
	nextNodeId: string,
	previousNodeId: string
): NavigationNodeData {
	return {
		id,
		roomId,
		label: id.toUpperCase(),
		position: [...position] as Vec3,
		cameraTarget: [...cameraTarget] as Vec3,
		fov,
		connectedNodeIds: [...connectedNodeIds],
		nextNodeId,
		previousNodeId
	};
}

function g2Connection(
	id: string,
	fromNodeId: string,
	toNodeId: string,
	points: readonly Vec3[]
): MuseumConnection {
	return {
		id,
		fromNodeId,
		toNodeId,
		positionPath: {
			kind: 'rounded-polyline',
			anchors: points.map((position, index) => ({
				id: `${id}:anchor:${index}`,
				position: [...position] as Vec3
			}))
		},
		clearance: 0.35,
		timing: {
			forward: { durationSeconds: 4, easing: 'smoothstep' },
			reverse: { durationSeconds: 4, easing: 'smoothstep' }
		}
	};
}

/**
 * Minimal three-node guided cycle for the G2 camera-projection goldens. All
 * positions share a 1.6 m camera height so dropping Y yields a clean 2D plan
 * polyline: n0 (0,0) → n1 (6,0) → n2 (6,4) → n0 (0,0).
 */
export function g2SceneNavigationGraph(): NavigationGraph {
	const definitions = [
		{ id: 'n0', roomId: 'room-a', position: [0, 1.6, 0] as Vec3, cameraTarget: [3, 1.2, 0] as Vec3, fov: 54, connected: ['n1'], next: 'n1', previous: 'n2' },
		{ id: 'n1', roomId: 'room-b', position: [6, 1.6, 0] as Vec3, cameraTarget: [6, 1.2, 2] as Vec3, fov: 54, connected: ['n0', 'n2'], next: 'n2', previous: 'n0' },
		{ id: 'n2', roomId: 'room-c', position: [6, 1.6, 4] as Vec3, cameraTarget: [3, 1.2, 4] as Vec3, fov: 60, connected: ['n1'], next: 'n0', previous: 'n1' }
	];
	const navigationNodes = definitions.map((definition) =>
		g2Node(
			definition.id,
			definition.roomId,
			definition.position,
			definition.cameraTarget,
			definition.fov,
			definition.connected,
			definition.next,
			definition.previous
		)
	);
	const nodeById = new Map(navigationNodes.map((node) => [node.id, node]));
	const connections: MuseumConnection[] = [
		g2Connection('c0', 'n0', 'n1', [navigationNodes[0]!.position, navigationNodes[1]!.position]),
		g2Connection('c1', 'n1', 'n2', [navigationNodes[1]!.position, navigationNodes[2]!.position]),
		g2Connection('c2', 'n2', 'n0', [navigationNodes[2]!.position, navigationNodes[0]!.position])
	];
	return { navigationNodes, connections, nodeById };
}

/** Compile a G2 fixture document into render-neutral geometry plus issues. */
export function compileG2Fixture(document: ReturnType<typeof g2LineRectangleDocument>) {
	return compileLayoutGeometry(document);
}
