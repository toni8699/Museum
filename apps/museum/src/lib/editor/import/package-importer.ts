/**
 * `editor/import/package-importer.ts` — Phase 5.4 package importer.
 *
 * **Pure module** callable from both editor (browser) and tests (node).
 * Imports `unzip` from `fflate` (async via a small Promise wrapper because the
 * browser entry is callback-shaped). All other dependencies are project-local.
 *
 * **Rejection matrix** (matches the design spec):
 * - `format-unsupported` — invalid zip bytes, unsupported `formatVersion`,
 *   unparsable manifest.
 * - `missing-bytes` — `museum-scene.json`, `manifest.json`, or any
 *   `manifest.textures[*].destinationPath` is absent.
 * - `fingerprint-mismatch` — a manifest entry's bytes do not match its
 *   claimed sha256.
 * - `unsafe-uri` — a rewritten `SceneTextureAsset.uri` fails `isSafeTextureUri`.
 * - `manifest-mismatch` — manifest entry is not referenced by any texture uri,
 *   or a scene texture uri falls outside the rewrite prefix, or the manifest's
 *   package.id does not match the derived id from its sorted fingerprints.
 * - `schema-mismatch` — strict v6 parse of `museum-scene.json` fails.
 *
 * **On `ok`** the binary map is keyed by the rewritten `SceneTextureAsset.uri`
 * (NOT by `destinationPath`) so callers can hand it directly to the
 * `BinaryTextureStore` (Phase 5.4 Task 4).
 */

import { unzip } from 'fflate';
import { isSafeTextureUri } from '$lib/content/texture-uri';
import { parseSceneDocumentJson } from '$lib/content/scene-codec';
import {
	REWRITE_URI_PREFIX,
	assertFormatVersion,
	assertSchemaVersion,
	derivePackageId,
	type PackageManifest,
	type SupportedMime
} from '$lib/content/package-format';
import { sha256Bytes } from '$lib/editor/helpers/package-sha';
import type { MuseumSceneDocument, SceneTextureAsset } from '$lib/content/scene';

export type ImportRejectionReason =
	| 'format-unsupported'
	| 'manifest-mismatch'
	| 'missing-bytes'
	| 'fingerprint-mismatch'
	| 'unsafe-uri'
	| 'schema-mismatch';

export type PackageImportBinary = {
	bytes: Uint8Array;
	mime: SupportedMime;
	fingerprint: string;
};

export type PackageImportResult =
	| {
			status: 'ok';
			document: MuseumSceneDocument;
			binaries: Map<string, PackageImportBinary>;
			packageId: string;
	  }
	| {
			status: 'rejected';
			reason: ImportRejectionReason;
			detail: string;
	  };

export async function importPackage(zip: Uint8Array): Promise<PackageImportResult> {
	let files: Record<string, Uint8Array>;
	try {
		files = await unzipAsync(zip);
	} catch (err) {
		return {
			status: 'rejected',
			reason: 'format-unsupported',
			detail: `Could not unzip archive: ${errorDetail(err)}`
		};
	}

	if (!files['museum-scene.json'] || !files['manifest.json']) {
		return {
			status: 'rejected',
			reason: 'missing-bytes',
			detail: 'museum-scene.json or manifest.json is missing from the archive'
		};
	}

	const manifestResult = decodeManifest(files['manifest.json']);
	if (manifestResult.status === 'rejected') {
		return manifestResult;
	}
	const manifest = manifestResult.manifest;

	const sceneResult = decodeScene(files['museum-scene.json']);
	if (sceneResult.status === 'rejected') {
		return sceneResult;
	}
	const document = sceneResult.document;

	// Cross-check manifest ⊆ scene and scene ⊆ manifest BEFORE byte verification.
	// A manifest entry that points to an unreferenced URI is a structural mismatch,
	// not a byte issue.
	const crossCheck = await crossCheckManifestAndScene(manifest, document);
	if (crossCheck.status === 'rejected') {
		return crossCheck;
	}

	const binariesResult = await verifyManifestBinaries(manifest, files);
	if (binariesResult.status === 'rejected') {
		return binariesResult;
	}
	const binariesByDestinationPath = binariesResult.binaries;

	// Build the URI-keyed map handed to callers.
	const binariesByUri = new Map<string, PackageImportBinary>();
	for (const entry of manifest.textures) {
		const stored = binariesByDestinationPath.get(entry.destinationPath);
		if (!stored) {
			return {
				status: 'rejected',
				reason: 'missing-bytes',
				detail: `logic error: ${entry.destinationPath} verified but missing from map`
			};
		}
		binariesByUri.set(sceneUriFor(manifest.package.id, entry), stored);
	}

	return { status: 'ok', document, binaries: binariesByUri, packageId: manifest.package.id };
}

function sceneUriFor(
	packageId: string,
	entry: PackageManifest['textures'][number]
): string {
	const prefix = REWRITE_URI_PREFIX(packageId);
	const stripped = entry.destinationPath.startsWith('textures/')
		? entry.destinationPath.slice('textures/'.length)
		: entry.destinationPath;
	return `${prefix}${stripped}`;
}

