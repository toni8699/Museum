import {
	validateLayoutDocument,
	type LayoutDocumentValidationResult
} from '$lib/editor/layout/layout-codec';
import {
	validateSceneDocument,
	type SceneDocumentValidationResult
} from '$lib/content/scene-codec';
import type {
	MuseumProject,
	MuseumProjectIssue,
	MuseumProjectValidationResult
} from './project-types';

const FORMAT_VERSION = 1 as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ROOT_KEYS = ['formatVersion', 'id', 'name', 'layout', 'scene'] as const;

type JsonRecord = Record<string, unknown>;

export type MuseumProjectInput = {
	id: string;
	name: string;
	layout: unknown;
	scene: unknown;
};

export class MuseumProjectValidationError extends Error {
	readonly issue: MuseumProjectIssue;

	constructor(issue: MuseumProjectIssue) {
		super(`${issue.path} (${issue.code}): ${issue.message}`);
		this.name = 'MuseumProjectValidationError';
		this.issue = issue;
	}
}

export function createMuseumProject(input: MuseumProjectInput): MuseumProject {
	const result = validateMuseumProject({
		formatVersion: FORMAT_VERSION,
		id: input.id,
		name: input.name,
		layout: input.layout,
		scene: input.scene
	});
	if (!result.success) {
		throw new MuseumProjectValidationError(result.issues[0]!);
	}
	return result.project;
}

export function validateMuseumProject(input: unknown): MuseumProjectValidationResult {
	const issues: MuseumProjectIssue[] = [];
	const record = readRecord(input, '$', issues);
	if (!record) return { success: false, issues };

	assertAllowedKeys(record, ROOT_KEYS, '$', issues);

	const formatVersion = readFiniteNumber(record.formatVersion, '$.formatVersion', issues);
	if (formatVersion !== FORMAT_VERSION) {
		addIssue(
			issues,
			'$.formatVersion',
			'unsupported_version',
			`Expected museum project formatVersion ${FORMAT_VERSION}`
		);
	}

	const id = readId(record.id, '$.id', issues);
	const name = readNonEmptyString(record.name, '$.name', issues);
	const layoutResult = validateLayoutDocument(record.layout);
	const sceneResult = validateSceneDocument(record.scene);
	issues.push(...prefixIssues('$.layout', layoutResult));
	issues.push(...prefixIssues('$.scene', sceneResult));

	if (!id || !name || !layoutResult.success || !sceneResult.success || issues.length > 0) {
		return { success: false, issues };
	}

	const project: MuseumProject = {
		formatVersion: FORMAT_VERSION,
		id,
		name,
		layout: layoutResult.document,
		scene: sceneResult.document
	};

	return {
		success: true,
		project,
		canonicalJson: canonicalJson(project)
	};
}

export function parseMuseumProjectJson(json: string): MuseumProjectValidationResult {
	try {
		return validateMuseumProject(JSON.parse(json) as unknown);
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

export function serializeMuseumProject(project: unknown): string {
	const result = validateMuseumProject(project);
	if (!result.success) {
		throw new MuseumProjectValidationError(result.issues[0]!);
	}
	return result.canonicalJson;
}

function canonicalJson(project: MuseumProject): string {
	return JSON.stringify(
		{
			formatVersion: project.formatVersion,
			id: project.id,
			name: project.name,
			layout: project.layout,
			scene: project.scene
		},
		null,
		2
	) + '\n';
}

function prefixIssues(
	prefix: '$.layout' | '$.scene',
	result: LayoutDocumentValidationResult | SceneDocumentValidationResult
): MuseumProjectIssue[] {
	if (result.success) return [];
	return result.issues.map((issue) => ({
		...issue,
		path: issue.path === '$' ? prefix : `${prefix}${issue.path.slice(1)}`
	}));
}

function readRecord(
	input: unknown,
	path: string,
	issues: MuseumProjectIssue[]
): JsonRecord | undefined {
	if (!isRecord(input)) {
		addIssue(issues, path, 'invalid_type', 'Expected a museum project object');
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
	issues: MuseumProjectIssue[]
): void {
	const allowed = new Set(allowedKeys);
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) {
			addIssue(issues, `${path}.${key}`, 'unknown_key', `Unknown key '${key}'`);
		}
	}
}

function readFiniteNumber(
	input: unknown,
	path: string,
	issues: MuseumProjectIssue[]
): number | undefined {
	if (typeof input !== 'number' || !Number.isFinite(input)) {
		addIssue(issues, path, 'invalid_number', 'Expected a finite number');
		return undefined;
	}
	return input;
}

function readString(
	input: unknown,
	path: string,
	issues: MuseumProjectIssue[]
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
	issues: MuseumProjectIssue[]
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
	issues: MuseumProjectIssue[]
): string | undefined {
	const value = readString(input, path, issues);
	if (value !== undefined && !ID_PATTERN.test(value)) {
		addIssue(issues, path, 'invalid_id', 'Expected an ID matching /^[A-Za-z0-9][A-Za-z0-9._:-]*$/');
		return undefined;
	}
	return value;
}

function addIssue(
	issues: MuseumProjectIssue[],
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
