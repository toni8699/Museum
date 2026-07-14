import type { MuseumRoom, Vec3 } from '$lib/types/museum';

export const EDITOR_CAMERA_FOV = 50;
export const EDITOR_NEUTRAL_CAMERA_POSITION: Vec3 = [0, 18, 24];
export const EDITOR_NEUTRAL_CAMERA_TARGET: Vec3 = [0, 1, 0];

export type EditorRoomCameraFrame = {
	position: Vec3;
	target: Vec3;
	radius: number;
	minDistance: number;
	maxDistance: number;
};

function rotateLocalOffset(room: MuseumRoom, offset: Vec3): Vec3 {
	const yaw = room.rotation[1];
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	const [x, y, z] = offset;
	return [x * cos + z * sin, y, -x * sin + z * cos];
}

/** Deterministic whole-room framing that follows the room's authored yaw. */
export function createEditorRoomCameraFrame(
	room: MuseumRoom,
	fovDegrees = EDITOR_CAMERA_FOV
): EditorRoomCameraFrame {
	const [width, height, depth] = room.dimensions;
	const radius = Math.hypot(width, height, depth) / 2;
	const halfFovRadians = (fovDegrees * Math.PI) / 360;
	const distance = (radius / Math.sin(halfFovRadians)) * 1.05;
	const target: Vec3 = [room.position[0], room.position[1] + height / 2, room.position[2]];

	const localDirectionLength = Math.hypot(0.55, 1);
	const localOffset: Vec3 = [
		0,
		(distance * 0.55) / localDirectionLength,
		distance / localDirectionLength
	];
	const worldOffset = rotateLocalOffset(room, localOffset);

	return {
		position: [
			target[0] + worldOffset[0],
			target[1] + worldOffset[1],
			target[2] + worldOffset[2]
		],
		target,
		radius,
		minDistance: Math.max(2, radius * 0.45),
		maxDistance: distance * 1.5
	};
}