function decodeManifest(
	bytes: Uint8Array
):
	| { status: 'rejected'; reason: ImportRejectionReason; detail: string }
	| { status: 'ok'; manifest: PackageManifest } {
	let raw: unknown;
	try {
		raw = JSON.parse(new TextDecoder().decode(bytes));
	} catch (err) {
		return {
			status: 'rejected',
			reason: 'schema-mismatch',
			detail: `manifest.json parse failure: ${errorDetail(err)}`
		};
	}
	if (!isManifestShape(raw)) {
		return {
			status: 'rejected',
			reason: 'schema-mismatch',
			detail: 'manifest.json is missing required top-level keys (package, textures)'
		};
	}
	try {
		assertFormatVersion(raw.package.formatVersion);
	} catch (err) {
		return {
			status: 'rejected',
			reason: 'format-unsupported',
			detail: errorDetail(err)
		};
	}
	try {
		assertSchemaVersion(raw.package.schemaVersion);
	} catch (err) {
		return {
			status: 'rejected',
			reason: 'schema-mismatch',
			detail: errorDetail(err)
		};
	}
	return { status: 'ok', manifest: raw };
}

function isManifestShape(value: unknown): value is PackageManifest {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	if (typeof obj['package'] !== 'object' || obj['package'] === null) return false;
	if (!Array.isArray(obj['textures'])) return false;
	const pkg = obj['package'] as Record<string, unknown>;
	// Schema: package must carry an `id`, a numeric `formatVersion`, and a
	// numeric `schemaVersion`. Other fields are validated by the build helper.
	return (
		typeof pkg['id'] === 'string' &&
		typeof pkg['formatVersion'] === 'number' &&
		typeof pkg['schemaVersion'] === 'number'
	);
}

function decodeScene(
	bytes: Uint8Array
):
	| { status: 'rejected'; reason: ImportRejectionReason; detail: string }
	| { status: 'ok'; document: MuseumSceneDocument } {
	let text: string;
	try {
		text = new TextDecoder().decode(bytes);
	} catch (err) {
		return {
			status: 'rejected',
			reason: 'schema-mismatch',
			detail: `museum-scene.json decode failure: ${errorDetail(err)}`
		};
	}
	const parsed = parseSceneDocumentJson(text);
	if (!parsed.success) {
		return {
			status: 'rejected',
			reason: 'schema-mismatch',
			detail: `museum-scene.json strict v6 parse failed: ${parsed.issues
				.map((i) => `${i.path}:${i.code}`)
				.join('; ')}`
		};
	}
	return { status: 'ok', document: parsed.document };
}

async function verifyManifestBinaries(
	manifest: PackageManifest,
	files: Record<string, Uint8Array>
): Promise<
	| { status: 'rejected'; reason: ImportRejectionReason; detail: string }
	| {
			status: 'ok';
			binaries: Map<string, PackageImportBinary>;
	  }
> {
	const out = new Map<string, PackageImportBinary>();
	for (const entry of manifest.textures) {
		const bytes = files[entry.destinationPath];
		if (!bytes) {
			return {
				status: 'rejected',
				reason: 'missing-bytes',
				detail: `manifest references ${entry.destinationPath} but the archive does not contain it`
			};
		}
		const fingerprint = await sha256Bytes(bytes);
		if (fingerprint !== entry.fingerprint) {
			return {
				status: 'rejected',
				reason: 'fingerprint-mismatch',
				detail: `${entry.destinationPath}: expected ${entry.fingerprint}, computed ${fingerprint}`
			};
		}
		out.set(entry.destinationPath, { bytes, mime: entry.mime, fingerprint });
	}
	return { status: 'ok', binaries: out };
}

async function crossCheckManifestAndScene(
	manifest: PackageManifest,
	document: MuseumSceneDocument
): Promise<
	| { status: 'rejected'; reason: ImportRejectionReason; detail: string }
	| { status: 'ok' }
> {
	const rewritePrefix = REWRITE_URI_PREFIX(manifest.package.id);

	// 1. Every scene texture uri is safe-uri rule pass first; unsafe => 'unsafe-uri'.
	for (const t of document.textures) {
		if (!isSafeTextureUri(t.uri)) {
			return {
				status: 'rejected',
				reason: 'unsafe-uri',
				detail: `texture uri ${t.uri} failed safe-uri predicate`
			};
		}
	}

	// 2. Safe URIs that fall outside the rewrite prefix are a structural mismatch.
	for (const t of document.textures) {
		if (!t.uri.startsWith(rewritePrefix)) {
			return {
				status: 'rejected',
				reason: 'manifest-mismatch',
				detail: `texture uri ${t.uri} is not under rewrite prefix ${rewritePrefix}`
			};
		}
	}

	// 2. Every manifest entry's expected URI is in the scene.
	const sceneUris = new Set(document.textures.map((t: SceneTextureAsset) => t.uri));
	for (const entry of manifest.textures) {
		const uri = sceneUriFor(manifest.package.id, entry);
		if (!sceneUris.has(uri)) {
			return {
				status: 'rejected',
				reason: 'manifest-mismatch',
				detail: `manifest entry ${entry.destinationPath} not referenced by any texture uri in JSON`
			};
		}
	}

	// 3. The manifest's package.id matches the derived id from sorted fingerprints.
	const derivedId = await derivePackageId(manifest.textures.map((t) => t.fingerprint));
	if (derivedId !== manifest.package.id) {
		return {
			status: 'rejected',
			reason: 'manifest-mismatch',
			detail: `package.id ${manifest.package.id} does not match derived id ${derivedId} from sorted fingerprints`
		};
	}
	return { status: 'ok' };
}

function unzipAsync(zip: Uint8Array): Promise<Record<string, Uint8Array>> {
	return new Promise((resolve, reject) => {
		unzip(zip, (err, data) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(data as Record<string, Uint8Array>);
		});
	});
}

function errorDetail(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}
