import type { MuseumSceneDocument } from '$lib/content/scene';
import type { LayoutDocument } from '$lib/layout/layout-types';

export type MuseumProject = {
	id: string;
	name: string;
	layout: LayoutDocument;
	scene: MuseumSceneDocument;
};

export type MuseumProjectIssue = {
	path: string;
	code: string;
	message: string;
};

export type MuseumProjectValidationResult =
	| { success: true; project: MuseumProject; canonicalJson: string }
	| { success: false; issues: MuseumProjectIssue[] };
