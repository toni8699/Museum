import type { LayoutDocument } from '@portfolio/layout-core';
import type { SceneDocument } from './scene';

export type ProjectDocument = {
	id: string;
	name: string;
	layout: LayoutDocument;
	scene: SceneDocument;
};

/** Temporary app compatibility name; the durable model name is ProjectDocument. */
export type Project = ProjectDocument;

export type ProjectIssue = {
	path: string;
	code: string;
	message: string;
};

export type ProjectValidationResult =
	| { success: true; project: Project; canonicalJson: string }
	| { success: false; issues: ProjectIssue[] };
