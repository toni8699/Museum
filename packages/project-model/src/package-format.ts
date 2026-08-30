/**
 * Portable `.scenepack.zip` manifest and filename primitives.
 *
 * ZIP/Blob/File orchestration stays in the editor. This module owns only the
 * deterministic, browser/Node-safe values consumed by that orchestration.
 */

import { sha256Bytes } from './package-sha';

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

export interface PackageManifestPackage {
	id: string;
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

/** Deterministic id from the sorted, lowercased texture fingerprint set. */
export async function derivePackageId(fingerprints: readonly string[]): Promise<string> {
	const sorted = [...fingerprints].map((s) => s.toLowerCase()).sort();
	const joined = sorted.join('');
	const digest = await sha256Bytes(new TextEncoder().encode(joined));
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
 * Sanitize a filename using the MIME-sniffed extension and the existing
 * hard-break package rules.
 */
export function sanitizeFilename(originalName: string, mime: string): string {
	if (!isSupportedMime(mime)) {
		throw new Error(`Unsupported MIME for filename sanitization: ${mime}`);
	}

	const ext = extensionForMime(mime);
	const normalized = originalName.normalize('NFC').replace(/\.[^./\\]+$/u, '');
	const lowered = normalized.toLowerCase();

	let slug = '';
	for (const ch of lowered) {
		if (/[a-z0-9._-]/.test(ch)) {
			slug += ch;
		} else {
			slug += '_';
		}
	}
	slug = slug.replace(/_+/g, '_');
	slug = slug.replace(/_+\d+$/u, '');
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

/** Find the next available `-2`, `-3`, … collision suffix. */
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

export function buildPackageManifest(input: {
	packageId: string;
	createdAt: Date;
	documentTitle: string;
	textures: readonly PackageManifestTextureEntry[];
}): PackageManifest {
	return {
		package: {
			id: input.packageId,
			createdAt: input.createdAt.toISOString(),
			generator: 'editor-5.4',
			documentTitle: input.documentTitle || 'scene'
		},
		textures: [...input.textures]
	};
}

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
	return `${slug}-${stamp}.scenepack.zip`;
}

function slugify(input: string): string {
	const trimmed = (input || '').trim().toLowerCase();
	if (trimmed.length === 0) return 'scene';
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
	return trimmedOut.length > 0 ? trimmedOut : 'scene';
}

export type SupportedMimeList = typeof SUPPORTED_MIMES;
