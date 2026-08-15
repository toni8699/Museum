/**
 * `scene-codec/parse-connections.ts` — connection parsing + timing helpers.
 *
 * Hosts the canonical connection parser, the position-path/path-anchor
 * adapter, view-track view-keyframe/state machine, and the central timing
 * readers (`readHoldSeconds`, `readEasing`, `parseConnectionTiming`,
 * `parseConnectionTimingPair`). The one public export,
 * `cameraSceneConnectionTimingFailureReason`, is re-exported from
 * `index.ts` for consumer diagnostics.
 *
 * Tagged `@internal` except `cameraSceneConnectionTimingFailureReason`.
 */
import { createCameraPositionPath } from '$lib/museum/navigation/camera-motion';
import {
	MUSEUM_CAMERA_EASING,
	MUSEUM_CAMERA_FOV,
	type CameraEasing,
	type MuseumRoomId,
	type SceneConnectionTiming,
	type SceneViewKeyframeTiming,
	type Vec3
} from '$lib/types/museum';
import type {
	SceneCameraViewKeyframe,
	SceneConnection,
	SceneConnectionTimingPair,
	SceneConnectionViewTracks,
	ScenePathAnchor
} from '../scene';
import type {
	JsonRecord,
	SceneDocumentIssue
} from './types';
import {
	addIssue,
	assertAllowedKeys,
	isRecord,
	readRequiredNumber,
	readRequiredString,
	readRoomId,
	readVec3
} from './readers';
import { parsePathAnchor, parseWaypoints } from './parse-nodes';

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
	let roomId: MuseumRoomId | undefined;
	if ('roomId' in input) roomId = readRoomId(input, 'roomId', path, issues);
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
		fov < MUSEUM_CAMERA_FOV.min ||
		fov > MUSEUM_CAMERA_FOV.max
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
	assertAllowedKeys(input, ['forward', 'reverse'], path, issues);
	const forward = parseViewTrack(input.forward, `${path}.forward`, issues, options);
	const reverse = parseViewTrack(input.reverse, `${path}.reverse`, issues, options);
	if (!forward || !reverse) return undefined;
	return { forward, reverse };
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
	if (!MUSEUM_CAMERA_EASING.includes(normalised as CameraEasing)) {
		addIssue(
			issues,
			`${path}.${key}`,
			'invalid_easing',
			`Expected easing ${MUSEUM_CAMERA_EASING.join(', ')}, received: ${stringifyUnknown(candidate)}`
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
	if (timing.easing !== undefined && !MUSEUM_CAMERA_EASING.includes(timing.easing)) {
		return `easing must be one of ${MUSEUM_CAMERA_EASING.join(', ')}`;
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
