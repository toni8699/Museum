/**
 * `scene-codec/types.ts` — public surface types for the museum scene document
 * codec. The document has one canonical shape; there are no versioned legacy
 * forms to migrate.
 *
 * Public surface (re-exported from `index.ts`): `SceneDocumentIssue`,
 * `SceneDocumentValidationResult`, `SceneDocumentValidationError`.
 * Everything else is internal — the `@internal` JSDoc tag tells downstream
 * consumers not to depend on the parser-internal shapes.
 */
import type { MuseumSceneDocument } from '../scene';

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
