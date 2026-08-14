/**
 * `museum-editor-package-archive.test.ts` — Phase 5.4 facade round-trip.
 *
 * RED coverage:
 *  - `registerLocalFileTexture` returns a texture id, appends one
 *    SceneTextureAsset, and bumps history once.
 *  - Empty bytes / unsupported MIME → null + status message; no
 *    document mutation, no BinaryTextureStore leak.
 *  - `exportPackage` returns `{ status: 'ok', zip, manifest, filename }`
 *    with a deterministic filename stamped at the supplied `now`.
 *  - `exportPackage` returns `{ status: 'rejected', reason: 'unresolved-binary' }`
 *    when the binary store has no bytes for a registered rewrite URI.
 *  - `importPackageArchive` accepts a `buildPackage` result and pre-registers
 *    every binary into the store. Post-import document is byte-identical
 *    to the export-side document (canonical JSON equal).
 *  - Visitor catalogue URIs under `/textures/<catalogue-id>/...` don't
 *    trigger any export blocker.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import { createMuseumEditorStore, MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	BinaryTextureStore,
	__resetBinaryTextureStoreForTests
} from '$lib/editor/store/binary-texture-store.svelte';
import { __resetDefaultSourceLoaderForTests } from '$lib/museum/materials/texture-cache';

const PNG_BYTES = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x00,
	0x02, 0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82
]);

function freshStore(): MuseumEditorStore {
	const document = cloneFixtureDocument();
	return createMuseumEditorStore({ document });
}

describe('museum-editor Phase 5.4 package-archive facade', () => {
	beforeEach(() => {
		__resetBinaryTextureStoreForTests();
		__resetDefaultSourceLoaderForTests();
	});

	afterEach(() => {
		__resetBinaryTextureStoreForTests();
		__resetDefaultSourceLoaderForTests();
	});

	describe('registerLocalFileTexture', () => {
		it('appends exactly one texture + one history entry on a valid PNG', async () => {
			const store = freshStore();
			const beforeCount = store.document.textures.length;
			const historyBefore = store.historyVersion;

			const textureId = await store.registerLocalFileTexture('Warm Stone', PNG_BYTES, 'image/png');
			expect(textureId).not.toBeNull();
			expect(store.document.textures.length).toBe(beforeCount + 1);

			const added = store.document.textures.find((t) => t.id === textureId);
			expect(added).toBeDefined();
			expect(added!.name).toBe('Warm Stone');
			expect(added!.uri).toMatch(/^\/local\/[a-f0-9]+\/warm[-_]stone\.png$/);

			// Binary store retains the bytes keyed by the URI.
			expect(BinaryTextureStore.has(added!.uri)).toBe(true);
			expect(Array.from(await BinaryTextureStore.resolve(added!.uri))).toEqual(
				Array.from(PNG_BYTES)
			);

			// Single history entry — undo removes the newly added texture.
			expect(store.historyVersion).toBe(historyBefore + 1);
			expect(store.undo()).toBe(true);
			expect(store.document.textures.find((t) => t.id === textureId)).toBeUndefined();
		});

		it('rejects unsupported MIME without mutating the document or store', async () => {
			const store = freshStore();
			const beforeCount = store.document.textures.length;
			const textureId = await store.registerLocalFileTexture('Text', PNG_BYTES, 'image/bmp');
			expect(textureId).toBeNull();
			expect(store.document.textures.length).toBe(beforeCount);
			expect(store.historyVersion).toBe(0);
			expect(BinaryTextureStore.peekAllUris().length).toBe(0);
		});

		it('rejects empty bytes', async () => {
			const store = freshStore();
			const beforeCount = store.document.textures.length;
			const textureId = await store.registerLocalFileTexture(
				'Empty',
				new Uint8Array(0),
				'image/png'
			);
			expect(textureId).toBeNull();
			expect(store.document.textures.length).toBe(beforeCount);
		});

		it('rejects blank name', async () => {
			const store = freshStore();
			const beforeCount = store.document.textures.length;
			const textureId = await store.registerLocalFileTexture('   ', PNG_BYTES, 'image/png');
			expect(textureId).toBeNull();
			expect(store.document.textures.length).toBe(beforeCount);
		});

		it('each register call mints a unique URI even for byte-identical input', async () => {
			const store = freshStore();
			const a = await store.registerLocalFileTexture('Stone', PNG_BYTES, 'image/png');
			const b = await store.registerLocalFileTexture('Stone', PNG_BYTES, 'image/png');
			expect(a).not.toBeNull();
			expect(b).not.toBeNull();
			expect(a).not.toBe(b);
			const uriA = store.document.textures.find((t) => t.id === a)!.uri;
			const uriB = store.document.textures.find((t) => t.id === b)!.uri;
			expect(uriA).not.toBe(uriB);
		});
	});

	describe('exportPackage', () => {
		it('returns ok with a Uint8Array + filename stamp matching "now"', async () => {
			const store = freshStore();
			await store.registerLocalFileTexture('Walnut Wall', PNG_BYTES, 'image/png');
			const result = await store.exportPackage({
				now: new Date('2026-08-07T18:30:00.000Z')
			});
			if (result.status !== 'ok') throw new Error(`expected ok, got ${result.reason}: ${result.detail}`);
			expect(result.zip).toBeInstanceOf(Uint8Array);
			expect(result.zip.byteLength).toBeGreaterThan(40);
			expect(result.filename).toMatch(/^museum-scene-20260807-1830\.museumpack\.zip$/);

			const map = unzipSync(result.zip);
			expect(map['manifest.json']).toBeDefined();
			expect(map['museum-scene.json']).toBeDefined();
			expect(Object.keys(map).filter((n) => n.startsWith('textures/')).length).toBe(1);
		});

		it('rejects with "unresolved-binary" when a registered texture has no bytes', async () => {
			const store = freshStore();
			await store.registerLocalFileTexture('Walnut', PNG_BYTES, 'image/png');
			// Drop the bytes — simulate the case where a texture asset's URI was
			// preserved but the binary was revoked (e.g. test failure path).
			BinaryTextureStore.__resetForTests();
			const result = await store.exportPackage({ now: new Date('2026-08-07T18:30:00.000Z') });
			expect(result.status).toBe('rejected');
			if (result.status === 'rejected') {
				expect(result.reason).toBe('unresolved-binary');
			}
		});

		it('does not block visitor catalogue URIs', () => {
			// Document with a public catalogue texture (no binary entry needed).
			const store = freshStore();
			const documentText = store.document as { textures: { id: string; uri: string }[] };
			documentText.textures.push({
				id: 'public-catalogue',
				uri: '/textures/wood-walnut/map.png'
			});
			expect(store.projectExportBlocker).toBeNull();
		});
	});

	describe('round-trip: exportPackage → importPackageArchive', () => {
		it('restores byte-identical museum-scene.json + primes BinaryTextureStore', async () => {
			const store = freshStore();
			await store.registerLocalFileTexture('Walnut', PNG_BYTES, 'image/png');

			const exportResult = await store.exportPackage({
				now: new Date('2026-08-07T18:30:00.000Z')
			});
			if (exportResult.status !== 'ok') throw new Error('export failed');

			// Read the canonical JSON the package actually carries — this is
			// what round-trip equality is grounded against, not the original
			// pre-rewrite document (its URIs are `/local/...`, the package
			// carries the rewrite).
			const zipMap = unzipSync(exportResult.zip);
			const carriedCanonical = new TextDecoder().decode(zipMap['museum-scene.json']!);

			// Push the import — start from a fresh store so any side-effects
			// (binary-store-priming, document swap) are observable.
			const receivingStore = freshStore();
			const importResult = await receivingStore.importPackageArchive(exportResult.zip);
			if (importResult.status !== 'ok') {
				throw new Error(`import failed: ${importResult.reason}: ${importResult.detail}`);
			}

			// Post-import document serializes to the same bytes as the zip's
			// `museum-scene.json`. This is the round-trip invariant.
			const postImportCanonical = serializeSceneDocument(receivingStore.document);
			expect(postImportCanonical).toBe(carriedCanonical);

			// URIs are the rewritten form (= URI under /textures/package-<id>/...).
			const importedTexture = receivingStore.document.textures.find(
				(t) => t.name === 'Walnut'
			);
			expect(importedTexture).toBeDefined();
			expect(BinaryTextureStore.has(importedTexture!.uri)).toBe(true);
			expect(Array.from(BinaryTextureStore.getEntry(importedTexture!.uri)!.bytes)).toEqual(
				Array.from(PNG_BYTES)
			);

			// The package id is in the rewritten URIs.
			expect(importedTexture!.uri).toMatch(/^\/textures\/package-[0-9a-f]{12}\/.+/);
		});

		it('rejects when importer rejects (e.g. garbage bytes)', async () => {
			const store = freshStore();
			const result = await store.importPackageArchive(new Uint8Array([1, 2, 3]));
			expect(result.status).toBe('rejected');
			if (result.status === 'rejected') {
				expect(result.reason).toMatch(/format-unsupported|missing-bytes|schema-mismatch/);
			}
		});
	});
});
