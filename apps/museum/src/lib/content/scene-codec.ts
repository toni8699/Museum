import { getAssetById, isSceneObjectFallback } from './assets';
import { isMaterialId } from './materials';
import { getRoom, roomPoint } from './rooms';
import { isSafeTextureUri } from './texture-uri';
import { createCameraPositionPath } from '$lib/museum/navigation/camera-motion';
import type {
	MuseumSceneDocument,
	SceneBoxDimensions,
	SceneCameraViewKeyframe,
	SceneConnection,
	SceneConnectionTimingPair,
	SceneConnectionViewTracks,
	SceneCylinderDimensions,
	SceneEntity,
	SceneLightEntity,
	SceneLightKind,
	SceneMaterialInstance,
	SceneModelEntity,
	SceneNavigationNode,
	SceneObjectCluster,
	SceneObjectPlacement,
	ScenePathAnchor,
	ScenePlaneDimensions,
	ScenePrimitiveEntity,
	ScenePrimitiveKind,
	SceneSphereDimensions,
	SceneTextureAsset,
	SceneWaypoint
} from './scene';
import {
	MUSEUM_CAMERA_EASING,
	MUSEUM_CAMERA_FOV,
	type CameraEasing,
	type MuseumRoomId,
	type SceneConnectionTiming,
	type SceneViewKeyframeTiming,
	type Vec3
} from '$lib/types/museum';
import type { MaterialId } from '$lib/types/materials';

export type SceneDocumentIssue = {
	path: string;
	code: string;
	message: string;
};

export type SceneDocumentValidationResult =
	| { success: true; document: MuseumSceneDocument; canonicalJson: string }
	| { success: false; issues: SceneDocumentIssue[] };

export class SceneDocumentValidationError extends Error {
	readonly issue: SceneDocumentIssue;

	constructor(issue: SceneDocumentIssue) {
		super(`${issue.path} (${issue.code}): ${issue.message}`);
		this.name = 'SceneDocumentValidationError';
		this.issue = issue;
	}
}

const EPSILON = 1e-6;

type JsonRecord = Record<string, unknown>;

type SceneNavigationNodeV1V2 = Omit<SceneNavigationNode, 'fov'>;

type SceneConnectionV2 = Omit<SceneConnection, 'viewTracks'>;

/** Pre-v5 document shape: model placements live under `objects`. */
type MuseumSceneDocumentWithObjects = {
	objects: SceneObjectPlacement[];
	clusters?: SceneObjectCluster[];
	navigationNodes: SceneNavigationNode[];
	connections: SceneConnection[];
};

type MuseumSceneDocumentV3V4 = MuseumSceneDocumentWithObjects & {
	version: 3 | 4;
};

/** v5 has canonical entities but predates texture/material resources. */
type MuseumSceneDocumentV5 = Omit<
	MuseumSceneDocument,
	'version' | 'textures' | 'materials'
> & {
	version: 5;
};

type MuseumSceneDocumentV2 = {
	version: 2;
	objects: SceneObjectPlacement[];
	clusters?: SceneObjectCluster[];
	navigationNodes: SceneNavigationNodeV1V2[];
	connections: SceneConnectionV2[];
};

type LegacySceneConnection = Omit<SceneConnectionV2, 'positionPath'> & {
	positionWaypoints: SceneWaypoint[];
};

type LegacyMuseumSceneDocument = Omit<MuseumSceneDocumentV2, 'version' | 'connections'> & {
	version: 1;
	connections: LegacySceneConnection[];
};

type ParsedMuseumSceneDocument =
	| MuseumSceneDocument
	| MuseumSceneDocumentV5
	| MuseumSceneDocumentV3V4
	| MuseumSceneDocumentV2
	| LegacyMuseumSceneDocument;

type ParsedSceneNavigationNode = SceneNavigationNode | SceneNavigationNodeV1V2;

const SCENE_PRIMITIVE_KINDS = ['box', 'plane', 'cylinder', 'sphere'] as const;
const SCENE_LIGHT_KINDS = ['point', 'spot', 'directional'] as const;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function modelEntityFromPlacement(placement: SceneObjectPlacement): SceneModelEntity {
	const assetName = getAssetById(placement.assetId)?.name;
	return {
		kind: 'model',
		id: placement.id,
		name: assetName || placement.id,
		roomId: placement.roomId,
		assetId: placement.assetId,
		fallback: placement.fallback,
		position: placement.position,
		rotation: placement.rotation,
		...(placement.scale === undefined ? {} : { scale: placement.scale })
	};
}

function documentEntities(document: ParsedMuseumSceneDocument): SceneEntity[] {
	if ('entities' in document) return document.entities;
	return document.objects.map((object) => modelEntityFromPlacement(object));
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(
	issues: SceneDocumentIssue[],
	path: string,
	code: string,
	message: string
) {
	issues.push({ path, code, message });
}

function assertAllowedKeys(
	value: JsonRecord,
	allowed: readonly string[],
	path: string,
	issues: SceneDocumentIssue[]
) {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			addIssue(issues, `${path}.${key}`, 'unknown_property', `Unknown property: ${key}`);
		}
	}
}

function readRequiredString(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): string | undefined {
	const candidate = value[key];
	if (typeof candidate !== 'string') {
		addIssue(issues, `${path}.${key}`, 'invalid_type', 'Expected a string');
		return undefined;
	}
	if (!candidate.trim()) {
		addIssue(issues, `${path}.${key}`, 'empty_string', 'Expected a non-empty string');
	}
	return candidate;
}

function readOptionalString(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): string | undefined {
	if (!(key in value)) return undefined;
	return readRequiredString(value, key, path, issues);
}

function readRequiredBoolean(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): boolean | undefined {
	const candidate = value[key];
	if (typeof candidate !== 'boolean') {
		addIssue(issues, `${path}.${key}`, 'invalid_type', 'Expected a boolean');
		return undefined;
	}
	return candidate;
}

function readRequiredNumber(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): number | undefined {
	const candidate = value[key];
	if (typeof candidate !== 'number') {
		addIssue(issues, `${path}.${key}`, 'invalid_type', 'Expected a number');
		return undefined;
	}
	if (!Number.isFinite(candidate)) {
		addIssue(issues, `${path}.${key}`, 'non_finite_number', 'Expected a finite number');
		return undefined;
	}
	return candidate;
}

