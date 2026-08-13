import {
	validateLayoutDocument,
	type LayoutValidationResult
} from '$lib/layout/layout-codec';
import {
	validateSceneDocument,
	type SceneDocumentValidationResult
} from '$lib/content/scene-codec';
import { createLayoutRoomRegistry, validateProjectSceneRooms } from './project-layout-semantics';
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
	const result = validateMuseumProject({ formatVersion: FORMAT_VERSION, ...input });
	if (!result.success) throw new MuseumProjectValidationError(result.issues[0]!);
	return result.project;
}

export function validateMuseumProject(input: unknown): MuseumProjectValidationResult {
	const issues: MuseumProjectIssue[] = [];
	if (!record(input)) return { success: false, issues: [issue('$', 'invalid_type', 'Expected a museum project object')] };
	for (const key of Object.keys(input)) {
		if (!ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number])) {
			issues.push(issue(`$.${key}`, 'unknown_key', `Unknown key '${key}'`));
		}
	}
	if (input.formatVersion !== FORMAT_VERSION) {
		issues.push(issue('$.formatVersion', 'unsupported_version', `Expected museum project formatVersion ${FORMAT_VERSION}`));
	}
	const id = readId(input.id, '$.id', issues);
	const name = readName(input.name, '$.name', issues);
	const layoutResult = validateLayoutDocument(input.layout);
	const sceneResult = validateSceneDocument(input.scene);
	issues.push(...prefixIssues('$.layout', layoutResult));
	issues.push(...prefixIssues('$.scene', sceneResult));
	if (layoutResult.success && sceneResult.success) {
		issues.push(...validateProjectSceneRooms(sceneResult.document, createLayoutRoomRegistry(layoutResult.document)));
	}
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
	return { success: true, project, canonicalJson: JSON.stringify(project, null, 2) + '\n' };
}

export function parseMuseumProjectJson(json: string): MuseumProjectValidationResult {
	try {
		return validateMuseumProject(JSON.parse(json) as unknown);
	} catch (error) {
		return { success: false, issues: [issue('$', 'invalid_json', invalidJsonMessage(error, json))] };
	}
}

export function serializeMuseumProject(project: unknown): string {
	const result = validateMuseumProject(project);
	if (!result.success) throw new MuseumProjectValidationError(result.issues[0]!);
	return result.canonicalJson;
}

function prefixIssues(
	prefix: '$.layout' | '$.scene',
	result: LayoutValidationResult | SceneDocumentValidationResult
): MuseumProjectIssue[] {
	if (result.success) return [];
	return result.issues.map((item) => ({
		...item,
		path: item.path === '$' ? prefix : `${prefix}${item.path.slice(1)}`
	}));
}

function record(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readId(value: unknown, path: string, issues: MuseumProjectIssue[]): string | undefined {
	if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
		issues.push(issue(path, 'invalid_id', 'Expected an ID matching /^[A-Za-z0-9][A-Za-z0-9._:-]*$/'));
		return undefined;
	}
	return value;
}

function readName(value: unknown, path: string, issues: MuseumProjectIssue[]): string | undefined {
	if (typeof value !== 'string') {
		issues.push(issue(path, 'invalid_type', 'Expected a string'));
		return undefined;
	}
	if (value.trim().length === 0) {
		issues.push(issue(path, 'invalid_value', 'Expected a non-empty string'));
		return undefined;
	}
	return value;
}

function issue(path: string, code: string, message: string): MuseumProjectIssue {
	return { path, code, message };
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
