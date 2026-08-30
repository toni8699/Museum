import type { SceneDocument, SceneRoomResolver } from '$lib/content/scene';
import { createCameraPositionPath } from '@portfolio/camera-core';
import { layoutRoomLocalPoint, layoutRoomPoint } from '$lib/layout/layout-room-frame';
import type { LayoutDocument, LayoutFloor, LayoutRoom } from '$lib/layout/layout-types';
import type { Vec3 } from '$lib/types/scene';
import type { ProjectIssue } from './project-types';

const CAMERA_EPSILON = 1e-6;

export type LayoutRoomRegistryEntry = {
	id: string;
	name: string;
	floor: LayoutFloor;
	room: LayoutRoom;
	position: Vec3;
	rotation: Vec3;
};

export type LayoutRoomRegistry = SceneRoomResolver & {
	readonly entries: readonly LayoutRoomRegistryEntry[];
	readonly byId: ReadonlyMap<string, LayoutRoomRegistryEntry>;
	get(roomId: string): LayoutRoomRegistryEntry | undefined;
	getRequired(roomId: string): LayoutRoomRegistryEntry;
	localPoint(roomId: string, worldPoint: Vec3): Vec3;
};

export function createLayoutRoomRegistry(layout: LayoutDocument): LayoutRoomRegistry {
	const entries = layout.floors.flatMap((floor) =>
		floor.rooms.map((room): LayoutRoomRegistryEntry => ({
			id: room.id,
			name: room.name,
			floor,
			room,
			position: [room.frame.origin[0], floor.elevation, room.frame.origin[1]],
			rotation: [0, room.frame.yaw, 0]
		}))
	);
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const getRequired = (roomId: string): LayoutRoomRegistryEntry => {
		const entry = byId.get(roomId);
		if (!entry) throw new Error(`Unknown project layout room: ${roomId}`);
		return entry;
	};
	return {
		entries,
		byId,
		has: (roomId) => byId.has(roomId),
		get: (roomId) => byId.get(roomId),
		getRequired,
		point: (roomId, localPoint) => {
			const entry = getRequired(roomId);
			return layoutRoomPoint(entry.room, entry.floor, localPoint);
		},
		localPoint: (roomId, worldPoint) => {
			const entry = getRequired(roomId);
			return layoutRoomLocalPoint(entry.room, entry.floor, worldPoint);
		}
	};
}

export function validateProjectSceneRooms(
	scene: SceneDocument,
	rooms: LayoutRoomRegistry
): ProjectIssue[] {
	const issues: ProjectIssue[] = [];
	const check = (roomId: string | undefined, path: string) => {
		if (roomId !== undefined && !rooms.has(roomId)) {
			issues.push({ path, code: 'unknown_room', message: `Unknown project layout room: ${roomId}` });
		}
	};

	for (const [index, entity] of scene.entities.entries()) {
		check(entity.roomId, `$.scene.entities[${index}].roomId`);
	}
	for (const [index, cluster] of (scene.clusters ?? []).entries()) {
		check(cluster.roomId, `$.scene.clusters[${index}].roomId`);
	}
	for (const [index, node] of scene.navigationNodes.entries()) {
		check(node.roomId, `$.scene.navigationNodes[${index}].roomId`);
	}
	for (const [connectionIndex, connection] of scene.connections.entries()) {
		for (const direction of ['forward', 'reverse'] as const) {
			const envelope = connection.viewTracks?.framingEnvelope?.[direction];
			if (!envelope) continue;
			const keys = ['enterStart', 'enterEnd', 'exitStart', 'exitEnd'] as const;
			for (const [boundIndex, key] of keys.entries()) {
				const value = envelope[key];
				const previous = boundIndex === 0 ? undefined : envelope[keys[boundIndex - 1]!];
				if (!Number.isFinite(value) || value < 0 || value > 1 || (previous !== undefined && value < previous)) {
					issues.push({
						path: `$.scene.connections[${connectionIndex}].viewTracks.framingEnvelope.${direction}.${key}`,
						code: 'invalid_framing_envelope',
						message: 'Framing envelope bounds must be finite, ordered, and between zero and one'
					});
					break;
				}
			}
		}
		for (const [anchorIndex, anchor] of connection.positionPath.anchors.entries()) {
			check(anchor.roomId, `$.scene.connections[${connectionIndex}].positionPath.anchors[${anchorIndex}].roomId`);
		}
		for (const [waypointIndex, waypoint] of (connection.targetWaypoints ?? []).entries()) {
			check(waypoint.roomId, `$.scene.connections[${connectionIndex}].targetWaypoints[${waypointIndex}].roomId`);
		}
		for (const direction of ['forward', 'reverse'] as const) {
			for (const [keyframeIndex, keyframe] of (connection.viewTracks?.[direction] ?? []).entries()) {
				check(keyframe.roomId, `$.scene.connections[${connectionIndex}].viewTracks.${direction}[${keyframeIndex}].roomId`);
			}
		}
	}
	if (issues.length === 0) validateProjectCameraPoses(scene, rooms, issues);
	return issues;
}

function validateProjectCameraPoses(
	scene: SceneDocument,
	rooms: LayoutRoomRegistry,
	issues: ProjectIssue[]
): void {
	const nodeById = new Map(scene.navigationNodes.map((node) => [node.id, node]));
	for (const [connectionIndex, connection] of scene.connections.entries()) {
		if (!connection.viewTracks) continue;
		const fromNode = nodeById.get(connection.fromNodeId);
		const toNode = nodeById.get(connection.toNodeId);
		if (!fromNode || !toNode) continue;
		const anchors: Vec3[] = [
			rooms.point(fromNode.roomId, fromNode.position),
			...connection.positionPath.anchors.map((anchor) =>
				anchor.roomId ? rooms.point(anchor.roomId, anchor.position) : [...anchor.position] as Vec3
			),
			rooms.point(toNode.roomId, toNode.position)
		];
		const positionPath = createCameraPositionPath([
			connection.positionPath.kind === 'rounded-polyline'
				? { kind: 'rounded-polyline', points: anchors, clearance: connection.clearance }
				: { kind: 'auto-bezier', anchors }
		]);
		for (const direction of ['forward', 'reverse'] as const) {
			for (const [keyframeIndex, keyframe] of connection.viewTracks[direction].entries()) {
				const eye = positionPath.getPointAt(
					direction === 'forward' ? keyframe.progress : 1 - keyframe.progress
				);
				const target = keyframe.roomId
					? rooms.point(keyframe.roomId, keyframe.cameraTarget)
					: keyframe.cameraTarget;
				if (Math.hypot(eye.x - target[0], eye.y - target[1], eye.z - target[2]) <= CAMERA_EPSILON) {
					issues.push({
						path: `$.scene.connections[${connectionIndex}].viewTracks.${direction}[${keyframeIndex}].cameraTarget`,
						code: 'camera_target_too_close',
						message: `Camera eye and target must be farther than ${CAMERA_EPSILON}`
					});
				}
			}
		}
	}
}
