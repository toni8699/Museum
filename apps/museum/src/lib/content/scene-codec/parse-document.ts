/**
 * `scene-codec/parse-document.ts` — node/connection parsing + semantic validation.
 *
 * Hosts every document-shape parser outside the entity/resource trees: navigation
 * nodes, waypoints, path anchors, connections, position paths, camera view tracks,
 * and the connection timing readers. It also hosts the semantic pass that runs on
 * the parsed document (`validateSemantics`), the reciprocal-cycle tour guard
 * (`validateVersionTwoTour`), and the shared uniqueness/geometry helpers.
 *
 * Tagged `@internal` except `cameraSceneConnectionTimingFailureReason`
 * (re-exported from `index.ts` for editor diagnostics). Never imported outside
 * `scene-codec/`.
 */
import {
	CAMERA_EASING,
	CAMERA_FOV,
	type CameraEasing,
	type RoomId,
	type SceneConnectionTiming,
	type Vec3
} from '$lib/types/scene';
import type {
	CameraFramingEnvelope,
	SceneDocument,
	SceneCameraViewKeyframe,
	SceneConnection,
	SceneConnectionTimingPair,
	SceneConnectionViewTracks,
	SceneNavigationNode,
	ScenePathAnchor,
	SceneWaypoint
} from '../scene';
import type { SceneDocumentIssue } from './index';
import type { JsonRecord } from './readers';
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

export function parseNode(
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
			'detourOfNodeId',
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
		(fov < CAMERA_FOV.min || fov > CAMERA_FOV.max)
	) {
		addIssue(
			issues,
			`${path}.fov`,
			'invalid_fov',
			`FOV must be between ${CAMERA_FOV.min} and ${CAMERA_FOV.max} degrees`
		);
	}
	const connectedNodeIds = readStringArray(
		input.connectedNodeIds,
		`${path}.connectedNodeIds`,
		issues
	);
	const nextNodeId = readOptionalString(input, 'nextNodeId', path, issues);
	const previousNodeId = readOptionalString(input, 'previousNodeId', path, issues);
	const detourOfNodeId = readOptionalString(input, 'detourOfNodeId', path, issues);
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
		fov < CAMERA_FOV.min ||
		fov > CAMERA_FOV.max ||
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
		...(detourOfNodeId === undefined ? {} : { detourOfNodeId }),
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
	let roomId: RoomId | undefined;
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
	let roomId: RoomId | undefined;
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

export function parseConnectionBase(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[],
	allowedKeys: readonly string[]
) {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a connection object');
		return undefined;
	}
	assertAllowedKeys(input, allowedKeys, path, issues);
	const id = readRequiredString(input, 'id', path, issues);
	const fromNodeId = readRequiredString(input, 'fromNodeId', path, issues);
	const toNodeId = readRequiredString(input, 'toNodeId', path, issues);
	const clearance = readRequiredNumber(input, 'clearance', path, issues);
	if (clearance !== undefined && clearance <= 0) {
		addIssue(issues, `${path}.clearance`, 'invalid_clearance', 'Clearance must be greater than zero');
	}
	const targetWaypoints = 'targetWaypoints' in input
		? parseWaypoints(input.targetWaypoints, `${path}.targetWaypoints`, issues)
		: undefined;
	if (
		!id ||
		!fromNodeId ||
		!toNodeId ||
		clearance === undefined ||
		clearance <= 0 ||
		('targetWaypoints' in input && !targetWaypoints)
	) {
		return undefined;
	}
	return {
		input,
		id,
		fromNodeId,
		toNodeId,
		clearance,
		...(targetWaypoints === undefined ? {} : { targetWaypoints })
	};
}

