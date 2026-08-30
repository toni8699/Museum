import type { LayoutDocument } from '@portfolio/layout-core';
import type { ProjectDocument, SceneDocument } from '@portfolio/project-model';

/** Type-only pin to the canonical documents used by the later persistence slice. */
export type ApiDocumentBoundary = {
	project: ProjectDocument;
	layout: LayoutDocument;
	scene: SceneDocument;
};
