import { createNavigationGraph, resolveSceneDocument, type MuseumSceneDocument, type NavigationGraph } from '$lib/content/scene';
import { createLayoutRoomRegistry, type LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { MuseumProject } from '$lib/project/project-types';
import { getCameraConnectionRoute, getCameraMotionOptions } from '$lib/museum/navigation/camera-route';
import type { Vector3Like } from '$lib/museum/navigation/camera-motion';
import { projectLayoutPortalRelations, type LayoutPortalRelation } from '$lib/layout/layout-portals';
import type { LayoutVec2 } from '$lib/layout/layout-types';
import { geometryId, type CompiledLayoutGeometry, type LayoutGeometryIssue } from '$lib/layout/layout-geometry-types';
import type {
	PlanCameraAuthoringAnchor,
	PlanCameraAuthoringConnection,
	PlanCameraAuthoringNode,
	PlanCameraProjection,
	PlanRenderPrimitive
} from '$lib/layout/plan-render-model';	import { sampleDraftConnectionPath2D } from '../editor-camera-path';
	import { formatCameraNodeLabel } from '../editor-outliner';
	import { resolveCameraConnectionTiming } from '../camera-plan/camera-plan-timing';

/**
 * Editor-side camera/tour projection. Projects the existing scene/navigation
 * data onto the plan plane (XZ) without adding a second route or motion
 * implementation: graph resolution reuses `resolveSceneDocument` +
 * `createNavigationGraph`, and every polyline/view/timing derivation reuses
 * `camera-route.ts` / `camera-motion.ts`.
 */

function dropY(point: Vector3Like): LayoutVec2 {
	return 'x' in point ? [point.x, point.z] : [point[0], point[2]];
}

function routePolyline2D(route: ReturnType<typeof getCameraConnectionRoute>): LayoutVec2[] {
	return route.positionParts.flatMap((part) => {
		const points = part.kind === 'rounded-polyline' ? part.points : part.anchors;
		return points.map(dropY);
	});
}

function midpoint(polyline: readonly LayoutVec2[]): LayoutVec2 {
	if (polyline.length === 0) return [0, 0];
	const first = polyline[0]!;
	const last = polyline.at(-1)!;
	return [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
}

type PlanPath = NonNullable<PlanCameraProjection['paths']>[number];
type PlanViewCone = NonNullable<PlanCameraProjection['viewCones']>[number];
type PlanLookTarget = NonNullable<PlanCameraProjection['lookTargets']>[number];
type PlanPortalCrossing = NonNullable<PlanCameraProjection['portalCrossings']>[number];
type PlanCollisionWarning = NonNullable<PlanCameraProjection['collisionWarnings']>[number];
type PlanTimingLabel = NonNullable<PlanCameraProjection['timingLabels']>[number];

/**
 * Camera-authoring selection input (P1.5). The viewport adapts the store's
 * navigation selection onto this renderer-neutral shape; a view-keyframe
 * selection carries no Camera Plan framing surface and maps to `null`.
 */
export type PlanCameraSelectionInput =
	| { kind: 'node'; nodeId: string }
	| { kind: 'connection'; connectionId: string }
	| { kind: 'anchor'; connectionId: string; anchorId: string }
	| null;

/** Hover state, purely visual and owned by the Camera Plan viewport. */
export type PlanCameraHoverInput =
	| { kind: 'node'; nodeId: string }
	| { kind: 'anchor'; connectionId: string; anchorId: string }
	| { kind: 'edge'; connectionId: string }
	| null;

/** Transient pointer state the viewport feeds into the interaction layer. */
export type CameraPlanTransientState = {
	/** Connect rubber band from the resolved source node X/Z to the cursor. */
	rubberBand: { from: LayoutVec2; to: LayoutVec2 } | null;
	/** Add-Camera placement feedback at the cursor; `valid` = on a room floor. */
	placementGhost: { point: LayoutVec2; valid: boolean } | null;
};

/** Screen-constant hit/placement radius in CSS px for Camera Plan gestures. */
export const CAMERA_PLAN_HIT_RADIUS_PX = 8;

/**
 * Resolve the project's scene document into the same `NavigationGraph` the
 * visitor uses, but against the editor's current (possibly edited) layout.
 */
export function resolvePlanSceneGraph(project: MuseumProject): NavigationGraph {
	const rooms = createLayoutRoomRegistry(project.layout);
	const scene = resolveSceneDocument(project.scene, rooms);
	return createNavigationGraph(scene);
}

/**
 * P1.5 — document-level resolver: the live Camera Plan surface reads
 * `store.document` + `store.rooms` (never the boot-time layout copy). Same
 * single scene path as the project entry: `resolveSceneDocument` +
 * `createNavigationGraph`, nothing else.
 */
export function resolvePlanSceneGraphFromDocument(
	document: MuseumSceneDocument,
	rooms: LayoutRoomRegistry
): NavigationGraph {
	const scene = resolveSceneDocument(document, rooms);
	return createNavigationGraph(scene);
}

function directionLabel(
	fromNodeId: string,
	toNodeId: string,
	nodeById: ReadonlyMap<string, { id: string; label?: string }>
) {
	const fromLabel = formatCameraNodeLabel(
		nodeById.get(fromNodeId)?.label,
		fromNodeId
	);
	const toLabel = formatCameraNodeLabel(
		nodeById.get(toNodeId)?.label,
		toNodeId
	);
	return `${fromLabel}→${toLabel}`;
}

/**
 * P1.5 — build the live Camera-authoring profile. Reads the draft document
 * through the supplied room registry and emits every topology edge once (as
 * exact shared draft-curve samples), every node at resolved world X/Z with
 * order/free semantics, relevant interior anchors, selection/hover state, and
 * per-direction effective timing. The returned projection carries empty tour
 * layers and an `authoring` profile: the Camera Plan render model must assert
 * at the model level that no cone/target/portal/framing primitives exist.
 */
export function buildPlanCameraAuthoringProjection(
	document: MuseumSceneDocument,
	rooms: LayoutRoomRegistry,
	options: {
		selection?: PlanCameraSelectionInput;
		hover?: PlanCameraHoverInput;
		mainFlowNodeIds?: readonly string[];
		retainedConnectionIds?: ReadonlySet<string> | readonly string[];
	} = {}
): PlanCameraProjection {
	const graph = resolvePlanSceneGraphFromDocument(document, rooms);
	const selection = options.selection ?? null;
	const hover = options.hover ?? null;
	const orderByNodeId = new Map(
		(options.mainFlowNodeIds ?? []).map((nodeId, index) => [nodeId, index + 1] as const)
	);
	const retained = new Set(options.retainedConnectionIds ?? []);
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));

	const connections: PlanCameraAuthoringConnection[] = [];
	const nodes: PlanCameraAuthoringNode[] = [];
	const anchors: PlanCameraAuthoringAnchor[] = [];
	const labels: PlanRenderPrimitive[] = [];

	const relevantConnectionId =
		selection?.kind === 'connection' || selection?.kind === 'anchor'
			? selection.connectionId
			: null;

	for (const connection of graph.connections) {
		const polyline = sampleDraftConnectionPath2D(
			document,
			connection.id,
			rooms
		);
		const timing = [
			resolveCameraConnectionTiming(connection.id, 'forward', graph),
			resolveCameraConnectionTiming(connection.id, 'reverse', graph)
		];
		connections.push({
			key: geometryId(['plan', 'camera-edge', connection.id]),
			connectionId: connection.id,
			polyline,
			fromNodeId: connection.fromNodeId,
			toNodeId: connection.toNodeId,
			selected: selection?.kind === 'connection' && selection.connectionId === connection.id,
			hovered: hover?.kind === 'edge' && hover.connectionId === connection.id,
			retained: retained.has(connection.id),
			timing
		});

		const midpoint: LayoutVec2 = polyline.length > 0
			? polyline[Math.floor(polyline.length / 2)]!
			: [0, 0];
		for (const readout of timing) {
			const isForward = readout.direction === 'forward';
			const fromId = isForward ? connection.fromNodeId : connection.toNodeId;
			const toId = isForward ? connection.toNodeId : connection.fromNodeId;
			const durationText = Number.isFinite(readout.durationSeconds)
				? `${readout.durationSeconds.toFixed(1)}s`
				: '—';
			labels.push({
				kind: 'text',
				key: geometryId(['plan', 'camera-timing', connection.id, readout.direction]),
				anchor: midpoint,
				text: `${directionLabel(fromId, toId, nodeById)} ${durationText}${readout.authoredDuration ? '' : ' auto'}`,
				offsetPx: isForward ? [0, -16] : [0, 18],
				style: 'camera-timing-label'
			});
		}
	}

	for (const node of document.navigationNodes) {
		const world = rooms.point(node.roomId, node.position);
		const point: LayoutVec2 = [world[0], world[2]];
		const order = orderByNodeId.get(node.id) ?? null;
		nodes.push({
			key: geometryId(['plan', 'camera-node', node.id]),
			nodeId: node.id,
			point,
			order,
			selected: selection?.kind === 'node' && selection.nodeId === node.id,
			hovered: hover?.kind === 'node' && hover.nodeId === node.id
		});
		if (order !== null) {
			labels.push({
				kind: 'text',
				key: geometryId(['plan', 'camera-order-label', node.id]),
				anchor: point,
				text: String(order),
				offsetPx: [0, 4],
				style: 'camera-order-label'
			});
		} else {
			labels.push({
				kind: 'circle',
				key: geometryId(['plan', 'camera-free-badge', node.id]),
				center: point,
				radiusPx: 15,
				style: 'camera-free-badge'
			});
		}
	}

	if (relevantConnectionId !== null) {
		const connection = document.connections.find(
			(candidate) => candidate.id === relevantConnectionId
		);
		for (const anchor of connection?.positionPath.anchors ?? []) {
			const world = anchor.roomId
				? rooms.point(anchor.roomId, anchor.position)
				: anchor.position;
			const point: LayoutVec2 = [world[0], world[2]];
			anchors.push({
				key: geometryId(['plan', 'camera-anchor', relevantConnectionId, anchor.id]),
				connectionId: relevantConnectionId,
				anchorId: anchor.id,
				point,
				selected: selection?.kind === 'anchor' && selection.anchorId === anchor.id,
				hovered: hover?.kind === 'anchor' && hover.anchorId === anchor.id
			});
		}
	}

	return {
		paths: [],
		viewCones: [],
		lookTargets: [],
		portalCrossings: [],
		collisionWarnings: [],
		timingLabels: [],
		authoring: { connections, nodes, anchors, labels, interaction: [] }
	};
}

