import { legacyBezierToAutoBezier } from './layout-auto-bezier';
import type {
	DraftPath,
	DraftSegment,
	LayoutDocument,
	LayoutFloor,
	LayoutInteriorAnchor,
	LayoutObject,
	LayoutOpening,
	LayoutRoom,
	LayoutVec2
} from './layout-types';

const FORMAT_VERSION = 2 as const;
const LEGACY_FORMAT_VERSION = 1 as const;
const UNITS = 'meters' as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

type JsonRecord = Record<string, unknown>;

type ParsedValue<T> = T | undefined;

const ROOT_KEYS = ['formatVersion', 'units', 'floors', 'objects'] as const;
const FLOOR_KEYS = ['id', 'name', 'elevation', 'height', 'rooms'] as const;
const ROOM_KEYS = [
	'id',
	'name',
	'boundary',
	'wallThickness',
	'floorThickness',
	'ceilingThickness',
	'openings'
] as const;
const PATH_KEYS = ['closed', 'segments'] as const;
const LINE_SEGMENT_KEYS = ['id', 'kind', 'start', 'end'] as const;
const AUTO_BEZIER_SEGMENT_KEYS = ['id', 'kind', 'start', 'end', 'interiorAnchors'] as const;
const LEGACY_BEZIER_SEGMENT_KEYS = [
	'id',
	'kind',
	'start',
	'handleOut',
	'handleIn',
	'end'
] as const;
const INTERIOR_ANCHOR_KEYS = ['id', 'point'] as const;
const OPENING_KEYS = [
	'id',
	'segmentId',
	'kind',
	'offset',
	'width',
	'height',
	'sillHeight',
	'profile',
	'connectsRoomIds'
] as const;
const OBJECT_KEYS = [
	'id',
	'kind',
	'position',
	'rotation',
	'dimensions',
	'profile',
	'roomId'
] as const;

export type LayoutDocumentIssue = {
	path: string;
	code: string;
	message: string;
};

export type LayoutDocumentValidationResult =
	| {
			success: true;
			document: LayoutDocument;
			canonicalJson: string;
	  }
	| {
			success: false;
			issues: LayoutDocumentIssue[];
	  };

export class LayoutDocumentValidationError extends Error {
	readonly issue: LayoutDocumentIssue;

	constructor(issue: LayoutDocumentIssue) {
		super(`${issue.path} (${issue.code}): ${issue.message}`);
		this.name = 'LayoutDocumentValidationError';
		this.issue = issue;
	}
}

export function createEmptyLayoutDocument(): LayoutDocument {
	return {
		formatVersion: FORMAT_VERSION,
		units: UNITS,
		floors: [],
		objects: []
	};
}

export function validateLayoutDocument(input: unknown): LayoutDocumentValidationResult {
	const issues: LayoutDocumentIssue[] = [];
	const document = parseDocument(input, '$', issues);
	if (!document || issues.length > 0) {
		return { success: false, issues };
	}

	return {
		success: true,
		document,
		canonicalJson: JSON.stringify(document, null, 2) + '\n'
	};
}

export function parseLayoutDocumentJson(json: string): LayoutDocumentValidationResult {
	try {
		return validateLayoutDocument(JSON.parse(json) as unknown);
	} catch (error) {
		return {
			success: false,
			issues: [
				{
					path: '$',
					code: 'invalid_json',
					message: invalidJsonMessage(error, json)
				}
			]
		};
	}
}

export function serializeLayoutDocument(document: unknown): string {
	const result = validateLayoutDocument(document);
	if (!result.success) {
		throw new LayoutDocumentValidationError(result.issues[0]!);
	}
	return result.canonicalJson;
}