function readUnitInterval(
	value: JsonRecord,
	key: 'roughness' | 'metalness',
	path: string,
	issues: SceneDocumentIssue[]
): number | undefined {
	if (!(key in value)) return undefined;
	const candidate = readRequiredNumber(value, key, path, issues);
	if (candidate === undefined) return undefined;
	if (candidate < 0 || candidate > 1) {
		addIssue(
			issues,
			`${path}.${key}`,
			`invalid_${key}`,
			`${key} must be between zero and one`
		);
		return undefined;
	}
	return candidate;
}

function parseTextureAsset(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneTextureAsset | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a texture asset object');
		return undefined;
	}
	assertAllowedKeys(input, ['id', 'name', 'uri'], path, issues);
	const id = readRequiredString(input, 'id', path, issues);
	const name = readRequiredString(input, 'name', path, issues);
	const uri = readRequiredString(input, 'uri', path, issues);
	if (uri && !isSafeTextureUri(uri)) {
		addIssue(
			issues,
			`${path}.uri`,
			'unsafe_texture_uri',
			'Texture URI must be a safe root-relative public path'
		);
	}
	if (!id || !name || !uri || !isSafeTextureUri(uri)) return undefined;
	return { id, name, uri };
}

function parseMaterialInstance(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneMaterialInstance | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a material instance object');
		return undefined;
	}
	assertAllowedKeys(
		input,
		['id', 'name', 'baseMaterialId', 'baseTextureId', 'roughness', 'metalness'],
		path,
		issues
	);
	const id = readRequiredString(input, 'id', path, issues);
	const name = readRequiredString(input, 'name', path, issues);
	const baseMaterialIdRaw = readRequiredString(input, 'baseMaterialId', path, issues);
	const baseMaterialId =
		baseMaterialIdRaw && isMaterialId(baseMaterialIdRaw)
			? (baseMaterialIdRaw as MaterialId)
			: undefined;
	if (baseMaterialIdRaw && !baseMaterialId) {
		addIssue(
			issues,
			`${path}.baseMaterialId`,
			'unknown_material',
			`Unknown museum material: ${baseMaterialIdRaw}`
		);
	}
	const baseTextureId = readOptionalString(input, 'baseTextureId', path, issues);
	const roughness = readUnitInterval(input, 'roughness', path, issues);
	const metalness = readUnitInterval(input, 'metalness', path, issues);
	if (
		!id ||
		!name ||
		!baseMaterialId ||
		('baseTextureId' in input && !baseTextureId) ||
		('roughness' in input && roughness === undefined) ||
		('metalness' in input && metalness === undefined)
	) {
		return undefined;
	}
	return {
		id,
		name,
		baseMaterialId,
		...(baseTextureId === undefined ? {} : { baseTextureId }),
		...(roughness === undefined ? {} : { roughness }),
		...(metalness === undefined ? {} : { metalness })
	};
}

function readVec3(
	value: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): Vec3 | undefined {
	if (!Array.isArray(value) || value.length !== 3) {
		addIssue(issues, path, 'invalid_vec3', 'Expected an array of exactly three finite numbers');
		return undefined;
	}
	const points: number[] = [];
	for (const [index, candidate] of value.entries()) {
		if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
			addIssue(issues, `${path}[${index}]`, 'non_finite_number', 'Expected a finite number');
		} else {
			points.push(candidate);
		}
	}
	return points.length === 3 ? [points[0]!, points[1]!, points[2]!] : undefined;
}

function isKnownRoomId(value: string): value is MuseumRoomId {
	try {
		getRoom(value as MuseumRoomId);
		return true;
	} catch {
		return false;
	}
}

function readRoomId(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): MuseumRoomId | undefined {
	const roomId = readRequiredString(value, key, path, issues);
	if (roomId && !isKnownRoomId(roomId)) {
		addIssue(issues, `${path}.${key}`, 'unknown_room', `Unknown museum room: ${roomId}`);
		return undefined;
	}
	return roomId as MuseumRoomId | undefined;
}

function readStringArray(
	value: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): string[] | undefined {
	if (!Array.isArray(value)) {
		addIssue(issues, path, 'invalid_type', 'Expected an array');
		return undefined;
	}
	const result: string[] = [];
	for (const [index, item] of value.entries()) {
		if (typeof item !== 'string' || !item.trim()) {
			addIssue(issues, `${path}[${index}]`, 'invalid_type', 'Expected a non-empty string');
		} else {
			result.push(item);
		}
	}
	return result.length === value.length ? result : undefined;
}

function parsePlacement(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneObjectPlacement | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a placement object');
		return undefined;
	}
	assertAllowedKeys(input, ['id', 'roomId', 'assetId', 'fallback', 'position', 'rotation', 'scale'], path, issues);
	const id = readRequiredString(input, 'id', path, issues);
	const roomId = readRoomId(input, 'roomId', path, issues);
	const assetId = readRequiredString(input, 'assetId', path, issues);
	if (assetId && !getAssetById(assetId)) {
		addIssue(issues, `${path}.assetId`, 'unknown_asset', `Unknown museum asset: ${assetId}`);
	}
	const fallback = readRequiredString(input, 'fallback', path, issues);
	if (fallback && !isSceneObjectFallback(fallback)) {
		addIssue(issues, `${path}.fallback`, 'invalid_fallback', `Invalid fallback: ${fallback}`);
	}
	const position = readVec3(input.position, `${path}.position`, issues);
	const rotation = readVec3(input.rotation, `${path}.rotation`, issues);
	let scale: number | undefined;
	if ('scale' in input) {
		scale = readRequiredNumber(input, 'scale', path, issues);
		if (scale !== undefined && scale <= 0) {
			addIssue(issues, `${path}.scale`, 'invalid_scale', 'Scale must be greater than zero');
		}
	}
	if (!id || !roomId || !assetId || !fallback || !position || !rotation || (scale !== undefined && scale <= 0)) {
		return undefined;
	}
	return {
		id,
		roomId,
		assetId,
		fallback: fallback as SceneObjectPlacement['fallback'],
		position,
		rotation,
		...(scale === undefined ? {} : { scale })
	};
}

function readPositiveDimension(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): number | undefined {
	const number = readRequiredNumber(value, key, path, issues);
	if (number === undefined) return undefined;
	if (!Number.isFinite(number) || number <= 0) {
		addIssue(issues, `${path}.${key}`, 'invalid_dimension', `${key} must be a finite number greater than zero`);
		return undefined;
	}
	return number;
}

