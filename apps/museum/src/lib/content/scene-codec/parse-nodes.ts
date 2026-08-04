/**
 * `scene-codec/parse-nodes.ts` — navigation node + waypoint/path-anchor parsers.
 *
 * Hosts the three legacy `parseNodeV*` shapes (V1/V2, V3, V4) plus the
 * shared `parseWaypoint`, `parsePathAnchor`, `parseWaypoints` helpers that
 * `parse-connections.ts` reuses. The `readHoldSeconds` helper sits here
 * because nodes are the only document-level consumer of hold timing.
 *
 * Tagged `@internal` — never imported outside `scene-codec/`.
 */
import { MUSEUM_CAMERA_FOV, type MuseumRoomId, type SceneViewKeyframeTiming } from '$lib/types/museum';
import type {
	SceneNavigationNode,
	ScenePathAnchor,
	SceneWaypoint
} from '../scene';
import type { JsonRecord, ParsedSceneNavigationNode, SceneDocumentIssue, SceneNavigationNodeV1V2 } from './types';
import {
	addIssue,
	assertAllowedKeys,
	isRecord,
	readHoldSeconds,
	readOptionalString,
	readRequiredBoolean,
	readRequiredNumber,
	readRequiredString,
	readRoomId,
	readStringArray,
	readVec3
} from './readers';

export function parseNodeV1V2(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneNavigationNodeV1V2 | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a navigation node object');
		return undefined;
	}
	assertAllowedKeys(input, ['id', 'roomId', 'label', 'position', 'cameraTarget', 'connectedNodeIds', 'nextNodeId', 'previousNodeId', 'lockInteraction'], path, issues);
	const id = readRequiredString(input, 'id', path, issues);
	const roomId = readRoomId(input, 'roomId', path, issues);
	const label = readRequiredString(input, 'label', path, issues);
	const position = readVec3(input.position, `${path}.position`, issues);
	const cameraTarget = readVec3(input.cameraTarget, `${path}.cameraTarget`, issues);
	const connectedNodeIds = readStringArray(input.connectedNodeIds, `${path}.connectedNodeIds`, issues);
	const nextNodeId = readOptionalString(input, 'nextNodeId', path, issues);
	const previousNodeId = readOptionalString(input, 'previousNodeId', path, issues);
	let lockInteraction: boolean | undefined;
	if ('lockInteraction' in input) lockInteraction = readRequiredBoolean(input, 'lockInteraction', path, issues);
	if (!id || !roomId || !label || !position || !cameraTarget || !connectedNodeIds) return undefined;
	return {
		id,
		roomId,
		label,
		position,
		cameraTarget,
		connectedNodeIds,
		...(nextNodeId === undefined ? {} : { nextNodeId }),
		...(previousNodeId === undefined ? {} : { previousNodeId }),
		...(lockInteraction === undefined ? {} : { lockInteraction })
	};
}

export function parseNodeV3(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneNavigationNode | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a navigation node object');
		return undefined;
	}
	assertAllowedKeys(
		input,
		[
			'id',
			'roomId',
			'label',
			'position',
			'cameraTarget',
			'fov',
			'connectedNodeIds',
			'nextNodeId',
			'previousNodeId',
			'lockInteraction'
		],
		path,
		issues
	);
	const id = readRequiredString(input, 'id', path, issues);
	const roomId = readRoomId(input, 'roomId', path, issues);
	const label = readRequiredString(input, 'label', path, issues);
	const position = readVec3(input.position, `${path}.position`, issues);
	const cameraTarget = readVec3(input.cameraTarget, `${path}.cameraTarget`, issues);
	const fov = readRequiredNumber(input, 'fov', path, issues);
	if (
		fov !== undefined &&
		(fov < MUSEUM_CAMERA_FOV.min || fov > MUSEUM_CAMERA_FOV.max)
	) {
		addIssue(
			issues,
			`${path}.fov`,
			'invalid_fov',
			`FOV must be between ${MUSEUM_CAMERA_FOV.min} and ${MUSEUM_CAMERA_FOV.max} degrees`
		);
	}
	const connectedNodeIds = readStringArray(
		input.connectedNodeIds,
		`${path}.connectedNodeIds`,
		issues
	);
	const nextNodeId = readOptionalString(input, 'nextNodeId', path, issues);
	const previousNodeId = readOptionalString(input, 'previousNodeId', path, issues);
	let lockInteraction: boolean | undefined;
	if ('lockInteraction' in input) {
		lockInteraction = readRequiredBoolean(input, 'lockInteraction', path, issues);
	}
	if (
		!id ||
		!roomId ||
		!label ||
		!position ||
		!cameraTarget ||
		fov === undefined ||
		fov < MUSEUM_CAMERA_FOV.min ||
		fov > MUSEUM_CAMERA_FOV.max ||
		!connectedNodeIds
	) {
		return undefined;
	}
	return {
		id,
		roomId,
		label,
		position,
		cameraTarget,
		fov,
		connectedNodeIds,
		...(nextNodeId === undefined ? {} : { nextNodeId }),
		...(previousNodeId === undefined ? {} : { previousNodeId }),
		...(lockInteraction === undefined ? {} : { lockInteraction })
	};
}

