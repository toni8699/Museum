/**
 * `cloneResolvedCameraRoute` — deep-clone a resolved camera route so the
 * editor never mutates the checked-in graph / motion capture.
 *
 * Slice 3 of the Priority-1 file-split refactor extracts this helper
 * (and its private `cloneRoutePoint` / `isRoutePointTuple` pair) from
 * `museum-editor.svelte.ts` so the function can be reused by future
 * controllers and tested in isolation without dragging the god-file class
 * along.
 *
 * **Duplicate in `camera-preview-controller.svelte.ts`.** That controller
 * owns its own copy of `cloneResolvedCameraRoute` (lines ~70–110) so it
 * doesn't have to import from the editor helpers. Drives a future slice
 * (the route cloning is the canonical surface and the controller should
 * import from here); left untouched for Slice 3 because the plan
 * deliberately freezes the controller's interface and the controller-local
 * copy is the one consumed by `FSM.play()` etc.
 */
import type { Vector3Like } from '$lib/museum/navigation/camera-motion';
import type { ResolvedCameraRoute } from '$lib/museum/navigation/camera-route';
import type { Vec3 } from '$lib/types/museum';

/** Tuple check — `Vector3Like` is either `{x,y,z}` or `[x,y,z]`. */
export function isRoutePointTuple(
	point: Vector3Like
): point is readonly [number, number, number] {
	return Array.isArray(point);
}

/** Materialize any `Vector3Like` into a 3-tuple (deep-clone safe). */
export function cloneRoutePoint(point: Vector3Like): Vec3 {
	return isRoutePointTuple(point)
		? [point[0], point[1], point[2]]
		: [point.x, point.y, point.z];
}

export function cloneResolvedCameraRoute(route: ResolvedCameraRoute): ResolvedCameraRoute {
	return {
		positionParts: route.positionParts.map((part) =>
			part.kind === 'rounded-polyline'
				? {
						kind: part.kind,
						points: part.points.map(cloneRoutePoint),
						...(part.clearance === undefined ? {} : { clearance: part.clearance })
					}
				: {
						kind: part.kind,
						anchors: part.anchors.map(cloneRoutePoint)
					}
		),
		targetPoints: route.targetPoints.map(cloneRoutePoint),
		...(route.startFov === undefined ? {} : { startFov: route.startFov }),
		...(route.endFov === undefined ? {} : { endFov: route.endFov }),
		nodeIds: [...route.nodeIds],
		edges: route.edges.map((edge) => ({
			connectionId: edge.connectionId,
			direction: edge.direction,
			fromNodeId: edge.fromNodeId,
			toNodeId: edge.toNodeId,
			positionSpan: {
				start: { ...edge.positionSpan.start },
				end: { ...edge.positionSpan.end }
			},
			...(edge.viewTrack === undefined
				? {}
				: {
						viewTrack: {
							start: {
								cameraTarget: cloneRoutePoint(edge.viewTrack.start.cameraTarget),
								fov: edge.viewTrack.start.fov
							},
							keyframes: edge.viewTrack.keyframes.map((keyframe) => ({
								id: keyframe.id,
								progress: keyframe.progress,
								cameraTarget: cloneRoutePoint(keyframe.cameraTarget),
								fov: keyframe.fov
							})),
							end: {
								cameraTarget: cloneRoutePoint(edge.viewTrack.end.cameraTarget),
								fov: edge.viewTrack.end.fov
							}
						}
					}),
			...(edge.automaticTargetPoints === undefined
				? {}
				: {
						automaticTargetPoints: edge.automaticTargetPoints.map(cloneRoutePoint)
					})
		}))
	};
}
