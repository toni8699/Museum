import type { SceneDocument } from '$lib/content/scene';
import type { LayoutVec2 } from '$lib/layout/layout-types';
import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { Vec3 } from '$lib/types/scene';
import { snapToGrid } from './layout-plan-transform';

const FULL_TURN = Math.PI * 2;
const SHIFT_ROTATION_SNAP = Math.PI / 12;

export type PlanSceneTransformMember = {
	id: string;
	roomId: string;
	position: Vec3;
	rotation: Vec3;
};

export type PlanSceneTransformPatch = {
	id: string;
	position: Vec3;
	rotation: Vec3;
};

/** Capture immutable room-local baselines for one cancel-safe Plan gesture. */
export function capturePlanSceneTransformMembers(
	document: SceneDocument,
	ids: readonly string[]
): PlanSceneTransformMember[] | null {
	const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
	const members: PlanSceneTransformMember[] = [];
	for (const id of ids) {
		const entity = byId.get(id);
		if (!entity) return null;
		members.push({
			id,
			roomId: entity.roomId,
			position: [...entity.position],
			rotation: [...entity.rotation]
		});
	}
	return members.length > 0 ? members : null;
}

export function planSceneWorldPivot(
	member: Pick<PlanSceneTransformMember, 'roomId' | 'position'>,
	rooms: LayoutRoomRegistry
): LayoutVec2 {
	const world = rooms.point(member.roomId, member.position);
	return [world[0], world[2]];
}

/**
 * Translate selected Scene members by one Plan-world delta, inverse-resolving
 * each result through its own room. Only local X/Z change.
 */
export function translatePlanSceneMembers(
	members: readonly PlanSceneTransformMember[],
	rooms: LayoutRoomRegistry,
	primaryId: string,
	startWorld: LayoutVec2,
	currentWorld: LayoutVec2,
	options: { snapEnabled: boolean; bypassSnap: boolean }
): PlanSceneTransformPatch[] | null {
	const primary = members.find((member) => member.id === primaryId);
	if (!primary) return null;
	const primaryPivot = planSceneWorldPivot(primary, rooms);
	const rawTarget: LayoutVec2 = [
		primaryPivot[0] + currentWorld[0] - startWorld[0],
		primaryPivot[1] + currentWorld[1] - startWorld[1]
	];
	const target = options.snapEnabled && !options.bypassSnap ? snapToGrid(rawTarget) : rawTarget;
	const delta: LayoutVec2 = [target[0] - primaryPivot[0], target[1] - primaryPivot[1]];
	return members.map((member) => {
		const pivot = planSceneWorldPivot(member, rooms);
		const worldY = rooms.point(member.roomId, member.position)[1];
		const local = rooms.localPoint(member.roomId, [pivot[0] + delta[0], worldY, pivot[1] + delta[1]]);
		return {
			id: member.id,
			position: [local[0], member.position[1], local[2]],
			rotation: [...member.rotation]
		};
	});
}

/**
 * Rotate members rigidly around the primary placement pivot using Three.js
 * positive-Y yaw. Shift snapping applies to the gesture delta in 15° steps.
 */
export function rotatePlanSceneMembers(
	members: readonly PlanSceneTransformMember[],
	rooms: LayoutRoomRegistry,
	primaryId: string,
	startWorld: LayoutVec2,
	currentWorld: LayoutVec2,
	shiftSnap: boolean
): PlanSceneTransformPatch[] | null {
	const primary = members.find((member) => member.id === primaryId);
	if (!primary) return null;
	const pivot = planSceneWorldPivot(primary, rooms);
	let yaw = normalizeYaw(pointerYaw(pivot, currentWorld) - pointerYaw(pivot, startWorld));
	if (shiftSnap) yaw = Math.round(yaw / SHIFT_ROTATION_SNAP) * SHIFT_ROTATION_SNAP;
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	return members.map((member) => {
		const world = planSceneWorldPivot(member, rooms);
		const x = world[0] - pivot[0];
		const z = world[1] - pivot[1];
		const rotatedWorld: LayoutVec2 = [
			pivot[0] + cos * x + sin * z,
			pivot[1] - sin * x + cos * z
		];
		const worldY = rooms.point(member.roomId, member.position)[1];
		const local = rooms.localPoint(member.roomId, [rotatedWorld[0], worldY, rotatedWorld[1]]);
		return {
			id: member.id,
			position: [local[0], member.position[1], local[2]],
			rotation: [member.rotation[0], member.rotation[1] + yaw, member.rotation[2]]
		};
	});
}

function pointerYaw(pivot: LayoutVec2, point: LayoutVec2): number {
	// Positive Three.js Y yaw rotates +X toward -Z.
	return Math.atan2(-(point[1] - pivot[1]), point[0] - pivot[0]);
}

function normalizeYaw(value: number): number {
	let normalized = value % FULL_TURN;
	if (normalized > Math.PI) normalized -= FULL_TURN;
	if (normalized <= -Math.PI) normalized += FULL_TURN;
	return Object.is(normalized, -0) ? 0 : normalized;
}