export function parsePositionPath(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneConnection['positionPath'] | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a position path object');
		return undefined;
	}
	assertAllowedKeys(input, ['kind', 'anchors'], path, issues);
	const kind = readRequiredString(input, 'kind', path, issues);
	if (kind !== 'rounded-polyline' && kind !== 'auto-bezier') {
		addIssue(
			issues,
			`${path}.kind`,
			'invalid_path_kind',
			`Expected rounded-polyline or auto-bezier, received: ${String(kind)}`
		);
	}
	if (!Array.isArray(input.anchors)) {
		addIssue(issues, `${path}.anchors`, 'invalid_type', 'Expected an array');
		return undefined;
	}
	const anchors = input.anchors.map((anchor, index) =>
		parsePathAnchor(anchor, `${path}.anchors[${index}]`, issues)
	);
	if (
		(kind !== 'rounded-polyline' && kind !== 'auto-bezier') ||
		!anchors.every((anchor): anchor is ScenePathAnchor => anchor !== undefined)
	) {
		return undefined;
	}
	return { kind, anchors };
}

export function parseViewKeyframe(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[],
	options: { allowTiming: boolean }
): SceneCameraViewKeyframe | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a camera view keyframe object');
		return undefined;
	}
	const allowedKeys = options.allowTiming
		? ['id', 'progress', 'cameraTarget', 'roomId', 'fov', 'holdSeconds', 'easing']
		: ['id', 'progress', 'cameraTarget', 'roomId', 'fov'];
	assertAllowedKeys(input, allowedKeys, path, issues);
	const id = readRequiredString(input, 'id', path, issues);
	const progress = readRequiredNumber(input, 'progress', path, issues);
	if (progress !== undefined && (progress <= 0 || progress >= 1)) {
		addIssue(
			issues,
			`${path}.progress`,
			'invalid_view_progress',
			'View keyframe progress must be strictly between zero and one'
		);
	}
	const cameraTarget = readVec3(input.cameraTarget, `${path}.cameraTarget`, issues);
	let roomId: RoomId | undefined;
	if ('roomId' in input) roomId = readRoomId(input, 'roomId', path, issues);
	const fov = readRequiredNumber(input, 'fov', path, issues);
	if (
		fov !== undefined &&
		(fov < CAMERA_FOV.min || fov > CAMERA_FOV.max)
	) {
		addIssue(
			issues,
			`${path}.fov`,
			'invalid_fov',
			`FOV must be between ${CAMERA_FOV.min} and ${CAMERA_FOV.max} degrees`
		);
	}
	let holdSeconds: number | undefined;
	let easing: CameraEasing | undefined;
	if (options.allowTiming) {
		if ('holdSeconds' in input) {
			holdSeconds = readRequiredNumber(input, 'holdSeconds', path, issues);
			if (holdSeconds !== undefined && (!Number.isFinite(holdSeconds) || holdSeconds < 0)) {
				addIssue(
					issues,
					`${path}.holdSeconds`,
					'invalid_view_hold_seconds',
					'View keyframe holdSeconds must be a finite non-negative number'
				);
				holdSeconds = undefined;
			}
		}
		if ('easing' in input) {
			easing = readEasing(input, 'easing', path, issues);
		}
	}
	if (
		!id ||
		progress === undefined ||
		progress <= 0 ||
		progress >= 1 ||
		!cameraTarget ||
		fov === undefined ||
		fov < CAMERA_FOV.min ||
		fov > CAMERA_FOV.max
	) {
		return undefined;
	}
	return {
		id,
		progress,
		cameraTarget,
		...(roomId === undefined ? {} : { roomId }),
		fov,
		...(holdSeconds === undefined ? {} : { holdSeconds }),
		...(easing === undefined ? {} : { easing })
	};
}

export function parseViewTrack(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[],
	options: { allowTiming: boolean }
) {
	if (!Array.isArray(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected an array');
		return undefined;
	}
	const parsed = input.map((keyframe, index) =>
		parseViewKeyframe(keyframe, `${path}[${index}]`, issues, options)
	);
	return parsed.every(
		(keyframe): keyframe is SceneCameraViewKeyframe => keyframe !== undefined
	)
		? parsed
		: undefined;
}

export function parseViewTracks(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[],
	options: { allowTiming: boolean }
): SceneConnectionViewTracks | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a camera view tracks object');
		return undefined;
	}
	assertAllowedKeys(input, ['forward', 'reverse', 'framingEnvelope'], path, issues);
	const forward = parseViewTrack(input.forward, `${path}.forward`, issues, options);
	const reverse = parseViewTrack(input.reverse, `${path}.reverse`, issues, options);
	const framingEnvelope = 'framingEnvelope' in input
		? parseFramingEnvelopeMap(input.framingEnvelope, `${path}.framingEnvelope`, issues)
		: undefined;
	if (!forward || !reverse || ('framingEnvelope' in input && framingEnvelope === undefined)) {
		return undefined;
	}
	return {
		forward,
		reverse,
		...(framingEnvelope === undefined ? {} : { framingEnvelope })
	};
}