function parsePrimitiveDimensions(
	primitive: ScenePrimitiveKind,
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): ScenePrimitiveEntity['dimensions'] | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a dimensions object');
		return undefined;
	}
	if (primitive === 'box') {
		assertAllowedKeys(input, ['width', 'height', 'depth'], path, issues);
		const width = readPositiveDimension(input, 'width', path, issues);
		const height = readPositiveDimension(input, 'height', path, issues);
		const depth = readPositiveDimension(input, 'depth', path, issues);
		if (width === undefined || height === undefined || depth === undefined) return undefined;
		return { width, height, depth } satisfies SceneBoxDimensions;
	}
	if (primitive === 'plane') {
		assertAllowedKeys(input, ['width', 'height'], path, issues);
		const width = readPositiveDimension(input, 'width', path, issues);
		const height = readPositiveDimension(input, 'height', path, issues);
		if (width === undefined || height === undefined) return undefined;
		return { width, height } satisfies ScenePlaneDimensions;
	}
	if (primitive === 'cylinder') {
		assertAllowedKeys(input, ['radius', 'height'], path, issues);
		const radius = readPositiveDimension(input, 'radius', path, issues);
		const height = readPositiveDimension(input, 'height', path, issues);
		if (radius === undefined || height === undefined) return undefined;
		return { radius, height } satisfies SceneCylinderDimensions;
	}
	assertAllowedKeys(input, ['radius'], path, issues);
	const radius = readPositiveDimension(input, 'radius', path, issues);
	if (radius === undefined) return undefined;
	return { radius } satisfies SceneSphereDimensions;
}

function parseEntityTransform(
	input: JsonRecord,
	path: string,
	issues: SceneDocumentIssue[]
): { position: Vec3; rotation: Vec3; scale?: number } | undefined {
	const position = readVec3(input.position, `${path}.position`, issues);
	const rotation = readVec3(input.rotation, `${path}.rotation`, issues);
	let scale: number | undefined;
	if ('scale' in input) {
		scale = readRequiredNumber(input, 'scale', path, issues);
		if (scale !== undefined && scale <= 0) {
			addIssue(issues, `${path}.scale`, 'invalid_scale', 'Scale must be greater than zero');
			scale = undefined;
		}
	}
	if (!position || !rotation || ('scale' in input && scale === undefined)) return undefined;
	return { position, rotation, ...(scale === undefined ? {} : { scale }) };
}

function parseModelEntity(
	input: JsonRecord,
	path: string,
	issues: SceneDocumentIssue[],
	options: { allowMaterialInstance: boolean }
): SceneModelEntity | undefined {
	assertAllowedKeys(
		input,
		[
			'kind',
			'id',
			'name',
			'roomId',
			'assetId',
			'fallback',
			'position',
			'rotation',
			'scale',
			...(options.allowMaterialInstance ? ['materialInstanceId'] : [])
		],
		path,
		issues
	);
	const id = readRequiredString(input, 'id', path, issues);
	const name = readRequiredString(input, 'name', path, issues);
	const roomId = readRoomId(input, 'roomId', path, issues);
	const assetId = readRequiredString(input, 'assetId', path, issues);
	if (assetId && !getAssetById(assetId)) {
		addIssue(issues, `${path}.assetId`, 'unknown_asset', `Unknown museum asset: ${assetId}`);
	}
	const fallback = readRequiredString(input, 'fallback', path, issues);
	if (fallback && !isSceneObjectFallback(fallback)) {
		addIssue(issues, `${path}.fallback`, 'invalid_fallback', `Invalid fallback: ${fallback}`);
	}
	const materialInstanceId = options.allowMaterialInstance
		? readOptionalString(input, 'materialInstanceId', path, issues)
		: undefined;
	const transform = parseEntityTransform(input, path, issues);
	if (
		!id ||
		!name ||
		!roomId ||
		!assetId ||
		!fallback ||
		!transform ||
		(options.allowMaterialInstance && 'materialInstanceId' in input && !materialInstanceId)
	) {
		return undefined;
	}
	return {
		kind: 'model',
		id,
		name,
		roomId,
		assetId,
		fallback: fallback as SceneModelEntity['fallback'],
		...transform,
		...(materialInstanceId === undefined ? {} : { materialInstanceId })
	};
}

function parsePrimitiveEntity(
	input: JsonRecord,
	path: string,
	issues: SceneDocumentIssue[],
	options: { allowMaterialInstance: boolean }
): ScenePrimitiveEntity | undefined {
	assertAllowedKeys(
		input,
		[
			'kind',
			'id',
			'name',
			'roomId',
			'primitive',
			'dimensions',
			'materialId',
			'castShadow',
			'receiveShadow',
			'position',
			'rotation',
			'scale',
			...(options.allowMaterialInstance ? ['materialInstanceId'] : [])
		],
		path,
		issues
	);
	const id = readRequiredString(input, 'id', path, issues);
	const name = readRequiredString(input, 'name', path, issues);
	const roomId = readRoomId(input, 'roomId', path, issues);
	const primitiveRaw = readRequiredString(input, 'primitive', path, issues);
	const primitive =
		primitiveRaw && (SCENE_PRIMITIVE_KINDS as readonly string[]).includes(primitiveRaw)
			? (primitiveRaw as ScenePrimitiveKind)
			: undefined;
	if (primitiveRaw && !primitive) {
		addIssue(issues, `${path}.primitive`, 'invalid_primitive', `Invalid primitive kind: ${primitiveRaw}`);
	}
	const dimensions =
		primitive === undefined
			? undefined
			: parsePrimitiveDimensions(primitive, input.dimensions, `${path}.dimensions`, issues);
	const materialIdRaw = readRequiredString(input, 'materialId', path, issues);
	const materialId =
		materialIdRaw && isMaterialId(materialIdRaw) ? (materialIdRaw as MaterialId) : undefined;
	if (materialIdRaw && !materialId) {
		addIssue(issues, `${path}.materialId`, 'unknown_material', `Unknown museum material: ${materialIdRaw}`);
	}
	const castShadow = readRequiredBoolean(input, 'castShadow', path, issues);
	const receiveShadow = readRequiredBoolean(input, 'receiveShadow', path, issues);
	const materialInstanceId = options.allowMaterialInstance
		? readOptionalString(input, 'materialInstanceId', path, issues)
		: undefined;
	const transform = parseEntityTransform(input, path, issues);
	if (
		!id ||
		!name ||
		!roomId ||
		!primitive ||
		!dimensions ||
		!materialId ||
		castShadow === undefined ||
		receiveShadow === undefined ||
		!transform ||
		(options.allowMaterialInstance && 'materialInstanceId' in input && !materialInstanceId)
	) {
		return undefined;
	}
	return {
		kind: 'primitive',
		id,
		name,
		roomId,
		primitive,
		dimensions,
		materialId,
		castShadow,
		receiveShadow,
		...transform,
		...(materialInstanceId === undefined ? {} : { materialInstanceId })
	} as ScenePrimitiveEntity;
}

