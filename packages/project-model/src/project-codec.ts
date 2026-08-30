import {
	createEmptyLayoutDocument,
	validateLayoutDocument,
	type LayoutValidationResult
} from '@portfolio/layout-core';
import { createEmptySceneDocument } from './scene';
import {
	validateSceneDocument,
	type SceneDocumentValidationResult,
	type SceneValidationOptions
} from './scene-codec';
import { createLayoutRoomRegistry, validateProjectSceneRooms } from './project-layout-semantics';
import type {
	Project,
	ProjectDocument,
	ProjectIssue,
	ProjectValidationResult
} from './project-types';

export type ProjectValidationOptions = {
	scene?: SceneValidationOptions;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ROOT_KEYS = ['id', 'name', 'layout', 'scene'] as const;
type JsonRecord = Record<string, unknown>;

export type ProjectInput = {
	id: string;
	name: string;
	layout: unknown;
	scene: unknown;
};

export class ProjectValidationError extends Error {
	readonly issue: ProjectIssue;
	constructor(issue: ProjectIssue) {
		super(`${issue.path} (${issue.code}): ${issue.message}`);
		this.name = 'ProjectValidationError';
		this.issue = issue;
	}
}

export function createProject(input: ProjectInput, options: ProjectValidationOptions = {}): Project {
	const result = validateProject(input, options);
	if (!result.success) throw new ProjectValidationError(result.issues[0]!);
	return result.project;
}

export type EmptyProjectInput = {
	id: string;
	name: string;
};

/**
 * Authoring-empty project: one valid empty layout + one valid empty scene.
 * This is the editor's boot state. There is no New Project command — importing
 * a package is the only way to load prior work, and export is the only save.
 */
export function createEmptyProject(input: EmptyProjectInput): Project {
	return {
		id: input.id,
		name: input.name,
		layout: createEmptyLayoutDocument(),
		scene: createEmptySceneDocument()
	};
}

export function validateProject(
	input: unknown,
	options: ProjectValidationOptions = {}
): ProjectValidationResult {
	const issues: ProjectIssue[] = [];
	if (!record(input)) return { success: false, issues: [issue('$', 'invalid_type', 'Expected a project object')] };
	for (const key of Object.keys(input)) {
		if (!ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number])) {
			issues.push(issue(`$.${key}`, 'unknown_key', `Unknown key '${key}'`));
		}
	}
	const id = readId(input.id, '$.id', issues);
	const name = readName(input.name, '$.name', issues);
	const layoutResult = validateLayoutDocument(input.layout);
	const sceneResult = validateSceneDocument(input.scene, options.scene);
	issues.push(...prefixIssues('$.layout', layoutResult));
	issues.push(...prefixIssues('$.scene', sceneResult));
	if (layoutResult.success && sceneResult.success) {
		issues.push(...validateProjectSceneRooms(sceneResult.document, createLayoutRoomRegistry(layoutResult.document)));
	}
	if (!id || !name || !layoutResult.success || !sceneResult.success || issues.length > 0) {
		return { success: false, issues };
	}
	const project: ProjectDocument = {
		id,
		name,
		layout: layoutResult.document,
		scene: sceneResult.document
	};
	return { success: true, project, canonicalJson: JSON.stringify(project, null, 2) + '\n' };
}

export function parseProjectJson(
	json: string,
	options: ProjectValidationOptions = {}
): ProjectValidationResult {
	try {
		return validateProject(JSON.parse(json) as unknown, options);
	} catch (error) {
		return { success: false, issues: [issue('$', 'invalid_json', invalidJsonMessage(error, json))] };
	}
}

export function serializeProject(
	project: unknown,
	options: ProjectValidationOptions = {}
): string {
	const result = validateProject(project, options);
	if (!result.success) throw new ProjectValidationError(result.issues[0]!);
	return result.canonicalJson;
}

function prefixIssues(
	prefix: '$.layout' | '$.scene',
	result: LayoutValidationResult | SceneDocumentValidationResult
): ProjectIssue[] {
	if (result.success) return [];
	return result.issues.map((item) => ({
		...item,
		path: item.path === '$' ? prefix : `${prefix}${item.path.slice(1)}`
	}));
}

function record(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readId(value: unknown, path: string, issues: ProjectIssue[]): string | undefined {
	if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
		issues.push(issue(path, 'invalid_id', 'Expected an ID matching /^[A-Za-z0-9][A-Za-z0-9._:-]*$/'));
		return undefined;
	}
	return value;
}

function readName(value: unknown, path: string, issues: ProjectIssue[]): string | undefined {
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

function issue(path: string, code: string, message: string): ProjectIssue {
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