const FRAMING_ENVELOPE_KEYS = [
	'enterStart',
	'enterEnd',
	'exitStart',
	'exitEnd'
] as const;

function parseFramingEnvelope(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): CameraFramingEnvelope | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a camera framing envelope object');
		return undefined;
	}
	assertAllowedKeys(input, FRAMING_ENVELOPE_KEYS, path, issues);
	const values = FRAMING_ENVELOPE_KEYS.map((key) =>
		readRequiredNumber(input, key, path, issues)
	);
	if (values.some((value) => value === undefined)) return undefined;
	const envelope: CameraFramingEnvelope = {
		enterStart: values[0]!,
		enterEnd: values[1]!,
		exitStart: values[2]!,
		exitEnd: values[3]!
	};
	for (const key of FRAMING_ENVELOPE_KEYS) {
		if (envelope[key] < 0 || envelope[key] > 1) {
			addIssue(issues, `${path}.${key}`, 'invalid_framing_envelope', 'Framing envelope bounds must be between zero and one');
			return undefined;
		}
	}
	for (let index = 1; index < FRAMING_ENVELOPE_KEYS.length; index += 1) {
		const key = FRAMING_ENVELOPE_KEYS[index]!;
		const previous = FRAMING_ENVELOPE_KEYS[index - 1]!;
		if (envelope[key] < envelope[previous]) {
			addIssue(issues, `${path}.${key}`, 'invalid_framing_envelope', `Framing envelope ${key} must be greater than or equal to ${previous}`);
			return undefined;
		}
	}
	return envelope;
}

function parseFramingEnvelopeMap(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneConnectionViewTracks['framingEnvelope'] | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a directional framing envelope object');
		return undefined;
	}
	assertAllowedKeys(input, ['forward', 'reverse'], path, issues);
	const forward = 'forward' in input
		? parseFramingEnvelope(input.forward, `${path}.forward`, issues)
		: undefined;
	const reverse = 'reverse' in input
		? parseFramingEnvelope(input.reverse, `${path}.reverse`, issues)
		: undefined;
	if (('forward' in input && forward === undefined) || ('reverse' in input && reverse === undefined)) {
		return undefined;
	}
	return {
		...(forward === undefined ? {} : { forward }),
		...(reverse === undefined ? {} : { reverse })
	};
}



export function readEasing(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): CameraEasing | undefined {
	if (!(key in value)) return undefined;
	const candidate = readRequiredString(value, key, path, issues);
	if (candidate === undefined) return undefined;
	const normalised = candidate === 'ease-in-out' ? 'smoothstep' : candidate;
	if (!CAMERA_EASING.includes(normalised as CameraEasing)) {
		addIssue(
			issues,
			`${path}.${key}`,
			'invalid_easing',
			`Expected easing ${CAMERA_EASING.join(', ')}, received: ${stringifyUnknown(candidate)}`
		);
		return undefined;
	}
	return normalised as CameraEasing;
}

/**
 * Public validation helper used by both the codec and the editor setters.
 *
 * Returns the user-facing failure reason string for an authored timing
 * object, or `null` when the object is valid. Keeps the editor's status
 * messages in lock-step with what `parseConnectionTiming` would surface.
 */
export function cameraSceneConnectionTimingFailureReason(
	timing: SceneConnectionTiming
): string | null {
	if (
		timing.durationSeconds !== undefined &&
		(!Number.isFinite(timing.durationSeconds) || timing.durationSeconds <= 0)
	) {
		return 'durationSeconds must be a finite positive number';
	}
	if (timing.easing !== undefined && !CAMERA_EASING.includes(timing.easing)) {
		return `easing must be one of ${CAMERA_EASING.join(', ')}`;
	}
	return null;
}