export function parseNodeV4(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneNavigationNode | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a navigation node object');
		return undefined;
	}
	assertAllowedKeys(
		input,
		[
			'id',
			'roomId',
			'label',
			'position',
			'cameraTarget',
			'fov',
			'connectedNodeIds',
			'nextNodeId',
			'previousNodeId',
			'lockInteraction',
			'holdSeconds'
		],
		path,
		issues
	);
	const id = readRequiredString(input, 'id', path, issues);
	const roomId = readRoomId(input, 'roomId', path, issues);
	const label = readRequiredString(input, 'label', path, issues);
	const position = readVec3(input.position, `${path}.position`, issues);
	const cameraTarget = readVec3(input.cameraTarget, `${path}.cameraTarget`, issues);
	const fov = readRequiredNumber(input, 'fov', path, issues);
	if (
		fov !== undefined &&
		(fov < MUSEUM_CAMERA_FOV.min || fov > MUSEUM_CAMERA_FOV.max)
	) {
		addIssue(
			issues,
			`${path}.fov`,
			'invalid_fov',
			`FOV must be between ${MUSEUM_CAMERA_FOV.min} and ${MUSEUM_CAMERA_FOV.max} degrees`
		);
	}
	const connectedNodeIds = readStringArray(
		input.connectedNodeIds,
		`${path}.connectedNodeIds`,
		issues
	);
	const nextNodeId = readOptionalString(input, 'nextNodeId', path, issues);
	const previousNodeId = readOptionalString(input, 'previousNodeId', path, issues);
	let lockInteraction: boolean | undefined;
	if ('lockInteraction' in input) {
		lockInteraction = readRequiredBoolean(input, 'lockInteraction', path, issues);
	}
	const holdSeconds = readHoldSeconds(input, 'holdSeconds', path, issues);
	if (
		!id ||
		!roomId ||
		!label ||
		!position ||
		!cameraTarget ||
		fov === undefined ||
		fov < MUSEUM_CAMERA_FOV.min ||
		fov > MUSEUM_CAMERA_FOV.max ||
		!connectedNodeIds
	) {
		return undefined;
	}
	return {
		id,
		roomId,
		label,
		position,
		cameraTarget,
		fov,
		connectedNodeIds,
		...(nextNodeId === undefined ? {} : { nextNodeId }),
		...(previousNodeId === undefined ? {} : { previousNodeId }),
		...(lockInteraction === undefined ? {} : { lockInteraction }),
		...(holdSeconds === undefined ? {} : { holdSeconds })
	};
}

export function parseWaypoint(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneWaypoint | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a waypoint object');
		return undefined;
	}
	assertAllowedKeys(input, ['roomId', 'position'], path, issues);
	let roomId: MuseumRoomId | undefined;
	if ('roomId' in input) roomId = readRoomId(input, 'roomId', path, issues);
	const position = readVec3(input.position, `${path}.position`, issues);
	if (!position) return undefined;
	return { ...(roomId === undefined ? {} : { roomId }), position };
}

export function parsePathAnchor(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): ScenePathAnchor | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a path anchor object');
		return undefined;
	}
	assertAllowedKeys(input, ['id', 'roomId', 'position'], path, issues);
	const id = readRequiredString(input, 'id', path, issues);
	let roomId: MuseumRoomId | undefined;
	if ('roomId' in input) roomId = readRoomId(input, 'roomId', path, issues);
	const position = readVec3(input.position, `${path}.position`, issues);
	if (!id || !position) return undefined;
	return { id, ...(roomId === undefined ? {} : { roomId }), position };
}

export function parseWaypoints(
	value: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneWaypoint[] | undefined {
	if (!Array.isArray(value)) {
		addIssue(issues, path, 'invalid_type', 'Expected an array');
		return undefined;
	}
	const parsed = value.map((waypoint, index) =>
		parseWaypoint(waypoint, `${path}[${index}]`, issues)
	);
	return parsed.every((waypoint): waypoint is SceneWaypoint => waypoint !== undefined)
		? parsed
		: undefined;
}