/**
 * P1.5 — transient Camera Plan interaction primitives (connect rubber band +
 * Add-Camera placement feedback). Screen-constant sizing is carried as px
 * hints for the SVG adapter, matching the layout overlay policy.
 */
export function buildCameraPlanTransientPrimitives(
	transient: CameraPlanTransientState
): PlanRenderPrimitive[] {
	const primitives: PlanRenderPrimitive[] = [];
	if (transient.placementGhost) {
		primitives.push({
			kind: 'circle',
			key: geometryId(['plan', 'camera', 'placement-ghost']),
			center: transient.placementGhost.point,
			radiusPx: 8,
			style: transient.placementGhost.valid
				? 'camera-placement-ghost'
				: 'camera-placement-ghost-invalid'
		});
	}
	if (transient.rubberBand) {
		primitives.push({
			kind: 'polyline',
			key: geometryId(['plan', 'camera', 'connect-band']),
			points: [transient.rubberBand.from, transient.rubberBand.to],
			style: 'camera-connect-band'
		});
	}
	return primitives;
}

/**
 * Build the renderer-neutral camera/tour projection from a resolved graph plus
 * compiled geometry, portal relations, and structured geometry issues. Layers
 * 6–9 map to camera paths, view cones + look targets, portal crossings +
 * collision warnings, and timing labels respectively.
 */
