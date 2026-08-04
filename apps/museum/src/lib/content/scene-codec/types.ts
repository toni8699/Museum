/**
 * `scene-codec/types.ts` — public surface types + V1-V5 legacy document
 * shapes.
 *
 * Slice 5 of the Priority-1 file-split refactor lifts these types out of
 * the 2 337-LOC barrel so each parse / migrate / validate sibling module
 * imports only the helper shapes it reads. Public surface (re-exported
 * from `index.ts`): `SceneDocumentIssue`, `SceneDocumentValidationResult`,
 * `SceneDocumentValidationError`. Everything else is internal — the
 * `@internal` JSDoc tag tells downstream consumers not to depend on the
 * V1-V5 legacy shape or the parser-internal `ParsedMuseumSceneDocument`
 * discriminated union.
 */
import type {
	MuseumSceneDocument,
	SceneConnection,
	SceneNavigationNode,
	SceneObjectCluster,
	SceneObjectPlacement,
	SceneWaypoint
} from '../scene';

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

/** @internal — scene-codec only */
export type JsonRecord = Record<string, unknown>;

/** @internal — scene-codec only */
export type SceneNavigationNodeV1V2 = Omit<SceneNavigationNode, 'fov'>;

/** @internal — scene-codec only */
export type SceneConnectionV2 = Omit<SceneConnection, 'viewTracks'>;

/** Pre-v5 document shape: model placements live under `objects`. */
/** @internal — scene-codec only */
export type MuseumSceneDocumentWithObjects = {
	objects: SceneObjectPlacement[];
	clusters?: SceneObjectCluster[];
	navigationNodes: SceneNavigationNode[];
	connections: SceneConnection[];
};

/** @internal — scene-codec only */
export type MuseumSceneDocumentV3V4 = MuseumSceneDocumentWithObjects & {
	version: 3 | 4;
};

/** v5 has canonical entities but predates texture/material resources. */
/** @internal — scene-codec only */
export type MuseumSceneDocumentV5 = Omit<
	MuseumSceneDocument,
	'version' | 'textures' | 'materials'
> & {
	version: 5;
};

/** @internal — scene-codec only */
export type MuseumSceneDocumentV2 = {
	version: 2;
	objects: SceneObjectPlacement[];
	clusters?: SceneObjectCluster[];
	navigationNodes: SceneNavigationNodeV1V2[];
	connections: SceneConnectionV2[];
};

/** @internal — scene-codec only */
export type LegacySceneConnection = Omit<SceneConnectionV2, 'positionPath'> & {
	positionWaypoints: SceneWaypoint[];
};

/** @internal — scene-codec only */
export type LegacyMuseumSceneDocument = Omit<
	MuseumSceneDocumentV2,
	'version' | 'connections'
> & {
	version: 1;
	connections: LegacySceneConnection[];
};

/** @internal — scene-codec only */
export type ParsedMuseumSceneDocument =
	| MuseumSceneDocument
	| MuseumSceneDocumentV5
	| MuseumSceneDocumentV3V4
	| MuseumSceneDocumentV2
	| LegacyMuseumSceneDocument;

/** @internal — scene-codec only */
export type ParsedSceneNavigationNode = SceneNavigationNode | SceneNavigationNodeV1V2;