function parseLightEntity(
	input: JsonRecord,
	path: string,
	issues: SceneDocumentIssue[]
): SceneLightEntity | undefined {
	assertAllowedKeys(
		input,
		[
			'kind',
			'id',
			'name',
			'roomId',
			'light',
			'color',
			'intensity',
			'range',
			'angle',
			'penumbra',
			'castShadow',
			'position',
			'rotation',
			'scale'
		],
		path,
		issues
	);
	const id = readRequiredString(input, 'id', path, issues);
	const name = readRequiredString(input, 'name', path, issues);
	const roomId = readRoomId(input, 'roomId', path, issues);
	const lightRaw = readRequiredString(input, 'light', path, issues);
	const light =
		lightRaw && (SCENE_LIGHT_KINDS as readonly string[]).includes(lightRaw)
			? (lightRaw as SceneLightKind)
			: undefined;
	if (lightRaw && !light) {
		addIssue(issues, `${path}.light`, 'invalid_light', `Invalid light kind: ${lightRaw}`);
	}
	const color = readRequiredString(input, 'color', path, issues);
	if (color && !HEX_COLOR_PATTERN.test(color)) {
		addIssue(issues, `${path}.color`, 'invalid_color', 'Expected a #rrggbb color string');
	}
	const intensity = readRequiredNumber(input, 'intensity', path, issues);
	if (intensity !== undefined && (!Number.isFinite(intensity) || intensity < 0)) {
		addIssue(issues, `${path}.intensity`, 'invalid_intensity', 'Intensity must be a finite number ≥ 0');
	}
	let range: number | undefined;
	if ('range' in input) {
		range = readRequiredNumber(input, 'range', path, issues);
		if (range !== undefined && (!Number.isFinite(range) || range <= 0)) {
			addIssue(issues, `${path}.range`, 'invalid_range', 'Range must be a finite number greater than zero');
			range = undefined;
		}
	}
	let angle: number | undefined;
	if ('angle' in input) {
		angle = readRequiredNumber(input, 'angle', path, issues);
		if (angle !== undefined && (!Number.isFinite(angle) || angle <= 0 || angle > Math.PI)) {
			addIssue(issues, `${path}.angle`, 'invalid_angle', 'Angle must be in (0, π] radians');
			angle = undefined;
		}
	}
	let penumbra: number | undefined;
	if ('penumbra' in input) {
		penumbra = readRequiredNumber(input, 'penumbra', path, issues);
		if (penumbra !== undefined && (!Number.isFinite(penumbra) || penumbra < 0 || penumbra > 1)) {
			addIssue(issues, `${path}.penumbra`, 'invalid_penumbra', 'Penumbra must be in [0, 1]');
			penumbra = undefined;
		}
	}
	if (light === 'directional') {
		if ('range' in input) addIssue(issues, `${path}.range`, 'unexpected_property', 'Directional lights do not use range');
		if ('angle' in input) addIssue(issues, `${path}.angle`, 'unexpected_property', 'Directional lights do not use angle');
		if ('penumbra' in input) {
			addIssue(issues, `${path}.penumbra`, 'unexpected_property', 'Directional lights do not use penumbra');
		}
	} else if (light === 'point') {
		if ('angle' in input) addIssue(issues, `${path}.angle`, 'unexpected_property', 'Point lights do not use angle');
		if ('penumbra' in input) {
			addIssue(issues, `${path}.penumbra`, 'unexpected_property', 'Point lights do not use penumbra');
		}
	} else if (light === 'spot') {
		if (!('angle' in input)) {
			addIssue(issues, `${path}.angle`, 'missing_property', 'Spot lights require angle');
		}
	}
	const castShadow = readRequiredBoolean(input, 'castShadow', path, issues);
	const transform = parseEntityTransform(input, path, issues);
	const colorValid = Boolean(color && HEX_COLOR_PATTERN.test(color));
	const intensityValid = intensity !== undefined && Number.isFinite(intensity) && intensity >= 0;
	const rangeOk = !('range' in input) || range !== undefined;
	const angleOk =
		light === 'spot' ? angle !== undefined : !('angle' in input) || angle !== undefined;
	const penumbraOk = !('penumbra' in input) || penumbra !== undefined;
	if (
		!id ||
		!name ||
		!roomId ||
		!light ||
		!colorValid ||
		!intensityValid ||
		castShadow === undefined ||
		!transform ||
		!rangeOk ||
		!angleOk ||
		!penumbraOk
	) {
		return undefined;
	}
	if (light === 'spot') {
		return {
			kind: 'light',
			id,
			name,
			roomId,
			light: 'spot',
			color: color!,
			intensity: intensity!,
			angle: angle!,
			castShadow,
			...transform,
			...(range === undefined ? {} : { range }),
			...(penumbra === undefined ? {} : { penumbra })
		};
	}
	if (light === 'point') {
		return {
			kind: 'light',
			id,
			name,
			roomId,
			light: 'point',
			color: color!,
			intensity: intensity!,
			castShadow,
			...transform,
			...(range === undefined ? {} : { range })
		};
	}
	return {
		kind: 'light',
		id,
		name,
		roomId,
		light: 'directional',
		color: color!,
		intensity: intensity!,
		castShadow,
		...transform
	};
}

function parseEntity(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[],
	options: { allowMaterialInstance: boolean }
): SceneEntity | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a scene entity object');
		return undefined;
	}
	const kind = readRequiredString(input, 'kind', path, issues);
	if (kind === 'model') return parseModelEntity(input, path, issues, options);
	if (kind === 'primitive') return parsePrimitiveEntity(input, path, issues, options);
	if (kind === 'light') return parseLightEntity(input, path, issues);
	if (kind !== undefined) {
		addIssue(issues, `${path}.kind`, 'invalid_entity_kind', `Invalid scene entity kind: ${kind}`);
	}
	return undefined;
}

function parseCluster(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneObjectCluster | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a cluster object');
		return undefined;
	}
	assertAllowedKeys(input, ['id', 'name', 'roomId', 'memberIds'], path, issues);
	const id = readRequiredString(input, 'id', path, issues);
	const name = readRequiredString(input, 'name', path, issues);
	const roomId = readRoomId(input, 'roomId', path, issues);
	const memberIds = readStringArray(input.memberIds, `${path}.memberIds`, issues);
	if (!id || !name || !roomId || !memberIds) return undefined;
	return { id, name, roomId, memberIds };
}