export function buildPlanCameraProjection(
	graph: NavigationGraph,
	compiled: CompiledLayoutGeometry,
	options?: {
		issues?: readonly LayoutGeometryIssue[];
		portalRelations?: readonly LayoutPortalRelation[];
	}
): PlanCameraProjection {
	const paths: PlanPath[] = [];
	const viewCones: PlanViewCone[] = [];
	const lookTargets: PlanLookTarget[] = [];
	const timingLabels: PlanTimingLabel[] = [];

	for (const connection of graph.connections) {
		const route = getCameraConnectionRoute(connection.id, 'forward', graph);
		const polyline = routePolyline2D(route);
		paths.push({
			key: geometryId(['plan', 'camera-path', connection.id]),
			polyline,
			connectionId: connection.id
		});
		const motion = getCameraMotionOptions(connection, 'forward');
		if (motion.durationSeconds !== undefined) {
			timingLabels.push({
				key: geometryId(['plan', 'timing-label', connection.id]),
				anchor: midpoint(polyline),
				text: `${motion.durationSeconds}s`,
				connectionId: connection.id
			});
		}
	}

	for (const node of graph.navigationNodes) {
		viewCones.push({
			key: geometryId(['plan', 'view-cone', node.id]),
			origin: dropY(node.position),
			target: dropY(node.cameraTarget),
			fovDegrees: node.fov,
			nodeId: node.id
		});
		lookTargets.push({
			key: geometryId(['plan', 'look-target', node.id]),
			point: dropY(node.cameraTarget),
			nodeId: node.id
		});
	}

	const portalCrossings: PlanPortalCrossing[] = [];
	for (const relation of options?.portalRelations ?? []) {
		for (const openingRef of relation.openings) {
			const opening = compiled.rooms
				.flatMap((room) => room.openings)
				.find((candidate) => candidate.openingId === openingRef.openingId);
			if (!opening) continue;
			portalCrossings.push({
				key: geometryId(['plan', 'portal-crossing', openingRef.openingId]),
				point: opening.center.point,
				openingId: openingRef.openingId
			});
		}
	}

	const collisionWarnings: PlanCollisionWarning[] = [];
	const openingPoints = new Map(
		compiled.rooms.flatMap((room) => room.openings).map((opening) => [opening.openingId, opening.center.point] as const)
	);
	const roomPoints = new Map(
		compiled.rooms.map((room) => {
			const bounds = room.bounds2;
			return [room.roomId, [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2] as LayoutVec2] as const;
		})
	);
	const objectPoints = new Map(
		compiled.objects.map((object) => {
			const aabb = object.worldAabb;
			return [object.objectId, [(aabb.min[0] + aabb.max[0]) / 2, (aabb.min[2] + aabb.max[2]) / 2] as LayoutVec2] as const;
		})
	);
	for (const issue of options?.issues ?? []) {
		if (!issue.targetId) continue;
		const point = openingPoints.get(issue.targetId) ?? roomPoints.get(issue.targetId) ?? objectPoints.get(issue.targetId);
		if (!point) continue;
		collisionWarnings.push({
			key: geometryId(['plan', 'collision-warning', issue.targetId, issue.code]),
			point,
			issueCode: issue.code
		});
	}

	return { paths, viewCones, lookTargets, portalCrossings, collisionWarnings, timingLabels };
}

/**
 * Convenience entry point for the editor: resolve the project graph and portal
 * relations, then project. Reuses the shared scene resolution path.
 */
export function planCameraProjectionForProject(
	project: MuseumProject,
	compiled: CompiledLayoutGeometry,
	issues?: readonly LayoutGeometryIssue[]
): PlanCameraProjection {
	return buildPlanCameraProjection(resolvePlanSceneGraph(project), compiled, {
		issues,
		portalRelations: projectLayoutPortalRelations(project.layout)
	});
}
