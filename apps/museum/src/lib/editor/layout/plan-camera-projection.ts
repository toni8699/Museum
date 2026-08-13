import { createNavigationGraph, resolveSceneDocument, type NavigationGraph } from '$lib/content/scene';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { MuseumProject } from '$lib/project/project-types';
import { getCameraConnectionRoute, getCameraMotionOptions } from '$lib/museum/navigation/camera-route';
import type { Vector3Like } from '$lib/museum/navigation/camera-motion';
import { projectLayoutPortalRelations, type LayoutPortalRelation } from '$lib/layout/layout-portals';
import type { LayoutVec2 } from '$lib/layout/layout-types';
import { geometryId, type CompiledLayoutGeometry, type LayoutGeometryIssue } from '$lib/layout/layout-geometry-types';
import type { PlanCameraProjection } from '$lib/layout/plan-render-model';

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
 * Resolve the project's scene document into the same `NavigationGraph` the
 * visitor uses, but against the editor's current (possibly edited) layout.
 */
export function resolvePlanSceneGraph(project: MuseumProject): NavigationGraph {
	const rooms = createLayoutRoomRegistry(project.layout);
	const scene = resolveSceneDocument(project.scene, rooms);
	return createNavigationGraph(scene);
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
