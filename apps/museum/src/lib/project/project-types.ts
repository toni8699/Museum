import type { SceneDocument } from '$lib/content/scene';
import type { LayoutDocument } from '$lib/layout/layout-types';

export type Project = {
	id: string;
	name: string;
	layout: LayoutDocument;
	scene: SceneDocument;
};

export type ProjectIssue = {
	path: string;
	code: string;
	message: string;
};

export type ProjectValidationResult =
	| { success: true; project: Project; canonicalJson: string }
	| { success: false; issues: ProjectIssue[] };
