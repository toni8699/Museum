/**
 * `package-roundtrip-smoke.test.ts` — Phase 5.4 end-to-end smoke.
 *
 * Rounds a v6 document through `buildPackage` → `importPackage` and asserts:
 *  - the rewritten URIs point at `/textures/<packageId>/<sanitizedFilename>`,
 *  - sanitized filenames are unique (collision suffix applied where needed),
 *  - every entry's fingerprint matches the bytes round-tripped,
 *  - the pre-export document and post-import document agree on
 *    `assets × (id, fingerprint, mime)` even though their `uri`s differ.
 *
 * Uses a canonical 1×1 PNG byte sequence so the sniffer recognises each
 * texture as `image/png` and the sanitizer forces the extension. No real
 * files involved; the whole pipeline runs in node via `npm run test`.
 */

import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { buildPackage } from '$lib/editor/export/package-exporter';
import { importPackage } from '$lib/editor/import/package-importer';
import {
	REWRITE_URI_PREFIX
} from '$lib/content/package-format';
import baseSceneFixture from '$lib/content/scene.json';
import type { SceneDocument, SceneTextureAsset } from '$lib/content/scene';

// 1×1 transparent PNG.
const PNG_BYTES = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x00,
	0x02, 0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82
]);

const FIXTURE_TEXTURES: ReadonlyArray<{ id: string; name: string; uri: string }> = [
	// Two entries whose sanitized stem collides → export adds `-2` suffix.
	{ id: 'walnut-wall', name: 'Walnut Wall', uri: '/museum/textures/Walnut%20Wall.png' },
	{ id: 'walnut-wall-2', name: 'Walnut Wall 2', uri: '/museum/textures/Walnut%20Wall%202.png' },
	// A second texture with a distinct sanitized stem to confirm non-colliding
	// entries arrive unchanged.
	{ id: 'plaster', name: 'Plaster', uri: '/museum/textures/Plaster%20Wall.png' }
];

function makeScene(): SceneDocument {
	const baseScene = baseSceneFixture as unknown as SceneDocument;
	return {
		...baseScene,
		textures: FIXTURE_TEXTURES.map((t) => ({ ...t })),
		materials: []
	};
}

describe('Phase 5.4 package round-trip smoke', () => {
	it('buildPackage → importPackage preserves ids, fingerprints, mimes, and bytes', async () => {
		const document = makeScene();
		const now = new Date('2026-08-07T18:30:00.000Z');

		// Stage 1 — buildPackage: resolver returns the canonical PNG bytes for every
		// known URI. In the editor this is the binary store; in production it
		// could fetch project-relative URIs.
		const seen: string[] = [];
		const exportResult = await buildPackage({
			document,
			resolveBytesByUri: async (uri) => {
				seen.push(uri);
				return PNG_BYTES;
			},
			now
		});
		if (exportResult.status !== 'ok') {
			throw new Error(`export rejected: ${exportResult.reason} — ${exportResult.detail}`);
		}

		// The resolver was called once per texture uri.
		expect(seen).toEqual(FIXTURE_TEXTURES.map((t) => t.uri));

		// Manifest sanity: generator pinned, packageId is package-<12 hex.
		const map = unzipSync(exportResult.zip);
		const manifest = JSON.parse(new TextDecoder().decode(map['manifest.json']!)) as {
			package: { id: string; generator: string };
			textures: Array<{
				assetId: string;
				originalName: string;
				mime: string;
				size: number;
				fingerprint: string;
				destinationPath: string;
			}>;
		};
		expect(manifest.package.generator).toBe('editor-5.4');
		expect(manifest.package.id).toMatch(/^package-[0-9a-f]{12}$/);
		expect(manifest.textures.length).toBe(FIXTURE_TEXTURES.length);

		// Collision suffix applied: `walnut-wall.png` and `walnut-wall-2.png` both
		// sanitize to `walnut_wall.png`; the second gets `-2`.
		const destinationPaths = manifest.textures.map((e) => e.destinationPath).sort();
		expect(destinationPaths).toEqual([
			'textures/plaster_wall.png',
			'textures/walnut_wall-2.png',
			'textures/walnut_wall.png'
		]);

		// Fingerprint format: `sha256-<64 hex>`.
		for (const entry of manifest.textures) {
			expect(entry.fingerprint).toMatch(/^sha256-[0-9a-f]{64}$/);
			expect(entry.size).toBe(PNG_BYTES.byteLength);
			expect(entry.mime).toBe('image/png');
		}
		// Each manifest entry maps to a unique bytes payload inside the zip.
		const zipEntries = Object.keys(map);
		for (const entry of manifest.textures) {
			expect(zipEntries).toContain(entry.destinationPath);
			const bytes = map[entry.destinationPath]!;
			expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));
		}

		// Stage 2 — importPackage: round-trip the bytes back into a v6 document.
		const importResult = await importPackage(exportResult.zip);
		if (importResult.status !== 'ok') {
			throw new Error(`import rejected: ${importResult.reason} — ${importResult.detail}`);
		}

		// Every original id is still present.
		const importedIds = importResult.document.textures.map((t) => t.id).sort();
		const expectedIds = FIXTURE_TEXTURES.map((t) => t.id).sort();
		expect(importedIds).toEqual(expectedIds);

		// Every URI is rewritten under the manifest's package id.
		const importPrefix = REWRITE_URI_PREFIX(manifest.package.id);
		for (const t of importResult.document.textures) {
			expect(t.uri.startsWith(importPrefix)).toBe(true);
		}

		// Every URI in the importResult is in the manifest's destinationPath set.
		const uriToManifestEntry = new Map(
			manifest.textures.map((entry) => [
				`${importPrefix}${entry.destinationPath.replace(/^textures\//, '')}`,
				entry
			])
		);
		for (const t of importResult.document.textures) {
			const entry = uriToManifestEntry.get(t.uri);
			expect(entry).toBeDefined();
		}

		// Identity over (id, fingerprint, mime): sorted lists match.
		const exportSide = manifest.textures
			.map((e) => ({ id: e.assetId, fingerprint: e.fingerprint, mime: e.mime }))
			.sort((a, b) => a.id.localeCompare(b.id));
		const importSide = importResult.document.textures
			.map((t: SceneTextureAsset) => {
				const bin = importResult.binaries.get(t.uri)!;
				return {
					id: t.id,
					fingerprint: bin.fingerprint,
					mime: bin.mime
				};
			})
			.sort((a, b) => a.id.localeCompare(b.id));
		expect(importSide).toEqual(exportSide);

		// Binary byte identity per URI.
		for (const t of importResult.document.textures) {
			const bin = importResult.binaries.get(t.uri)!;
			expect(Array.from(bin.bytes)).toEqual(Array.from(PNG_BYTES));
		}

		// Filename returned for download.
		expect(exportResult.filename).toMatch(/^scene-20260807-1830\.scenepack\.zip$/
);
	});
});
