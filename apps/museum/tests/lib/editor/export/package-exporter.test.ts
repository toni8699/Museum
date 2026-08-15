import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import {
	buildPackage,
	buildPackageFilename,
	exportDocumentTitle
} from '$lib/editor/export/package-exporter';
import type { MuseumSceneDocument } from '$lib/content/scene';
import baseSceneFixture from '$lib/content/museum-scene.json';

// 1x1 transparent PNG (canonical byte sequence).
const PNG_BYTES = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x00,
	0x02, 0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82
]);

// Tiny JPEG (SOI/EOI skeleton — 0xFFD8 ... 0xFFD9) — sufficient for mime
// sniffing (the sniffer reads the first three bytes only) without carrying
// any decodable image data.
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]);

// Tiny WebP — RIFF/WEBP marker followed by VP8 chunk header.
const WEBP_BYTES = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50
]);

function makeScene(textures: MuseumSceneDocument['textures']): MuseumSceneDocument {
	const baseScene = baseSceneFixture as unknown as MuseumSceneDocument;
	return {
		...baseScene,
		textures,
		materials: []
	};
}

describe('package-exporter', () => {
	it('builds a self-contained package from a single texture', async () => {
		const doc = makeScene([{ id: 'walnut', name: 'Walnut Detail', uri: '/museum/textures/walnut.png' }]);
		const resolver = async (uri: string) =>
			uri === '/museum/textures/walnut.png' ? PNG_BYTES : null;

		const result = await buildPackage({
			document: doc,
			resolveBytesByUri: resolver,
			now: new Date('2026-08-07T18:30:00.000Z')
		});
		if (result.status !== 'ok') throw new Error(`expected ok, got ${result.reason}`);
		expect(result.zip.length).toBeGreaterThan(20);
		const map = unzipSync(result.zip);
		expect(map['manifest.json']).toBeDefined();
		expect(Object.keys(map).filter((n) => n.startsWith('textures/')).length).toBe(1);
		const manifest = JSON.parse(new TextDecoder().decode(map['manifest.json']!));
		expect(manifest.package.generator).toBe('museum-editor-5.4');
		expect(manifest.textures.length).toBe(1);
		expect(manifest.textures[0].fingerprint).toMatch(/^sha256-[0-9a-f]{64}$/);
	});

	it('rejects with unresolved-binary when the resolver returns null', async () => {
		const doc = makeScene([{ id: 'walnut', name: 'Walnut Detail', uri: '/museum/textures/walnut.png' }]);
		const result = await buildPackage({
			document: doc,
			resolveBytesByUri: async () => null,
			now: new Date('2026-08-07T18:30:00.000Z')
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.reason).toBe('unresolved-binary');
	});

	it('rewrites URIs deterministically: identical input → identical packageId', async () => {
		const doc = makeScene([{ id: 'walnut', name: 'Walnut Detail', uri: '/museum/textures/walnut.png' }]);
		const resolver = async () => PNG_BYTES;
		const r1 = await buildPackage({ document: doc, resolveBytesByUri: resolver, now: new Date('2026-08-07T18:30:00.000Z') });
		const r2 = await buildPackage({ document: doc, resolveBytesByUri: resolver, now: new Date('2026-08-07T18:30:00.000Z') });
		if (r1.status !== 'ok' || r2.status !== 'ok') throw new Error('expected ok');
		const m1 = JSON.parse(new TextDecoder().decode(unzipSync(r1.zip)['manifest.json']!));
		const m2 = JSON.parse(new TextDecoder().decode(unzipSync(r2.zip)['manifest.json']!));
		expect(m1.package.id).toBe(m2.package.id);
	});

	it('produces deterministic fingerprints across runs', async () => {
		const doc = makeScene([{ id: 'walnut', name: 'Walnut Detail', uri: '/museum/textures/walnut.png' }]);
		const resolver = async () => PNG_BYTES;
		const r1 = await buildPackage({ document: doc, resolveBytesByUri: resolver, now: new Date('2026-08-07T18:30:00.000Z') });
		const r2 = await buildPackage({ document: doc, resolveBytesByUri: resolver, now: new Date('2026-08-07T18:30:00.000Z') });
		if (r1.status !== 'ok' || r2.status !== 'ok') throw new Error('expected ok');
		const m1 = JSON.parse(new TextDecoder().decode(unzipSync(r1.zip)['manifest.json']!));
		const m2 = JSON.parse(new TextDecoder().decode(unzipSync(r2.zip)['manifest.json']!));
		expect(m1.textures[0].fingerprint).toBe(m2.textures[0].fingerprint);
	});

	it('sanitizes filenames and applies -N collision suffix when two textures share a stem', async () => {
		const doc = makeScene([
			{ id: 'a', name: 'Wall Detail', uri: '/museum/textures/Wall%20Detail.png' },
			{ id: 'b', name: 'Wall Detail 2', uri: '/museum/textures/Wall%20Detail%202.png' }
		]);
		const resolver = async () => PNG_BYTES;
		const result = await buildPackage({ document: doc, resolveBytesByUri: resolver, now: new Date('2026-08-07T18:30:00.000Z') });
		if (result.status !== 'ok') throw new Error(`expected ok, got ${result.reason}`);
		const map = unzipSync(result.zip);
		const names = Object.keys(map).filter((n) => n.startsWith('textures/')).sort();
		expect(names.length).toBe(2);
		expect(names[0]).not.toBe(names[1]);
	});

	it('rewrites the scene URI to the rewrite-prefix path', async () => {
		const doc = makeScene([{ id: 'walnut', name: 'Walnut Detail', uri: '/museum/textures/walnut.png' }]);
		const resolver = async () => PNG_BYTES;
		const result = await buildPackage({ document: doc, resolveBytesByUri: resolver, now: new Date('2026-08-07T18:30:00.000Z') });
		if (result.status !== 'ok') throw new Error('expected ok');
		const map = unzipSync(result.zip);
		const sceneJson = JSON.parse(new TextDecoder().decode(map['museum-scene.json']!)) as {
			textures: Array<{ id: string; uri: string }>;
		};
		expect(sceneJson.textures[0]!.uri).toMatch(/^\/textures\/package-[0-9a-f]{12}\/.+\.png$/);
	});

	it('buildPackageFilename includes a UTC stamp', () => {
		expect(buildPackageFilename('museum-scene', new Date('2026-08-07T18:30:00.000Z'))).toBe(
			'museum-scene-20260807-1830.museumpack.zip'
		);
	});

	it('exportDocumentTitle falls back to "museum-scene" when document has no title', () => {
		expect(exportDocumentTitle({} as MuseumSceneDocument)).toBe('museum-scene');
	});

	it('round-trips: an exported package is accepted by the importer with identical textures', async () => {
		const { importPackage } = await import('$lib/editor/import/package-importer');
		const doc = makeScene([{ id: 'walnut', name: 'Walnut Detail', uri: '/museum/textures/walnut.png' }]);
		const resolver = async () => PNG_BYTES;
		const result = await buildPackage({ document: doc, resolveBytesByUri: resolver, now: new Date('2026-08-07T18:30:00.000Z') });
		if (result.status !== 'ok') throw new Error('expected ok');
		const imported = await importPackage(result.zip);
		if (imported.status !== 'ok') throw new Error(`expected ok, got ${imported.reason}`);
		expect(imported.document.textures.length).toBe(1);
		expect(imported.document.textures[0]!.id).toBe('walnut');
		expect(imported.document.textures[0]!.uri).toMatch(/^\/textures\/package-[0-9a-f]{12}\/.+\.png$/);
		expect(imported.binaries.size).toBe(1);
		const binaryBytes = imported.binaries.values().next().value!.bytes;
		expect(Array.from(binaryBytes)).toEqual(Array.from(PNG_BYTES));
	});

	it('round-trips multi-texture packages with collision suffix + distinct rewrites', async () => {
		const { importPackage } = await import('$lib/editor/import/package-importer');
		const doc = makeScene([
			// Two distinct URIs that sanitize to the same stem → gets -2 suffix on export.
			{ id: 'a', name: 'Wall Detail', uri: '/museum/textures/Wall%20Detail.png' },
			{ id: 'b', name: 'Wall Detail 2', uri: '/museum/textures/Wall%20Detail%202.png' },
			{ id: 'c', name: 'Floor Detail', uri: '/museum/textures/Floor%20Detail.png' }
		]);
		const resolver = async () => PNG_BYTES;
		const result = await buildPackage({ document: doc, resolveBytesByUri: resolver, now: new Date('2026-08-07T18:30:00.000Z') });
		if (result.status !== 'ok') throw new Error(`expected ok, got ${result.reason}`);
		const imported = await importPackage(result.zip);
		if (imported.status !== 'ok') throw new Error(`expected ok, got ${imported.reason}`);
		expect(imported.document.textures.length).toBe(3);
		expect(imported.binaries.size).toBe(3);
		const ids = imported.document.textures.map((t) => t.id);
		expect(ids).toEqual(['a', 'b', 'c']);
		const uris = imported.document.textures.map((t) => t.uri);
		expect(new Set(uris).size).toBe(3); // all distinct
		// Bytes identity preserved per binary.
		for (const bin of imported.binaries.values()) {
			expect(Array.from(bin.bytes)).toEqual(Array.from(PNG_BYTES));
		}
	});

	it('writes archive filenames using the SNIFFED MIME extension, not the URI extension', async () => {
		// User uploads a file whose declared URI is `.png` but actual bytes
		// are JPEG / WebP. The archive must end with `.jpg` / `.webp` so
		// downstream loaders (THREE, browsers, OS file picker) don't trip
		// on extension/content mismatch.
		for (const [bytes, sniffedExt] of [
			[JPEG_BYTES, '.jpg'] as const,
			[WEBP_BYTES, '.webp'] as const,
			[PNG_BYTES, '.png'] as const
		]) {
			const doc = makeScene([
				{ id: 'mismatch', name: 'walnut', uri: '/museum/textures/walnut.png' }
			]);
			const result = await buildPackage({
				document: doc,
				resolveBytesByUri: async () => bytes
			});
			expect(result.status, `for ${sniffedExt}`).toBe('ok');
			if (result.status !== 'ok') {
				throw new Error(`export failed for ${sniffedExt}: ${result.detail ?? result.reason}`);
			}
			const unzipped = unzipSync(result.zip);
			const sceneJson = unzipped['museum-scene.json'];
			expect(sceneJson).toBeDefined();
			const scene = JSON.parse(new TextDecoder().decode(sceneJson!));
			const rewrittenUri: string = scene.textures[0]!.uri;
			expect(rewrittenUri, `rewrittenUri for ${sniffedExt}`).toMatch(
				new RegExp(`\\${sniffedExt}$`)
			);
			// The on-disk archive filename under `textures/` MUST match the
			// sniffed extension too; decompressed bytes compared by content.
			const textureKeys = Object.keys(unzipped).filter((k) =>
				k.startsWith('textures/')
			);
			expect(textureKeys.length, `one texture key for ${sniffedExt}`).toBe(1);
			const matchingKey = textureKeys[0];
			const archiveBytes = unzipped[matchingKey!]!;
			expect(Array.from(archiveBytes), `archive bytes for ${sniffedExt}`).toEqual(
				Array.from(bytes)
			);
			expect(matchingKey, `archive key for ${sniffedExt}`).toBeDefined();
			expect(matchingKey, `archive key extends with ${sniffedExt}`).toMatch(
				new RegExp(`\\${sniffedExt}$`)
			);
		}
	});
});
