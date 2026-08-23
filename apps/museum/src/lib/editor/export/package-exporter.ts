/**
 * `editor/export/package-exporter.ts` — Phase 5.4 package writer.
 *
 * **Path** for `buildPackage`:
 *  1. Strict-serialize the document via `scene-codec/serializeSceneDocument`.
 *  2. Walk every `SceneTextureAsset.uri`. For each:
 *     a. Confirm `isSafeTextureUri`.
 *     b. Sniff mime from the resolved bytes (priority) and derive a sanitized
 *        filename. Apply collision suffix against the entry list produced so far.
 *     c. Resolve bytes via caller-supplied resolver.
 *  3. Compute fingerprints and derive packageId.
 *  4. Rewrite `scene.json` so each texture's `uri` becomes
 *     `/textures/<packageId>/<sanitizedFilename>`.
 *  5. Compose `manifest.json`. Compose the archive with `fflate.zip`.
 *  6. Return `{ status: 'ok', zip, manifest, filename }` (or `'rejected'`).
 */

import { zipSync } from 'fflate';
import { isSafeTextureUri } from '$lib/content/texture-uri';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import {
	REWRITE_URI_PREFIX,
	buildPackageManifest,
	collisionSuffix,
	derivePackageId,
	extensionForMime,
	isSupportedMime,
	packageFilenameFor,
	sanitizeFilename,
	type PackageManifest,
	type PackageManifestTextureEntry,
	type SupportedMime
} from '$lib/content/package-format';
import { sha256Bytes } from '$lib/editor/helpers/package-sha';
import { sniffImageMime } from '$lib/editor/helpers/mime-sniff';
import type { SceneDocument, SceneTextureAsset } from '$lib/content/scene';

export type ExportRejectionReason =
	| 'unresolved-binary'
	| 'unsafe-uri'
	| 'unsupported-mime';

export type PackageExportResult =
	| {
			status: 'ok';
			zip: Uint8Array;
			manifest: PackageManifest;
			filename: string;
	  }
	| {
			status: 'rejected';
			reason: ExportRejectionReason;
			detail: string;
	  };

export interface PackageExportInput {
	document: SceneDocument;
	resolveBytesByUri: (uri: string) => Promise<Uint8Array | null>;
	now?: Date;
}

export async function buildPackage(input: PackageExportInput): Promise<PackageExportResult> {
	const document = input.document;

	// Validate every texture uri is safe.
	for (const t of document.textures) {
		if (!isSafeTextureUri(t.uri)) {
			return {
				status: 'rejected',
				reason: 'unsafe-uri',
				detail: `texture ${t.id} uri ${t.uri} failed safe-uri predicate`
			};
		}
	}

	// Resolve bytes; determine mime (sniff-priority); produce sanitized filenames
	// with collision suffixes.
	const usedFilenames: string[] = [];
	const resolvedEntries: Array<{
		original: SceneTextureAsset;
		bytes: Uint8Array;
		mime: SupportedMime;
		sanitizedFilename: string;
	}> = [];

	for (const t of document.textures) {
		const bytes = await input.resolveBytesByUri(t.uri);
		if (!bytes) {
			return {
				status: 'rejected',
				reason: 'unresolved-binary',
				detail: `texture ${t.id} (uri ${t.uri}) returned no bytes`
			};
		}
		const sniffed = sniffImageMime(bytes);
		if (!sniffed) {
			return {
				status: 'rejected',
				reason: 'unsupported-mime',
				detail: `texture ${t.id} bytes are not a supported image (PNG/WebP/JPEG)`
			};
		}
		const originalName = inferOriginalName(t.uri);
		const sanitized = sanitizeFilename(originalName, sniffed);
		const candidate = collisionSuffix(usedFilenames, sanitized);
		usedFilenames.push(candidate);
		resolvedEntries.push({ original: t, bytes, mime: sniffed, sanitizedFilename: candidate });
	}

	// Compute fingerprints.
	const fingerprints: string[] = [];
	for (const entry of resolvedEntries) {
		fingerprints.push(await sha256Bytes(entry.bytes));
	}

	const packageId = await derivePackageId(fingerprints);

	// Compose manifest entries.
	const manifestEntries: PackageManifestTextureEntry[] = resolvedEntries.map((e, i) => ({
		assetId: e.original.id,
		originalName: e.sanitizedFilename,
		mime: e.mime,
		size: e.bytes.byteLength,
		fingerprint: fingerprints[i]!,
		destinationPath: `textures/${e.sanitizedFilename}`
	}));

	const now = input.now ?? new Date();
	const documentTitle = exportDocumentTitle(document);
	const manifest = buildPackageManifest({
		packageId,
		createdAt: now,
		documentTitle,
		textures: manifestEntries
	});

	// Build the rewritten scene.json.
	const rewrittenTextures: SceneTextureAsset[] = resolvedEntries.map((e) => ({
		...e.original,
		uri: `${REWRITE_URI_PREFIX(packageId)}${e.sanitizedFilename}`
	}));
	const rewrittenDoc: SceneDocument = {
		...document,
		textures: rewrittenTextures
	};
	const canonicalJson = serializeSceneDocument(rewrittenDoc);
	const sceneBytes = new TextEncoder().encode(canonicalJson);
	const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));

	// Compose zip.
	const entries: Record<string, Uint8Array> = {
		'scene.json': sceneBytes,
		'manifest.json': manifestBytes
	};
	for (const e of resolvedEntries) {
		entries[`textures/${e.sanitizedFilename}`] = e.bytes;
	}
	const zip = zipSync(entries, { level: 6 });

	return {
		status: 'ok',
		zip,
		manifest,
		filename: packageFilenameFor(documentTitle, now)
	};
}

export function buildPackageFilename(documentTitle: string, now: Date): string {
	return packageFilenameFor(documentTitle, now);
}

/**
 * Resolve a human-readable title for the package. The current v6 document
 * has no `documentTitle` field; this hook is forward-compatibility shim so
 * future schema additions can light up without changing call sites. It
 * currently always returns `'scene'`.
 */
export function exportDocumentTitle(document: SceneDocument): string {
	const title = (document as { documentTitle?: string }).documentTitle;
	if (typeof title === 'string' && title.trim().length > 0) {
		return title.trim();
	}
	return 'scene';
}

/**
 * Pick the last URI path segment and percent-decode it. v6 stores URI escapes
 * verbatim (e.g. `Walnut%20Wall.png`), and the sanitizer must see the decoded
 * `Walnut Wall.png` form so users register spaces rather than `%20`. Decoding
 * falls back to the literal segment on malformed escapes.
 */
export function inferOriginalName(uri: string): string {
	const withoutFragment = uri.split('?')[0]!.split('#')[0]!;
	const lastSeg = withoutFragment.split('/').pop() ?? '';
	let decoded: string;
	try {
		decoded = decodeURIComponent(lastSeg);
	} catch {
		decoded = lastSeg;
	}
	return decoded.length > 0 ? decoded : 'texture';
}