function parseNodeV1V2(
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

function parseNodeV3(
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

function parseNodeV4(
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

function parseWaypoint(
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

function parsePathAnchor(
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

function parseWaypoints(
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

function parseConnectionBase(
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

function parseLegacyConnection(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): LegacySceneConnection | undefined {
	const base = parseConnectionBase(input, path, issues, [
		'id',
		'fromNodeId',
		'toNodeId',
		'clearance',
		'positionWaypoints',
		'targetWaypoints'
	]);
	if (!base) return undefined;
	const positionWaypoints = parseWaypoints(
		base.input.positionWaypoints,
		`${path}.positionWaypoints`,
		issues
	);
	if (!positionWaypoints) return undefined;
	const { input: _input, ...connection } = base;
	return { ...connection, positionWaypoints };
}

function parsePositionPath(
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

function parseViewKeyframe(
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

function parseViewTrack(
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

function parseViewTracks(
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

function readHoldSeconds(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): number | undefined {
	if (!(key in value)) return undefined;
	const candidate = readRequiredNumber(value, key, path, issues);
	if (candidate !== undefined && (!Number.isFinite(candidate) || candidate < 0)) {
		addIssue(
			issues,
			`${path}.${key}`,
			'invalid_hold_seconds',
			'holdSeconds must be a finite non-negative number'
		);
		return undefined;
	}
	return candidate;
}

function readEasing(
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

function stringifyUnknown(value: unknown) {
	return typeof value === 'string' ? value : String(value);
}

function parseConnectionTiming(
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

function parseConnectionTimingPair(
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

function parseConnectionV2(
	input: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): SceneConnectionV2 | undefined {
	const base = parseConnectionBase(input, path, issues, [
		'id',
		'fromNodeId',
		'toNodeId',
		'clearance',
		'positionPath',
		'targetWaypoints'
	]);
	if (!base) return undefined;
	const positionPath = parsePositionPath(base.input.positionPath, `${path}.positionPath`, issues);
	if (!positionPath) return undefined;
	const { input: _input, ...connection } = base;
	return { ...connection, positionPath };
}

function parseConnectionV3(
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
		'targetWaypoints'
	]);
	if (!base) return undefined;
	const positionPath = parsePositionPath(base.input.positionPath, `${path}.positionPath`, issues);
	const viewTracks = 'viewTracks' in base.input
		? parseViewTracks(base.input.viewTracks, `${path}.viewTracks`, issues, { allowTiming: false })
		: undefined;
	if (!positionPath || ('viewTracks' in base.input && !viewTracks)) return undefined;
	const { input: _input, ...connection } = base;
	return {
		...connection,
		positionPath,
		...(viewTracks === undefined ? {} : { viewTracks })
	};
}

function parseConnectionV4(
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

function assertUnique(
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

function distance(a: Vec3, b: Vec3) {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function validateSemantics(document: ParsedMuseumSceneDocument, issues: SceneDocumentIssue[]) {
	const entities = documentEntities(document);
	const entitiesPath = 'entities' in document ? '$.entities' : '$.objects';
	assertUnique(entities, 'scene entity', entitiesPath, issues);
	assertUnique(document.navigationNodes, 'navigation node', '$.navigationNodes', issues);
	assertUnique(document.connections, 'connection', '$.connections', issues);
	assertUnique(document.clusters ?? [], 'scene cluster', '$.clusters', issues);
	if ('textures' in document) {
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

	if (document.navigationNodes.length === 0) {
		addIssue(issues, '$.navigationNodes', 'empty_navigation', 'At least one navigation node is required');
		return;
	}
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

	if (
		document.version === 3 ||
		document.version === 4 ||
		document.version === 5 ||
		document.version === 6
	) {
		validateViewKeyframePoses(
			document,
			new Map(document.navigationNodes.map((node) => [node.id, node])),
			issues
		);
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

	const visited = new Set<string>();
	const queue = [document.navigationNodes[0]!.id];
	while (queue.length) {
		const id = queue.shift()!;
		if (visited.has(id)) continue;
		visited.add(id);
		for (const neighbor of nodeById.get(id)?.connectedNodeIds ?? []) if (!visited.has(neighbor)) queue.push(neighbor);
	}
	if (visited.size !== document.navigationNodes.length) addIssue(issues, '$.connections', 'disconnected_graph', 'Navigation connections must form one connected graph');

	if (document.navigationNodes.length === 1 && document.version === 1) {
		const node = document.navigationNodes[0]!;
		if (node.nextNodeId !== undefined || node.previousNodeId !== undefined) addIssue(issues, '$.navigationNodes[0]', 'singleton_tour_links', 'A singleton graph cannot define next or previous links');
		return;
	}

	if (
		document.version === 2 ||
		document.version === 3 ||
		document.version === 4 ||
		document.version === 5 ||
		document.version === 6
	) {
		validateVersionTwoTour(document.navigationNodes, nodeById, issues);
		return;
	}

	for (const [index, node] of document.navigationNodes.entries()) {
		const path = `$.navigationNodes[${index}]`;
		if (!node.nextNodeId) addIssue(issues, `${path}.nextNodeId`, 'missing_tour_link', 'Every multi-node graph requires nextNodeId');
		if (!node.previousNodeId) addIssue(issues, `${path}.previousNodeId`, 'missing_tour_link', 'Every multi-node graph requires previousNodeId');
		for (const [key, opposite] of [['nextNodeId', 'previousNodeId'], ['previousNodeId', 'nextNodeId']] as const) {
			const linkedId = node[key];
			if (!linkedId) continue;
			if (linkedId === node.id) addIssue(issues, `${path}.${key}`, 'self_tour_link', 'A tour link cannot reference its own node');
			const linked = nodeById.get(linkedId);
			if (!linked) addIssue(issues, `${path}.${key}`, 'unknown_node', `Unknown navigation node: ${linkedId}`);
			else {
				if (!node.connectedNodeIds.includes(linkedId)) addIssue(issues, `${path}.${key}`, 'non_adjacent_tour_link', `Tour link ${linkedId} is not adjacent`);
				if (linked[opposite] !== node.id) addIssue(issues, `${path}.${key}`, 'non_reciprocal_tour_link', `${linkedId}.${opposite} must equal ${node.id}`);
			}
		}
	}
	const start = document.navigationNodes[0]!;
	const tourVisited = new Set<string>();
	let current: ParsedSceneNavigationNode | undefined = start;
	while (current && !tourVisited.has(current.id)) {
		tourVisited.add(current.id);
		current = current.nextNodeId ? nodeById.get(current.nextNodeId) : undefined;
	}
	if (tourVisited.size !== document.navigationNodes.length || current?.id !== start.id) addIssue(issues, '$.navigationNodes', 'invalid_tour_cycle', 'nextNodeId links must form one cycle containing every node');
}

function validateVersionTwoTour(
	nodes: readonly ParsedSceneNavigationNode[],
	nodeById: ReadonlyMap<string, ParsedSceneNavigationNode>,
	issues: SceneDocumentIssue[]
) {
	const linkedNodes: ParsedSceneNavigationNode[] = [];
	for (const [index, node] of nodes.entries()) {
		const path = `$.navigationNodes[${index}]`;
		const hasNext = node.nextNodeId !== undefined;
		const hasPrevious = node.previousNodeId !== undefined;
		if (hasNext !== hasPrevious) {
			addIssue(
				issues,
				path,
				'partial_tour_links',
				'A node must define both nextNodeId and previousNodeId, or neither'
			);
		}
		if (!hasNext || !hasPrevious) continue;
		linkedNodes.push(node);
		for (const [key, opposite] of [
			['nextNodeId', 'previousNodeId'],
			['previousNodeId', 'nextNodeId']
		] as const) {
			const linkedId = node[key]!;
			if (linkedId === node.id) {
				addIssue(issues, `${path}.${key}`, 'self_tour_link', 'A tour link cannot reference its own node');
			}
			const linked = nodeById.get(linkedId);
			if (!linked) {
				addIssue(issues, `${path}.${key}`, 'unknown_node', `Unknown navigation node: ${linkedId}`);
				continue;
			}
			if (linked.nextNodeId === undefined || linked.previousNodeId === undefined) {
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
	}

	if (linkedNodes.length === 0) {
		if (nodes.length > 1) {
			addIssue(
				issues,
				'$.navigationNodes',
				'missing_guided_cycle',
				'A multi-node graph must retain at least one guided tour cycle'
			);
		}
		return;
	}
	const start = linkedNodes[0]!;
	const tourVisited = new Set<string>();
	let current: ParsedSceneNavigationNode | undefined = start;
	while (current && !tourVisited.has(current.id)) {
		tourVisited.add(current.id);
		current = current.nextNodeId ? nodeById.get(current.nextNodeId) : undefined;
	}
	if (tourVisited.size !== linkedNodes.length || current?.id !== start.id) {
		addIssue(
			issues,
			'$.navigationNodes',
			'invalid_tour_cycle',
			'Guided nextNodeId links must form one cycle containing every guided node'
		);
	}
}

function validateViewKeyframePoses(
	document: Pick<MuseumSceneDocument, 'connections' | 'navigationNodes'>,
	nodeById: ReadonlyMap<string, SceneNavigationNode>,
	issues: SceneDocumentIssue[]
) {
	for (const [connectionIndex, connection] of document.connections.entries()) {
		if (!connection.viewTracks) continue;
		const fromNode = nodeById.get(connection.fromNodeId);
		const toNode = nodeById.get(connection.toNodeId);
		if (!fromNode || !toNode) continue;
		const anchors: Vec3[] = [
			roomPoint(fromNode.roomId, fromNode.position),
			...connection.positionPath.anchors.map((anchor) =>
				anchor.roomId
					? roomPoint(anchor.roomId, anchor.position)
					: ([...anchor.position] as Vec3)
			),
			roomPoint(toNode.roomId, toNode.position)
		];
		const positionPath = createCameraPositionPath([
			connection.positionPath.kind === 'rounded-polyline'
				? {
						kind: 'rounded-polyline',
						points: anchors,
						clearance: connection.clearance
					}
				: { kind: 'auto-bezier', anchors }
		]);

		for (const direction of ['forward', 'reverse'] as const) {
			for (const [keyframeIndex, keyframe] of connection.viewTracks[
				direction
			].entries()) {
				const position = positionPath.getPointAt(
					direction === 'forward' ? keyframe.progress : 1 - keyframe.progress
				);
				const target = keyframe.roomId
					? roomPoint(keyframe.roomId, keyframe.cameraTarget)
					: keyframe.cameraTarget;
				if (Math.hypot(position.x - target[0], position.y - target[1], position.z - target[2]) <= EPSILON) {
					addIssue(
						issues,
						`$.connections[${connectionIndex}].viewTracks.${direction}[${keyframeIndex}].cameraTarget`,
						'camera_target_too_close',
						`Camera eye and target must be farther than ${EPSILON}`
					);
				}
			}
		}
	}
}

function cloneWaypoint(value: SceneWaypoint): SceneWaypoint {
	return {
		...(value.roomId === undefined ? {} : { roomId: value.roomId }),
		position: [...value.position]
	};
}

function cloneViewKeyframe(
	value: SceneCameraViewKeyframe
): SceneCameraViewKeyframe {
	return {
		id: value.id,
		progress: value.progress,
		...(value.roomId === undefined ? {} : { roomId: value.roomId }),
		cameraTarget: [...value.cameraTarget],
		fov: value.fov,
		...(value.holdSeconds === undefined ? {} : { holdSeconds: value.holdSeconds }),
		...(value.easing === undefined ? {} : { easing: value.easing })
	};
}

function cloneEntity(entity: SceneEntity): SceneEntity {
	if (entity.kind === 'model') {
		return {
			kind: 'model',
			id: entity.id,
			name: entity.name,
			roomId: entity.roomId,
			assetId: entity.assetId,
			fallback: entity.fallback,
			position: [...entity.position],
			rotation: [...entity.rotation],
			...(entity.scale === undefined ? {} : { scale: entity.scale }),
			...(entity.materialInstanceId === undefined
				? {}
				: { materialInstanceId: entity.materialInstanceId })
		};
	}
	if (entity.kind === 'primitive') {
		return {
			kind: 'primitive',
			id: entity.id,
			name: entity.name,
			roomId: entity.roomId,
			primitive: entity.primitive,
			dimensions: { ...entity.dimensions },
			materialId: entity.materialId,
			castShadow: entity.castShadow,
			receiveShadow: entity.receiveShadow,
			position: [...entity.position],
			rotation: [...entity.rotation],
			...(entity.scale === undefined ? {} : { scale: entity.scale }),
			...(entity.materialInstanceId === undefined
				? {}
				: { materialInstanceId: entity.materialInstanceId })
		} as ScenePrimitiveEntity;
	}
	if (entity.light === 'spot') {
		return {
			kind: 'light',
			id: entity.id,
			name: entity.name,
			roomId: entity.roomId,
			light: 'spot',
			color: entity.color,
			intensity: entity.intensity,
			angle: entity.angle,
			castShadow: entity.castShadow,
			position: [...entity.position],
			rotation: [...entity.rotation],
			...(entity.scale === undefined ? {} : { scale: entity.scale }),
			...(entity.range === undefined ? {} : { range: entity.range }),
			...(entity.penumbra === undefined ? {} : { penumbra: entity.penumbra })
		};
	}
	if (entity.light === 'point') {
		return {
			kind: 'light',
			id: entity.id,
			name: entity.name,
			roomId: entity.roomId,
			light: 'point',
			color: entity.color,
			intensity: entity.intensity,
			castShadow: entity.castShadow,
			position: [...entity.position],
			rotation: [...entity.rotation],
			...(entity.scale === undefined ? {} : { scale: entity.scale }),
			...(entity.range === undefined ? {} : { range: entity.range })
		};
	}
	return {
		kind: 'light',
		id: entity.id,
		name: entity.name,
		roomId: entity.roomId,
		light: 'directional',
		color: entity.color,
		intensity: entity.intensity,
		castShadow: entity.castShadow,
		position: [...entity.position],
		rotation: [...entity.rotation],
		...(entity.scale === undefined ? {} : { scale: entity.scale })
	};
}

function canonicalDocument(document: MuseumSceneDocument): MuseumSceneDocument {
	return {
		version: 6,
		textures: document.textures.map((texture) => ({
			id: texture.id,
			name: texture.name,
			uri: texture.uri
		})),
		materials: document.materials.map((material) => ({
			id: material.id,
			name: material.name,
			baseMaterialId: material.baseMaterialId,
			...(material.baseTextureId === undefined
				? {}
				: { baseTextureId: material.baseTextureId }),
			...(material.roughness === undefined ? {} : { roughness: material.roughness }),
			...(material.metalness === undefined ? {} : { metalness: material.metalness })
		})),
		entities: document.entities.map(cloneEntity),
		...(document.clusters === undefined ? {} : { clusters: document.clusters.map((cluster) => ({ id: cluster.id, name: cluster.name, roomId: cluster.roomId, memberIds: [...cluster.memberIds] })) }),
		navigationNodes: document.navigationNodes.map((node) => ({ id: node.id, roomId: node.roomId, label: node.label, position: [...node.position], cameraTarget: [...node.cameraTarget], fov: node.fov, connectedNodeIds: [...node.connectedNodeIds], ...(node.nextNodeId === undefined ? {} : { nextNodeId: node.nextNodeId }), ...(node.previousNodeId === undefined ? {} : { previousNodeId: node.previousNodeId }), ...(node.lockInteraction === undefined ? {} : { lockInteraction: node.lockInteraction }), ...(node.holdSeconds === undefined ? {} : { holdSeconds: node.holdSeconds }) })),
		connections: document.connections.map((connection) => ({
			id: connection.id,
			fromNodeId: connection.fromNodeId,
			toNodeId: connection.toNodeId,
			clearance: connection.clearance,
			positionPath: {
				kind: connection.positionPath.kind,
				anchors: connection.positionPath.anchors.map((anchor) => ({
					id: anchor.id,
					...cloneWaypoint(anchor)
				}))
			},
			...(connection.viewTracks === undefined
				? {}
				: {
						viewTracks: {
							forward: connection.viewTracks.forward.map(cloneViewKeyframe),
							reverse: connection.viewTracks.reverse.map(cloneViewKeyframe)
						}
					}),
			...(connection.targetWaypoints === undefined
				? {}
				: { targetWaypoints: connection.targetWaypoints.map(cloneWaypoint) }),
			...(connection.timing === undefined
				? {}
				: {
						timing: {
							...(connection.timing.forward === undefined
								? {}
								: { forward: { ...connection.timing.forward } }),
							...(connection.timing.reverse === undefined
								? {}
								: { reverse: { ...connection.timing.reverse } })
						}
					})
		}))
	};
}

function migrateVersionOneDocument(document: LegacyMuseumSceneDocument): MuseumSceneDocumentV2 {
	return {
		version: 2,
		objects: document.objects,
		...(document.clusters === undefined ? {} : { clusters: document.clusters }),
		navigationNodes: document.navigationNodes,
		connections: document.connections.map((connection) => ({
			id: connection.id,
			fromNodeId: connection.fromNodeId,
			toNodeId: connection.toNodeId,
			clearance: connection.clearance,
			positionPath: {
				kind: 'rounded-polyline' as const,
				anchors: connection.positionWaypoints.map((waypoint, index) => ({
					id: `${connection.id}-anchor-${String(index + 1).padStart(2, '0')}`,
					...waypoint
				}))
			},
			...(connection.targetWaypoints === undefined
				? {}
				: { targetWaypoints: connection.targetWaypoints })
		}))
	};
}

function migrateVersionTwoDocument(document: MuseumSceneDocumentV2): MuseumSceneDocumentV3V4 {
	return {
		version: 3,
		objects: document.objects,
		...(document.clusters === undefined ? {} : { clusters: document.clusters }),
		navigationNodes: document.navigationNodes.map((node) => ({
			...node,
			fov: MUSEUM_CAMERA_FOV.default
		})),
		connections: document.connections
	};
}

function migrateToVersionFive(
	document: MuseumSceneDocumentWithObjects
): MuseumSceneDocumentV5 {
	return {
		version: 5,
		entities: document.objects.map((object) => modelEntityFromPlacement(object)),
		...(document.clusters === undefined ? {} : { clusters: document.clusters }),
		navigationNodes: document.navigationNodes,
		connections: document.connections
	};
}

function migrateToVersionSix(document: MuseumSceneDocumentV5): MuseumSceneDocument {
	return {
		version: 6,
		textures: [],
		materials: [],
		entities: document.entities,
		...(document.clusters === undefined ? {} : { clusters: document.clusters }),
		navigationNodes: document.navigationNodes,
		connections: document.connections
	};
}

export function validateSceneDocument(input: unknown): SceneDocumentValidationResult {
	const issues: SceneDocumentIssue[] = [];
	if (!isRecord(input)) {
		addIssue(issues, '$', 'invalid_type', 'Expected a scene document object');
		return { success: false, issues };
	}
	const version = input.version;
	if (
		version !== 1 &&
		version !== 2 &&
		version !== 3 &&
		version !== 4 &&
		version !== 5 &&
		version !== 6
	) {
		addIssue(
			issues,
			'$.version',
			'unsupported_version',
			`Unsupported museum scene document version: ${String(version)}`
		);
		return { success: false, issues };
	}
	const rootKeys =
		version === 6
			? ([
					'version',
					'textures',
					'materials',
					'entities',
					'clusters',
					'navigationNodes',
					'connections'
				] as const)
			: version === 5
			? (['version', 'entities', 'clusters', 'navigationNodes', 'connections'] as const)
			: (['version', 'objects', 'clusters', 'navigationNodes', 'connections'] as const);
	assertAllowedKeys(input, rootKeys, '$', issues);
	const parseArray = <T>(key: string, parser: (value: unknown, path: string, target: SceneDocumentIssue[]) => T | undefined) => {
		const value = input[key];
		if (!Array.isArray(value)) {
			addIssue(issues, `$.${key}`, 'invalid_type', 'Expected an array');
			return undefined;
		}
		const values = value.map((item, index) => parser(item, `$.${key}[${index}]`, issues));
		return values.every((item): item is T => item !== undefined) ? values : undefined;
	};
	const objects =
		version === 1 || version === 2 || version === 3 || version === 4
			? parseArray('objects', parsePlacement)
			: undefined;
	const textures =
		version === 6 ? parseArray('textures', parseTextureAsset) : undefined;
	const materials =
		version === 6 ? parseArray('materials', parseMaterialInstance) : undefined;
	const entities =
		version === 5 || version === 6
			? parseArray('entities', (value, path, target) =>
					parseEntity(value, path, target, { allowMaterialInstance: version === 6 })
				)
			: undefined;
	const clusters = 'clusters' in input ? parseArray('clusters', parseCluster) : undefined;
	const legacyNavigationNodes = version === 1 || version === 2
		? parseArray('navigationNodes', parseNodeV1V2)
		: undefined;
	const versionThreeNavigationNodes = version === 3
		? parseArray('navigationNodes', parseNodeV3)
		: undefined;
	const versionFourPlusNavigationNodes =
		version === 4 || version === 5 || version === 6
			? parseArray('navigationNodes', parseNodeV4)
			: undefined;
	const legacyConnections = version === 1
		? parseArray('connections', parseLegacyConnection)
		: undefined;
	const versionTwoConnections = version === 2
		? parseArray('connections', parseConnectionV2)
		: undefined;
	const versionThreeConnections = version === 3
		? parseArray('connections', parseConnectionV3)
		: undefined;
	const versionFourPlusConnections =
		version === 4 || version === 5 || version === 6
			? parseArray('connections', parseConnectionV4)
			: undefined;
	const missingEntitiesOrObjects =
		version === 5 || version === 6
			? !entities
			: version === 1 || version === 2 || version === 3 || version === 4
				? !objects
				: true;
	const missingNodes =
		version === 1 || version === 2
			? !legacyNavigationNodes
			: version === 3
				? !versionThreeNavigationNodes
				: version === 4 || version === 5 || version === 6
					? !versionFourPlusNavigationNodes
					: true;
	const missingConnections =
		version === 1
			? !legacyConnections
			: version === 2
				? !versionTwoConnections
				: version === 3
					? !versionThreeConnections
					: version === 4 || version === 5 || version === 6
						? !versionFourPlusConnections
						: true;
	if (
		missingEntitiesOrObjects ||
		missingNodes ||
		missingConnections ||
		(version === 6 && (!textures || !materials)) ||
		('clusters' in input && !clusters) ||
		issues.length
	) {
		return { success: false, issues };
	}
	const document: ParsedMuseumSceneDocument =
		version === 1
			? {
					version: 1,
					objects: objects!,
					...(clusters === undefined ? {} : { clusters }),
					navigationNodes: legacyNavigationNodes!,
					connections: legacyConnections!
				}
			: version === 2
				? {
						version: 2,
						objects: objects!,
						...(clusters === undefined ? {} : { clusters }),
						navigationNodes: legacyNavigationNodes!,
						connections: versionTwoConnections!
					}
				: version === 6
					? {
							version: 6,
							textures: textures!,
							materials: materials!,
							entities: entities!,
							...(clusters === undefined ? {} : { clusters }),
							navigationNodes: versionFourPlusNavigationNodes!,
							connections: versionFourPlusConnections!
						}
					: version === 5
						? {
								version: 5,
								entities: entities!,
								...(clusters === undefined ? {} : { clusters }),
								navigationNodes: versionFourPlusNavigationNodes!,
								connections: versionFourPlusConnections!
							}
						: {
								version: version === 4 ? 4 : 3,
								objects: objects!,
								...(clusters === undefined ? {} : { clusters }),
								navigationNodes:
									version === 4
										? versionFourPlusNavigationNodes!
										: versionThreeNavigationNodes!,
								connections:
									version === 4
										? versionFourPlusConnections!
										: versionThreeConnections!
							};
	validateSemantics(document, issues);
	if (issues.length) return { success: false, issues };
	const normalized = canonicalDocument(
		document.version === 1
			? migrateToVersionSix(
					migrateToVersionFive(
						migrateVersionTwoDocument(migrateVersionOneDocument(document))
					)
				)
			: document.version === 2
				? migrateToVersionSix(
						migrateToVersionFive(migrateVersionTwoDocument(document))
					)
				: document.version === 6
					? document
					: document.version === 5
						? migrateToVersionSix(document)
						: migrateToVersionSix(migrateToVersionFive(document))
	);
	return { success: true, document: normalized, canonicalJson: JSON.stringify(normalized, null, 2) + '\n' };
}

function jsonErrorMessage(error: unknown, json: string) {
	const message = error instanceof Error ? error.message : 'Invalid JSON';
	const match = /position (\d+)/.exec(message);
	if (!match) return 'Invalid JSON';
	const offset = Number(match[1]);
	const before = json.slice(0, offset);
	const line = before.split('\n').length;
	const column = offset - before.lastIndexOf('\n');
	return `Invalid JSON near line ${line}, column ${column}.`;
}

export function parseSceneDocumentJson(json: string): SceneDocumentValidationResult {
	try {
		return validateSceneDocument(JSON.parse(json));
	} catch (error) {
		return { success: false, issues: [{ path: '$', code: 'invalid_json', message: jsonErrorMessage(error, json) }] };
	}
}

export function serializeSceneDocument(document: unknown): string {
	const result = validateSceneDocument(document);
	if (!result.success) throw new SceneDocumentValidationError(result.issues[0]!);
	return result.canonicalJson;
}