export function stringifyUnknown(value: unknown) {
	return typeof value === 'string' ? value : String(value);
}

export function parseConnectionTiming(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneConnectionTiming | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a connection timing object');
		return undefined;
	}
	assertAllowedKeys(input, ['durationSeconds', 'easing'], path, issues);
	let durationSeconds: number | undefined;
	if ('durationSeconds' in input) {
		durationSeconds = readRequiredNumber(input, 'durationSeconds', path, issues);
		if (
			durationSeconds !== undefined &&
			(!Number.isFinite(durationSeconds) || durationSeconds <= 0)
		) {
			addIssue(
				issues,
				`${path}.durationSeconds`,
				'invalid_duration_seconds',
				'durationSeconds must be a finite positive number'
			);
			durationSeconds = undefined;
		}
	}
	const easing = readEasing(input, 'easing', path, issues);
	if (durationSeconds === undefined && easing === undefined) return undefined;
	return {
		...(durationSeconds === undefined ? {} : { durationSeconds }),
		...(easing === undefined ? {} : { easing })
	};
}

export function parseConnectionTimingPair(
	value: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneConnectionTimingPair | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		addIssue(issues, path, 'invalid_type', 'Expected a connection timing pair');
		return undefined;
	}
	assertAllowedKeys(value, ['forward', 'reverse'], path, issues);
	const forward = 'forward' in value
		? parseConnectionTiming(value.forward, `${path}.forward`, issues)
		: undefined;
	const reverse = 'reverse' in value
		? parseConnectionTiming(value.reverse, `${path}.reverse`, issues)
		: undefined;
	if (
		('forward' in value && forward === undefined) ||
		('reverse' in value && reverse === undefined)
	) {
		return undefined;
	}
	return {
		...(forward === undefined ? {} : { forward }),
		...(reverse === undefined ? {} : { reverse })
	};
}

