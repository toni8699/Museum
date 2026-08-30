import {
	createEmptyProject,
	createProject as createCore,
	parseProjectJson as parseCore,
	serializeProject as serializeCore,
	validateProject as validateCore,
	ProjectValidationError,
	type EmptyProjectInput,
	type ProjectInput,
	type ProjectValidationOptions,
	type ProjectValidationResult
} from '@portfolio/project-model';
import { MUSEUM_SCENE_VALIDATION_OPTIONS } from '$lib/content/scene-validation';

export type { EmptyProjectInput, ProjectInput, ProjectValidationOptions, ProjectValidationResult };
export { createEmptyProject, ProjectValidationError };

const MUSEUM_PROJECT_OPTIONS: ProjectValidationOptions = {
	scene: MUSEUM_SCENE_VALIDATION_OPTIONS
};

export function createProject(input: ProjectInput) {
	return createCore(input, MUSEUM_PROJECT_OPTIONS);
}

export function validateProject(input: unknown): ProjectValidationResult {
	return validateCore(input, MUSEUM_PROJECT_OPTIONS);
}

export function parseProjectJson(json: string): ProjectValidationResult {
	return parseCore(json, MUSEUM_PROJECT_OPTIONS);
}

export function serializeProject(project: unknown): string {
	return serializeCore(project, MUSEUM_PROJECT_OPTIONS);
}
