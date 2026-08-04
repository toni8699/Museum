/**
 * `scene-codec/index.ts` — public barrel for the museum scene document codec.
 *
 * Slice 5 of the Priority-1 file-split refactor reduces this 2 337-LOC monolith
 * to a slim barrel. Internal helpers now live in:
 *
 *   - `./types`         — public types + V1-V5 legacy shapes
 *   - `./readers`       — leaf typed JSON readers
 *   - `./parse-entities`— entities, materials, textures, placements
 *   - `./parse-nodes`   — navigation nodes, waypoints, path anchors
 *   - `./parse-connections` — connection shapes + timing helpers
 *   - `./validate`      — semantic / version-two / keyframe validation
 *   - `./canonical`     — clone helpers + deterministic serializer
 *   - `./migrate`       — V1→V2→V3/V4→V5→V6 deterministic migrations
 *
 * Public surface frozen to: `SceneDocumentIssue`,
 * `SceneDocumentValidationResult`, `SceneDocumentValidationError`,
 * `cameraSceneConnectionTimingFailureReason`, `validateSceneDocument`,
 * `parseSceneDocumentJson`, `serializeSceneDocument`. Everything else is
 * `@internal` and consumers should not import the sibling modules
 * directly.
 */
import { addIssue, assertAllowedKeys, isRecord } from './readers';
import {
	parseCluster,
	parseEntity,
	parseMaterialInstance,
	parsePlacement,
	parseTextureAsset
} from './parse-entities';
import { parseNodeV1V2, parseNodeV3, parseNodeV4 } from './parse-nodes';
import {
	parseConnectionV2,
	parseConnectionV3,
	parseConnectionV4,
	parseLegacyConnection
} from './parse-connections';
import { validateSemantics } from './validate';
import { canonicalDocument } from './canonical';
import {
	migrateToVersionFive,
	migrateToVersionSix,
	migrateVersionOneDocument,
	migrateVersionTwoDocument
} from './migrate';

import {
	SceneDocumentValidationError,
	type ParsedMuseumSceneDocument,
	type SceneDocumentIssue,
	type SceneDocumentValidationResult
} from './types';

export type { SceneDocumentIssue } from './types';
export type { SceneDocumentValidationResult } from './types';
export { SceneDocumentValidationError } from './types';
export { cameraSceneConnectionTimingFailureReason } from './parse-connections';

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
