import type { LayoutVec2 } from './layout-types';
import { geometryId, type CompiledLayoutGeometry, type LayoutBounds2 } from './layout-geometry-types';

/**
 * Pure Plan render model. Derives one ordered list of world-space primitives
 * from `CompiledLayoutGeometry` plus optional renderer-neutral camera/tour and
 * interaction projections. Renderer-neutral: no Svelte, DOM/SVG, Threlte, or
 * Three imports. The SVG adapter applies the view transform and owns styling.
 */

export type PlanStyleToken =
	| 'room-fill'
	| 'room-fill-selected'
	| 'room-outline'
	| 'room-outline-selected'
	| 'scene-footprint'
	| 'scene-footprint-bridge-hover'
	| 'scene-footprint-active'
	| 'scene-footprint-selected'
	| 'wall-line'
	| 'wall-line-selected'
	| 'wall-line-opening-selected'
	| 'opening-line'
	| 'opening-line-selected'
	| 'layout-object'
	| 'layout-object-selected'
	| 'layout-object-readonly'
	| 'layout-object-readonly-selected'
	// P3.3 — Arrange hover bridge-affordance outline (presentation only).
	| 'arrange-hover'
	| 'camera-path'
	| 'view-cone'
	| 'look-target'
	| 'portal-crossing'
	| 'collision-warning'
	| 'timing-label'
	// P1.5 — Camera Plan authoring tokens (live camera-graph overlay).
	| 'camera-edge'
	| 'camera-edge-selected'
	| 'camera-edge-hovered'
	| 'camera-edge-retained'
	| 'camera-node'
	| 'camera-node-selected'
	| 'camera-node-hovered'
	| 'camera-node-free'
	| 'camera-unsequenced-badge'
	| 'camera-anchor'
	| 'camera-anchor-selected'
	| 'camera-anchor-hovered'
	| 'camera-order-label'
	| 'camera-timing-label'
	| 'camera-connect-band'
	| 'camera-placement-ghost'
	| 'camera-placement-ghost-invalid'
	| 'selection-bounds'
	| 'rotation-arm'
	| 'rotation-handle'
	| 'rotation-feedback'
	| 'vertex-handle'
	| 'interior-anchor'
	| 'interior-anchor-selected'
	| 'primitive-ghost'
	| 'primitive-ghost-circle'
	| 'primitive-ghost-sphere'
	| 'primitive-ghost-invalid'
	| 'draft-outline'
	| 'draft-point'
	| 'dimension-label'
	| 'selection-label'
	| 'scale-label';