export function parseConnection(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneConnection | undefined {
	const base = parseConnectionBase(input, path, issues, [
		'id',
		'fromNodeId',
		'toNodeId',
		'clearance',
		'positionPath',
		'viewTracks',
		'targetWaypoints',
		'timing'
	]);
	if (!base) return undefined;
	const positionPath = parsePositionPath(base.input.positionPath, `${path}.positionPath`, issues);
	const viewTracks = 'viewTracks' in base.input
		? parseViewTracks(base.input.viewTracks, `${path}.viewTracks`, issues, { allowTiming: true })
		: undefined;
	const timing = 'timing' in base.input
		? parseConnectionTimingPair(base.input.timing, `${path}.timing`, issues)
		: undefined;
	if (
		!positionPath ||
		('viewTracks' in base.input && !viewTracks) ||
		('timing' in base.input && timing === undefined)
	) {
		return undefined;
	}
	const { input: _input, ...connection } = base;
	return {
		...connection,
		positionPath,
		...(viewTracks === undefined ? {} : { viewTracks }),
		...(timing === undefined ? {} : { timing })
	};
}

const EPSILON = 1e-6;

export function assertUnique(
	values: readonly { id: string }[],
	label: string,
	path: string,
	issues: SceneDocumentIssue[]
) {
	const seen = new Set<string>();
	for (const [index, value] of values.entries()) {
		if (seen.has(value.id)) addIssue(issues, `${path}[${index}].id`, 'duplicate_id', `Duplicate ${label} id: ${value.id}`);
		seen.add(value.id);
	}
}

export function distance(a: Vec3, b: Vec3) {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
export function validateSemantics(document: SceneDocument, issues: SceneDocumentIssue[]) {
	const entities = document.entities;
	assertUnique(entities, 'scene entity', '$.entities', issues);
	assertUnique(document.navigationNodes, 'navigation node', '$.navigationNodes', issues);
	assertUnique(document.connections, 'connection', '$.connections', issues);
	assertUnique(document.clusters ?? [], 'scene cluster', '$.clusters', issues);
	assertUnique(document.textures, 'texture asset', '$.textures', issues);
	assertUnique(document.materials, 'material instance', '$.materials', issues);
	const textureIds = new Set(document.textures.map((texture) => texture.id));
	for (const [index, material] of document.materials.entries()) {
		if (material.baseTextureId && !textureIds.has(material.baseTextureId)) {
			addIssue(
				issues,
				`$.materials[${index}].baseTextureId`,
				'unknown_texture',
				`Unknown texture asset: ${material.baseTextureId}`
			);
		}
	}
	const materialIds = new Set(document.materials.map((material) => material.id));
	for (const [index, entity] of entities.entries()) {
		if (
			'materialInstanceId' in entity &&
			entity.materialInstanceId !== undefined &&
			!materialIds.has(entity.materialInstanceId)
		) {
			addIssue(
				issues,
				`$.entities[${index}].materialInstanceId`,
				'unknown_material_instance',
				`Unknown material instance: ${entity.materialInstanceId}`
			);
		}
	}

	const entityById = new Map(entities.map((entity) => [entity.id, entity]));
	const clusteredIds = new Set<string>();
	for (const [clusterIndex, cluster] of (document.clusters ?? []).entries()) {
		if (cluster.memberIds.length < 2) addIssue(issues, `$.clusters[${clusterIndex}].memberIds`, 'cluster_too_small', 'Scene cluster must contain at least two members');
		const memberIds = new Set<string>();
		for (const [memberIndex, memberId] of cluster.memberIds.entries()) {
			const path = `$.clusters[${clusterIndex}].memberIds[${memberIndex}]`;
			if (memberIds.has(memberId)) addIssue(issues, path, 'duplicate_cluster_member', `Duplicate member in scene cluster ${cluster.id}: ${memberId}`);
			memberIds.add(memberId);
			const entity = entityById.get(memberId);
			if (!entity) addIssue(issues, path, 'unknown_cluster_member', `Unknown member in scene cluster ${cluster.id}: ${memberId}`);
			else if (entity.roomId !== cluster.roomId) addIssue(issues, path, 'cross_room_cluster_member', `Cross-room member in scene cluster ${cluster.id}: ${memberId}`);
			if (clusteredIds.has(memberId)) addIssue(issues, path, 'multiple_cluster_membership', `Scene entity belongs to multiple clusters: ${memberId}`);
			clusteredIds.add(memberId);
		}
	}

	// Authoring-empty is a valid state: the editor boots into a blank scene
	// before the first navigation node is authored. The graph/cycle checks below
	// assume at least one node, so skip them here; the runtime tour/preview
	// guards a blank project separately.
	if (document.navigationNodes.length === 0) return;
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	for (const [index, node] of document.navigationNodes.entries()) {
		if (distance(node.position, node.cameraTarget) <= EPSILON) addIssue(issues, `$.navigationNodes[${index}].cameraTarget`, 'camera_target_too_close', `Camera eye and target must be farther than ${EPSILON}`);
		const adjacency = new Set<string>();
		for (const [neighborIndex, neighborId] of node.connectedNodeIds.entries()) {
			const path = `$.navigationNodes[${index}].connectedNodeIds[${neighborIndex}]`;
			if (neighborId === node.id) addIssue(issues, path, 'self_adjacency', 'A node cannot be adjacent to itself');
			if (adjacency.has(neighborId)) addIssue(issues, path, 'duplicate_adjacency', `Duplicate adjacency: ${neighborId}`);
			if (!nodeById.has(neighborId)) addIssue(issues, path, 'unknown_node', `Unknown navigation node: ${neighborId}`);
			adjacency.add(neighborId);
		}
	}

	const edgeKeys = new Map<string, number>();
	const edgeKey = (a: string, b: string) => a < b ? `${a.length}:${a}${b.length}:${b}` : `${b.length}:${b}${a.length}:${a}`;
	const generatedEndpointIds = new Set(
		document.navigationNodes.map((node) => `node:${node.id}:position`)
	);
	for (const [index, connection] of document.connections.entries()) {
		const path = `$.connections[${index}]`;
		if (connection.fromNodeId === connection.toNodeId) addIssue(issues, path, 'self_connection', 'A connection cannot join a node to itself');
		if (!nodeById.has(connection.fromNodeId)) addIssue(issues, `${path}.fromNodeId`, 'unknown_node', `Unknown navigation node: ${connection.fromNodeId}`);
		if (!nodeById.has(connection.toNodeId)) addIssue(issues, `${path}.toNodeId`, 'unknown_node', `Unknown navigation node: ${connection.toNodeId}`);
		const key = edgeKey(connection.fromNodeId, connection.toNodeId);
		if (edgeKeys.has(key)) addIssue(issues, path, 'duplicate_connection', `Duplicate undirected connection: ${connection.fromNodeId} / ${connection.toNodeId}`);
		edgeKeys.set(key, index);
		if ('positionPath' in connection) {
			const anchorIds = new Set<string>();
			for (const [anchorIndex, anchor] of connection.positionPath.anchors.entries()) {
				const anchorPath = `${path}.positionPath.anchors[${anchorIndex}].id`;
				if (anchorIds.has(anchor.id)) {
					addIssue(
						issues,
						anchorPath,
						'duplicate_anchor_id',
						`Duplicate path anchor id in ${connection.id}: ${anchor.id}`
					);
				}
				if (generatedEndpointIds.has(anchor.id)) {
					addIssue(
						issues,
						anchorPath,
						'endpoint_anchor_id',
						`Interior anchor id collides with a generated endpoint: ${anchor.id}`
					);
				}
				anchorIds.add(anchor.id);
			}
		}
		const viewTracks = 'viewTracks' in connection
			? (connection.viewTracks as SceneConnectionViewTracks | undefined)
			: undefined;
		if (viewTracks) {
			const keyframeIds = new Set<string>();
			for (const direction of ['forward', 'reverse'] as const) {
				let previousProgress = -Infinity;
				for (const [keyframeIndex, keyframe] of viewTracks[
					direction
				].entries()) {
					const keyframePath = `${path}.viewTracks.${direction}[${keyframeIndex}]`;
					if (keyframeIds.has(keyframe.id)) {
						addIssue(
							issues,
							`${keyframePath}.id`,
							'duplicate_view_keyframe_id',
							`Duplicate camera view keyframe id in ${connection.id}: ${keyframe.id}`
						);
					}
					keyframeIds.add(keyframe.id);
					if (keyframe.progress <= previousProgress) {
						addIssue(
							issues,
							`${keyframePath}.progress`,
							'unordered_view_progress',
							`Camera view keyframe progress must be strictly increasing in the ${direction} track`
						);
					}
					previousProgress = keyframe.progress;
				}
			}
		}
	}

	for (const [index, node] of document.navigationNodes.entries()) {
		for (const [neighborIndex, neighborId] of node.connectedNodeIds.entries()) {
			if (!edgeKeys.has(edgeKey(node.id, neighborId))) addIssue(issues, `$.navigationNodes[${index}].connectedNodeIds[${neighborIndex}]`, 'adjacency_without_connection', `No connection exists between ${node.id} and ${neighborId}`);
		}
	}
	for (const [index, connection] of document.connections.entries()) {
		const from = nodeById.get(connection.fromNodeId);
		const to = nodeById.get(connection.toNodeId);
		if (from && !from.connectedNodeIds.includes(to?.id ?? '')) addIssue(issues, `$.connections[${index}].fromNodeId`, 'connection_without_adjacency', `${from.id} must list ${connection.toNodeId} as adjacent`);
		if (to && !to.connectedNodeIds.includes(from?.id ?? '')) addIssue(issues, `$.connections[${index}].toNodeId`, 'connection_without_adjacency', `${to.id} must list ${connection.fromNodeId} as adjacent`);
	}

	// B0 (S10.1 closeout) — standalone placement authoring state: an isolated
	// free node (no connections yet) is valid. Every node that holds at least
	// one edge must still belong to the single connected graph.
	const connectedNodeIds = document.navigationNodes
		.filter((node) => node.connectedNodeIds.length > 0)
		.map((node) => node.id);
	if (connectedNodeIds.length > 0) {
		const visited = new Set<string>();
		const queue = [connectedNodeIds[0]!];
		while (queue.length) {
			const id = queue.shift()!;
			if (visited.has(id)) continue;
			visited.add(id);
			for (const neighbor of nodeById.get(id)?.connectedNodeIds ?? []) {
				if (!visited.has(neighbor)) queue.push(neighbor);
			}
		}
		if (visited.size !== connectedNodeIds.length) addIssue(issues, '$.connections', 'disconnected_graph', 'Navigation connections must form one connected graph');
	}

	validateVersionTwoTour(document.navigationNodes, nodeById, issues);
}

export function validateVersionTwoTour(
	nodes: readonly SceneNavigationNode[],
	nodeById: ReadonlyMap<string, SceneNavigationNode>,
	issues: SceneDocumentIssue[]
) {
	const linkedNodes: SceneNavigationNode[] = [];
	for (const [index, node] of nodes.entries()) {
		const path = `$.navigationNodes[${index}]`;
		const hasNext = node.nextNodeId !== undefined;
		const hasPrevious = node.previousNodeId !== undefined;
		if (!hasNext && !hasPrevious) {
			// A link-less node with a detour marker is a one-node detour chain
			// (head = tail = itself); its origin must exist (S10.2, F5).
			if (node.detourOfNodeId !== undefined && !nodeById.has(node.detourOfNodeId)) {
				addIssue(
					issues,
					`${path}.detourOfNodeId`,
					'unknown_node',
					`Unknown navigation node: ${node.detourOfNodeId}`
				);
			}
			continue;
		}
		linkedNodes.push(node);
		for (const [key, opposite] of [
			['nextNodeId', 'previousNodeId'],
			['previousNodeId', 'nextNodeId']
		] as const) {
			const linkedId = node[key];
			if (linkedId === undefined) continue;
			if (linkedId === node.id) {
				addIssue(issues, `${path}.${key}`, 'self_tour_link', 'A tour link cannot reference its own node');
				continue;
			}
			const linked = nodeById.get(linkedId);
			if (!linked) {
				addIssue(issues, `${path}.${key}`, 'unknown_node', `Unknown navigation node: ${linkedId}`);
				continue;
			}
			if (linked.nextNodeId === undefined && linked.previousNodeId === undefined) {
				addIssue(
					issues,
					`${path}.${key}`,
					'free_only_tour_link',
					`Tour link ${linkedId} references a free-only node`
				);
			}
			if (!node.connectedNodeIds.includes(linkedId)) {
				addIssue(
					issues,
					`${path}.${key}`,
					'non_adjacent_tour_link',
					`Tour link ${linkedId} is not adjacent`
				);
			}
			if (linked[opposite] !== node.id) {
				addIssue(
					issues,
					`${path}.${key}`,
					'non_reciprocal_tour_link',
					`${linkedId}.${opposite} must equal ${node.id}`
				);
			}
		}
		// detourOfNodeId (S10.2) — valid only on a chain head, referencing an
		// existing node (the origin lives on the main route by convention; the
		// codec cannot know which component is main, so the cross-component rule
		// is enforced by the editor flow validators).
		if (node.detourOfNodeId !== undefined) {
			if (node.previousNodeId !== undefined) {
				addIssue(
					issues,
					`${path}.detourOfNodeId`,
					'detour_not_head',
					'A detour marker is only valid on a chain head (no previousNodeId)'
				);
			}
			if (!nodeById.has(node.detourOfNodeId)) {
				addIssue(
					issues,
					`${path}.detourOfNodeId`,
					'unknown_node',
					`Unknown navigation node: ${node.detourOfNodeId}`
				);
			}
		}
	}

	if (linkedNodes.length === 0) {
		// A graph with no ordered chain is a valid authoring state (a flow can be
		// drafted node-by-node from a blank project). Runtime tour preview is
		// gated by `canStartTourPreview` instead of the codec.
		return;
	}

	// S10.2 component analysis: every ordered component must be a simple open
	// chain (one head, one tail, no repeats), or — legacy — exactly one closed
	// cycle containing every linked node. The loop is never a codec state for
	// new documents; a persisted closed cycle is the legacy single-cycle shape
	// whose open chain + derived loop are resolved at read time by the flow
	// model (`getFlowRoute`).
	const componentOf = new Map<string, number>();
	const components: { nodes: SceneNavigationNode[]; linked: boolean }[] = [];
	for (const node of linkedNodes) {
		if (componentOf.has(node.id)) continue;
		const component: SceneNavigationNode[] = [];
		const queue = [node];
		componentOf.set(node.id, components.length);
		while (queue.length > 0) {
			const current = queue.shift()!;
			component.push(current);
			for (const linkedId of [current.nextNodeId, current.previousNodeId]) {
				if (linkedId === undefined) continue;
				const linked = nodeById.get(linkedId);
				if (!linked || componentOf.has(linked.id)) continue;
				componentOf.set(linked.id, components.length);
				queue.push(linked);
			}
		}
		components.push({ nodes: component, linked: true });
	}
	// One-node detour chains (link-less head with a detour marker) participate
	// in the component analysis as singleton open chains.
	for (const node of nodes) {
		if (node.detourOfNodeId !== undefined && !componentOf.has(node.id)) {
			componentOf.set(node.id, components.length);
			components.push({ nodes: [node], linked: false });
		}
	}

	const invalidComponent = () =>
		addIssue(
			issues,
			'$.navigationNodes',
			'invalid_tour_cycle',
			'Order links must form simple open chains (or one legacy closed cycle)'
		);

	let legacyCycleCount = 0;
	let linkedComponentCount = 0;
	let legacyCycleNodeIds: string[] | undefined;
	for (const { nodes: component, linked } of components) {
		if (linked) linkedComponentCount += 1;
		const inComponent = new Set(component.map((node) => node.id));
		const heads = component.filter(
			(node) =>
				node.previousNodeId === undefined || !inComponent.has(node.previousNodeId)
		);
		const tails = component.filter(
			(node) => node.nextNodeId === undefined || !inComponent.has(node.nextNodeId)
		);
		const closed = heads.length === 0 && tails.length === 0;
		if (closed) {
			const start = component[0]!;
			const visited = new Set<string>();
			let cursor: SceneNavigationNode | undefined = start;
			while (cursor && !visited.has(cursor.id)) {
				visited.add(cursor.id);
				const nextId: string | undefined = cursor.nextNodeId;
				cursor = nextId === undefined ? undefined : nodeById.get(nextId);
			}
			if (visited.size !== component.length || cursor?.id !== start.id) {
				invalidComponent();
			}
			legacyCycleCount += 1;
			legacyCycleNodeIds = component.map((node) => node.id);
			continue;
		}
		if (heads.length !== 1 || tails.length !== 1) {
			invalidComponent();
			continue;
		}
		const head = heads[0]!;
		const visited = new Set<string>();
		let cursor: SceneNavigationNode | undefined = head;
		while (cursor && !visited.has(cursor.id)) {
			visited.add(cursor.id);
			const nextId: string | undefined = cursor.nextNodeId;
			cursor =
				nextId === undefined || !inComponent.has(nextId)
					? undefined
					: nodeById.get(nextId);
		}
		if (visited.size !== component.length) {
			invalidComponent();
		}
	}

	if (legacyCycleCount > 0 && linkedComponentCount !== 1) {
		// A legacy closed cycle may coexist only with detour chains: every
		// other linked component must be a chain whose head declares an origin
		// inside the closed cycle. Any other open chain next to a closed cycle
		// would be ambiguous under the flow model (which component is main?).
		// One-node detour chains are link-less and never conflict.
		const cycleIds = new Set(legacyCycleNodeIds ?? []);
		const otherLinkedComponents = components.filter(
			({ nodes: component, linked: isLinked }) => {
				if (!isLinked) return false;
				const isCycle =
					component.length === cycleIds.size &&
					component.every((node) => cycleIds.has(node.id));
				return !isCycle;
			}
		);
		const everyOtherIsDetour = otherLinkedComponents.every(({ nodes: component }) => {
			const head = component.find(
				(node) =>
					node.previousNodeId === undefined ||
					!component.some((candidate) => candidate.id === node.previousNodeId)
			);
			return (
				head !== undefined &&
				head.detourOfNodeId !== undefined &&
				cycleIds.has(head.detourOfNodeId)
			);
		});
		if (!everyOtherIsDetour) {
			addIssue(
				issues,
				'$.navigationNodes',
				'invalid_tour_cycle',
				'A closed order cycle must contain every ordered node (legacy single-cycle shape)'
			);
		}
	}
}