function parseDocument(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<LayoutDocument> {
	const record = readRecord(input, path, issues);
	if (!record) return undefined;
	assertAllowedKeys(record, ROOT_KEYS, path, issues);

	const formatVersion = readNumber(record.formatVersion, `${path}.formatVersion`, issues);
	if (formatVersion !== FORMAT_VERSION && formatVersion !== LEGACY_FORMAT_VERSION) {
		addIssue(
			issues,
			`${path}.formatVersion`,
			'unsupported_version',
			`Expected layout document formatVersion ${LEGACY_FORMAT_VERSION} or ${FORMAT_VERSION}`
		);
	}

	const units = readString(record.units, `${path}.units`, issues);
	if (units !== UNITS) {
		addIssue(issues, `${path}.units`, 'unsupported_units', `Expected units '${UNITS}'`);
	}

	const floors = parseArray(record.floors, `${path}.floors`, issues, parseFloor);
	const objects = parseArray(record.objects, `${path}.objects`, issues, parseObject);
	if (!floors || !objects) return undefined;

	validateUniqueIds(floors, `${path}.floors`, issues, (floor) => floor.id);
	const rooms = floors.flatMap((floor) => floor.rooms);
	validateUniqueIds(rooms, `${path}.floors[].rooms`, issues, (room) => room.id);
	validateUniqueIds(objects, `${path}.objects`, issues, (object) => object.id);

	const roomIds = new Set(rooms.map((room) => room.id));
	validatePortalRelations(floors, roomIds, issues);
	for (const [index, object] of objects.entries()) {
		if (object.roomId && !roomIds.has(object.roomId)) {
			addIssue(
				issues,
				`${path}.objects[${index}].roomId`,
				'missing_reference',
				`Unknown roomId '${object.roomId}'`
			);
		}
	}

	if (issues.length > 0) return undefined;
	return {
		formatVersion: FORMAT_VERSION,
		units: UNITS,
		floors,
		objects
	};
}

function parseFloor(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<LayoutFloor> {
	const record = readRecord(input, path, issues);
	if (!record) return undefined;
	assertAllowedKeys(record, FLOOR_KEYS, path, issues);

	const id = readId(record.id, `${path}.id`, issues);
	const name = readNonEmptyString(record.name, `${path}.name`, issues);
	const elevation = readNumber(record.elevation, `${path}.elevation`, issues);
	const height = readPositiveNumber(record.height, `${path}.height`, issues);
	const rooms = parseArray(record.rooms, `${path}.rooms`, issues, parseRoom);
	if (!id || !name || elevation === undefined || height === undefined || !rooms) {
		return undefined;
	}

	validateUniqueIds(rooms, `${path}.rooms`, issues, (room) => room.id);
	return { id, name, elevation, height, rooms };
}

function parseRoom(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<LayoutRoom> {
	const record = readRecord(input, path, issues);
	if (!record) return undefined;
	assertAllowedKeys(record, ROOM_KEYS, path, issues);

	const id = readId(record.id, `${path}.id`, issues);
	const name = readNonEmptyString(record.name, `${path}.name`, issues);
	const boundary = parsePath(record.boundary, `${path}.boundary`, issues);
	const wallThickness = readPositiveNumber(
		record.wallThickness,
		`${path}.wallThickness`,
		issues
	);
	const floorThickness = readPositiveNumber(
		record.floorThickness,
		`${path}.floorThickness`,
		issues
	);
	const ceilingThickness = readPositiveNumber(
		record.ceilingThickness,
		`${path}.ceilingThickness`,
		issues
	);
	const openings = parseArray(record.openings, `${path}.openings`, issues, parseOpening);
	if (
		!id ||
		!name ||
		!boundary ||
		wallThickness === undefined ||
		floorThickness === undefined ||
		ceilingThickness === undefined ||
		!openings
	) {
		return undefined;
	}

	validateUniqueIds(openings, `${path}.openings`, issues, (opening) => opening.id);
	const segmentIds = new Set(boundary.segments.map((segment) => segment.id));
	for (const [index, opening] of openings.entries()) {
		if (!segmentIds.has(opening.segmentId)) {
			addIssue(
				issues,
				`${path}.openings[${index}].segmentId`,
				'missing_reference',
				`Unknown segmentId '${opening.segmentId}'`
			);
		}
	}

	return {
		id,
		name,
		boundary,
		wallThickness,
		floorThickness,
		ceilingThickness,
		openings
	};
}

function parsePath(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<DraftPath> {
	const record = readRecord(input, path, issues);
	if (!record) return undefined;
	assertAllowedKeys(record, PATH_KEYS, path, issues);

	if (record.closed !== true) {
		addIssue(issues, `${path}.closed`, 'invalid_value', 'Committed paths must be closed');
	}
	const segments = parseArray(record.segments, `${path}.segments`, issues, parseSegment);
	if (!segments) return undefined;
	if (segments.length === 0) {
		addIssue(issues, `${path}.segments`, 'empty_array', 'Expected at least one segment');
	}
	validateUniqueIds(segments, `${path}.segments`, issues, (segment) => segment.id);
	return { closed: true, segments };
}

function parseSegment(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<DraftSegment> {
	const record = readRecord(input, path, issues);
	if (!record) return undefined;
	const kind = readString(record.kind, `${path}.kind`, issues);

	if (kind === 'line') {
		assertAllowedKeys(record, LINE_SEGMENT_KEYS, path, issues);
		const id = readId(record.id, `${path}.id`, issues);
		const start = readVec2(record.start, `${path}.start`, issues);
		const end = readVec2(record.end, `${path}.end`, issues);
		if (!id || !start || !end) return undefined;
		return { id, kind, start, end };
	}

	if (kind === 'auto-bezier') {
		assertAllowedKeys(record, AUTO_BEZIER_SEGMENT_KEYS, path, issues);
		const id = readId(record.id, `${path}.id`, issues);
		const start = readVec2(record.start, `${path}.start`, issues);
		const end = readVec2(record.end, `${path}.end`, issues);
		const interiorAnchors = parseInteriorAnchors(record.interiorAnchors, `${path}.interiorAnchors`, issues);
		if (!id || !start || !end || !interiorAnchors) return undefined;
		return { id, kind, start, end, interiorAnchors };
	}

	if (kind === 'bezier') {
		assertAllowedKeys(record, LEGACY_BEZIER_SEGMENT_KEYS, path, issues);
		const id = readId(record.id, `${path}.id`, issues);
		const start = readVec2(record.start, `${path}.start`, issues);
		const handleOut = readVec2(record.handleOut, `${path}.handleOut`, issues);
		const handleIn = readVec2(record.handleIn, `${path}.handleIn`, issues);
		const end = readVec2(record.end, `${path}.end`, issues);
		if (!id || !start || !handleOut || !handleIn || !end) return undefined;
		return legacyBezierToAutoBezier({ id, kind: 'bezier', start, handleOut, handleIn, end });
	}

	if (kind !== undefined) {
		addIssue(issues, `${path}.kind`, 'unsupported_value', `Unsupported segment kind '${kind}'`);
	}
	return undefined;
}

function parseInteriorAnchors(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<LayoutInteriorAnchor[]> {
	const anchors = parseArray(input, path, issues, parseInteriorAnchor);
	if (!anchors) return undefined;
	validateUniqueIds(anchors, path, issues, (anchor) => anchor.id);
	for (const [index, anchor] of anchors.entries()) {
		if (!anchor.point.every((value) => Number.isFinite(value))) {
			addIssue(issues, `${path}[${index}].point`, 'invalid_value', 'Interior anchor point must be finite');
		}
	}
	return anchors;
}

function parseInteriorAnchor(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<LayoutInteriorAnchor> {
	const record = readRecord(input, path, issues);
	if (!record) return undefined;
	assertAllowedKeys(record, INTERIOR_ANCHOR_KEYS, path, issues);
	const id = readId(record.id, `${path}.id`, issues);
	const point = readVec2(record.point, `${path}.point`, issues);
	if (!id || !point) return undefined;
	return { id, point };
}

function parseOpening(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<LayoutOpening> {
	const record = readRecord(input, path, issues);
	if (!record) return undefined;
	assertAllowedKeys(record, OPENING_KEYS, path, issues);

	const id = readId(record.id, `${path}.id`, issues);
	const segmentId = readId(record.segmentId, `${path}.segmentId`, issues);
	const kind = readEnum(record.kind, `${path}.kind`, ['door', 'window'], issues);
	const offset = readNonNegativeNumber(record.offset, `${path}.offset`, issues);
	const width = readPositiveNumber(record.width, `${path}.width`, issues);
	const height = readPositiveNumber(record.height, `${path}.height`, issues);
	const sillHeight = readNonNegativeNumber(record.sillHeight, `${path}.sillHeight`, issues);
	const profile = readEnum(
		record.profile,
		`${path}.profile`,
		['rectangular', 'rounded', 'pointed'],
		issues
	);
	const connectsRoomIds = parsePortalRoomIds(record.connectsRoomIds, `${path}.connectsRoomIds`, issues);
	if (
		!id ||
		!segmentId ||
		!kind ||
		offset === undefined ||
		width === undefined ||
		height === undefined ||
		sillHeight === undefined ||
		!profile
	) {
		return undefined;
	}
	return {
		id,
		segmentId,
		kind,
		offset,
		width,
		height,
		sillHeight,
		profile,
		...(connectsRoomIds ? { connectsRoomIds } : {})
	};
}

function parsePortalRoomIds(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): [string, string] | undefined {
	if (input === undefined) return undefined;
	if (!Array.isArray(input) || input.length !== 2) {
		addIssue(issues, path, 'invalid_value', 'Expected exactly two room IDs');
		return undefined;
	}
	const first = readId(input[0], `${path}[0]`, issues);
	const second = readId(input[1], `${path}[1]`, issues);
	if (!first || !second) return undefined;
	if (first === second) addIssue(issues, path, 'invalid_value', 'Portal room IDs must be distinct');
	return first.localeCompare(second) <= 0 ? [first, second] : [second, first];
}

function validatePortalRelations(
	floors: readonly LayoutFloor[],
	roomIds: ReadonlySet<string>,
	issues: LayoutDocumentIssue[]
): void {
	for (const [floorIndex, floor] of floors.entries()) {
		for (const [roomIndex, room] of floor.rooms.entries()) {
			for (const [openingIndex, opening] of room.openings.entries()) {
				const path = `$.floors[${floorIndex}].rooms[${roomIndex}].openings[${openingIndex}]`;
				const relation = opening.connectsRoomIds;
				if (!relation) continue;
				if (opening.kind !== 'door') {
					addIssue(issues, `${path}.connectsRoomIds`, 'invalid_value', 'Only door openings may define portal relations');
				}
				if (!roomIds.has(relation[0])) addIssue(issues, `${path}.connectsRoomIds[0]`, 'missing_reference', `Unknown roomId '${relation[0]}'`);
				if (!roomIds.has(relation[1])) addIssue(issues, `${path}.connectsRoomIds[1]`, 'missing_reference', `Unknown roomId '${relation[1]}'`);
				if (relation[0] !== room.id && relation[1] !== room.id) {
					addIssue(issues, `${path}.connectsRoomIds`, 'invalid_value', `Opening owner room '${room.id}' must be one portal relation member`);
				}
			}
		}
	}
}

function parseObject(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): ParsedValue<LayoutObject> {
	const record = readRecord(input, path, issues);
	if (!record) return undefined;
	assertAllowedKeys(record, OBJECT_KEYS, path, issues);

	const id = readId(record.id, `${path}.id`, issues);
	const kind = readEnum(
		record.kind,
		`${path}.kind`,
		['box', 'plane', 'cylinder', 'sphere', 'profile'],
		issues
	);
	const position = readVec3(record.position, `${path}.position`, issues);
	const rotation = readVec3(record.rotation, `${path}.rotation`, issues);
	const dimensions = readPositiveVec3(record.dimensions, `${path}.dimensions`, issues);
	const roomId = record.roomId === undefined ? undefined : readId(record.roomId, `${path}.roomId`, issues);
	const profile = record.profile === undefined ? undefined : parsePath(record.profile, `${path}.profile`, issues);
	if (kind === 'profile' && !profile) {
		addIssue(issues, `${path}.profile`, 'missing_field', "Profile objects require a closed 'profile'");
	}
	if (kind !== 'profile' && record.profile !== undefined) {
		addIssue(issues, `${path}.profile`, 'unexpected_field', "Only profile objects may define 'profile'");
	}
	if (!id || !kind || !position || !rotation || !dimensions) return undefined;
	return { id, kind, position, rotation, dimensions, ...(profile ? { profile } : {}), ...(roomId ? { roomId } : {}) };
}

function parseArray<T>(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[],
	parser: (value: unknown, path: string, issues: LayoutDocumentIssue[]) => ParsedValue<T>
): T[] | undefined {
	if (!Array.isArray(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected an array');
		return undefined;
	}
	const values = input.map((value, index) => parser(value, `${path}[${index}]`, issues));
	return values.every((value): value is T => value !== undefined) ? values : undefined;
}

function readRecord(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): JsonRecord | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected an object');
		return undefined;
	}
	return input;
}

function isRecord(input: unknown): input is JsonRecord {
	return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function assertAllowedKeys(
	record: JsonRecord,
	allowedKeys: readonly string[],
	path: string,
	issues: LayoutDocumentIssue[]
): void {
	const allowed = new Set(allowedKeys);
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) {
			addIssue(issues, `${path}.${key}`, 'unknown_key', `Unknown key '${key}'`);
		}
	}
}

function readString(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): string | undefined {
	if (typeof input !== 'string') {
		addIssue(issues, path, 'invalid_type', 'Expected a string');
		return undefined;
	}
	return input;
}

function readNonEmptyString(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): string | undefined {
	const value = readString(input, path, issues);
	if (value !== undefined && value.trim().length === 0) {
		addIssue(issues, path, 'invalid_value', 'Expected a non-empty string');
		return undefined;
	}
	return value;
}

function readId(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): string | undefined {
	const value = readString(input, path, issues);
	if (value !== undefined && !ID_PATTERN.test(value)) {
		addIssue(issues, path, 'invalid_id', 'Expected an ID matching /^[A-Za-z0-9][A-Za-z0-9._:-]*$/');
		return undefined;
	}
	return value;
}

function readNumber(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): number | undefined {
	if (typeof input !== 'number' || !Number.isFinite(input)) {
		addIssue(issues, path, 'invalid_number', 'Expected a finite number');
		return undefined;
	}
	return input;
}

function readPositiveNumber(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): number | undefined {
	const value = readNumber(input, path, issues);
	if (value !== undefined && value <= 0) {
		addIssue(issues, path, 'invalid_value', 'Expected a number greater than zero');
		return undefined;
	}
	return value;
}

function readNonNegativeNumber(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): number | undefined {
	const value = readNumber(input, path, issues);
	if (value !== undefined && value < 0) {
		addIssue(issues, path, 'invalid_value', 'Expected a number greater than or equal to zero');
		return undefined;
	}
	return value;
}

function readVec2(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): LayoutVec2 | undefined {
	if (!Array.isArray(input) || input.length !== 2) {
		addIssue(issues, path, 'invalid_type', 'Expected a 2-number vector');
		return undefined;
	}
	const x = readNumber(input[0], `${path}[0]`, issues);
	const y = readNumber(input[1], `${path}[1]`, issues);
	return x === undefined || y === undefined ? undefined : [x, y];
}

function readVec3(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): [number, number, number] | undefined {
	if (!Array.isArray(input) || input.length !== 3) {
		addIssue(issues, path, 'invalid_type', 'Expected a 3-number vector');
		return undefined;
	}
	const x = readNumber(input[0], `${path}[0]`, issues);
	const y = readNumber(input[1], `${path}[1]`, issues);
	const z = readNumber(input[2], `${path}[2]`, issues);
	return x === undefined || y === undefined || z === undefined ? undefined : [x, y, z];
}

function readPositiveVec3(
	input: unknown,
	path: string,
	issues: LayoutDocumentIssue[]
): [number, number, number] | undefined {
	const vector = readVec3(input, path, issues);
	if (!vector) return undefined;
	if (vector.some((value) => value <= 0)) {
		addIssue(issues, path, 'invalid_value', 'Expected every dimension to be greater than zero');
		return undefined;
	}
	return vector;
}

function readEnum<T extends string>(
	input: unknown,
	path: string,
	values: readonly T[],
	issues: LayoutDocumentIssue[]
): T | undefined {
	const value = readString(input, path, issues);
	if (value === undefined) return undefined;
	if (!values.includes(value as T)) {
		addIssue(issues, path, 'unsupported_value', `Expected one of: ${values.join(', ')}`);
		return undefined;
	}
	return value as T;
}

function validateUniqueIds<T>(
	values: T[],
	path: string,
	issues: LayoutDocumentIssue[],
	getId: (value: T) => string
): void {
	const seen = new Set<string>();
	for (const [index, value] of values.entries()) {
		const id = getId(value);
		if (seen.has(id)) {
			addIssue(issues, `${path}[${index}].id`, 'duplicate_id', `Duplicate ID '${id}'`);
		}
		seen.add(id);
	}
}

function addIssue(
	issues: LayoutDocumentIssue[],
	path: string,
	code: string,
	message: string
): void {
	issues.push({ path, code, message });
}

function invalidJsonMessage(error: unknown, json: string): string {
	const message = error instanceof Error ? error.message : 'Invalid JSON';
	const match = /position (\d+)/.exec(message);
	if (!match) return 'Invalid JSON';
	const offset = Number(match[1]);
	const before = json.slice(0, offset);
	const line = before.split('\n').length;
	const column = offset - before.lastIndexOf('\n');
	return `Invalid JSON near line ${line}, column ${column}.`;
}
