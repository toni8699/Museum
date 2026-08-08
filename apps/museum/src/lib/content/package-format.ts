/**
 * `content/package-format.ts` — Phase 5.4 package format primitives.
 *
 * **Pure module** with zero browser/Three imports. Imported by
 * `editor/import/package-importer.ts` and `editor/export/package-exporter.ts`.
 *
 * Format:
 * - `museum-scene.json` (canonical v6, rewritten URIs)
 * - `manifest.json` (single source of truth; per-texture sha256 fingerprints)
 * - `textures/<sanitizedFilename>` × N
 *
 * Package id = `package-<12 hex of sha256(sortedFingerprints.join(''))>`.
 *
 * Filename sanitization keeps `[A-Za-z0-9._-]`, lowercases, replaces non-ascii
 * runs with `_`, collapses `_` runs, prepends `_` if the first remaining char
 * is non-alnum, and clamps to 128 chars. The extension comes from the sniffed
 * MIME, not the original filename.
 */

import { sha256Bytes } from '$lib/editor/helpers/package-sha';

/** Forward-compatible format identifier; older `0` is not supported. */
export const PACKAGE_FORMAT_VERSION = 1 as const;
/** The scene schema version every package must conform to. */
export const SUPPORTED_SCHEMA_VERSION = 6 as const;

export type SupportedMime = 'image/png' | 'image/webp' | 'image/jpeg';

const SUPPORTED_MIMES: readonly SupportedMime[] = ['image/png', 'image/webp', 'image/jpeg'];

const MAX_FILENAME_LENGTH = 128;

export function isSupportedMime(mime: string): mime is SupportedMime {
	return (SUPPORTED_MIMES as readonly string[]).includes(mime);
}

export function extensionForMime(mime: string): '.png' | '.webp' | '.jpg' | '.jpeg' {
	if (!isSupportedMime(mime)) {
		throw new Error(`Unsupported MIME: ${mime}`);
	}
	switch (mime) {
		case 'image/png':
			return '.png';
		case 'image/webp':
			return '.webp';
		case 'image/jpeg':
			return '.jpg';
	}
}

export interface ManifestVersion {
	formatVersion: number;
	schemaVersion: number;
}

export interface PackageManifestPackage {
	id: string;
	formatVersion: typeof PACKAGE_FORMAT_VERSION;
	schemaVersion: typeof SUPPORTED_SCHEMA_VERSION;
	createdAt: string;
	generator: string;
	documentTitle: string;
}

export interface PackageManifestTextureEntry {
	assetId: string;
	originalName: string;
	mime: SupportedMime;
	size: number;
	fingerprint: string;
	destinationPath: string;
}

export interface PackageManifest {
	package: PackageManifestPackage;
	textures: PackageManifestTextureEntry[];
}

export function assertFormatVersion(formatVersion: number): void {
	if (formatVersion !== PACKAGE_FORMAT_VERSION) {
		throw new Error(
			`Unsupported package formatVersion ${formatVersion}; expected ${PACKAGE_FORMAT_VERSION}.`
		);
	}
}

