/**
 * `scene-codec/readers.ts` — leaf helpers: typed JSON readers + icon constants.
 *
 * Slice 5 of the Priority-1 file-split refactor lifts the 170-LOC block that
 * gives every parser sibling `isRecord`, `addIssue`, `assertAllowedKeys`,
 * `readRequiredString`, etc. Tagged `@internal` — never imported by anything
 * outside `scene-codec/`. The three icon lists (`SCENE_PRIMITIVE_KINDS`,
 * `SCENE_LIGHT_KINDS`, `HEX_COLOR_PATTERN`) live here because the entity/light
 * parsers read them.
 */
import type { RoomId, Vec3 } from '$lib/types/scene';
import type { MaterialId } from '$lib/types/materials';
import { isMaterialId } from '../materials';
import { isSafeTextureUri } from '../texture-uri';
import type { SceneDocumentIssue } from './index';

// Internal record type shared by every parser. Lives here (the leaf module)
// so `parse-entities` / `parse-document` can import it alongside the readers.
export type JsonRecord = Record<string, unknown>;

export const SCENE_PRIMITIVE_KINDS = ['box', 'plane', 'cylinder', 'sphere'] as const;
export const SCENE_LIGHT_KINDS = ['point', 'spot', 'directional'] as const;
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function addIssue(
	issues: SceneDocumentIssue[],
	path: string,
	code: string,
	message: string
) {
	issues.push({ path, code, message });
}

export function assertAllowedKeys(
	value: JsonRecord,
	allowed: readonly string[],
	path: string,
	issues: SceneDocumentIssue[]
) {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			addIssue(issues, `${path}.${key}`, 'unknown_property', `Unknown property: ${key}`);
		}
	}
}

export function readRequiredString(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): string | undefined {
	const candidate = value[key];
	if (typeof candidate !== 'string') {
		addIssue(issues, `${path}.${key}`, 'invalid_type', 'Expected a string');
		return undefined;
	}
	if (!candidate.trim()) {
		addIssue(issues, `${path}.${key}`, 'empty_string', 'Expected a non-empty string');
	}
	return candidate;
}

export function readOptionalString(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): string | undefined {
	if (!(key in value)) return undefined;
	return readRequiredString(value, key, path, issues);
}

export function readRequiredBoolean(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): boolean | undefined {
	const candidate = value[key];
	if (typeof candidate !== 'boolean') {
		addIssue(issues, `${path}.${key}`, 'invalid_type', 'Expected a boolean');
		return undefined;
	}
	return candidate;
}

export function readRequiredNumber(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): number | undefined {
	const candidate = value[key];
	if (typeof candidate !== 'number') {
		addIssue(issues, `${path}.${key}`, 'invalid_type', 'Expected a number');
		return undefined;
	}
	if (!Number.isFinite(candidate)) {
		addIssue(issues, `${path}.${key}`, 'non_finite_number', 'Expected a finite number');
		return undefined;
	}
	return candidate;
}

export function readUnitInterval(
	value: JsonRecord,
	key: 'roughness' | 'metalness',
	path: string,
	issues: SceneDocumentIssue[]
): number | undefined {
	if (!(key in value)) return undefined;
	const candidate = readRequiredNumber(value, key, path, issues);
	if (candidate === undefined) return undefined;
	if (candidate < 0 || candidate > 1) {
		addIssue(
			issues,
			`${path}.${key}`,
			`invalid_${key}`,
			`${key} must be between zero and one`
		);
		return undefined;
	}
	return candidate;
}
export function readVec3(
	value: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): Vec3 | undefined {
	if (!Array.isArray(value) || value.length !== 3) {
		addIssue(issues, path, 'invalid_vec3', 'Expected an array of exactly three finite numbers');
		return undefined;
	}
	const points: number[] = [];
	for (const [index, candidate] of value.entries()) {
		if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
			addIssue(issues, `${path}[${index}]`, 'non_finite_number', 'Expected a finite number');
		} else {
			points.push(candidate);
		}
	}
	return points.length === 3 ? [points[0]!, points[1]!, points[2]!] : undefined;
}

export function readRoomId(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): RoomId | undefined {
	const roomId = readRequiredString(value, key, path, issues);
	return roomId as RoomId | undefined;
}

export function readStringArray(
	value: unknown,
	path: string,
	issues: SceneDocumentIssue[]
): string[] | undefined {
	if (!Array.isArray(value)) {
		addIssue(issues, path, 'invalid_type', 'Expected an array');
		return undefined;
	}
	const result: string[] = [];
	for (const [index, item] of value.entries()) {
		if (typeof item !== 'string' || !item.trim()) {
			addIssue(issues, `${path}[${index}]`, 'invalid_type', 'Expected a non-empty string');
		} else {
			result.push(item);
		}
	}
	return result.length === value.length ? result : undefined;
}

export function readHoldSeconds(
	value: JsonRecord,
	key: string,
	path: string,
	issues: SceneDocumentIssue[]
): number | undefined {
	if (!(key in value)) return undefined;
	const candidate = readRequiredNumber(value, key, path, issues);
	if (candidate !== undefined && (!Number.isFinite(candidate) || candidate < 0)) {
		addIssue(
			issues,
			`${path}.${key}`,
			'invalid_hold_seconds',
			'holdSeconds must be a finite non-negative number'
		);
		return undefined;
	}
	return candidate;
}
