/**
 * `scene-codec/index.ts` — public barrel for the scene document codec.
 *
 * The document has one canonical shape (textures, materials, entities,
 * clusters, navigation nodes, connections). No version field, no migrations.
 *
 * Internal helpers live in:
 *
 *   - `./readers`       — leaf typed JSON readers + `JsonRecord`
 *   - `./parse-entities`— entities, materials, textures
 *   - `./parse-document`— nodes, waypoints, connections, timing, semantics
 *   - `./canonical`     — clone helpers + deterministic serializer
 *
 * Public surface frozen to: `SceneDocumentIssue`,
 * `SceneDocumentValidationResult`, `SceneDocumentValidationError`,
 * `cameraSceneConnectionTimingFailureReason`, `validateSceneDocument`,
 * `parseSceneDocumentJson`, `serializeSceneDocument`. Everything else is
 * `@internal` and consumers should not import the sibling modules
 * directly.
 */
import type { SceneDocument } from '../scene';
import { addIssue, assertAllowedKeys, isRecord } from './readers';
import {
	parseCluster,
	parseEntity,
	parseMaterialInstance,
	parseTextureAsset
} from './parse-entities';
import { parseConnection, parseNode, validateSemantics } from './parse-document';
import { canonicalDocument } from './canonical';

/**
 * Public surface types for the scene document codec. The document has
 * one canonical shape; there are no versioned legacy forms to migrate.
 */
export type SceneDocumentIssue = {
	path: string;
	code: string;
	message: string;
};

export type SceneDocumentValidationResult =
	| { success: true; document: SceneDocument; canonicalJson: string }
	| { success: false; issues: SceneDocumentIssue[] };

export class SceneDocumentValidationError extends Error {
	readonly issue: SceneDocumentIssue;

	constructor(issue: SceneDocumentIssue) {
		super(`${issue.path} (${issue.code}): ${issue.message}`);
		this.name = 'SceneDocumentValidationError';
		this.issue = issue;
	}
}

export { cameraSceneConnectionTimingFailureReason } from './parse-document';

export function validateSceneDocument(input: unknown): SceneDocumentValidationResult {
	const issues: SceneDocumentIssue[] = [];
	if (!isRecord(input)) {
		addIssue(issues, '$', 'invalid_type', 'Expected a scene document object');
		return { success: false, issues };
	}
	const rootKeys = [
		'textures',
		'materials',
		'entities',
		'clusters',
		'navigationNodes',
		'connections'
	] as const;
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
	const textures = parseArray('textures', parseTextureAsset);
	const materials = parseArray('materials', parseMaterialInstance);
	const entities = parseArray('entities', (value, path, target) =>
		parseEntity(value, path, target, { allowMaterialInstance: true })
	);
	const clusters = 'clusters' in input ? parseArray('clusters', parseCluster) : undefined;
	const navigationNodes = parseArray('navigationNodes', parseNode);
	const connections = parseArray('connections', parseConnection);
	if (
		!textures ||
		!materials ||
		!entities ||
		('clusters' in input && !clusters) ||
		!navigationNodes ||
		!connections ||
		issues.length
	) {
		return { success: false, issues };
	}
	const document = {
		textures,
		materials,
		entities,
		...(clusters === undefined ? {} : { clusters }),
		navigationNodes,
		connections
	};
	validateSemantics(document, issues);
	if (issues.length) return { success: false, issues };
	const normalized = canonicalDocument(document);
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
