import {
	SceneDocumentValidationError,
	cameraSceneConnectionTimingFailureReason,
	parseSceneDocumentJson as parseCore,
	serializeSceneDocument as serializeCore,
	validateSceneDocument as validateCore,
	type SceneDocumentIssue,
	type SceneDocumentValidationResult,
	type SceneValidationOptions
} from '@portfolio/project-model';
import { MUSEUM_SCENE_VALIDATION_OPTIONS } from '../scene-validation';

export type { SceneDocumentIssue, SceneDocumentValidationResult, SceneValidationOptions };
export { SceneDocumentValidationError, cameraSceneConnectionTimingFailureReason };

function museumOptions(options: SceneValidationOptions = {}): SceneValidationOptions {
	return { ...MUSEUM_SCENE_VALIDATION_OPTIONS, ...options };
}

export function validateSceneDocument(
	input: unknown,
	options: SceneValidationOptions = {}
): SceneDocumentValidationResult {
	return validateCore(input, museumOptions(options));
}

export function parseSceneDocumentJson(
	json: string,
	options: SceneValidationOptions = {}
): SceneDocumentValidationResult {
	return parseCore(json, museumOptions(options));
}

export function serializeSceneDocument(
	document: unknown,
	options: SceneValidationOptions = {}
): string {
	return serializeCore(document, museumOptions(options));
}