export type PlanHitIdentity =
	| { kind: 'vertex'; roomId: string; vertexIndex: number }
	| { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string }
	| { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
	| { kind: 'object'; objectId: string }
	| { kind: 'wall'; roomId: string; segmentId: string }
	| { kind: 'room'; roomId: string };

/**
 * Renderer-neutral selection descriptor. Mirrors the editor's selection shape
 * without importing editor types, so the model can fully describe presentation
 * (including which committed primitive is selected) and the adapter never needs
 * to re-derive selection from editor state.
 */
export type PlanSelection =
	| { kind: 'none' }
	| { kind: 'room'; roomId: string }
	| { kind: 'wall'; roomId: string; segmentId: string }
	| { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
	| { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string }
	| { kind: 'object'; objectId: string };

export type PlanPolygonPrimitive = {
	kind: 'polygon';
	key: string;
	points: LayoutVec2[];
	style: PlanStyleToken;
	hit?: PlanHitIdentity;
};

export type PlanPolylinePrimitive = {
	kind: 'polyline';
	key: string;
	points: LayoutVec2[];
	/**
	 * Architectural drawing metadata. The pure model owns the real-world
	 * dimensions and opening semantics; SVG remains a thin screen adapter.
	 */
	architecture?:
		| { kind: 'wall'; thicknessMeters: number }
		| {
				kind: 'door' | 'window';
				widthMeters: number;
				wallThicknessMeters: number;
				/** Unit vector pointing from the opening into its room. */
				inwardNormal: LayoutVec2;
		  };
	/** Screen-constant offset (CSS px) applied to the final point after the transform (rotation arm). */
	endOffsetPx?: readonly [number, number];
	style: PlanStyleToken;
	hit?: PlanHitIdentity;
};

export type PlanCirclePrimitive = {
	kind: 'circle';
	key: string;
	center: LayoutVec2;
	/** Screen-space size hint in CSS px; zoom-independent sizing is the adapter's job. */
	radiusPx: number;
	/** Screen-constant offset (CSS px) applied by the adapter after the view transform. */
	offsetPx?: readonly [number, number];
	style: PlanStyleToken;
	hit?: PlanHitIdentity;
};

export type PlanTextPrimitive = {
	kind: 'text';
	key: string;
	anchor: LayoutVec2;
	text: string;
	/** Screen-constant offset (CSS px) applied by the adapter after the view transform. */
	offsetPx?: readonly [number, number];
	style: PlanStyleToken;
};

export type PlanRenderPrimitive =
	| PlanPolygonPrimitive
	| PlanPolylinePrimitive
	| PlanCirclePrimitive
	| PlanTextPrimitive;

export type PlanRenderLayerOrder = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type PlanRenderLayer = {
	order: PlanRenderLayerOrder;
	primitives: PlanRenderPrimitive[];
};

/**
 * Renderer-neutral camera/tour projection produced editor-side by
 * `plan-camera-projection.ts` (step 4). The builder only slots these into
 * layers 7–10; it never imports or resolves scene/camera data itself.
 */
export type PlanCameraProjection = {
	paths?: readonly { key: string; polyline: LayoutVec2[]; connectionId?: string }[];
	viewCones?: readonly { key: string; origin: LayoutVec2; target: LayoutVec2; fovDegrees: number; nodeId: string }[];
	lookTargets?: readonly { key: string; point: LayoutVec2; nodeId: string }[];
	portalCrossings?: readonly { key: string; point: LayoutVec2; openingId: string }[];
	collisionWarnings?: readonly { key: string; point: LayoutVec2; issueCode: string }[];
	timingLabels?: readonly { key: string; anchor: LayoutVec2; text: string; connectionId: string }[];
	/**
	 * P1.5 — live Camera-authoring profile. When present it replaces the tour
	 * layers 7–10 (no view cones, look targets, portals, or tour timing labels
	 * are emitted) and owns the transient interaction layer 11.
	 */
	authoring?: PlanCameraAuthoringProjection;
};

/** Passive Scene footprints projected editor-side onto the Plan X/Z plane. */
export type PlanSceneProjection = {
	footprints: readonly {
		key: string;
		entityId: string;
		roomId: string;
		kind: 'model' | 'primitive';
		primitive?: 'box' | 'plane' | 'cylinder' | 'sphere';
		points: LayoutVec2[];
		presentation?: 'passive' | 'bridge-hover' | 'active' | 'selected';
	}[];
};

/** Per-direction effective timing readout for one undirected camera edge (P1.5). */
export type PlanCameraDirectionTiming = {
	direction: 'forward' | 'reverse';
	/** Playback path length in metres from the exact per-direction CameraMotion. */
	pathLengthMeters: number;
	/** Effective duration in seconds (authored value or formula fallback). */
	durationSeconds: number;
	/** True when the connection authored `durationSeconds` for this direction. */
	authoredDuration: boolean;
	/** Derived `pathLengthMeters / durationSeconds`; 0 for zero-length/zero-duration paths. */
	speedMetersPerSecond: number;
};

/** One undirected camera topology edge projected onto the plan plane (P1.5). */
export type PlanCameraAuthoringConnection = {
	key: string;
	connectionId: string;
	/** Exact shared draft-curve samples, world X/Z, once per connection. */
	polyline: LayoutVec2[];
	fromNodeId: string;
	toNodeId: string;
	selected: boolean;
	/** Authored but not used by the main flow (still visible). */
	retained: boolean;
	timing: readonly PlanCameraDirectionTiming[];
};

/** One camera node at its resolved world X/Z with order/free semantics (P1.5). */
export type PlanCameraAuthoringNode = {
	key: string;
	nodeId: string;
	point: LayoutVec2;
	/** 1-based flow order, or null for a free ("not in order yet") node. */
	order: number | null;
	selected: boolean;
};

/** One visible interior path anchor of the relevant connection (P1.5). */
export type PlanCameraAuthoringAnchor = {
	key: string;
	connectionId: string;
	anchorId: string;
	point: LayoutVec2;
	selected: boolean;
};

/**
 * Live Camera-authoring overlay (P1.5). Emitted by the editor-side authoring
 * profile; `buildPlanRenderModel` maps it onto layers 7–11 in place of the
 * tour projection. Never includes cones, targets, framing, or heading
 * primitives.
 */
export type PlanCameraAuthoringProjection = {
	connections: readonly PlanCameraAuthoringConnection[];
	nodes: readonly PlanCameraAuthoringNode[];
	/** Interior anchors only for the selected/relevant connection. */
	anchors: readonly PlanCameraAuthoringAnchor[];
	/** Order numbers, free badges, and per-direction timing readouts. */
	labels: readonly PlanRenderPrimitive[];
	/** Transient interaction primitives (rubber band, placement feedback). */
	interaction: readonly PlanRenderPrimitive[];
};

/**
 * Transient interaction overlays produced editor-side by `plan-overlays.ts`
 * (step 5). World-space primitives only; the builder assigns them to fixed
 * layers and never reorders committed content.
 */
export type PlanInteractionProjection = {
	/** Committed primitives matching this identity are emitted with `-selected` tokens. */
	selected?: PlanSelection;
	selection: readonly PlanRenderPrimitive[];
	handles: readonly PlanRenderPrimitive[];
	drafts: readonly PlanRenderPrimitive[];
	labels: readonly PlanRenderPrimitive[];
	/** Transient replacements for committed room fill/stroke (vertex/room edits). */
	roomOverrides?: readonly { roomId: string; points: LayoutVec2[] }[];
	/** Transient replacements for committed object footprints (object drag). */
	objectOverrides?: readonly { objectId: string; points: LayoutVec2[] }[];
};

export type PlanRenderModel = {
	layers: PlanRenderLayer[];
	bounds: LayoutBounds2 | null;
};

const VIEW_CONE_STEPS = 8;

function floorIdByRoomId(compiled: CompiledLayoutGeometry): Map<string, string> {
	const map = new Map<string, string>();
	for (const floor of compiled.floors) {
		for (const roomId of floor.roomIds) map.set(roomId, floor.floorId);
	}
	return map;
}

function planBounds(compiled: CompiledLayoutGeometry): LayoutBounds2 | null {
	const bounds = compiled.bounds;
	if (!bounds) return null;
	return { min: [bounds.min[0], bounds.min[2]], max: [bounds.max[0], bounds.max[2]] };
}

/** Deterministic fan polygon spanning the cone's fov around the look axis. */
function conePolygon(origin: LayoutVec2, target: LayoutVec2, fovDegrees: number): LayoutVec2[] {
	const dx = target[0] - origin[0];
	const dz = target[1] - origin[1];
	const radius = Math.hypot(dx, dz);
	if (radius <= 1e-9) return [[...origin] as LayoutVec2];
	const axis = Math.atan2(dz, dx);
	const half = (fovDegrees * Math.PI) / 360;
	const points: LayoutVec2[] = [[...origin] as LayoutVec2];
	for (let index = 0; index <= VIEW_CONE_STEPS; index += 1) {
		const angle = axis - half + ((half * 2) * index) / VIEW_CONE_STEPS;
		points.push([origin[0] + Math.cos(angle) * radius, origin[1] + Math.sin(angle) * radius]);
	}
	return points;
}

/**
 * Promote a committed base token to its `-selected` variant when the primitive's
 * hit identity matches the selection. Matching is fully qualified (roomId +
 * segmentId [+ openingId/anchorId]) so cross-room duplicate IDs highlight only
 * the intended entity.
 */
function selectedStyle(
	base: PlanStyleToken,
	hit: PlanHitIdentity,
	selected: PlanSelection | undefined
): PlanStyleToken {
	if (!selected || selected.kind === 'none') return base;
	switch (base) {
		case 'room-fill':
			return selected.kind === 'room' && hit.kind === 'room' && selected.roomId === hit.roomId
				? 'room-fill-selected'
				: base;
		case 'room-outline':
			return selected.kind === 'room' && hit.kind === 'room' && selected.roomId === hit.roomId
				? 'room-outline-selected'
				: base;
		case 'wall-line':
			if (hit.kind !== 'wall') return base;
			if (selected.kind === 'wall' && selected.roomId === hit.roomId && selected.segmentId === hit.segmentId) {
				return 'wall-line-selected';
			}
			if (selected.kind === 'interiorAnchor' && selected.roomId === hit.roomId && selected.segmentId === hit.segmentId) {
				return 'wall-line-selected';
			}
			if (selected.kind === 'opening' && selected.roomId === hit.roomId && selected.segmentId === hit.segmentId) {
				return 'wall-line-opening-selected';
			}
			return base;
		case 'opening-line':
			return selected.kind === 'opening' && hit.kind === 'opening' &&
				selected.roomId === hit.roomId && selected.segmentId === hit.segmentId && selected.openingId === hit.openingId
				? 'opening-line-selected'
				: base;
		case 'layout-object':
			return selected.kind === 'object' && hit.kind === 'object' && selected.objectId === hit.objectId
				? 'layout-object-selected'
				: base;
		case 'layout-object-readonly':
			return selected.kind === 'object' && hit.kind === 'object' && selected.objectId === hit.objectId
				? 'layout-object-readonly-selected'
				: base;
		default:
			return base;
	}
}

function polygonAverage(points: readonly LayoutVec2[]): LayoutVec2 {
	if (points.length === 0) return [0, 0];
	let x = 0;
	let z = 0;
	for (const point of points) {
		x += point[0];
		z += point[1];
	}
	return [x / points.length, z / points.length];
}

/**
 * Build the ordered Plan render model. Always returns all thirteen layers (empty
 * layers included) so render order is explicit rather than implicit in the
 * consumer. Committed layers 1–5 come verbatim from `CompiledLayoutGeometry`;
 * 6 comes from passive Scene footprints; 7–10 come from the camera projection;
 * 11–13 come from the interaction projection.
 */
export function buildPlanRenderModel(
	compiled: CompiledLayoutGeometry,
	camera?: PlanCameraProjection,
	interaction?: PlanInteractionProjection,
	scene?: PlanSceneProjection
): PlanRenderModel {
	const floorByRoom = floorIdByRoomId(compiled);
	const roomOverrides = new Map((interaction?.roomOverrides ?? []).map((override) => [override.roomId, override.points] as const));
	const objectOverrides = new Map((interaction?.objectOverrides ?? []).map((override) => [override.objectId, override.points] as const));
	const layers: PlanRenderLayer[] = [];

	const fills: PlanRenderPrimitive[] = [];
	const strokes: PlanRenderPrimitive[] = [];
	const walls: PlanRenderPrimitive[] = [];
	const openings: PlanRenderPrimitive[] = [];
	const objects: PlanRenderPrimitive[] = [];

	for (const room of compiled.rooms) {
		const floorId = floorByRoom.get(room.roomId) ?? 'unknown-floor';
		const polygon = (roomOverrides.get(room.roomId) ?? room.floorPolygon).map(([x, z]) => [x, z] as LayoutVec2);
		fills.push({
			kind: 'polygon',
			key: geometryId(['plan', 'fill', floorId, room.roomId]),
			points: polygon,
			style: selectedStyle('room-fill', { kind: 'room', roomId: room.roomId }, interaction?.selected),
			hit: { kind: 'room', roomId: room.roomId }
		});
		strokes.push({
			kind: 'polygon',
			key: geometryId(['plan', 'stroke', floorId, room.roomId]),
			points: polygon,
			style: selectedStyle('room-outline', { kind: 'room', roomId: room.roomId }, interaction?.selected),
			hit: { kind: 'room', roomId: room.roomId }
		});
		for (const wall of room.walls) {
			wall.solidCenterlinePolylines.forEach((polyline, index) => {
				walls.push({
					kind: 'polyline',
					key: geometryId(['plan', 'wall', floorId, room.roomId, wall.segmentId, String(index)]),
					points: polyline.map(([x, z]) => [x, z] as LayoutVec2),
					architecture: { kind: 'wall', thicknessMeters: wall.thickness },
					style: selectedStyle('wall-line', { kind: 'wall', roomId: room.roomId, segmentId: wall.segmentId }, interaction?.selected),
					hit: { kind: 'wall', roomId: room.roomId, segmentId: wall.segmentId }
				});
			});
		}
		for (const opening of room.openings) {
			const wall = room.walls.find((candidate) => candidate.segmentId === opening.segmentId);
			const roomCenter: LayoutVec2 = polygonAverage(polygon);
			const towardRoom: LayoutVec2 = [
				roomCenter[0] - opening.center.point[0],
				roomCenter[1] - opening.center.point[1]
			];
			const normalSign = towardRoom[0] * opening.center.normal[0] + towardRoom[1] * opening.center.normal[1] < 0 ? -1 : 1;
			openings.push({
				kind: 'polyline',
				key: geometryId(['plan', 'opening', floorId, room.roomId, opening.openingId]),
				points: opening.centerPolyline.map(([x, z]) => [x, z] as LayoutVec2),
				architecture: {
					kind: opening.kind,
					widthMeters: opening.width,
					wallThicknessMeters: wall?.thickness ?? room.wallThickness,
					inwardNormal: [
						opening.center.normal[0] * normalSign,
						opening.center.normal[1] * normalSign
					]
				},
				style: selectedStyle(
					'opening-line',
					{ kind: 'opening', roomId: room.roomId, segmentId: opening.segmentId, openingId: opening.openingId },
					interaction?.selected
				),
				hit: { kind: 'opening', roomId: room.roomId, segmentId: opening.segmentId, openingId: opening.openingId }
			});
		}
	}

	for (const object of compiled.objects) {
		objects.push({
			kind: 'polygon',
			key: geometryId(['plan', 'object', object.objectId]),
			points: (objectOverrides.get(object.objectId) ?? object.planFootprint).map(([x, z]) => [x, z] as LayoutVec2),
			style: selectedStyle(
				object.readonly ? 'layout-object-readonly' : 'layout-object',
				{ kind: 'object', objectId: object.objectId },
				interaction?.selected
			),
			hit: { kind: 'object', objectId: object.objectId }
		});
	}

	layers.push({ order: 1, primitives: fills });
	layers.push({ order: 2, primitives: strokes });
	layers.push({ order: 3, primitives: walls });
	layers.push({ order: 4, primitives: openings });
	layers.push({ order: 5, primitives: objects });

	const sceneFootprints: PlanRenderPrimitive[] = (scene?.footprints ?? []).map((footprint) => ({
		kind: 'polygon',
		key: footprint.key,
		points: footprint.points.map(([x, z]) => [x, z] as LayoutVec2),
		style:
			footprint.presentation === 'selected'
				? 'scene-footprint-selected'
				: footprint.presentation === 'bridge-hover'
					? 'scene-footprint-bridge-hover'
					: footprint.presentation === 'active'
						? 'scene-footprint-active'
						: 'scene-footprint'
	}));

	const cameraPaths: PlanRenderPrimitive[] = [];
	const viewConesAndLookTargets: PlanRenderPrimitive[] = [];
	const portalCrossingsAndWarnings: PlanRenderPrimitive[] = [];
	const timingLabels: PlanRenderPrimitive[] = [];
	const authoring = camera?.authoring;
	const cameraEdges: PlanRenderPrimitive[] = [];
	const cameraAnchors: PlanRenderPrimitive[] = [];
	const cameraNodes: PlanRenderPrimitive[] = [];

	for (const connection of authoring?.connections ?? []) {
		cameraEdges.push({
			kind: 'polyline',
			key: connection.key,
			points: connection.polyline,
			style: connection.retained
				? 'camera-edge-retained'
				: connection.selected
					? 'camera-edge-selected'
					: 'camera-edge'
		});
	}
	for (const anchor of authoring?.anchors ?? []) {
		cameraAnchors.push({
			kind: 'circle',
			key: anchor.key,
			center: anchor.point,
			radiusPx: 5,
			style: anchor.selected ? 'camera-anchor-selected' : 'camera-anchor'
		});
	}
	for (const node of authoring?.nodes ?? []) {
		cameraNodes.push({
			kind: 'circle',
			key: node.key,
			center: node.point,
			radiusPx: 11,
			style: node.selected
				? 'camera-node-selected'
				: node.order === null
					? 'camera-node-free'
					: 'camera-node'
		});
	}

	for (const path of camera?.paths ?? []) {
		cameraPaths.push({ kind: 'polyline', key: path.key, points: path.polyline, style: 'camera-path' });
	}
	for (const cone of camera?.viewCones ?? []) {
		viewConesAndLookTargets.push({
			kind: 'polygon',
			key: cone.key,
			points: conePolygon(cone.origin, cone.target, cone.fovDegrees),
			style: 'view-cone'
		});
	}
	for (const target of camera?.lookTargets ?? []) {
		viewConesAndLookTargets.push({
			kind: 'circle',
			key: target.key,
			center: target.point,
			radiusPx: 4,
			style: 'look-target'
		});
	}
	for (const crossing of camera?.portalCrossings ?? []) {
		portalCrossingsAndWarnings.push({
			kind: 'circle',
			key: crossing.key,
			center: crossing.point,
			radiusPx: 5,
			style: 'portal-crossing'
		});
	}
	for (const warning of camera?.collisionWarnings ?? []) {
		portalCrossingsAndWarnings.push({
			kind: 'circle',
			key: warning.key,
			center: warning.point,
			radiusPx: 5,
			style: 'collision-warning'
		});
	}
	for (const label of camera?.timingLabels ?? []) {
		timingLabels.push({ kind: 'text', key: label.key, anchor: label.anchor, text: label.text, style: 'timing-label' });
	}

	// P1.5 — the live Camera-authoring profile replaces the tour projection in
	// layers 7–10 (and owns layer 11 for its transient interaction primitives),
	// so the Camera Plan surface can never fall back to view cones, look
	// targets, portals, warnings, or tour timing labels.
	layers.push({ order: 6, primitives: sceneFootprints });
	layers.push({ order: 7, primitives: authoring ? cameraEdges : cameraPaths });
	layers.push({ order: 8, primitives: authoring ? cameraAnchors : viewConesAndLookTargets });
	layers.push({ order: 9, primitives: authoring ? cameraNodes : portalCrossingsAndWarnings });
	layers.push({ order: 10, primitives: authoring ? [...(authoring?.labels ?? [])] : timingLabels });

	layers.push({ order: 11, primitives: authoring ? [...(authoring?.interaction ?? [])] : [...(interaction?.selection ?? [])] });
	layers.push({ order: 12, primitives: authoring ? [] : [...(interaction?.handles ?? []), ...(interaction?.drafts ?? [])] });
	layers.push({ order: 13, primitives: authoring ? [] : [...(interaction?.labels ?? [])] });

	return { layers, bounds: planBounds(compiled) };
}