export function assertSchemaVersion(schemaVersion: number): void {
	if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported package schemaVersion ${schemaVersion}; expected ${SUPPORTED_SCHEMA_VERSION}.`
		);
	}
}

export function assertManifestVersion(version: ManifestVersion): void {
	assertFormatVersion(version.formatVersion);
	assertSchemaVersion(version.schemaVersion);
}

/**
 * Deterministic package id derived from the sorted, lowercased concatenation
 * of every texture fingerprint. The id is identical for any reordering of
 * the same fingerprint set so packages that carry the same texture inventory
 * agree on it.
 */
export async function derivePackageId(fingerprints: readonly string[]): Promise<string> {
	const sorted = [...fingerprints].map((s) => s.toLowerCase()).sort();
	const joined = sorted.join('');
	const digest = await sha256Bytes(new TextEncoder().encode(joined));
	// Strip the `sha256-` prefix (8 chars) and take the first 12 hex chars.
	const hex = digest.slice('sha256-'.length, 'sha256-'.length + 12);
	return `package-${hex}`;
}

export function REWRITE_URI_PREFIX(packageId: string): string {
	if (!/^package-[0-9a-f]{12}$/.test(packageId)) {
		throw new Error(`Invalid package id: ${packageId}`);
	}
	return `/textures/${packageId}/`;
}

/**
 * Sanitize a user-supplied filename into the strict slug used inside the
 * package's `textures/` directory. The resulting name ends in the extension
 * dictated by the sniffed MIME, not the original filename.
 *
 * Rules (in order):
 *  1. NFC normalize so composed/decomposed Unicode agree.
 *  2. Strip the LAST extension (`Walnut.png` → `Walnut`); the final
 *     extension is overwritten by the sniffed MIME.
 *  3. Lowercase.
 *  4. Replace any character outside `[a-z0-9._-]` with `_`.
 *  5. Collapse runs of `_` into single `_`.
 *  6. Strip a trailing `_+\d+$` (decorative copy-number suffix) so the
 *     package's own `-N` collision suffix can take over.
 *  7. Trim trailing `._`, prepend `_` if the head is non-alnum.
 *  8. Clamp to `MAX_FILENAME_LENGTH - ext.length`, append `ext`.
 */
export function sanitizeFilename(originalName: string, mime: string): string {
	if (!isSupportedMime(mime)) {
		throw new Error(`Unsupported MIME for filename sanitization: ${mime}`);
	}

	// NFC normalize so `café` (precomposed) and `cafe\u0301` (decomposed) yield
	// the same slug across platforms.
	const ext = extensionForMime(mime);
	const normalized = originalName.normalize('NFC').replace(/\.[^./\\]+$/u, '');
	const lowered = normalized.toLowerCase();

	// Replace any non-[A-Za-z0-9._-] char with `_`.
	let slug = '';
	for (const ch of lowered) {
		if (/[a-z0-9._-]/.test(ch)) {
			slug += ch;
		} else {
			slug += '_';
		}
	}
	// Collapse runs of underscores.
	slug = slug.replace(/_+/g, '_');
	// Strip a trailing "_<digits>" decorative copy-number so the canonical
	// `-N` collision suffix can take over (`Wall Detail 2` → `wall_detail`).
	slug = slug.replace(/_+\d+$/u, '');
	// Trim trailing dot/underscore characters.
	slug = slug.replace(/[._]+$/u, '');
	if (slug.length === 0) slug = 'texture';

	if (!/^[a-z0-9]/.test(slug)) {
		slug = `_${slug}`;
	}

	const baseLength = MAX_FILENAME_LENGTH - ext.length;
	if (slug.length > baseLength) {
		slug = slug.slice(0, baseLength);
	}
	return `${slug}${ext}`;
}

/**
 * Find the next available name within `usedNames` for `candidate` by appending
 * `-2`, `-3`, … until unused. The original candidate's extension is preserved.
 */
export function collisionSuffix(usedNames: readonly string[], candidate: string): string {
	const set = new Set(usedNames);
	if (!set.has(candidate)) return candidate;
	const dot = candidate.lastIndexOf('.');
	const stem = dot === -1 ? candidate : candidate.slice(0, dot);
	const ext = dot === -1 ? '' : candidate.slice(dot);
	for (let n = 2; n < Number.MAX_SAFE_INTEGER; n += 1) {
		const next = `${stem}-${n}${ext}`;
		if (!set.has(next)) return next;
	}
	throw new Error('Could not find a unique filename after exhaustion.');
}

/**
 * Build a complete `manifest.json` payload. Deterministic in id given the same
 * fingerprint set; createdAt comes from the input date for testability.
 */
export function buildPackageManifest(input: {
	packageId: string;
	createdAt: Date;
	documentTitle: string;
	textures: readonly PackageManifestTextureEntry[];
}): PackageManifest {
	return {
		package: {
			id: input.packageId,
			formatVersion: PACKAGE_FORMAT_VERSION,
			schemaVersion: SUPPORTED_SCHEMA_VERSION,
			createdAt: input.createdAt.toISOString(),
			generator: 'museum-editor-5.4',
			documentTitle: input.documentTitle || 'museum-scene'
		},
		textures: [...input.textures]
	};
}

/**
 * Produce `<slug>-<yyyyMMdd>-<HHMM>.museumpack.zip` for the given document
 * title and date. UTC parts so filenames are stable across dev machines.
 */
export function packageFilenameFor(documentTitle: string, now: Date): string {
	const slug = slugify(documentTitle);
	const pad = (n: number): string => n.toString().padStart(2, '0');
	const stamp =
		`${now.getUTCFullYear()}` +
		`${pad(now.getUTCMonth() + 1)}` +
		`${pad(now.getUTCDate())}` +
		`-` +
		`${pad(now.getUTCHours())}` +
		`${pad(now.getUTCMinutes())}`;
	return `${slug}-${stamp}.museumpack.zip`;
}

function slugify(input: string): string {
	const trimmed = (input || '').trim().toLowerCase();
	if (trimmed.length === 0) return 'museum-scene';
	let out = '';
	let lastUnderscore = false;
	for (const ch of trimmed) {
		if (/[a-z0-9]/.test(ch)) {
			out += ch;
			lastUnderscore = false;
		} else if (!lastUnderscore) {
			out += '-';
			lastUnderscore = true;
		}
	}
	const trimmedOut = out.replace(/^-+|-+$/g, '');
	return trimmedOut.length > 0 ? trimmedOut : 'museum-scene';
}

// Internal helper used by the importer/exporter to reflect a stable MIME
// after sniffing. Exporting here keeps the importer/exporter small.
export type SupportedMimeList = typeof SUPPORTED_MIMES;
